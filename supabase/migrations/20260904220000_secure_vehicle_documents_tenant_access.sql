-- Isolate vehicle document metadata by organization and derive its tenant from the vehicle.

create or replace function public.prevent_vehicle_document_scope_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.vehicle_id is distinct from old.vehicle_id then
    raise exception 'vehicle document ownership cannot be changed';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_vehicle_document_scope_change'
      and tgrelid = 'public.vehicle_documents'::regclass
  ) then
    create trigger prevent_vehicle_document_scope_change
      before update on public.vehicle_documents
      for each row
      execute function public.prevent_vehicle_document_scope_change();
  end if;
end;
$$;

drop policy if exists vehicle_documents_select_policy on public.vehicle_documents;
drop policy if exists vehicle_documents_insert_policy on public.vehicle_documents;
drop policy if exists vehicle_documents_update_policy on public.vehicle_documents;

revoke all on table public.vehicle_documents from public, anon, authenticated;
grant select, insert, update on table public.vehicle_documents to authenticated;

create policy vehicle_documents_admin_select_policy
  on public.vehicle_documents
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy vehicle_documents_member_select_policy
  on public.vehicle_documents
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy vehicle_documents_admin_insert_policy
  on public.vehicle_documents
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy vehicle_documents_member_insert_policy
  on public.vehicle_documents
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy vehicle_documents_admin_update_policy
  on public.vehicle_documents
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy vehicle_documents_manager_update_policy
  on public.vehicle_documents
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

create or replace function public.create_vehicle_document_version(
  p_vehicle_id uuid,
  p_document_type text,
  p_document_number text,
  p_issuer text,
  p_valid_from date,
  p_valid_until date,
  p_cost numeric,
  p_contact_name text,
  p_contact_phone text,
  p_notes text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_details jsonb default '{}'::jsonb,
  p_circulation_type text default null
)
returns public.vehicle_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_document public.vehicle_documents;
  vehicle_organization_id uuid;
  caller_is_fleetmaster_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select v.organization_id
  into vehicle_organization_id
  from public.vehicles v
  where v.id = p_vehicle_id;

  if vehicle_organization_id is null then
    raise exception 'vehicle not found or unavailable';
  end if;

  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();

  if not caller_is_fleetmaster_admin then
    if not public.is_organization_active(vehicle_organization_id)
       or not public.has_organization_role(
         vehicle_organization_id,
         array['client', 'manager']::public.organization_role[]
       ) then
      raise exception 'insufficient organization permissions';
    end if;
  end if;

  if p_document_type = 'registration_card'
     and (p_circulation_type is null or p_circulation_type not in ('state', 'federal')) then
    raise exception 'registration_card requires circulation_type state or federal';
  end if;

  if p_document_type <> 'registration_card' and p_circulation_type is not null then
    raise exception 'circulation_type is only valid for registration_card';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_vehicle_id::text || ':' || p_document_type || ':' || coalesce(p_circulation_type, 'legacy'))
  );

  update public.vehicle_documents
  set is_current = false
  where vehicle_id = p_vehicle_id
    and document_type = p_document_type
    and is_current = true
    and (
      p_document_type <> 'registration_card'
      or circulation_type = p_circulation_type
    );

  insert into public.vehicle_documents (
    organization_id,
    vehicle_id,
    document_type,
    circulation_type,
    document_number,
    issuer,
    valid_from,
    valid_until,
    cost,
    contact_name,
    contact_phone,
    notes,
    details,
    storage_path,
    original_filename,
    mime_type,
    file_size,
    is_current
  )
  values (
    vehicle_organization_id,
    p_vehicle_id,
    p_document_type,
    p_circulation_type,
    nullif(btrim(p_document_number), ''),
    nullif(btrim(p_issuer), ''),
    p_valid_from,
    p_valid_until,
    p_cost,
    nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_notes), ''),
    coalesce(p_details, '{}'::jsonb),
    p_storage_path,
    p_original_filename,
    p_mime_type,
    p_file_size,
    true
  )
  returning * into created_document;

  return created_document;
end;
$$;

revoke all on function public.create_vehicle_document_version(
  uuid,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text
) from public, anon;

grant execute on function public.create_vehicle_document_version(
  uuid,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text
) to authenticated;

revoke execute on function public.prevent_vehicle_document_scope_change()
  from public, anon, authenticated;
