-- Repair avatar uploads for every authenticated account. Storage policies are
-- global, so this migration is safe to apply repeatedly to an existing project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read profile avatars" on storage.objects;
create policy "Anyone can read profile avatars"
on storage.objects for select to public
using (bucket_id = 'profile-avatars');

drop policy if exists "Users can upload their own profile avatars" on storage.objects;
create policy "Users can upload their own profile avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own profile avatars" on storage.objects;
create policy "Users can update their own profile avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own profile avatars" on storage.objects;
create policy "Users can delete their own profile avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.update_my_avatar(new_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
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
