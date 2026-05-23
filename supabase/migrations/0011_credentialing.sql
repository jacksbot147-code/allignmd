-- AlignMD — 0011 Phase 1: credentialing packet
-- Run after 0001–0010. Idempotent — safe to re-run.
--
-- The customer flagged credentialing as "the hard part — a lot of work." This
-- migration adds the credentialing packet: a per-provider checklist of every
-- item a clinician must clear before placement.
--
--  • credentialing_items — one row per (provider, item_type). status moves
--    not_started → in_progress → complete (or expired / na). The staff
--    "Credentialing" tab renders these merged over a fixed canonical
--    checklist (see src/lib/credentialing.ts) with packet progress % and
--    gap flags.
--
-- This is distinct from provider_credentials (0001): that table tracks the
-- licenses / certifications themselves and their expiry; credentialing_items
-- tracks the packet workflow (references, background check, NPDB query,
-- COI, immunizations, …).
--
-- RLS mirrors 0003 / 0007 exactly: is_staff() gets full access; a clinician
-- may read (only) their own packet via current_provider_id(). is_staff() is
-- defined in 0003; current_provider_id() in 0007. Operational data, no
-- restricted PII — no audit trigger, matching 0009 / 0010.

-- ── credentialing_items ───────────────────────────────────────────────────
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
-- One row per checklist item per provider — lets the app upsert an item by
-- (provider_id, item_type) as staff work the packet.
create unique index if not exists credentialing_items_provider_item_uidx
  on credentialing_items (provider_id, item_type);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Mirrors the staff_all pattern from 0003 and the provider self-read pattern
-- from 0007. Staff manage every packet; a clinician may read only their own.
alter table credentialing_items enable row level security;

drop policy if exists credentialing_items_staff_all on credentialing_items;
create policy credentialing_items_staff_all on credentialing_items
  for all using (is_staff()) with check (is_staff());

drop policy if exists credentialing_items_provider_self_read on credentialing_items;
create policy credentialing_items_provider_self_read on credentialing_items
  for select using (provider_id = current_provider_id());
