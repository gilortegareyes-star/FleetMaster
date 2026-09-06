-- Keep support read cursors monotonic and publish cursor changes for other sessions.

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
  values (p_ticket_id, current_user_id, read_cursor_at, latest_message_id)
  on conflict (ticket_id, user_id) do update
    set last_read_at = greatest(public.feedback_ticket_reads.last_read_at, excluded.last_read_at),
        last_read_message_id = case
          when excluded.last_read_at > public.feedback_ticket_reads.last_read_at
            then excluded.last_read_message_id
          when excluded.last_read_at = public.feedback_ticket_reads.last_read_at
            then case
              when excluded.last_read_message_id is null then public.feedback_ticket_reads.last_read_message_id
              when public.feedback_ticket_reads.last_read_message_id is null then excluded.last_read_message_id
              else greatest(public.feedback_ticket_reads.last_read_message_id, excluded.last_read_message_id)
            end
          else public.feedback_ticket_reads.last_read_message_id
        end;
end;
$$;

revoke all on function public.mark_feedback_ticket_read(uuid) from public;
grant execute on function public.mark_feedback_ticket_read(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'feedback_ticket_reads'
  ) then
    alter publication supabase_realtime add table public.feedback_ticket_reads;
  end if;
end;
$$;
