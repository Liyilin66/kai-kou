import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeWithGroqWhisper } from '../../backend/speech/providers/groq-whisper.js';
import { ProviderError } from '../../backend/llm/provider-error.js';

function setup(t, fetcher) {
  const key = process.env.GROQ_API_KEY;
  const timeout = process.env.SPEECH_GROQ_TIMEOUT_MS;
  process.env.GROQ_API_KEY = 'offline-test-key';
  delete process.env.SPEECH_GROQ_TIMEOUT_MS;
  t.mock.method(globalThis, 'fetch', fetcher);
  t.after(() => {
    if (key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = key;
    if (timeout === undefined) delete process.env.SPEECH_GROQ_TIMEOUT_MS; else process.env.SPEECH_GROQ_TIMEOUT_MS = timeout;
  });
}

test('Groq sends exact multipart options without a reference prompt and normalizes timestamps', async (t) => {
  setup(t, async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer offline-test-key');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.deepEqual([...options.body.keys()], ['file', 'model', 'response_format', 'timestamp_granularities[]', 'temperature', 'language']);
    for (const [key, value] of Object.entries({ model: 'whisper-large-v3', response_format: 'verbose_json', 'timestamp_granularities[]': 'word', temperature: '0', language: 'en' })) assert.equal(options.body.get(key), value);
    assert.equal(options.body.get('file').name, 'sample.webm');
    assert.equal(options.body.get('file').type, 'audio/webm');
    return { ok: true, json: async () => ({ text: 'Hello world.', duration: 2.345, words: [
      { word: 'Hello', start: 0.1234, end: 0.6 }, { word: 'world.', start: 0.7, end: 1.5 }
    ] }) };
  });
  const result = await transcribeWithGroqWhisper({ audio: Buffer.from('fake audio'), filename: 'sample.webm' });
  assert.deepEqual(result.words, [{ text: 'Hello', start_ms: 123, end_ms: 600, confidence: null }, { text: 'world.', start_ms: 700, end_ms: 1500, confidence: null }]);
  assert.equal(result.duration_ms, 2345);
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'whisper-large-v3');
  assert.ok(result.latency_ms >= 0);
});

test('Blob input supports an explicit experimental prompt only when supplied', async (t) => {
  setup(t, async (_, options) => {
    assert.equal(options.body.get('prompt'), 'Include um and uh.');
    assert.equal(options.body.get('file').type, 'audio/wav');
    return { ok: true, json: async () => ({ text: '', words: [], duration: 1 }) };
  });
  const result = await transcribeWithGroqWhisper({ audio: new Blob(['audio'], { type: 'audio/wav' }), prompt: 'Include um and uh.' });
  assert.deepEqual(result.words, []);
});

for (const status of [429, 401]) test(`HTTP ${status} becomes ProviderError`, async (t) => {
  setup(t, async () => ({ ok: false, status }));
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.from('audio') }), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.provider, 'groq_whisper');
    assert.equal(error.status, status);
    assert.equal(error.raw_error_type, `groq_whisper_http_${status}`);
    assert.equal(error.timeout_ms, 15000);
    return true;
  });
});

test('configured timeout aborts fetch and becomes ProviderError', async (t) => {
  setup(t, (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  process.env.SPEECH_GROQ_TIMEOUT_MS = '5';
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.from('audio') }), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.raw_error_type, 'groq_whisper_response_timeout');
    assert.equal(error.timeout_ms, 5);
    return true;
  });
});

test('network failure and malformed successful response are explicit ProviderErrors', async (t) => {
  setup(t, async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.from('audio') }), { raw_error_type: 'groq_whisper_network_error' });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ text: 'hello', words: [{ word: 'hello', start: 2, end: 1 }] }) });
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.from('audio') }), { name: 'ProviderError', message: 'Groq returned invalid word timestamps' });
});

test('missing key and invalid audio fail before a request', async (t) => {
  let calls = 0;
  setup(t, async () => { calls++; throw new Error('Should not call'); });
  delete process.env.GROQ_API_KEY;
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.from('audio') }), { raw_error_type: 'groq_whisper_missing_config' });
  process.env.GROQ_API_KEY = 'offline-test-key';
  await assert.rejects(transcribeWithGroqWhisper({ audio: 'audio' }), /Buffer or Blob/);
  await assert.rejects(transcribeWithGroqWhisper({ audio: Buffer.alloc(0) }), /empty/);
  assert.equal(calls, 0);
});
