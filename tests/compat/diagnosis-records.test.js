import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise actual pure normalization/aggregation code without browser-only Supabase imports.
function loadModule(path) {
  const helper = ['../../backend/scoring/pronunciation-not-assessed.js', '../../src/lib/ra-diagnosis-score.js']
    .map(file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '').replace(/export /g, '')).join('\n');
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    .replace(/^import .*?;\n/gm, '').replace(/export /g, '');
  return vm.createContext({ console, Date, Intl, Map, Set, __source: helper + '\n' + source });
}
function invoke(path, expression) {
  const ctx = loadModule(path);
  return vm.runInContext(ctx.__source + '\n' + expression, ctx);
}
const diagnosis = { task_type: 'RA', question_id: 'RA_024', created_at: new Date().toISOString(),
  score_json: { analysis_id: 'analysis-1', diagnosis_version: 'ra-diag-0.1', metrics: { completeness: 0.8 } } };
const legacy = { ...diagnosis, score_json: { overall: 72, pronunciation: 70, fluency: 72, content: 74 } };

test('RA history exposes diagnosis completeness without fabricating overall or trait scores', () => {
  const log = invoke('src/lib/ra-history.js', `normalizeRALog(${JSON.stringify(diagnosis)})`);
  assert.equal(log.overall, null);
  assert.equal(log.scores.pronunciation, null);
  assert.equal(log.scores.fluency, null);
  assert.equal(log.scores.content, null);
  assert.equal(log.diagnosisLabel, '诊断：完整度 80%');
  assert.equal(log.analysisId, 'analysis-1');
});

test('home analytics counts diagnosis practice but excludes it from score averages', () => {
  const result = invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([diagnosis, legacy])})`);
  assert.equal(result.totalCount, 2);
  assert.equal(result.scoredCount, 1);
  assert.equal(result.averageScore, 72);
  const only = invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([diagnosis])})`);
  assert.equal(only.averageScore, null);
});

test('agent context retains diagnosis activity without weak scores or a false trend', () => {
  const expression = `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([diagnosis, legacy])}), [])`;
  const result = invoke('backend/agent/build-agent-context.js', expression);
  assert.equal(result.total_recent_attempts, 2);
  assert.equal(result.scored_recent_attempts, 1);
  assert.equal(result.recent_average_score_90_scale, 72);
  assert.equal(result.latest_records[0].display_score, null);
  const only = invoke('backend/agent/build-agent-context.js', `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([diagnosis])}), [])`);
  assert.equal(only.recent_average_score_90_scale, null);
  assert.equal(only.weak_task_types.length, 0);
  assert.equal(only.trend_summary.direction, 'unknown');
});

test('diagnosis markers suppress stale legacy score fields while old score records stay readable', () => {
  const stale = { ...diagnosis, score_json: { ...diagnosis.score_json, overall: 90, scores: { overall: 90, pronunciation: 90 } } };
  assert.equal(invoke('src/lib/ra-history.js', `normalizeRALog(${JSON.stringify(stale)}).overall`), null);
  assert.equal(invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([stale, legacy])}).averageScore`), 72);
  assert.equal(invoke('src/lib/ra-history.js', `normalizeRALog(${JSON.stringify(legacy)}).overall`), 72);
});

test('desktop history labels diagnosis and excludes it from trends', () => {
  const result = invoke('src/lib/home-desktop-dashboard.js', `buildRecentPractices(${JSON.stringify([diagnosis])})[0]`);
  assert.equal(result.scoreLabel, '诊断：完整度 80%');
  assert.equal(result.score, null);
  assert.equal(invoke('src/lib/home-desktop-dashboard.js', `extractTrendOverallScore(${JSON.stringify(diagnosis)})`), null);
});

test('daily suggestion counts diagnosis as activity, not a weak zero score', () => {
  const result = invoke('backend/agent/daily-suggestion-service.js', `buildSummaryFromRows(${JSON.stringify([diagnosis, legacy])}, 2)`);
  assert.equal(result.task_stats.RA.attempts, 2);
  assert.equal(result.task_stats.RA.scored_attempts, 1);
  assert.equal(result.task_stats.RA.average_score, 72);
});

test('diagnosis-only practice does not create guessed pronunciation or content profile signals', () => {
  const result = invoke('src/lib/profile-portrait.js', `(() => { const buckets = createMetricBuckets(); applyRowSignalsToBuckets(${JSON.stringify(diagnosis)}, buckets); return buckets; })()`);
  assert.equal(result.pronunciation.signalCount, 0);
  assert.equal(result.fluency.signalCount, 0);
  assert.equal(result.content.signalCount, 0);
});

test('home score presentation uses a placeholder for diagnosis-only averages', () => {
  assert.equal(invoke('src/lib/home-analytics.js', 'formatScore(null)'), '--');
  assert.equal(invoke('src/lib/home-desktop-dashboard.js', 'buildWeeklyGoal({ averageScore: null }).currentValue'), null);
});
const reference={...diagnosis,score_json:{...diagnosis.score_json,score_version:'ra-score-0.1',scores:{overall:78,content:82,fluency:74,pronunciation:null}}};
test('versioned RA reference scores appear in history, home and agent while pronunciation stays absent',()=>{
 const log=invoke('src/lib/ra-history.js',`normalizeRALog(${JSON.stringify(reference)})`);assert.equal(log.overall,78);assert.equal(log.scores.pronunciation,null);assert.equal(log.diagnosisLabel,'');assert.equal(log.analysisId,'analysis-1');
 assert.equal(invoke('src/lib/home-analytics.js',`buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([reference])}).averageScore`),78);
 assert.equal(invoke('backend/agent/build-agent-context.js',`buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([reference])}), []).recent_average_score_90_scale`),78);
 const buckets=invoke('src/lib/profile-portrait.js',`(() => { const buckets=createMetricBuckets();applyRowSignalsToBuckets(${JSON.stringify(reference)},buckets);return buckets;})()`);assert.equal(buckets.pronunciation.signalCount,0);assert.ok(buckets.content.signalCount>0);assert.ok(buckets.fluency.signalCount>0);
});

const rsReference = { ...reference, task_type: 'RS', question_id: 'RS_001', score_json: { ...reference.score_json, score_version: 'rs-score-0.1' } };
test('RS reference scores appear in home, desktop and coach without guessed pronunciation', () => {
  assert.equal(invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([rsReference])}).averageScore`), 78);
  assert.equal(invoke('src/lib/home-desktop-dashboard.js', `extractOverallScore(${JSON.stringify(rsReference)})`), 78);
  assert.equal(invoke('backend/agent/build-agent-context.js', `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([rsReference])}), []).recent_average_score_90_scale`), 78);
  const buckets = invoke('src/lib/profile-portrait.js', `(() => { const buckets = createMetricBuckets(); applyRowSignalsToBuckets(${JSON.stringify(rsReference)}, buckets); return buckets; })()`);
  assert.equal(buckets.pronunciation.signalCount, 0);
  assert.ok(buckets.content.signalCount > 0); assert.ok(buckets.fluency.signalCount > 0);
});
test('unscored RS diagnoses are activity, never a weak zero or stale legacy score', () => {
  const row = { ...diagnosis, task_type: 'RS', score_json: { ...diagnosis.score_json, overall: 90 } };
  assert.equal(invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([row])}).averageScore`), null);
  assert.equal(invoke('src/lib/home-desktop-dashboard.js', `extractOverallScore(${JSON.stringify(row)})`), null);
  assert.equal(invoke('backend/agent/build-agent-context.js', `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([row])}), []).recent_average_score_90_scale`), null);
});
test('zero-content RA and RS reference scores keep overall 10 and never infer fluency', () => {
  for (const [taskType, version] of [['RA', 'ra-score-0.1'], ['RS', 'rs-score-0.1']]) {
    const row = { ...reference, task_type: taskType, score_json: { ...reference.score_json, score_version: version, scores: { overall: 10, content: 10, fluency: null, pronunciation: null } } };
    if (taskType === 'RA') {
      const log = invoke('src/lib/ra-history.js', `normalizeRALog(${JSON.stringify(row)})`);
      assert.equal(log.overall, 10); assert.equal(log.scores.fluency, null);
    }
    assert.equal(invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([row])}).averageScore`), 10);
    assert.equal(invoke('backend/agent/build-agent-context.js', `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([row])}), []).recent_average_score_90_scale`), 10);
    const buckets = invoke('src/lib/profile-portrait.js', `(() => { const buckets = createMetricBuckets(); applyRowSignalsToBuckets(${JSON.stringify(row)}, buckets); return buckets; })()`);
    assert.equal(buckets.fluency.signalCount, 0); assert.equal(buckets.pronunciation.signalCount, 0); assert.ok(buckets.content.signalCount > 0);
  }
});

const npReview = (taskType, version) => ({ score_version: version, pronunciation_status: 'not_assessed', overall: 56,
  scores: { content: 60, pronunciation: null, fluency: 50 }, display_scores: { content: 60, pronunciation: null, fluency: 50, overall: 56 },
  official_traits: { pronunciation: { score: null, max: 5, judged: false, status: 'not_assessed' } }, taskType });
const npRecords = [
  { task_type: 'RL', question_id: 'RL_001', created_at: new Date().toISOString(), score_json: { pronunciation: null, fluency: 50, content: 60, overall: 55, score_version: 'rl-legacy-np-0.1' } },
  { task_type: 'DI', question_id: 'DI_Q001', created_at: new Date().toISOString(), score_json: { ai_review: npReview('DI', 'di-legacy-np-0.1') } },
  { task_type: 'RTS', question_id: 'RTS_001', created_at: new Date().toISOString(), score_json: { ai_review: npReview('RTS', 'rts-legacy-np-0.1') } }
];
for (const row of npRecords) {
  test(`${row.task_type} records without pronunciation never yield a pronunciation signal or a zero`, () => {
    assert.equal(invoke('src/lib/profile-portrait.js', `isPronunciationNotAssessed(${JSON.stringify(row.score_json)})`), true);
    const buckets = invoke('src/lib/profile-portrait.js', `(() => { const buckets = createMetricBuckets(); applyRowSignalsToBuckets(${JSON.stringify(row)}, buckets); return buckets; })()`);
    assert.equal(buckets.pronunciation.signalCount, 0);
    assert.ok(buckets.fluency.signalCount > 0);
    const summary = invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([row])})`);
    assert.ok(summary.averageScore === null || Number.isFinite(summary.averageScore));
    assert.notEqual(summary.averageScore, 0);
  });
}
test('legacy DI/RTS/RL records with pronunciation numbers still feed the pronunciation profile', () => {
  const legacyRL = { task_type: 'RL', question_id: 'RL_001', created_at: new Date().toISOString(), score_json: { pronunciation: 70, fluency: 50, content: 60, overall: 60 } };
  assert.equal(invoke('src/lib/profile-portrait.js', `isPronunciationNotAssessed(${JSON.stringify(legacyRL.score_json)})`), false);
  const buckets = invoke('src/lib/profile-portrait.js', `(() => { const buckets = createMetricBuckets(); applyRowSignalsToBuckets(${JSON.stringify(legacyRL)}, buckets); return buckets; })()`);
  assert.ok(buckets.pronunciation.signalCount > 0);
  assert.equal(invoke('src/lib/home-analytics.js', `buildHomeAnalyticsSnapshotFromRows(${JSON.stringify([npRecords[0]])}).averageScore`), 55);
  assert.equal(invoke('backend/agent/build-agent-context.js', `buildPracticeSummary(normalizePracticeLogs(${JSON.stringify([npRecords[0]])}), []).recent_average_score_90_scale`), 55);
});
