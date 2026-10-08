import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSilences } from '../../backend/speech/silence.js';

function pcm(parts, gain = 1) {
  const rate = 16000;
  const samples = new Float32Array(parts.reduce((n, p) => n + p[0], 0) * rate / 1000);
  let offset = 0;
  for (const [ms, amplitude] of parts) {
    for (let j = 0; j < ms * rate / 1000; j++) {
      samples[offset + j] = gain * (amplitude ? amplitude * Math.sin(2 * Math.PI * 200 * j / rate) : 0.00001 * Math.sin(j * 13));
    }
    offset += ms * rate / 1000;
  }
  return samples;
}

test('energy identifies internal silence and leading/trailing edges within 40ms', () => {
  const result = detectSilences(pcm([[400, 0], [1000, 0.2], [800, 0], [1000, 0.2], [400, 0]]), 16000);
  assert.equal(result.silences.length, 1);
  assert.ok(Math.abs(result.silences[0].start_ms - 1400) <= 40);
  assert.ok(Math.abs(result.silences[0].end_ms - 2200) <= 40);
  assert.equal(result.speech_onset_ms, 400);
  assert.equal(result.speech_offset_ms, 3200);
  assert.equal(result.duration_ms, 3600);
});

test('20dB gain changes preserve detected intervals', () => {
  const parts = [[400, 0], [800, 0.02], [600, 0], [800, 0.02], [400, 0]];
  const base = detectSilences(pcm(parts), 16000);
  for (const gain of [0.1, 10]) {
    const result = detectSilences(pcm(parts, gain), 16000);
    assert.deepEqual(result.silences, base.silences);
    assert.equal(result.speech_onset_ms, base.speech_onset_ms);
    assert.equal(result.speech_offset_ms, base.speech_offset_ms);
  }
});

test('short gaps excluded, custom minSilenceMs supported', () => {
  const samples = pcm([[400, 0], [500, 0.2], [200, 0], [500, 0.2], [400, 0]]);
  assert.deepEqual(detectSilences(samples, 16000).silences, []);
  assert.equal(detectSilences(samples, 16000, { minSilenceMs: 100 }).silences.length, 1);
});

test('all zero and empty input have no detected speech', () => {
  for (const samples of [new Float32Array(16000), new Float32Array()]) {
    const result = detectSilences(samples, 16000);
    assert.deepEqual(result.silences, []);
    assert.equal(result.speech_onset_ms, null);
    assert.equal(result.speech_offset_ms, null);
    assert.ok(Number.isFinite(result.noise_floor_db));
  }
});

test('sustained sine and constant energy do not become silence on percentile ties', () => {
  for (const samples of [pcm([[1000, 0.2]]), new Float32Array(16000).fill(0.05)]) {
    const result = detectSilences(samples, 16000);
    assert.deepEqual(result.silences, []);
    assert.equal(result.speech_onset_ms, 0);
    assert.equal(result.speech_offset_ms, 1000);
  }
});

test('stationary noise alone is not represented as an internal pause', () => {
  const result = detectSilences(pcm([[1000, 0]]), 16000);
  assert.deepEqual(result.silences, []);
});

test('invalid PCM and sample rates fail clearly', () => {
  assert.throws(() => detectSilences(new Float32Array(1), 0), RangeError);
  assert.throws(() => detectSilences([NaN], 16000), TypeError);
});
