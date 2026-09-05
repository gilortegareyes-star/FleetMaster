-- Restrict vehicle access to authenticated users in an active tenant.

create or replace function public.prevent_vehicle_organization_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'vehicle organization cannot be changed';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_vehicle_organization_change'
      and tgrelid = 'public.vehicles'::regclass
  ) then
    create trigger prevent_vehicle_organization_change
      before update on public.vehicles
      for each row
      execute function public.prevent_vehicle_organization_change();
  end if;
end;
$$;

drop policy if exists vehicles_select_policy on public.vehicles;
drop policy if exists vehicles_insert_policy on public.vehicles;
drop policy if exists vehicles_update_policy on public.vehicles;

revoke all on table public.vehicles from anon, authenticated;
grant select, insert, update on table public.vehicles to authenticated;

create policy vehicles_admin_select_policy
  on public.vehicles
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy vehicles_member_select_policy
  on public.vehicles
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy vehicles_admin_insert_policy
  on public.vehicles
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy vehicles_member_insert_policy
  on public.vehicles
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy vehicles_admin_update_policy
  on public.vehicles
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy vehicles_manager_update_policy
  on public.vehicles
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );
