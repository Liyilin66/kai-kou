import test from 'node:test';
import assert from 'node:assert/strict';
import { mixedExtraItems } from '../../scripts/eval-build-mixed-extras-kit.js';
import { applyMixedExtraLabels } from '../../scripts/eval-apply-mixed-extra-labels.js';

function sample() {
  return {
    id: 'ra-con-test',
    task_type: 'RA',
    question_id: 'RA_001',
    reference_text: 'alpha beta gamma delta epsilon zeta eta theta',
    source: 'constructed',
    script_id: 'ra001-mixed-4',
    speaker_id: 'spk01',
    device: 'test',
    split: 'dev',
    consent: true,
    audio: { local_file: 'ra-con-test.webm', storage_path: null },
    hypotheses: {
      browser_asr: { text: 'alpha beta gamma delta epsilon zeta eta theta' },
      groq_whisper: {
        text: 'alpha beta gamma delta epsilon zeta eta theta',
        words: [
          { text: 'alpha', start_ms: 0, end_ms: 200 },
          { text: 'beta', start_ms: 300, end_ms: 500 },
          { text: 'gamma', start_ms: 600, end_ms: 800 },
          { text: 'delta', start_ms: 900, end_ms: 1100 },
          { text: 'epsilon', start_ms: 1200, end_ms: 1400 },
          { text: 'zeta', start_ms: 1500, end_ms: 1700 },
          { text: 'eta', start_ms: 1800, end_ms: 2000 },
          { text: 'theta', start_ms: 2100, end_ms: 2300 },
        ],
        silences: [],
        speech_onset_ms: 0,
        speech_offset_ms: 2300,
        duration_ms: 2500,
      },
    },
    old_scores: {},
    labels: {
      status: 'labeled',
      errors: [
        { type: 'omission', word: 'alpha', occurrence: 1 },
        { type: 'substitution', word: 'gamma', occurrence: 1 },
        { type: 'long_pause', word: 'epsilon', occurrence: 1, duration_ms: 2000 },
        { type: 'repetition', word: 'eta', occurrence: 1 },
      ],
      labeled_by: 'recording-script',
      notes: '',
    },
  };
}

function kitFor(manifest) {
  return mixedExtraItems(manifest, [
    { sample_id: 'ra-con-test', type: 'substitution', ref_index: 1, hyp_text: 'better' },
    { sample_id: 'ra-con-test', type: 'hesitation', ref_index: 3 },
    { sample_id: 'ra-con-test', type: 'omission', ref_index: 5 },
  ]);
}

function exported(items, choices) {
  return { version: 1, items: items.map((item, index) => ({
    id: item.id,
    sample_id: item.sample_id,
    ref_index: item.ref_index,
    choice: choices[index],
  })) };
}

test('writes extra review without changing planned mixed-script labels', () => {
  const manifest = [sample()];
  const items = kitFor(manifest);
  const result = applyMixedExtraLabels(manifest, exported(items, ['wrong', 'correct', 'unclear']), items);
  assert.deepEqual(result[0].labels.errors, manifest[0].labels.errors);
  assert.equal(result[0].labels.extra_review.labeled_by, 'user-listening');
  assert.deepEqual(result[0].labels.extra_review.counts, { wrong: 1, correct: 1, unclear: 1 });
  assert.deepEqual(result[0].labels.extra_review.items.map(item => item.choice), ['wrong', 'correct', 'unclear']);
  assert.deepEqual(result[0].labels.supplemental_errors, [{
    source: 'mixed-extra-review',
    id: items[0].id,
    type: 'substitution',
    ref_index: 1,
    word: 'beta',
    choice: 'wrong',
  }]);
});

test('rejects duplicate, stale, or drifted mixed-extra labels', () => {
  const manifest = [sample()];
  const items = kitFor(manifest);
  assert.throws(() => applyMixedExtraLabels(manifest, {
    version: 1,
    items: [
      { id: items[0].id, sample_id: 'ra-con-test', ref_index: 1, choice: 'wrong' },
      { id: items[0].id, sample_id: 'ra-con-test', ref_index: 1, choice: 'correct' },
    ],
  }, items), /duplicate/);
  assert.throws(() => applyMixedExtraLabels(manifest, exported([{ ...items[0], ref_index: 99 }], ['wrong']), items), /stale/);
  assert.throws(() => applyMixedExtraLabels(manifest, exported(items, ['wrong', 'correct', 'unclear']), [
    { ...items[0], word: 'drifted' },
    items[1],
    items[2],
  ]), /drift/);
});
