-- AlignMD — 0004 application bootstrap
-- Run after 0001 + 0002 + 0003. Idempotent — safe to re-run.
-- 1) auto-provisions an app_users row when an auth user is created
-- 2) creates the private storage bucket for provider documents

-- ── auth.users -> app_users mirror ───────────────────────────────────────
create or replace function handle_new_user() returns trigger as $$
declare
  existing_count int;
  assigned_role user_role;
begin
  select count(*) into existing_count from public.app_users;
  -- The first account to ever sign up becomes the workspace admin.
  if existing_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'recruiter';
  end if;

  insert into public.app_users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Private storage bucket for provider documents ────────────────────────
insert into storage.buckets (id, name, public)
values ('provider-documents', 'provider-documents', false)
on conflict (id) do nothing;

-- Storage access mirrors CRM staff access; row-level sensitivity is enforced
-- on the provider_documents table (see 0003).
drop policy if exists "pd staff read"   on storage.objects;
drop policy if exists "pd staff write"  on storage.objects;
drop policy if exists "pd staff update" on storage.objects;
drop policy if exists "pd priv delete"  on storage.objects;

create policy "pd staff read" on storage.objects
  for select using (bucket_id = 'provider-documents' and is_staff());
create policy "pd staff write" on storage.objects
  for insert with check (bucket_id = 'provider-documents' and is_staff());
create policy "pd staff update" on storage.objects
  for update using (bucket_id = 'provider-documents' and is_staff());
create policy "pd priv delete" on storage.objects
  for delete using (bucket_id = 'provider-documents' and is_privileged());
