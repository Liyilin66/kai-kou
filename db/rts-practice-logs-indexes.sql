-- RTS practice_logs query indexes
-- Safe to run multiple times.

create index if not exists practice_logs_user_task_created_at_idx
  on public.practice_logs (user_id, task_type, created_at desc);

create index if not exists practice_logs_user_task_question_created_at_idx
  on public.practice_logs (user_id, task_type, question_id, created_at desc);
