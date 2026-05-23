// AlignMD — the rule-based clinician ⇄ job match score.
//
// Design decisions (confirmed with the client):
//  • Matching is ADVISORY. Nothing is hard-excluded — every clinician is
//    scored and shown, because "it depends on the coverage need." Serious
//    gaps (no license, missing required certs) cap the tier and raise a
//    major flag so a recruiter sees them at a glance.
//  • Compact / multistate licenses count for every member state of the
//    relevant compact (NLC for nurses, IMLC for physicians, PT Compact).
//  • The score is a weighted sum across five components, normalised to 100.

export type MatchTier = "strong" | "fair" | "stretch" | "ineligible";

export type MatchReasonKind =
  | "license"
  | "specialty"
  | "certs"
  | "experience"
  | "location";

export interface MatchReason {
  kind: MatchReasonKind;
  ok: boolean; // true = supports the match, false = a gap
  severity: "info" | "minor" | "major";
  text: string;
}

export interface MatchResult {
  score: number; // 0–100, rounded
  tier: MatchTier;
  reasons: MatchReason[];
}

// ── Component weights (sum = 100) ─────────────────────────────────────────
const W_LICENSE = 35;
const W_SPECIALTY = 20;
const W_CERTS = 20;
const W_EXPERIENCE = 15;
const W_LOCATION = 10;

// ── Compact / multistate license member states ────────────────────────────
// Advisory lists — review against the NCSBN / IMLCC rosters annually.
const NURSE_COMPACT = new Set([
  "AL", "AZ", "AR", "CO", "DE", "FL", "GA", "GU", "ID", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MS", "MO", "MT", "NE", "NH", "NJ", "NM", "NC",
  "ND", "OH", "OK", "PA", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
]);
const PHYSICIAN_COMPACT = new Set([
  "AL", "AZ", "CO", "DC", "GA", "GU", "IL", "IA", "ID", "KS", "KY", "ME",
  "MD", "MI", "MN", "MS", "MT", "NE", "NV", "NH", "NJ", "NM", "ND", "OH",
  "OK", "PA", "SC", "SD", "TN", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);
const PT_COMPACT = new Set([
  "AZ", "AR", "CO", "DE", "FL", "GA", "IA", "KS", "KY", "LA", "ME", "MD",
  "MS", "MO", "MT", "NE", "NH", "NJ", "NC", "ND", "OH", "OK", "OR", "PA",
  "SC", "SD", "TN", "TX", "UT", "VA", "WA", "WV", "WI", "WY",
]);

/** Which licensure compact, if any, a clinician role participates in. */
function compactFor(role: string | null | undefined): Set<string> | null {
  switch ((role || "").toUpperCase()) {
    case "NP":
    case "CRNA":
      return NURSE_COMPACT;
    case "MD":
    case "DO":
      return PHYSICIAN_COMPACT;
    case "PT":
      return PT_COMPACT;
    default:
      return null; // PA / OT / SLP — no widely-adopted compact in the MVP
  }
}

// ── Inputs ────────────────────────────────────────────────────────────────
export interface MatchCredential {
  type: string; // credential_type
  state?: string | null;
  is_compact?: boolean | null;
  expires_on?: string | null;
}

export interface MatchInput {
  provider: {
    clinician_role?: string | null;
    specialty?: string | null;
    years_experience?: number | null;
    telehealth_ok?: boolean | null;
  };
  credentials: MatchCredential[];
  jobSpecialty?: string | null;
  jobStates: string[]; // states the job needs a license in
  jobIsTelehealth?: boolean;
  requiredCerts?: string[]; // credential_type values
  minYears?: number | null;
}

/** A credential is active if it has no expiry, or expires today or later. */
function isActive(expires_on: string | null | undefined, today: string): boolean {
  if (!expires_on) return true;
  return expires_on >= today;
}

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

/** Score one clinician against one job. Pure — safe to call in a loop. */
export function scoreMatch(input: MatchInput): MatchResult {
  const today = new Date().toISOString().slice(0, 10);
  const reasons: MatchReason[] = [];
  let major = { license: false, certs: false };

  // ── License coverage ────────────────────────────────────────────────
  const activeLicenses = input.credentials.filter(
    (c) => c.type === "state_license" && isActive(c.expires_on, today),
  );
  const covered = new Set<string>();
  for (const c of activeLicenses) {
    if (c.state) covered.add(c.state.toUpperCase());
  }
  const compactSet = compactFor(input.provider.clinician_role);
  const hasCompact = activeLicenses.some(
    (c) =>
      c.is_compact &&
      compactSet &&
      c.state &&
      compactSet.has(c.state.toUpperCase()),
  );
  if (hasCompact && compactSet) {
    compactSet.forEach((st) => covered.add(st));
  }

  const needed = input.jobStates.map((s) => s.toUpperCase()).filter(Boolean);
  let licenseScore = W_LICENSE;
  if (needed.length) {
    const hit = needed.filter((s) => covered.has(s));
    const ratio = hit.length / needed.length;
    licenseScore = Math.round(W_LICENSE * ratio);
    if (ratio === 1) {
      reasons.push({
        kind: "license",
        ok: true,
        severity: "info",
        text: hasCompact
          ? `Licensed for ${needed.join(", ")} (compact / multistate).`
          : `Active license in ${needed.join(", ")}.`,
      });
    } else if (ratio > 0) {
      const missing = needed.filter((s) => !covered.has(s));
      reasons.push({
        kind: "license",
        ok: false,
        severity: "minor",
        text: `No active license in ${missing.join(", ")}.`,
      });
    } else {
      major.license = true;
      reasons.push({
        kind: "license",
        ok: false,
        severity: "major",
        text: `No active license covering ${needed.join(", ")} — would need licensure.`,
      });
    }
  }

  // ── Specialty ───────────────────────────────────────────────────────
  let specialtyScore = W_SPECIALTY;
  const ps = norm(input.provider.specialty);
  const js = norm(input.jobSpecialty);
  if (js && ps) {
    if (ps === js) {
      specialtyScore = W_SPECIALTY;
      reasons.push({
        kind: "specialty",
        ok: true,
        severity: "info",
        text: `Specialty matches (${input.provider.specialty}).`,
      });
    } else {
      specialtyScore = Math.round(W_SPECIALTY * 0.3);
      reasons.push({
        kind: "specialty",
        ok: false,
        severity: "minor",
        text: `Specialty is ${input.provider.specialty}, job wants ${input.jobSpecialty}.`,
      });
    }
  } else {
    specialtyScore = Math.round(W_SPECIALTY * 0.6);
  }

  // ── Required certifications ──────────────────────────────────────────
  let certScore = W_CERTS;
  const required = (input.requiredCerts || []).filter(Boolean);
  if (required.length) {
    const held = new Set(
      input.credentials
        .filter((c) => isActive(c.expires_on, today))
        .map((c) => c.type),
    );
    const have = required.filter((c) => held.has(c));
    const missing = required.filter((c) => !held.has(c));
    certScore = Math.round(W_CERTS * (have.length / required.length));
    if (missing.length === 0) {
      reasons.push({
        kind: "certs",
        ok: true,
        severity: "info",
        text: `Holds all required certifications.`,
      });
    } else {
      const sev = missing.length === required.length ? "major" : "minor";
      if (sev === "major") major.certs = true;
      reasons.push({
        kind: "certs",
        ok: false,
        severity: sev,
        text: `Missing required certification${
          missing.length === 1 ? "" : "s"
        }: ${missing.map((m) => m.toUpperCase()).join(", ")}.`,
      });
    }
  }

  // ── Experience ──────────────────────────────────────────────────────
  let expScore = W_EXPERIENCE;
  const minY = input.minYears;
  const provY = input.provider.years_experience;
  if (minY != null && minY > 0) {
    const y = provY ?? 0;
    if (y >= minY) {
      reasons.push({
        kind: "experience",
        ok: true,
        severity: "info",
        text: `${y} yrs experience — meets the ${minY}-yr minimum.`,
      });
    } else {
      const gap = minY - y;
      expScore = Math.round(W_EXPERIENCE * Math.max(0, y / minY));
      reasons.push({
        kind: "experience",
        ok: false,
        severity: gap >= 3 ? "major" : "minor",
        text: `${y} yrs experience — ${gap} short of the ${minY}-yr minimum.`,
      });
    }
  }

  // ── Location / telehealth ───────────────────────────────────────────
  let locationScore = W_LOCATION;
  if (needed.length) {
    const localToAState = needed.some((s) => covered.has(s));
    if (localToAState) {
      locationScore = W_LOCATION;
    } else if (input.jobIsTelehealth && input.provider.telehealth_ok) {
      locationScore = W_LOCATION;
      reasons.push({
        kind: "location",
        ok: true,
        severity: "info",
        text: `Open to telehealth — location is not a barrier.`,
      });
    } else {
      locationScore = Math.round(W_LOCATION * 0.5);
      reasons.push({
        kind: "location",
        ok: false,
        severity: "minor",
        text: `Confirm travel or relocation for ${needed.join(", ")}.`,
      });
    }
  }

  // ── Total + tier ────────────────────────────────────────────────────
  const score = Math.max(
    0,
    Math.min(
      100,
      licenseScore + specialtyScore + certScore + expScore + locationScore,
    ),
  );

  let tier: MatchTier;
  if (score >= 80) tier = "strong";
  else if (score >= 60) tier = "fair";
  else if (score >= 40) tier = "stretch";
  else tier = "ineligible";

  // Serious gaps cap the tier no matter how the rest scored.
  const order: MatchTier[] = ["ineligible", "stretch", "fair", "strong"];
  const cap = (max: MatchTier) => {
    if (order.indexOf(tier) > order.indexOf(max)) tier = max;
  };
  if (major.license) cap("stretch");
  if (major.certs) cap("fair");

  return { score, tier, reasons };
}

export const TIER_META: Record<
  MatchTier,
  { label: string; tone: string }
> = {
  strong: { label: "Strong match", tone: "ok" },
  fair: { label: "Fair match", tone: "teal" },
  stretch: { label: "Stretch", tone: "warn" },
  ineligible: { label: "Long shot", tone: "danger" },
};
