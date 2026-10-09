import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMixedManifest, matchMixedEvents } from '../../scripts/eval-mixed-speech.js';

function sample(overrides = {}) {
  return {
    id: 'mixed-1',
    task_type: 'RA',
    question_id: 'RA_001',
    reference_text: 'alpha beta gamma delta epsilon zeta',
    source: 'constructed',
    script_id: 'ra001-mixed-4',
    speaker_id: 'spk01',
    device: 'test',
    split: 'dev',
    consent: true,
    audio: { local_file: null, storage_path: null },
    hypotheses: {
      browser_asr: { text: 'alpha beta gamma delta epsilon' },
      groq_whisper: {
        text: 'alpha beta gamma delta epsilon',
        words: [
          { text: 'alpha', start_ms: 0, end_ms: 200 },
          { text: 'beta', start_ms: 250, end_ms: 450 },
          { text: 'gamma', start_ms: 1200, end_ms: 1400 },
          { text: 'delta', start_ms: 1500, end_ms: 1700 },
          { text: 'epsilon', start_ms: 1800, end_ms: 2000 },
        ],
        silences: [{ start_ms: 500, end_ms: 1050 }],
        speech_onset_ms: 0,
        speech_offset_ms: 2000,
        duration_ms: 2100,
      },
    },
    old_scores: {},
    labels: {
      status: 'labeled',
      errors: [
        { type: 'omission', word: 'zeta', occurrence: 1 },
        { type: 'long_pause', word: 'gamma', occurrence: 1, duration_ms: 2000 },
      ],
      labeled_by: 'recording-script',
      notes: '',
    },
    ...overrides,
  };
}

test('matches hesitation and long_pause as one pause bucket within one word', () => {
  const result = matchMixedEvents(
    [{ id: 'p1', type: 'hesitation', match_type: 'pause', ref_index: 1 }],
    [{ id: 'l1', type: 'long_pause', match_type: 'pause', ref_index: 2 }],
  );
  assert.equal(result.matched_labels.length, 1);
  assert.equal(result.matched_labels[0].matched_prediction.type, 'hesitation');
  assert.equal(result.missed_labels.length, 0);
  assert.equal(result.extra_predictions.length, 0);
});

test('keeps mixed-script extras separate from missed labels', () => {
  const result = matchMixedEvents(
    [
      { id: 'p1', type: 'omission', match_type: 'omission', ref_index: 0 },
      { id: 'p2', type: 'substitution', match_type: 'substitution', ref_index: 4 },
    ],
    [
      { id: 'l1', type: 'omission', match_type: 'omission', ref_index: 0 },
      { id: 'l2', type: 'repetition', match_type: 'repetition', ref_index: 3 },
    ],
  );
  assert.deepEqual(result.matched_labels.map(label => label.id), ['l1']);
  assert.deepEqual(result.missed_labels.map(label => label.id), ['l2']);
  assert.deepEqual(result.extra_predictions.map(prediction => prediction.id), ['p2']);
});

test('counts insertion extras in provisional precision totals', () => {
  const result = evaluateMixedManifest([sample({
    hypotheses: {
      browser_asr: { text: 'alpha beta gamma delta epsilon zeta extra' },
      groq_whisper: {
        text: 'alpha beta gamma delta epsilon zeta',
        words: [
          { text: 'alpha', start_ms: 0, end_ms: 200 },
          { text: 'beta', start_ms: 250, end_ms: 450 },
          { text: 'gamma', start_ms: 500, end_ms: 700 },
          { text: 'delta', start_ms: 750, end_ms: 950 },
          { text: 'epsilon', start_ms: 1000, end_ms: 1200 },
          { text: 'zeta', start_ms: 1250, end_ms: 1450 },
        ],
        silences: [],
        speech_onset_ms: 0,
        speech_offset_ms: 1450,
        duration_ms: 1500,
      },
    },
    labels: { status: 'labeled', errors: [], labeled_by: 'recording-script', notes: '' },
  })], { hypotheses: ['browser_asr'] });
  const provider = result.providers[0];
  assert.equal(provider.extra_predictions, 1);
  assert.equal(provider.by_type.find(row => row.type === 'insertion').extra_predictions, 1);
  assert.equal(provider.provisional_precision, 0);
});

test('evaluates only constructed mixed-4 samples and reports both hypotheses', () => {
  const manifest = [
    sample(),
    sample({ id: 'single-error', script_id: 'ra001-omit-1' }),
    sample({ id: 'real-sample', source: 'real', script_id: null, consent: true }),
  ];
  const report = evaluateMixedManifest(manifest);
  assert.equal(report.sample_count, 1);
  assert.deepEqual(report.providers.map(provider => provider.hypothesis), ['browser_asr', 'groq_whisper']);
  assert.equal(report.reports[0].samples[0].id, 'mixed-1');
  assert.equal(report.reports[0].samples[0].matched_labels.length, 1);
  assert.equal(report.reports[0].samples[0].missed_labels[0].match_type, 'pause');
  assert.equal(report.reports[1].samples[0].matched_labels.length, 2);
  assert.equal(report.reports[1].by_type.find(row => row.type === 'pause').recall, 1);
  assert.equal(report.reports[0].pause_recall, 0);
  assert.equal(report.reports[0].text_recall, 1);
});
