do $$
begin
  create type public.organization_role as enum ('client', 'manager', 'admin');
exception
  when duplicate_object then null;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.fleetmaster_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_fleetmaster_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.fleetmaster_admins
    where user_id = auth.uid()
  );
$$;

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
        and role = any (p_roles)
    );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.fleetmaster_admins enable row level security;

revoke all on table public.profiles, public.organizations, public.organization_memberships, public.fleetmaster_admins from anon;
revoke all on table public.profiles, public.organizations, public.organization_memberships, public.fleetmaster_admins from authenticated;

grant select on table public.profiles, public.organizations, public.organization_memberships to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy profiles_select_policy
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_fleetmaster_admin());

create policy profiles_update_policy
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_select_policy
  on public.organizations
  for select
  to authenticated
  using (public.is_organization_member(id));

create policy organizations_insert_policy
  on public.organizations
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy organizations_update_policy
  on public.organizations
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy organization_memberships_select_policy
  on public.organization_memberships
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_fleetmaster_admin());

create policy organization_memberships_insert_policy
  on public.organization_memberships
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy organization_memberships_update_policy
  on public.organization_memberships
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy organization_memberships_delete_policy
  on public.organization_memberships
  for delete
  to authenticated
  using (public.is_fleetmaster_admin());

revoke all on table public.fleetmaster_admins from public;

revoke all on function public.is_fleetmaster_admin() from public;
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, public.organization_role[]) from public;
revoke all on function public.handle_new_user_profile() from public;
grant execute on function public.is_fleetmaster_admin() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, public.organization_role[]) to authenticated;
