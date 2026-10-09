-- Run once in Supabase SQL Editor; safe to rerun.
create table if not exists public.practice_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('ra_result_viewed','ra_evidence_played','ra_rules_opened','ra_retry_started','ra_compare_viewed')),
  analysis_id uuid,
  question_id text,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists practice_events_user_created on public.practice_events(user_id, created_at);
alter table public.practice_events enable row level security;
revoke all on public.practice_events from anon, authenticated;
grant select, insert on public.practice_events to authenticated;
grant all on public.practice_events to service_role;
drop policy if exists "practice-events-read-own" on public.practice_events;
create policy "practice-events-read-own" on public.practice_events for select to authenticated using (auth.uid() = user_id);
drop policy if exists "practice-events-insert-own" on public.practice_events;
create policy "practice-events-insert-own" on public.practice_events for insert to authenticated with check (auth.uid() = user_id);
