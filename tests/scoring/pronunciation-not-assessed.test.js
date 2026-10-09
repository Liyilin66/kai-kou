import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION, PRONUNCIATION_NOT_ASSESSED_VERSIONS, isPronunciationNotAssessedVersion,
  weightedOverallWithoutPronunciation, withPronunciationNotAssessed } from '../../backend/scoring/pronunciation-not-assessed.js';
import { buildDIAiFallbackResult, finalizeDIScorePayload } from '../../backend/di/normalize-di-score.js';
import { buildRTSAiFallbackResult, finalizeRTSScorePayload } from '../../backend/rts/normalize-rts-score.js';
import { normalizeResult } from '../../api/score.js';

const PRONUNCIATION_PATHS = [
  result => result.scores?.pronunciation,
  result => result.display_scores?.pronunciation,
  result => result.product?.pronunciation,
  result => result.diagnostics?.display_scores?.pronunciation,
  result => result.raw_traits?.pronunciation_raw,
  result => result.official_traits?.pronunciation?.score
];
function assertNoPronunciationNumber(result, version) {
  assert.equal(result.score_version, version);
  assert.equal(result.pronunciation_status, 'not_assessed');
  for (const read of PRONUNCIATION_PATHS) assert.ok(read(result) === null || read(result) === undefined, `${read} should be empty`);
  if (result.official_traits?.pronunciation) assert.equal(result.official_traits.pronunciation.judged, false);
}

test('weights drop pronunciation and keep the old proportions between the remaining traits', () => {
  assert.deepEqual(OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION.DI, { content: 0.6, fluency: 0.4 });   // 0.45 : 0.30
  assert.deepEqual(OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION.RTS, { content: 0.2, fluency: 0.8 });  // 0.15 : 0.60
  assert.deepEqual(OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION.RL, { content: 0.5, fluency: 0.5 });   // equal thirds
  for (const weights of Object.values(OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION)) assert.equal(weights.content + weights.fluency, 1);
  assert.equal(weightedOverallWithoutPronunciation('DI', { content: 80, fluency: 50 }), 68);
  assert.equal(weightedOverallWithoutPronunciation('RTS', { content: 80, fluency: 50 }), 56);
  assert.throws(() => weightedOverallWithoutPronunciation('RA', {}), /No pronunciation-free weights/);
});

test('the helper clears every stored pronunciation number and stamps the version', () => {
  const result = withPronunciationNotAssessed({ overall: 60, scores: { pronunciation: 70, content: 60 }, display_scores: { pronunciation: 70 },
    product: { pronunciation: 70 }, diagnostics: { display_scores: { pronunciation: 70 }, other: 1 }, raw_traits: { pronunciation_raw: 4 },
    official_traits: { pronunciation: { score: 4, max: 5, judged: true } } }, 'RTS');
  assertNoPronunciationNumber(result, 'rts-legacy-np-0.1');
  assert.equal(result.official_traits.pronunciation.max, 5);
  assert.equal(result.scores.content, 60);
  assert.equal(result.diagnostics.other, 1);
  assert.ok(isPronunciationNotAssessedVersion(PRONUNCIATION_NOT_ASSESSED_VERSIONS.DI));
  assert.equal(isPronunciationNotAssessedVersion('ra-score-0.1'), false);
});

const diPayload = pronunciation => ({ official_traits: { content: { score: 4 }, pronunciation: { score: pronunciation }, oral_fluency: { score: 3 } },
  feedback_zh: 'ok', better_response: 'The chart shows rainfall by month.' });
const diContext = { transcript: 'The bar chart shows rainfall by month in London. Rainfall peaks in November and is lowest in July. Overall it is wetter in winter than in summer.' };
test('DI results carry no pronunciation number and the overall ignores the pronunciation trait', () => {
  const low = finalizeDIScorePayload(diPayload(0), diContext);
  const high = finalizeDIScorePayload(diPayload(5), diContext);
  assertNoPronunciationNumber(low, 'di-legacy-np-0.1');
  assert.equal(low.overall, high.overall);
  assert.deepEqual(low.display_scores, high.display_scores);
  assert.ok(Math.abs(low.overall - Math.round(0.6 * low.display_scores.content + 0.4 * low.display_scores.fluency)) <= 2);
  assertNoPronunciationNumber(buildDIAiFallbackResult({ transcript: '', reasonCode: 'transcript_empty' }), 'di-legacy-np-0.1');
});

const rtsPayload = pronunciation => ({ official_traits: { appropriacy: { score: 2 }, pronunciation: { score: pronunciation }, oral_fluency: { score: 3 } }, feedback_zh: ['ok'] });
const rtsContext = { transcript: 'Hi Sam, I am sorry I missed the meeting. Could you send me the notes and tell me what I should prepare for next week?', questionContent: 'You missed a team meeting. Ask a colleague for the notes.' };
test('RTS results carry no pronunciation number and the overall uses content 0.2 and fluency 0.8', () => {
  const low = finalizeRTSScorePayload(rtsPayload(0), rtsContext);
  const high = finalizeRTSScorePayload(rtsPayload(5), rtsContext);
  assertNoPronunciationNumber(low, 'rts-legacy-np-0.1');
  assert.equal(low.overall, high.overall);
  const shown = low.product ?? low.display_scores ?? low.scores;
  const weighted = Math.round(0.2 * shown.content + 0.8 * shown.fluency);
  assert.ok(low.overall === weighted || low.overall >= weighted, 'only the existing fluency pass floor may raise the weighted overall');
  assertNoPronunciationNumber(buildRTSAiFallbackResult({ transcript: '', reasonCodes: ['transcript_empty'] }), 'rts-legacy-np-0.1');
});

test('RL ignores the model pronunciation and its three-way average', () => {
  const result = normalizeResult({ scores: { pronunciation: 90, fluency: 60, content: 70 }, overall: 73, feedback: '好' }, { taskType: 'RL' });
  assert.deepEqual(result.scores, { pronunciation: null, fluency: 60, content: 70 });
  assert.equal(result.overall, 65);
  assertNoPronunciationNumber(result, 'rl-legacy-np-0.1');
  const rs = normalizeResult({ scores: { pronunciation: 90, fluency: 60, content: 70 }, overall: 73 }, { taskType: 'RS' });
  assert.equal(rs.scores.pronunciation, 90);
  assert.equal(rs.overall, 73);
});

const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('DI, RTS and RL result pages say pronunciation is not assessed instead of showing a number', () => {
  const copy = source('src/lib/ra-diagnosis-score.js');
  assert.match(copy, /PRONUNCIATION_NOT_ASSESSED_LABEL = '本版本未评估'/);
  assert.match(copy, /PRONUNCIATION_NOT_ASSESSED_REASON = '现有技术无法可靠测量发音，测不出来的项不给分。'/);
  assert.match(source('src/components/ra/RADiagnosisResult.vue'), /本版本未评估<\/strong><p>现有技术无法可靠测量发音，测不出来的项不给分。/);
  for (const [file, id] of [['src/views/DIResultView.vue', 'di'], ['src/views/RTSResultView.vue', 'rts']]) {
    const page = source(file);
    assert.match(page, new RegExp(`v-if="displayScores\\.pronunciation == null"[\\s\\S]*data-testid="${id}-pronunciation-not-assessed"[\\s\\S]*PRONUNCIATION_NOT_ASSESSED_REASON`));
    assert.match(page, /isPronunciationNotAssessedVersion\(source\?\.score_version\)/);
  }
  const rl = source('src/views/RLResultView.vue');
  assert.match(rl, /item\.key === 'pronunciation' && result\.scores\.pronunciation == null/);
  assert.match(rl, /data-testid="rl-pronunciation-not-assessed"/);
  assert.match(source('src/stores/practice.js'), /function normalizeRLScoreData[\s\S]*pronunciation: null[\s\S]*score_version: PRONUNCIATION_NOT_ASSESSED_VERSIONS\.RL/);
});
