create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  is_admin boolean default false,
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  text varchar(1000) not null,
  created_at timestamptz default now()
);

alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_type text;
alter table public.messages add column if not exists file_size bigint;

create table if not exists public.message_likes (
  message_id bigint references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);

create index if not exists messages_room_created_idx
  on public.messages(room_id, created_at desc);

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
  author.avatar_url as last_author_avatar
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

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = 10485760;

drop policy if exists "Authenticated users can read chat files" on storage.objects;
create policy "Authenticated users can read chat files"
on storage.objects for select to authenticated
using (bucket_id = 'chat-files');

drop policy if exists "Users can upload their own chat files" on storage.objects;
create policy "Users can upload their own chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own chat files" on storage.objects;
create policy "Users can delete their own chat files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_likes enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_room_admin(check_room_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = check_room_id
      and user_id = auth.uid()
      and is_admin = true
  );
$$;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Authenticated users can view rooms" on public.rooms;
create policy "Authenticated users can view rooms"
on public.rooms for select to authenticated using (true);

drop policy if exists "Authenticated users can create rooms" on public.rooms;
create policy "Authenticated users can create rooms"
on public.rooms for insert to authenticated
with check (auth.uid() = created_by);

drop policy if exists "Room admins can update rooms" on public.rooms;
create policy "Room admins can update rooms"
on public.rooms for update to authenticated
using (public.is_room_admin(id)) with check (public.is_room_admin(id));

drop policy if exists "Authenticated users can view room members" on public.room_members;
create policy "Authenticated users can view room members"
on public.room_members for select to authenticated using (true);

drop policy if exists "Users can join rooms" on public.room_members;
create policy "Users can join rooms"
on public.room_members for insert to authenticated
with check (auth.uid() = user_id or public.is_room_admin(room_id));

drop policy if exists "Room admins can update members" on public.room_members;
create policy "Room admins can update members"
on public.room_members for update to authenticated
using (public.is_room_admin(room_id))
with check (public.is_room_admin(room_id));

drop policy if exists "Authenticated users can view messages" on public.messages;
create policy "Authenticated users can view messages"
on public.messages for select to authenticated using (true);

drop policy if exists "Users can send their own messages" on public.messages;
create policy "Users can send their own messages"
on public.messages for insert to authenticated
with check (auth.uid() = author_id);

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
on public.messages for delete to authenticated
using (auth.uid() = author_id or public.is_room_admin(room_id));

drop policy if exists "Authenticated users can view likes" on public.message_likes;
create policy "Authenticated users can view likes"
on public.message_likes for select to authenticated using (true);

drop policy if exists "Users can add their own likes" on public.message_likes;
create policy "Users can add their own likes"
on public.message_likes for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own likes" on public.message_likes;
create policy "Users can remove their own likes"
on public.message_likes for delete to authenticated
using (auth.uid() = user_id);

do $$
declare table_name text;
begin
  foreach table_name in array array['rooms', 'room_members', 'messages', 'message_likes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
