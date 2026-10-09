import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/components/ra/RADiagnosisResult.vue', import.meta.url), 'utf8');

test('RA diagnosis result reads reference score and renders score cards', () => {
  assert.match(source, /metrics\.value\.score/);
  assert.match(source, /data-testid="ra-reference-total"/);
  assert.match(source, /data-testid="ra-score-card-content"/);
  assert.match(source, /data-testid="ra-score-card-fluency"/);
  assert.match(source, /data-testid="ra-score-card-pronunciation"/);
  assert.match(source, /正确\s*\{\{\s*score\.content\.correct\s*\}\}\s*\/\s*\{\{\s*score\.content\.total\s*\}\}\s*词/);
  assert.match(source, /\{\{\s*score\.fluency\.band\s*\}\}\s*\/\s*5/);
  assert.match(source, /本版本未评估/);
});

test('RA diagnosis result exposes scoring-rule boundary in app', () => {
  assert.match(source, /评分规则/);
  assert.match(source, /Score Guide/);
  assert.match(source, /replacement、omission、insertion/);
  assert.match(source, /项目自定/);
  assert.match(source, /不等于 Pearson 官方单题分/);
  assert.match(source, /showScoringRules/);
});
