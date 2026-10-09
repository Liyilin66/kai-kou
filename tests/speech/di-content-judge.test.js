import test from 'node:test';
import assert from 'node:assert/strict';
import { contentBandFromCoverage, judgeDIContent, normalizeForQuote, validateJudgement, DI_CONTENT_MODEL } from '../../backend/speech/di-content-judge.js';

const answerKey = { id: 'DI_Q001', answer_key_version: 'di-key-0.1', points: [
  { id: 'P1', kind: 'topic', text: 'Population share by age and sex', required: true },
  { id: 'P2', kind: 'element', text: 'Males on the left, females on the right' },
  { id: 'P3', kind: 'extreme', text: '25-34 is the largest group', value: '16.2 per cent' },
  { id: 'P4', kind: 'trend', text: 'Shares fall in older groups' }
] };
const transcript = 'This chart shows the population by age and sex. The largest group is 25 to 34 at 16.2 percent, and older groups get smaller.';
const reply = output => ({ raw_text: JSON.stringify(output), latency_ms: 5 });
const good = { covered: [{ point_id: 'P1', quote: 'population by age and sex' }, { point_id: 'P3', quote: 'largest group is 25 to 34' }, { point_id: 'P4', quote: 'older groups get smaller' }],
  inaccurate: [], missed: ['P2'], content_band: 5 };

const band = (covered, inaccurate = [], points = answerKey.points) => contentBandFromCoverage({ points, coveredIds: covered, inaccurateIds: inaccurate });
for (const [name, covered, inaccurate, expected] of [
  ['nothing covered', [], [], 0],
  ['all covered, no inaccuracy', ['P1', 'P2', 'P3', 'P4'], [], 6],
  ['75% with topic and relation', ['P1', 'P3', 'P4'], [], 5],
  ['75% with one inaccuracy', ['P1', 'P3', 'P4'], ['P2'], 5],
  ['75% without topic', ['P2', 'P3', 'P4'], [], 4],
  ['half with relation', ['P2', 'P4'], [], 4],
  ['half without relation', ['P1', 'P3'], [], 3],
  ['half with relation but two inaccuracies', ['P1', 'P4'], ['P2', 'P3'], 3],
  ['one covered', ['P1'], [], 2],
  ['one covered, one inaccurate', ['P1'], ['P3'], 2],
  ['inaccuracies outnumber covered', ['P1'], ['P2', 'P3'], 1]
]) test(`content band: ${name}`, () => assert.equal(band(covered, inaccurate), expected));

test('quotes are matched on words, ignoring case and punctuation', () => {
  assert.equal(normalizeForQuote('Hello, World! 16.2%'), 'hello world 16 2');
  const result = validateJudgement({ ...good, covered: [{ point_id: 'P1', quote: 'POPULATION, by age' }, ...good.covered.slice(1)] }, { answerKey, transcript });
  assert.deepEqual(result.errors, []);
});

test('validation rejects invented quotes, unknown or duplicated points and unclassified points', () => {
  const errors = output => validateJudgement(output, { answerKey, transcript }).errors.join(' | ');
  assert.match(errors({ ...good, covered: [{ point_id: 'P1', quote: 'a pie chart of income' }, ...good.covered.slice(1)] }), /quote not found/);
  assert.match(errors({ ...good, covered: [{ point_id: 'P1', quote: 'population by age and s' }, ...good.covered.slice(1)] }), /quote not found/);
  assert.match(errors({ ...good, missed: ['P2', 'P9'] }), /unknown point_id P9/);
  assert.match(errors({ ...good, missed: ['P2', 'P3'] }), /P3 appears in both covered and missed/);
  assert.match(errors({ ...good, missed: [] }), /points not classified: P2/);
  assert.match(errors({ ...good, inaccurate: [{ point_id: 'P2', quote: 'This chart shows' }], missed: [] }), /reason is required/);
  assert.match(errors({ ...good, content_band: 7 }), /content_band must be an integer 0-6/);
});

test('judge uses one fixed model at temperature 0 and the code band wins over the model band', async () => {
  const calls = [];
  const result = await judgeDIContent({ answerKey, transcript, callModel: async options => { calls.push(options); return reply({ ...good, content_band: 6 }); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DI_CONTENT_MODEL);
  assert.equal(calls[0].temperature, 0);
  assert.equal(result.status, 'scored');
  assert.equal(result.content_band, 5);
  assert.equal(result.model_band, 6);
  assert.equal(result.band_mismatch, true);
  assert.deepEqual(result.missed, ['P2']);
});

test('judge retries once with the validation errors, then scores', async () => {
  const prompts = [];
  const outputs = [{ ...good, missed: [] }, good];
  const result = await judgeDIContent({ answerKey, transcript, callModel: async ({ prompt }) => { prompts.push(prompt); return reply(outputs.shift()); } });
  assert.equal(result.status, 'scored');
  assert.equal(result.attempts, 2);
  assert.match(prompts[1], /points not classified: P2/);
  assert.equal(result.validation_failures.length, 1);
});

test('two invalid answers leave content unscored', async () => {
  const result = await judgeDIContent({ answerKey, transcript, callModel: async () => ({ raw_text: 'not json' }) });
  assert.equal(result.status, 'not_scored');
  assert.equal(result.reason, 'validation_failed');
  assert.equal('content_band' in result, false);
});

test('a model error leaves content unscored without retrying or falling back', async () => {
  let calls = 0;
  const result = await judgeDIContent({ answerKey, transcript, callModel: async () => { calls++; throw Object.assign(new Error('rate limited'), { status: 429, raw_error_type: 'groq_http_429' }); } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'not_scored');
  assert.equal(result.reason, 'model_error');
  assert.equal(result.status_code, 429);
});

test('an empty transcript is band 0 without a model call; a missing answer key is unscored', async () => {
  const callModel = async () => { throw new Error('should not be called'); };
  const empty = await judgeDIContent({ answerKey, transcript: '  ...  ', callModel });
  assert.equal(empty.content_band, 0);
  assert.deepEqual(empty.missed, ['P1', 'P2', 'P3', 'P4']);
  assert.equal((await judgeDIContent({ answerKey: null, transcript, callModel })).status, 'not_scored');
});
