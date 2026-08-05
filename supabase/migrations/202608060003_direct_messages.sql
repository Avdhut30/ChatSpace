alter table public.rooms
  add column if not exists direct_key text;

alter table public.rooms
  drop constraint if exists rooms_room_type_check;

-- Upgrade direct conversations created by the frontend compatibility path.
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

create unique index if not exists rooms_unique_direct_pair_idx
  on public.rooms(direct_key)
  where room_type = 'direct';

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
  )
  values (
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

drop policy if exists "Authors and admins can delete messages" on public.messages;
create policy "Authors and admins can delete messages"
on public.messages for delete to authenticated
using (
  public.is_room_member(room_id)
  and (
    auth.uid() = author_id
    or (public.is_group_room(room_id) and public.is_room_admin(room_id))
  )
);

notify pgrst, 'reload schema';
