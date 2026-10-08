import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzeHandler } from '../../api/ra/analyze.js';
import { diagnoseRecording, validateAnalysisInput } from '../../backend/speech/analyze-service.js';

const body = { attempt_id: 'attempt-0001', question_id: 'RA_001', audio_path: 'ra/user/recording.webm',
  duration_ms: 2000, speech_onset_ms: 100, speech_offset_ms: 1900, silences: [] };
function fixture(options = {}) {
  const state = { row: null, calls: 0, transcribeCalls: 0, logs: [], legacyCalls: 0, ...options };
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
          if (this.op === 'update') Object.assign(state.row, this.value);
          return { data: { ...state.row } };
        } };
      return q;
    },
    async rpc(name, args) {
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
    assert.equal(req.body.transcript, state.row.transcript);
    if (state.legacyFails) res.status(502).json({ error: 'provider_failed' });
    else res.json({ overall: 70, provider_used: 'groq' });
  };
  const handler = createAnalyzeHandler({ createDb: () => db, diagnose, legacyHandler });
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
