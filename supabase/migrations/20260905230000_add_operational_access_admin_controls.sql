create or replace function public.set_organization_operational_access(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason_code text,
  p_reason_note text default null
)
returns table (
  organization_id uuid,
  operational_access_manually_enabled boolean,
  operational_access_changed_at timestamptz,
  operational_access_changed_by uuid,
  operational_access_reason_code text,
  operational_access_reason_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_row public.organizations;
  normalized_reason_code text := nullif(btrim(coalesce(p_reason_code, '')), '');
  normalized_reason_note text := nullif(btrim(coalesce(p_reason_note, '')), '');
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_organization_id is null then
    raise exception 'organization is required';
  end if;

  if p_enabled is null then
    raise exception 'enabled is required';
  end if;

  if normalized_reason_code is null or normalized_reason_code not in (
    'manual', 'maintenance', 'administrative', 'security', 'payment', 'other'
  ) then
    raise exception 'invalid operational access reason';
  end if;

  if normalized_reason_note is not null and length(normalized_reason_note) > 1000 then
    raise exception 'operational access reason note is too long';
  end if;

  select o.*
    into organization_row
    from public.organizations o
   where o.id = p_organization_id
   for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if organization_row.operational_access_manually_enabled = p_enabled then
    return query
    select organization_row.id,
           organization_row.operational_access_manually_enabled,
           organization_row.operational_access_changed_at,
           organization_row.operational_access_changed_by,
           organization_row.operational_access_reason_code,
           organization_row.operational_access_reason_note;
    return;
  end if;

  update public.organizations o
     set operational_access_manually_enabled = p_enabled,
         operational_access_changed_at = now(),
         operational_access_changed_by = current_user_id,
         operational_access_reason_code = normalized_reason_code,
         operational_access_reason_note = normalized_reason_note,
         updated_at = now()
   where o.id = p_organization_id
   returning o.* into organization_row;

  insert into public.organization_operational_access_events (
    organization_id,
    enabled,
    changed_by,
    changed_at,
    reason_code,
    reason_note
  )
  values (
    organization_row.id,
    organization_row.operational_access_manually_enabled,
    current_user_id,
    organization_row.operational_access_changed_at,
    normalized_reason_code,
    normalized_reason_note
  );

  return query
  select organization_row.id,
         organization_row.operational_access_manually_enabled,
         organization_row.operational_access_changed_at,
         organization_row.operational_access_changed_by,
         organization_row.operational_access_reason_code,
         organization_row.operational_access_reason_note;
end;
$$;

revoke all on function public.set_organization_operational_access(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_organization_operational_access(uuid, boolean, text, text) to authenticated;

drop function public.get_my_organization_account();

create function public.get_my_organization_account()
returns table (
  organization_id uuid,
  organization_name text,
  role public.organization_role,
  status public.membership_status,
  display_name text,
  email text,
  membership_created_at timestamptz,
  seat_limit integer,
  seats_used integer,
  seats_available integer,
  operational_access_manually_enabled boolean,
  operational_access_enabled boolean,
  operational_access_changed_at timestamptz,
  operational_access_reason_code text,
  operational_access_reason_note text
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    m.role,
    m.status,
    p.display_name,
    lower(btrim(auth.jwt() ->> 'email')),
    m.created_at,
    o.seat_limit,
    public.organization_seats_used(o.id),
    greatest(o.seat_limit - public.organization_seats_used(o.id), 0),
    o.operational_access_manually_enabled,
    public.organization_has_operational_access(o.id),
    o.operational_access_changed_at,
    o.operational_access_reason_code,
    o.operational_access_reason_note
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.profiles p on p.id = m.user_id
  where auth.uid() is not null
    and m.user_id = auth.uid()
    and m.status = 'active'
    and o.status = 'active';
$$;

revoke all on function public.get_my_organization_account() from public, anon;
grant execute on function public.get_my_organization_account() to authenticated;

drop function public.get_organizations_for_admin();

create function public.get_organizations_for_admin()
returns table (
  id uuid,
  name text,
  status public.organization_status,
  seat_limit integer,
  seats_used integer,
  seats_available integer,
  created_at timestamptz,
  suspended_at timestamptz,
  operational_access_manually_enabled boolean,
  operational_access_changed_at timestamptz,
  operational_access_changed_by uuid,
  operational_access_reason_code text,
  operational_access_reason_note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  return query
  select
    o.id,
    o.name,
    o.status,
    o.seat_limit,
    public.organization_seats_used(o.id),
    greatest(o.seat_limit - public.organization_seats_used(o.id), 0),
    o.created_at,
    o.suspended_at,
    o.operational_access_manually_enabled,
    o.operational_access_changed_at,
    o.operational_access_changed_by,
    o.operational_access_reason_code,
    o.operational_access_reason_note
  from public.organizations o
  order by o.created_at desc, o.name asc;
end;
$$;

revoke all on function public.get_organizations_for_admin() from public, anon;
grant execute on function public.get_organizations_for_admin() to authenticated;

drop function public.get_organization_for_admin(uuid);

create function public.get_organization_for_admin(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  status public.organization_status,
  seat_limit integer,
  seats_used integer,
  seats_available integer,
  created_at timestamptz,
  suspended_at timestamptz,
  operational_access_manually_enabled boolean,
  operational_access_changed_at timestamptz,
  operational_access_changed_by uuid,
  operational_access_reason_code text,
  operational_access_reason_note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  return query
  select
    o.id,
    o.name,
    o.status,
    o.seat_limit,
    public.organization_seats_used(o.id),
    greatest(o.seat_limit - public.organization_seats_used(o.id), 0),
    o.created_at,
    o.suspended_at,
    o.operational_access_manually_enabled,
    o.operational_access_changed_at,
    o.operational_access_changed_by,
    o.operational_access_reason_code,
    o.operational_access_reason_note
  from public.organizations o
  where o.id = p_organization_id;
end;
$$;

revoke all on function public.get_organization_for_admin(uuid) from public, anon;
grant execute on function public.get_organization_for_admin(uuid) to authenticated;
