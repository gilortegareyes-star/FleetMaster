alter table public.organization_invitations
  add column invitee_name text;

alter table public.organization_invitations
  add constraint organization_invitations_invitee_name_check check (
    invitee_name is null or length(btrim(invitee_name)) > 0
  );

create unique index organization_memberships_one_active_manager_idx
  on public.organization_memberships (organization_id)
  where status = 'active' and role = 'manager';

create unique index organization_invitations_one_pending_manager_idx
  on public.organization_invitations (organization_id)
  where status = 'pending' and role = 'manager';

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.organization_role,
  p_expires_at timestamptz
)
returns public.organization_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.organization_invitations;
  normalized_email text := lower(btrim(p_email));
  caller_is_fleetmaster_admin boolean := public.is_fleetmaster_admin();
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_email is null or normalized_email = '' then
    raise exception 'invitation email is required';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invitation expiration must be in the future';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  if not public.is_organization_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  if not caller_is_fleetmaster_admin
     and not public.has_organization_role(
       p_organization_id,
       array['manager', 'admin']::public.organization_role[]
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  if caller_is_fleetmaster_admin then
    if p_role not in ('client', 'manager') then
      raise exception 'fleetmaster admins may invite only client or manager roles';
    end if;
  elsif p_role <> 'client' then
    raise exception 'organization managers may invite only client roles';
  end if;

  update public.organization_invitations
  set status = 'expired', updated_at = now()
  where organization_id = p_organization_id
    and status = 'pending'
    and expires_at <= now();

  if p_role = 'manager' and exists (
    select 1
    from public.organization_memberships
    where organization_id = p_organization_id
      and role = 'manager'
      and status = 'active'
  ) then
    raise exception 'organization already has an active manager';
  end if;

  if not public.organization_has_available_seat(p_organization_id) then
    raise exception 'organization seat limit reached';
  end if;

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    invited_by,
    expires_at
  )
  values (
    p_organization_id,
    normalized_email,
    p_role,
    auth.uid(),
    p_expires_at
  )
  returning * into invitation;

  return invitation;
exception
  when unique_violation then
    raise exception 'a pending invitation already exists for this email or role';
end;
$$;

create or replace function public.create_manager_invitation(
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
  if auth.uid() is null or not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_invitee_name is null or normalized_name = '' then
    raise exception 'invitee name is required';
  end if;

  invitation := public.create_organization_invitation(
    p_organization_id,
    p_email,
    'manager'::public.organization_role,
    p_expires_at
  );

  update public.organization_invitations
  set invitee_name = normalized_name,
      updated_at = now()
  where id = invitation.id
  returning * into invitation;

  return invitation;
end;
$$;

create or replace function public.get_organization_users(p_organization_id uuid)
returns table (
  id uuid,
  display_name text,
  email text,
  role public.organization_role,
  status text,
  record_type text,
  created_at timestamptz
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
     and not public.has_organization_role(
       p_organization_id,
       array['manager']::public.organization_role[]
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  return query
  select
    m.id,
    nullif(btrim(coalesce(p.display_name, '')), ''),
    u.email,
    m.role,
    m.status::text,
    'membership'::text,
    m.created_at
  from public.organization_memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id

  union all

  select
    i.id,
    nullif(btrim(coalesce(i.invitee_name, '')), ''),
    i.email,
    i.role,
    i.status::text,
    'invitation'::text,
    i.created_at
  from public.organization_invitations i
  where i.organization_id = p_organization_id
    and i.status = 'pending'
    and i.expires_at > now()
  order by created_at desc, email asc;
end;
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
  organization_id uuid;
  authenticated_email text := lower(btrim(auth.jwt() ->> 'email'));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if authenticated_email is null or authenticated_email = '' then
    raise exception 'authenticated email is required';
  end if;

  select i.organization_id into organization_id
  from public.organization_invitations
  where id = p_invitation_id;

  if not found then
    raise exception 'invitation is not pending';
  end if;

  perform pg_advisory_xact_lock(hashtext(organization_id::text));

  select * into invitation
  from public.organization_invitations
  where id = p_invitation_id
  for update;

  if not found or invitation.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  select * into organization_row
  from public.organizations
  where id = invitation.organization_id
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

  select * into membership_row
  from public.organization_memberships
  where organization_id = invitation.organization_id
    and user_id = auth.uid()
  for update;

  if found then
    if membership_row.status = 'active' then
      raise exception 'user is already a member of this organization';
    end if;

    update public.organization_memberships
    set role = invitation.role,
        status = 'active',
        updated_at = now()
    where id = membership_row.id
    returning * into membership_row;
  else
    insert into public.organization_memberships (organization_id, user_id, role, status)
    values (invitation.organization_id, auth.uid(), invitation.role, 'active')
    returning * into membership_row;
  end if;

  update public.profiles
  set display_name = coalesce(nullif(btrim(display_name), ''), invitation.invitee_name),
      updated_at = now()
  where id = auth.uid()
    and invitation.invitee_name is not null;

  update public.organization_invitations
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = invitation.id;

  return membership_row;
end;
$$;

create or replace function public.disable_organization_membership(p_membership_id uuid)
returns public.organization_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
  membership_row public.organization_memberships;
begin
  if auth.uid() is null or not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  select m.organization_id into organization_id
  from public.organization_memberships m
  where m.id = p_membership_id;

  if not found then
    raise exception 'membership not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(organization_id::text));

  update public.organization_memberships
  set status = 'disabled', updated_at = now()
  where id = p_membership_id
  returning * into membership_row;

  return membership_row;
end;
$$;

create or replace function public.revoke_organization_invitation(p_invitation_id uuid)
returns public.organization_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  organization_id uuid;
  invitation public.organization_invitations;
begin
  if auth.uid() is null or not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  select i.organization_id into organization_id
  from public.organization_invitations i
  where i.id = p_invitation_id;

  if not found then
    raise exception 'invitation not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(organization_id::text));

  update public.organization_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_invitation_id
    and status = 'pending'
  returning * into invitation;

  if not found then
    raise exception 'invitation is no longer pending';
  end if;

  return invitation;
end;
$$;

revoke all on function public.create_organization_invitation(uuid, text, public.organization_role, timestamptz) from public, anon;
revoke all on function public.create_manager_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_organization_users(uuid) from public, anon, authenticated;
revoke all on function public.accept_organization_invitation(uuid) from public, anon, authenticated;
revoke all on function public.disable_organization_membership(uuid) from public, anon, authenticated;
revoke all on function public.revoke_organization_invitation(uuid) from public, anon, authenticated;

grant execute on function public.create_organization_invitation(uuid, text, public.organization_role, timestamptz) to authenticated;
grant execute on function public.create_manager_invitation(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.get_organization_users(uuid) to authenticated;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
grant execute on function public.disable_organization_membership(uuid) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid) to authenticated;
