do $migration$
begin
  execute $create$
create or replace function public.set_organization_operational_access_atomic(
  p_organization_id uuid,
  p_enabled boolean,
  p_reason_code text,
  p_reason_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  organization_row public.organizations;
  normalized_reason_code text := nullif(btrim(coalesce(p_reason_code, '')), '');
  normalized_reason_note text := nullif(btrim(coalesce(p_reason_note, '')), '');
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin() then
    raise exception 'fleetmaster admin required';
  end if;

  if p_organization_id is null then
    raise exception 'organization is required';
  end if;

  if p_enabled is null then
    raise exception 'enabled is required';
  end if;

  if normalized_reason_code is null or normalized_reason_code not in (
    'manual', 'maintenance', 'administrative', 'security', 'payment', 'other'
  ) then
    raise exception 'invalid operational access reason';
  end if;

  if normalized_reason_note is not null and length(normalized_reason_note) > 1000 then
    raise exception 'operational access reason note is too long';
  end if;

  select o.*
    into organization_row
    from public.organizations o
   where o.id = p_organization_id
   for update;

  if not found then
    raise exception 'organization not found';
  end if;

  if organization_row.operational_access_manually_enabled = p_enabled then
    return jsonb_build_object(
      'organization_id', organization_row.id,
      'organization_name', organization_row.name,
      'operational_access_manually_enabled', organization_row.operational_access_manually_enabled,
      'operational_access_changed_at', organization_row.operational_access_changed_at,
      'operational_access_changed_by', organization_row.operational_access_changed_by,
      'operational_access_reason_code', organization_row.operational_access_reason_code,
      'operational_access_reason_note', organization_row.operational_access_reason_note,
      'transitioned', false
    );
  end if;

  update public.organizations o
     set operational_access_manually_enabled = p_enabled,
         operational_access_changed_at = now(),
         operational_access_changed_by = current_user_id,
         operational_access_reason_code = normalized_reason_code,
         operational_access_reason_note = normalized_reason_note,
         updated_at = now()
   where o.id = p_organization_id
   returning o.* into organization_row;

  insert into public.organization_operational_access_events (
    organization_id,
    enabled,
    changed_by,
    changed_at,
    reason_code,
    reason_note
  )
  values (
    organization_row.id,
    organization_row.operational_access_manually_enabled,
    current_user_id,
    organization_row.operational_access_changed_at,
    normalized_reason_code,
    normalized_reason_note
  );

  return jsonb_build_object(
    'organization_id', organization_row.id,
    'organization_name', organization_row.name,
    'operational_access_manually_enabled', organization_row.operational_access_manually_enabled,
    'operational_access_changed_at', organization_row.operational_access_changed_at,
    'operational_access_changed_by', organization_row.operational_access_changed_by,
    'operational_access_reason_code', organization_row.operational_access_reason_code,
    'operational_access_reason_note', organization_row.operational_access_reason_note,
    'transitioned', true
  );
end;
$function$;
$create$;

  execute 'revoke all on function public.set_organization_operational_access_atomic(uuid, boolean, text, text) from public, anon, authenticated';
  execute 'grant execute on function public.set_organization_operational_access_atomic(uuid, boolean, text, text) to authenticated';
end;
$migration$;
