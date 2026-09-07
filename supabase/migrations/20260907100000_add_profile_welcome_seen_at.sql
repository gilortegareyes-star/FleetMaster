alter table public.profiles
  add column if not exists welcome_seen_at timestamptz;

grant update (welcome_seen_at) on table public.profiles to authenticated;
