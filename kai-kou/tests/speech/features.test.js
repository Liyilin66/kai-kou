import test from 'node:test';
import assert from 'node:assert/strict';
import { alignWords } from '../../backend/speech/align.js';
import { extractFeatures } from '../../backend/speech/features.js';

function features(referenceText, silence) {
  const alignment = alignWords(referenceText, [
    { text: 'hello', start_ms: 500, end_ms: 1500 },
    { text: 'world', start_ms: 1500, end_ms: 4500 },
  ]);
  return extractFeatures({ alignment, referenceText, silences: [silence], speech_onset_ms: 500, speech_offset_ms: 4500, duration_ms: 5000 });
}

test('punctuation pause shorter than 1.2s is natural', () => {
  const { pauses } = features('hello, world', { start_ms: 1100, end_ms: 1900 });
  assert.equal(pauses[0].type, 'natural');
  assert.equal(pauses[0].at_punctuation, true);
  assert.deepEqual(pauses[0].ref_span, [0, 1]);
});

test('mid-sentence 0.8s pause is hesitation', () => {
  const { pauses } = features('hello world', { start_ms: 1100, end_ms: 1900 });
  assert.equal(pauses[0].type, 'hesitation');
});

test('2.5s pause is long_pause even at punctuation', () => {
  assert.equal(features('hello, world', { start_ms: 1000, end_ms: 3500 }).pauses[0].type, 'long_pause');
});

test('silence inside inflated Whisper word maps to nearest adjacent boundary', () => {
  const referenceText = 'we study science daily';
  const alignment = alignWords(referenceText, [
    { text: 'we', start_ms: 0, end_ms: 250 },
    { text: 'study', start_ms: 250, end_ms: 2000 },
    { text: 'science', start_ms: 2000, end_ms: 2700 },
    { text: 'daily', start_ms: 2700, end_ms: 3300 },
  ]);
  const result = extractFeatures({ alignment, referenceText, silences: [{ start_ms: 1000, end_ms: 1900 }] });
  assert.equal(result.pauses[0].ref_index, 1);
  assert.equal(result.pauses[0].text, 'study');
});

test('metrics use active recording span and energy pauses, not word gaps', () => {
  const { metrics } = features('hello world', { start_ms: 1100, end_ms: 1900 });
  assert.equal(metrics.wpm, 30);
  assert.equal(metrics.articulation_wpm, 37.5);
  assert.equal(metrics.speech_ratio, 0.64);
  assert.equal(metrics.hesitation_count, 1);
  assert.equal(metrics.long_pause_count, 0);
  assert.equal(metrics.completeness, 1);
  assert.equal(metrics.speech_onset_ms, 500);
});

test('overlapping intervals are unioned and empty input has finite metrics', () => {
  const result = extractFeatures({ alignment: alignWords('one', [{ text: 'one', start_ms: 0, end_ms: 4000 }]),
    speech_onset_ms: 0, speech_offset_ms: 4000, duration_ms: 4000,
    silences: [{ start_ms: 500, end_ms: 1500 }, { start_ms: 1000, end_ms: 2000 }] });
  assert.equal(result.metrics.articulation_wpm, 24);
  assert.equal(result.metrics.speech_ratio, 0.625);
  assert.equal(extractFeatures().metrics.wpm, 0);
});

test('numeric normalization preserves reference punctuation boundary', () => {
  const referenceText = 'In 1990, we started';
  const alignment = alignWords(referenceText, [
    { text: 'In', start_ms: 0, end_ms: 200 }, { text: 'nineteen', start_ms: 200, end_ms: 400 },
    { text: 'ninety', start_ms: 400, end_ms: 1000 }, { text: 'we', start_ms: 1000, end_ms: 1400 },
    { text: 'started', start_ms: 1400, end_ms: 1800 },
  ]);
  const result = extractFeatures({ alignment, referenceText, silences: [{ start_ms: 600, end_ms: 1100 }] });
  assert.equal(result.pauses[0].ref_index, 1);
  assert.equal(result.pauses[0].type, 'natural');
});

test('effective word count excludes filler and repeated inserted words', () => {
  const alignment = alignWords('hello world', 'hello hello um world');
  const { metrics } = extractFeatures({ alignment, speech_onset_ms: 0, speech_offset_ms: 4000 });
  assert.equal(metrics.wpm, 30);
});

test('a decimal separator is not a natural pause boundary', () => {
  const referenceText = 'costs 1.2 dollars';
  const alignment = alignWords(referenceText, [
    { text: 'costs', start_ms: 0, end_ms: 500 }, { text: '1.2', start_ms: 500, end_ms: 1500 },
    { text: 'dollars', start_ms: 1500, end_ms: 2500 },
  ]);
  const { pauses } = extractFeatures({ alignment, referenceText, silences: [{ start_ms: 1100, end_ms: 1900 }] });
  assert.equal(pauses[0].type, 'hesitation');
});
