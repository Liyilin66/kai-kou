import test from 'node:test';
import assert from 'node:assert/strict';
import { alignWords } from '../../backend/speech/align.js';
import { buildEvidence } from '../../backend/speech/evidence.js';

function op(type, ref_index, extra = {}) {
  return { type, ref_index, ref_text: 'expected', hyp_text: 'observed', start_ms: 100, end_ms: 300, ...extra };
}

test('alignment evidence maps omissions substitutions repetitions and insertions', () => {
  const alignment = { ops: [op('omission', 0), op('substitution', 1), op('insertion', null, { tag: 'repetition' }), op('insertion', null)] };
  const result = buildEvidence({ alignment });
  assert.deepEqual(result.map(e => e.type), ['omission', 'substitution', 'repetition', 'insertion']);
  assert.deepEqual(result.map(e => e.id), ['E1', 'E2', 'E3', 'E4']);
  assert.ok(result.every(e => e.ref_span && e.detail && e.time_ms));
  assert.equal(result[1].detail.description, '可能读错或识别不清');
  assert.ok(!JSON.stringify(result).includes('发音错误'));
});

test('homophones and uncertain substitutions are excluded', () => {
  assert.deepEqual(buildEvidence({ alignment: alignWords('their house', 'there house') }), []);
  assert.deepEqual(buildEvidence({ alignment: { ops: [op('substitution', 0, { tag: 'low_confidence' })] } }), []);
});

test('severity first then position, natural pauses excluded, late start included', () => {
  const result = buildEvidence({ alignment: { ops: [op('substitution', 0), op('omission', 5)] },
    pauses: [
      { type: 'natural', start_ms: 300, end_ms: 800 },
      { type: 'long_pause', ref_span: [3, 4], text: 'word', start_ms: 1500, end_ms: 4000, duration_ms: 2500, at_punctuation: true },
      { type: 'hesitation', ref_span: [1, 2], text: 'word', start_ms: 1000, end_ms: 1800, duration_ms: 800, at_punctuation: false },
    ], metrics: { speech_onset_ms: 3500 } });
  assert.deepEqual(result.map(e => e.type), ['long_pause', 'omission', 'late_start', 'substitution', 'hesitation']);
  assert.deepEqual(result[0].time_ms, [1500, 4000]);
  assert.equal(result[0].detail.pause_ms, 2500);
});

test('missing timestamps remain unknown, zero onset creates no delay evidence', () => {
  const result = buildEvidence({ alignment: { ops: [op('omission', 0, { start_ms: null, end_ms: null })] }, metrics: { speech_onset_ms: 0 } });
  assert.equal(result.length, 1);
  assert.equal(result[0].time_ms, null);
  assert.deepEqual(buildEvidence(), []);
});
