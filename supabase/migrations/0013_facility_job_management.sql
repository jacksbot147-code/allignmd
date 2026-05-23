-- AlignMD — 0013 facility-managed job posting
-- Run after 0001–0012. Idempotent — safe to re-run.
--
-- Until now only CRM staff could create or edit jobs (see 0003 staff_all
-- policies). This migration lets a facility_contact post and maintain the
-- roles for THEIR OWN facility — the key facility-side innovation.
--
-- RLS only. No schema changes. Mirrors the 0003 / 0007 style:
--   • `drop policy if exists` before every `create policy`
--   • scoped with current_app_role() + current_facility_id() (defined in 0007)
--   • column scoping stays in the server actions, matching the existing pattern
--
-- A facility contact may now:
--   • INSERT / UPDATE jobs where facility_id = their own facility
--   • INSERT / UPDATE / DELETE job_requirements for jobs at their facility
-- They still cannot touch jobs or requirements at any other facility, and the
-- staff_all policies (0003) continue to give CRM staff full access.

-- ── Jobs — a facility contact manages their own facility's roles ──────────
-- READ for facility contacts already exists (jobs_facility_contact_read, 0007).
-- Add INSERT + UPDATE, both confined to the contact's own facility.
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

-- ── Job requirements — one row per job, managed alongside the job ────────
-- READ already exists (job_req_facility_contact_read, 0007). Add the full
-- write set so the new-job / edit-job forms can replace the requirement row.
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
