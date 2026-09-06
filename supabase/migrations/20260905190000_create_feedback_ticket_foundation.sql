create table public.feedback_ticket_folio_counters (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  year integer not null,
  last_value integer not null default 0,
  primary key (organization_id, year),
  constraint feedback_ticket_folio_counters_year_check check (year between 2000 and 9999),
  constraint feedback_ticket_folio_counters_value_check check (last_value >= 0)
);

create table public.feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  folio text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  category text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to uuid references public.fleetmaster_admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  unique (organization_id, folio),
  unique (id, organization_id),
  constraint feedback_tickets_folio_check check (folio ~ '^TK-[0-9]{4}-[0-9]{4}$'),
  constraint feedback_tickets_title_check check (length(btrim(title)) between 1 and 200),
  constraint feedback_tickets_category_check check (category in ('problem', 'improvement', 'suggestion', 'support')),
  constraint feedback_tickets_status_check check (status in ('open', 'in_review', 'in_progress', 'resolved', 'closed')),
  constraint feedback_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint feedback_tickets_resolved_state_check check (resolved_at is null or status = 'resolved' or status = 'closed'),
  constraint feedback_tickets_closed_state_check check ((status = 'closed') = (closed_at is not null))
);

create table public.feedback_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  organization_id uuid not null,
  author_id uuid not null references auth.users(id) on delete restrict,
  message text not null,
  created_at timestamptz not null default now(),
  constraint feedback_ticket_messages_ticket_org_fkey
    foreign key (ticket_id, organization_id)
    references public.feedback_tickets(id, organization_id)
    on delete restrict,
  constraint feedback_ticket_messages_message_check check (length(btrim(message)) between 1 and 5000)
);

create index feedback_tickets_organization_updated_idx
  on public.feedback_tickets (organization_id, updated_at desc);

create index feedback_tickets_organization_status_idx
  on public.feedback_tickets (organization_id, status);

create index feedback_ticket_messages_ticket_created_idx
  on public.feedback_ticket_messages (ticket_id, created_at asc);

create index feedback_ticket_messages_organization_idx
  on public.feedback_ticket_messages (organization_id);

create or replace function public.next_feedback_ticket_folio(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year integer := extract(year from now())::integer;
  sequence_number integer;
begin
  if p_organization_id is null then
    raise exception 'organization is required';
  end if;

  insert into public.feedback_ticket_folio_counters (organization_id, year, last_value)
  values (p_organization_id, current_year, 1)
  on conflict (organization_id, year) do update
    set last_value = public.feedback_ticket_folio_counters.last_value + 1
  returning last_value into sequence_number;

  return format('TK-%s-%s', current_year, lpad(sequence_number::text, 4, '0'));
end;
$$;

create or replace function public.create_feedback_ticket(
  p_title text,
  p_category text,
  p_message text
)
returns public.feedback_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.feedback_tickets;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_category text := lower(btrim(coalesce(p_category, '')));
  normalized_message text := btrim(coalesce(p_message, ''));
  current_user_id uuid := auth.uid();
  organization_count integer;
  organization_id_value uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if length(normalized_title) not between 1 and 200 then
    raise exception 'ticket title must contain between 1 and 200 characters';
  end if;

  if normalized_category not in ('problem', 'improvement', 'suggestion', 'support') then
    raise exception 'invalid ticket category';
  end if;

  if length(normalized_message) not between 1 and 5000 then
    raise exception 'ticket message must contain between 1 and 5000 characters';
  end if;

  select count(*)::integer
    into organization_count
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = current_user_id
     and m.status = 'active'
     and o.status = 'active';

  if organization_count = 0 then
    raise exception 'active organization membership required';
  elsif organization_count > 1 then
    raise exception 'an active organization context is required';
  end if;

  select m.organization_id
    into organization_id_value
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = current_user_id
     and m.status = 'active'
     and o.status = 'active';

  insert into public.feedback_tickets (
    organization_id,
    folio,
    created_by,
    title,
    category,
    status,
    priority
  )
  values (
    organization_id_value,
    public.next_feedback_ticket_folio(organization_id_value),
    current_user_id,
    normalized_title,
    normalized_category,
    'open',
    'normal'
  )
  returning * into ticket;

  insert into public.feedback_ticket_messages (ticket_id, organization_id, author_id, message)
  values (ticket.id, ticket.organization_id, current_user_id, normalized_message);

  return ticket;
end;
$$;

create or replace function public.add_feedback_ticket_message(
  p_ticket_id uuid,
  p_message text
)
returns public.feedback_ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.feedback_tickets;
  saved_message public.feedback_ticket_messages;
  normalized_message text := btrim(coalesce(p_message, ''));
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_ticket_id is null then
    raise exception 'ticket is required';
  end if;

  if length(normalized_message) not between 1 and 5000 then
    raise exception 'ticket message must contain between 1 and 5000 characters';
  end if;

  select *
    into ticket
    from public.feedback_tickets
   where id = p_ticket_id
   for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  if not public.is_fleetmaster_admin()
     and (not public.is_organization_active(ticket.organization_id)
       or not public.is_organization_member(ticket.organization_id)) then
    raise exception 'insufficient organization permissions';
  end if;

  if ticket.status = 'closed' then
    raise exception 'closed tickets do not accept new messages';
  end if;

  insert into public.feedback_ticket_messages (ticket_id, organization_id, author_id, message)
  values (ticket.id, ticket.organization_id, current_user_id, normalized_message)
  returning * into saved_message;

  update public.feedback_tickets
     set updated_at = now()
   where id = ticket.id;

  return saved_message;
end;
$$;

alter table public.feedback_ticket_folio_counters enable row level security;
alter table public.feedback_tickets enable row level security;
alter table public.feedback_ticket_messages enable row level security;

revoke all on table public.feedback_ticket_folio_counters from anon, authenticated;
revoke all on table public.feedback_tickets from anon, authenticated;
revoke all on table public.feedback_ticket_messages from anon, authenticated;

grant select on table public.feedback_tickets to authenticated;
grant select on table public.feedback_ticket_messages to authenticated;

create policy feedback_tickets_select_policy
  on public.feedback_tickets
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or (
      public.is_organization_active(organization_id)
      and public.is_organization_member(organization_id)
    )
  );

create policy feedback_ticket_messages_select_policy
  on public.feedback_ticket_messages
  for select
  to authenticated
  using (
    public.is_fleetmaster_admin()
    or (
      public.is_organization_active(organization_id)
      and public.is_organization_member(organization_id)
    )
  );

revoke all on function public.next_feedback_ticket_folio(uuid) from public;
revoke all on function public.create_feedback_ticket(text, text, text) from public;
revoke all on function public.add_feedback_ticket_message(uuid, text) from public;
grant execute on function public.create_feedback_ticket(text, text, text) to authenticated;
grant execute on function public.add_feedback_ticket_message(uuid, text) to authenticated;

comment on table public.feedback_tickets is
  'Tenant-scoped support tickets. Creation and updates are controlled by security-definer RPCs.';

comment on table public.feedback_ticket_messages is
  'Tenant-scoped immutable ticket conversation messages.';
