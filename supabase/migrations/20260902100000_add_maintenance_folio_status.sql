create table if not exists public.maintenance_folio_counters (
  year integer primary key check (year between 2000 and 9999),
  last_value integer not null check (last_value >= 0)
);

alter table public.maintenance_folio_counters enable row level security;

revoke all on table public.maintenance_folio_counters from anon, authenticated;

alter table public.maintenance_records
  add column if not exists folio text,
  add column if not exists status text not null default 'completed',
  add column if not exists closed_at timestamptz;

update public.maintenance_records
set status = 'completed'
where status is null;

alter table public.maintenance_records
  add constraint maintenance_records_status_check
  check (
    status in (
      'open',
      'completed',
      'partially_completed',
      'follow_up_required',
      'not_repaired',
      'cancelled'
    )
  );

with historical_folios as (
  select
    id,
    extract(year from created_at at time zone 'UTC')::integer as creation_year,
    row_number() over (
      partition by extract(year from created_at at time zone 'UTC')::integer
      order by created_at asc, id asc
    ) as sequence_number
  from public.maintenance_records
  where folio is null
)
update public.maintenance_records as maintenance
set folio = format(
  'OM-%s-%s',
  historical_folios.creation_year,
  lpad(historical_folios.sequence_number::text, 4, '0')
)
from historical_folios
where maintenance.id = historical_folios.id;

alter table public.maintenance_records
  alter column folio set not null,
  add constraint maintenance_records_folio_key unique (folio);

insert into public.maintenance_folio_counters (year, last_value)
select
  extract(year from created_at at time zone 'UTC')::integer,
  count(*)::integer
from public.maintenance_records
group by extract(year from created_at at time zone 'UTC')::integer
on conflict (year) do update
set last_value = greatest(
  public.maintenance_folio_counters.last_value,
  excluded.last_value
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

  if new.status = 'completed' and new.closed_at is null then
    new.closed_at = new.created_at;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_maintenance_folio_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.folio is distinct from old.folio then
    raise exception 'maintenance folio cannot be changed';
  end if;

  return new;
end;
$$;

create trigger assign_maintenance_folio_on_insert
before insert on public.maintenance_records
for each row
execute function public.assign_maintenance_folio_on_insert();

create trigger prevent_maintenance_folio_update
before update of folio on public.maintenance_records
for each row
execute function public.prevent_maintenance_folio_update();

comment on table public.maintenance_folio_counters is
  'Internal yearly counter for atomically assigning immutable maintenance folios. Client roles have no access.';

comment on column public.maintenance_records.folio is
  'Immutable human-readable maintenance folio assigned at insert using the maintenance creation year.';

comment on column public.maintenance_records.status is
  'Maintenance lifecycle outcome. Current form creates completed historical-service records.';

comment on column public.maintenance_records.closed_at is
  'Closing timestamp. Historical records remain null because their original close time is unknown.';
