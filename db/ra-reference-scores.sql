-- Task 11: replace server-only save functions; no schema changes.
create or replace function public.complete_ra_analysis(p_id uuid, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare a public.speech_analyses;
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
  -- Unusable recordings have no completed practice / fabricated score.
  if a.status = 'done' then
    insert into public.practice_logs (user_id, task_type, question_id, transcript, score_json, feedback)
    values (a.user_id, 'RA', a.question_id, a.transcript, jsonb_build_object(
      'status','diagnosed','analysis_id',a.id,'diagnosis_version',a.rules_version,'metrics',a.metrics,
      'score_version',a.metrics->'score'->>'score_version',
      'scores',case when a.metrics->'score'->>'score_version' = 'ra-score-0.1' then jsonb_build_object(
        'overall',(a.metrics->'score'->>'total')::integer,
        'content',round(10 + 80 * (a.metrics->'score'->'content'->>'ratio')::numeric),
        'fluency',round(10 + 80 * (a.metrics->'score'->'fluency'->>'band')::numeric / 5),
        'pronunciation',null) else null end,
      'audio',jsonb_build_object('bucket','practice-audio','path',a.audio_path),
      'questionSnapshot',jsonb_build_object('id',a.question_id,'content',a.reference_text,'taskType','RA')
    ), '');
  end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_ra_analysis(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.complete_ra_analysis(uuid,jsonb) to service_role;

-- Atomic versioned-score backfill. Existing question/audio/feedback stay intact.
create or replace function public.backfill_ra_score(p_id uuid, p_score jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare a public.speech_analyses; n integer;
begin
 select * into a from public.speech_analyses where id=p_id for update;
 if not found or a.status <> 'done' then raise exception 'analysis_not_done'; end if;
 if p_score is null or jsonb_typeof(p_score) <> 'object'
   or jsonb_typeof(p_score->'total') is distinct from 'number'
   or jsonb_typeof(p_score->'content'->'ratio') is distinct from 'number'
   or jsonb_typeof(p_score->'fluency'->'band') is distinct from 'number'
   or (p_score->'content'->>'ratio')::numeric not between 0 and 1
   or (p_score->'fluency'->>'band')::numeric not between 0 and 5
   or p_score->>'score_version' is distinct from 'ra-score-0.1'
   or (p_score->>'total')::numeric not between 10 and 90
   or p_score->'pronunciation'->>'status' is distinct from 'not_assessed'
   then raise exception 'invalid_reference_score'; end if;
 update public.practice_logs set score_json=score_json || jsonb_build_object(
   'score_version',p_score->>'score_version',
   'metrics',a.metrics || jsonb_build_object('score',p_score),
   'scores',jsonb_build_object('overall',(p_score->>'total')::integer,
     'content',round(10+80*(p_score->'content'->>'ratio')::numeric),
     'fluency',round(10+80*(p_score->'fluency'->>'band')::numeric/5),'pronunciation',null))
 where user_id=a.user_id and task_type='RA' and score_json->>'analysis_id'=a.id::text;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'score_practice_log_mismatch'; end if;
 update public.speech_analyses set metrics=metrics||jsonb_build_object('score',p_score),updated_at=now()
 where id=p_id returning * into a;
 return to_jsonb(a);
end;
$$;
revoke all on function public.backfill_ra_score(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.backfill_ra_score(uuid,jsonb) to service_role;
