import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runProvider } from '../../scripts/eval-run-provider.js';

const result = { provider: 'groq', model: 'whisper-large-v3', text: 'hello', duration_ms: 1000, latency_ms: 25,
  words: [{ text: 'hello', start_ms: 0, end_ms: 1000, confidence: null }] };
const decodeAudio = async () => ({ samples: Float32Array.from({ length: 16000 }, (_, i) => 0.1 * Math.sin(i)), sampleRate: 16000 });
async function fixture(t, samples = [{ id: 'ra-real-0001', consent: true, audio: { local_file: 'one.webm' }, hypotheses: { browser_asr: { text: 'hello' } }, labels: { status: 'unlabeled' } }]) {
  const root = await mkdtemp(join(tmpdir(), 'ra-provider-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'audio'));
  await writeFile(join(root, 'audio/one.webm'), 'fake audio');
  const manifestPath = join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(samples));
  return { root, manifestPath, decodeAudio, log: () => {} };
}

test('runner caches calls, preserves labels/browser baseline and invalidates changed audio', async (t) => {
  const options = await fixture(t);
  let calls = 0;
  options.transcribe = async (input) => {
    calls++;
    assert.equal(input.prompt, undefined);
    assert.ok(Buffer.isBuffer(input.audio));
    return structuredClone(result);
  };
  const first = await runProvider(options);
  assert.equal(first.average_latency_ms, 25);
  const second = await runProvider(options);
  assert.equal(second.timings[0].cached, true);
  assert.equal(calls, 1);
  const manifest = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  assert.deepEqual(manifest[0].labels, { status: 'unlabeled' });
  assert.equal(manifest[0].hypotheses.browser_asr.text, 'hello');
  assert.equal(manifest[0].hypotheses.groq_whisper.model, 'whisper-large-v3');
  assert.equal(manifest[0].hypotheses.groq_whisper.rules_version, 'ra-diag-0.1');
  await writeFile(join(options.root, 'audio/one.webm'), 'changed audio');
  await runProvider(options);
  assert.equal(calls, 2);
});

test('runner rejects unsafe ids and audio paths before paid calls', async (t) => {
  for (const sample of [
    { id: '../escape', audio: { local_file: 'one.webm' } },
    { id: 'valid', audio: { local_file: '../one.webm' } }
  ]) {
    const options = await fixture(t, [sample]);
    options.transcribe = async () => { assert.fail('must not call provider'); };
    await assert.rejects(runProvider(options), /unsafe|filename/);
  }
});

test('runner reports cache corruption without overwriting manifest', async (t) => {
  const options = await fixture(t);
  await mkdir(join(options.root, 'cache'));
  await writeFile(join(options.root, 'cache/ra-real-0001.groq_whisper.json'), '{broken');
  const before = await readFile(options.manifestPath, 'utf8');
  options.transcribe = async () => { assert.fail('must not call provider'); };
  await assert.rejects(runProvider(options), /ra-real-0001: Cannot read transcription cache/);
  assert.equal(await readFile(options.manifestPath, 'utf8'), before);
});

test('decoder failure does not incur a request and concurrent manifest edits survive', async (t) => {
  const options = await fixture(t);
  options.decodeAudio = async () => { throw new Error('broken recording'); };
  options.transcribe = async () => { assert.fail('must not call provider'); };
  await assert.rejects(runProvider(options), /broken recording/);
  options.decodeAudio = decodeAudio;
  options.transcribe = async () => {
    await writeFile(options.manifestPath, '[]\n');
    return structuredClone(result);
  };
  await assert.rejects(runProvider(options), /Manifest changed/);
  assert.equal(await readFile(options.manifestPath, 'utf8'), '[]\n');
});
