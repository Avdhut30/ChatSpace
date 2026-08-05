create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text,
  media_type text not null default 'text',
  caption varchar(500),
  background_color varchar(20) not null default '#2563eb',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint stories_media_type_check
    check (media_type in ('image', 'video', 'text')),
  constraint stories_content_check
    check (media_path is not null or length(trim(coalesce(caption, ''))) > 0),
  constraint stories_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index if not exists stories_active_created_idx
  on public.stories(expires_at, created_at desc);

create index if not exists stories_author_created_idx
  on public.stories(author_id, created_at desc);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "Signed-in users can view active stories" on public.stories;
create policy "Signed-in users can view active stories"
on public.stories for select to authenticated
using (expires_at > now());

drop policy if exists "Users can publish their own stories" on public.stories;
create policy "Users can publish their own stories"
on public.stories for insert to authenticated
with check (
  author_id = auth.uid()
  and expires_at > now()
  and expires_at <= now() + interval '24 hours 1 minute'
);

drop policy if exists "Users can delete their own stories" on public.stories;
create policy "Users can delete their own stories"
on public.stories for delete to authenticated
using (author_id = auth.uid());

drop policy if exists "Users can view relevant story views" on public.story_views;
create policy "Users can view relevant story views"
on public.story_views for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.stories story
    where story.id = story_id
      and story.author_id = auth.uid()
  )
);

drop policy if exists "Users can mark stories viewed" on public.story_views;
create policy "Users can mark stories viewed"
on public.story_views for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.stories story
    where story.id = story_id
      and story.expires_at > now()
  )
);

drop policy if exists "Users can refresh their story views" on public.story_views;
create policy "Users can refresh their story views"
on public.story_views for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-media',
  'story-media',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in users can read story media" on storage.objects;
create policy "Signed-in users can read story media"
on storage.objects for select to authenticated
using (
  bucket_id = 'story-media'
  and exists (
    select 1 from public.stories story
    where story.media_path = name
      and story.expires_at > now()
  )
);

drop policy if exists "Users can upload their own story media" on storage.objects;
create policy "Users can upload their own story media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'story-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own story media" on storage.objects;
create policy "Users can delete their own story media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'story-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_views'
  ) then
    alter publication supabase_realtime add table public.story_views;
  end if;
end $$;

notify pgrst, 'reload schema';
