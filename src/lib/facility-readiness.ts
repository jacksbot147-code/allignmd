// AlignMD — facility-facing candidate readiness signal.
//
// The facility-side mirror of src/lib/readiness.ts, but deliberately narrowed
// to a single rolled-up verdict per clinician. The staff `/readiness` board
// (2026-05-23) and the clinician `/clinician/readiness` mirror (2026-05-24)
// both expose packet completion %, specific gap counts and named credentials
// that are expiring. A facility contact must NOT see any of that — only
// whether the candidate the desk has submitted to them is actually placeable.
//
// The market research for this run (2026-05-28) called this out as a current
// VMS gap: agencies submit candidates before all credentials are verified,
// and someone still has to chase the documents manually. Showing a "Ready to
// start / In progress / Pending" signal next to each submitted clinician on
// the facility's Candidates page is exactly the transparency layer 2026
// commentary names as table-stakes ("candidate readiness scoring to show
// which candidates are deployment-ready versus still in process").
//
// Pure — no I/O. The /facility/candidates page does the Supabase reads (via
// the admin client, scoped to providers who already have a submission to this
// facility's jobs — see that page's comments for the security model) and
// passes the rows in. computeReadiness is reused verbatim so the facility's
// view of a packet can never drift from the staff/clinician views.
//
// Scope: this module only ever returns a tier, a label, a tone and a one-line
// facility-friendly summary. It deliberately does NOT expose packetPercent,
// open gaps, expired-credential counts, blocked flags, or anything else from
// the underlying ReadinessResult — those are staff/clinician-internal.

import {
  computeReadiness,
  type ReadinessTier,
  type ReadinessInput,
} from "./readiness";

/**
 * The narrowed signal a facility contact may see for one of their submitted
 * candidates. No packet %, no specific gaps, no credential names.
 */
export interface FacilityReadinessSignal {
  tier: ReadinessTier;
  label: string;
  tone: string;
  /** One-line plain-English status, facility-framed (no internal jargon). */
  summary: string;
}

// Facility-facing copy. Deliberately diverges from READINESS_META (which uses
// recruiter-internal wording like "Ready to place") — a facility contact
// thinks in terms of "can this clinician start the assignment?", not in terms
// of the agency's internal placement workflow.
const FACILITY_TIER_META: Record<
  ReadinessTier,
  { label: string; tone: string; summary: string }
> = {
  ready: {
    label: "Ready to start",
    tone: "ok",
    summary: "Credentialing complete — clinician is cleared to start.",
  },
  nearly: {
    label: "Final checks",
    tone: "teal",
    summary: "Final credentialing checks underway — close to clearance.",
  },
  in_progress: {
    label: "In credentialing",
    tone: "warn",
    summary: "Credentialing in progress with the AlignMD team.",
  },
  not_started: {
    label: "Onboarding pending",
    tone: "muted",
    summary: "Onboarding paperwork has not yet been collected.",
  },
};

/**
 * Roll one clinician's credentialing packet + credential expiry into the
 * facility-side signal. Reuses computeReadiness verbatim, then *narrows* the
 * result down to the four fields a facility may see.
 *
 * IMPORTANT — what is intentionally dropped on the way through this function:
 *   • packetPercent           (internal-only completion ratio)
 *   • packetComplete/Countable (item counts — would leak the size of the gap)
 *   • majorGaps / openGaps    (specific gap inventory)
 *   • expiredCredentials      (named-credential signal)
 *   • expiringCredentials     (named-credential signal)
 *   • blocked                 (internal staff disposition flag)
 *   • the raw `summary` field (mentions credentials & gap counts in numbers)
 *
 * If you ever extend this signal, keep the same discipline — anything that
 * tells a facility *which* item is missing, or *how many*, is out of scope.
 *
 * Note on the "in progress" merger: blocked candidates (major packet gap or
 * expired credential) collapse into the same "In credentialing" verdict as
 * regular in-progress ones. From a facility's seat there is no functional
 * difference yet ("not cleared, my recruiter is working it") and merging the
 * two stops the page from leaking the difference between "early in the
 * workflow" and "stuck on a real problem" — which IS internal information.
 */
export function facilityReadinessFor(
  input: ReadinessInput,
): FacilityReadinessSignal {
  const verdict = computeReadiness(input);
  const meta = FACILITY_TIER_META[verdict.tier];
  return {
    tier: verdict.tier,
    label: meta.label,
    tone: meta.tone,
    summary: meta.summary,
  };
}

/** The verdict to show when no packet/credential data is available at all. */
export function facilityReadinessUnknown(): FacilityReadinessSignal {
  const meta = FACILITY_TIER_META.not_started;
  return {
    tier: "not_started",
    label: meta.label,
    tone: meta.tone,
    summary: meta.summary,
  };
}

/** Stable display order (most-ready first), for any future KPI grouping. */
export const FACILITY_READINESS_ORDER: ReadinessTier[] = [
  "ready",
  "nearly",
  "in_progress",
  "not_started",
];

/** Facility-friendly KPI label for a tier (no internal terminology). */
export function facilityReadinessLabel(tier: ReadinessTier): string {
  return FACILITY_TIER_META[tier].label;
}
