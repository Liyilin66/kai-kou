import test from 'node:test';
import assert from 'node:assert/strict';
import { createRADiagnosisSubmission, evidencePlaybackSeconds, diagnosisWordItems, loadRADiagnosisFeedback } from '../../src/lib/ra-diagnosis.js';

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

test('analysis includes browser transcript separately from recording and shadow request',async()=>{
 const bodies=[];
 const submit=createRADiagnosisSubmission({client:clientStub([]),createId:()=> 'attempt',fetchImpl:async(url,init)=>{
  bodies.push(JSON.parse(init.body));return{ok:true,json:async()=>({status:'done',rules_version:'test'})};
 }});
 await submit({blob:new Blob(['audio']),questionId:'RA',speechDiagnosis,clientTranscript:'browser words'});
 assert.equal(bodies[0].client_transcript,'browser words');assert.equal('client_transcript'in bodies[1],false);
});
test('unusable audio gives microphone guidance and discards its attempt for the next recording',async()=>{
 let next=0;const events=[],bodies=[];
 const submit=createRADiagnosisSubmission({client:clientStub(events),createId:()=>`attempt-${++next}`,fetchImpl:async(url,init)=>{
  const body=JSON.parse(init.body);bodies.push(body);
  return{ok:true,json:async()=>({status:bodies.length===1?'unusable_audio':'done',rules_version:'test'})};
 }});
 const input={blob:new Blob(['audio']),questionId:'RA',speechDiagnosis};
 await assert.rejects(submit(input),/没有检测到朗读声音，请检查麦克风后重录/);
 await submit(input);assert.notEqual(bodies[0].attempt_id,bodies[1].attempt_id);assert.equal(events.length,2);
});

const feedbackResult = { attempt_id: 'attempt', evidence: [{ id: 'E1', type: 'substitution', text: 'word', severity: 2 }], metrics: {} };
test('feedback sends only saved attempt ID with authentication and preserves model metadata', async () => {
  const calls = [];
  const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, fetchImpl: async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ feedback_status: 'done', feedback: { summary: '回听核验', suggestions: [] }, feedback_meta: { provider: 'groq', model: 'model' } }) };
  } });
  assert.deepEqual(calls, [{ url: '/api/ra/analyze', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }, body: { action: 'feedback', attempt_id: 'attempt' } }]);
  assert.equal(output.feedback.summary, '回听核验');
  assert.equal(output.feedback_meta.model, 'model');
});
test('processing feedback polls and then resolves without exposing loading as failure', async () => {
  let calls = 0;
  const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, wait: async () => {}, fetchImpl: async () => {
    calls++;
    return { ok: true, status: calls === 1 ? 202 : 200, json: async () => calls === 1 ? { feedback_status: 'processing' } : { feedback_status: 'done', feedback: { summary: '完成', suggestions: [] } } };
  } });
  assert.equal(calls, 2); assert.equal(output.feedback.summary, '完成');
});
test('failed feedback falls back to evidence-linked guidance without pronunciation claims', async () => {
  const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(output.feedback_meta.provider, 'template');
  assert.deepEqual(output.feedback.suggestions[0].evidence_ids, ['E1']);
  assert.match(output.feedback.suggestions[0].issue, /可能读错或识别不清/);
  assert.doesNotMatch(JSON.stringify(output.feedback), /发音错误|发音不准|PTE|分数/);
});
test('pending feedback is bounded and falls back when another request never finishes', async () => {
  let calls = 0;
  const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, wait: async () => {}, fetchImpl: async () => {
    calls++; return { ok: true, status: 202, json: async () => ({ feedback_status: 'processing' }) };
  } });
  assert.equal(calls, 5); assert.equal(output.feedback_meta.provider, 'template');
});
test('unmounted feedback aborts without making a request', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, signal: controller.signal, fetchImpl: async () => { assert.fail('request after abort'); } }), { name: 'AbortError' });
});
test('feedback server errors and malformed success fall back without rejecting the diagnosis', async () => {
  for (const response of [
    { ok: false, status: 500, json: async () => ({ error: 'database unavailable' }) },
    { ok: true, status: 200, json: async () => ({ feedback_status: 'done', feedback: {} }) }
  ]) {
    const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: feedbackResult, fetchImpl: async () => response });
    assert.equal(output.feedback_meta.provider, 'template');
    assert.deepEqual(output.feedback.suggestions[0].evidence_ids, ['E1']);
  }
});
test('without evidence or a saved attempt, feedback has no invented problems and never calls the API', async () => {
  const output = await loadRADiagnosisFeedback({ client: clientStub([]), result: { evidence: [], metrics: { wpm: 130 } }, fetchImpl: async () => { assert.fail('missing attempt must not call API'); } });
  assert.deepEqual(output.feedback.suggestions, []);
  assert.ok(output.feedback.summary.length);
});
test('versioned deterministic reference score does not invoke legacy model scoring',async()=>{
 const events=[];const submit=createRADiagnosisSubmission({client:clientStub(events),createId:()=> 'attempt-score',fetchImpl:async(url,opts)=>{const body=JSON.parse(opts.body);events.push(['request',body]);return new Response(JSON.stringify({status:'done',metrics:{score:{score_version:'ra-score-0.1',total:80}}}));}});
 await submit({blob:new Blob(['audio'],{type:'audio/webm'}),questionId:'RA_001',speechDiagnosis});
 assert.equal(events.filter(e=>e[0]==='request').length,1);
});
