-- AlignMD — 0010 External job feeds
-- Run after 0001–0009. Idempotent — safe to re-run.
--
-- This migration adds a read-only mirror of real, open clinical job postings
-- pulled from third-party job-board APIs/feeds (Remotive, Adzuna, USAJOBS).
-- A daily cron hits /api/jobs/refresh, which ingests each configured feed
-- through the pluggable adapter system in src/lib/job-feeds and upserts the
-- normalized rows here. AlignMD never scrapes — only public/keyed APIs.
--
--  • external_jobs — one row per posting, deduped on (source, source_job_id).
--    `active` is flipped to false when a posting drops out of its feed.
--  • job_feed_runs — one row per ingestion run, for observability + a
--    "last refreshed" timestamp surfaced in the clinician portal.
--
-- RLS: staff get full access (is_staff(), defined in 0003); any signed-in
-- user gets read-only access, since the clinician portal credential-matches
-- these postings to the signed-in provider. No restricted PII is stored.

-- ── external_jobs ─────────────────────────────────────────────────────────
create table if not exists external_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_job_id text not null,
  title text not null,
  org_name text,
  location text,
  state text,
  is_remote boolean default false,
  clinician_role provider_role,
  specialty text,
  employment_type text,
  description text,
  url text not null,
  salary_min numeric,
  salary_max numeric,
  salary_currency text default 'USD',
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  unique (source, source_job_id)
);
create index if not exists external_jobs_state_idx
  on external_jobs (state);
create index if not exists external_jobs_role_idx
  on external_jobs (clinician_role);
create index if not exists external_jobs_active_posted_idx
  on external_jobs (active, posted_at desc);

-- ── job_feed_runs ─────────────────────────────────────────────────────────
create table if not exists job_feed_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources text[],
  inserted int default 0,
  updated int default 0,
  deactivated int default 0,
  ok boolean,
  error text
);
create index if not exists job_feed_runs_started_idx
  on job_feed_runs (started_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Staff manage feeds; every signed-in user may read postings so the portal
-- can credential-match them. Ingestion writes use the service-role client,
-- which bypasses RLS — these policies only govern interactive access.
alter table external_jobs enable row level security;
drop policy if exists external_jobs_staff_all on external_jobs;
create policy external_jobs_staff_all on external_jobs
  for all using (is_staff()) with check (is_staff());
drop policy if exists external_jobs_signed_in_read on external_jobs;
create policy external_jobs_signed_in_read on external_jobs
  for select using (auth.uid() is not null);

alter table job_feed_runs enable row level security;
drop policy if exists job_feed_runs_staff_all on job_feed_runs;
create policy job_feed_runs_staff_all on job_feed_runs
  for all using (is_staff()) with check (is_staff());
drop policy if exists job_feed_runs_signed_in_read on job_feed_runs;
create policy job_feed_runs_signed_in_read on job_feed_runs
  for select using (auth.uid() is not null);
