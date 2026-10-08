-- Agent memory system v1A.
-- Run this file manually in the Supabase SQL Editor before using /agent memory.

create extension if not exists pgcrypto;

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default '我的 PTE AI 私教',
  session_type text default 'main',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint agent_sessions_session_type_check check (session_type in ('main')),
  constraint agent_sessions_status_check check (status in ('active', 'archived'))
);

create unique index if not exists agent_sessions_one_active_main_per_user_idx
  on public.agent_sessions (user_id)
  where session_type = 'main' and status = 'active';

create index if not exists agent_sessions_user_type_status_idx
  on public.agent_sessions (user_id, session_type, status);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  intent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint agent_messages_role_check check (role in ('user', 'assistant', 'system_summary')),
  constraint agent_messages_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists agent_messages_user_session_created_idx
  on public.agent_messages (user_id, session_id, created_at);

create table if not exists public.agent_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.agent_sessions(id) on delete set null,
  request_id text,
  intent text,
  provider_used text,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status text,
  error_code text,
  created_at timestamptz default now()
);

create index if not exists agent_usage_logs_user_created_idx
  on public.agent_usage_logs (user_id, created_at);

alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_usage_logs enable row level security;

drop policy if exists "Users can read own agent sessions" on public.agent_sessions;
create policy "Users can read own agent sessions"
on public.agent_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own agent messages" on public.agent_messages;
create policy "Users can read own agent messages"
on public.agent_messages
for select
using (auth.uid() = user_id);

-- No frontend insert/update/delete policies are created for v1A.
-- The backend uses the service role and still filters every query by the authenticated user.id.
-- agent_usage_logs intentionally has no frontend policies in v1A.
