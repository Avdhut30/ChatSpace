alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_type text;
alter table public.messages add column if not exists file_size bigint;

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
