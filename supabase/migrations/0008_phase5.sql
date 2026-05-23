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
