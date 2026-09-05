-- Isolate economic maintenance items by organization and preserve their history.

create or replace function public.derive_maintenance_part_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select m.organization_id
  into new.organization_id
  from public.maintenance_records m
  where m.id = new.maintenance_id;

  if new.organization_id is null then
    raise exception 'maintenance record not found or unavailable';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_maintenance_part_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.maintenance_id is distinct from old.maintenance_id then
    raise exception 'maintenance part ownership cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.derive_maintenance_cost_item_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select m.organization_id
  into new.organization_id
  from public.maintenance_records m
  where m.id = new.maintenance_id;

  if new.organization_id is null then
    raise exception 'maintenance record not found or unavailable';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_maintenance_cost_item_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.maintenance_id is distinct from old.maintenance_id then
    raise exception 'maintenance cost item ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists derive_maintenance_part_organization on public.maintenance_parts;
create trigger derive_maintenance_part_organization
before insert on public.maintenance_parts
for each row
execute function public.derive_maintenance_part_organization();

drop trigger if exists prevent_maintenance_part_scope_change on public.maintenance_parts;
create trigger prevent_maintenance_part_scope_change
before update on public.maintenance_parts
for each row
execute function public.prevent_maintenance_part_scope_change();

drop trigger if exists derive_maintenance_cost_item_organization on public.maintenance_cost_items;
create trigger derive_maintenance_cost_item_organization
before insert on public.maintenance_cost_items
for each row
execute function public.derive_maintenance_cost_item_organization();

drop trigger if exists prevent_maintenance_cost_item_scope_change on public.maintenance_cost_items;
create trigger prevent_maintenance_cost_item_scope_change
before update on public.maintenance_cost_items
for each row
execute function public.prevent_maintenance_cost_item_scope_change();

drop policy if exists maintenance_parts_select_policy on public.maintenance_parts;
drop policy if exists maintenance_parts_insert_policy on public.maintenance_parts;
drop policy if exists maintenance_parts_update_policy on public.maintenance_parts;
drop policy if exists maintenance_parts_delete_policy on public.maintenance_parts;

revoke all on table public.maintenance_parts from public, anon, authenticated;
grant select, insert, update on table public.maintenance_parts to authenticated;

create policy maintenance_parts_admin_select_policy
  on public.maintenance_parts
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_parts_member_select_policy
  on public.maintenance_parts
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_parts_admin_insert_policy
  on public.maintenance_parts
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_parts_member_insert_policy
  on public.maintenance_parts
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy maintenance_parts_admin_update_policy
  on public.maintenance_parts
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy maintenance_parts_manager_update_policy
  on public.maintenance_parts
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

drop policy if exists maintenance_cost_items_select_policy on public.maintenance_cost_items;
drop policy if exists maintenance_cost_items_insert_policy on public.maintenance_cost_items;
drop policy if exists maintenance_cost_items_update_policy on public.maintenance_cost_items;
drop policy if exists maintenance_cost_items_delete_policy on public.maintenance_cost_items;

revoke all on table public.maintenance_cost_items from public, anon, authenticated;
grant select, insert, update on table public.maintenance_cost_items to authenticated;

create policy maintenance_cost_items_admin_select_policy
  on public.maintenance_cost_items
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_cost_items_member_select_policy
  on public.maintenance_cost_items
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_cost_items_admin_insert_policy
  on public.maintenance_cost_items
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_cost_items_member_insert_policy
  on public.maintenance_cost_items
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy maintenance_cost_items_admin_update_policy
  on public.maintenance_cost_items
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy maintenance_cost_items_manager_update_policy
  on public.maintenance_cost_items
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

revoke execute on function public.derive_maintenance_part_organization() from public, anon, authenticated;
revoke execute on function public.prevent_maintenance_part_scope_change() from public, anon, authenticated;
revoke execute on function public.derive_maintenance_cost_item_organization() from public, anon, authenticated;
revoke execute on function public.prevent_maintenance_cost_item_scope_change() from public, anon, authenticated;
