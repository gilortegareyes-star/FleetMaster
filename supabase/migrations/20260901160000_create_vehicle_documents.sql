insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-documents',
  'vehicle-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  document_type text not null check (
    document_type in (
      'insurance_policy',
      'registration_card',
      'vehicle_inspection',
      'other'
    )
  ),
  document_number text,
  issuer text,
  valid_from date,
  valid_until date,
  cost numeric(12, 2) check (cost is null or cost >= 0),
  contact_name text,
  contact_phone text,
  notes text,
  storage_bucket text not null default 'vehicle-documents' check (storage_bucket = 'vehicle-documents'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_documents_insurance_required_fields check (
    document_type <> 'insurance_policy'
    or (
      issuer is not null
      and length(btrim(issuer)) > 0
      and document_number is not null
      and length(btrim(document_number)) > 0
      and valid_until is not null
    )
  )
);

create index if not exists vehicle_documents_vehicle_id_idx
  on public.vehicle_documents (vehicle_id);

create index if not exists vehicle_documents_document_type_idx
  on public.vehicle_documents (document_type);

create index if not exists vehicle_documents_vehicle_type_created_idx
  on public.vehicle_documents (vehicle_id, document_type, created_at desc);

create unique index if not exists vehicle_documents_one_current_per_type_idx
  on public.vehicle_documents (vehicle_id, document_type)
  where is_current;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_vehicle_documents_updated_at'
      and tgrelid = 'public.vehicle_documents'::regclass
  ) then
    create trigger set_vehicle_documents_updated_at
    before update on public.vehicle_documents
    for each row
    execute function public.set_vehicles_updated_at();
  end if;
end;
$$;

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
  p_file_size bigint
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

alter table public.vehicle_documents enable row level security;

comment on table public.vehicle_documents is
  'FleetMaster II vehicle document metadata. Temporary RLS policies allow anon select, insert and update while authentication is not implemented. No anon delete policy is created.';

comment on function public.create_vehicle_document_version is
  'Creates a new vehicle document version and marks previous versions of the same type as non-current in one transaction.';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_documents'
      and policyname = 'vehicle_documents_select_policy'
  ) then
    create policy vehicle_documents_select_policy
      on public.vehicle_documents
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_documents'
      and policyname = 'vehicle_documents_insert_policy'
  ) then
    create policy vehicle_documents_insert_policy
      on public.vehicle_documents
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_documents'
      and policyname = 'vehicle_documents_update_policy'
  ) then
    create policy vehicle_documents_update_policy
      on public.vehicle_documents
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

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
  bigint
) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vehicle_documents_storage_select_policy'
  ) then
    create policy vehicle_documents_storage_select_policy
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'vehicle-documents');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'vehicle_documents_storage_insert_policy'
  ) then
    create policy vehicle_documents_storage_insert_policy
      on storage.objects
      for insert
      to anon, authenticated
      with check (
        bucket_id = 'vehicle-documents'
        and lower(storage.extension(name)) = any (array['pdf', 'jpg', 'jpeg', 'png'])
      );
  end if;
end;
$$;
