-- Repair personal-space unlock behavior and provide an efficient scoped
-- reaction query for mobile clients.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.unlock_personal_room(
  check_room_id uuid,
  room_password text
)
returns timestamptz
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  stored_hash text;
  recent_failures integer;
  access_expiry timestamptz := now() + interval '30 minutes';
begin
  if not public.is_room_member(check_room_id) then
    raise exception 'Personal room not found';
  end if;

  select password_hash into stored_hash
  from public.personal_room_locks
  where room_id = check_room_id;

  if stored_hash is null then
    return access_expiry;
  end if;

  -- Always validate the supplied password. A correct password must not remain
  -- blocked merely because older failed attempts are still in the audit log.
  if crypt(room_password, stored_hash) <> stored_hash then
    select count(*) into recent_failures
    from public.personal_room_unlock_attempts
    where room_id = check_room_id
      and user_id = auth.uid()
      and succeeded = false
      and attempted_at > now() - interval '10 minutes';

    if recent_failures >= 5 then
      return null;
    end if;

    insert into public.personal_room_unlock_attempts (room_id, user_id, succeeded)
    values (check_room_id, auth.uid(), false);
    return null;
  end if;

  insert into public.personal_room_unlock_attempts (room_id, user_id, succeeded)
  values (check_room_id, auth.uid(), true);

  delete from public.personal_room_unlock_attempts
  where room_id = check_room_id
    and user_id = auth.uid()
    and (succeeded = false or attempted_at < now() - interval '1 day');

  insert into public.personal_room_unlocks (room_id, user_id, unlocked_until)
  values (check_room_id, auth.uid(), access_expiry)
  on conflict (room_id, user_id) do update
  set unlocked_until = excluded.unlocked_until;

  return access_expiry;
end;
$$;

revoke all on function public.unlock_personal_room(uuid, text) from public;
grant execute on function public.unlock_personal_room(uuid, text) to authenticated;

create or replace function public.get_room_message_likes(check_room_id uuid)
returns table(message_id bigint, user_id uuid)
language sql
stable
security definer set search_path = public
as $$
  select reaction.message_id, reaction.user_id
  from public.message_likes reaction
  join public.messages message on message.id = reaction.message_id
  where message.room_id = check_room_id
    and public.is_room_member(check_room_id)
    and public.is_personal_room_accessible(check_room_id);
$$;

revoke all on function public.get_room_message_likes(uuid) from public;
grant execute on function public.get_room_message_likes(uuid) to authenticated;

-- Recover provider avatars for accounts created before the profile trigger
-- copied Google/OAuth picture metadata correctly.
update public.profiles profile
set avatar_url = coalesce(
  auth_user.raw_user_meta_data->>'avatar_url',
  auth_user.raw_user_meta_data->>'picture'
)
from auth.users auth_user
where profile.id = auth_user.id
  and nullif(trim(profile.avatar_url), '') is null
  and nullif(trim(coalesce(
    auth_user.raw_user_meta_data->>'avatar_url',
    auth_user.raw_user_meta_data->>'picture'
  )), '') is not null;

-- Public avatars use a public bucket URL, but this explicit read policy also
-- keeps authenticated SDK/object requests working consistently.
drop policy if exists "Anyone can read profile avatars" on storage.objects;
create policy "Anyone can read profile avatars"
on storage.objects for select to public
using (bucket_id = 'profile-avatars');

-- Existing projects may have missed profile realtime registration.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

notify pgrst, 'reload schema';
