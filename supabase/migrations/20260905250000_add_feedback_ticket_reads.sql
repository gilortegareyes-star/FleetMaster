-- Persist per-user support read cursors without introducing a generic notification system.
create table public.feedback_ticket_reads (
  ticket_id uuid not null references public.feedback_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null,
  last_read_message_id uuid references public.feedback_ticket_messages(id) on delete set null,
  primary key (ticket_id, user_id)
);

create index feedback_ticket_reads_user_idx
  on public.feedback_ticket_reads (user_id, ticket_id);

create index feedback_ticket_messages_ticket_cursor_idx
  on public.feedback_ticket_messages (ticket_id, created_at desc, id desc);

-- This timestamp prevents existing history from becoming a notification avalanche.
create table public.feedback_notification_settings (
  id boolean primary key default true check (id),
  enabled_at timestamptz not null default now()
);

insert into public.feedback_notification_settings (id)
values (true);

alter table public.feedback_ticket_reads enable row level security;
alter table public.feedback_notification_settings enable row level security;

revoke all on table public.feedback_ticket_reads from anon, authenticated;
revoke all on table public.feedback_notification_settings from anon, authenticated;

grant select on table public.feedback_ticket_reads to authenticated;

create policy feedback_ticket_reads_select_policy
  on public.feedback_ticket_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
        from public.feedback_tickets t
       where t.id = feedback_ticket_reads.ticket_id
         and (
           public.is_fleetmaster_admin()
           or (
             public.is_organization_active(t.organization_id)
             and public.is_organization_member(t.organization_id)
           )
         )
    )
  );

create or replace function public.mark_feedback_ticket_read(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  ticket_organization_id uuid;
  latest_message_id uuid;
  latest_message_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select t.organization_id
    into ticket_organization_id
    from public.feedback_tickets t
   where t.id = p_ticket_id
     and (
       public.is_fleetmaster_admin()
       or (
         public.is_organization_active(t.organization_id)
         and public.is_organization_member(t.organization_id)
       )
     );

  if not found then
    raise exception 'ticket not found or inaccessible';
  end if;

  select m.id, m.created_at
    into latest_message_id, latest_message_at
    from public.feedback_ticket_messages m
   where m.ticket_id = p_ticket_id
   order by m.created_at desc, m.id desc
   limit 1;

  insert into public.feedback_ticket_reads (
    ticket_id,
    user_id,
    last_read_at,
    last_read_message_id
  )
  values (
    p_ticket_id,
    current_user_id,
    coalesce(latest_message_at, clock_timestamp()),
    latest_message_id
  )
  on conflict (ticket_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        last_read_message_id = excluded.last_read_message_id;
end;
$$;

create or replace function public.get_feedback_unread_tickets()
returns table (
  ticket_id uuid,
  organization_id uuid,
  unread_count bigint,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.organization_id,
    count(m.id)::bigint,
    max(m.created_at)
    from public.feedback_tickets t
    cross join public.feedback_notification_settings settings
    left join public.feedback_ticket_reads reads
      on reads.ticket_id = t.id
     and reads.user_id = auth.uid()
    join public.feedback_ticket_messages m
      on m.ticket_id = t.id
     and m.author_id <> auth.uid()
     and (m.created_at, m.id) > (
       coalesce(reads.last_read_at, settings.enabled_at),
       coalesce(reads.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
     )
   where auth.uid() is not null
     and (
       public.is_fleetmaster_admin()
       or (
         public.is_organization_active(t.organization_id)
         and public.is_organization_member(t.organization_id)
       )
     )
   group by t.id, t.organization_id
   order by max(m.created_at) desc;
$$;

create or replace function public.get_feedback_admin_unread_summary()
returns table (
  organization_id uuid,
  organization_name text,
  unread_count bigint,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  return query
    select
      t.organization_id,
      o.name,
      count(m.id)::bigint,
      max(m.created_at)
      from public.feedback_tickets t
      join public.organizations o on o.id = t.organization_id
      cross join public.feedback_notification_settings settings
      left join public.feedback_ticket_reads reads
        on reads.ticket_id = t.id
       and reads.user_id = auth.uid()
      join public.feedback_ticket_messages m
        on m.ticket_id = t.id
       and m.author_id <> auth.uid()
       and (m.created_at, m.id) > (
         coalesce(reads.last_read_at, settings.enabled_at),
         coalesce(reads.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
       )
     group by t.organization_id, o.name
     order by max(m.created_at) desc;
end;
$$;

revoke all on function public.mark_feedback_ticket_read(uuid) from public;
revoke all on function public.get_feedback_unread_tickets() from public;
revoke all on function public.get_feedback_admin_unread_summary() from public;
grant execute on function public.mark_feedback_ticket_read(uuid) to authenticated;
grant execute on function public.get_feedback_unread_tickets() to authenticated;
grant execute on function public.get_feedback_admin_unread_summary() to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'feedback_tickets'
  ) then
    alter publication supabase_realtime add table public.feedback_tickets;
  end if;
end;
$$;
