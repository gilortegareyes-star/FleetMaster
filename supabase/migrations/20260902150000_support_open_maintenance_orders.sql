alter table public.maintenance_records
  alter column mileage drop not null;

update public.maintenance_records
set closed_at = created_at
where status in (
  'completed',
  'partially_completed',
  'follow_up_required',
  'not_repaired',
  'cancelled'
)
and closed_at is null;

alter table public.maintenance_records
  add constraint maintenance_records_status_mileage_check
  check (
    status in ('open', 'cancelled')
    or mileage is not null
  ),
  add constraint maintenance_records_status_closed_at_check
  check (
    (status = 'open' and closed_at is null)
    or (status <> 'open' and closed_at is not null)
  );

create or replace function public.assign_maintenance_folio_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creation_year integer;
  sequence_number integer;
begin
  if new.created_at is null then
    new.created_at = now();
  end if;

  creation_year := extract(year from new.created_at at time zone 'UTC')::integer;

  insert into public.maintenance_folio_counters (year, last_value)
  values (creation_year, 1)
  on conflict (year) do update
  set last_value = public.maintenance_folio_counters.last_value + 1
  returning last_value into sequence_number;

  new.folio := format('OM-%s-%s', creation_year, lpad(sequence_number::text, 4, '0'));

  return new;
end;
$$;

create or replace function public.sync_maintenance_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'open' then
    new.closed_at = null;
  elsif new.closed_at is null then
    new.closed_at = coalesce(new.created_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_maintenance_records_closed_at on public.maintenance_records;

create trigger set_maintenance_records_closed_at
before insert or update of status on public.maintenance_records
for each row
execute function public.sync_maintenance_closed_at();

create or replace function public.update_vehicle_mileage_from_maintenance()
returns trigger
language plpgsql
as $$
begin
  if new.status in (
    'completed',
    'partially_completed',
    'follow_up_required',
    'not_repaired'
  ) and new.mileage is not null then
    update public.vehicles
    set current_mileage = greatest(current_mileage, new.mileage)
    where id = new.vehicle_id
      and new.mileage > current_mileage;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_vehicle_mileage_from_maintenance on public.maintenance_records;

create trigger sync_vehicle_mileage_from_maintenance
after insert or update of vehicle_id, mileage, status on public.maintenance_records
for each row
execute function public.update_vehicle_mileage_from_maintenance();

comment on column public.maintenance_records.mileage is
  'Final service or exit mileage. It remains null while a maintenance order is open.';

comment on column public.maintenance_records.closed_at is
  'Null for open orders and set for every terminal maintenance status.';
