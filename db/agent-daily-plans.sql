-- AI private tutor executable daily plans.
-- Run this file manually in the Supabase SQL Editor before using /api/agent/plan.

create extension if not exists pgcrypto;

create table if not exists public.agent_daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  title text,
  source text,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_daily_plans_user_date_key unique (user_id, plan_date),
  constraint agent_daily_plans_plan_json_object check (jsonb_typeof(plan_json) = 'object')
);

create index if not exists agent_daily_plans_user_date_idx
  on public.agent_daily_plans (user_id, plan_date desc);

create or replace function public.set_agent_daily_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_agent_daily_plans_updated_at on public.agent_daily_plans;

create trigger set_agent_daily_plans_updated_at
before update on public.agent_daily_plans
for each row
execute function public.set_agent_daily_plans_updated_at();

alter table public.agent_daily_plans enable row level security;

drop policy if exists "Users can read own agent daily plans" on public.agent_daily_plans;
create policy "Users can read own agent daily plans"
on public.agent_daily_plans
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own agent daily plans" on public.agent_daily_plans;
create policy "Users can insert own agent daily plans"
on public.agent_daily_plans
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own agent daily plans" on public.agent_daily_plans;
create policy "Users can update own agent daily plans"
on public.agent_daily_plans
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own agent daily plans" on public.agent_daily_plans;
create policy "Users can delete own agent daily plans"
on public.agent_daily_plans
for delete
using (auth.uid() = user_id);
