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
