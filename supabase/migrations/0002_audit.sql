-- AlignMD — 0002 audit trail
-- Records every insert/update/delete on sensitive tables. Run after 0001.

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,                 -- insert / update / delete
  entity_table text not null,
  entity_id text,
  changed jsonb,                        -- { old: {...}, new: {...} }
  occurred_at timestamptz not null default now()
);
create index on audit_log (entity_table, entity_id);
create index on audit_log (occurred_at);

create or replace function audit_trigger() returns trigger as $$
declare
  v_actor uuid;
  v_changed jsonb;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if tg_op = 'UPDATE' then
    v_changed := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  elsif tg_op = 'INSERT' then
    v_changed := jsonb_build_object('new', to_jsonb(new));
  else
    v_changed := jsonb_build_object('old', to_jsonb(old));
  end if;

  insert into audit_log (actor_id, action, entity_table, entity_id, changed)
  values (
    v_actor,
    lower(tg_op),
    tg_table_name,
    (case when tg_op = 'DELETE' then old.id else new.id end)::text,
    v_changed
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Attach to the sensitive tables.
create trigger audit_providers
  after insert or update or delete on providers
  for each row execute function audit_trigger();
create trigger audit_provider_credentials
  after insert or update or delete on provider_credentials
  for each row execute function audit_trigger();
create trigger audit_provider_documents
  after insert or update or delete on provider_documents
  for each row execute function audit_trigger();
create trigger audit_verifications
  after insert or update or delete on verifications
  for each row execute function audit_trigger();
create trigger audit_application_responses
  after insert or update or delete on application_responses
  for each row execute function audit_trigger();
create trigger audit_license_applications
  after insert or update or delete on license_applications
  for each row execute function audit_trigger();
create trigger audit_submissions
  after insert or update or delete on submissions
  for each row execute function audit_trigger();
create trigger audit_app_users
  after insert or update or delete on app_users
  for each row execute function audit_trigger();
