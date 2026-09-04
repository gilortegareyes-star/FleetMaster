alter table public.vehicle_documents
  add column if not exists circulation_type text;

update public.vehicle_documents as document
set circulation_type = 'state'
from public.vehicles as vehicle
where document.document_type = 'registration_card'
  and document.circulation_type is null
  and nullif(regexp_replace(upper(btrim(document.details ->> 'plateNumber')), '[^[:alnum:]]', '', 'g'), '')
      = nullif(regexp_replace(upper(btrim(vehicle.state_license_plate)), '[^[:alnum:]]', '', 'g'), '')
  and nullif(regexp_replace(upper(btrim(document.details ->> 'plateNumber')), '[^[:alnum:]]', '', 'g'), '')
      is distinct from nullif(regexp_replace(upper(btrim(vehicle.federal_license_plate)), '[^[:alnum:]]', '', 'g'), '');

update public.vehicle_documents as document
set circulation_type = 'federal'
from public.vehicles as vehicle
where document.document_type = 'registration_card'
  and document.circulation_type is null
  and nullif(regexp_replace(upper(btrim(document.details ->> 'plateNumber')), '[^[:alnum:]]', '', 'g'), '')
      = nullif(regexp_replace(upper(btrim(vehicle.federal_license_plate)), '[^[:alnum:]]', '', 'g'), '')
  and nullif(regexp_replace(upper(btrim(document.details ->> 'plateNumber')), '[^[:alnum:]]', '', 'g'), '')
      is distinct from nullif(regexp_replace(upper(btrim(vehicle.state_license_plate)), '[^[:alnum:]]', '', 'g'), '');

do $$
declare
  ambiguous_count integer;
begin
  select count(*)
  into ambiguous_count
  from public.vehicle_documents
  where document_type = 'registration_card'
    and circulation_type is null;

  if ambiguous_count > 0 then
    raise exception using
      message = 'Ambiguous registration_card records require review before migration',
      detail = format('%s registration_card record(s) could not be matched unambiguously to a state or federal vehicle plate.', ambiguous_count),
      hint = 'Review details.plateNumber against vehicles.state_license_plate and vehicles.federal_license_plate, then rerun this migration.';
  end if;
end;
$$;

alter table public.vehicle_documents
  add constraint vehicle_documents_circulation_type_check
  check (
    (document_type = 'registration_card' and circulation_type in ('state', 'federal'))
    or (document_type <> 'registration_card' and circulation_type is null)
  );

drop index if exists public.vehicle_documents_one_current_per_type_idx;

create unique index vehicle_documents_one_current_per_scope_idx
  on public.vehicle_documents (
    vehicle_id,
    document_type,
    coalesce(circulation_type, 'legacy')
  )
  where is_current;

drop function if exists public.create_vehicle_document_version(
  uuid,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb
);

create function public.create_vehicle_document_version(
  p_vehicle_id uuid,
  p_document_type text,
  p_document_number text,
  p_issuer text,
  p_valid_from date,
  p_valid_until date,
  p_cost numeric,
  p_contact_name text,
  p_contact_phone text,
  p_notes text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_details jsonb default '{}'::jsonb,
  p_circulation_type text default null
)
returns public.vehicle_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_document public.vehicle_documents;
begin
  if p_document_type = 'registration_card' and (p_circulation_type is null or p_circulation_type not in ('state', 'federal')) then
    raise exception 'registration_card requires circulation_type state or federal';
  end if;

  if p_document_type <> 'registration_card' and p_circulation_type is not null then
    raise exception 'circulation_type is only valid for registration_card';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_vehicle_id::text || ':' || p_document_type || ':' || coalesce(p_circulation_type, 'legacy')));

  update public.vehicle_documents
  set is_current = false
  where vehicle_id = p_vehicle_id
    and document_type = p_document_type
    and is_current = true
    and (
      p_document_type <> 'registration_card'
      or circulation_type = p_circulation_type
    );

  insert into public.vehicle_documents (
    vehicle_id,
    document_type,
    circulation_type,
    document_number,
    issuer,
    valid_from,
    valid_until,
    cost,
    contact_name,
    contact_phone,
    notes,
    details,
    storage_path,
    original_filename,
    mime_type,
    file_size,
    is_current
  )
  values (
    p_vehicle_id,
    p_document_type,
    p_circulation_type,
    nullif(btrim(p_document_number), ''),
    nullif(btrim(p_issuer), ''),
    p_valid_from,
    p_valid_until,
    p_cost,
    nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_phone), ''),
    nullif(btrim(p_notes), ''),
    coalesce(p_details, '{}'::jsonb),
    p_storage_path,
    p_original_filename,
    p_mime_type,
    p_file_size,
    true
  )
  returning * into created_document;

  return created_document;
end;
$$;

comment on function public.create_vehicle_document_version(
  uuid,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text
) is
  'Creates a new vehicle document version and independently versions state or federal registration cards.';

grant execute on function public.create_vehicle_document_version(
  uuid,
  text,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  bigint,
  jsonb,
  text
) to anon, authenticated;
