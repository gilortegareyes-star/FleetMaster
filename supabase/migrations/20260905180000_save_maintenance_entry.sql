-- Save only the intake portion of an open maintenance order.

create or replace function public.save_maintenance_entry(
  p_maintenance_id uuid,
  p_entry_at timestamptz,
  p_entry_mileage integer,
  p_provider_id uuid,
  p_fuel_level text,
  p_conditions text[],
  p_observations text
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
  negative_conditions text[] := array[
    'warning_lights',
    'exterior_damage',
    'visible_leak',
    'abnormal_noise'
  ];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_maintenance_id::text));

  select m.organization_id, m.provider_id
  into maintenance_organization_id, current_provider_id
  from public.maintenance_records m
  where m.id = p_maintenance_id
    and m.status = 'open';

  if maintenance_organization_id is null then
    raise exception 'maintenance record not found, unavailable, or closed';
  end if;

  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();

  if not caller_is_fleetmaster_admin
     and (
       not public.is_organization_active(maintenance_organization_id)
       or not public.has_organization_role(
         maintenance_organization_id,
         array['client', 'manager']::public.organization_role[]
       )
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  if not caller_is_fleetmaster_admin
     and current_provider_id is not null
     and not public.has_organization_role(
       maintenance_organization_id,
       array['manager']::public.organization_role[]
     ) then
    raise exception 'maintenance entry update requires manager permissions';
  end if;

  if p_entry_at is null then
    raise exception 'entry timestamp is required';
  end if;

  if p_entry_mileage is null or p_entry_mileage < 0 then
    raise exception 'entry mileage is invalid';
  end if;

  if p_provider_id is null then
    raise exception 'maintenance provider is required';
  end if;

  if current_provider_id is distinct from p_provider_id then
    if not exists (
      select 1
      from public.maintenance_providers p
      where p.id = p_provider_id
        and p.organization_id = maintenance_organization_id
        and p.is_active
    ) then
      raise exception 'maintenance provider is unavailable';
    end if;
  elsif not exists (
    select 1
    from public.maintenance_providers p
    where p.id = p_provider_id
      and p.organization_id = maintenance_organization_id
  ) then
    raise exception 'maintenance provider is unavailable';
  end if;

  if p_fuel_level not in ('empty', 'quarter', 'half', 'three_quarters', 'full') then
    raise exception 'maintenance fuel level is invalid';
  end if;

  if p_conditions is null or cardinality(p_conditions) = 0 then
    raise exception 'maintenance entry conditions are required';
  end if;

  if exists (
    select 1
    from unnest(p_conditions) condition
    where condition not in (
      'no_apparent_damage',
      'warning_lights',
      'exterior_damage',
      'visible_leak',
      'abnormal_noise',
      'other'
    )
  ) then
    raise exception 'maintenance entry condition is invalid';
  end if;

  if 'no_apparent_damage' = any (p_conditions)
     and p_conditions && negative_conditions then
    raise exception 'no apparent damage cannot be combined with negative conditions';
  end if;

  normalized_observations := nullif(btrim(coalesce(p_observations, '')), '');
  if 'other' = any (p_conditions) and normalized_observations is null then
    raise exception 'observations are required for other condition';
  end if;

  select *
  into existing_report
  from public.maintenance_reports r
  where r.maintenance_id = p_maintenance_id;

  merged_conditions := jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(existing_report.reception_conditions, '{}'::jsonb),
        '{fuelLevel}',
        to_jsonb(p_fuel_level),
        true
      ),
      '{conditions}',
      to_jsonb(p_conditions),
      true
    ),
    '{observations}',
    case when normalized_observations is null then 'null'::jsonb else to_jsonb(normalized_observations) end,
    true
  );

  update public.maintenance_records
  set
    provider_id = p_provider_id,
    provider = (
      select p.name
      from public.maintenance_providers p
      where p.id = p_provider_id
        and p.organization_id = maintenance_organization_id
    )
  where id = p_maintenance_id;

  if existing_report.maintenance_id is not null then
    update public.maintenance_reports
    set
      entry_at = p_entry_at,
      entry_mileage = p_entry_mileage,
      reception_conditions = merged_conditions
    where maintenance_id = p_maintenance_id
    returning * into existing_report;
  else
    insert into public.maintenance_reports (
      organization_id,
      maintenance_id,
      entry_at,
      entry_mileage,
      reception_conditions
    )
    values (
      maintenance_organization_id,
      p_maintenance_id,
      p_entry_at,
      p_entry_mileage,
      merged_conditions
    )
    returning * into existing_report;
  end if;

  return existing_report;
end;
$$;

revoke all on function public.save_maintenance_entry(
  uuid,
  timestamptz,
  integer,
  uuid,
  text,
  text[],
  text
) from public, anon;

grant execute on function public.save_maintenance_entry(
  uuid,
  timestamptz,
  integer,
  uuid,
  text,
  text[],
  text
) to authenticated;
