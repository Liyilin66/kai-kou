import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDiagnoses, rowToDiagnosis } from '../../src/lib/ra-compare.js';

const baseMetrics = { completeness: 0.82, hesitation_count: 2, long_pause_count: 1, wpm: 118 };

function diagnosis(overrides = {}) {
  return {
    analysis_id: overrides.analysis_id || 'analysis',
    metrics: overrides.metrics || baseMetrics,
    alignment: overrides.alignment || { ops: [] },
    evidence: overrides.evidence || []
  };
}

function evidence(id, type, index, text = '') {
  return { id, type, ref_span: [index, index + 1], text };
}

test('missing previous diagnosis returns no comparison', () => {
  assert.equal(compareDiagnoses(null, diagnosis()), null);
});

test('classifies improved, ongoing, and new evidence by type and reference index', () => {
  const previous = diagnosis({ evidence: [
    evidence('P1', 'omission', 2, 'public'),
    evidence('P2', 'substitution', 8, 'policy')
  ] });
  const current = diagnosis({ evidence: [
    evidence('C1', 'substitution', 8, 'policy'),
    evidence('C2', 'long_pause', 15, 'pause')
  ] });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.improved.map(item => item.key), ['omission:2']);
  assert.deepEqual(output.ongoing.map(item => item.key), ['substitution:8']);
  assert.deepEqual(output.ongoing.map(item => item.evidence.id), ['C1']);
  assert.deepEqual(output.newIssues.map(item => item.key), ['long_pause:15']);
});

test('same position with different types is not treated as the same issue', () => {
  const previous = diagnosis({ evidence: [evidence('P1', 'omission', 4, 'word')] });
  const current = diagnosis({ evidence: [evidence('C1', 'substitution', 4, 'word')] });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.improved.map(item => item.key), ['omission:4']);
  assert.deepEqual(output.ongoing, []);
  assert.deepEqual(output.newIssues.map(item => item.key), ['substitution:4']);
});

test('homophone and low-confidence evidence is ignored consistently', () => {
  const alignment = { ops: [{ ref_index: 3, tag: 'homophone' }, { ref_index: 5, tag: 'low_confidence' }] };
  const previous = diagnosis({ alignment, evidence: [
    evidence('P1', 'substitution', 3, 'there'),
    evidence('P2', 'homophone', 4, 'too'),
    evidence('P3', 'omission', 7, 'real')
  ] });
  const current = diagnosis({ alignment, evidence: [
    evidence('C1', 'substitution', 5, 'unclear'),
    evidence('C2', 'low_confidence', 6, 'maybe'),
    evidence('C3', 'omission', 7, 'real')
  ] });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.improved, []);
  assert.deepEqual(output.ongoing.map(item => item.key), ['omission:7']);
  assert.deepEqual(output.newIssues, []);
});

test('late start without a word position still participates as an opening issue', () => {
  const previous = diagnosis({ evidence: [{ id: 'P1', type: 'late_start', ref_span: null, text: 'opening' }] });
  const current = diagnosis({ evidence: [{ id: 'C1', type: 'late_start', text: 'opening' }] });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.ongoing.map(item => item.key), ['late_start:opening']);
  assert.deepEqual(output.improved, []);
  assert.deepEqual(output.newIssues, []);
});

test('evidence tagged as homophone or low-confidence is ignored directly', () => {
  const previous = diagnosis({ evidence: [
    { ...evidence('P1', 'substitution', 2, 'there'), tag: 'homophone' },
    evidence('P2', 'omission', 8, 'real')
  ] });
  const current = diagnosis({ evidence: [
    { ...evidence('C1', 'substitution', 4, 'maybe'), tag: 'low_confidence' },
    evidence('C2', 'omission', 8, 'real')
  ] });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.ongoing.map(item => item.key), ['omission:8']);
  assert.deepEqual(output.improved, []);
  assert.deepEqual(output.newIssues, []);
});

test('metric changes mark completeness and pause reductions, while speed stays neutral', () => {
  const previous = diagnosis({ metrics: baseMetrics });
  const current = diagnosis({ metrics: { completeness: 0.9, hesitation_count: 1, long_pause_count: 3, wpm: 135 } });

  const output = compareDiagnoses(previous, current);
  assert.deepEqual(output.metricChanges.map(item => [item.key, item.beforeText, item.afterText, item.trend]), [
    ['completeness', '82%', '90%', 'better'],
    ['hesitation_count', '2 次', '1 次', 'better'],
    ['long_pause_count', '1 次', '3 次', 'worse'],
    ['wpm', '118 词/分', '135 词/分', 'neutral']
  ]);
});

test('database rows normalize to diagnosis result shape for comparison and playback', () => {
  const output = rowToDiagnosis({
    id: 'analysis-1',
    attempt_id: 'attempt-1',
    status: 'done',
    question_id: 'RA_001',
    reference_text: 'Read this aloud.',
    audio_path: 'ra/user/attempt.webm',
    aligned: { ops: [] },
    metrics: baseMetrics,
    evidence: [evidence('E1', 'omission', 1, 'this')],
    provider: 'groq',
    model: 'whisper',
    rules_version: 'ra-diag-0.1',
    created_at: '2026-10-08T00:00:00Z'
  });

  assert.equal(output.kind, 'ra_diagnosis');
  assert.equal(output.question.id, 'RA_001');
  assert.deepEqual(output.audio, { bucket: 'practice-audio', path: 'ra/user/attempt.webm' });
  assert.equal(output.diagnosis_version, 'ra-diag-0.1');
});
