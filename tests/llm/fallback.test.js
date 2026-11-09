import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateScoreTextWithFallback } from '../../backend/llm/score-llm-service.js';
import { createProviderError, isFallbackEligible } from '../../backend/llm/provider-error.js';
import { callGemini } from '../../backend/llm/providers/gemini.js';
import { callGroq } from '../../backend/llm/providers/groq.js';
import { callScoringOpenAICompatible, callOpenAICompatibleChat } from '../../backend/llm/providers/openai-compatible.js';

let savedEnv;
let savedFetch;
let calls;
const payload = JSON.stringify({ scores: { content: 70, pronunciation: 65, fluency: 68 }, overall: 68 });

beforeEach(() => {
  savedEnv = { ...process.env };
  savedFetch = globalThis.fetch;
  for (const key of Object.keys(process.env)) {
    if (/^(LLM_|SCORING_OPENAI_|AGENT_OPENAI_|OPENAI_|GEMINI_|GROQ_|GROP_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    GEMINI_API_KEY: 'test-gemini', GROQ_API_KEY: 'test-groq',
    SCORING_OPENAI_API_KEY: 'test-openai', SCORING_OPENAI_BASE_URL: 'https://primary.example/v1',
    SCORING_OPENAI_MODEL: 'test-model', LLM_WE_PRIMARY_PROVIDER: 'gemini',
    LLM_PRIMARY_TIMEOUT_MS: '10', LLM_RA_PRIMARY_TIMEOUT_MS: '10', LLM_RTS_PRIMARY_TIMEOUT_MS: '10', LLM_WE_PRIMARY_TIMEOUT_MS: '10'
  });
  calls = [];
  globalThis.fetch = async () => { throw new Error('Unexpected request: tests never use the network'); };
});
afterEach(() => {
  globalThis.fetch = savedFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});

function reply(provider, content = payload) {
  return new Response(JSON.stringify(provider === 'gemini'
    ? { candidates: [{ content: { parts: [{ text: content }] } }] }
    : { choices: [{ message: { content } }] }), { status: 200 });
}
function simulate(primaryOutcome, fallbackStatus = 200) {
  globalThis.fetch = async (url, init) => {
    const provider = String(url).includes('api.groq.com') ? 'groq'
      : String(url).includes('generativelanguage.googleapis.com') ? 'gemini' : 'openai';
    calls.push({ provider, url: String(url), authorization: init.headers.Authorization, body: JSON.parse(init.body) });
    if (provider === 'groq') return fallbackStatus === 200 ? reply(provider)
      : new Response(JSON.stringify({ error: { message: 'backup unavailable' } }), { status: fallbackStatus });
    if (primaryOutcome === 'timeout') {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
    }
    if (primaryOutcome === 'network') throw new TypeError('fetch failed');
    if (primaryOutcome === 'empty') return reply(provider, '');
    if (primaryOutcome === 'success') return reply(provider);
    return new Response(JSON.stringify({ error: { message: 'primary unavailable' } }), { status: primaryOutcome });
  };
}

for (const taskType of ['RA', 'RTS', 'RS', 'WE', 'DI', 'RL']) {
  const primary = ['RA', 'RTS'].includes(taskType) ? 'openai' : 'gemini';
  for (const outcome of [401, 402, 403, 404, 408, 409, 429, 500, 503, 'timeout', 'network', 'empty']) {
    test(`${taskType}: ${outcome} falls back and retains primary failure diagnostics`, async () => {
      simulate(outcome);
      const result = await generateScoreTextWithFallback({ taskType, prompt: 'Return scoring JSON' });
      assert.equal(result.provider_used, 'groq');
      assert.equal(result.raw_text, payload);
      const suffix = typeof outcome === 'number' ? `http_${outcome}`
        : outcome === 'timeout' ? 'response_timeout' : outcome === 'network' ? 'network_error' : 'empty_content';
      assert.equal(result.fallback_reason, `${primary}_${suffix}`);
      assert.equal(result.raw_error_type, result.fallback_reason);
      assert.deepEqual(result.provider_attempts.map(a => [a.provider, a.stage, a.status]),
        [[primary, 'primary', 'failed'], ['groq', 'fallback', 'success']]);
      assert.deepEqual(calls.map(c => c.provider), [primary, 'groq']);
      assert.equal(calls[1].body.model, 'openai/gpt-oss-120b');
      if (primary === 'openai') assert.equal(result.provider_attempts[0].model, 'test-model');
      assert.equal(result.provider_attempts[1].model, 'openai/gpt-oss-120b');
    });
  }
  for (const status of [400, 413, 422]) {
    test(`${taskType}: HTTP ${status} rejects without calling backup`, async () => {
      simulate(status);
      await assert.rejects(generateScoreTextWithFallback({ taskType, prompt: 'Return scoring JSON' }), error => {
        assert.equal(error.raw_error_type, `${primary}_http_${status}`);
        assert.equal(error.fallback_allowed, false);
        assert.equal(error.provider_attempts.length, 1);
        return true;
      });
      assert.deepEqual(calls.map(c => c.provider), [primary]);
    });
  }
  test(`${taskType}: both providers fail without producing a score`, async () => {
    simulate(402, 503);
    await assert.rejects(generateScoreTextWithFallback({ taskType, prompt: 'Return scoring JSON' }), error => {
      assert.equal(error.fallback_reason, `${primary}_http_402`);
      assert.equal(error.raw_error_type, 'groq_http_503');
      assert.equal(error.provider_attempts.length, 2);
      assert.deepEqual(error.provider_attempts.map(a => a.status), ['failed', 'failed']);
      for (const field of ['scores', 'overall', 'raw_text']) assert.equal(field in error, false);
      return true;
    });
  });
  test(`${taskType}: success does not call backup`, async () => {
    simulate('success');
    const result = await generateScoreTextWithFallback({ taskType, prompt: 'Return scoring JSON' });
    assert.equal(result.provider_used, primary);
    assert.equal(result.fallback_reason, null);
    assert.equal(result.raw_error_type, null);
    assert.deepEqual(result.provider_attempts.map(a => [a.provider, a.stage, a.status]),
      [[primary, 'primary', 'success']]);
    if (primary === 'openai') assert.equal(result.provider_attempts[0].model, 'test-model');
    assert.equal(calls.length, 1);
  });
  test(`${taskType}: missing primary key still uses configured Groq`, async () => {
    delete process.env[primary === 'openai' ? 'SCORING_OPENAI_API_KEY' : 'GEMINI_API_KEY'];
    simulate('success');
    const result = await generateScoreTextWithFallback({ taskType, prompt: 'Return scoring JSON' });
    assert.equal(result.provider_used, 'groq');
    assert.equal(result.raw_text, payload);
    assert.deepEqual(calls.map(c => c.provider), ['groq']);
  });
}

test('RTS: reuses AI tutor OpenAI configuration when scoring overrides are absent', async () => {
  for (const key of ['SCORING_OPENAI_API_KEY', 'SCORING_OPENAI_BASE_URL', 'SCORING_OPENAI_MODEL']) {
    delete process.env[key];
  }
  Object.assign(process.env, {
    AGENT_OPENAI_API_KEY: 'test-tutor-key',
    AGENT_OPENAI_BASE_URL: 'https://tutor.example/v1/',
    AGENT_OPENAI_MODEL: 'tutor-model'
  });
  simulate('success');
  const result = await generateScoreTextWithFallback({ taskType: ' rts ', prompt: 'Original RTS prompt' });
  assert.equal(result.provider_used, 'openai');
  assert.equal(result.fallback_reason, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tutor.example/v1/chat/completions');
  assert.equal(calls[0].authorization, 'Bearer test-tutor-key');
  assert.equal(calls[0].body.model, 'tutor-model');
  assert.deepEqual(calls[0].body.messages, [{ role: 'user', content: 'Original RTS prompt' }]);
  assert.equal(result.provider_attempts[0].model, 'tutor-model');
});

for (const [field, rawType] of [
  ['SCORING_OPENAI_BASE_URL', 'openai_base_url_missing'],
  ['SCORING_OPENAI_MODEL', 'openai_model_missing']
]) {
  test(`RTS: missing ${field} uses configured Groq without requesting Gemini`, async () => {
    delete process.env[field];
    simulate('success');
    const result = await generateScoreTextWithFallback({ taskType: 'RTS', prompt: 'Original RTS prompt' });
    assert.equal(result.provider_used, 'groq');
    assert.equal(result.fallback_reason, rawType);
    assert.deepEqual(calls.map(c => c.provider), ['groq']);
    assert.deepEqual(calls[0].body.messages, [{ role: 'user', content: 'Original RTS prompt' }]);
    assert.deepEqual(result.provider_attempts.map(a => [a.provider, a.status]),
      [['openai', 'failed'], ['groq', 'success']]);
  });
}

test('RTS: eligible primary failure without Groq rejects without trying Gemini', async () => {
  delete process.env.GROQ_API_KEY;
  simulate(402);
  await assert.rejects(generateScoreTextWithFallback({ taskType: 'RTS', prompt: 'Return JSON' }), error => {
    assert.equal(error.fallback_reason, 'openai_http_402');
    assert.equal(error.fallback_error_type, 'groq_api_key_missing');
    assert.equal(error.provider_used, null);
    assert.equal(error.last_provider_attempted, 'openai');
    assert.equal(error.provider_attempts.length, 1);
    return true;
  });
  assert.deepEqual(calls.map(c => c.provider), ['openai']);
});

test('explicit fallback policy overrides default classification', () => {
  assert.equal(isFallbackEligible(createProviderError('test', { status: 400, fallback_allowed: true })), true);
  assert.equal(isFallbackEligible(createProviderError('test', { status: 402, fallback_allowed: false })), false);
  assert.equal(isFallbackEligible(createProviderError('test', {})), true);
});

for (const [name, call] of [['gemini', callGemini], ['groq', callGroq]]) {
  test(`${name}: missing provider key is eligible for another provider`, async () => {
    delete process.env.GROQ_API_KEY;
    await assert.rejects(call({ prompt: 'Return JSON' }), e => e.raw_error_type === `${name}_api_key_missing` && e.fallback_allowed);
    assert.equal(calls.length, 0);
  });
  test(`${name}: empty provider response is eligible for another provider`, async () => {
    globalThis.fetch = async () => reply(name, '');
    await assert.rejects(call({ prompt: 'Return JSON', apiKey: 'test' }), e => e.raw_error_type === `${name}_empty_content` && e.fallback_allowed);
  });
}
for (const [field, rawType] of [['baseUrl', 'openai_base_url_missing'], ['model', 'openai_model_missing']]) {
  test(`RA: missing ${field} falls back at provider boundary`, async () => {
    await assert.rejects(callScoringOpenAICompatible({ prompt: 'Return JSON', [field]: ' ' }),
      e => e.raw_error_type === rawType && e.fallback_allowed);
    assert.equal(calls.length, 0);
  });
}
test('Groq model can be overridden by environment', async () => {
  process.env.LLM_GROQ_MODEL = 'custom-backup-model';
  simulate(402);
  await generateScoreTextWithFallback({ taskType: 'RA', prompt: 'Return JSON' });
  assert.equal(calls[1].body.model, 'custom-backup-model');
});
test('chat request construction errors stay ineligible for fallback', async () => {
  await assert.rejects(callOpenAICompatibleChat({ messages: [], apiKey: 'test', model: 'test' }),
    e => e.fallback_allowed === false);
  assert.equal(calls.length, 0);
});
