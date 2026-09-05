-- Add tenant-aware maintenance providers without changing legacy provider snapshots.

create table public.maintenance_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  type text not null check (type in ('agency', 'workshop', 'tire_shop', 'specialist', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index maintenance_providers_organization_name_idx
  on public.maintenance_providers (organization_id, lower(btrim(name)));

create index maintenance_providers_organization_id_idx
  on public.maintenance_providers (organization_id);

create or replace function public.prevent_maintenance_provider_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'maintenance provider ownership cannot be changed';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_maintenance_providers_updated_at'
      and tgrelid = 'public.maintenance_providers'::regclass
  ) then
    create trigger set_maintenance_providers_updated_at
      before update on public.maintenance_providers
      for each row
      execute function public.set_vehicles_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_maintenance_provider_scope_change'
      and tgrelid = 'public.maintenance_providers'::regclass
  ) then
    create trigger prevent_maintenance_provider_scope_change
      before update on public.maintenance_providers
      for each row
      execute function public.prevent_maintenance_provider_scope_change();
  end if;
end;
$$;

alter table public.maintenance_records
  add column provider_id uuid,
  add constraint maintenance_records_provider_organization_fkey
    foreign key (provider_id, organization_id)
    references public.maintenance_providers(id, organization_id)
    on delete restrict;

create index maintenance_records_provider_id_idx
  on public.maintenance_records (provider_id);

alter table public.maintenance_providers enable row level security;

revoke all on table public.maintenance_providers from public, anon, authenticated;
grant select, insert, update on table public.maintenance_providers to authenticated;

create policy maintenance_providers_admin_select_policy
  on public.maintenance_providers
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_providers_manager_select_policy
  on public.maintenance_providers
  for select
  to authenticated
  using (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

create policy maintenance_providers_member_select_policy
  on public.maintenance_providers
  for select
  to authenticated
  using (
    is_active
    and public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_providers_admin_insert_policy
  on public.maintenance_providers
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_providers_manager_insert_policy
  on public.maintenance_providers
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

create policy maintenance_providers_admin_update_policy
  on public.maintenance_providers
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy maintenance_providers_manager_update_policy
  on public.maintenance_providers
  for update
  to authenticated
  using (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  )
  with check (
    public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

revoke execute on function public.prevent_maintenance_provider_scope_change()
  from public, anon, authenticated;
