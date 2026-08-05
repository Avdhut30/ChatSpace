alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;

alter table public.messages
  add column if not exists edited_at timestamptz;

create index if not exists messages_reply_to_idx
  on public.messages(reply_to)
  where reply_to is not null;

create or replace function public.validate_message_reply()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reply_to is not null and not exists (
    select 1
    from public.messages parent
    where parent.id = new.reply_to
      and parent.room_id = new.room_id
  ) then
    raise exception 'A reply must reference a message in the same room';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_message_reply on public.messages;
create trigger validate_message_reply
  before insert or update of reply_to, room_id on public.messages
  for each row execute function public.validate_message_reply();

drop policy if exists "Users can edit their own messages" on public.messages;
create policy "Users can edit their own messages"
on public.messages for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

create or replace function public.protect_message_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_id is distinct from old.author_id
    or new.room_id is distinct from old.room_id
    or new.created_at is distinct from old.created_at
    or new.file_path is distinct from old.file_path
    or new.file_name is distinct from old.file_name
    or new.file_type is distinct from old.file_type
    or new.file_size is distinct from old.file_size
    or new.reply_to is distinct from old.reply_to then
    raise exception 'Only message text can be edited';
  end if;

  new.edited_at = now();
  return new;
end;
$$;

drop trigger if exists protect_message_identity on public.messages;
create trigger protect_message_identity
  before update on public.messages
  for each row execute function public.protect_message_identity();

-- Ask PostgREST to expose the new columns immediately after this migration.
notify pgrst, 'reload schema';
