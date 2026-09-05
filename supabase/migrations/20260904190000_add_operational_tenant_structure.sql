-- Establish tenant ownership for operational records. RLS is intentionally unchanged.

alter table public.vehicles
  add column organization_id uuid not null,
  add constraint vehicles_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint vehicles_id_organization_id_key unique (id, organization_id);

create index vehicles_organization_id_idx on public.vehicles (organization_id);

alter table public.vehicle_documents
  add column organization_id uuid not null,
  add constraint vehicle_documents_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint vehicle_documents_vehicle_organization_id_fkey
    foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id) on delete restrict;

create index vehicle_documents_organization_id_idx on public.vehicle_documents (organization_id);

alter table public.maintenance_records
  add column organization_id uuid not null,
  add constraint maintenance_records_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_records_id_organization_id_key unique (id, organization_id),
  add constraint maintenance_records_vehicle_organization_id_fkey
    foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id) on delete restrict;

create index maintenance_records_organization_id_idx on public.maintenance_records (organization_id);

alter table public.maintenance_reports
  add column organization_id uuid not null,
  add constraint maintenance_reports_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_reports_maintenance_organization_id_fkey
    foreign key (maintenance_id, organization_id) references public.maintenance_records(id, organization_id) on delete cascade;

create index maintenance_reports_organization_id_idx on public.maintenance_reports (organization_id);

alter table public.maintenance_work_items
  add column organization_id uuid not null,
  add constraint maintenance_work_items_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_work_items_maintenance_organization_id_fkey
    foreign key (maintenance_id, organization_id) references public.maintenance_records(id, organization_id) on delete cascade;

create index maintenance_work_items_organization_id_idx on public.maintenance_work_items (organization_id);

alter table public.maintenance_parts
  add column organization_id uuid not null,
  add constraint maintenance_parts_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_parts_maintenance_organization_id_fkey
    foreign key (maintenance_id, organization_id) references public.maintenance_records(id, organization_id) on delete cascade;

create index maintenance_parts_organization_id_idx on public.maintenance_parts (organization_id);

alter table public.maintenance_cost_items
  add column organization_id uuid not null,
  add constraint maintenance_cost_items_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_cost_items_maintenance_organization_id_fkey
    foreign key (maintenance_id, organization_id) references public.maintenance_records(id, organization_id) on delete cascade;

create index maintenance_cost_items_organization_id_idx on public.maintenance_cost_items (organization_id);

-- Keep the existing unassigned legacy counter row while allowing one counter per tenant and year.
alter table public.maintenance_folio_counters
  add column organization_id uuid,
  drop constraint maintenance_folio_counters_pkey,
  add constraint maintenance_folio_counters_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint maintenance_folio_counters_organization_year_key unique (organization_id, year);

create index maintenance_folio_counters_organization_id_idx
  on public.maintenance_folio_counters (organization_id);

create or replace function public.assign_maintenance_folio_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creation_year integer;
  sequence_number integer;
begin
  if new.created_at is null then
    new.created_at = now();
  end if;

  creation_year := extract(year from new.created_at at time zone 'UTC')::integer;

  insert into public.maintenance_folio_counters (organization_id, year, last_value)
  values (new.organization_id, creation_year, 1)
  on conflict (organization_id, year) do update
  set last_value = public.maintenance_folio_counters.last_value + 1
  returning last_value into sequence_number;

  new.folio := format('OM-%s-%s', creation_year, lpad(sequence_number::text, 4, '0'));

  return new;
end;
$$;
