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
  assert.match(source, /contentCard/);
  assert.match(source, /正确 \$\{score\.value\?\.content\?\.correct \?\? 0\} \/ \$\{score\.value\?\.content\?\.total \?\? 0\} 词/);
  assert.match(source, /\{\{\s*score\.fluency\.band\s*\}\}\s*\/\s*5/);
  assert.match(source, /本版本未评估/);
});

test('shared diagnosis result has RS copy and preserves RS retry route', () => {
  assert.match(source, /taskType/);
  assert.match(source, /REPEAT SENTENCE/);
  assert.match(source, /内容档位 \$\{score\.value\?\.content\?\.band \?\? '待确认'\} \/ 3/);
  assert.match(source, /顺序匹配 \$\{score\.value\?\.content\?\.matched \?\? 0\} \/ \$\{score\.value\?\.content\?\.total \?\? 0\} 词/);
  assert.match(source, /router\.push\(\{ path: taskLabels\.value\.practiceRoute/);
});

test('RA diagnosis result exposes scoring-rule boundary in app', () => {
  assert.match(source, /评分规则/);
  assert.match(source, /Score Guide/);
  assert.match(source, /replacement、omission、insertion/);
  assert.match(source, /项目自定/);
  assert.match(source, /不等于 Pearson 官方单题分/);
  assert.match(source, /showScoringRules/);
});
test('same-question retry preserves the question id for RS too', () => {
 assert.match(source, /query: questionId \? \{ questionId \} : \{\}/);
 assert.doesNotMatch(source, /questionId && taskType.value === 'RA'/);
});
