-- Registration email code flow for /auth.
-- Run in Supabase SQL Editor before enabling the new register flow.

create table if not exists public.register_email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  consumed_at timestamptz,
  send_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint register_email_codes_email_normalized
    check (email = lower(btrim(email)))
);

create index if not exists register_email_codes_expires_at_idx
  on public.register_email_codes (expires_at);

alter table public.register_email_codes enable row level security;

revoke all on public.register_email_codes from anon, authenticated;

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select exists(
    select 1
    from auth.users
    where lower(email) = lower(btrim(coalesce(p_email, '')))
  );
$$;

revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
