-- AlignMD — 0012 Saved jobs (clinician "interested" list)
-- Run after 0001–0011. Idempotent — safe to re-run.
--
-- Job-feed v2: a clinician can flag a scanned posting (external_jobs, 0010) as
-- "interested / saved" from the portal Open-jobs page. saved_jobs is the join
-- table — one row per (provider, external_job). The portal renders a Saved
-- view filtered to these rows; the toggle action inserts / deletes a row.
--
-- RLS mirrors 0003 / 0007 / 0010 / 0011: a clinician fully manages only their
-- OWN saved rows via current_provider_id() (defined in 0007); is_staff()
-- (defined in 0003) gets full access. Operational data, no restricted PII —
-- no audit trigger, matching 0009 / 0010 / 0011.

-- ── saved_jobs ────────────────────────────────────────────────────────────
create table if not exists saved_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  external_job_id uuid not null references external_jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One save per (provider, posting) — lets the app upsert / toggle cleanly.
  unique (provider_id, external_job_id)
);
create index if not exists saved_jobs_provider_idx
  on saved_jobs (provider_id);
create index if not exists saved_jobs_job_idx
  on saved_jobs (external_job_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- A clinician manages only their own saved rows (mirrors the
-- availability_provider_self pattern in 0007); staff get full access.
alter table saved_jobs enable row level security;

drop policy if exists saved_jobs_staff_all on saved_jobs;
create policy saved_jobs_staff_all on saved_jobs
  for all using (is_staff()) with check (is_staff());

drop policy if exists saved_jobs_provider_self on saved_jobs;
create policy saved_jobs_provider_self on saved_jobs
  for all using (provider_id = current_provider_id())
  with check (provider_id = current_provider_id());
