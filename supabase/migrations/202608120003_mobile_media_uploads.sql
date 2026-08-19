-- Broaden mobile media compatibility and increase bounded object capacity.
update storage.buckets
set file_size_limit = 104857600
where id in ('chat-files', 'story-media');

update storage.buckets
set
  file_size_limit = 15728640,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp'
  ]
where id = 'profile-avatars';

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp',
  'video/x-matroska'
]
where id = 'story-media';

-- Reassert policies in case an older project only created the buckets.
drop policy if exists "Users can upload their own story media" on storage.objects;
create policy "Users can upload their own story media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'story-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own profile avatars" on storage.objects;
create policy "Users can upload their own profile avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.update_my_avatar(new_avatar_url text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(new_avatar_url) > 2048 or new_avatar_url !~ '^https://' then
    raise exception 'Invalid avatar URL';
  end if;
  update public.profiles
  set avatar_url = new_avatar_url
  where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_avatar(text) from public;
grant execute on function public.update_my_avatar(text) to authenticated;

notify pgrst, 'reload schema';
