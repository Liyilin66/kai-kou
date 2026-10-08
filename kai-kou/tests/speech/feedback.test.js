import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, buildTemplateFeedback, generateEvidenceFeedback } from '../../backend/speech/feedback.js';
const evidence = [{ id: 'E1', type: 'omission', text: 'climate', severity: 3 },
  { id: 'E2', type: 'long_pause', text: 'change', detail: { pause_ms: 2300 }, severity: 3 },
  { id: 'E3', type: 'substitution', text: 'environment', severity: 2 }];
const good = () => ({ summary: '先回听标记位置，再针对性重读。', suggestions: [{ evidence_ids: ['E1'], issue: '这里可能漏读了词语', action: '回听标记位置，再对照原文慢读三遍。' }] });
test('accepts grounded Chinese feedback', () => assert.equal(validateFeedback(good(), evidence).ok, true));
for (const [name, mutate] of [
  ['missing summary', p => delete p.summary], ['summary length', p => p.summary = '长'.repeat(61)],
  ['issue length', p => p.suggestions[0].issue = '漏'.repeat(41)], ['action length', p => p.suggestions[0].action = '读'.repeat(61)],
  ['empty action', p => p.suggestions[0].action = ''], ['missing suggestions', p => delete p.suggestions],
  ['too many suggestions', p => p.suggestions = Array(4).fill(p.suggestions[0])],
  ['no suggestion with evidence', p => p.suggestions = []], ['no reference', p => p.suggestions[0].evidence_ids = []],
  ['unknown reference', p => p.suggestions[0].evidence_ids = ['E99']],
  ['wrong issue type', p => p.suggestions[0].issue = '这里停顿太久'],
  ['unsupported extra issue', p => p.suggestions[0].issue = '漏读并且重复了'],
  ['unsupported action claim', p => p.suggestions[0].action = '你的重音错误，需要纠正'],
  ['ungrounded summary', p => p.summary = '你的语法有问题'],
  ['extra fields', p => p.score = 90],
]) test(`rejects ${name}`, () => { const payload = good(); mutate(payload); assert.equal(validateFeedback(payload, evidence).ok, false); });
for (const banned of ['发音错误', '发音不准', '分数', '85分', '90 分', 'PTE', '音素错误']) {
  test(`rejects prohibited claim ${banned}`, () => { const payload = good(); payload.summary = banned; assert.equal(validateFeedback(payload, evidence).ok, false); });
}
test('validates null and malformed nested values without throwing', () => {
  for (const payload of [null, [], 42, { summary: '继续练习', suggestions: [null] }]) assert.equal(validateFeedback(payload, evidence).ok, false);
});
test('allows zero suggestions only without evidence', () => {
  assert.equal(validateFeedback({ summary: '保持练习，继续对照原文朗读。', suggestions: [] }, []).ok, true);
  assert.equal(validateFeedback(good(), []).ok, false);
});
test('substitution needs explicit uncertainty and listening, never pronunciation judgement', () => {
  const payload = good(); payload.suggestions[0] = { evidence_ids: ['E3'], issue: '可能读错或识别不清', action: '先回听这一处，再对照原文重读。' };
  assert.equal(validateFeedback(payload, evidence).ok, true);
  payload.suggestions[0].issue = '这里读错了'; assert.equal(validateFeedback(payload, evidence).ok, false);
});
test('templates cover every evidence type and are valid even with long source words', () => {
  for (const type of ['omission', 'insertion', 'repetition', 'substitution', 'hesitation', 'long_pause', 'late_start']) {
    const items = [{ id: 'E1', type, text: 'a'.repeat(200), detail: { pause_ms: 2300 } }];
    const result = buildTemplateFeedback({ evidence: items });
    assert.equal(validateFeedback(result, items).ok, true, JSON.stringify(result));
  }
});
test('uses successful model metadata and excludes unselected evidence/transcript from prompt', async () => {
  let prompt;
  const result = await generateEvidenceFeedback({ evidence: [...evidence, ...Array.from({length: 5}, (_, i) => ({ id: `E${i + 4}`, type: 'omission', severity: 1, text: 'extra' }))], referenceText: 'Reference', transcript: 'SECRET_TRANSCRIPT', callModel: async args => { prompt = args.prompt; return { raw_text: JSON.stringify(good()), provider_used: 'groq', model: 'test' }; } });
  assert.equal(result.meta.attempts, 1); assert.equal(result.meta.template, false); assert.equal(result.meta.model, 'test');
  assert.equal(prompt.includes('SECRET_TRANSCRIPT'), false); assert.equal(prompt.includes('"E8"'), false);
});
test('retries once with concrete validation reasons', async () => {
  let calls = 0;
  const result = await generateEvidenceFeedback({ evidence, callModel: async ({prompt}) => {
    calls++; if (calls === 1) return { raw_text: '{"summary":"发音错误","suggestions":[]}' };
    assert.match(prompt, /summary|禁用|suggestions/); return { raw_text: JSON.stringify(good()), provider_used: 'groq', model: 'test' };
  } });
  assert.equal(result.meta.attempts, 2); assert.equal(result.meta.template, false);
  assert.equal(result.meta.validation_failures.length, 1);
  assert.equal(result.meta.validation_failures[0].attempt, 1);
  assert.equal(result.meta.validation_failures[0].errors.length > 0, true);
});
test('invalid JSON twice falls back to valid deterministic template', async () => {
  const result = await generateEvidenceFeedback({ evidence, callModel: async () => ({ raw_text: 'not json' }) });
  assert.equal(result.meta.attempts, 2); assert.equal(result.meta.template, true); assert.equal(result.meta.provider, 'template');
  assert.equal(validateFeedback(result.feedback, evidence).ok, true);
});
test('model outage uses template without leaking provider errors', async () => {
  const result = await generateEvidenceFeedback({ evidence, callModel: async () => { throw new Error('secret'); } });
  assert.equal(result.meta.template, true); assert.equal(JSON.stringify(result).includes('secret'), false);
});
test('without evidence does not call model and keeps suggestions empty', async () => {
  const result = await generateEvidenceFeedback({ evidence: [], metrics: { wpm: 120 }, callModel: async () => { throw new Error('must not call'); } });
  assert.deepEqual(result.feedback.suggestions, []); assert.equal(result.meta.attempts, 0);
});

function setEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}
// Exercise production provider routing with an intercepted fetch, never paid APIs.
for (const status of [401, 402, 403, 404, 500]) {
  test(`Groq HTTP ${status} falls back to scoring provider`, async t => {
    setEnv(t, 'GROQ_API_KEY', 'test-key');
    setEnv(t, 'SCORING_OPENAI_API_KEY', 'test-key');
    setEnv(t, 'SCORING_OPENAI_BASE_URL', 'https://scoring.invalid/v1');
    setEnv(t, 'SCORING_OPENAI_MODEL', 'fallback-model');
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      urls.push(url);
      if (urls.length === 1) {
        assert.equal(JSON.parse(init.body).model, 'openai/gpt-oss-120b');
        return new Response(JSON.stringify({ error: { message: 'test' } }), { status });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good()) } }] }));
    });
    const result = await generateEvidenceFeedback({ evidence });
    assert.equal(result.meta.provider, 'openai'); assert.equal(result.meta.model, 'fallback-model');
    assert.equal(result.meta.template, false); assert.equal(urls.length, 2);
  });
}
for (const status of [400, 413, 422]) {
  test(`Groq HTTP ${status} stops provider fallback and returns template`, async t => {
    setEnv(t, 'GROQ_API_KEY', 'test-key');
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('{}', { status }); });
    const result = await generateEvidenceFeedback({ evidence });
    assert.equal(requests, 1); assert.equal(result.meta.template, true);
  });
}
test('missing Groq key falls back without a Groq request', async t => {
  setEnv(t, 'GROQ_API_KEY', ''); setEnv(t, 'GROP_API_KEY', '');
  setEnv(t, 'SCORING_OPENAI_API_KEY', 'test-key'); setEnv(t, 'SCORING_OPENAI_BASE_URL', 'https://scoring.invalid/v1'); setEnv(t, 'SCORING_OPENAI_MODEL', 'fallback-model');
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://scoring.invalid/v1/chat/completions');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good()) } }] }));
  });
  const result = await generateEvidenceFeedback({ evidence }); assert.equal(result.meta.provider, 'openai');
});
test('rejects new diagnostic claims in action even with a valid pause issue', () => {
  const items = [{ id: 'E1', type: 'long_pause', text: 'environment', detail: { pause_ms: 2300 } }];
  const payload = { summary: '先回听标记位置。', suggestions: [{ evidence_ids: ['E1'], issue: '这里存在较长停顿', action: '你漏读了environment，先补读这个词。' }] };
  assert.equal(validateFeedback(payload, items).ok, false);
});
test('rejects ungrounded English words and invented timestamps', () => {
  const items = [{ id: 'E1', type: 'long_pause', text: 'environment', detail: { pause_ms: 2300 } }];
  for (const issue of ['在cat前存在较长停顿', '在environment前停顿9秒', '在environment前停顿九秒']) {
    const payload = { summary: '先回听标记位置。', suggestions: [{ evidence_ids: ['E1'], issue, action: '先把这一句连读三遍。' }] };
    assert.equal(validateFeedback(payload, items).ok, false);
  }
});
test('allows grounded quoted words and prescribed repetition without diagnosing repetition', () => {
  const items = [{ id: 'E1', type: 'long_pause', text: 'environment', detail: { pause_ms: 2300 } }];
  const payload = { summary: '先回听标记位置。', suggestions: [{ evidence_ids: ['E1'], issue: '“environment”处存在较长停顿', action: '回听这一处，先重复这一句三遍，再连贯朗读。' }] };
  assert.equal(validateFeedback(payload, items).ok, true);
  payload.suggestions[0].action = '你重复了environment，先改掉重复问题。';
  assert.equal(validateFeedback(payload, items).ok, false);
});
test('allows grounded expected and observed words for uncertain substitution feedback', () => {
  const items = [{ id: 'E1', type: 'substitution', text: 'climate', detail: { expected: 'climate', observed: 'client' } }];
  const payload = { summary: '先回听标记位置。', suggestions: [{ evidence_ids: ['E1'], issue: 'climate可能读错或识别不清', action: '回听确认是否被识别成client，再对照原文朗读。' }] };
  assert.equal(validateFeedback(payload, items).ok, true);
});
test('templates remain valid for numeric words, timed-looking reference text and metric summaries', () => {
  for (const text of ['5000', '9秒', 'internationalization']) {
    const items = [{ id: 'E1', type: 'omission', text }];
    assert.equal(validateFeedback(buildTemplateFeedback({ evidence: items }), items).ok, true);
  }
  assert.equal(validateFeedback(buildTemplateFeedback({ evidence: [], metrics: { wpm: 123 } }), []).ok, true);
});
