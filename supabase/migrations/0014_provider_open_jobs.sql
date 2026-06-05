-- AlignMD — 0014 provider read access to open internal requisitions
-- Run after 0001–0013. Idempotent — safe to re-run.
--
-- Unblocks the clinician-portal "My matches" page (/clinician/opportunities):
-- a provider's-eye view of the desk's OPEN internal jobs, ranked by the same
-- match engine staff use. Until now a provider could only read jobs they were
-- already submitted to (jobs_provider_submitted_read, 0007), so a clinician-
-- facing match board had nothing to read. These three policies are purely
-- additive SELECT grants — no insert/update/delete, no existing policy is
-- touched, and staff / facility access is unchanged.
--
-- Scope decisions:
--  • Only jobs with status = 'open' — closed/filled requisitions stay
--    invisible to providers who were never submitted to them.
--  • Only signed-in users with a linked provider record
--    (current_provider_id() is not null, defined in 0007 — security definer).
--  • job_requirements rows are readable only for those open jobs, so the
--    match engine sees real license/cert/experience requirements.
--  • facilities rows are readable only when the facility has an open job —
--    name/city/state are what the job board renders. facilities (0001)
--    carries no contact PII (name / setting / emr / city / state only).
--  • Row-level only — column scoping stays in the page/server code, matching
--    the established pattern (0003 / 0007 header note). Note this makes the
--    jobs rate_* columns readable to providers via the API; pay transparency
--    is the direction the provider-focused platform is taking (rate
--    visibility is table stakes on Vivian/Trusted-class boards), but if the
--    desk wants rates hidden, drop jobs_provider_open_read and re-scope
--    through a view in a follow-up migration.

-- ── Open jobs ─────────────────────────────────────────────────────────────
drop policy if exists jobs_provider_open_read on jobs;
create policy jobs_provider_open_read on jobs
  for select using (
    status = 'open' and current_provider_id() is not null
  );

-- ── Requirements on open jobs ─────────────────────────────────────────────
drop policy if exists job_req_provider_open_read on job_requirements;
create policy job_req_provider_open_read on job_requirements
  for select using (
    current_provider_id() is not null
    and exists (
      select 1 from jobs j
      where j.id = job_requirements.job_id and j.status = 'open'
    )
  );

-- ── Facilities with an open job ───────────────────────────────────────────
drop policy if exists facilities_provider_open_jobs_read on facilities;
create policy facilities_provider_open_jobs_read on facilities
  for select using (
    current_provider_id() is not null
    and exists (
      select 1 from jobs j
      where j.facility_id = facilities.id and j.status = 'open'
    )
  );
