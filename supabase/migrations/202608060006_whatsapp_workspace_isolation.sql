-- Convert ChatSpace from a shared public workspace into account-scoped,
-- WhatsApp-style conversations.
alter table public.rooms
  add column if not exists room_type text not null default 'group';

alter table public.rooms
  add column if not exists direct_key text;

alter table public.rooms
  drop constraint if exists rooms_room_type_check;

-- Upgrade direct-message rooms created by the frontend compatibility path.
update public.rooms
set
  room_type = 'direct',
  direct_key = substring(description from length('chatspace-direct:') + 1),
  description = 'A private conversation between two people.'
where description like 'chatspace-direct:%'
  and direct_key is null;

alter table public.rooms
  add constraint rooms_room_type_check
  check (
    (room_type in ('personal', 'group') and direct_key is null)
    or (room_type = 'direct' and direct_key is not null)
  );

create unique index if not exists rooms_one_personal_per_user_idx
  on public.rooms(created_by)
  where room_type = 'personal';

create unique index if not exists rooms_unique_direct_pair_idx
  on public.rooms(direct_key)
  where room_type = 'direct';

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

create or replace function public.is_room_creator(check_room_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.rooms
    where id = check_room_id
      and created_by = auth.uid()
  );
$$;

revoke all on function public.is_room_creator(uuid) from public;
grant execute on function public.is_room_creator(uuid) to authenticated;

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
      and description not like 'chatspace-direct:%'
  );
$$;

revoke all on function public.is_group_room(uuid) from public;
grant execute on function public.is_group_room(uuid) to authenticated;

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

-- This wrapper preserves personal-room password locks when that optional
-- feature is installed, while still working when it is not.
create or replace function public.can_access_room_content(check_room_id uuid)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  is_allowed boolean;
begin
  if not public.is_room_member(check_room_id) then
    return false;
  end if;

  if to_regclass('public.personal_room_locks') is null then
    return true;
  end if;

  execute $query$
    select exists (
      select 1 from public.rooms room
      where room.id = $1
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
    )
  $query$ into is_allowed using check_room_id;

  return coalesce(is_allowed, false);
end;
$$;

revoke all on function public.can_access_room_content(uuid) from public;
grant execute on function public.can_access_room_content(uuid) to authenticated;

create or replace function public.can_access_room_content_path(check_room_id text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return public.can_access_room_content(check_room_id::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.can_access_room_content_path(text) from public;
grant execute on function public.can_access_room_content_path(text) to authenticated;

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

-- Room creators keep their rooms; other users see only rooms where they were
-- explicitly added as members.
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

create or replace function public.get_or_create_direct_room(other_user_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  pair_key text;
  direct_room_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in';
  end if;
  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'Choose another person for a direct message';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'This person is no longer available';
  end if;

  pair_key := least(current_user_id::text, other_user_id::text)
    || ':' || greatest(current_user_id::text, other_user_id::text);

  insert into public.rooms (
    name,
    description,
    created_by,
    room_type,
    direct_key
  ) values (
    'Direct message',
    'A private conversation between two people.',
    current_user_id,
    'direct',
    pair_key
  )
  on conflict (direct_key) where room_type = 'direct'
  do update set direct_key = excluded.direct_key
  returning id into direct_room_id;

  insert into public.room_members (room_id, user_id, is_admin)
  values
    (direct_room_id, current_user_id, false),
    (direct_room_id, other_user_id, false)
  on conflict (room_id, user_id) do nothing;

  return direct_room_id;
end;
$$;

revoke all on function public.get_or_create_direct_room(uuid) from public;
grant execute on function public.get_or_create_direct_room(uuid) to authenticated;

drop policy if exists "Authenticated users can view rooms" on public.rooms;
drop policy if exists "Members can view their rooms" on public.rooms;
create policy "Members can view their rooms"
on public.rooms for select to authenticated
using (public.is_room_member(id));

drop policy if exists "Authenticated users can create rooms" on public.rooms;
drop policy if exists "Users can create group rooms" on public.rooms;
create policy "Users can create group rooms"
on public.rooms for insert to authenticated
with check (auth.uid() = created_by and room_type = 'group');

drop policy if exists "Room admins can update rooms" on public.rooms;
drop policy if exists "Room admins can update group rooms" on public.rooms;
create policy "Room admins can update group rooms"
on public.rooms for update to authenticated
using (public.is_group_room(id) and public.is_room_admin(id))
with check (public.is_group_room(id) and public.is_room_admin(id));

drop policy if exists "Room creators can delete group rooms" on public.rooms;
create policy "Room creators can delete group rooms"
on public.rooms for delete to authenticated
using (room_type = 'group' and created_by = auth.uid());

drop policy if exists "Authenticated users can view room members" on public.room_members;
drop policy if exists "Members can view room membership" on public.room_members;
create policy "Members can view room membership"
on public.room_members for select to authenticated
using (public.is_room_member(room_id));

drop policy if exists "Users can join rooms" on public.room_members;
drop policy if exists "Creators and admins can add room members" on public.room_members;
create policy "Creators and admins can add room members"
on public.room_members for insert to authenticated
with check (
  public.is_group_room(room_id)
  and (
    public.is_room_admin(room_id)
    or (auth.uid() = user_id and public.is_room_creator(room_id))
  )
);

drop policy if exists "Room admins can update members" on public.room_members;
create policy "Room admins can update members"
on public.room_members for update to authenticated
using (public.is_group_room(room_id) and public.is_room_admin(room_id))
with check (public.is_group_room(room_id) and public.is_room_admin(room_id));

drop policy if exists "Room admins can remove members" on public.room_members;
create policy "Room admins can remove members"
on public.room_members for delete to authenticated
using (
  public.is_group_room(room_id)
  and public.is_room_admin(room_id)
  and user_id <> auth.uid()
);

drop policy if exists "Authenticated users can view messages" on public.messages;
drop policy if exists "Members can view room messages" on public.messages;
create policy "Members can view room messages"
on public.messages for select to authenticated
using (public.can_access_room_content(room_id));

drop policy if exists "Users can send their own messages" on public.messages;
drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
on public.messages for insert to authenticated
with check (
  auth.uid() = author_id
  and public.can_access_room_content(room_id)
);

drop policy if exists "Users can edit their own messages" on public.messages;
drop policy if exists "Authors can edit messages" on public.messages;
create policy "Authors can edit messages"
on public.messages for update to authenticated
using (auth.uid() = author_id and public.can_access_room_content(room_id))
with check (auth.uid() = author_id and public.can_access_room_content(room_id));

drop policy if exists "Users can delete their own messages" on public.messages;
drop policy if exists "Authors and admins can delete messages" on public.messages;
create policy "Authors and admins can delete messages"
on public.messages for delete to authenticated
using (
  public.can_access_room_content(room_id)
  and (
    auth.uid() = author_id
    or (public.is_group_room(room_id) and public.is_room_admin(room_id))
  )
);

drop policy if exists "Authenticated users can view likes" on public.message_likes;
drop policy if exists "Members can view message reactions" on public.message_likes;
create policy "Members can view message reactions"
on public.message_likes for select to authenticated
using (
  exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.can_access_room_content(message.room_id)
  )
);

drop policy if exists "Users can add their own likes" on public.message_likes;
drop policy if exists "Members can add their own reactions" on public.message_likes;
create policy "Members can add their own reactions"
on public.message_likes for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.can_access_room_content(message.room_id)
  )
);

drop policy if exists "Users can remove their own likes" on public.message_likes;
drop policy if exists "Members can remove their own reactions" on public.message_likes;
create policy "Members can remove their own reactions"
on public.message_likes for delete to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.can_access_room_content(message.room_id)
  )
);

drop policy if exists "Authenticated users can read chat files" on storage.objects;
drop policy if exists "Members can read chat files" on storage.objects;
create policy "Members can read chat files"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and public.can_access_room_content_path((storage.foldername(name))[2])
);

drop policy if exists "Users can upload their own chat files" on storage.objects;
drop policy if exists "Members can upload their own chat files" on storage.objects;
create policy "Members can upload their own chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_room_content_path((storage.foldername(name))[2])
);

drop policy if exists "Users can delete their own chat files" on storage.objects;
drop policy if exists "Members can delete their own chat files" on storage.objects;
create policy "Members can delete their own chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_access_room_content_path((storage.foldername(name))[2])
);

create or replace function public.users_share_conversation(other_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() = other_user_id or exists (
    select 1
    from public.room_members mine
    join public.room_members theirs on theirs.room_id = mine.room_id
    join public.rooms room on room.id = mine.room_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user_id
      and room.room_type in ('direct', 'group')
  );
$$;

revoke all on function public.users_share_conversation(uuid) from public;
grant execute on function public.users_share_conversation(uuid) to authenticated;

do $$
begin
  if to_regclass('public.stories') is not null then
    execute 'drop policy if exists "Signed-in users can view active stories" on public.stories';
    execute 'drop policy if exists "Contacts can view active stories" on public.stories';
    execute $policy$
      create policy "Contacts can view active stories"
      on public.stories for select to authenticated
      using (
        expires_at > now()
        and (
          author_id = auth.uid()
          or public.users_share_conversation(author_id)
        )
      )
    $policy$;
  end if;
end $$;

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
notify pgrst, 'reload schema';
