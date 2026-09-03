alter table public.maintenance_records
  alter column description drop not null;

alter table public.maintenance_records
  drop constraint if exists maintenance_records_description_check;

alter table public.maintenance_records
  add constraint maintenance_records_description_by_status_check
  check (
    status = 'open'
    or length(btrim(coalesce(description, ''))) > 0
  );

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'maintenance_records_delete_open_policy'
  ) then
    create policy maintenance_records_delete_open_policy
      on public.maintenance_records
      for delete
      to anon, authenticated
      using (status = 'open');
  end if;
end;
$$;

comment on column public.maintenance_records.description is
  'Required for terminal historical maintenance records. Open orders may leave it empty until work is defined.';
