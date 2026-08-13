-- Privacy-preserving contact discovery. Clients submit exact E.164 phone
-- numbers from an explicitly authorized address book; only public profile
-- fields are returned and submitted numbers are never stored.
create table if not exists public.contact_discovery_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists contact_discovery_requests_user_time_idx
on public.contact_discovery_requests(user_id, requested_at desc);

alter table public.contact_discovery_requests enable row level security;
revoke all on table public.contact_discovery_requests from public, anon, authenticated;

create or replace function public.find_profiles_by_phone_contacts(contact_numbers text[])
returns table (
  id uuid,
  name text,
  avatar_url text,
  username text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  requested_count integer := coalesce(cardinality(contact_numbers), 0);
begin
  if caller_id is null then
    raise exception 'You must be signed in';
  end if;
  if requested_count < 1 or requested_count > 500 then
    raise exception 'Choose between 1 and 500 contact numbers';
  end if;
  if (
    select count(*) from public.contact_discovery_requests request
    where request.user_id = caller_id
      and request.requested_at > now() - interval '1 minute'
  ) >= 10 then
    raise exception 'Please wait before checking contacts again';
  end if;

  insert into public.contact_discovery_requests(user_id) values (caller_id);
  delete from public.contact_discovery_requests
  where requested_at < now() - interval '1 day';

  return query
  with submitted_phone as (
    select distinct btrim(phone) as phone
    from unnest(contact_numbers) as phone
    where btrim(phone) ~ '^\+[1-9][0-9]{7,14}$'
  )
  select profile.id, profile.name, profile.avatar_url, profile.username, profile.created_at
  from public.profiles profile
  join submitted_phone submitted on submitted.phone = profile.phone_number
  where profile.id <> caller_id
  order by lower(profile.name)
  limit 100;
end;
$$;

revoke all on function public.find_profiles_by_phone_contacts(text[]) from public;
grant execute on function public.find_profiles_by_phone_contacts(text[]) to authenticated;

notify pgrst, 'reload schema';
