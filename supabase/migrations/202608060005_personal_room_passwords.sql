create extension if not exists pgcrypto with schema extensions;

-- Self-contained prerequisites. These make this migration safe to run even
-- when the earlier personal/group-room migration was skipped.
alter table public.rooms
  add column if not exists room_type text not null default 'group';

create unique index if not exists rooms_one_personal_per_user_idx
  on public.rooms(created_by)
  where room_type = 'personal';

create or replace function public.is_room_member(check_room_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = check_room_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

create or replace function public.is_room_member_path(check_room_id text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return public.is_room_member(check_room_id::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.is_room_member_path(text) from public;
grant execute on function public.is_room_member_path(text) to authenticated;

create or replace function public.is_group_room(check_room_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.rooms
    where id = check_room_id
      and room_type = 'group'
  );
$$;

revoke all on function public.is_group_room(uuid) from public;
grant execute on function public.is_group_room(uuid) to authenticated;

create or replace function public.add_room_creator_as_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.room_members (room_id, user_id, is_admin)
  values (new.id, new.created_by, true)
  on conflict (room_id, user_id)
  do update set is_admin = true;
  return new;
end;
$$;

revoke all on function public.add_room_creator_as_admin() from public;

drop trigger if exists add_room_creator_as_admin on public.rooms;
create trigger add_room_creator_as_admin
  after insert on public.rooms
  for each row execute function public.add_room_creator_as_admin();

insert into public.room_members (room_id, user_id, is_admin)
select id, created_by, true
from public.rooms
where created_by is not null
on conflict (room_id, user_id)
do update set is_admin = true;

insert into public.rooms (name, description, created_by, room_type)
select
  'My Space',
  'Your private place for notes, ideas, and saved messages.',
  profile.id,
  'personal'
from public.profiles profile
where not exists (
  select 1 from public.rooms room
  where room.created_by = profile.id
    and room.room_type = 'personal'
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'User'
  );

  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    profile_name,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
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

create or replace view public.room_summaries
with (security_invoker = true)
as
select
  room.id,
  room.name,
  room.description,
  room.created_by,
  room.created_at,
  latest.id as last_message_id,
  latest.text as last_message_text,
  latest.created_at as last_message_created_at,
  latest.author_id as last_author_id,
  latest.file_path as last_file_path,
  latest.file_name as last_file_name,
  latest.file_type as last_file_type,
  latest.file_size as last_file_size,
  author.name as last_author_name,
  author.avatar_url as last_author_avatar,
  room.room_type
from public.rooms room
left join lateral (
  select
    message.id,
    message.text,
    message.created_at,
    message.author_id,
    message.file_path,
    message.file_name,
    message.file_type,
    message.file_size
  from public.messages message
  where message.room_id = room.id
  order by message.created_at desc
  limit 1
) latest on true
left join public.profiles author on author.id = latest.author_id;

grant select on public.room_summaries to authenticated;

create table if not exists public.personal_room_locks (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_room_unlocks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unlocked_until timestamptz not null,
  primary key (room_id, user_id)
);

create table if not exists public.personal_room_unlock_attempts (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);

create index if not exists personal_room_unlocks_expiry_idx
  on public.personal_room_unlocks(unlocked_until);

create index if not exists personal_room_attempts_recent_idx
  on public.personal_room_unlock_attempts(room_id, user_id, attempted_at desc);

alter table public.personal_room_locks enable row level security;
alter table public.personal_room_unlocks enable row level security;
alter table public.personal_room_unlock_attempts enable row level security;

create or replace function public.is_personal_room_accessible(check_room_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.rooms room
    where room.id = check_room_id
      and public.is_room_member(room.id)
      and (
        room.room_type <> 'personal'
        or not exists (
          select 1 from public.personal_room_locks room_lock
          where room_lock.room_id = room.id
        )
        or exists (
          select 1 from public.personal_room_unlocks room_unlock
          where room_unlock.room_id = room.id
            and room_unlock.user_id = auth.uid()
            and room_unlock.unlocked_until > now()
        )
      )
  );
$$;

revoke all on function public.is_personal_room_accessible(uuid) from public;
grant execute on function public.is_personal_room_accessible(uuid) to authenticated;

create or replace function public.is_personal_room_accessible_path(check_room_id text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return public.is_personal_room_accessible(check_room_id::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.is_personal_room_accessible_path(text) from public;
grant execute on function public.is_personal_room_accessible_path(text) to authenticated;

create or replace function public.get_personal_room_access(check_room_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  is_personal boolean;
  has_room_password boolean;
  access_expiry timestamptz;
begin
  if not public.is_room_member(check_room_id) then
    raise exception 'Room not found';
  end if;

  select room_type = 'personal'
  into is_personal
  from public.rooms
  where id = check_room_id;

  if not is_personal then
    return jsonb_build_object(
      'isPersonal', false,
      'hasPassword', false,
      'unlocked', true,
      'unlockedUntil', null
    );
  end if;

  select exists (
    select 1 from public.personal_room_locks
    where room_id = check_room_id
  ) into has_room_password;

  select unlocked_until
  into access_expiry
  from public.personal_room_unlocks
  where room_id = check_room_id
    and user_id = auth.uid()
    and unlocked_until > now();

  return jsonb_build_object(
    'isPersonal', true,
    'hasPassword', has_room_password,
    'unlocked', not has_room_password or access_expiry is not null,
    'unlockedUntil', access_expiry
  );
end;
$$;

revoke all on function public.get_personal_room_access(uuid) from public;
grant execute on function public.get_personal_room_access(uuid) to authenticated;

create or replace function public.set_personal_room_password(
  check_room_id uuid,
  new_password text
)
returns timestamptz
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  access_expiry timestamptz := now() + interval '30 minutes';
begin
  if length(new_password) < 6 or length(new_password) > 128 then
    raise exception 'Password must contain between 6 and 128 characters';
  end if;

  if not exists (
    select 1 from public.rooms
    where id = check_room_id
      and room_type = 'personal'
      and created_by = auth.uid()
  ) then
    raise exception 'Personal room not found';
  end if;

  if exists (
    select 1 from public.personal_room_locks
    where room_id = check_room_id
  ) and not exists (
    select 1 from public.personal_room_unlocks
    where room_id = check_room_id
      and user_id = auth.uid()
      and unlocked_until > now()
  ) then
    raise exception 'Unlock the room before changing its password';
  end if;

  insert into public.personal_room_locks (room_id, password_hash, updated_at)
  values (
    check_room_id,
    crypt(new_password, gen_salt('bf', 11)),
    now()
  )
  on conflict (room_id) do update
  set password_hash = excluded.password_hash, updated_at = now();

  delete from public.personal_room_unlocks
  where room_id = check_room_id;

  insert into public.personal_room_unlocks (room_id, user_id, unlocked_until)
  values (check_room_id, auth.uid(), access_expiry)
  on conflict (room_id, user_id) do update
  set unlocked_until = excluded.unlocked_until;

  return access_expiry;
end;
$$;

revoke all on function public.set_personal_room_password(uuid, text) from public;
grant execute on function public.set_personal_room_password(uuid, text) to authenticated;

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
    return null;
  end if;

  select password_hash
  into stored_hash
  from public.personal_room_locks
  where room_id = check_room_id;

  if stored_hash is null then
    return access_expiry;
  end if;

  select count(*)
  into recent_failures
  from public.personal_room_unlock_attempts
  where room_id = check_room_id
    and user_id = auth.uid()
    and succeeded = false
    and attempted_at > now() - interval '10 minutes';

  if recent_failures >= 5 then
    return null;
  end if;

  if crypt(room_password, stored_hash) <> stored_hash then
    insert into public.personal_room_unlock_attempts (
      room_id,
      user_id,
      succeeded
    ) values (check_room_id, auth.uid(), false);
    return null;
  end if;

  insert into public.personal_room_unlock_attempts (
    room_id,
    user_id,
    succeeded
  ) values (check_room_id, auth.uid(), true);

  delete from public.personal_room_unlock_attempts
  where room_id = check_room_id
    and user_id = auth.uid()
    and attempted_at < now() - interval '1 day';

  insert into public.personal_room_unlocks (room_id, user_id, unlocked_until)
  values (check_room_id, auth.uid(), access_expiry)
  on conflict (room_id, user_id) do update
  set unlocked_until = excluded.unlocked_until;

  return access_expiry;
end;
$$;

revoke all on function public.unlock_personal_room(uuid, text) from public;
grant execute on function public.unlock_personal_room(uuid, text) to authenticated;

create or replace function public.lock_personal_room(check_room_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.personal_room_unlocks
  where room_id = check_room_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.lock_personal_room(uuid) from public;
grant execute on function public.lock_personal_room(uuid) to authenticated;

create or replace function public.remove_personal_room_password(check_room_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rooms
    where id = check_room_id
      and room_type = 'personal'
      and created_by = auth.uid()
  ) then
    raise exception 'Personal room not found';
  end if;

  if not exists (
    select 1 from public.personal_room_unlocks
    where room_id = check_room_id
      and user_id = auth.uid()
      and unlocked_until > now()
  ) then
    raise exception 'Unlock the room before removing its password';
  end if;

  delete from public.personal_room_locks
  where room_id = check_room_id;

  delete from public.personal_room_unlocks
  where room_id = check_room_id;
end;
$$;

revoke all on function public.remove_personal_room_password(uuid) from public;
grant execute on function public.remove_personal_room_password(uuid) to authenticated;

drop policy if exists "Members can view room messages" on public.messages;
create policy "Members can view room messages"
on public.messages for select to authenticated
using (
  public.is_room_member(room_id)
  and public.is_personal_room_accessible(room_id)
);

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
on public.messages for insert to authenticated
with check (
  auth.uid() = author_id
  and public.is_room_member(room_id)
  and public.is_personal_room_accessible(room_id)
);

drop policy if exists "Authors can edit messages" on public.messages;
create policy "Authors can edit messages"
on public.messages for update to authenticated
using (
  auth.uid() = author_id
  and public.is_room_member(room_id)
  and public.is_personal_room_accessible(room_id)
)
with check (
  auth.uid() = author_id
  and public.is_room_member(room_id)
  and public.is_personal_room_accessible(room_id)
);

drop policy if exists "Authors and admins can delete messages" on public.messages;
create policy "Authors and admins can delete messages"
on public.messages for delete to authenticated
using (
  public.is_room_member(room_id)
  and public.is_personal_room_accessible(room_id)
  and (
    auth.uid() = author_id
    or (public.is_group_room(room_id) and public.is_room_admin(room_id))
  )
);

drop policy if exists "Members can view message reactions" on public.message_likes;
create policy "Members can view message reactions"
on public.message_likes for select to authenticated
using (
  exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.is_personal_room_accessible(message.room_id)
  )
);

drop policy if exists "Members can add their own reactions" on public.message_likes;
create policy "Members can add their own reactions"
on public.message_likes for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.is_personal_room_accessible(message.room_id)
  )
);

drop policy if exists "Members can remove their own reactions" on public.message_likes;
create policy "Members can remove their own reactions"
on public.message_likes for delete to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.is_personal_room_accessible(message.room_id)
  )
);

drop policy if exists "Members can read chat files" on storage.objects;
create policy "Members can read chat files"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and public.is_room_member_path((storage.foldername(name))[2])
  and public.is_personal_room_accessible_path((storage.foldername(name))[2])
);

drop policy if exists "Members can upload their own chat files" on storage.objects;
create policy "Members can upload their own chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_room_member_path((storage.foldername(name))[2])
  and public.is_personal_room_accessible_path((storage.foldername(name))[2])
);

drop policy if exists "Members can delete their own chat files" on storage.objects;
create policy "Members can delete their own chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_room_member_path((storage.foldername(name))[2])
  and public.is_personal_room_accessible_path((storage.foldername(name))[2])
);

notify pgrst, 'reload schema';
