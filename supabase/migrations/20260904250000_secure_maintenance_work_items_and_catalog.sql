-- Isolate work items by organization and keep the work catalog global/read-only for tenants.

create or replace function public.derive_maintenance_work_item_organization()
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

create or replace function public.prevent_maintenance_work_item_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.maintenance_id is distinct from old.maintenance_id then
    raise exception 'maintenance work item ownership cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists derive_maintenance_work_item_organization on public.maintenance_work_items;
create trigger derive_maintenance_work_item_organization
before insert on public.maintenance_work_items
for each row
execute function public.derive_maintenance_work_item_organization();

drop trigger if exists prevent_maintenance_work_item_scope_change on public.maintenance_work_items;
create trigger prevent_maintenance_work_item_scope_change
before update on public.maintenance_work_items
for each row
execute function public.prevent_maintenance_work_item_scope_change();

drop policy if exists maintenance_work_items_select_policy on public.maintenance_work_items;
drop policy if exists maintenance_work_items_insert_policy on public.maintenance_work_items;
drop policy if exists maintenance_work_items_update_policy on public.maintenance_work_items;
drop policy if exists maintenance_work_items_delete_policy on public.maintenance_work_items;

revoke all on table public.maintenance_work_items from public, anon, authenticated;
grant select, insert, update on table public.maintenance_work_items to authenticated;

create policy maintenance_work_items_admin_select_policy
  on public.maintenance_work_items
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_work_items_member_select_policy
  on public.maintenance_work_items
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_work_items_admin_insert_policy
  on public.maintenance_work_items
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_work_items_member_insert_policy
  on public.maintenance_work_items
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy maintenance_work_items_admin_update_policy
  on public.maintenance_work_items
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy maintenance_work_items_manager_update_policy
  on public.maintenance_work_items
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

create or replace function public.sync_maintenance_work_catalog_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.catalog_item_id is not null then
    update public.maintenance_work_catalog
    set usage_count = usage_count + 1
    where id = new.catalog_item_id;
  elsif tg_op = 'DELETE' and old.catalog_item_id is not null then
    update public.maintenance_work_catalog
    set usage_count = greatest(usage_count - 1, 0)
    where id = old.catalog_item_id;
  elsif tg_op = 'UPDATE' and new.catalog_item_id is distinct from old.catalog_item_id then
    if old.catalog_item_id is not null then
      update public.maintenance_work_catalog
      set usage_count = greatest(usage_count - 1, 0)
      where id = old.catalog_item_id;
    end if;
    if new.catalog_item_id is not null then
      update public.maintenance_work_catalog
      set usage_count = usage_count + 1
      where id = new.catalog_item_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop policy if exists maintenance_work_catalog_select_policy on public.maintenance_work_catalog;
drop policy if exists maintenance_work_catalog_insert_policy on public.maintenance_work_catalog;
drop policy if exists maintenance_work_catalog_update_policy on public.maintenance_work_catalog;

revoke all on table public.maintenance_work_catalog from public, anon, authenticated;
grant select, insert, update on table public.maintenance_work_catalog to authenticated;

create policy maintenance_work_catalog_select_policy
  on public.maintenance_work_catalog
  for select
  to authenticated
  using (true);

create policy maintenance_work_catalog_admin_insert_policy
  on public.maintenance_work_catalog
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_work_catalog_admin_update_policy
  on public.maintenance_work_catalog
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

revoke execute on function public.derive_maintenance_work_item_organization() from public, anon, authenticated;
revoke execute on function public.prevent_maintenance_work_item_scope_change() from public, anon, authenticated;
revoke execute on function public.sync_maintenance_work_catalog_usage() from public, anon, authenticated;
