alter table public.vehicles
  add column if not exists state_license_plate text,
  add column if not exists federal_license_plate text,
  add column if not exists vehicle_type text,
  add column if not exists fuel_types text[],
  add column if not exists transmission_type text,
  add column if not exists load_capacity_kg integer;

update public.vehicles
set state_license_plate = nullif(btrim(license_plate), '')
where nullif(btrim(state_license_plate), '') is null
  and nullif(btrim(license_plate), '') is not null;

update public.vehicles
set fuel_types = array[fuel_type]
where fuel_types is null
  and fuel_type in ('Gasolina', 'Diésel', 'Eléctrico', 'Gas LP', 'Gas Natural');

alter table public.vehicles
  alter column fuel_type drop not null;

alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles
  add constraint vehicles_status_check check (
    status in (
      'Activo',
      'Inactivo',
      'En mantenimiento',
      'Fuera de servicio',
      'Vendido',
      'Baja'
    )
  );

alter table public.vehicles
  add constraint vehicles_load_capacity_kg_check
  check (load_capacity_kg is null or load_capacity_kg >= 0);

comment on column public.vehicles.license_plate is
  'Legacy compatibility column. New records use state_license_plate and federal_license_plate.';

comment on column public.vehicles.fuel_type is
  'Legacy compatibility column. New records use fuel_types.';
