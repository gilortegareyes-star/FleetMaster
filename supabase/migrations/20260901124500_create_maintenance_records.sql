create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  service_date date not null,
  mileage integer not null check (mileage >= 0),
  maintenance_type text not null check (
    length(btrim(maintenance_type)) > 0
    and maintenance_type in (
      'Servicio preventivo',
      'Cambio de aceite',
      'Filtros',
      'Frenos',
      'Suspensión',
      'Dirección',
      'Sistema eléctrico',
      'Motor',
      'Transmisión',
      'Sistema de enfriamiento',
      'Aire acondicionado',
      'Llantas',
      'Alineación y balanceo',
      'Batería',
      'Reparación',
      'Diagnóstico',
      'Otro'
    )
  ),
  description text not null check (length(btrim(description)) > 0),
  provider text,
  total_cost numeric(12, 2) check (total_cost is null or total_cost >= 0),
  next_service_mileage integer check (next_service_mileage is null or next_service_mileage >= 0),
  next_service_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_records_vehicle_id_idx
  on public.maintenance_records (vehicle_id);

create index if not exists maintenance_records_service_date_idx
  on public.maintenance_records (service_date);

create index if not exists maintenance_records_vehicle_service_date_idx
  on public.maintenance_records (vehicle_id, service_date desc, created_at desc);

create or replace function public.update_vehicle_mileage_from_maintenance()
returns trigger
language plpgsql
as $$
begin
  update public.vehicles
  set current_mileage = greatest(current_mileage, new.mileage)
  where id = new.vehicle_id
    and new.mileage > current_mileage;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_maintenance_records_updated_at'
      and tgrelid = 'public.maintenance_records'::regclass
  ) then
    create trigger set_maintenance_records_updated_at
    before update on public.maintenance_records
    for each row
    execute function public.set_vehicles_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'sync_vehicle_mileage_from_maintenance'
      and tgrelid = 'public.maintenance_records'::regclass
  ) then
    create trigger sync_vehicle_mileage_from_maintenance
    after insert or update of vehicle_id, mileage on public.maintenance_records
    for each row
    execute function public.update_vehicle_mileage_from_maintenance();
  end if;
end;
$$;

alter table public.maintenance_records enable row level security;

comment on table public.maintenance_records is
  'FleetMaster II maintenance history. Temporary RLS policies below allow anon select, insert and update while authentication is not implemented. No anon delete policy is created.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'maintenance_records_select_policy'
  ) then
    create policy maintenance_records_select_policy
      on public.maintenance_records
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'maintenance_records_insert_policy'
  ) then
    create policy maintenance_records_insert_policy
      on public.maintenance_records
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'maintenance_records_update_policy'
  ) then
    create policy maintenance_records_update_policy
      on public.maintenance_records
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;
