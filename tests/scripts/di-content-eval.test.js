import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswerKeyItem } from '../../backend/speech/di-answer-key.js';
import { buildAnswerKey, buildAnswerKeyItem, callVisionModel, parseModelJSON } from '../../scripts/di-build-answer-key.js';
import { evaluateGates, pickSamples, selectReviewImages, summarizeRuns } from '../../scripts/eval-di-content.js';

const question = { id: 'DI_Q001', imageType: 'bar', imageUrl: '/di-images/di-001.png' };
const modelPoints = { points: [
  { kind: 'topic', text: 'Population share by age and sex' },
  { kind: 'element', text: 'Males left, females right' },
  { kind: 'extreme', text: '25-34 is largest', value: '16.2 per cent' },
  { kind: 'trend', text: 'Older groups shrink', value: '' }
] };
const item = buildAnswerKeyItem({ question, parsed: modelPoints, generatedBy: { model: 'm' } });

test('answer-key items get sequential ids, a required topic and the catalog image type', () => {
  assert.deepEqual(item.points.map(point => point.id), ['P1', 'P2', 'P3', 'P4']);
  assert.equal(item.points[0].required, true);
  assert.equal('required' in item.points[1], false);
  assert.equal(item.points[3].value, null);
  assert.equal(item.image_type, 'bar');
  assert.deepEqual(item.review, { status: 'unreviewed' });
  assert.deepEqual(validateAnswerKeyItem(item), []);
  assert.deepEqual(parseModelJSON('```json\n{"points":[]}\n```'), { points: [] });
});

test('answer-key validation rejects too few points, a missing topic, unknown kinds and no relation point', () => {
  const errors = points => validateAnswerKeyItem({ ...item, points }).join(' | ');
  assert.match(errors(item.points.slice(0, 3)), /4-6 items/);
  assert.match(errors(item.points.map(point => ({ ...point, kind: point.kind === 'topic' ? 'element' : point.kind }))), /required topic/);
  assert.match(errors(item.points.map((point, i) => i === 1 ? { ...point, kind: 'colour' } : point)), /kind is not allowed/);
  assert.match(errors(item.points.map(point => point.kind === 'trend' ? { ...point, kind: 'number' } : point)), /trend, comparison, sequence or conclusion/);
  assert.match(errors([item.points[1], ...item.points.slice(1)]), /must be P1/);
});

const catalog = { questions: [question, { id: 'DI_Q002', imageType: 'line', imageUrl: '/di-images/di-002.png' }, { id: 'DI_Q003', imageType: 'pie', imageUrl: '/di-images/di-003.png' }] };
const reply = parsed => ({ text: JSON.stringify(parsed), requested_model: 'luna', model: 'terra' });

test('building the key skips existing items, keeps reviewed items under --force and retries invalid output once', async () => {
  const reviewed = { ...item, review: { status: 'reviewed' } };
  const calls = [];
  const outputs = { DI_Q002: [{ points: modelPoints.points.slice(0, 2) }, modelPoints], DI_Q003: [{ nope: 1 }, { nope: 2 }] };
  const { file, failures } = await buildAnswerKey({ catalog, existing: { items: [reviewed] }, force: true, concurrency: 1, now: () => 'T',
    callModel: async ({ imagePath, prompt }) => { const id = `DI_Q00${imagePath.match(/di-00(\d)/)[1]}`; calls.push({ id, prompt }); return reply(outputs[id].shift()); } });
  assert.deepEqual(calls.map(call => call.id), ['DI_Q002', 'DI_Q002', 'DI_Q003', 'DI_Q003']);
  assert.match(calls[1].prompt, /previous answer was rejected: .*4-6 items/);
  assert.deepEqual(file.items.map(entry => entry.id), ['DI_Q001', 'DI_Q002']);
  assert.equal(file.items[0].review.status, 'reviewed');
  assert.deepEqual(file.items[1].generated_by, { provider: 'openai-compatible', requested_model: 'luna', model: 'terra', at: 'T', attempts: 2 });
  assert.deepEqual(failures.map(failure => failure.id), ['DI_Q003']);
});

test('vision calls back off on rate limits but not on client errors', async () => {
  const env = { AGENT_OPENAI_BASE_URL: 'https://relay.test/v1', AGENT_OPENAI_API_KEY: 'k', AGENT_OPENAI_MODEL: 'luna' };
  const waits = [];
  const statuses = [429, 524, 200];
  const fetchImpl = async () => { const status = statuses.shift(); return { ok: status === 200, status, json: async () => ({ model: 'terra', choices: [{ message: { content: '{"points":[]}' } }] }) }; };
  const result = await callVisionModel({ imagePath: new URL('../../public/di-images/di-001.png', import.meta.url), prompt: 'p', fetchImpl, env, wait: async ms => waits.push(ms) });
  assert.equal(result.model, 'terra');
  assert.deepEqual(waits, [15000, 30000]);
  await assert.rejects(callVisionModel({ imagePath: new URL('../../public/di-images/di-001.png', import.meta.url), prompt: 'p', env, wait: async () => assert.fail('no retry'),
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }) }), /HTTP 400/);
});

const scored = band => ({ status: 'scored', content_band: band, attempts: 1, band_mismatch: false });
test('stability counts identical bands per sample and treats unscored runs as unstable', () => {
  const summary = summarizeRuns([
    { id: 'a', runs: [scored(3), scored(3), scored(3), scored(3), scored(3)] },
    { id: 'b', runs: [scored(3), scored(4), scored(3), scored(3), { ...scored(3), attempts: 2 }] },
    { id: 'c', runs: [scored(2), scored(2), scored(2), scored(2), { status: 'not_scored', reason: 'validation_failed', attempts: 2 }] }
  ]);
  assert.equal(summary.identical, 1);
  assert.equal(summary.identical_share, 1 / 3);
  assert.equal(summary.others_within_spread, false);
  assert.equal(summary.final_pass, 14);
  assert.equal(summary.first_attempt_pass, 13);
  assert.deepEqual(summary.not_scored_reasons, { validation_failed: 1 });
  assert.deepEqual(summary.per_sample[1], { id: 'b', bands: [3, 4, 3, 3, 3], identical: false, spread: 1, allScored: true });
});

test('gates require every threshold and count wrong points per image', () => {
  const summary = { identical_share: 0.8, others_within_spread: true, final_pass_rate: 0.96 };
  const review = { images: { DI_Q001: { P1: 'correct', P2: 'wrong', P3: 'unclear', note: 'x' }, DI_Q002: { P1: 'correct' } },
    judgements: { a: { verdict: 'agree' }, b: { verdict: 'agree' }, c: { verdict: 'agree' }, d: { verdict: 'agree' }, e: { verdict: 'disagree' } } };
  const result = evaluateGates({ summary, review });
  assert.equal(result.passed, true);
  assert.deepEqual(result.images[0], { id: 'DI_Q001', wrong: 1, unclear: 1 });
  assert.equal(evaluateGates({ summary, review: { ...review, images: { DI_Q001: { P1: 'wrong', P2: 'wrong' } } } }).gates.answer_key, false);
  assert.equal(evaluateGates({ summary: { ...summary, final_pass_rate: 0.94 }, review }).gates.validation, false);
  assert.equal(evaluateGates({ summary, review: { ...review, judgements: { a: { verdict: 'agree' } } } }).gates.agreement, false);
});

test('review selection covers each chart type and sampling is deterministic', () => {
  const types = ['bar', 'line', 'pie', 'map', 'process', 'mixed', 'line', 'process', 'bar'];
  const fullCatalog = { questions: types.map((imageType, i) => ({ id: `DI_Q00${i + 1}`, imageType })) };
  const keys = new Map(fullCatalog.questions.map(entry => [entry.id, {}]));
  assert.deepEqual(selectReviewImages(fullCatalog, keys), ['DI_Q001', 'DI_Q002', 'DI_Q003', 'DI_Q004', 'DI_Q005', 'DI_Q006', 'DI_Q007', 'DI_Q008']);
  assert.deepEqual(pickSamples(['a', 'b', 'c', 'd', 'e', 'f'], 5), pickSamples(['a', 'b', 'c', 'd', 'e', 'f'], 5));
  assert.equal(new Set(pickSamples(['a', 'b', 'c', 'd', 'e', 'f'], 5)).size, 5);
});
test('silent-recording hallucinations fall below the minimum transcript length', async () => {
  const { wordCount, MIN_TRANSCRIPT_WORDS } = await import('../../scripts/eval-di-content.js');
  assert.ok(wordCount(' Thank you.') < MIN_TRANSCRIPT_WORDS);
  assert.ok(wordCount(' you') < MIN_TRANSCRIPT_WORDS);
  assert.ok(wordCount('The graph shows the composition of the air.') >= MIN_TRANSCRIPT_WORDS);
});
test('paced judging repeats only rate-limited runs and counts them', async () => {
  const { judgePaced } = await import('../../scripts/eval-di-content.js');
  const outcomes = [{ status: 'not_scored', reason: 'model_error', status_code: 429 }, { status: 'scored', content_band: 3 }];
  const waits = [], rateLimited = { count: 0 };
  const result = await judgePaced({ answerKey: {}, transcript: 't', intervalMs: 30000, rateLimited, judge: async () => outcomes.shift(), wait: async ms => waits.push(ms) });
  assert.equal(result.content_band, 3);
  assert.equal(rateLimited.count, 1);
  assert.deepEqual(waits, [30000, 60000, 30000]);
  const failed = await judgePaced({ answerKey: {}, transcript: 't', intervalMs: 0, rateLimited, judge: async () => ({ status: 'not_scored', reason: 'model_error', status_code: 500 }), wait: async () => {} });
  assert.equal(failed.status_code, 500);
  assert.equal(rateLimited.count, 1);
});
