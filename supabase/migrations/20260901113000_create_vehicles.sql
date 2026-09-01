create extension if not exists "pgcrypto";

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null check (length(btrim(internal_code)) > 0),
  brand text not null check (length(btrim(brand)) > 0),
  model text not null check (length(btrim(model)) > 0),
  version text,
  year integer not null check (year between 1950 and 2100),
  vin text not null check (length(btrim(vin)) > 0),
  license_plate text,
  engine_number text,
  color text,
  fuel_type text not null check (
    fuel_type in (
      'Gasolina',
      'Diésel',
      'Híbrido',
      'Híbrido enchufable',
      'Eléctrico',
      'Otro'
    )
  ),
  tank_capacity_liters numeric(8, 2) check (tank_capacity_liters is null or tank_capacity_liters >= 0),
  acquisition_date date,
  acquisition_price numeric(12, 2) check (acquisition_price is null or acquisition_price >= 0),
  current_mileage integer not null check (current_mileage >= 0),
  status text not null check (
    status in (
      'Activo',
      'En mantenimiento',
      'Fuera de servicio',
      'Vendido',
      'Baja'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_internal_code_unique_idx
  on public.vehicles (lower(btrim(internal_code)));

create unique index if not exists vehicles_vin_unique_idx
  on public.vehicles (lower(btrim(vin)));

create or replace function public.set_vehicles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_vehicles_updated_at'
      and tgrelid = 'public.vehicles'::regclass
  ) then
    create trigger set_vehicles_updated_at
    before update on public.vehicles
    for each row
    execute function public.set_vehicles_updated_at();
  end if;
end;
$$;

alter table public.vehicles enable row level security;

comment on table public.vehicles is
  'FleetMaster II units. Temporary RLS policies below allow anon read, insert and update while authentication is not implemented. Replace with authenticated policies before production use.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicles'
      and policyname = 'vehicles_select_policy'
  ) then
    create policy vehicles_select_policy
      on public.vehicles
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicles'
      and policyname = 'vehicles_insert_policy'
  ) then
    create policy vehicles_insert_policy
      on public.vehicles
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicles'
      and policyname = 'vehicles_update_policy'
  ) then
    create policy vehicles_update_policy
      on public.vehicles
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;
