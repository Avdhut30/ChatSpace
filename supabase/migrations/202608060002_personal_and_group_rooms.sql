alter table public.rooms
  add column if not exists room_type text not null default 'group';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_room_type_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_room_type_check
      check (room_type in ('personal', 'group'));
  end if;
end $$;

create unique index if not exists rooms_one_personal_per_user_idx
  on public.rooms(created_by)
  where room_type = 'personal';

drop function if exists public.is_room_member(uuid, uuid);

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

-- Repair membership for rooms created before creator membership was automatic.
insert into public.room_members (room_id, user_id, is_admin)
select id, created_by, true
from public.rooms
where created_by is not null
on conflict (room_id, user_id)
do update set is_admin = true;

-- Give every existing account one private personal space.
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

drop policy if exists "Authenticated users can view rooms" on public.rooms;
drop policy if exists "Members can view their rooms" on public.rooms;
create policy "Members can view their rooms"
on public.rooms for select to authenticated
using (public.is_room_member(id));

drop policy if exists "Authenticated users can create rooms" on public.rooms;
drop policy if exists "Users can create group rooms" on public.rooms;
create policy "Users can create group rooms"
on public.rooms for insert to authenticated
with check (
  auth.uid() = created_by
  and room_type = 'group'
);

drop policy if exists "Room admins can update rooms" on public.rooms;
drop policy if exists "Room admins can update group rooms" on public.rooms;
create policy "Room admins can update group rooms"
on public.rooms for update to authenticated
using (public.is_room_admin(id) and room_type = 'group')
with check (public.is_room_admin(id) and room_type = 'group');

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
  public.is_room_admin(room_id)
  or (auth.uid() = user_id and public.is_room_creator(room_id))
);

drop policy if exists "Room admins can update members" on public.room_members;
create policy "Room admins can update members"
on public.room_members for update to authenticated
using (public.is_room_admin(room_id))
with check (public.is_room_admin(room_id));

drop policy if exists "Room admins can remove members" on public.room_members;
create policy "Room admins can remove members"
on public.room_members for delete to authenticated
using (
  public.is_room_admin(room_id)
  and user_id <> auth.uid()
);

drop policy if exists "Authenticated users can view messages" on public.messages;
drop policy if exists "Members can view room messages" on public.messages;
create policy "Members can view room messages"
on public.messages for select to authenticated
using (public.is_room_member(room_id));

drop policy if exists "Users can send their own messages" on public.messages;
drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
on public.messages for insert to authenticated
with check (
  auth.uid() = author_id
  and public.is_room_member(room_id)
);

drop policy if exists "Users can delete their own messages" on public.messages;
drop policy if exists "Authors and admins can delete messages" on public.messages;
create policy "Authors and admins can delete messages"
on public.messages for delete to authenticated
using (
  public.is_room_member(room_id)
  and (auth.uid() = author_id or public.is_room_admin(room_id))
);

drop policy if exists "Users can edit their own messages" on public.messages;
drop policy if exists "Authors can edit messages" on public.messages;
create policy "Authors can edit messages"
on public.messages for update to authenticated
using (auth.uid() = author_id and public.is_room_member(room_id))
with check (auth.uid() = author_id and public.is_room_member(room_id));

drop policy if exists "Authenticated users can view likes" on public.message_likes;
drop policy if exists "Members can view message reactions" on public.message_likes;
create policy "Members can view message reactions"
on public.message_likes for select to authenticated
using (
  exists (
    select 1 from public.messages message
    where message.id = message_id
      and public.is_room_member(message.room_id)
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
      and public.is_room_member(message.room_id)
  )
);

drop policy if exists "Users can remove their own likes" on public.message_likes;
drop policy if exists "Members can remove their own reactions" on public.message_likes;
create policy "Members can remove their own reactions"
on public.message_likes for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Authenticated users can read chat files" on storage.objects;
drop policy if exists "Members can read chat files" on storage.objects;
create policy "Members can read chat files"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-files'
  and public.is_room_member_path((storage.foldername(name))[2])
);

drop policy if exists "Users can upload their own chat files" on storage.objects;
drop policy if exists "Members can upload their own chat files" on storage.objects;
create policy "Members can upload their own chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_room_member_path((storage.foldername(name))[2])
);

drop policy if exists "Users can delete their own chat files" on storage.objects;
drop policy if exists "Members can delete their own chat files" on storage.objects;
create policy "Members can delete their own chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_room_member_path((storage.foldername(name))[2])
);

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
