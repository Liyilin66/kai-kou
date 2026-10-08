-- Run in Supabase SQL Editor before enabling VITE_RA_DIAGNOSIS in Preview.
create table if not exists public.speech_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null,
  task_type text not null default 'RA' check (task_type = 'RA'),
  question_id text not null,
  reference_text text not null,
  audio_path text not null,
  status text not null default 'processing' check (status in ('processing','done','failed','unusable_audio')),
  provider text, model text, rules_version text, transcript text,
  metrics jsonb not null default '{}'::jsonb,
  aligned jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  timings_ms jsonb not null default '{}'::jsonb,
  client_silences jsonb not null default '[]'::jsonb,
  legacy_score jsonb,
  legacy_status text check (legacy_status in ('processing','done','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attempt_id)
);
alter table public.speech_analyses enable row level security;
revoke all on public.speech_analyses from anon, authenticated;
grant select on public.speech_analyses to authenticated;
grant all on public.speech_analyses to service_role;
drop policy if exists "speech-analyses-read-own" on public.speech_analyses;
create policy "speech-analyses-read-own" on public.speech_analyses for select to authenticated using (auth.uid() = user_id);

-- Row lock plus one transaction prevents a partial save / duplicate practice log.
-- Only the server service role can invoke this function.
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
      'audio',jsonb_build_object('bucket','practice-audio','path',a.audio_path),
      'questionSnapshot',jsonb_build_object('id',a.question_id,'content',a.reference_text,'taskType','RA')
    ), '');
  end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.complete_ra_analysis(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.complete_ra_analysis(uuid,jsonb) to service_role;
