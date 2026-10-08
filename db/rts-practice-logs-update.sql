-- Allow authenticated users to update their own RTS practice logs.
-- This is required for "insert first, then patch ai_review on same row" flow.

alter table public.practice_logs enable row level security;

drop policy if exists "practice_logs_update_own_rts" on public.practice_logs;

create policy "practice_logs_update_own_rts"
on public.practice_logs
for update
to authenticated
using (
  auth.uid() = user_id
  and task_type = 'RTS'
)
with check (
  auth.uid() = user_id
  and task_type = 'RTS'
);
