-- Prepare an administrative, tenant-scoped organization deletion boundary.
-- Storage cleanup remains an external prerequisite owned by an orchestrator.

create table public.deleted_organizations (
  id uuid primary key default gen_random_uuid(),
  original_organization_id uuid not null,
  organization_name text not null,
  registration_email text,
  organization_created_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid not null
);

create unique index deleted_organizations_original_organization_id_idx
  on public.deleted_organizations (original_organization_id);

comment on table public.deleted_organizations is
  'Minimal append-only administrative history for deleted organizations. Identity data is intentionally not copied or deleted.';

alter table public.deleted_organizations enable row level security;

revoke all on table public.deleted_organizations from public, anon, authenticated;
grant select on table public.deleted_organizations to authenticated;

create policy deleted_organizations_admin_select_policy
  on public.deleted_organizations
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create or replace function public.delete_organization_permanently(
  p_organization_id uuid,
  p_deleted_by uuid,
  p_registration_email text default null
)
returns table (
  deleted_organization_id uuid,
  deleted_organization_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := p_deleted_by;
  organization_row public.organizations;
  normalized_registration_email text := nullif(btrim(p_registration_email), '');
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  if current_user_id is null then
    raise exception 'administrative actor is required';
  end if;

  if not exists (
    select 1
      from public.fleetmaster_admins admins
     where admins.user_id = current_user_id
  ) then
    raise exception 'fleetmaster admin required';
  end if;

  select o.*
    into organization_row
    from public.organizations o
   where o.id = p_organization_id
   for update;

  if not found then
    if exists (
      select 1
        from public.deleted_organizations history
       where history.original_organization_id = p_organization_id
    ) then
      raise exception 'organization has already been deleted';
    end if;

    raise exception 'organization not found';
  end if;

  insert into public.deleted_organizations (
    original_organization_id,
    organization_name,
    registration_email,
    organization_created_at,
    deleted_by
  )
  values (
    organization_row.id,
    organization_row.name,
    normalized_registration_email,
    organization_row.created_at,
    current_user_id
  );

  delete from public.feedback_ticket_reads reads
   using public.feedback_tickets tickets
   where reads.ticket_id = tickets.id
     and tickets.organization_id = organization_row.id;

  delete from public.feedback_ticket_events events
   where events.organization_id = organization_row.id;

  delete from public.feedback_ticket_close_requests requests
   where requests.organization_id = organization_row.id;

  delete from public.feedback_ticket_messages messages
   where messages.organization_id = organization_row.id;

  delete from public.feedback_tickets tickets
   where tickets.organization_id = organization_row.id;

  delete from public.feedback_ticket_folio_counters counters
   where counters.organization_id = organization_row.id;

  delete from public.maintenance_reports reports
   where reports.organization_id = organization_row.id;

  delete from public.maintenance_work_items work_items
   where work_items.organization_id = organization_row.id;

  delete from public.maintenance_parts parts
   where parts.organization_id = organization_row.id;

  delete from public.maintenance_cost_items costs
   where costs.organization_id = organization_row.id;

  delete from public.vehicle_documents documents
   where documents.organization_id = organization_row.id;

  delete from public.maintenance_records maintenance
   where maintenance.organization_id = organization_row.id;

  delete from public.maintenance_providers providers
   where providers.organization_id = organization_row.id;

  delete from public.maintenance_folio_counters counters
   where counters.organization_id = organization_row.id;

  delete from public.vehicles vehicles
   where vehicles.organization_id = organization_row.id;

  delete from public.organization_operational_access_events events
   where events.organization_id = organization_row.id;

  delete from public.organization_invitations invitations
   where invitations.organization_id = organization_row.id;

  delete from public.organization_memberships memberships
   where memberships.organization_id = organization_row.id;

  delete from public.organizations organizations
   where organizations.id = organization_row.id;

  if not found then
    raise exception 'organization deletion did not remove the target';
  end if;

  return query
    select organization_row.id, organization_row.name;
end;
$$;

revoke all on function public.delete_organization_permanently(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_organization_permanently(uuid, uuid, text) to service_role;
