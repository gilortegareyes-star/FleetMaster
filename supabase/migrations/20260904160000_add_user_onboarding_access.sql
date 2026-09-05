create or replace function public.get_my_invitation(p_invitation_id uuid)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  invitee_name text,
  role public.organization_role,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.organization_id,
    o.name,
    i.invitee_name,
    i.role,
    i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where auth.uid() is not null
    and lower(btrim(auth.jwt() ->> 'email')) = i.normalized_email
    and i.id = p_invitation_id
    and i.status = 'pending'
    and i.expires_at > now()
    and o.status = 'active';
$$;

create or replace function public.get_my_organization_account()
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
  seats_available integer
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
    greatest(o.seat_limit - public.organization_seats_used(o.id), 0)
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.profiles p on p.id = m.user_id
  where auth.uid() is not null
    and m.user_id = auth.uid()
    and m.status = 'active'
    and o.status = 'active';
$$;

create or replace function public.accept_organization_invitation(p_invitation_id uuid)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  organization_row public.organizations;
  membership_row public.organization_memberships;
  v_organization_id uuid;
  v_invitation_email text;
  authenticated_email text := lower(btrim(auth.jwt() ->> 'email'));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admins cannot accept organization invitations';
  end if;

  if authenticated_email is null or authenticated_email = '' then
    raise exception 'authenticated email is required';
  end if;

  select i.organization_id, i.normalized_email
  into v_organization_id, v_invitation_email
  from public.organization_invitations i
  where i.id = p_invitation_id;

  if not found then
    raise exception 'invitation is not pending';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_invitation_email));
  perform pg_advisory_xact_lock(hashtext(v_organization_id::text));

  select i.* into invitation
  from public.organization_invitations i
  where i.id = p_invitation_id
  for update;

  if not found or invitation.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  select o.* into organization_row
  from public.organizations o
  where o.id = invitation.organization_id
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if organization_row.status <> 'active' then
    raise exception 'organization is not active';
  end if;

  if invitation.expires_at <= now() then
    raise exception 'invitation has expired';
  end if;

  if invitation.normalized_email <> authenticated_email then
    raise exception 'invitation email does not match authenticated user';
  end if;

  if exists (
    select 1
    from public.organization_memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.organization_id <> invitation.organization_id
  ) then
    raise exception 'user already belongs to another organization';
  end if;

  select m.* into membership_row
  from public.organization_memberships m
  where m.organization_id = invitation.organization_id
    and m.user_id = auth.uid()
  for update;

  if found then
    if membership_row.status = 'active' then
      raise exception 'user is already a member of this organization';
    end if;

    update public.organization_memberships om
    set role = invitation.role,
        status = 'active',
        updated_at = now()
    where om.id = membership_row.id
    returning om.* into membership_row;
  else
    insert into public.organization_memberships (organization_id, user_id, role, status)
    values (invitation.organization_id, auth.uid(), invitation.role, 'active')
    returning * into membership_row;
  end if;

  update public.profiles p
  set display_name = coalesce(nullif(btrim(p.display_name), ''), invitation.invitee_name),
      updated_at = now()
  where p.id = auth.uid()
    and invitation.invitee_name is not null;

  update public.organization_invitations oi
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where oi.id = invitation.id;

  return membership_row;
exception
  when unique_violation then
    raise exception 'user already belongs to an organization';
end;
$$;

create or replace function public.accept_organization_invitation_with_profile(
  p_invitation_id uuid,
  p_full_name text
)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_row public.organization_memberships;
  profile_id uuid;
  normalized_name text := btrim(p_full_name);
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if normalized_name is null or normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'full name is required';
  end if;

  membership_row := public.accept_organization_invitation(p_invitation_id);

  update public.profiles
  set display_name = normalized_name,
      updated_at = now()
  where id = auth.uid()
  returning id into profile_id;

  if not found then
    raise exception 'profile not found';
  end if;

  return membership_row;
end;
$$;

create or replace function public.get_organization_user_records(p_organization_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  role public.organization_role,
  status text,
  record_type text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin()
     and (
       not public.has_organization_role(
         p_organization_id,
         array['manager']::public.organization_role[]
       )
       or not exists (
         select 1
         from public.organizations o
         where o.id = p_organization_id
           and o.status = 'active'
       )
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  return query
  select
    m.id,
    m.user_id,
    nullif(btrim(coalesce(p.display_name, '')), ''),
    u.email,
    m.role,
    m.status::text,
    'membership'::text,
    m.created_at,
    null::timestamptz,
    null::timestamptz
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
    and m.status = 'active'

  union all

  select
    i.id,
    null::uuid,
    nullif(btrim(coalesce(i.invitee_name, '')), ''),
    i.email,
    i.role,
    i.status::text,
    'invitation'::text,
    i.created_at,
    i.expires_at,
    null::timestamptz
  from public.organization_invitations i
  where i.organization_id = p_organization_id
    and i.status = 'pending'
    and i.expires_at > now()
  order by created_at desc, email asc;
end;
$$;

create or replace function public.create_organization_client_invitation(
  p_organization_id uuid,
  p_invitee_name text,
  p_email text,
  p_expires_at timestamptz
)
returns public.organization_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  normalized_name text := btrim(p_invitee_name);
begin
  if auth.uid() is null or not public.has_organization_role(
    p_organization_id,
    array['manager']::public.organization_role[]
  ) then
    raise exception 'organization manager required';
  end if;

  if normalized_name is null or normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'invitee name is required';
  end if;

  invitation := public.create_organization_invitation(
    p_organization_id,
    p_email,
    'client'::public.organization_role,
    p_expires_at
  );

  update public.organization_invitations
  set invitee_name = normalized_name, updated_at = now()
  where id = invitation.id
  returning * into invitation;

  return invitation;
end;
$$;

revoke all on function public.get_my_invitation(uuid) from public, anon;
revoke all on function public.get_my_organization_account() from public, anon;
revoke all on function public.accept_organization_invitation(uuid) from public, anon, authenticated;
revoke all on function public.accept_organization_invitation_with_profile(uuid, text) from public, anon;
revoke all on function public.get_organization_user_records(uuid) from public, anon;
revoke all on function public.create_organization_client_invitation(uuid, text, text, timestamptz) from public, anon;

grant execute on function public.get_my_invitation(uuid) to authenticated;
grant execute on function public.get_my_organization_account() to authenticated;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
grant execute on function public.accept_organization_invitation_with_profile(uuid, text) to authenticated;
grant execute on function public.get_organization_user_records(uuid) to authenticated;
grant execute on function public.create_organization_client_invitation(uuid, text, text, timestamptz) to authenticated;
