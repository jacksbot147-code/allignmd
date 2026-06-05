-- ============================================================================
-- AlignMD — apply migrations 0011, 0012, 0013 in one pass
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor for the AlignMD project
-- (project ref nhhtzbmovpdolqhrfwzr) and run it.
--
-- These three migrations flip the credentialing packet, the clinician saved-jobs
-- toggle, and facility-managed job posting from their empty-state fallback to
-- fully live. They run after 0001–0010 (already applied) and every statement is
-- idempotent — safe to run, and safe to re-run if you are unsure.
--
-- After running: reload alignmd.vercel.app and smoke-test the Credentialing tab
-- on a provider, the Save toggle on the clinician Open-jobs page, and facility
-- job posting.
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████████
-- 0011 — Phase 1: credentialing packet
-- ████████████████████████████████████████████████████████████████████████████
-- Adds credentialing_items: a per-provider checklist of every item a clinician
-- must clear before placement. Distinct from provider_credentials (0001), which
-- tracks the licenses themselves. RLS mirrors 0003 / 0007: is_staff() gets full
-- access; a clinician may read only their own packet via current_provider_id().

create table if not exists credentialing_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  item_type text not null,                    -- see CREDENTIALING_ITEM_TYPES
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','complete','expired','na')),
  due_date date,
  completed_on date,
  verified_by uuid references app_users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists credentialing_items_provider_idx
  on credentialing_items (provider_id);
create index if not exists credentialing_items_status_idx
  on credentialing_items (status);
create unique index if not exists credentialing_items_provider_item_uidx
  on credentialing_items (provider_id, item_type);

alter table credentialing_items enable row level security;

drop policy if exists credentialing_items_staff_all on credentialing_items;
create policy credentialing_items_staff_all on credentialing_items
  for all using (is_staff()) with check (is_staff());

drop policy if exists credentialing_items_provider_self_read on credentialing_items;
create policy credentialing_items_provider_self_read on credentialing_items
  for select using (provider_id = current_provider_id());


-- ████████████████████████████████████████████████████████████████████████████
-- 0012 — Saved jobs (clinician "interested" list)
-- ████████████████████████████████████████████████████████████████████████████
-- Job-feed v2: saved_jobs joins a provider to a scanned posting (external_jobs,
-- 0010). RLS: a clinician fully manages only their own saved rows; is_staff()
-- gets full access.

create table if not exists saved_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  external_job_id uuid not null references external_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider_id, external_job_id)
);
create index if not exists saved_jobs_provider_idx
  on saved_jobs (provider_id);
create index if not exists saved_jobs_job_idx
  on saved_jobs (external_job_id);

alter table saved_jobs enable row level security;

drop policy if exists saved_jobs_staff_all on saved_jobs;
create policy saved_jobs_staff_all on saved_jobs
  for all using (is_staff()) with check (is_staff());

drop policy if exists saved_jobs_provider_self on saved_jobs;
create policy saved_jobs_provider_self on saved_jobs
  for all using (provider_id = current_provider_id())
  with check (provider_id = current_provider_id());


-- ████████████████████████████████████████████████████████████████████████████
-- 0013 — Facility-managed job posting
-- ████████████████████████████████████████████████████████████████████████████
-- Lets a facility_contact post and maintain the roles for THEIR OWN facility.
-- RLS only, no schema changes. Scoped with current_app_role() +
-- current_facility_id() (defined in 0007). Staff staff_all policies (0003)
-- continue to give CRM staff full access.

drop policy if exists jobs_facility_contact_insert on jobs;
create policy jobs_facility_contact_insert on jobs
  for insert with check (
    current_app_role() = 'facility_contact'
    and facility_id = current_facility_id()
  );

drop policy if exists jobs_facility_contact_update on jobs;
create policy jobs_facility_contact_update on jobs
  for update using (
    current_app_role() = 'facility_contact'
    and facility_id = current_facility_id()
  )
  with check (
    current_app_role() = 'facility_contact'
    and facility_id = current_facility_id()
  );

drop policy if exists job_req_facility_contact_insert on job_requirements;
create policy job_req_facility_contact_insert on job_requirements
  for insert with check (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id
        and j.facility_id = current_facility_id()
    )
  );

drop policy if exists job_req_facility_contact_update on job_requirements;
create policy job_req_facility_contact_update on job_requirements
  for update using (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id
        and j.facility_id = current_facility_id()
    )
  )
  with check (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id
        and j.facility_id = current_facility_id()
    )
  );

drop policy if exists job_req_facility_contact_delete on job_requirements;
create policy job_req_facility_contact_delete on job_requirements
  for delete using (
    current_app_role() = 'facility_contact'
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id
        and j.facility_id = current_facility_id()
    )
  );

-- ============================================================================
-- Done. All three migrations applied.
-- ============================================================================
