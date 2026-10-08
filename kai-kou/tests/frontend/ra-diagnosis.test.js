import test from 'node:test';
import assert from 'node:assert/strict';
import { createRADiagnosisSubmission, evidencePlaybackSeconds, diagnosisWordItems } from '../../src/lib/ra-diagnosis.js';

const speechDiagnosis = { silences: [], speech_onset_ms: 100, speech_offset_ms: 1000, duration_ms: 1200 };
function clientStub(events) {
  return { auth: { getSession: async () => ({ data: { session: { access_token: 'token', user: { id: 'user' } } } }) },
    storage: { from: () => ({ upload: async (...args) => { events.push(['upload', ...args]); return {}; } }) } };
}
test('retry preserves attempt ID and upload; shadow does not delay diagnosis or write client scores', async () => {
  const events = [];
  let calls = 0;
  const submit = createRADiagnosisSubmission({ client: clientStub(events), createId: () => 'attempt', fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); events.push(['request', body]);
    if (body.action === 'legacy_score') return new Promise(() => {});
    if (++calls === 1) throw new Error('network');
    return { ok: true, json: async () => ({ status: 'done', analysis_id: 'analysis', rules_version: 'ra-diag-0.1' }) };
  } });
  const input = { blob: new Blob(['audio'], { type: 'audio/wav' }), questionId: 'RA_1', speechDiagnosis };
  await assert.rejects(submit(input), /network/);
  const result = await submit(input);
  assert.equal(result.kind, 'ra_diagnosis');
  assert.equal(events.filter(e => e[0] === 'upload').length, 1);
  assert.equal(events[0][1], 'ra/user/attempt.wav');
  const requests = events.filter(e => e[0] === 'request').map(e => e[1]);
  assert.equal(requests[0].attempt_id, requests[1].attempt_id);
  assert.deepEqual(requests[2], { action: 'legacy_score', attempt_id: 'attempt' });
});
test('upload failure prevents analysis', async () => {
  const client = clientStub([]);
  client.storage.from = () => ({ upload: async () => ({ error: new Error('upload') }) });
  const submit = createRADiagnosisSubmission({ client, createId: () => 'id', fetchImpl: () => { throw new Error('must not request'); } });
  await assert.rejects(submit({ blob: new Blob(['audio']), questionId: 'RA', speechDiagnosis }), /上传失败/);
});
test('missing decoded PCM fails explicitly before upload', async () => {
  const events = [];
  const submit = createRADiagnosisSubmission({ client: clientStub(events), createId: () => 'id' });
  await assert.rejects(submit({ blob: new Blob(['audio']) }), /无法解码/);
  assert.equal(events.length, 0);
});
test('long pause seeks one second before; omissions use nearest reliable word', () => {
  assert.equal(evidencePlaybackSeconds({ type: 'long_pause', time_ms: [2200, 4300] }), 1.2);
  assert.equal(evidencePlaybackSeconds({ type: 'hesitation', time_ms: [500, 1100] }), 0);
  assert.equal(evidencePlaybackSeconds({ type: 'omission', ref_span: [2, 3] }, { ops: [{ ref_index: 3, start_ms: 3000 }] }), 2);
  assert.equal(evidencePlaybackSeconds({ type: 'omission', ref_span: [2, 3] }, { ops: [] }), null);
});
test('homophones and low confidence never acquire error colour', () => {
  const alignment = { reference: [{ text: 'their' }, { text: 'sound' }], ops: [{ ref_index: 0, tag: 'homophone' }, { ref_index: 1, tag: 'low_confidence' }] };
  const evidence = [{ type: 'substitution', ref_span: [0, 1] }, { type: 'substitution', ref_span: [1, 2] }];
  assert.deepEqual(diagnosisWordItems(alignment, evidence).map(word => word.type), ['uncertain', 'uncertain']);
});
test('display retains original punctuation and avoids expanding contractions', () => {
  const alignment = { reference: [{ text: "Don't" }, { text: "Don't" }, { text: 'stop' }], ops: [] };
  const words = diagnosisWordItems(alignment, [{ type: 'omission', ref_span: [2, 3] }], "Don't stop.");
  assert.deepEqual(words.map(word => word.text), ["Don't", 'stop.']);
  assert.equal(words[1].type, 'omission');
});
