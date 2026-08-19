create table if not exists public.web_link_sessions (
  id uuid primary key default gen_random_uuid(),
  approval_secret_hash text not null,
  poll_secret_hash text not null,
  approved_user_id uuid references auth.users(id) on delete cascade,
  login_token_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '75 seconds'),
  consumed_at timestamptz
);

create index if not exists web_link_sessions_expiry_idx
on public.web_link_sessions(expires_at);

alter table public.web_link_sessions enable row level security;
revoke all on public.web_link_sessions from anon, authenticated;

-- Only the service role used by the device-link Edge Function may access this
-- table. QR and polling secrets are stored as hashes and never as plaintext.
