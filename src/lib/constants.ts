import type {
  UserRole,
  ProviderRole,
  CredentialType,
  PipelineStage,
  ActivityType,
  AvailabilityBlock,
  LicenseApplicationStatus,
} from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  credentialing_coordinator: "Credentialing Coordinator",
  provider: "Provider",
  facility_contact: "Facility Contact",
};

/** Roles that operate the CRM. */
export const STAFF_ROLES: UserRole[] = [
  "admin",
  "recruiter",
  "credentialing_coordinator",
];

/** Roles allowed to see restricted data (malpractice, IDs, SSN). */
export const PRIVILEGED_ROLES: UserRole[] = ["admin", "credentialing_coordinator"];

export const isStaff = (r?: UserRole | null) =>
  !!r && STAFF_ROLES.includes(r);
export const isPrivileged = (r?: UserRole | null) =>
  !!r && PRIVILEGED_ROLES.includes(r);

/**
 * The landing route for a role after sign-in. Staff run the CRM; clinicians
 * and facility contacts each get their own first-class self-service side.
 */
export function homePathForRole(role?: UserRole | null): string {
  switch (role) {
    case "provider":
      return "/clinician";
    case "facility_contact":
      return "/facility";
    case "admin":
    case "recruiter":
    case "credentialing_coordinator":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

export const PROVIDER_ROLES: ProviderRole[] = [
  "NP",
  "PA",
  "MD",
  "DO",
  "CRNA",
  "PT",
  "OT",
  "SLP",
];

export const PROVIDER_ROLE_LABELS: Record<ProviderRole, string> = {
  NP: "NP — Nurse Practitioner",
  PA: "PA — Physician Assistant",
  MD: "MD — Physician",
  DO: "DO — Physician",
  CRNA: "CRNA — Nurse Anesthetist",
  PT: "PT — Physical Therapist",
  OT: "OT — Occupational Therapist",
  SLP: "SLP — Speech-Language Pathologist",
};

export const PIPELINE_STAGES: PipelineStage[] = [
  "new",
  "screen",
  "credentialing",
  "submitted",
  "interview",
  "offer",
  "placed",
];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  screen: "Screen",
  credentialing: "Credentialing",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  placed: "Placed",
};

export const CREDENTIAL_TYPES: CredentialType[] = [
  "state_license",
  "dea",
  "csr",
  "board_certification",
  "bls",
  "acls",
  "pals",
  "atls",
  "npi",
  "malpractice",
  "other",
];

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  state_license: "State License",
  dea: "DEA",
  csr: "CSR",
  board_certification: "Board Certification",
  bls: "BLS",
  acls: "ACLS",
  pals: "PALS",
  atls: "ATLS",
  npi: "NPI",
  malpractice: "Malpractice / Claims",
  other: "Other",
};

/** Credential types restricted to privileged staff (RLS-enforced too). */
export const RESTRICTED_CREDENTIAL_TYPES: CredentialType[] = ["malpractice"];

export const AVAILABILITY_BLOCKS: AvailabilityBlock[] = [
  "nights",
  "weekends",
  "seven_on_seven_off",
  "call",
  "custom",
];

export const AVAILABILITY_LABELS: Record<AvailabilityBlock, string> = {
  nights: "Nights",
  weekends: "Weekends",
  seven_on_seven_off: "7-on / 7-off",
  call: "Call",
  custom: "Custom",
};

export const ACTIVITY_TYPES: ActivityType[] = ["call", "text", "email", "note"];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  note: "Note",
};

export const SPECIALTIES = [
  "Family Medicine",
  "Internal Medicine",
  "Emergency Medicine",
  "Hospitalist",
  "Orthopedic Surgery",
  "General Surgery",
  "Cardiology",
  "Anesthesiology",
  "Psychiatry",
  "Pediatrics",
  "OB/GYN",
  "Dermatology",
  "Urgent Care",
  "Critical Care",
];

export const DOC_TYPES = [
  "cv",
  "license",
  "cert_card",
  "id",
  "immunization",
  "other",
];

// ── Facilities & jobs (Phase 2) ───────────────────────────────────────────
export const CARE_SETTINGS = [
  "Inpatient",
  "Outpatient",
  "OR",
  "Emergency Dept",
  "Clinic",
  "Urgent Care",
  "Telehealth",
];

export const JOB_STATUSES = ["open", "on_hold", "filled", "closed"];

export const JOB_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  filled: "Filled",
  closed: "Closed",
};

export const JOB_STATUS_TONE: Record<string, string> = {
  open: "ok",
  on_hold: "warn",
  filled: "teal",
  closed: "muted",
};

// ── Provider intake & onboarding (Phase 3) ────────────────────────────────
export const ASSIGNMENT_TYPES = ["locum", "permanent", "either"];

export const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  locum: "Locum / temporary",
  permanent: "Permanent",
  either: "Open to either",
};

/** Number of fixed work-history / education slots in the intake survey. */
export const WORK_SLOTS = 4;
export const EDU_SLOTS = 3;

/** Common reference relationships — surfaced as a datalist on the form. */
export const REFERENCE_RELATIONSHIPS = [
  "Supervising Physician",
  "Department Chair",
  "Medical Director",
  "Chief / Lead Clinician",
  "Program Director",
  "Practice Manager",
  "Colleague",
];

// ── State-license application assistant (Phase 5) ─────────────────────────
export const LICENSE_STATUSES: LicenseApplicationStatus[] = [
  "draft",
  "submitted",
  "issued",
  "withdrawn",
];

export const LICENSE_STATUS_LABELS: Record<LicenseApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted to board",
  issued: "License issued",
  withdrawn: "Withdrawn",
};

export const LICENSE_STATUS_TONE: Record<LicenseApplicationStatus, string> = {
  draft: "muted",
  submitted: "warn",
  issued: "ok",
  withdrawn: "muted",
};

/** Statuses that count as an in-flight application (work still to do). */
export const LICENSE_ACTIVE_STATUSES: LicenseApplicationStatus[] = [
  "draft",
  "submitted",
];
