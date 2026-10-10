import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { AgentChatServiceError, getAgentChatConfig, requestAgentChatCompletion } from '../../backend/agent/chat-service.js';
import { buildAgentSystemPrompt } from '../../backend/agent/agent-prompt.js';
import { getScoringOpenAICompatibleConfig } from '../../backend/llm/providers/openai-compatible.js';

const PROVIDER_ENV = /^(AGENT_OPENAI_|SCORING_OPENAI_|OPENAI_BASE_URL$)/;

function withEnv(t, values = {}) {
  const saved = Object.fromEntries(Object.keys(process.env).filter((key) => PROVIDER_ENV.test(key)).map((key) => [key, process.env[key]]));
  for (const key of Object.keys(saved)) delete process.env[key];
  Object.assign(process.env, values);
  t.after(() => {
    for (const key of Object.keys(process.env)) if (PROVIDER_ENV.test(key)) delete process.env[key];
    Object.assign(process.env, saved);
  });
}

test('with nothing configured the AI tutor has no endpoint or model of its own', (t) => {
  withEnv(t);
  const config = getAgentChatConfig();
  assert.equal(config.baseUrl, '');
  assert.equal(config.model, '');
});

test('a missing base URL or model reports "not configured" without calling any service', async (t) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('should not be called'); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const messages = [{ role: 'user', content: 'RA 怎么练？' }];
  for (const [env, raw] of [
    [{ AGENT_OPENAI_API_KEY: 'k', AGENT_OPENAI_MODEL: 'm' }, 'missing_base_url'],
    [{ AGENT_OPENAI_API_KEY: 'k', AGENT_OPENAI_BASE_URL: 'https://relay.test/v1' }, 'missing_model'],
    [{ AGENT_OPENAI_BASE_URL: 'https://relay.test/v1', AGENT_OPENAI_MODEL: 'm' }, 'missing_api_key']
  ]) {
    await t.test(raw, async (st) => {
      withEnv(st, env);
      await assert.rejects(requestAgentChatCompletion({ messages }), (error) => {
        assert.ok(error instanceof AgentChatServiceError);
        assert.equal(error.reason_code, 'missing_api_key');
        assert.equal(error.status, 503);
        assert.equal(error.raw_error_type, raw);
        return true;
      });
    });
  }
  assert.equal(called, false);
});

test('configured values are used as given', (t) => {
  withEnv(t, { AGENT_OPENAI_BASE_URL: 'https://relay.test/v1/', AGENT_OPENAI_API_KEY: 'k', AGENT_OPENAI_MODEL: 'tutor-model' });
  const config = getAgentChatConfig();
  assert.equal(config.baseUrl, 'https://relay.test/v1');
  assert.equal(config.model, 'tutor-model');
});

test('scoring falls back to the AI tutor settings and otherwise has no defaults', (t) => {
  withEnv(t);
  assert.equal(getScoringOpenAICompatibleConfig().baseUrl, '');
  assert.equal(getScoringOpenAICompatibleConfig().model, '');
  Object.assign(process.env, { AGENT_OPENAI_BASE_URL: 'https://relay.test/v1', AGENT_OPENAI_MODEL: 'tutor-model' });
  assert.equal(getScoringOpenAICompatibleConfig().baseUrl, 'https://relay.test/v1');
  assert.equal(getScoringOpenAICompatibleConfig().model, 'tutor-model');
  process.env.SCORING_OPENAI_MODEL = 'scoring-model';
  assert.equal(getScoringOpenAICompatibleConfig().model, 'scoring-model');
});

test('the identity answer names the configured model, or no model at all', (t) => {
  withEnv(t, { AGENT_OPENAI_MODEL: 'tutor-model' });
  assert.match(buildAgentSystemPrompt('pte_qa', '你是什么模型'), /当前由 tutor-model 驱动/);
  delete process.env.AGENT_OPENAI_MODEL;
  const prompt = buildAgentSystemPrompt('pte_qa', '你是什么模型');
  assert.match(prompt, /你是“开口”的 PTE AI 私教。不要说自己是 ChatGPT/);
  assert.doesNotMatch(prompt, /驱动/);
});

function sourceFiles(dir) {
  return readdirSync(new URL(`../../${dir}`, import.meta.url)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(new URL(`../../${path}`, import.meta.url)).isDirectory() ? sourceFiles(path) : /\.(js|mjs|vue)$/.test(name) ? [path] : [];
  });
}

test('no relay address or model name is written into the app code or the env example', () => {
  const files = [...sourceFiles('backend'), ...sourceFiles('api'), ...sourceFiles('src'), 'server.js', '.env.example'];
  for (const path of files) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /testvideo\.site/i, path);
    assert.doesNotMatch(source, /gpt-5\.4/i, path);
  }
});
