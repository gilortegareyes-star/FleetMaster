do $$
begin
  create type public.organization_status as enum ('active', 'suspended');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.membership_status as enum ('active', 'disabled');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.organization_invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
exception
  when duplicate_object then null;
end;
$$;

alter table public.organizations
  add column seat_limit integer not null default 10,
  add column status public.organization_status not null default 'active',
  add column suspended_at timestamptz;

alter table public.organizations
  add constraint organizations_seat_limit_check check (seat_limit > 0),
  add constraint organizations_suspension_state_check check (
    (status = 'active' and suspended_at is null)
    or (status = 'suspended' and suspended_at is not null)
  );

alter table public.organization_memberships
  add column status public.membership_status not null default 'active';

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  normalized_email text generated always as (lower(btrim(email))) stored,
  role public.organization_role not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status public.organization_invitation_status not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint organization_invitations_email_check check (length(btrim(email)) > 0),
  constraint organization_invitations_expiration_check check (expires_at > created_at),
  constraint organization_invitations_accepted_state_check check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted')
  ),
  constraint organization_invitations_revoked_state_check check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked')
  )
);

create index organization_memberships_active_org_idx
  on public.organization_memberships (organization_id)
  where status = 'active';

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, normalized_email)
  where status = 'pending';

create index organization_invitations_org_idx
  on public.organization_invitations (organization_id, created_at desc);

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_fleetmaster_admin()
    or exists (
      select 1
      from public.organization_memberships
      where organization_id = p_organization_id
        and user_id = auth.uid()
        and status = 'active'
    );
$$;

create or replace function public.has_organization_role(
  p_organization_id uuid,
  p_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_fleetmaster_admin()
    or exists (
      select 1
      from public.organization_memberships
      where organization_id = p_organization_id
        and user_id = auth.uid()
        and status = 'active'
        and role = any (p_roles)
    );
$$;

create or replace function public.is_organization_active(p_organization_id uuid)
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
  );
$$;

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
    raise exception 'a pending invitation already exists for this email';
end;
$$;

alter table public.organization_invitations enable row level security;

revoke all on table public.organization_invitations from anon, authenticated;
grant select on table public.organization_invitations to authenticated;

create policy organization_invitations_select_policy
  on public.organization_invitations
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or public.has_organization_role(
      organization_id,
      array['manager', 'admin']::public.organization_role[]
    )
  );

revoke all on function public.is_organization_active(uuid) from public;
revoke all on function public.organization_seats_used(uuid) from public;
revoke all on function public.organization_has_available_seat(uuid) from public;
revoke all on function public.create_organization_invitation(uuid, text, public.organization_role, timestamptz) from public;
grant execute on function public.is_organization_active(uuid) to authenticated;
grant execute on function public.organization_seats_used(uuid) to authenticated;
grant execute on function public.organization_has_available_seat(uuid) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, public.organization_role, timestamptz) to authenticated;
