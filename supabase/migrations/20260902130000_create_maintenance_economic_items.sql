create table public.maintenance_parts (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenance_records(id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text,
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maintenance_cost_items (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenance_records(id) on delete cascade,
  kind text not null check (kind in ('labor', 'other')),
  description text not null check (length(btrim(description)) > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_parts_maintenance_order_idx
  on public.maintenance_parts (maintenance_id, sort_order asc, created_at asc);

create index maintenance_cost_items_maintenance_order_idx
  on public.maintenance_cost_items (maintenance_id, sort_order asc, created_at asc);

create trigger set_maintenance_parts_updated_at
before update on public.maintenance_parts
for each row
execute function public.set_vehicles_updated_at();

create trigger set_maintenance_cost_items_updated_at
before update on public.maintenance_cost_items
for each row
execute function public.set_vehicles_updated_at();

alter table public.maintenance_parts enable row level security;
alter table public.maintenance_cost_items enable row level security;

create policy maintenance_parts_select_policy on public.maintenance_parts for select to anon, authenticated using (true);
create policy maintenance_parts_insert_policy on public.maintenance_parts for insert to anon, authenticated with check (true);
create policy maintenance_parts_update_policy on public.maintenance_parts for update to anon, authenticated using (true) with check (true);
create policy maintenance_parts_delete_policy on public.maintenance_parts for delete to anon, authenticated using (true);

create policy maintenance_cost_items_select_policy on public.maintenance_cost_items for select to anon, authenticated using (true);
create policy maintenance_cost_items_insert_policy on public.maintenance_cost_items for insert to anon, authenticated with check (true);
create policy maintenance_cost_items_update_policy on public.maintenance_cost_items for update to anon, authenticated using (true) with check (true);
create policy maintenance_cost_items_delete_policy on public.maintenance_cost_items for delete to anon, authenticated using (true);
