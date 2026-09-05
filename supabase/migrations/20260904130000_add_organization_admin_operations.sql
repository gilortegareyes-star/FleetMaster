create or replace function public.organization_seats_used(p_organization_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.organization_memberships where organization_id = p_organization_id and status = 'active')
    +
    (select count(*) from public.organization_invitations where organization_id = p_organization_id and status = 'pending' and expires_at > now())
  )::integer;
$$;

create or replace function public.organization_has_available_seat(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and status = 'active'
      and seat_limit > public.organization_seats_used(id)
  );
$$;

revoke all on function public.organization_seats_used(uuid) from public, anon, authenticated;
revoke all on function public.organization_has_available_seat(uuid) from public, anon, authenticated;

revoke select on table public.organizations from authenticated;

create or replace function public.get_organizations_for_admin()
returns table (
  id uuid,
  name text,
  status public.organization_status,
  seat_limit integer,
  seats_used integer,
  seats_available integer,
  created_at timestamptz,
  suspended_at timestamptz
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
    o.suspended_at
  from public.organizations o
  order by o.created_at desc, o.name asc;
end;
$$;

create or replace function public.get_organization_for_admin(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  status public.organization_status,
  seat_limit integer,
  seats_used integer,
  seats_available integer,
  created_at timestamptz,
  suspended_at timestamptz
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
    o.suspended_at
  from public.organizations o
  where o.id = p_organization_id;
end;
$$;

create or replace function public.create_organization(
  p_name text,
  p_seat_limit integer
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_organization public.organizations;
  normalized_name text := btrim(p_name);
begin
  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_name is null or normalized_name = '' then
    raise exception 'organization name is required';
  end if;

  if p_seat_limit is null or p_seat_limit <= 0 then
    raise exception 'organization seat limit must be greater than zero';
  end if;

  insert into public.organizations (name, seat_limit, status, suspended_at)
  values (normalized_name, p_seat_limit, 'active', null)
  returning * into created_organization;

  return created_organization;
end;
$$;

create or replace function public.update_organization(
  p_organization_id uuid,
  p_name text,
  p_seat_limit integer
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_row public.organizations;
  normalized_name text := btrim(p_name);
  used_seats integer;
begin
  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_name is null or normalized_name = '' then
    raise exception 'organization name is required';
  end if;

  if p_seat_limit is null or p_seat_limit <= 0 then
    raise exception 'organization seat limit must be greater than zero';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  select * into organization_row
  from public.organizations
  where id = p_organization_id
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  used_seats := public.organization_seats_used(p_organization_id);
  if p_seat_limit < used_seats then
    raise exception 'organization seat limit cannot be lower than seats used: %', used_seats;
  end if;

  update public.organizations
  set name = normalized_name,
      seat_limit = p_seat_limit,
      updated_at = now()
  where id = p_organization_id
  returning * into organization_row;

  return organization_row;
end;
$$;

create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status public.organization_status
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_row public.organizations;
begin
  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  update public.organizations
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then now() else null end,
      updated_at = now()
  where id = p_organization_id
  returning * into organization_row;

  if not found then
    raise exception 'organization not found';
  end if;

  return organization_row;
end;
$$;

revoke all on function public.get_organizations_for_admin() from public, anon, authenticated;
revoke all on function public.get_organization_for_admin(uuid) from public, anon, authenticated;
revoke all on function public.create_organization(text, integer) from public, anon, authenticated;
revoke all on function public.update_organization(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.set_organization_status(uuid, public.organization_status) from public, anon, authenticated;

grant execute on function public.get_organizations_for_admin() to authenticated;
grant execute on function public.get_organization_for_admin(uuid) to authenticated;
grant execute on function public.create_organization(text, integer) to authenticated;
grant execute on function public.update_organization(uuid, text, integer) to authenticated;
grant execute on function public.set_organization_status(uuid, public.organization_status) to authenticated;
