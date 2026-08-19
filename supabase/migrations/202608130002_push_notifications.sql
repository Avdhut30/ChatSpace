create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
alter table public.push_tokens enable row level security;

drop policy if exists "Users can view their push tokens" on public.push_tokens;
create policy "Users can view their push tokens" on public.push_tokens
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users can register their push tokens" on public.push_tokens;
create policy "Users can register their push tokens" on public.push_tokens
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users can update their push tokens" on public.push_tokens;
create policy "Users can update their push tokens" on public.push_tokens
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users can delete their push tokens" on public.push_tokens;
create policy "Users can delete their push tokens" on public.push_tokens
for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

create or replace function public.register_push_token(
  new_token text,
  new_platform text default 'android',
  new_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(new_token) < 20 or length(new_token) > 4096 then raise exception 'Invalid push token'; end if;
  if new_platform not in ('android', 'ios', 'web') then raise exception 'Invalid platform'; end if;

  insert into public.push_tokens(token, user_id, platform, device_name, updated_at)
  values (new_token, auth.uid(), new_platform, left(new_device_name, 120), now())
  on conflict (token) do update
  set user_id = auth.uid(), platform = excluded.platform,
      device_name = excluded.device_name, updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public;
grant execute on function public.register_push_token(text, text, text) to authenticated;
