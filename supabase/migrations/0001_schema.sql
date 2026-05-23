-- AlignMD — 0001 schema
-- The full data model. Run first. Postgres / Supabase.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────
create type user_role as enum
  ('admin','recruiter','credentialing_coordinator','provider','facility_contact');
create type provider_role as enum ('NP','PA','MD','DO','CRNA');
create type credential_type as enum
  ('state_license','dea','csr','board_certification','bls','acls','pals',
   'atls','npi','malpractice','other');
create type pipeline_stage as enum
  ('new','screen','credentialing','submitted','interview','offer','placed');
create type availability_block as enum
  ('nights','weekends','seven_on_seven_off','call','custom');
create type activity_type as enum ('call','text','email','note');
create type verification_type as enum ('background','malpractice','reference');
create type verification_status as enum
  ('pending','in_progress','passed','failed','flagged');
create type doc_sensitivity as enum ('standard','sensitive','restricted');

-- ── Identity ─────────────────────────────────────────────────────────────
-- Mirrors Supabase auth.users with an app role.
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'recruiter',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Providers (clinicians) ───────────────────────────────────────────────
create table providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  full_name text not null,
  clinician_role provider_role,
  specialty text,
  subspecialty text,
  years_experience int,
  npi text,
  ssn_last4 char(4),            -- full SSN intentionally NOT stored (see README)
  languages text[],
  travel_radius_miles int,
  telehealth_ok boolean default false,
  available_start date,
  pipeline_stage pipeline_stage not null default 'new',
  owner_id uuid references app_users(id),     -- the recruiter
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references app_users(id)
);
create index on providers (pipeline_stage);
create index on providers (owner_id);

create table provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  type credential_type not null,
  state text,
  is_compact boolean default false,           -- compact / IMLC indicator
  number text,
  issued_on date,
  expires_on date,
  verified boolean default false,
  verified_by uuid references app_users(id),
  verified_at timestamptz,
  verification_source text,                   -- 'state board' / 'NPDB' / 'vendor'
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on provider_credentials (provider_id);
create index on provider_credentials (expires_on);

create table provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  doc_type text not null,                     -- cv / license / cert_card / id / immunization
  storage_path text not null,                 -- Supabase Storage object path
  sensitivity doc_sensitivity not null default 'standard',
  uploaded_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index on provider_documents (provider_id);

create table provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  block_type availability_block not null,
  block_start date,
  block_end date,
  note text,
  created_at timestamptz not null default now()
);
create index on provider_availability (provider_id);

-- ── Facilities & jobs ────────────────────────────────────────────────────
create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  setting text,                               -- inpatient / outpatient / OR
  emr text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id) on delete cascade,
  title text not null,
  specialty text,
  setting text,
  schedule text,
  call_requirement text,
  status text not null default 'open',
  is_permanent boolean default false,         -- permanent vs temporary/locum
  rate_hourly numeric,
  rate_callback numeric,
  rate_ot numeric,
  rate_weekend numeric,
  rate_holiday numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references app_users(id)
);
create index on jobs (facility_id);
create index on jobs (status);

create table job_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  required_license_states text[],
  required_certs credential_type[],
  min_years_experience int,
  privileges text[]
);
create index on job_requirements (job_id);

-- ── Procedure competency ─────────────────────────────────────────────────
create table procedure_catalog (
  id uuid primary key default gen_random_uuid(),
  specialty text not null,
  procedure_name text not null,
  unique (specialty, procedure_name)
);

create table provider_procedures (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  procedure_id uuid not null references procedure_catalog(id) on delete cascade,
  comfort smallint check (comfort between 1 and 5),
  unique (provider_id, procedure_id)
);

create table job_procedures (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  procedure_id uuid not null references procedure_catalog(id) on delete cascade,
  required boolean not null default true,
  unique (job_id, procedure_id)
);

-- ── Submissions, activity, tasks ─────────────────────────────────────────
create table submissions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  stage pipeline_stage not null default 'submitted',
  match_score numeric,
  submitted_on date,
  interview_on date,
  offer_on date,
  placed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, job_id)
);
create index on submissions (job_id);

create table activities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  type activity_type not null,
  body text,
  actor_id uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index on activities (provider_id);

create table tasks_reminders (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete cascade,
  credential_id uuid references provider_credentials(id) on delete cascade,
  title text not null,
  due_on date,
  type text,                                  -- expiry_30/60/90 / follow_up / missing_item
  status text not null default 'open',
  assignee_id uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index on tasks_reminders (due_on);

-- ── Intake, references, verification, licensing ──────────────────────────
create table application_responses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  payload jsonb not null default '{}',        -- the intake survey
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table provider_references (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  name text not null,
  contact text,
  relationship text,
  verified boolean default false,
  called_at timestamptz,
  notes text
);
create index on provider_references (provider_id);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  type verification_type not null,
  vendor text,
  status verification_status not null default 'pending',
  result text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on verifications (provider_id);

create table license_applications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  state text not null,
  status text not null default 'draft',
  document_bundle jsonb default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
