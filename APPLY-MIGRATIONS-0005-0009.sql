-- AlignMD — combined migrations 0005-0009, in order.
-- Paste this whole file into the Supabase SQL editor (New query) and Run.
-- Section markers below tell you which migration each block is from.

-- ============================================================
-- 0005_phase1_finish.sql
-- ============================================================
-- AlignMD — 0005 Phase 1 finish
-- Run after 0001–0004. Adds allied-health provider roles, provider
-- archiving, and moves SSN (last 4) into a privileged-only side table.
-- Idempotent — safe to re-run.

-- ── 1) Allied-health provider roles ──────────────────────────────────────
-- A new enum value can't be *used* in the same transaction it is added,
-- but it can be added here and referenced later by app code. Safe.
alter type provider_role add value if not exists 'PT';   -- Physical Therapist
alter type provider_role add value if not exists 'OT';   -- Occupational Therapist
alter type provider_role add value if not exists 'SLP';  -- Speech-Language Pathologist

-- ── 2) Provider archive (soft delete) ────────────────────────────────────
-- Archiving hides a provider from the working list/pipeline without ever
-- destroying the record or its audit trail.
alter table providers add column if not exists archived_at timestamptz;
alter table providers add column if not exists archived_by uuid references app_users(id);
create index if not exists providers_archived_idx on providers (archived_at);

-- ── 3) SSN last-4 → privileged-only side table ───────────────────────────
-- True field-level protection: the SSN no longer lives on `providers`, so a
-- normal staff `select *` on providers can never return it. Only privileged
-- staff (admin / credentialing coordinator) can read or write
-- provider_private, enforced by RLS below and the audit trigger.
create table if not exists provider_private (
  provider_id uuid primary key references providers(id) on delete cascade,
  ssn_last4 char(4),
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users(id)
);

-- Migrate any existing values off `providers`, then drop the column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'ssn_last4'
  ) then
    insert into provider_private (provider_id, ssn_last4)
    select id, ssn_last4 from providers where ssn_last4 is not null
    on conflict (provider_id) do nothing;
    alter table providers drop column ssn_last4;
  end if;
end $$;

-- ── RLS — privileged staff only ──────────────────────────────────────────
alter table provider_private enable row level security;
drop policy if exists pp_privileged_all on provider_private;
create policy pp_privileged_all on provider_private
  for all using (is_privileged()) with check (is_privileged());

-- ── Audit trail ──────────────────────────────────────────────────────────
drop trigger if exists audit_provider_private on provider_private;
create trigger audit_provider_private
  after insert or update or delete on provider_private
  for each row execute function audit_trigger();

-- ============================================================
-- 0006_phase3.sql
-- ============================================================
-- AlignMD — 0006 Phase 3: provider intake & onboarding
-- Run after 0001–0005. Idempotent — safe to re-run.
-- Backs the application survey and structured provider references. The
-- application_responses and provider_references tables themselves are
-- created in 0001; this migration only adds the columns Phase 3 needs.

-- ── application_responses — edit tracking + one application per provider ──
-- Mirrors the build plan's "every table carries created_at / updated_at".
alter table application_responses
  add column if not exists updated_at timestamptz not null default now();
alter table application_responses
  add column if not exists updated_by uuid references app_users(id);

-- The intake form upserts a single application record per provider.
create unique index if not exists application_responses_provider_uidx
  on application_responses (provider_id);

-- ── provider_references — timestamps for ordering + provenance ────────────
alter table provider_references
  add column if not exists created_at timestamptz not null default now();
alter table provider_references
  add column if not exists updated_at timestamptz not null default now();
alter table provider_references
  add column if not exists created_by uuid references app_users(id);
create index if not exists provider_references_created_idx
  on provider_references (created_at);

-- ── Audit trail — references hold personal contact data ──────────────────
-- application_responses already has an audit trigger (see 0002); references
-- did not. Reuses the same audit_trigger() definer function.
drop trigger if exists audit_provider_references on provider_references;
create trigger audit_provider_references
  after insert or update or delete on provider_references
  for each row execute function audit_trigger();

-- RLS for both tables is already set in 0003 (staff_all policies) — Phase 3
-- adds no new row-visibility rules.

-- ============================================================
-- 0007_portals.sql
-- ============================================================
-- AlignMD — 0007 self-service portals
-- Run after 0001–0006. Idempotent — safe to re-run.
--
-- Phase 3 (portals): non-staff roles get a real, scoped experience.
--  1) Links a facility_contact user to a facility (app_users.facility_id).
--  2) RLS so a 'provider' can read/manage only their OWN provider record,
--     documents, availability, credentials (read-only) and submissions.
--  3) RLS so a 'facility_contact' can read only their facility, its jobs,
--     the requirements on those jobs, the submissions on those jobs, and the
--     clinicians attached to those submissions.
-- Row-level only — column scoping stays in the server actions, matching the
-- existing pattern (see 0003 / README).

-- ── 1) facility_contact → facility link ──────────────────────────────────
alter table app_users
  add column if not exists facility_id uuid references facilities(id);
create index if not exists app_users_facility_idx on app_users (facility_id);

-- ── Identity helpers — mirror current_app_role() / is_staff() style ──────
-- The provider record owned by the signed-in user, if any.
create or replace function current_provider_id() returns uuid as $$
  select id from providers where user_id = auth.uid();
$$ language sql stable security definer;

-- The facility a facility_contact user is linked to, if any.
create or replace function current_facility_id() returns uuid as $$
  select facility_id from app_users where id = auth.uid();
$$ language sql stable security definer;

-- ── 2) Provider self-service policies ────────────────────────────────────
-- A provider may already read their own providers row (provider_self_read,
-- 0003). Add the ability to edit it — the server action restricts which
-- columns are written (basic info only).
drop policy if exists provider_self_update on providers;
create policy provider_self_update on providers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Own availability — full self-service (add / list / remove).
drop policy if exists availability_provider_self on provider_availability;
create policy availability_provider_self on provider_availability
  for all using (provider_id = current_provider_id())
  with check (provider_id = current_provider_id());

-- Own documents — upload, list and remove; restricted docs stay hidden.
drop policy if exists doc_provider_select on provider_documents;
create policy doc_provider_select on provider_documents
  for select using (
    provider_id = current_provider_id() and sensitivity <> 'restricted'
  );
drop policy if exists doc_provider_insert on provider_documents;
create policy doc_provider_insert on provider_documents
  for insert with check (provider_id = current_provider_id());
drop policy if exists doc_provider_delete on provider_documents;
create policy doc_provider_delete on provider_documents
  for delete using (
    provider_id = current_provider_id() and sensitivity <> 'restricted'
  );

-- Own credentials — read-only context for the portal; malpractice excluded.
drop policy if exists cred_provider_select on provider_credentials;
create policy cred_provider_select on provider_credentials
  for select using (
    provider_id = current_provider_id() and type <> 'malpractice'
  );

-- Own submissions — read-only pipeline view.
drop policy if exists submissions_provider_self on submissions;
create policy submissions_provider_self on submissions
  for select using (provider_id = current_provider_id());

-- Jobs / facilities behind the provider's own submissions — so the portal
-- pipeline can show the job title and facility name.
drop policy if exists jobs_provider_submitted_read on jobs;
create policy jobs_provider_submitted_read on jobs
  for select using (
    current_app_role() = 'provider'
    and exists (
      select 1 from submissions s
      where s.job_id = jobs.id and s.provider_id = current_provider_id()
    )
  );
drop policy if exists facilities_provider_read on facilities;
create policy facilities_provider_read on facilities
  for select using (
    current_app_role() = 'provider'
    and exists (
      select 1 from jobs j
      join submissions s on s.job_id = j.id
      where j.facility_id = facilities.id
        and s.provider_id = current_provider_id()
    )
  );

-- ── 3) Facility-contact policies — read-only, scoped to their facility ───
drop policy if exists facilities_contact_read on facilities;
create policy facilities_contact_read on facilities
  for select using (
    current_app_role() = 'facility_contact' and id = current_facility_id()
  );

drop policy if exists jobs_facility_contact_read on jobs;
create policy jobs_facility_contact_read on jobs
  for select using (
    current_app_role() = 'facility_contact'
    and facility_id = current_facility_id()
  );

drop policy if exists job_req_facility_contact_read on job_requirements;
create policy job_req_facility_contact_read on job_requirements
  for select using (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id
        and j.facility_id = current_facility_id()
    )
  );

drop policy if exists submissions_facility_contact_read on submissions;
create policy submissions_facility_contact_read on submissions
  for select using (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = submissions.job_id
        and j.facility_id = current_facility_id()
    )
  );

-- A facility contact may read the basic record of a clinician only when that
-- clinician is submitted to one of their jobs. (No SSN — that lives in the
-- privileged-only provider_private table; the portal selects name/role only.)
drop policy if exists provider_facility_contact_read on providers;
create policy provider_facility_contact_read on providers
  for select using (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from submissions s
      join jobs j on j.id = s.job_id
      where s.provider_id = providers.id
        and j.facility_id = current_facility_id()
    )
  );

-- ── Storage — a provider manages objects in their own id-prefixed folder ─
-- Document paths are `<provider_id>/<timestamp>-<name>` (see the upload
-- actions), so the first path segment is the owning provider's id.
drop policy if exists "pd provider read"   on storage.objects;
drop policy if exists "pd provider write"  on storage.objects;
drop policy if exists "pd provider delete" on storage.objects;
create policy "pd provider read" on storage.objects
  for select using (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = current_provider_id()::text
  );
create policy "pd provider write" on storage.objects
  for insert with check (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = current_provider_id()::text
  );
create policy "pd provider delete" on storage.objects
  for delete using (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = current_provider_id()::text
  );

-- ============================================================
-- 0008_phase5.sql
-- ============================================================
-- AlignMD — 0008 Phase 5: state-license application assistant
-- Run after 0001–0007. Idempotent — safe to re-run.
--
-- The license_applications table itself is created in 0001 (id, provider_id,
-- state, status, document_bundle jsonb, created_at, updated_at). Phase 5 adds
-- the provenance / lifecycle columns the assistant needs and tightens the
-- table with a few indexes. The application's wizard survey and per-item
-- checklist state are stored inside the existing document_bundle jsonb — no
-- new table is required.

-- ── Provenance + lifecycle columns ───────────────────────────────────────
-- Mirrors the build plan's "every table carries created_by"; submitted_at /
-- issued_at record when the application crossed each status boundary so the
-- /licensing list can show how long a board submission has been pending.
alter table license_applications
  add column if not exists created_by uuid references app_users(id);
alter table license_applications
  add column if not exists submitted_at timestamptz;
alter table license_applications
  add column if not exists issued_at timestamptz;

-- ── Indexes ──────────────────────────────────────────────────────────────
create index if not exists license_applications_provider_idx
  on license_applications (provider_id);
create index if not exists license_applications_status_idx
  on license_applications (status);

-- One live application per clinician + state. A withdrawn application does
-- not block starting a fresh one for the same state (re-application path).
create unique index if not exists license_applications_provider_state_uidx
  on license_applications (provider_id, state)
  where status <> 'withdrawn';

-- ── RLS ──────────────────────────────────────────────────────────────────
-- license_applications already has the `staff_all` policy from migration 0003
-- (for all using is_staff() with check is_staff()), and migration 0002 already
-- attaches the audit trigger (audit_license_applications). Phase 5 adds no new
-- row-visibility rules — the assistant is a staff-only workspace surface.

-- ============================================================
-- 0009_phase6.sql
-- ============================================================
-- AlignMD — 0009 Phase 6: outreach drafts
-- Run after 0001–0008. Idempotent — safe to re-run.
--
-- Phase 6 adds a draft-only outreach generator: staff generate email / SMS
-- copy for a clinician (optionally tied to a job) and copy/paste it into
-- their own channel. AlignMD never sends — these rows are simply a log of the
-- copy that was generated. No messaging integration, no credentials, no
-- enum is introduced; `channel` is a plain text column with a check.

create table if not exists outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  subject text,                              -- email subject; null for sms
  body text not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index if not exists outreach_drafts_provider_idx
  on outreach_drafts (provider_id);
create index if not exists outreach_drafts_created_idx
  on outreach_drafts (created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Operational copy, staff-only — mirrors the `staff_all` policy style from
-- migration 0003. No row-visibility split: any CRM staff member may generate
-- and review drafts. is_staff() is defined in 0003. Drafts hold no restricted
-- PII (a clinician name and free-text copy), so no audit trigger is attached.
alter table outreach_drafts enable row level security;
drop policy if exists outreach_drafts_staff_all on outreach_drafts;
create policy outreach_drafts_staff_all on outreach_drafts
  for all using (is_staff()) with check (is_staff());
