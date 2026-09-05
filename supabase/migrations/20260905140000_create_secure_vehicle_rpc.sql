-- Create vehicles through a tenant-aware RPC and remove direct table inserts.

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

    select o.id
    into resolved_organization_id
    from public.organizations o
    where o.id = p_organization_id
      and o.status = 'active';

    if resolved_organization_id is null then
      raise exception 'organization not found or inactive';
    end if;
  else
    if p_organization_id is not null then
      raise exception 'organization context is not allowed for this user';
    end if;

    select m.organization_id
    into resolved_organization_id
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = caller_id
      and m.status = 'active'
      and m.role in ('manager', 'client')
      and o.status = 'active'
    limit 1;

    if resolved_organization_id is null then
      raise exception 'active organization membership required';
    end if;
  end if;

  insert into public.vehicles (
    organization_id,
    internal_code,
    brand,
    model,
    version,
    year,
    vin,
    license_plate,
    engine_number,
    color,
    fuel_type,
    fuel_types,
    state_license_plate,
    federal_license_plate,
    vehicle_type,
    transmission_type,
    load_capacity_kg,
    tank_capacity_liters,
    acquisition_date,
    acquisition_price,
    current_mileage,
    status
  )
  values (
    resolved_organization_id,
    p_internal_code,
    p_brand,
    p_model,
    p_version,
    p_year,
    p_vin,
    p_license_plate,
    p_engine_number,
    p_color,
    p_fuel_type,
    p_fuel_types,
    p_state_license_plate,
    p_federal_license_plate,
    p_vehicle_type,
    p_transmission_type,
    p_load_capacity_kg,
    p_tank_capacity_liters,
    p_acquisition_date,
    p_acquisition_price,
    p_current_mileage,
    p_status
  )
  returning * into created_vehicle;

  return created_vehicle;
end;
$$;

revoke all on function public.create_vehicle(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  integer,
  numeric,
  date,
  numeric,
  integer,
  text
) from public, anon;

grant execute on function public.create_vehicle(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  text,
  integer,
  numeric,
  date,
  numeric,
  integer,
  text
) to authenticated;

revoke insert on table public.vehicles from authenticated;
