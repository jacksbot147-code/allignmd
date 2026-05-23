-- AlignMD — 0003 row-level security
-- Locks every table; grants access by role. Run after 0001 + 0002.

-- ── Role helpers ─────────────────────────────────────────────────────────
create or replace function current_app_role() returns user_role as $$
  select role from app_users where id = auth.uid();
$$ language sql stable security definer;

-- Staff who run the CRM.
create or replace function is_staff() returns boolean as $$
  select coalesce(current_app_role() in
    ('admin','recruiter','credentialing_coordinator'), false);
$$ language sql stable security definer;

-- Privileged staff allowed to see restricted data (malpractice, IDs, SSN).
create or replace function is_privileged() returns boolean as $$
  select coalesce(current_app_role() in
    ('admin','credentialing_coordinator'), false);
$$ language sql stable security definer;

-- ── Enable RLS everywhere ────────────────────────────────────────────────
alter table app_users              enable row level security;
alter table providers              enable row level security;
alter table provider_credentials   enable row level security;
alter table provider_documents     enable row level security;
alter table provider_availability  enable row level security;
alter table facilities             enable row level security;
alter table jobs                   enable row level security;
alter table job_requirements       enable row level security;
alter table procedure_catalog      enable row level security;
alter table provider_procedures    enable row level security;
alter table job_procedures         enable row level security;
alter table submissions            enable row level security;
alter table activities             enable row level security;
alter table tasks_reminders        enable row level security;
alter table application_responses  enable row level security;
alter table provider_references    enable row level security;
alter table verifications          enable row level security;
alter table license_applications   enable row level security;
alter table audit_log              enable row level security;

-- ── Identity ─────────────────────────────────────────────────────────────
create policy app_users_self_read on app_users
  for select using (is_staff() or id = auth.uid());
create policy app_users_admin_write on app_users
  for all using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- ── Standard staff-managed CRM tables (full access for staff) ─────────────
create policy staff_all on providers
  for all using (is_staff()) with check (is_staff());
-- A provider may read their own record (ready for Phase 3 self-service).
create policy provider_self_read on providers
  for select using (user_id = auth.uid());

create policy staff_all on provider_availability
  for all using (is_staff()) with check (is_staff());
create policy staff_all on facilities
  for all using (is_staff()) with check (is_staff());
create policy staff_all on jobs
  for all using (is_staff()) with check (is_staff());
create policy staff_all on job_requirements
  for all using (is_staff()) with check (is_staff());
create policy staff_all on procedure_catalog
  for all using (is_staff()) with check (is_staff());
create policy staff_all on provider_procedures
  for all using (is_staff()) with check (is_staff());
create policy staff_all on job_procedures
  for all using (is_staff()) with check (is_staff());
create policy staff_all on submissions
  for all using (is_staff()) with check (is_staff());
create policy staff_all on activities
  for all using (is_staff()) with check (is_staff());
create policy staff_all on tasks_reminders
  for all using (is_staff()) with check (is_staff());
create policy staff_all on application_responses
  for all using (is_staff()) with check (is_staff());
create policy staff_all on provider_references
  for all using (is_staff()) with check (is_staff());
create policy staff_all on license_applications
  for all using (is_staff()) with check (is_staff());

-- ── Restricted: malpractice credentials — privileged staff only ──────────
create policy cred_select on provider_credentials
  for select using (is_staff() and (type <> 'malpractice' or is_privileged()));
create policy cred_insert on provider_credentials
  for insert with check (is_staff());
create policy cred_update on provider_credentials
  for update using (is_staff() and (type <> 'malpractice' or is_privileged()));
create policy cred_delete on provider_credentials
  for delete using (is_staff());

-- ── Restricted: documents tagged 'restricted' — privileged staff only ────
create policy doc_select on provider_documents
  for select using (is_staff() and (sensitivity <> 'restricted' or is_privileged()));
create policy doc_insert on provider_documents
  for insert with check (is_staff());
create policy doc_update on provider_documents
  for update using (is_staff() and (sensitivity <> 'restricted' or is_privileged()));
create policy doc_delete on provider_documents
  for delete using (is_privileged());

-- ── Restricted: malpractice verifications — privileged staff only ────────
create policy verif_select on verifications
  for select using (is_staff() and (type <> 'malpractice' or is_privileged()));
create policy verif_insert on verifications
  for insert with check (is_staff());
create policy verif_update on verifications
  for update using (is_staff() and (type <> 'malpractice' or is_privileged()));
create policy verif_delete on verifications
  for delete using (is_staff());

-- ── Audit log — admin read only; writes happen via the definer trigger ───
create policy audit_admin_read on audit_log
  for select using (current_app_role() = 'admin');

-- NOTE: field-level masking of providers.ssn_last4 for non-privileged staff
-- is layered on top of this in the app (a privileged-only view /
-- column-grant). RLS here is row-level; see README.
