-- WhatsApp-style account identity: a discoverable username and a private,
-- international-format mobile number.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists phone_number text;

-- Give existing members a deterministic unique username.
update public.profiles
set username = left(
  coalesce(
    nullif(lower(regexp_replace(name, '[^a-zA-Z0-9_]', '', 'g')), ''),
    'user'
  ),
  16
) || '_' || left(replace(id::text, '-', ''), 6)
where username is null or username = '';

update public.profiles set username = lower(trim(leading '@' from username));
update public.profiles set phone_number = null where btrim(phone_number) = '';

alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username ~ '^[a-z0-9_]{3,24}$');

alter table public.profiles drop constraint if exists profiles_phone_number_format_check;
alter table public.profiles add constraint profiles_phone_number_format_check
  check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$');

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username));
create unique index if not exists profiles_phone_number_unique_idx
  on public.profiles (phone_number) where phone_number is not null;

alter table public.profiles alter column username set not null;

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select candidate is not null
    and lower(trim(leading '@' from candidate)) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1 from public.profiles
      where lower(username) = lower(trim(leading '@' from candidate))
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.get_profile_identity(check_profile_id uuid)
returns table (
  id uuid,
  name text,
  avatar_url text,
  username text,
  phone_number text,
  created_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    profile.id,
    profile.name,
    profile.avatar_url,
    profile.username,
    case
      when profile.id = auth.uid()
        or public.users_share_conversation(profile.id)
      then profile.phone_number
      else null
    end,
    profile.created_at
  from public.profiles profile
  where profile.id = check_profile_id
    and auth.uid() is not null;
$$;

revoke all on function public.get_profile_identity(uuid) from public;
grant execute on function public.get_profile_identity(uuid) to authenticated;

create or replace function public.update_my_identity(
  new_username text,
  new_phone_number text default null
)
returns table (updated_username text, updated_phone_number text)
language plpgsql
security definer set search_path = public
as $$
declare
  normalized_username text := lower(trim(leading '@' from btrim(new_username)));
  normalized_phone text := nullif(btrim(new_phone_number), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  if normalized_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers, or underscores';
  end if;
  if normalized_phone is not null and normalized_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use an international mobile number such as +919876543210';
  end if;

  update public.profiles
  set username = normalized_username, phone_number = normalized_phone
  where profiles.id = auth.uid();

  return query select normalized_username, normalized_phone;
exception
  when unique_violation then
    if exists (
      select 1 from public.profiles
      where lower(username) = normalized_username and id <> auth.uid()
    ) then
      raise exception 'That username is already taken';
    end if;
    raise exception 'That mobile number is already linked to another account';
end;
$$;

revoke all on function public.update_my_identity(text, text) from public;
grant execute on function public.update_my_identity(text, text) to authenticated;

-- Keep phone numbers out of normal profile-directory queries. The RPC above
-- reveals one only to its owner or an existing conversation contact.
revoke select on table public.profiles from anon, authenticated;
grant select (id, name, avatar_url, username, created_at)
  on table public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  profile_name text;
  requested_username text;
  generated_username text;
  requested_phone text;
begin
  profile_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'User'
  );
  requested_username := lower(trim(leading '@' from coalesce(new.raw_user_meta_data->>'username', '')));
  generated_username := left(
    coalesce(nullif(lower(regexp_replace(profile_name, '[^a-zA-Z0-9_]', '', 'g')), ''), 'user'),
    16
  ) || '_' || left(replace(new.id::text, '-', ''), 6);
  requested_phone := coalesce(
    new.raw_user_meta_data->>'phone_number',
    nullif(new.phone, '')
  );

  if requested_username !~ '^[a-z0-9_]{3,24}$'
    or exists (select 1 from public.profiles where lower(username) = requested_username)
  then
    requested_username := generated_username;
  end if;
  if requested_phone !~ '^\+[1-9][0-9]{7,14}$'
    or exists (select 1 from public.profiles where phone_number = requested_phone)
  then
    requested_phone := null;
  end if;

  insert into public.profiles (id, name, avatar_url, username, phone_number)
  values (
    new.id,
    profile_name,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    requested_username,
    requested_phone
  )
  on conflict (id) do nothing;

  insert into public.rooms (name, description, created_by, room_type)
  values (
    'My Space',
    'Your private place for notes, ideas, and saved messages.',
    new.id,
    'personal'
  )
  on conflict (created_by) where room_type = 'personal' do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
notify pgrst, 'reload schema';
