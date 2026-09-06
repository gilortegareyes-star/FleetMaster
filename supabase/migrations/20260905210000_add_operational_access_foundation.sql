alter table public.organizations
  add column operational_access_manually_enabled boolean not null default false,
  add column operational_access_changed_at timestamptz,
  add column operational_access_changed_by uuid references auth.users(id) on delete restrict,
  add column operational_access_reason_code text,
  add column operational_access_reason_note text;

alter table public.organizations
  add constraint organizations_operational_access_reason_code_check
  check (operational_access_reason_code is null or operational_access_reason_code in (
    'manual', 'maintenance', 'administrative', 'security', 'payment', 'other'
  ));

alter table public.organizations
  add constraint organizations_operational_access_reason_note_check
  check (operational_access_reason_note is null or length(operational_access_reason_note) <= 1000);

create table public.organization_operational_access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  enabled boolean not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  reason_code text not null,
  reason_note text,
  constraint organization_operational_access_events_reason_code_check
    check (reason_code in ('manual', 'maintenance', 'administrative', 'security', 'payment', 'other')),
  constraint organization_operational_access_events_reason_note_check
    check (length(reason_note) <= 1000)
);

create index organization_operational_access_events_organization_changed_idx
  on public.organization_operational_access_events (organization_id, changed_at desc);

alter table public.organization_operational_access_events enable row level security;

revoke all on table public.organization_operational_access_events from public, anon, authenticated;
grant select on table public.organization_operational_access_events to authenticated;

create policy organization_operational_access_events_admin_select_policy
  on public.organization_operational_access_events
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create or replace function public.organization_has_operational_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select o.status = 'active' and o.operational_access_manually_enabled
      from public.organizations o
      where o.id = p_organization_id
    ),
    false
  );
$$;

revoke all on function public.organization_has_operational_access(uuid) from public, anon;
grant execute on function public.organization_has_operational_access(uuid) to authenticated;
