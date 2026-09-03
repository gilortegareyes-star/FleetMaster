create table public.maintenance_work_items (
  id uuid primary key default gen_random_uuid(),
  maintenance_id uuid not null references public.maintenance_records(id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),
  notes text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index maintenance_work_items_maintenance_order_idx
  on public.maintenance_work_items (maintenance_id, sort_order asc, created_at asc);

create trigger set_maintenance_work_items_updated_at
before update on public.maintenance_work_items
for each row
execute function public.set_vehicles_updated_at();

alter table public.maintenance_work_items enable row level security;

comment on table public.maintenance_work_items is
  'Structured work performed for a maintenance record. The maintenance description remains the general summary.';

create policy maintenance_work_items_select_policy
  on public.maintenance_work_items
  for select
  to anon, authenticated
  using (true);

create policy maintenance_work_items_insert_policy
  on public.maintenance_work_items
  for insert
  to anon, authenticated
  with check (true);

create policy maintenance_work_items_update_policy
  on public.maintenance_work_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy maintenance_work_items_delete_policy
  on public.maintenance_work_items
  for delete
  to anon, authenticated
  using (true);
