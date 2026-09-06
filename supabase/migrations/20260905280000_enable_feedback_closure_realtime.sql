do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'feedback_ticket_close_requests'
  ) then
    alter publication supabase_realtime
      add table public.feedback_ticket_close_requests;
  end if;
end;
$$;
