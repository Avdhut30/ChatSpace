-- Per-user inbox organization for the Android and web clients.
create table if not exists public.conversation_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  is_muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

create index if not exists conversation_preferences_room_id_idx
on public.conversation_preferences(room_id);

alter table public.conversation_preferences enable row level security;

drop policy if exists "Users can view their conversation preferences" on public.conversation_preferences;
create policy "Users can view their conversation preferences"
on public.conversation_preferences for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create their conversation preferences" on public.conversation_preferences;
create policy "Users can create their conversation preferences"
on public.conversation_preferences for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.room_members member
    where member.room_id = conversation_preferences.room_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Users can update their conversation preferences" on public.conversation_preferences;
create policy "Users can update their conversation preferences"
on public.conversation_preferences for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.room_members member
    where member.room_id = conversation_preferences.room_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their conversation preferences" on public.conversation_preferences;
create policy "Users can delete their conversation preferences"
on public.conversation_preferences for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.conversation_preferences to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.conversation_preferences;
exception
  when duplicate_object then null;
end $$;
