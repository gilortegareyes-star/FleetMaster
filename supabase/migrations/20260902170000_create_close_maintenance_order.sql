create or replace function public.close_maintenance_order(
  p_maintenance_id uuid,
  p_status text,
  p_exit_at timestamptz,
  p_mileage integer,
  p_next_service_mileage integer,
  p_next_service_date date,
  p_closure_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entry_mileage integer;
  v_diagnosis text;
  v_recommendations text;
  v_pending_work text;
begin
  if p_status not in ('completed', 'partially_completed', 'follow_up_required', 'not_repaired') then
    raise exception 'maintenance-close-invalid-status';
  end if;

  if p_exit_at is null then
    raise exception 'maintenance-close-exit-required';
  end if;

  if p_mileage is null or p_mileage < 0 then
    raise exception 'maintenance-close-mileage-invalid';
  end if;

  perform 1
  from public.maintenance_records
  where id = p_maintenance_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'maintenance-close-not-open';
  end if;

  select entry_mileage, diagnosis, recommendations, pending_work
  into v_entry_mileage, v_diagnosis, v_recommendations, v_pending_work
  from public.maintenance_reports
  where maintenance_id = p_maintenance_id
  for update;

  if not found then
    raise exception 'maintenance-close-report-missing';
  end if;

  if v_entry_mileage is not null and p_mileage < v_entry_mileage then
    raise exception 'maintenance-close-mileage-before-entry';
  end if;

  if not exists (
    select 1
    from public.maintenance_work_items
    where maintenance_id = p_maintenance_id
  ) and nullif(btrim(coalesce(v_diagnosis, '')), '') is null
    and nullif(btrim(coalesce(p_closure_notes, '')), '') is null then
    raise exception 'maintenance-close-content-required';
  end if;

  if p_status = 'follow_up_required'
    and nullif(btrim(coalesce(v_pending_work, '')), '') is null
    and nullif(btrim(coalesce(v_recommendations, '')), '') is null
    and p_next_service_mileage is null
    and p_next_service_date is null then
    raise exception 'maintenance-close-follow-up-required';
  end if;

  update public.maintenance_reports
  set
    exit_at = p_exit_at,
    closure_notes = nullif(btrim(p_closure_notes), '')
  where maintenance_id = p_maintenance_id;

  update public.maintenance_records
  set
    status = p_status,
    mileage = p_mileage,
    service_date = (p_exit_at at time zone 'America/Mexico_City')::date,
    next_service_mileage = p_next_service_mileage,
    next_service_date = p_next_service_date
  where id = p_maintenance_id;

  return p_maintenance_id;
end;
$$;

revoke all on function public.close_maintenance_order(uuid, text, timestamptz, integer, integer, date, text) from public;
grant execute on function public.close_maintenance_order(uuid, text, timestamptz, integer, integer, date, text) to anon, authenticated;

comment on function public.close_maintenance_order(uuid, text, timestamptz, integer, integer, date, text) is
  'Atomically finalizes an open maintenance order after progress has been persisted. Lifecycle triggers set closed_at and advance vehicle mileage.';
