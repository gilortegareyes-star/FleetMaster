-- Enforce the operational access switch for client-side operational data.
-- Administrative access, account access, and Feedback remain independent.

-- Vehicles.
drop policy if exists vehicles_member_select_policy on public.vehicles;
drop policy if exists vehicles_member_insert_policy on public.vehicles;
drop policy if exists vehicles_manager_update_policy on public.vehicles;

create policy vehicles_member_select_policy
  on public.vehicles
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy vehicles_member_insert_policy
  on public.vehicles
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy vehicles_manager_update_policy
  on public.vehicles
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Vehicle document metadata.
drop policy if exists vehicle_documents_member_select_policy on public.vehicle_documents;
drop policy if exists vehicle_documents_member_insert_policy on public.vehicle_documents;
drop policy if exists vehicle_documents_manager_update_policy on public.vehicle_documents;

create policy vehicle_documents_member_select_policy
  on public.vehicle_documents
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

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
    and public.organization_has_operational_access(organization_id)
  );

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
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Maintenance records.
drop policy if exists maintenance_records_member_select_policy on public.maintenance_records;
drop policy if exists maintenance_records_member_insert_policy on public.maintenance_records;
drop policy if exists maintenance_records_manager_update_policy on public.maintenance_records;

create policy maintenance_records_member_select_policy
  on public.maintenance_records
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_records_member_insert_policy
  on public.maintenance_records
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_records_manager_update_policy
  on public.maintenance_records
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Maintenance reports.
drop policy if exists maintenance_reports_member_select_policy on public.maintenance_reports;
drop policy if exists maintenance_reports_member_insert_policy on public.maintenance_reports;
drop policy if exists maintenance_reports_manager_update_policy on public.maintenance_reports;

create policy maintenance_reports_member_select_policy
  on public.maintenance_reports
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_reports_member_insert_policy
  on public.maintenance_reports
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_reports_manager_update_policy
  on public.maintenance_reports
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Maintenance work items.
drop policy if exists maintenance_work_items_member_select_policy on public.maintenance_work_items;
drop policy if exists maintenance_work_items_member_insert_policy on public.maintenance_work_items;
drop policy if exists maintenance_work_items_manager_update_policy on public.maintenance_work_items;

create policy maintenance_work_items_member_select_policy
  on public.maintenance_work_items
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_work_items_member_insert_policy
  on public.maintenance_work_items
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_work_items_manager_update_policy
  on public.maintenance_work_items
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- The catalog remains global/read-only for tenants, but blocked tenants cannot read it.
drop policy if exists maintenance_work_catalog_select_policy on public.maintenance_work_catalog;

create policy maintenance_work_catalog_select_policy
  on public.maintenance_work_catalog
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and public.is_organization_active(m.organization_id)
        and public.organization_has_operational_access(m.organization_id)
    )
  );

-- Economic maintenance items.
drop policy if exists maintenance_parts_member_select_policy on public.maintenance_parts;
drop policy if exists maintenance_parts_member_insert_policy on public.maintenance_parts;
drop policy if exists maintenance_parts_manager_update_policy on public.maintenance_parts;
drop policy if exists maintenance_cost_items_member_select_policy on public.maintenance_cost_items;
drop policy if exists maintenance_cost_items_member_insert_policy on public.maintenance_cost_items;
drop policy if exists maintenance_cost_items_manager_update_policy on public.maintenance_cost_items;

create policy maintenance_parts_member_select_policy
  on public.maintenance_parts
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_parts_member_insert_policy
  on public.maintenance_parts
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_parts_manager_update_policy
  on public.maintenance_parts
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_cost_items_member_select_policy
  on public.maintenance_cost_items
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_cost_items_member_insert_policy
  on public.maintenance_cost_items
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_cost_items_manager_update_policy
  on public.maintenance_cost_items
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Maintenance providers: preserve Admin and role semantics, adding only the gate.
drop policy if exists maintenance_providers_manager_select_policy on public.maintenance_providers;
drop policy if exists maintenance_providers_member_select_policy on public.maintenance_providers;
drop policy if exists maintenance_providers_manager_insert_policy on public.maintenance_providers;
drop policy if exists maintenance_providers_manager_update_policy on public.maintenance_providers;

create policy maintenance_providers_manager_select_policy
  on public.maintenance_providers
  for select
  to authenticated
  using (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_providers_member_select_policy
  on public.maintenance_providers
  for select
  to authenticated
  using (
    is_active
    and public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_providers_manager_insert_policy
  on public.maintenance_providers
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

create policy maintenance_providers_manager_update_policy
  on public.maintenance_providers
  for update
  to authenticated
  using (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  )
  with check (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
    and public.organization_has_operational_access(organization_id)
  );

-- Storage is part of the vehicle-document flow. Existing-object replacement remains denied
-- because the current Storage policy set has no update policy.
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
      where v.id = split_part(name, '/', 2)::uuid
        and v.organization_id = split_part(name, '/', 1)::uuid
        and (
          public.is_fleetmaster_admin()
          or (
            public.is_organization_active(v.organization_id)
            and public.has_organization_role(
              v.organization_id,
              array['client', 'manager']::public.organization_role[]
            )
            and public.organization_has_operational_access(v.organization_id)
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
      where v.id = split_part(name, '/', 2)::uuid
        and v.organization_id = split_part(name, '/', 1)::uuid
        and (
          public.is_fleetmaster_admin()
          or (
            public.is_organization_active(v.organization_id)
            and public.has_organization_role(
              v.organization_id,
              array['client', 'manager']::public.organization_role[]
            )
            and public.organization_has_operational_access(v.organization_id)
          )
        )
    )
  );

-- Operational RPCs keep their signatures, security modes, search paths, and grants.
create or replace function public.create_vehicle(
  p_organization_id uuid,
  p_internal_code text,
  p_brand text,
  p_model text,
  p_version text,
  p_year integer,
  p_vin text,
  p_license_plate text,
  p_engine_number text,
  p_color text,
  p_fuel_type text,
  p_fuel_types text[],
  p_state_license_plate text,
  p_federal_license_plate text,
  p_vehicle_type text,
  p_transmission_type text,
  p_load_capacity_kg integer,
  p_tank_capacity_liters numeric,
  p_acquisition_date date,
  p_acquisition_price numeric,
  p_current_mileage integer,
  p_status text
)
returns public.vehicles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid;
  resolved_organization_id uuid;
  created_vehicle public.vehicles;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'authentication required';
  end if;

  if public.is_fleetmaster_admin() then
    if p_organization_id is null then
      raise exception 'organization context required';
    end if;

    select o.id into resolved_organization_id
    from public.organizations o
    where o.id = p_organization_id and o.status = 'active';

    if resolved_organization_id is null then
      raise exception 'organization not found or inactive';
    end if;
  else
    if p_organization_id is not null then
      raise exception 'organization context is not allowed for this user';
    end if;

    select m.organization_id into resolved_organization_id
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = caller_id and m.status = 'active'
      and m.role in ('manager', 'client') and o.status = 'active'
    limit 1;

    if resolved_organization_id is null then
      raise exception 'active organization membership required';
    end if;
  end if;

  if not public.is_fleetmaster_admin()
     and not public.organization_has_operational_access(resolved_organization_id) then
    raise exception 'organization operational access is blocked';
  end if;

  insert into public.vehicles (
    organization_id, internal_code, brand, model, version, year, vin,
    license_plate, engine_number, color, fuel_type, fuel_types,
    state_license_plate, federal_license_plate, vehicle_type,
    transmission_type, load_capacity_kg, tank_capacity_liters,
    acquisition_date, acquisition_price, current_mileage, status
  ) values (
    resolved_organization_id, p_internal_code, p_brand, p_model, p_version, p_year, p_vin,
    p_license_plate, p_engine_number, p_color, p_fuel_type, p_fuel_types,
    p_state_license_plate, p_federal_license_plate, p_vehicle_type,
    p_transmission_type, p_load_capacity_kg, p_tank_capacity_liters,
    p_acquisition_date, p_acquisition_price, p_current_mileage, p_status
  ) returning * into created_vehicle;

  return created_vehicle;
end;
$$;

create or replace function public.create_vehicle_document_version(
  p_vehicle_id uuid, p_document_type text, p_document_number text, p_issuer text,
  p_valid_from date, p_valid_until date, p_cost numeric, p_contact_name text,
  p_contact_phone text, p_notes text, p_storage_path text, p_original_filename text,
  p_mime_type text, p_file_size bigint, p_details jsonb default '{}'::jsonb,
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

  select v.organization_id into vehicle_organization_id
  from public.vehicles v where v.id = p_vehicle_id;
  if vehicle_organization_id is null then
    raise exception 'vehicle not found or unavailable';
  end if;

  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();
  if not caller_is_fleetmaster_admin then
    if not public.is_organization_active(vehicle_organization_id)
       or not public.has_organization_role(vehicle_organization_id, array['client', 'manager']::public.organization_role[]) then
      raise exception 'insufficient organization permissions';
    end if;
    if not public.organization_has_operational_access(vehicle_organization_id) then
      raise exception 'organization operational access is blocked';
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

  perform pg_advisory_xact_lock(hashtext(p_vehicle_id::text || ':' || p_document_type || ':' || coalesce(p_circulation_type, 'legacy')));

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

  update public.vehicle_documents set is_current = false
  where vehicle_id = p_vehicle_id and document_type = p_document_type and is_current = true
    and (p_document_type <> 'registration_card' or circulation_type = p_circulation_type);

  insert into public.vehicle_documents (
    organization_id, vehicle_id, document_type, circulation_type, document_number, issuer,
    valid_from, valid_until, cost, contact_name, contact_phone, notes, details,
    storage_path, original_filename, mime_type, file_size, is_current
  ) values (
    vehicle_organization_id, p_vehicle_id, p_document_type, p_circulation_type,
    nullif(btrim(p_document_number), ''), nullif(btrim(p_issuer), ''), p_valid_from,
    p_valid_until, p_cost, nullif(btrim(p_contact_name), ''), nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_notes), ''), coalesce(p_details, '{}'::jsonb), p_storage_path,
    p_original_filename, p_mime_type, p_file_size, true
  ) returning * into created_document;
  return created_document;
end;
$$;

create or replace function public.create_maintenance_record(
  p_vehicle_id uuid, p_service_date date, p_mileage integer, p_maintenance_type text,
  p_description text, p_provider text, p_total_cost numeric, p_next_service_mileage integer,
  p_next_service_date date, p_notes text, p_status text
)
returns public.maintenance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_maintenance public.maintenance_records;
  vehicle_organization_id uuid;
  caller_is_fleetmaster_admin boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select v.organization_id into vehicle_organization_id from public.vehicles v where v.id = p_vehicle_id;
  if vehicle_organization_id is null then raise exception 'vehicle not found or unavailable'; end if;
  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();
  if not caller_is_fleetmaster_admin and (
    not public.is_organization_active(vehicle_organization_id)
    or not public.has_organization_role(vehicle_organization_id, array['client', 'manager']::public.organization_role[])
  ) then raise exception 'insufficient organization permissions'; end if;
  if not caller_is_fleetmaster_admin and not public.organization_has_operational_access(vehicle_organization_id) then
    raise exception 'organization operational access is blocked';
  end if;
  if p_status not in ('open', 'completed', 'partially_completed', 'follow_up_required', 'not_repaired', 'cancelled') then
    raise exception 'invalid maintenance status';
  end if;
  insert into public.maintenance_records (
    organization_id, vehicle_id, service_date, mileage, maintenance_type, description,
    provider, total_cost, next_service_mileage, next_service_date, notes, status
  ) values (
    vehicle_organization_id, p_vehicle_id, p_service_date, p_mileage, p_maintenance_type,
    nullif(btrim(p_description), ''), nullif(btrim(p_provider), ''), p_total_cost,
    p_next_service_mileage, p_next_service_date, nullif(btrim(p_notes), ''), p_status
  ) returning * into created_maintenance;
  return created_maintenance;
end;
$$;

create or replace function public.save_maintenance_report(
  p_maintenance_id uuid, p_entry_at timestamptz, p_exit_at timestamptz, p_entry_mileage integer,
  p_reason text, p_reception_conditions jsonb, p_diagnosis text, p_recommendations text,
  p_pending_work text, p_closed_by text, p_closure_notes text
)
returns public.maintenance_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_report public.maintenance_reports;
  maintenance_organization_id uuid;
  caller_is_fleetmaster_admin boolean;
  report_exists boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select m.organization_id into maintenance_organization_id
  from public.maintenance_records m where m.id = p_maintenance_id;
  if maintenance_organization_id is null then raise exception 'maintenance record not found or unavailable'; end if;
  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();
  if not caller_is_fleetmaster_admin and (
    not public.is_organization_active(maintenance_organization_id)
    or not public.has_organization_role(maintenance_organization_id, array['client', 'manager']::public.organization_role[])
  ) then raise exception 'insufficient organization permissions'; end if;
  if not caller_is_fleetmaster_admin and not public.organization_has_operational_access(maintenance_organization_id) then
    raise exception 'organization operational access is blocked';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_maintenance_id::text));
  select exists (select 1 from public.maintenance_reports r where r.maintenance_id = p_maintenance_id) into report_exists;
  if report_exists and not caller_is_fleetmaster_admin
     and not public.has_organization_role(maintenance_organization_id, array['manager']::public.organization_role[]) then
    raise exception 'maintenance report update requires manager permissions';
  end if;
  if report_exists then
    update public.maintenance_reports set
      entry_at = p_entry_at, exit_at = p_exit_at, entry_mileage = p_entry_mileage,
      reason = nullif(btrim(p_reason), ''), reception_conditions = p_reception_conditions,
      diagnosis = nullif(btrim(p_diagnosis), ''), recommendations = nullif(btrim(p_recommendations), ''),
      pending_work = nullif(btrim(p_pending_work), ''), closed_by = nullif(btrim(p_closed_by), ''),
      closure_notes = nullif(btrim(p_closure_notes), '')
    where maintenance_id = p_maintenance_id returning * into saved_report;
  else
    insert into public.maintenance_reports (
      organization_id, maintenance_id, entry_at, exit_at, entry_mileage, reason,
      reception_conditions, diagnosis, recommendations, pending_work, closed_by, closure_notes
    ) values (
      maintenance_organization_id, p_maintenance_id, p_entry_at, p_exit_at, p_entry_mileage,
      nullif(btrim(p_reason), ''), p_reception_conditions, nullif(btrim(p_diagnosis), ''),
      nullif(btrim(p_recommendations), ''), nullif(btrim(p_pending_work), ''),
      nullif(btrim(p_closed_by), ''), nullif(btrim(p_closure_notes), '')
    ) returning * into saved_report;
  end if;
  return saved_report;
end;
$$;

create or replace function public.save_maintenance_entry(
  p_maintenance_id uuid, p_entry_at timestamptz, p_entry_mileage integer, p_provider_id uuid,
  p_fuel_level text, p_conditions text[], p_observations text
)
returns public.maintenance_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  maintenance_organization_id uuid;
  current_provider_id uuid;
  caller_is_fleetmaster_admin boolean;
  existing_report public.maintenance_reports;
  merged_conditions jsonb;
  normalized_observations text;
  negative_conditions text[] := array['warning_lights', 'exterior_damage', 'visible_leak', 'abnormal_noise'];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_maintenance_id::text));
  select m.organization_id, m.provider_id into maintenance_organization_id, current_provider_id
  from public.maintenance_records m where m.id = p_maintenance_id and m.status = 'open';
  if maintenance_organization_id is null then raise exception 'maintenance record not found, unavailable, or closed'; end if;
  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();
  if not caller_is_fleetmaster_admin and (
    not public.is_organization_active(maintenance_organization_id)
    or not public.has_organization_role(maintenance_organization_id, array['client', 'manager']::public.organization_role[])
  ) then raise exception 'insufficient organization permissions'; end if;
  if not caller_is_fleetmaster_admin and not public.organization_has_operational_access(maintenance_organization_id) then
    raise exception 'organization operational access is blocked';
  end if;
  if not caller_is_fleetmaster_admin and current_provider_id is not null
     and not public.has_organization_role(maintenance_organization_id, array['manager']::public.organization_role[]) then
    raise exception 'maintenance entry update requires manager permissions';
  end if;
  if p_entry_at is null then raise exception 'entry timestamp is required'; end if;
  if p_entry_mileage is null or p_entry_mileage < 0 then raise exception 'entry mileage is invalid'; end if;
  if p_provider_id is null then raise exception 'maintenance provider is required'; end if;
  if current_provider_id is distinct from p_provider_id then
    if not exists (select 1 from public.maintenance_providers p where p.id = p_provider_id
      and p.organization_id = maintenance_organization_id and p.is_active) then raise exception 'maintenance provider is unavailable'; end if;
  elsif not exists (select 1 from public.maintenance_providers p where p.id = p_provider_id
    and p.organization_id = maintenance_organization_id) then raise exception 'maintenance provider is unavailable'; end if;
  if p_fuel_level not in ('empty', 'quarter', 'half', 'three_quarters', 'full') then raise exception 'maintenance fuel level is invalid'; end if;
  if p_conditions is null or cardinality(p_conditions) = 0 then raise exception 'maintenance entry conditions are required'; end if;
  if exists (select 1 from unnest(p_conditions) condition where condition not in
    ('no_apparent_damage', 'warning_lights', 'exterior_damage', 'visible_leak', 'abnormal_noise', 'other')) then
    raise exception 'maintenance entry condition is invalid';
  end if;
  if 'no_apparent_damage' = any (p_conditions) and p_conditions && negative_conditions then
    raise exception 'no apparent damage cannot be combined with negative conditions';
  end if;
  normalized_observations := nullif(btrim(coalesce(p_observations, '')), '');
  if 'other' = any (p_conditions) and normalized_observations is null then raise exception 'observations are required for other condition'; end if;
  select * into existing_report from public.maintenance_reports r where r.maintenance_id = p_maintenance_id;
  merged_conditions := jsonb_set(jsonb_set(jsonb_set(coalesce(existing_report.reception_conditions, '{}'::jsonb), '{fuelLevel}', to_jsonb(p_fuel_level), true), '{conditions}', to_jsonb(p_conditions), true), '{observations}', case when normalized_observations is null then 'null'::jsonb else to_jsonb(normalized_observations) end, true);
  update public.maintenance_records set provider_id = p_provider_id,
    provider = (select p.name from public.maintenance_providers p where p.id = p_provider_id and p.organization_id = maintenance_organization_id)
    where id = p_maintenance_id;
  if existing_report.maintenance_id is not null then
    update public.maintenance_reports set entry_at = p_entry_at, entry_mileage = p_entry_mileage, reception_conditions = merged_conditions
      where maintenance_id = p_maintenance_id returning * into existing_report;
  else
    insert into public.maintenance_reports (organization_id, maintenance_id, entry_at, entry_mileage, reception_conditions)
      values (maintenance_organization_id, p_maintenance_id, p_entry_at, p_entry_mileage, merged_conditions)
      returning * into existing_report;
  end if;
  return existing_report;
end;
$$;

create or replace function public.close_maintenance_order(
  p_maintenance_id uuid, p_status text, p_exit_at timestamptz, p_mileage integer,
  p_next_service_mileage integer, p_next_service_date date, p_closure_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry_mileage integer;
  v_diagnosis text;
  v_recommendations text;
  v_pending_work text;
  v_organization_id uuid;
begin
  if p_status not in ('completed', 'partially_completed', 'follow_up_required', 'not_repaired') then raise exception 'maintenance-close-invalid-status'; end if;
  if p_exit_at is null then raise exception 'maintenance-close-exit-required'; end if;
  if p_mileage is null or p_mileage < 0 then raise exception 'maintenance-close-mileage-invalid'; end if;
  select organization_id into v_organization_id from public.maintenance_records
    where id = p_maintenance_id and status = 'open' for update;
  if not found then raise exception 'maintenance-close-not-open'; end if;
  if not public.is_fleetmaster_admin() and not public.organization_has_operational_access(v_organization_id) then
    raise exception 'organization operational access is blocked';
  end if;
  select entry_mileage, diagnosis, recommendations, pending_work into v_entry_mileage, v_diagnosis, v_recommendations, v_pending_work
    from public.maintenance_reports where maintenance_id = p_maintenance_id for update;
  if not found then raise exception 'maintenance-close-report-missing'; end if;
  if v_entry_mileage is not null and p_mileage < v_entry_mileage then raise exception 'maintenance-close-mileage-before-entry'; end if;
  if not exists (select 1 from public.maintenance_work_items where maintenance_id = p_maintenance_id)
     and nullif(btrim(coalesce(v_diagnosis, '')), '') is null
     and nullif(btrim(coalesce(p_closure_notes, '')), '') is null then raise exception 'maintenance-close-content-required'; end if;
  if p_status = 'follow_up_required' and nullif(btrim(coalesce(v_pending_work, '')), '') is null
     and nullif(btrim(coalesce(v_recommendations, '')), '') is null
     and p_next_service_mileage is null and p_next_service_date is null then raise exception 'maintenance-close-follow-up-required'; end if;
  update public.maintenance_reports set exit_at = p_exit_at, closure_notes = nullif(btrim(p_closure_notes), '') where maintenance_id = p_maintenance_id;
  update public.maintenance_records set status = p_status, mileage = p_mileage,
    service_date = (p_exit_at at time zone 'America/Mexico_City')::date,
    next_service_mileage = p_next_service_mileage, next_service_date = p_next_service_date where id = p_maintenance_id;
  return p_maintenance_id;
end;
$$;

-- Restore the existing public execute grants for the replaced RPC signatures.
grant execute on function public.create_vehicle(uuid, text, text, text, text, integer, text, text, text, text, text, text[], text, text, text, text, integer, numeric, date, numeric, integer, text) to authenticated;
grant execute on function public.create_vehicle_document_version(uuid, text, text, text, date, date, numeric, text, text, text, text, text, text, bigint, jsonb, text) to authenticated;
grant execute on function public.create_maintenance_record(uuid, date, integer, text, text, text, numeric, integer, date, text, text) to authenticated;
grant execute on function public.save_maintenance_report(uuid, timestamptz, timestamptz, integer, text, jsonb, text, text, text, text, text) to authenticated;
grant execute on function public.save_maintenance_entry(uuid, timestamptz, integer, uuid, text, text[], text) to authenticated;
grant execute on function public.close_maintenance_order(uuid, text, timestamptz, integer, integer, date, text) to anon, authenticated;
