create table public.feedback_ticket_close_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  organization_id uuid not null,
  requested_side text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  status text not null default 'pending',
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_ticket_close_requests_ticket_org_fkey
    foreign key (ticket_id, organization_id)
    references public.feedback_tickets(id, organization_id)
    on delete restrict,
  constraint feedback_ticket_close_requests_side_check
    check (requested_side in ('fleetmaster', 'organization')),
  constraint feedback_ticket_close_requests_status_check
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  constraint feedback_ticket_close_requests_response_check
    check (
      (status = 'pending' and responded_by is null and responded_at is null)
      or (status <> 'pending' and responded_by is not null and responded_at is not null)
    )
);

create unique index feedback_ticket_close_requests_pending_idx
  on public.feedback_ticket_close_requests (ticket_id)
  where status = 'pending';

create index feedback_ticket_close_requests_ticket_idx
  on public.feedback_ticket_close_requests (ticket_id, created_at desc);

create table public.feedback_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  organization_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_side text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint feedback_ticket_events_ticket_org_fkey
    foreign key (ticket_id, organization_id)
    references public.feedback_tickets(id, organization_id)
    on delete restrict,
  constraint feedback_ticket_events_actor_side_check
    check (actor_side in ('fleetmaster', 'organization', 'system')),
  constraint feedback_ticket_events_type_check
    check (event_type in (
      'close_requested',
      'close_confirmed',
      'close_rejected',
      'close_cancelled',
      'closed',
      'reopened'
    )),
  constraint feedback_ticket_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index feedback_ticket_events_ticket_idx
  on public.feedback_ticket_events (ticket_id, created_at asc);

alter table public.feedback_ticket_close_requests enable row level security;
alter table public.feedback_ticket_events enable row level security;

revoke all on table public.feedback_ticket_close_requests from public, anon, authenticated;
revoke all on table public.feedback_ticket_events from public, anon, authenticated;
grant select on table public.feedback_ticket_close_requests to authenticated;
grant select on table public.feedback_ticket_events to authenticated;

create policy feedback_ticket_close_requests_select_policy
  on public.feedback_ticket_close_requests
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or (
      public.is_organization_active(organization_id)
      and public.is_organization_member(organization_id)
    )
  );

create policy feedback_ticket_events_select_policy
  on public.feedback_ticket_events
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or (
      public.is_organization_active(organization_id)
      and public.is_organization_member(organization_id)
    )
  );

create or replace function public.request_feedback_ticket_close(p_ticket_id uuid)
returns public.feedback_ticket_close_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  ticket_row public.feedback_tickets;
  actor_side_value text;
  request_row public.feedback_ticket_close_requests;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
    into ticket_row
    from public.feedback_tickets
   where id = p_ticket_id
   for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  if ticket_row.status = 'closed' then
    raise exception 'ticket is already closed';
  end if;

  if public.is_fleetmaster_admin() then
    actor_side_value := 'fleetmaster';
  elsif public.is_organization_active(ticket_row.organization_id)
    and public.has_organization_role(
      ticket_row.organization_id,
      array['manager']::public.organization_role[]
    ) then
    actor_side_value := 'organization';
  else
    raise exception 'insufficient permissions to request ticket closure';
  end if;

  if exists (
    select 1
      from public.feedback_ticket_close_requests
     where ticket_id = ticket_row.id
       and status = 'pending'
  ) then
    raise exception 'a close request is already pending';
  end if;

  insert into public.feedback_ticket_close_requests (
    ticket_id,
    organization_id,
    requested_side,
    requested_by
  )
  values (
    ticket_row.id,
    ticket_row.organization_id,
    actor_side_value,
    current_user_id
  )
  returning * into request_row;

  insert into public.feedback_ticket_events (
    ticket_id,
    organization_id,
    actor_id,
    actor_side,
    event_type,
    metadata
  )
  values (
    ticket_row.id,
    ticket_row.organization_id,
    current_user_id,
    actor_side_value,
    'close_requested',
    jsonb_build_object('request_id', request_row.id, 'requested_side', actor_side_value)
  );

  return request_row;
end;
$$;

create or replace function public.respond_feedback_ticket_close(
  p_ticket_id uuid,
  p_decision text
)
returns public.feedback_ticket_close_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  ticket_row public.feedback_tickets;
  request_row public.feedback_ticket_close_requests;
  actor_side_value text;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_decision is null or p_decision not in ('confirm', 'reject') then
    raise exception 'invalid close decision';
  end if;

  select *
    into ticket_row
    from public.feedback_tickets
   where id = p_ticket_id
   for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  if ticket_row.status = 'closed' then
    raise exception 'ticket is already closed';
  end if;

  select *
    into request_row
    from public.feedback_ticket_close_requests
   where ticket_id = ticket_row.id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'no pending close request';
  end if;

  if public.is_fleetmaster_admin() then
    actor_side_value := 'fleetmaster';
  elsif public.is_organization_active(ticket_row.organization_id)
    and public.has_organization_role(
      ticket_row.organization_id,
      array['manager']::public.organization_role[]
    ) then
    actor_side_value := 'organization';
  else
    raise exception 'insufficient permissions to respond to ticket closure';
  end if;

  if actor_side_value = request_row.requested_side then
    raise exception 'the requesting side cannot respond to its own close request';
  end if;

  update public.feedback_ticket_close_requests
     set status = case when p_decision = 'confirm' then 'confirmed' else 'rejected' end,
         responded_by = current_user_id,
         responded_at = now(),
         updated_at = now()
   where id = request_row.id
  returning * into request_row;

  insert into public.feedback_ticket_events (
    ticket_id,
    organization_id,
    actor_id,
    actor_side,
    event_type,
    metadata
  )
  values (
    ticket_row.id,
    ticket_row.organization_id,
    current_user_id,
    actor_side_value,
    case when p_decision = 'confirm' then 'close_confirmed' else 'close_rejected' end,
    jsonb_build_object('request_id', request_row.id, 'requested_side', request_row.requested_side)
  );

  if p_decision = 'confirm' then
    update public.feedback_tickets
       set status = 'closed',
           closed_at = now(),
           updated_at = now()
     where id = ticket_row.id;

    insert into public.feedback_ticket_events (
      ticket_id,
      organization_id,
      actor_id,
      actor_side,
      event_type,
      metadata
    )
    values (
      ticket_row.id,
      ticket_row.organization_id,
      null,
      'system',
      'closed',
      jsonb_build_object('request_id', request_row.id)
    );
  end if;

  return request_row;
end;
$$;

create or replace function public.cancel_feedback_ticket_close(p_ticket_id uuid)
returns public.feedback_ticket_close_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  ticket_row public.feedback_tickets;
  request_row public.feedback_ticket_close_requests;
  actor_side_value text;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select *
    into ticket_row
    from public.feedback_tickets
   where id = p_ticket_id
   for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  if ticket_row.status = 'closed' then
    raise exception 'ticket is already closed';
  end if;

  select *
    into request_row
    from public.feedback_ticket_close_requests
   where ticket_id = ticket_row.id
     and status = 'pending'
   for update;

  if not found then
    raise exception 'no pending close request';
  end if;

  if public.is_fleetmaster_admin() then
    actor_side_value := 'fleetmaster';
  elsif public.is_organization_active(ticket_row.organization_id)
    and public.has_organization_role(
      ticket_row.organization_id,
      array['manager']::public.organization_role[]
    ) then
    actor_side_value := 'organization';
  else
    raise exception 'insufficient permissions to cancel ticket closure';
  end if;

  if actor_side_value <> request_row.requested_side then
    raise exception 'only the requesting side can cancel the close request';
  end if;

  update public.feedback_ticket_close_requests
     set status = 'cancelled',
         responded_by = current_user_id,
         responded_at = now(),
         updated_at = now()
   where id = request_row.id
  returning * into request_row;

  insert into public.feedback_ticket_events (
    ticket_id,
    organization_id,
    actor_id,
    actor_side,
    event_type,
    metadata
  )
  values (
    ticket_row.id,
    ticket_row.organization_id,
    current_user_id,
    actor_side_value,
    'close_cancelled',
    jsonb_build_object('request_id', request_row.id, 'requested_side', request_row.requested_side)
  );

  return request_row;
end;
$$;

revoke all on function public.request_feedback_ticket_close(uuid) from public, anon;
revoke all on function public.respond_feedback_ticket_close(uuid, text) from public, anon;
revoke all on function public.cancel_feedback_ticket_close(uuid) from public, anon;
grant execute on function public.request_feedback_ticket_close(uuid) to authenticated;
grant execute on function public.respond_feedback_ticket_close(uuid, text) to authenticated;
grant execute on function public.cancel_feedback_ticket_close(uuid) to authenticated;
