create table public.maintenance_work_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  is_active boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index maintenance_work_catalog_name_normalized_key
  on public.maintenance_work_catalog (lower(btrim(name)));

alter table public.maintenance_work_items
  add column catalog_item_id uuid references public.maintenance_work_catalog(id) on delete set null;

create index maintenance_work_items_catalog_item_id_idx on public.maintenance_work_items (catalog_item_id);

create trigger set_maintenance_work_catalog_updated_at before update on public.maintenance_work_catalog for each row execute function public.set_vehicles_updated_at();

create or replace function public.sync_maintenance_work_catalog_usage()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.catalog_item_id is not null then
    update maintenance_work_catalog set usage_count = usage_count + 1 where id = new.catalog_item_id;
  elsif tg_op = 'DELETE' and old.catalog_item_id is not null then
    update maintenance_work_catalog set usage_count = greatest(usage_count - 1, 0) where id = old.catalog_item_id;
  elsif tg_op = 'UPDATE' and new.catalog_item_id is distinct from old.catalog_item_id then
    if old.catalog_item_id is not null then update maintenance_work_catalog set usage_count = greatest(usage_count - 1, 0) where id = old.catalog_item_id; end if;
    if new.catalog_item_id is not null then update maintenance_work_catalog set usage_count = usage_count + 1 where id = new.catalog_item_id; end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger sync_maintenance_work_catalog_usage_after_change
after insert or update of catalog_item_id or delete on public.maintenance_work_items
for each row execute function public.sync_maintenance_work_catalog_usage();

alter table public.maintenance_work_catalog enable row level security;
create policy maintenance_work_catalog_select_policy on public.maintenance_work_catalog for select to anon, authenticated using (true);
create policy maintenance_work_catalog_insert_policy on public.maintenance_work_catalog for insert to anon, authenticated with check (true);
create policy maintenance_work_catalog_update_policy on public.maintenance_work_catalog for update to anon, authenticated using (true) with check (true);

insert into public.maintenance_work_catalog (name) values
('Cambio de aceite de motor'),('Cambio de filtro de aceite'),('Cambio de filtro de aire'),('Cambio de filtro de combustible'),('Revisión de niveles'),('Revisión y limpieza de frenos'),('Cambio de balatas delanteras'),('Cambio de balatas traseras'),('Rotación de llantas'),('Alineación'),('Balanceo'),('Revisión de suspensión'),('Revisión de dirección'),('Revisión de batería'),('Cambio de batería'),('Revisión de luces'),('Escaneo / diagnóstico'),('Revisión de sistema de enfriamiento'),('Cambio de anticongelante'),('Revisión de bandas')
on conflict (lower(btrim(name))) do nothing;
