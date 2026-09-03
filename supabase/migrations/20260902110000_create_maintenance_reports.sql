create table public.maintenance_reports (
  maintenance_id uuid primary key references public.maintenance_records(id) on delete cascade,
  entry_at timestamptz,
  exit_at timestamptz,
  entry_mileage integer check (entry_mileage is null or entry_mileage >= 0),
  reason text,
  reception_conditions jsonb check (
    reception_conditions is null or jsonb_typeof(reception_conditions) = 'object'
  ),
  diagnosis text,
  recommendations text,
  pending_work text,
  closed_by text,
  closure_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_reports_exit_after_entry_check check (
    entry_at is null or exit_at is null or exit_at >= entry_at
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_maintenance_reports_updated_at'
      and tgrelid = 'public.maintenance_reports'::regclass
  ) then
    create trigger set_maintenance_reports_updated_at
    before update on public.maintenance_reports
    for each row
    execute function public.set_vehicles_updated_at();
  end if;
end;
$$;

alter table public.maintenance_reports enable row level security;

comment on table public.maintenance_reports is
  'Additional maintenance-report details. The primary maintenance facts remain in maintenance_records.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_reports'
      and policyname = 'maintenance_reports_select_policy'
  ) then
    create policy maintenance_reports_select_policy
      on public.maintenance_reports
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_reports'
      and policyname = 'maintenance_reports_insert_policy'
  ) then
    create policy maintenance_reports_insert_policy
      on public.maintenance_reports
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_reports'
      and policyname = 'maintenance_reports_update_policy'
  ) then
    create policy maintenance_reports_update_policy
      on public.maintenance_reports
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;
