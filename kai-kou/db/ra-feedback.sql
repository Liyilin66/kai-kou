-- Task 6 additive migration. Run this whole file once in Supabase SQL Editor.
alter table public.speech_analyses
  add column if not exists feedback jsonb,
  add column if not exists feedback_status text check (feedback_status in ('processing','done','failed')),
  add column if not exists feedback_meta jsonb;

-- Save advice and the linked practice history atomically. A failed history write
-- must roll back the advice too, leaving the claim to prevent duplicate API costs.
create or replace function public.complete_ra_feedback(p_id uuid, p_user_id uuid, p_feedback jsonb, p_meta jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  a public.speech_analyses;
  updated_logs integer;
begin
  select * into a from public.speech_analyses where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'analysis_not_found'; end if;
  if a.status <> 'done' then raise exception 'analysis_not_ready'; end if;
  if a.feedback_status = 'done' then return to_jsonb(a); end if;
  if a.feedback_status is distinct from 'processing' then raise exception 'feedback_not_claimed'; end if;
  if p_feedback is null or jsonb_typeof(p_feedback) <> 'object'
    or jsonb_typeof(p_feedback->'summary') is distinct from 'string'
    or jsonb_typeof(p_feedback->'suggestions') is distinct from 'array'
    then raise exception 'invalid_feedback'; end if;
  update public.practice_logs set feedback = p_feedback->>'summary'
    where user_id = a.user_id and task_type = 'RA' and score_json->>'analysis_id' = a.id::text;
  get diagnostics updated_logs = row_count;
  if updated_logs <> 1 then raise exception 'feedback_practice_log_mismatch'; end if;
  update public.speech_analyses set feedback = p_feedback, feedback_meta = p_meta,
    feedback_status = 'done', updated_at = now() where id = a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_ra_feedback(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_ra_feedback(uuid,uuid,jsonb,jsonb) to service_role;
