// AlignMD — state-license application assistant helpers (Phase 5).
//
// The assistant helps a clinician get licensed in a new US state. It is a
// helper, not magic: every state board is different and each receives its own
// submission. This module owns three things —
//   1. the per-role checklist of what a state application typically needs;
//   2. the wizard survey: its blank/parsed shape and a typed view of the
//      license_applications.document_bundle jsonb column;
//   3. pre-fill — assembling a survey from the provider's structured profile,
//      plus a clean seam for pulling data out of uploaded documents.

import type {
  Provider,
  ProviderRole,
  ProviderCredential,
  ProviderDocument,
  ApplicationPayload,
  LicenseSurvey,
  LicenseBundle,
  LicenseChecklistState,
} from "./types";

// ── Checklist — what a state license application typically needs ──────────
export interface LicenseChecklistItemDef {
  key: string;
  label: string;
  detail: string;
}

/** Clinician roles with prescriptive authority — these need a DEA / CSR. */
const PRESCRIBER_ROLES: ProviderRole[] = ["NP", "PA", "MD", "DO", "CRNA"];
/** Roles that practice under a collaborating / supervising physician. */
const COLLABORATIVE_ROLES: ProviderRole[] = ["NP", "PA"];

const isPrescriber = (r: ProviderRole | null): boolean =>
  !!r && PRESCRIBER_ROLES.includes(r);
const isCollaborative = (r: ProviderRole | null): boolean =>
  !!r && COLLABORATIVE_ROLES.includes(r);

/** Role-specific wording for the national / board certification item. */
function boardCertDetail(role: ProviderRole | null): string {
  switch (role) {
    case "MD":
    case "DO":
      return "ABMS or AOA board certification in the clinician's specialty, where the board requires it.";
    case "NP":
      return "National NP certification (ANCC or AANP) appropriate to the population focus.";
    case "PA":
      return "Current NCCPA certification (PANCE), kept active with CME logging.";
    case "CRNA":
      return "NBCRNA certification, maintained under the CPC program.";
    case "PT":
      return "Passing NPTE result and any state jurisprudence exam.";
    case "OT":
      return "NBCOT certification and any state jurisprudence exam.";
    case "SLP":
      return "ASHA Certificate of Clinical Competence (CCC-SLP) and Praxis result.";
    default:
      return "The national certification or licensing exam result for the clinician's discipline.";
  }
}

/**
 * The checklist of items a state license application typically needs, varied
 * sensibly by clinician role. Prescribers get a DEA / CSR item; NP and PA get
 * a collaborative-agreement item; the board-certification wording adapts.
 */
export function licenseChecklistForRole(
  role: ProviderRole | null,
): LicenseChecklistItemDef[] {
  const items: LicenseChecklistItemDef[] = [
    {
      key: "primary_source_license",
      label: "Primary-source license verification",
      detail:
        "The clinician's current home-state license, verified directly with the issuing board (PSV). A verified state-license credential should exist on the provider record.",
    },
    {
      key: "npi",
      label: "National Provider Identifier (NPI)",
      detail: "An active 10-digit NPI is required on most state applications.",
    },
    {
      key: "board_certification",
      label: "Board / national certification",
      detail: boardCertDetail(role),
    },
    {
      key: "education_verification",
      label: "Education & training verification",
      detail:
        "Official transcripts from the degree-granting program, plus residency, fellowship or clinical-program completion letters where applicable.",
    },
  ];

  if (isPrescriber(role)) {
    items.push({
      key: "dea_registration",
      label: "DEA registration & state CSR",
      detail:
        "A DEA registration tied to a practice address in the target state, plus a controlled-substance registration (CSR / CDS) where the state requires its own.",
    });
  }

  if (isCollaborative(role)) {
    items.push({
      key: "collaborative_agreement",
      label: "Collaborative / supervisory agreement",
      detail:
        "Where the state requires it, a signed collaborating- or supervising-physician agreement filed with the application.",
    });
  }

  items.push(
    {
      key: "background_check",
      label: "Background check & fingerprinting",
      detail:
        "Most boards require a fingerprint-based criminal background check. Run it through an FCRA-compliant vendor with documented consent.",
    },
    {
      key: "malpractice_history",
      label: "Malpractice & claims history",
      detail:
        "An NPDB self-query and disclosure of any malpractice claims, settlements or judgments.",
    },
    {
      key: "work_history",
      label: "Work history & gap explanation",
      detail:
        "A continuous chronology of employment, with a written explanation for any gaps.",
    },
    {
      key: "government_id",
      label: "Government photo ID & photo",
      detail:
        "A current passport or driver's license, plus a passport-style photograph where the board requires one.",
    },
    {
      key: "application_fee",
      label: "Application fee",
      detail:
        "The board application fee, paid at submission. Fees vary by state and license type.",
    },
  );

  return items;
}

// ── Wizard steps ─────────────────────────────────────────────────────────
export interface LicenseWizardStepDef {
  key: string;
  title: string;
  hint: string;
}

export const LICENSE_WIZARD_STEPS: LicenseWizardStepDef[] = [
  {
    key: "identity",
    title: "Applicant identity",
    hint: "Legal name, identifiers and contact details",
  },
  {
    key: "education",
    title: "Education & training",
    hint: "Professional schooling and post-graduate training",
  },
  {
    key: "licensure",
    title: "Licensure & certification",
    hint: "Licenses held, certification and DEA",
  },
  {
    key: "practice",
    title: "Practice history",
    hint: "Recent employment and any practice gaps",
  },
  {
    key: "disclosures",
    title: "Disclosures & attestations",
    hint: "Malpractice, board and criminal history",
  },
];

// ── Survey / bundle shapes ───────────────────────────────────────────────
/** Every key of LicenseSurvey — the single source of truth for form parsing. */
export const LICENSE_SURVEY_KEYS: (keyof LicenseSurvey)[] = [
  "legal_full_name",
  "former_names",
  "date_of_birth",
  "npi",
  "home_address",
  "phone",
  "email",
  "professional_school",
  "degree",
  "graduation_year",
  "postgraduate_training",
  "licenses_held",
  "board_certification",
  "dea_number",
  "target_license_type",
  "current_employer",
  "practice_summary",
  "practice_gaps",
  "malpractice_history",
  "malpractice_explanation",
  "board_action_history",
  "board_action_explanation",
  "criminal_history",
  "criminal_explanation",
];

/** Coerce any jsonb value to a trimmed-safe string. */
function s(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/** A blank survey — every field present, nothing filled in. */
export function emptyLicenseSurvey(): LicenseSurvey {
  const out = {} as LicenseSurvey;
  for (const k of LICENSE_SURVEY_KEYS) out[k] = "";
  return out;
}

/** Merge a stored jsonb value into a complete, typed survey. */
export function parseLicenseSurvey(raw: unknown): LicenseSurvey {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = emptyLicenseSurvey();
  for (const k of LICENSE_SURVEY_KEYS) out[k] = s(r[k]);
  return out;
}

function parseChecklistState(raw: unknown): LicenseChecklistState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return { complete: r.complete === true, note: s(r.note) };
}

function parseChecklist(raw: unknown): Record<string, LicenseChecklistState> {
  const out: Record<string, LicenseChecklistState> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = parseChecklistState(v);
    }
  }
  return out;
}

/** A blank bundle. */
export function emptyLicenseBundle(): LicenseBundle {
  return { survey: emptyLicenseSurvey(), checklist: {}, document_sources: [] };
}

/**
 * Parse license_applications.document_bundle (jsonb) into a typed bundle. The
 * column defaults to '[]' in the 0001 schema, so a bare array is tolerated and
 * treated as an empty bundle.
 */
export function parseLicenseBundle(raw: unknown): LicenseBundle {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    survey: parseLicenseSurvey(obj.survey),
    checklist: parseChecklist(obj.checklist),
    document_sources: Array.isArray(obj.document_sources)
      ? (obj.document_sources as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
  };
}

/** True when at least one survey field has been filled in. */
export function surveyHasContent(survey: LicenseSurvey): boolean {
  return LICENSE_SURVEY_KEYS.some((k) => survey[k].trim() !== "");
}

// ── Progress ─────────────────────────────────────────────────────────────
/** Checklist completion for an application, given the clinician's role. */
export function licenseProgress(
  bundle: LicenseBundle,
  role: ProviderRole | null,
): { complete: number; total: number; percent: number } {
  const items = licenseChecklistForRole(role);
  const total = items.length;
  const complete = items.filter(
    (it) => bundle.checklist[it.key]?.complete,
  ).length;
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);
  return { complete, total, percent };
}

// ── Pre-fill from the provider's structured profile ──────────────────────
/** Distinct, sorted state codes from the clinician's state-license credentials. */
function licenseStatesFromCredentials(creds: ProviderCredential[]): string[] {
  const set = new Set<string>();
  for (const c of creds) {
    if (c.type === "state_license" && c.state) set.add(c.state.toUpperCase());
  }
  return Array.from(set).sort();
}

function firstWithContent(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Assemble a wizard survey from the provider's structured data — the provider
 * record, their credentials, and their intake-application payload. This is the
 * pre-fill that removes the licensing busywork: the wizard opens populated and
 * staff review rather than retype.
 *
 * NOTE: this reads STRUCTURED data only. Pulling fields out of uploaded
 * documents (scanned licenses, DEA certificates, diplomas) is a separate seam
 * — see DocumentExtractor below — and is intentionally not wired in yet.
 */
export function prefillSurveyFromProvider(
  provider: Provider,
  credentials: ProviderCredential[],
  application: ApplicationPayload | null,
): LicenseSurvey {
  const survey = emptyLicenseSurvey();

  // 1. Identity
  survey.legal_full_name = provider.full_name ?? "";
  survey.npi = firstWithContent(provider.npi, application?.npi);
  survey.phone = firstWithContent(application?.phone);
  survey.email = firstWithContent(application?.email);

  // 2. Education & training — first entry is treated as the primary degree.
  const edu = application?.education ?? [];
  if (edu[0]) {
    survey.professional_school = edu[0].institution ?? "";
    survey.degree = edu[0].credential ?? "";
    survey.graduation_year = edu[0].year ?? "";
  }
  survey.postgraduate_training = edu
    .slice(1)
    .map((e) =>
      [e.credential, e.institution, e.year && `(${e.year})`]
        .filter(Boolean)
        .join(" "),
    )
    .filter((line) => line.trim() !== "")
    .join("; ");

  // 3. Licensure & certification
  survey.licenses_held = licenseStatesFromCredentials(credentials).join(", ");
  const deaCred = credentials.find((c) => c.type === "dea" && c.number);
  survey.dea_number = deaCred?.number ?? "";
  const boardCreds = credentials
    .filter((c) => c.type === "board_certification")
    .map((c) => firstWithContent(c.notes, c.number))
    .filter(Boolean);
  survey.board_certification = firstWithContent(
    application?.board_certifications,
    boardCreds.join("; "),
  );

  // 4. Practice history
  survey.current_employer = firstWithContent(application?.current_employer);
  const recentRole = application?.work_history?.[0];
  survey.practice_summary = firstWithContent(
    recentRole?.summary,
    application?.current_title,
  );

  // 5. Disclosures — carried over from the intake survey for staff to confirm.
  survey.malpractice_history = firstWithContent(application?.malpractice_history);
  survey.malpractice_explanation = firstWithContent(
    application?.malpractice_explanation,
  );
  survey.board_action_history = firstWithContent(
    application?.license_action_history,
  );
  survey.board_action_explanation = firstWithContent(
    application?.license_action_explanation,
  );

  return survey;
}

/** Survey keys the pre-fill pipeline is capable of populating from the profile. */
export const PREFILLABLE_KEYS: (keyof LicenseSurvey)[] = [
  "legal_full_name",
  "npi",
  "phone",
  "email",
  "professional_school",
  "degree",
  "graduation_year",
  "postgraduate_training",
  "licenses_held",
  "dea_number",
  "board_certification",
  "current_employer",
  "practice_summary",
  "malpractice_history",
  "malpractice_explanation",
  "board_action_history",
  "board_action_explanation",
];

/** How many survey fields the pre-fill actually populated. */
export function prefillFieldCount(survey: LicenseSurvey): number {
  return PREFILLABLE_KEYS.filter((k) => survey[k].trim() !== "").length;
}

// ── Checklist hints — connect the checklist to structured profile data ────
/**
 * Short, item-keyed hints surfaced next to checklist rows so staff can see at
 * a glance what the provider record already supports.
 */
export function checklistHints(
  provider: Provider,
  credentials: ProviderCredential[],
): Record<string, string> {
  const hints: Record<string, string> = {};

  const stateLicenses = credentials.filter((c) => c.type === "state_license");
  const verifiedLicenses = stateLicenses.filter((c) => c.verified);
  if (stateLicenses.length > 0) {
    hints.primary_source_license = `${verifiedLicenses.length} of ${stateLicenses.length} state license(s) on file are verified.`;
  }

  if (provider.npi) hints.npi = `NPI on file: ${provider.npi}.`;

  const boardCerts = credentials.filter(
    (c) => c.type === "board_certification",
  );
  if (boardCerts.length > 0) {
    hints.board_certification = `${boardCerts.length} board-certification credential(s) on file.`;
  }

  const dea = credentials.find((c) => c.type === "dea");
  if (dea) {
    hints.dea_registration = dea.number
      ? `DEA credential on file: ${dea.number}.`
      : "DEA credential on file.";
  }

  return hints;
}

// ── Document-extraction seam (deliberate stub) ───────────────────────────
/**
 * Extension point — pull structured license-application fields out of an
 * uploaded provider document (a scanned state license, a DEA certificate, a
 * diploma). Pre-fill currently uses STRUCTURED data only; document parsing is
 * isolated behind this interface so it can be implemented later without
 * touching the wizard or the pre-fill caller.
 *
 * TODO(phase-5+): provide a real implementation backed by an OCR / structured
 * document-parsing service (e.g. an LLM document extractor or a vendor API),
 * then merge its output into prefillSurveyFromProvider's result. No real OCR
 * is attempted here on purpose.
 */
export interface DocumentExtractor {
  /** Extract whatever survey fields the document yields; unknown fields omitted. */
  extract(doc: ProviderDocument): Promise<Partial<LicenseSurvey>>;
}

/**
 * The default extractor: a safe no-op. It returns nothing, so wiring it into
 * the pre-fill pipeline changes no behaviour until a real extractor replaces
 * it. This keeps the seam exercised and type-checked.
 */
export const noopDocumentExtractor: DocumentExtractor = {
  async extract(): Promise<Partial<LicenseSurvey>> {
    // TODO(phase-5+): integrate OCR / structured document parsing here.
    return {};
  },
};

/**
 * Fold any extracted fields onto a base survey. Extracted values only fill
 * blanks — structured profile data and staff edits always win. Provided so a
 * future DocumentExtractor has a ready, tested merge path.
 */
export function applyExtractedFields(
  base: LicenseSurvey,
  extracted: Partial<LicenseSurvey>,
): LicenseSurvey {
  const out = { ...base };
  for (const k of LICENSE_SURVEY_KEYS) {
    const v = extracted[k];
    if (typeof v === "string" && v.trim() !== "" && out[k].trim() === "") {
      out[k] = v;
    }
  }
  return out;
}
