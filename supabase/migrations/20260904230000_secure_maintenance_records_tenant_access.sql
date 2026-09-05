-- Isolate maintenance records by organization and derive their tenant from the vehicle.

create or replace function public.prevent_maintenance_record_scope_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.vehicle_id is distinct from old.vehicle_id then
    raise exception 'maintenance record ownership cannot be changed';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_maintenance_record_scope_change'
      and tgrelid = 'public.maintenance_records'::regclass
  ) then
    create trigger prevent_maintenance_record_scope_change
      before update on public.maintenance_records
      for each row
      execute function public.prevent_maintenance_record_scope_change();
  end if;
end;
$$;

drop policy if exists maintenance_records_select_policy on public.maintenance_records;
drop policy if exists maintenance_records_insert_policy on public.maintenance_records;
drop policy if exists maintenance_records_update_policy on public.maintenance_records;
drop policy if exists maintenance_records_delete_open_policy on public.maintenance_records;

revoke all on table public.maintenance_records from public, anon, authenticated;
grant select, insert, update on table public.maintenance_records to authenticated;

create policy maintenance_records_admin_select_policy
  on public.maintenance_records
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_records_member_select_policy
  on public.maintenance_records
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_records_admin_insert_policy
  on public.maintenance_records
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

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
  );

create policy maintenance_records_admin_update_policy
  on public.maintenance_records
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

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
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

create or replace function public.create_maintenance_record(
  p_vehicle_id uuid,
  p_service_date date,
  p_mileage integer,
  p_maintenance_type text,
  p_description text,
  p_provider text,
  p_total_cost numeric,
  p_next_service_mileage integer,
  p_next_service_date date,
  p_notes text,
  p_status text
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

  if not caller_is_fleetmaster_admin
     and (
       not public.is_organization_active(vehicle_organization_id)
       or not public.has_organization_role(
         vehicle_organization_id,
         array['client', 'manager']::public.organization_role[]
       )
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  if p_status not in (
    'open',
    'completed',
    'partially_completed',
    'follow_up_required',
    'not_repaired',
    'cancelled'
  ) then
    raise exception 'invalid maintenance status';
  end if;

  insert into public.maintenance_records (
    organization_id,
    vehicle_id,
    service_date,
    mileage,
    maintenance_type,
    description,
    provider,
    total_cost,
    next_service_mileage,
    next_service_date,
    notes,
    status
  )
  values (
    vehicle_organization_id,
    p_vehicle_id,
    p_service_date,
    p_mileage,
    p_maintenance_type,
    nullif(btrim(p_description), ''),
    nullif(btrim(p_provider), ''),
    p_total_cost,
    p_next_service_mileage,
    p_next_service_date,
    nullif(btrim(p_notes), ''),
    p_status
  )
  returning * into created_maintenance;

  return created_maintenance;
end;
$$;

revoke all on function public.create_maintenance_record(
  uuid,
  date,
  integer,
  text,
  text,
  text,
  numeric,
  integer,
  date,
  text,
  text
) from public, anon;

grant execute on function public.create_maintenance_record(
  uuid,
  date,
  integer,
  text,
  text,
  text,
  numeric,
  integer,
  date,
  text,
  text
) to authenticated;

revoke all on function public.close_maintenance_order(
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  date,
  text
) from anon;

grant execute on function public.close_maintenance_order(
  uuid,
  text,
  timestamptz,
  integer,
  integer,
  date,
  text
) to authenticated;

revoke execute on function public.prevent_maintenance_record_scope_change()
  from public, anon, authenticated;
