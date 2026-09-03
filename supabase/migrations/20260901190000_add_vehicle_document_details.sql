alter table public.vehicle_documents
add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.vehicle_documents.details is
  'Structured metadata for document-type-specific fields, such as plate snapshot, issuing state or inspection result.';

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
  bigint
);

create or replace function public.create_vehicle_document_version(
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
  p_details jsonb default '{}'::jsonb
)
returns public.vehicle_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_document public.vehicle_documents;
begin
  perform pg_advisory_xact_lock(hashtext(p_vehicle_id::text || ':' || p_document_type));

  update public.vehicle_documents
  set is_current = false
  where vehicle_id = p_vehicle_id
    and document_type = p_document_type
    and is_current = true;

  insert into public.vehicle_documents (
    vehicle_id,
    document_type,
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
  jsonb
) is
  'Creates a new vehicle document version with structured details and marks previous versions of the same type as non-current in one transaction.';

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
  jsonb
) to anon, authenticated;
