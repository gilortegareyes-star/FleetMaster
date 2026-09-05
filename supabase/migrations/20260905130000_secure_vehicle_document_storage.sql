-- Prepare tenant-aware Storage access for vehicle documents.
-- Apply together with the frontend path change in the coordinated Storage phase.

drop policy if exists vehicle_documents_storage_select_policy on storage.objects;
drop policy if exists vehicle_documents_storage_insert_policy on storage.objects;

create policy vehicle_documents_storage_select_policy
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(insurance_policy|registration_card|vehicle_inspection|other)/[^/]+\.(pdf|jpg|jpeg|png)$'
    and exists (
      select 1
      from public.vehicles v
      where v.id = case
        when name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
          then split_part(name, '/', 2)::uuid
        else null
      end
        and v.organization_id = case
          when name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
            then split_part(name, '/', 1)::uuid
          else null
        end
        and (
          public.is_fleetmaster_admin()
          or (
            public.is_organization_active(v.organization_id)
            and public.has_organization_role(
              v.organization_id,
              array['client', 'manager']::public.organization_role[]
            )
          )
        )
    )
  );

create policy vehicle_documents_storage_insert_policy
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(insurance_policy|registration_card|vehicle_inspection|other)/[^/]+\.(pdf|jpg|jpeg|png)$'
    and lower(storage.extension(name)) = any (array['pdf', 'jpg', 'jpeg', 'png'])
    and exists (
      select 1
      from public.vehicles v
      where v.id = case
        when name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
          then split_part(name, '/', 2)::uuid
        else null
      end
        and v.organization_id = case
          when name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
            then split_part(name, '/', 1)::uuid
          else null
        end
        and (
          public.is_fleetmaster_admin()
          or (
            public.is_organization_active(v.organization_id)
            and public.has_organization_role(
              v.organization_id,
              array['client', 'manager']::public.organization_role[]
            )
          )
        )
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
  path_organization_id uuid;
  path_vehicle_id uuid;
  path_document_type text;
  caller_is_fleetmaster_admin boolean;
  has_current_document boolean;
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

  if p_storage_path is null
     or p_storage_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(insurance_policy|registration_card|vehicle_inspection|other)/[^/]+\.(pdf|jpg|jpeg|png)$' then
    raise exception 'invalid vehicle document storage path';
  end if;

  path_organization_id := split_part(p_storage_path, '/', 1)::uuid;
  path_vehicle_id := split_part(p_storage_path, '/', 2)::uuid;
  path_document_type := split_part(p_storage_path, '/', 3);

  if path_organization_id <> vehicle_organization_id
     or path_vehicle_id <> p_vehicle_id
     or path_document_type <> p_document_type then
    raise exception 'vehicle document storage path does not match vehicle';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'vehicle-documents'
      and o.name = p_storage_path
  ) then
    raise exception 'vehicle document object not found';
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

  select exists (
    select 1
    from public.vehicle_documents d
    where d.vehicle_id = p_vehicle_id
      and d.document_type = p_document_type
      and d.is_current = true
      and (
        p_document_type <> 'registration_card'
        or d.circulation_type = p_circulation_type
      )
  )
  into has_current_document;

  if has_current_document
     and not caller_is_fleetmaster_admin
     and not public.has_organization_role(
       vehicle_organization_id,
       array['manager']::public.organization_role[]
     ) then
    raise exception 'vehicle document version update requires manager permissions';
  end if;

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
