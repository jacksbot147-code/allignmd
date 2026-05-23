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
