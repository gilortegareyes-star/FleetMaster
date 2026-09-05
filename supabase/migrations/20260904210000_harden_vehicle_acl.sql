-- Make vehicle table and trigger-function privileges explicit.

revoke all on table public.vehicles from public, anon, authenticated;
grant select, insert, update on table public.vehicles to authenticated;

revoke execute on function public.prevent_vehicle_organization_change()
  from public, anon, authenticated;
