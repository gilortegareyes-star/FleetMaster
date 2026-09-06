-- Extend the existing support unread model to include counterpart closure activity.
-- The persisted per-ticket read cursor remains the single source of truth.

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
  with activity as (
    select
      m.ticket_id,
      m.organization_id,
      m.created_at as activity_at
      from public.feedback_ticket_messages m
      join public.feedback_tickets t on t.id = m.ticket_id
      cross join public.feedback_notification_settings settings
      left join public.feedback_ticket_reads reads
        on reads.ticket_id = m.ticket_id
       and reads.user_id = auth.uid()
     where m.author_id <> auth.uid()
       and (
         (m.created_at, m.id) > (
           coalesce(reads.last_read_at, settings.enabled_at),
           coalesce(reads.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
         )
       )
       and (
         public.is_fleetmaster_admin()
         or (
           public.is_organization_active(t.organization_id)
           and public.is_organization_member(t.organization_id)
         )
       )
    union all
    select
      e.ticket_id,
      e.organization_id,
      e.created_at
      from public.feedback_ticket_events e
      join public.feedback_tickets t on t.id = e.ticket_id
      cross join public.feedback_notification_settings settings
      left join public.feedback_ticket_reads reads
        on reads.ticket_id = e.ticket_id
       and reads.user_id = auth.uid()
     where e.actor_side = 'fleetmaster'
       and e.event_type in ('close_requested', 'close_confirmed', 'close_rejected', 'close_cancelled')
       and e.created_at > coalesce(reads.last_read_at, settings.enabled_at)
       and (
         public.is_organization_active(t.organization_id)
         and public.is_organization_member(t.organization_id)
       )
  )
  select
    activity.ticket_id,
    activity.organization_id,
    count(*)::bigint,
    max(activity.activity_at)
    from activity
   where auth.uid() is not null
   group by activity.ticket_id, activity.organization_id
   order by max(activity.activity_at) desc;
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
    with activity as (
      select
        m.ticket_id,
        m.organization_id,
        m.created_at as activity_at
        from public.feedback_ticket_messages m
        cross join public.feedback_notification_settings settings
        left join public.feedback_ticket_reads reads
          on reads.ticket_id = m.ticket_id
         and reads.user_id = auth.uid()
       where m.author_id <> auth.uid()
         and (m.created_at, m.id) > (
           coalesce(reads.last_read_at, settings.enabled_at),
           coalesce(reads.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
         )
      union all
      select
        e.ticket_id,
        e.organization_id,
        e.created_at
        from public.feedback_ticket_events e
        cross join public.feedback_notification_settings settings
        left join public.feedback_ticket_reads reads
          on reads.ticket_id = e.ticket_id
         and reads.user_id = auth.uid()
       where e.actor_side = 'organization'
         and e.event_type in ('close_requested', 'close_confirmed', 'close_rejected', 'close_cancelled')
         and e.created_at > coalesce(reads.last_read_at, settings.enabled_at)
    )
    select
      activity.organization_id,
      o.name,
      count(*)::bigint,
      max(activity.activity_at)
      from activity
      join public.organizations o on o.id = activity.organization_id
     group by activity.organization_id, o.name
     order by max(activity.activity_at) desc;
end;
$$;

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
  latest_event_at timestamptz;
  read_cursor_at timestamptz;
  current_user_is_fleetmaster_admin boolean;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  current_user_is_fleetmaster_admin := public.is_fleetmaster_admin();

  select t.organization_id
    into ticket_organization_id
    from public.feedback_tickets t
   where t.id = p_ticket_id
     and (
       current_user_is_fleetmaster_admin
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

  select max(e.created_at)
    into latest_event_at
    from public.feedback_ticket_events e
   where e.ticket_id = p_ticket_id
     and e.actor_side = case when current_user_is_fleetmaster_admin then 'organization' else 'fleetmaster' end
     and e.event_type in ('close_requested', 'close_confirmed', 'close_rejected', 'close_cancelled');

  select greatest(
    coalesce(latest_message_at, '-infinity'::timestamptz),
    coalesce(latest_event_at, '-infinity'::timestamptz),
    settings.enabled_at
  )
    into read_cursor_at
    from public.feedback_notification_settings settings;

  if read_cursor_at = '-infinity'::timestamptz then
    read_cursor_at := clock_timestamp();
  end if;

  insert into public.feedback_ticket_reads (
    ticket_id,
    user_id,
    last_read_at,
    last_read_message_id
  )
  values (
    p_ticket_id,
    current_user_id,
    read_cursor_at,
    latest_message_id
  )
  on conflict (ticket_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        last_read_message_id = excluded.last_read_message_id;
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
       and tablename = 'feedback_ticket_events'
  ) then
    alter publication supabase_realtime add table public.feedback_ticket_events;
  end if;
end;
$$;
