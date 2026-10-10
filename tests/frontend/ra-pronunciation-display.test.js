import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { legacySpeakingDisplayOverall } from '../../src/lib/ra-diagnosis-score.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// docs/ra-scoring-rules.md (ra-score-0.1): content and fluency weigh half each; pronunciation is not assessed.
test('legacy RA/RS rows show an overall built from content and fluency only', () => {
  assert.equal(legacySpeakingDisplayOverall({ overall: 72, pronunciation: 70, fluency: 72, content: 74 }), 73);
  assert.equal(legacySpeakingDisplayOverall({ scores: { overall: 60, pronunciation: 90, fluency: 41, content: 50 } }), 46);
  assert.equal(legacySpeakingDisplayOverall({ overall: 72, content: 74 }), null);
  assert.equal(legacySpeakingDisplayOverall({ score_version: 'ra-score-0.1', scores: { overall: 70, content: 80, fluency: 58, pronunciation: null } }), null);
  assert.equal(legacySpeakingDisplayOverall({ analysis_id: 'a1', diagnosis_version: 'ra-diag-0.1', fluency: 10, content: 10 }), null);
});

test('RA home explains the current rule: content and fluency half each, pronunciation not assessed', () => {
  const source = read('src/views/RAHomeView.vue');
  assert.match(source, /name: "Content 内容", weight: "50%"/);
  assert.match(source, /name: "Fluency 流利度", weight: "50%"/);
  assert.match(source, /name: "Pronunciation 发音", weight: PRONUNCIATION_NOT_ASSESSED_LABEL/);
  assert.doesNotMatch(source, /发音清晰度/);
  assert.match(source, /\{ key: "pronunciation", name: "发音", notAssessed: true \}/);
  assert.match(source, /if \(item\.notAssessed\) return \{ \.\.\.item, pct: 0, label: "未评估" \}/);
  assert.match(source, /const averages = \["fluency", "content"\]/);
});

test('legacy RA result and history never show or use a pronunciation number', () => {
  const result = read('src/views/RAResultView.vue');
  assert.match(result, /if \(item\.key === "pronunciation"\) \{\s*return \{ \.\.\.item, notAssessed: true, rawScore: null, score: PRONUNCIATION_NOT_ASSESSED_LABEL/);
  assert.match(result, /legacySpeakingDisplayOverall\(scoreResult\.value\)/);
  assert.doesNotMatch(result, /rawDimensionScore\("pronunciation"\)/);
  assert.match(result, /const assessed = dimensionItems\.value\.filter\(\(item\) => !item\.notAssessed\)/);
  assert.match(read('src/lib/ra-history.js'), /const pronunciation = null;/);
  assert.match(read('src/lib/profile-portrait.js'), /const pronunciationAssessed = !\["RA", "RS"\]\.includes\(taskType\)/);
});

test('no page in src states the old RA weightings or promises a pronunciation result', () => {
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = `${dir}/${name}`; statSync(full).isDirectory() ? walk(full) : /\.(vue|js)$/.test(name) && files.push(full); } };
  walk(new URL('../../src', import.meta.url).pathname);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /约45%|约35%|约20%/, file);
    assert.doesNotMatch(text, /结果页会展示发音/, file);
  }
});
