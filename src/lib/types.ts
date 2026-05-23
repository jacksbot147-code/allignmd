// AlignMD database row types — mirror supabase/migrations/0001_schema.sql.

export type UserRole =
  | "admin"
  | "recruiter"
  | "credentialing_coordinator"
  | "provider"
  | "facility_contact";

export type ProviderRole =
  | "NP"
  | "PA"
  | "MD"
  | "DO"
  | "CRNA"
  | "PT"
  | "OT"
  | "SLP";

export type CredentialType =
  | "state_license"
  | "dea"
  | "csr"
  | "board_certification"
  | "bls"
  | "acls"
  | "pals"
  | "atls"
  | "npi"
  | "malpractice"
  | "other";

export type PipelineStage =
  | "new"
  | "screen"
  | "credentialing"
  | "submitted"
  | "interview"
  | "offer"
  | "placed";

export type AvailabilityBlock =
  | "nights"
  | "weekends"
  | "seven_on_seven_off"
  | "call"
  | "custom";

export type ActivityType = "call" | "text" | "email" | "note";
export type DocSensitivity = "standard" | "sensitive" | "restricted";

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: string;
  // Set for facility_contact users — the facility their portal is scoped to.
  facility_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  user_id: string | null;
  full_name: string;
  clinician_role: ProviderRole | null;
  specialty: string | null;
  subspecialty: string | null;
  years_experience: number | null;
  npi: string | null;
  languages: string[] | null;
  travel_radius_miles: number | null;
  telehealth_ok: boolean | null;
  available_start: string | null;
  pipeline_stage: PipelineStage;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
}

// SSN (last 4) lives in its own privileged-only table — see 0005 migration.
export interface ProviderPrivate {
  provider_id: string;
  ssn_last4: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface ProviderCredential {
  id: string;
  provider_id: string;
  type: CredentialType;
  state: string | null;
  is_compact: boolean | null;
  number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderDocument {
  id: string;
  provider_id: string;
  doc_type: string;
  storage_path: string;
  sensitivity: DocSensitivity;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProviderAvailability {
  id: string;
  provider_id: string;
  block_type: AvailabilityBlock;
  block_start: string | null;
  block_end: string | null;
  note: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  provider_id: string | null;
  job_id: string | null;
  type: ActivityType;
  body: string | null;
  actor_id: string | null;
  occurred_at: string;
}

export interface TaskReminder {
  id: string;
  provider_id: string | null;
  credential_id: string | null;
  title: string;
  due_on: string | null;
  type: string | null;
  status: string;
  assignee_id: string | null;
  created_at: string;
}

// ── Facilities & jobs (Phase 2) ───────────────────────────────────────────
export interface Facility {
  id: string;
  name: string;
  setting: string | null;
  emr: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  facility_id: string;
  title: string;
  specialty: string | null;
  setting: string | null;
  schedule: string | null;
  call_requirement: string | null;
  status: string;
  is_permanent: boolean | null;
  rate_hourly: number | null;
  rate_callback: number | null;
  rate_ot: number | null;
  rate_weekend: number | null;
  rate_holiday: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface JobRequirement {
  id: string;
  job_id: string;
  required_license_states: string[] | null;
  required_certs: CredentialType[] | null;
  min_years_experience: number | null;
  privileges: string[] | null;
}

export interface Submission {
  id: string;
  provider_id: string;
  job_id: string;
  stage: PipelineStage;
  match_score: number | null;
  submitted_on: string | null;
  interview_on: string | null;
  offer_on: string | null;
  placed_on: string | null;
  created_at: string;
  updated_at: string;
}

// ── Provider intake & onboarding (Phase 3) ────────────────────────────────
// One position in the application survey's work-history section.
export interface ApplicationWorkEntry {
  employer: string;
  title: string;
  location: string;
  start: string;
  end: string;
  summary: string;
}

// One row in the application survey's education / training section.
export interface ApplicationEducationEntry {
  credential: string; // e.g. MD, MSN, Residency, Fellowship
  institution: string;
  field: string;
  year: string;
}

// The shape stored in application_responses.payload (jsonb). Every scalar
// field is a string so the survey can round-trip cleanly through FormData.
export interface ApplicationPayload {
  // Professional profile
  preferred_name: string;
  phone: string;
  email: string;
  current_title: string;
  current_employer: string;
  primary_specialty: string;
  subspecialties: string;
  years_in_practice: string;
  board_certifications: string;
  npi: string;
  languages: string;
  // Work history & education
  work_history: ApplicationWorkEntry[];
  education: ApplicationEducationEntry[];
  // Assignment preferences
  reason_for_looking: string;
  assignment_type: string; // locum / permanent / either
  desired_start: string;
  ideal_schedule: string;
  shift_preferences: string;
  willing_to_travel: string; // yes / no
  travel_states: string;
  license_states_needed: string;
  telehealth_interest: string; // yes / no
  min_hourly_rate: string;
  // Screening disclosures
  malpractice_history: string; // yes / no
  malpractice_explanation: string;
  license_action_history: string; // yes / no
  license_action_explanation: string;
  additional_notes: string;
}

export interface ApplicationResponse {
  id: string;
  provider_id: string;
  payload: ApplicationPayload | Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ProviderReference {
  id: string;
  provider_id: string;
  name: string;
  contact: string | null;
  relationship: string | null;
  verified: boolean | null;
  called_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ── State-license application assistant (Phase 5) ─────────────────────────
export type LicenseApplicationStatus =
  | "draft"
  | "submitted"
  | "issued"
  | "withdrawn";

// The wizard survey. Every field is a string so the multi-step form can
// round-trip cleanly through FormData — mirrors ApplicationPayload's approach.
export interface LicenseSurvey {
  // 1. Applicant identity
  legal_full_name: string;
  former_names: string;
  date_of_birth: string;
  npi: string;
  home_address: string;
  phone: string;
  email: string;
  // 2. Education & training
  professional_school: string;
  degree: string;
  graduation_year: string;
  postgraduate_training: string;
  // 3. Licensure & certification
  licenses_held: string;
  board_certification: string;
  dea_number: string;
  target_license_type: string;
  // 4. Practice history
  current_employer: string;
  practice_summary: string;
  practice_gaps: string;
  // 5. Disclosures & attestations
  malpractice_history: string; // yes / no
  malpractice_explanation: string;
  board_action_history: string; // yes / no
  board_action_explanation: string;
  criminal_history: string; // yes / no
  criminal_explanation: string;
}

// Completion state of one checklist item, stored by item key.
export interface LicenseChecklistState {
  complete: boolean;
  note: string;
}

// The shape stored in license_applications.document_bundle (jsonb). The column
// defaults to '[]' in 0001; the assistant always writes this object instead.
export interface LicenseBundle {
  survey: LicenseSurvey;
  checklist: Record<string, LicenseChecklistState>;
  // Extension point — storage paths of provider documents the wizard pulled
  // data from. Reserved for the document-extraction seam (see lib/licensing).
  document_sources: string[];
}

export interface LicenseApplication {
  id: string;
  provider_id: string;
  state: string;
  status: LicenseApplicationStatus;
  document_bundle: LicenseBundle | unknown[] | Record<string, unknown>;
  created_by: string | null;
  submitted_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Outreach drafts (Phase 6) ─────────────────────────────────────────────
export type OutreachChannel = "email" | "sms";

// A row in outreach_drafts (migration 0009). Draft-only — AlignMD generates
// the copy and logs it here; sending always happens outside the platform.
export interface OutreachDraft {
  id: string;
  provider_id: string;
  job_id: string | null;
  channel: OutreachChannel;
  subject: string | null; // email subject; null for sms
  body: string;
  created_by: string | null;
  created_at: string;
}

// ── Bulk CSV import (Phase 2) ─────────────────────────────────────────────
// Result shapes for the importer's server action. These are UI/action types,
// not DB rows — kept here so both the action and its client form can import
// them (a "use server" module can only export async functions).
export interface ImportRowError {
  row: number; // 1-based line number in the uploaded file
  message: string;
}

export interface ImportOutcome {
  kind: "Clinicians" | "Facilities";
  total: number;
  succeeded: number;
  failed: number;
  errors: ImportRowError[];
}

export interface ImportState {
  ran: boolean;
  outcomes: ImportOutcome[];
  message: string | null;
}
