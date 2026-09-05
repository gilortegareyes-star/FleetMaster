-- Isolate maintenance reports by organization and prevent UPSERT privilege escalation.

create or replace function public.prevent_maintenance_report_scope_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.maintenance_id is distinct from old.maintenance_id then
    raise exception 'maintenance report ownership cannot be changed';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_maintenance_report_scope_change'
      and tgrelid = 'public.maintenance_reports'::regclass
  ) then
    create trigger prevent_maintenance_report_scope_change
      before update on public.maintenance_reports
      for each row
      execute function public.prevent_maintenance_report_scope_change();
  end if;
end;
$$;

drop policy if exists maintenance_reports_select_policy on public.maintenance_reports;
drop policy if exists maintenance_reports_insert_policy on public.maintenance_reports;
drop policy if exists maintenance_reports_update_policy on public.maintenance_reports;

revoke all on table public.maintenance_reports from public, anon, authenticated;
grant select, insert, update on table public.maintenance_reports to authenticated;

create policy maintenance_reports_admin_select_policy
  on public.maintenance_reports
  for select
  to authenticated
  using (public.is_fleetmaster_admin());

create policy maintenance_reports_member_select_policy
  on public.maintenance_reports
  for select
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.is_organization_member(organization_id)
  );

create policy maintenance_reports_admin_insert_policy
  on public.maintenance_reports
  for insert
  to authenticated
  with check (public.is_fleetmaster_admin());

create policy maintenance_reports_member_insert_policy
  on public.maintenance_reports
  for insert
  to authenticated
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['client', 'manager']::public.organization_role[]
    )
  );

create policy maintenance_reports_admin_update_policy
  on public.maintenance_reports
  for update
  to authenticated
  using (public.is_fleetmaster_admin())
  with check (public.is_fleetmaster_admin());

create policy maintenance_reports_manager_update_policy
  on public.maintenance_reports
  for update
  to authenticated
  using (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  )
  with check (
    public.is_organization_active(organization_id)
    and public.has_organization_role(
      organization_id,
      array['manager']::public.organization_role[]
    )
  );

create or replace function public.save_maintenance_report(
  p_maintenance_id uuid,
  p_entry_at timestamptz,
  p_exit_at timestamptz,
  p_entry_mileage integer,
  p_reason text,
  p_reception_conditions jsonb,
  p_diagnosis text,
  p_recommendations text,
  p_pending_work text,
  p_closed_by text,
  p_closure_notes text
)
returns public.maintenance_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_report public.maintenance_reports;
  maintenance_organization_id uuid;
  caller_is_fleetmaster_admin boolean;
  report_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select m.organization_id
  into maintenance_organization_id
  from public.maintenance_records m
  where m.id = p_maintenance_id;

  if maintenance_organization_id is null then
    raise exception 'maintenance record not found or unavailable';
  end if;

  caller_is_fleetmaster_admin := public.is_fleetmaster_admin();

  if not caller_is_fleetmaster_admin
     and (
       not public.is_organization_active(maintenance_organization_id)
       or not public.has_organization_role(
         maintenance_organization_id,
         array['client', 'manager']::public.organization_role[]
       )
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_maintenance_id::text));

  select exists (
    select 1
    from public.maintenance_reports r
    where r.maintenance_id = p_maintenance_id
  )
  into report_exists;

  if report_exists and not caller_is_fleetmaster_admin
     and not public.has_organization_role(
       maintenance_organization_id,
       array['manager']::public.organization_role[]
     ) then
    raise exception 'maintenance report update requires manager permissions';
  end if;

  if report_exists then
    update public.maintenance_reports
    set
      entry_at = p_entry_at,
      exit_at = p_exit_at,
      entry_mileage = p_entry_mileage,
      reason = nullif(btrim(p_reason), ''),
      reception_conditions = p_reception_conditions,
      diagnosis = nullif(btrim(p_diagnosis), ''),
      recommendations = nullif(btrim(p_recommendations), ''),
      pending_work = nullif(btrim(p_pending_work), ''),
      closed_by = nullif(btrim(p_closed_by), ''),
      closure_notes = nullif(btrim(p_closure_notes), '')
    where maintenance_id = p_maintenance_id
    returning * into saved_report;
  else
    insert into public.maintenance_reports (
      organization_id,
      maintenance_id,
      entry_at,
      exit_at,
      entry_mileage,
      reason,
      reception_conditions,
      diagnosis,
      recommendations,
      pending_work,
      closed_by,
      closure_notes
    )
    values (
      maintenance_organization_id,
      p_maintenance_id,
      p_entry_at,
      p_exit_at,
      p_entry_mileage,
      nullif(btrim(p_reason), ''),
      p_reception_conditions,
      nullif(btrim(p_diagnosis), ''),
      nullif(btrim(p_recommendations), ''),
      nullif(btrim(p_pending_work), ''),
      nullif(btrim(p_closed_by), ''),
      nullif(btrim(p_closure_notes), '')
    )
    returning * into saved_report;
  end if;

  return saved_report;
end;
$$;

revoke all on function public.save_maintenance_report(
  uuid,
  timestamptz,
  timestamptz,
  integer,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.save_maintenance_report(
  uuid,
  timestamptz,
  timestamptz,
  integer,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  text
) to authenticated;

revoke execute on function public.prevent_maintenance_report_scope_change()
  from public, anon, authenticated;
