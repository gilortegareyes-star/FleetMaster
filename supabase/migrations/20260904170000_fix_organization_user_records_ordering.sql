create or replace function public.get_organization_user_records(p_organization_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  role public.organization_role,
  status text,
  record_type text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_fleetmaster_admin()
     and (
       not public.has_organization_role(
         p_organization_id,
         array['manager']::public.organization_role[]
       )
       or not exists (
         select 1
         from public.organizations o
         where o.id = p_organization_id
           and o.status = 'active'
       )
     ) then
    raise exception 'insufficient organization permissions';
  end if;

  return query
  select records.*
  from (
    select
      m.id,
      m.user_id,
      nullif(btrim(coalesce(p.display_name, '')), ''),
      u.email,
      m.role,
      m.status::text,
      'membership'::text,
      m.created_at,
      null::timestamptz,
      null::timestamptz
    from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.status = 'active'

    union all

    select
      i.id,
      null::uuid,
      nullif(btrim(coalesce(i.invitee_name, '')), ''),
      i.email,
      i.role,
      i.status::text,
      'invitation'::text,
      i.created_at,
      i.expires_at,
      null::timestamptz
    from public.organization_invitations i
    where i.organization_id = p_organization_id
      and i.status = 'pending'
      and i.expires_at > now()
  ) records
  order by records.created_at desc, records.email asc;
end;
$$;
