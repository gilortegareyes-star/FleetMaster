create table public.organization_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_status public.organization_status not null,
  new_status public.organization_status not null,
  created_at timestamptz not null default now()
);

create index organization_status_events_organization_created_idx
  on public.organization_status_events (organization_id, created_at desc);

alter table public.organization_status_events enable row level security;

revoke all on table public.organization_status_events from public, anon, authenticated;
grant select on table public.organization_status_events to authenticated;

create policy organization_status_events_admin_select_policy
  on public.organization_status_events
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status public.organization_status
)
returns public.organizations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  organization_row public.organizations;
  previous_status public.organization_status;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_organization_id is null or p_status is null then
    raise exception 'organization status is required';
  end if;

  select o.*
    into organization_row
    from public.organizations o
   where o.id = p_organization_id
   for update;

  if not found then
    raise exception 'organization not found';
  end if;

  previous_status := organization_row.status;

  if previous_status = p_status then
    if p_status = 'suspended' and organization_row.operational_access_manually_enabled then
      update public.organizations o
         set operational_access_manually_enabled = false,
             updated_at = now()
       where o.id = p_organization_id
       returning o.* into organization_row;
    end if;
    return organization_row;
  end if;

  update public.organizations o
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() else null end,
         operational_access_manually_enabled = case when p_status = 'suspended' then false else o.operational_access_manually_enabled end,
         updated_at = now()
   where o.id = p_organization_id
   returning o.* into organization_row;

  insert into public.organization_status_events (
    organization_id,
    actor_id,
    previous_status,
    new_status
  )
  values (
    organization_row.id,
    current_user_id,
    previous_status,
    organization_row.status
  );

  return organization_row;
end;
$$;

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
set search_path = public, pg_temp
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

  if organization_row.status = 'suspended' and p_enabled then
    raise exception 'suspended organization cannot enable operational access';
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
    organization_id, enabled, changed_by, changed_at, reason_code, reason_note
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
