-- Task 13: allow the RA diagnosis tables/functions to store RS diagnoses too.
-- Run the whole file once in Supabase SQL Editor; it is safe to rerun.
begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'speech_analyses'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%task_type%'
  loop
    execute format('alter table public.speech_analyses drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.speech_analyses
  add constraint speech_analyses_task_type_check check (task_type in ('RA','RS'));

create or replace function public.complete_ra_analysis(p_id uuid, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  a public.speech_analyses;
  score jsonb;
  expected_version text;
  content_score integer;
begin
  select * into a from public.speech_analyses where id = p_id for update;
  if not found then raise exception 'analysis_not_found'; end if;
  if a.status <> 'processing' then return to_jsonb(a); end if;
  if p_result->>'status' not in ('done','unusable_audio') then raise exception 'invalid_analysis_status'; end if;

  update public.speech_analyses set
    status=p_result->>'status', provider=p_result->>'provider', model=p_result->>'model',
    rules_version=p_result->>'rules_version', transcript=p_result->>'transcript',
    metrics=p_result->'metrics', aligned=p_result->'aligned', evidence=p_result->'evidence',
    timings_ms=p_result->'timings_ms', error_code=p_result->>'error_code', updated_at=now()
  where id=p_id returning * into a;

  if a.status = 'done' then
    score := a.metrics->'score';
    expected_version := case a.task_type when 'RS' then 'rs-score-0.1' else 'ra-score-0.1' end;
    content_score := case
      when score->>'score_version' = 'rs-score-0.1'
        then round(10 + 80 * (score->'content'->>'band')::numeric / 3)
      when score->>'score_version' = 'ra-score-0.1'
        then round(10 + 80 * (score->'content'->>'ratio')::numeric)
      else null
    end;

    insert into public.practice_logs (user_id, task_type, question_id, transcript, score_json, feedback)
    values (a.user_id, a.task_type, a.question_id, a.transcript, jsonb_build_object(
      'status','diagnosed','analysis_id',a.id,'diagnosis_version',a.rules_version,'metrics',a.metrics,
      'score_version',score->>'score_version',
      'scores',case when score->>'score_version' = expected_version then jsonb_build_object(
        'overall',(score->>'total')::integer,
        'content',content_score,
        'fluency',round(10 + 80 * (score->'fluency'->>'band')::numeric / 5),
        'pronunciation',null) else null end,
      'audio',jsonb_build_object('bucket','practice-audio','path',a.audio_path),
      'questionSnapshot',jsonb_build_object('id',a.question_id,'content',a.reference_text,'taskType',a.task_type)
    ), '');
  end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_ra_analysis(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.complete_ra_analysis(uuid,jsonb) to service_role;

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
    where user_id = a.user_id and task_type = a.task_type and score_json->>'analysis_id' = a.id::text;
  get diagnostics updated_logs = row_count;
  if updated_logs <> 1 then raise exception 'feedback_practice_log_mismatch'; end if;
  update public.speech_analyses set feedback = p_feedback, feedback_meta = p_meta,
    feedback_status = 'done', updated_at = now() where id = a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_ra_feedback(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.complete_ra_feedback(uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.backfill_ra_score(p_id uuid, p_score jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  a public.speech_analyses;
  n integer;
  expected_version text;
  content_score integer;
begin
 select * into a from public.speech_analyses where id=p_id for update;
 if not found or a.status <> 'done' then raise exception 'analysis_not_done'; end if;
 expected_version := case a.task_type when 'RS' then 'rs-score-0.1' else 'ra-score-0.1' end;
 if p_score is null or jsonb_typeof(p_score) <> 'object'
   or jsonb_typeof(p_score->'total') is distinct from 'number'
   or jsonb_typeof(p_score->'fluency'->'band') is distinct from 'number'
   or (p_score->'fluency'->>'band')::numeric not between 0 and 5
   or p_score->>'score_version' is distinct from expected_version
   or (p_score->>'total')::numeric not between 10 and 90
   or p_score->'pronunciation'->>'status' is distinct from 'not_assessed'
   or (expected_version = 'ra-score-0.1' and (
     jsonb_typeof(p_score->'content'->'ratio') is distinct from 'number'
     or (p_score->'content'->>'ratio')::numeric not between 0 and 1))
   or (expected_version = 'rs-score-0.1' and (
     jsonb_typeof(p_score->'content'->'band') is distinct from 'number'
     or (p_score->'content'->>'band')::numeric not between 0 and 3))
   then raise exception 'invalid_reference_score'; end if;

 content_score := case expected_version
   when 'rs-score-0.1' then round(10+80*(p_score->'content'->>'band')::numeric/3)
   else round(10+80*(p_score->'content'->>'ratio')::numeric)
 end;
 update public.practice_logs set score_json=score_json || jsonb_build_object(
   'score_version',p_score->>'score_version',
   'metrics',a.metrics || jsonb_build_object('score',p_score),
   'scores',jsonb_build_object('overall',(p_score->>'total')::integer,
     'content',content_score,
     'fluency',round(10+80*(p_score->'fluency'->>'band')::numeric/5),'pronunciation',null))
 where user_id=a.user_id and task_type=a.task_type and score_json->>'analysis_id'=a.id::text;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'score_practice_log_mismatch'; end if;
 update public.speech_analyses set metrics=metrics||jsonb_build_object('score',p_score),updated_at=now()
 where id=p_id returning * into a;
 return to_jsonb(a);
end;
$$;
revoke all on function public.backfill_ra_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.backfill_ra_score(uuid,jsonb) to service_role;

commit;
