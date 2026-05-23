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
