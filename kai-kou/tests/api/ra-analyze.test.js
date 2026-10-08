import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzeHandler } from '../../api/ra/analyze.js';
import { diagnoseRecording, validateAnalysisInput } from '../../backend/speech/analyze-service.js';

const body = { attempt_id: 'attempt-0001', question_id: 'RA_001', audio_path: 'ra/user/recording.webm',
  duration_ms: 2000, speech_onset_ms: 100, speech_offset_ms: 1900, silences: [], client_transcript: 'The browser reference.' };
function fixture(options = {}) {
  const state = { row: null, calls: 0, transcribeCalls: 0, logs: [], legacyCalls: 0, feedbackCalls: 0, ...options };
  const db = {
    auth: { getUser: async () => ({ data: { user: state.noAuth ? null : { id: 'user' } } }) },
    storage: { from: () => ({ download: async () => ({ data: new Blob(['audio'], { type: 'audio/webm' }) }) }) },
    from(table) {
      const q = { filters: {}, op: 'select', select() { return this; }, eq(k, v) { this.filters[k] = v; return this; }, is(k, v) { this.filters[k] = v; return this; },
        insert(value) { this.op = 'insert'; this.value = value; return this; }, update(value) { this.op = 'update'; this.value = value; return this; },
        single() { return this.run(); }, maybeSingle() { return this.run(); }, then(resolve, reject) { return this.run().then(resolve, reject); },
        async run() {
          if (table === 'profiles') return { data: { is_premium: !state.expired } };
          if (table === 'questions') return { data: state.noQuestion ? null : { id: 'RA_001', content: 'The server reference.' } };
          if (this.op === 'insert') {
            if (state.row) return { error: { code: '23505' } };
            state.row = { id: 'analysis-id', ...this.value }; return { data: { ...state.row } };
          }
          if (!state.row || Object.entries(this.filters).some(([k, v]) => (state.row[k] ?? null) !== v)) return { data: null };
          if (this.op === 'update') {
            if (state.feedbackClaimFails && this.value.feedback_status === 'processing') return { error: { message: 'claim failed' } };
            Object.assign(state.row, this.value);
          }
          return { data: { ...state.row } };
        } };
      return q;
    },
    async rpc(name, args) {
      if (name === 'complete_ra_feedback') {
        if (state.feedbackSaveFails) return { error: { message: 'save failed' } };
        assert.equal(args.p_user_id, state.row.user_id);
        Object.assign(state.row, { feedback: args.p_feedback, feedback_meta: args.p_meta, feedback_status: 'done' });
        const log = state.logs.find(log => log.analysis_id === state.row.id);
        if (log) log.feedback = args.p_feedback.summary;
        return { data: { ...state.row } };
      }
      assert.equal(name, 'complete_ra_analysis');
      if (state.rpcFails) return { error: { message: 'failure' } };
      Object.assign(state.row, args.p_result);
      if (state.row.status === 'done') state.logs.push({ analysis_id: state.row.id, metrics: state.row.metrics });
      return { data: { ...state.row } };
    }
  };
  const diagnose = async args => {
    state.calls++;
    if (state.failTranscription) throw new Error('provider down');
    if (state.gate) await state.gate;
    return diagnoseRecording({ ...args, transcribe: async () => { state.transcribeCalls++; return ({ text: 'The server reference.', words: [
      { text: 'The', start_ms: 100, end_ms: 400 }, { text: 'server', start_ms: 500, end_ms: 800 }, { text: 'reference', start_ms: 900, end_ms: 1500 }
    ], provider: 'groq', model: 'whisper-large-v3' }); } });
  };
  const legacyHandler = async (req, res) => {
    state.legacyCalls++;
    assert.equal(req.body.questionContent, state.row.reference_text);
    assert.equal(req.body.transcript, state.row.client_transcript);
    assert.notEqual(req.body.transcript, state.row.transcript);
    if (state.legacyFails) res.status(502).json({ error: 'provider_failed' });
    else res.json({ overall: 70, provider_used: 'groq' });
  };
  const feedbackGenerator = async input => {
    state.feedbackCalls++;
    assert.deepEqual(Object.keys(input).sort(), ['evidence', 'metrics', 'referenceText']);
    assert.equal(input.referenceText, state.row.reference_text);
    if (state.feedbackGate) await state.feedbackGate;
    if (state.feedbackFails) throw new Error('feedback failed');
    return { feedback: { summary: '保持稳定朗读。', suggestions: [] }, meta: { provider: 'groq', model: 'test', prompt_version: 'ra-feedback-0.1', attempts: 1, latency_ms: 1 } };
  };
  const handler = createAnalyzeHandler({ createDb: () => db, diagnose, legacyHandler, feedbackGenerator });
  async function invoke(payload = body, overrides = {}) {
    const result = { code: 200, headers: {} };
    const res = { setHeader(k, v) { result.headers[k] = v; }, status(n) { result.code = n; return this; }, json(data) { result.data = data; return this; }, end() { return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer token' }, body: payload, ...overrides }, res);
    return result;
  }
  return { state, invoke };
}

test('diagnosis uses server reference, persists scoreless log and versions', async () => {
  const { invoke, state } = fixture();
  const result = await invoke({ ...body, questionContent: 'Forged client text.' });
  assert.equal(result.code, 200);
  assert.equal(result.data.status, 'done');
  assert.equal(result.data.question.content, 'The server reference.');
  assert.equal(result.data.metrics.completeness, 1);
  assert.equal(result.data.rules_version, 'ra-diag-0.1');
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0].overall, undefined);
  assert.ok(result.data.timings_ms.transcribe >= 0);
  assert.equal(state.row.client_transcript, body.client_transcript);
  assert.equal(state.row.transcript, 'The server reference.');
});
test('browser transcript accepts empty and missing text, preserves up to 5000 characters', async () => {
  for (const client_transcript of ['', undefined, 'x'.repeat(5000)]) {
    const { invoke, state } = fixture();
    assert.equal((await invoke({ ...body, client_transcript })).code, 200);
    assert.equal(state.row.client_transcript, client_transcript ?? '');
  }
});
test('invalid browser transcripts fail before claiming or transcribing', async () => {
  for (const client_transcript of [null, 1, {}, [], 'x'.repeat(5001)]) {
    const { invoke, state } = fixture();
    const result = await invoke({ ...body, client_transcript });
    assert.equal(result.code, 400);
    assert.equal(result.data.error, 'invalid_client_transcript');
    assert.equal(state.row, null);
    assert.equal(state.calls, 0);
  }
});
test('repeat attempt does not charge or log twice', async () => {
  const { invoke, state } = fixture();
  await invoke(); await invoke();
  assert.equal(state.calls, 1); assert.equal(state.logs.length, 1);
});
test('parallel attempts observe processing claim without duplicate transcription', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { invoke, state } = fixture({ gate });
  const first = invoke();
  while (!state.calls) await new Promise(resolve => setImmediate(resolve));
  const second = await invoke();
  assert.equal(second.code, 202); assert.equal(state.calls, 1);
  release(); await first; assert.equal(state.logs.length, 1);
});
test('forbidden audio paths never reach transcription', async () => {
  for (const path of ['ra/other/a.webm', 'ra/user/../a.webm', 'ra/user/%2e%2e/a.webm', 'ra/user/a\\b']) {
    const { invoke, state } = fixture();
    assert.equal((await invoke({ ...body, audio_path: path })).code, 403);
    assert.equal(state.calls, 0);
  }
});
test('transcription failure persists failed row, no score, no retry charge', async () => {
  const { invoke, state } = fixture({ failTranscription: true });
  const result = await invoke();
  assert.equal(result.code, 502); assert.equal(result.data.error, 'transcription_failed');
  assert.equal(state.row.status, 'failed'); assert.equal(state.logs.length, 0);
  await invoke(); assert.equal(state.calls, 1);
});
test('completion failure retains claim rather than charging on retry', async () => {
  const { invoke, state } = fixture({ rpcFails: true });
  assert.equal((await invoke()).code, 500);
  assert.equal((await invoke()).code, 202); assert.equal(state.calls, 1);
});
test('authentication and access permission are required', async () => {
  assert.equal((await fixture().invoke(body, { headers: {} })).code, 401);
  assert.equal((await fixture({ noAuth: true }).invoke()).code, 401);
  assert.equal((await fixture({ expired: true }).invoke()).code, 403);
});
test('non-POST and missing question are rejected', async () => {
  assert.equal((await fixture().invoke(body, { method: 'GET' })).code, 405);
  assert.equal((await fixture({ noQuestion: true }).invoke()).code, 404);
});
test('input bounds reject malformed or overlapping silence and long duration', () => {
  for (const patch of [ { duration_ms: 120001 }, { speech_onset_ms: -1 }, { speech_offset_ms: 3000 },
    { silences: [{ start_ms: 0, end_ms: 3000 }] }, { silences: [{ start_ms: 500, end_ms: 1000 }, { start_ms: 900, end_ms: 1500 }] },
    { silences: Array(501).fill({ start_ms: 0, end_ms: 1 }) }, { attempt_id: 'x' } ]) {
    assert.equal(validateAnalysisInput({ ...body, ...patch }, 'user')?.[0], 400);
  }
});
test('shadow generates server-side score and is idempotent', async () => {
  const { invoke, state } = fixture(); await invoke();
  const request = { action: 'legacy_score', attempt_id: body.attempt_id, legacy_score: { overall: 90 } };
  assert.equal((await invoke(request)).data.legacy_status, 'done'); await invoke(request);
  assert.equal(state.legacyCalls, 1); assert.equal(state.row.legacy_score.overall, 70);
});
test('shadow failure leaves diagnosis intact and logs no duplicate', async () => {
  const { invoke, state } = fixture({ legacyFails: true }); await invoke();
  assert.equal((await invoke({ action: 'legacy_score', attempt_id: body.attempt_id })).data.legacy_status, 'failed');
  assert.equal(state.row.status, 'done'); assert.equal(state.row.legacy_score, null); assert.equal(state.logs.length, 1);
});
test('empty browser transcript fails shadow without substituting Whisper or charging on retry', async () => {
  for (const client_transcript of ['', '   ', undefined]) {
    const { invoke, state } = fixture();
    await invoke({ ...body, client_transcript });
    const request = { action: 'legacy_score', attempt_id: body.attempt_id };
    assert.equal((await invoke(request)).data.legacy_status, 'failed');
    assert.equal((await invoke(request)).data.legacy_status, 'failed');
    assert.equal(state.legacyCalls, 0);
    assert.equal(state.row.status, 'done');
    assert.equal(state.row.legacy_score, null);
    assert.equal(state.logs.length, 1);
  }
});
test('shadow cannot read another account attempt', async () => {
  const { invoke, state } = fixture(); await invoke(); state.row.user_id = 'other';
  assert.equal((await invoke({ action: 'legacy_score', attempt_id: body.attempt_id })).code, 404);
  assert.equal(state.legacyCalls, 0);
});

test('silent browser signal returns unusable without provider charge or fabricated score', async () => {
  const { invoke, state } = fixture();
  const result = await invoke({ ...body, speech_onset_ms: null, speech_offset_ms: null });
  assert.equal(result.code, 200); assert.equal(result.data.status, 'unusable_audio');
  assert.equal(state.transcribeCalls, 0); assert.equal(state.logs.length, 0);
  assert.deepEqual(result.data.evidence, []); assert.equal(result.data.overall, undefined);
});

test('diagnosis retains original Whisper words for eval replay without normalizing twice', async () => {
  const words = [{ text: "Don't", start_ms: 100, end_ms: 500 }, { text: 'stop', start_ms: 600, end_ms: 1000 }];
  const result = await diagnoseRecording({
    db: { storage: { from: () => ({ download: async () => ({ data: new Blob(['audio']) }) }) } },
    row: { reference_text: "Don't stop.", audio_path: body.audio_path }, body,
    transcribe: async () => ({ text: "Don't stop.", words, provider: 'groq', model: 'whisper-large-v3' })
  });
  assert.deepEqual(result.aligned.words, words);
  assert.equal(result.transcript, "Don't stop.");
});

const feedbackRequest = { action: 'feedback', attempt_id: body.attempt_id };
test('feedback persists summary and metadata and reuses done result without generation', async () => {
  const { invoke, state } = fixture(); await invoke();
  const first = await invoke(feedbackRequest);
  assert.equal(first.code, 200); assert.equal(first.data.feedback_status, 'done');
  assert.equal(first.data.feedback.summary, '保持稳定朗读。');
  assert.equal(state.logs[0].feedback, first.data.feedback.summary);
  assert.equal(first.data.feedback_meta.prompt_version, 'ra-feedback-0.1');
  assert.deepEqual((await invoke(feedbackRequest)).data, first.data);
  assert.equal(state.feedbackCalls, 1); assert.equal(state.logs.length, 1);
});
test('parallel feedback requests claim once and return processing to concurrent callers', async () => {
  let release;
  const feedbackGate = new Promise(resolve => { release = resolve; });
  const { invoke, state } = fixture({ feedbackGate }); await invoke();
  const first = invoke(feedbackRequest);
  for (let tick = 0; !state.feedbackCalls && tick < 100; tick++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.feedbackCalls, 1);
  const second = await invoke(feedbackRequest);
  assert.equal(second.code, 202); assert.equal(second.data.feedback_status, 'processing');
  assert.equal(state.feedbackCalls, 1);
  release(); assert.equal((await first).data.feedback_status, 'done');
});
test('feedback is scoped to the authenticated owner and existing attempt', async () => {
  const { invoke, state } = fixture();
  assert.equal((await invoke(feedbackRequest)).code, 404);
  await invoke(); state.row.user_id = 'other';
  assert.equal((await invoke(feedbackRequest)).code, 404); assert.equal(state.feedbackCalls, 0);
});
test('feedback requires complete usable diagnosis and AI access', async () => {
  const { invoke, state } = fixture(); await invoke();
  for (const status of ['processing', 'failed', 'unusable_audio']) {
    state.row.status = status;
    assert.equal((await invoke(feedbackRequest)).code, 409);
  }
  state.row.status = 'done'; state.expired = true;
  assert.equal((await invoke(feedbackRequest)).code, 403);
  assert.equal((await invoke(feedbackRequest, { headers: {} })).code, 401);
  assert.equal(state.feedbackCalls, 0);
});
test('feedback claim failure never invokes generator', async () => {
  const { invoke, state } = fixture({ feedbackClaimFails: true }); await invoke();
  assert.equal((await invoke(feedbackRequest)).code, 500); assert.equal(state.feedbackCalls, 0);
});
test('feedback persistence failure keeps claim so retries do not generate or partially save', async () => {
  const { invoke, state } = fixture({ feedbackSaveFails: true }); await invoke();
  assert.equal((await invoke(feedbackRequest)).code, 500);
  assert.equal(state.row.feedback_status, 'processing'); assert.equal(state.row.feedback, undefined);
  assert.equal(state.logs[0].feedback, undefined);
  assert.equal((await invoke(feedbackRequest)).code, 202); assert.equal(state.feedbackCalls, 1);
});
test('unexpected feedback failure is terminal without damaging diagnosis or charging again', async () => {
  const { invoke, state } = fixture({ feedbackFails: true }); await invoke();
  assert.equal((await invoke(feedbackRequest)).data.feedback_status, 'failed');
  assert.equal(state.row.status, 'done'); assert.equal(state.logs.length, 1);
  assert.equal((await invoke(feedbackRequest)).data.feedback_status, 'failed');
  assert.equal(state.feedbackCalls, 1);
});
