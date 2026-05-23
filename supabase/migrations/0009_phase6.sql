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
