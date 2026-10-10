import { createProviderError, toProviderError } from "../provider-error.js";

const PROVIDER_NAME = "openai_compatible";
const SCORING_PROVIDER_NAME = "openai";
const DEFAULT_TIMEOUT_MS = 15000;
const SCORING_DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_TOKENS = 900;
const SAFE_ERROR_BODY_KEYS = new Set(["error", "message", "type", "code", "param", "status", "status_code", "statusCode"]);

// Base URL and model have no built-in defaults: they must come from the environment
// (AGENT_OPENAI_* for the AI tutor, SCORING_OPENAI_* falling back to AGENT_OPENAI_* for scoring).
export function getOpenAICompatibleConfig() {
  return {
    baseUrl: normalizeBaseUrl(process.env.AGENT_OPENAI_BASE_URL),
    apiKey: normalizeText(process.env.AGENT_OPENAI_API_KEY),
    model: normalizeText(process.env.AGENT_OPENAI_MODEL),
    timeoutMs: toPositiveInt(process.env.AGENT_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxTokens: toPositiveInt(process.env.AGENT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_TOKENS)
  };
}

export function getScoringOpenAICompatibleApiKeyFromEnv() {
  return normalizeText(process.env.SCORING_OPENAI_API_KEY) || normalizeText(process.env.AGENT_OPENAI_API_KEY);
}

export function getScoringOpenAICompatibleModelFromEnv() {
  return normalizeText(process.env.SCORING_OPENAI_MODEL) || normalizeText(process.env.AGENT_OPENAI_MODEL);
}

export function getScoringOpenAICompatibleConfig() {
  return {
    baseUrl: normalizeBaseUrl(
      process.env.SCORING_OPENAI_BASE_URL
        || process.env.AGENT_OPENAI_BASE_URL
        || process.env.OPENAI_BASE_URL
    ),
    apiKey: getScoringOpenAICompatibleApiKeyFromEnv(),
    model: getScoringOpenAICompatibleModelFromEnv(),
    timeoutMs: toPositiveInt(
      process.env.SCORING_OPENAI_TIMEOUT_MS,
      process.env.AGENT_REQUEST_TIMEOUT_MS,
      SCORING_DEFAULT_TIMEOUT_MS
    ),
    maxTokens: toPositiveInt(
      process.env.SCORING_OPENAI_MAX_OUTPUT_TOKENS,
      process.env.AGENT_MAX_OUTPUT_TOKENS,
      DEFAULT_MAX_TOKENS
    )
  };
}

export async function callOpenAICompatibleChat({
  messages,
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  maxTokens,
  temperature = 0.6
} = {}) {
  const configFromEnv = getOpenAICompatibleConfig();
  const resolvedApiKey = normalizeText(apiKey || configFromEnv.apiKey);
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || configFromEnv.baseUrl);
  const resolvedModel = normalizeText(model || configFromEnv.model);
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, configFromEnv.timeoutMs, DEFAULT_TIMEOUT_MS);
  const resolvedMaxTokens = toPositiveInt(maxTokens, configFromEnv.maxTokens, 0);
  const startedAt = nowMs();
  let providerRequestMs = 0;
  let providerParseMs = 0;

  if (!resolvedApiKey) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible API key is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_api_key_missing`,
      fallback_allowed: false
    });
  }

  if (!resolvedBaseUrl) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible base URL is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_base_url_missing`,
      fallback_allowed: false
    });
  }

  if (!resolvedModel) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible model is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_model_missing`,
      fallback_allowed: false
    });
  }

  const normalizedMessages = normalizeMessages(messages);
  if (!normalizedMessages.length) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible messages are missing",
      status: 400,
      raw_error_type: `${PROVIDER_NAME}_messages_missing`,
      fallback_allowed: false
    });
  }

  try {
    const providerRequestStartedAt = nowMs();
    let response = null;
    try {
      response = await fetchWithTimeout(
        `${resolvedBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedApiKey}`
          },
          body: JSON.stringify({
            model: resolvedModel,
            messages: normalizedMessages,
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.35,
            ...(resolvedMaxTokens > 0 ? { max_tokens: resolvedMaxTokens } : {})
          })
        },
        resolvedTimeoutMs
      );
      providerRequestMs = elapsedMs(providerRequestStartedAt);
    } catch (error) {
      providerRequestMs = elapsedMs(providerRequestStartedAt);
      if (isAbortError(error)) {
        throw createProviderError(PROVIDER_NAME, {
          message: "provider_response_timeout",
          status: 504,
          raw_error_type: `${PROVIDER_NAME}_response_timeout`,
          fallback_allowed: true,
          cause: error
        });
      }

      throw error;
    }

    const providerParseStartedAt = nowMs();
    const data = await safeReadJson(response);
    if (!response.ok) {
      providerParseMs = elapsedMs(providerParseStartedAt);
      throw createProviderError(PROVIDER_NAME, {
        message: extractProviderErrorMessage(data) || `OpenAI-compatible request failed with status ${response.status}`,
        status: response.status
      });
    }
    if (!data || typeof data !== "object") {
      providerParseMs = elapsedMs(providerParseStartedAt);
      throw createProviderError(PROVIDER_NAME, {
        message: "OpenAI-compatible provider returned invalid JSON",
        status: 502,
        raw_error_type: `${PROVIDER_NAME}_parse_failed`,
        fallback_allowed: false
      });
    }

    const rawText = extractAssistantText(data);
    if (!rawText) {
      providerParseMs = elapsedMs(providerParseStartedAt);
      throw createProviderError(PROVIDER_NAME, {
        message: "OpenAI-compatible provider returned empty content",
        status: 502,
        raw_error_type: `${PROVIDER_NAME}_empty_content`,
        fallback_allowed: false
      });
    }
    providerParseMs = elapsedMs(providerParseStartedAt);

    return {
      raw_text: rawText,
      provider_used: PROVIDER_NAME,
      latency_ms: elapsedMs(startedAt),
      provider_request_ms: providerRequestMs,
      provider_parse_ms: providerParseMs,
      model: resolvedModel,
      usage: data?.usage || null
    };
  } catch (error) {
    const normalized = toProviderError(PROVIDER_NAME, error);
    normalized.latency_ms = elapsedMs(startedAt);
    normalized.provider_request_ms = providerRequestMs;
    normalized.provider_parse_ms = providerParseMs;
    throw normalized;
  }
}

export async function callScoringOpenAICompatible({
  prompt,
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  maxTokens,
  temperature = 0.2
} = {}) {
  const configFromEnv = getScoringOpenAICompatibleConfig();
  const resolvedApiKey = normalizeText(apiKey || configFromEnv.apiKey);
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || configFromEnv.baseUrl);
  const resolvedModel = normalizeText(model || configFromEnv.model);
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, configFromEnv.timeoutMs, SCORING_DEFAULT_TIMEOUT_MS);
  const resolvedMaxTokens = toPositiveInt(maxTokens, configFromEnv.maxTokens, DEFAULT_MAX_TOKENS);
  const startedAt = nowMs();

  if (!resolvedApiKey) {
    throw createProviderError(SCORING_PROVIDER_NAME, {
      message: "OpenAI-compatible API key is missing",
      status: 500,
      raw_error_type: `${SCORING_PROVIDER_NAME}_api_key_missing`,
      fallback_allowed: true,
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    });
  }

  if (!resolvedBaseUrl) {
    throw createProviderError(SCORING_PROVIDER_NAME, {
      message: "OpenAI-compatible base URL is missing",
      status: 500,
      raw_error_type: `${SCORING_PROVIDER_NAME}_base_url_missing`,
      fallback_allowed: true,
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    });
  }

  if (!resolvedModel) {
    throw createProviderError(SCORING_PROVIDER_NAME, {
      message: "OpenAI-compatible model is missing",
      status: 500,
      raw_error_type: `${SCORING_PROVIDER_NAME}_model_missing`,
      fallback_allowed: true,
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${resolvedBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedApiKey}`
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [{ role: "user", content: `${prompt || ""}` }],
          temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.2,
          max_tokens: resolvedMaxTokens,
          response_format: { type: "json_object" }
        })
      },
      resolvedTimeoutMs
    );

    const { data, sanitizedBody } = await safeReadProviderBody(response);
    if (!response.ok) {
      throw createProviderError(SCORING_PROVIDER_NAME, {
        message: extractProviderErrorMessage(data) || `OpenAI-compatible request failed with status ${response.status}`,
        status: response.status,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs,
        sanitized_error_body: sanitizedBody
      });
    }

    const rawText = extractAssistantText(data);
    if (!rawText) {
      throw createProviderError(SCORING_PROVIDER_NAME, {
        message: "OpenAI-compatible provider returned empty content",
        status: 502,
        raw_error_type: `${SCORING_PROVIDER_NAME}_empty_content`,
        fallback_allowed: true,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs
      });
    }

    return {
      raw_text: rawText,
      provider_used: SCORING_PROVIDER_NAME,
      latency_ms: elapsedMs(startedAt),
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs,
      usage: data?.usage || null
    };
  } catch (error) {
    const normalized = toProviderError(SCORING_PROVIDER_NAME, error);
    normalized.latency_ms = elapsedMs(startedAt);
    normalized.model = normalized.model || resolvedModel;
    normalized.timeout_ms = Number.isFinite(Number(normalized.timeout_ms))
      ? normalized.timeout_ms
      : resolvedTimeoutMs;
    throw normalized;
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    return await fetch(url, {
      ...init,
      signal: controller?.signal
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isAbortError(error) {
  return `${error?.name || ""}`.trim() === "AbortError";
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function safeReadProviderBody(response) {
  try {
    const text = await response.text();
    const data = tryParseJson(text);
    return {
      data,
      sanitizedBody: sanitizeProviderErrorBody(data || text)
    };
  } catch {
    return {
      data: null,
      sanitizedBody: null
    };
  }
}

function tryParseJson(text) {
  const normalized = `${text || ""}`.trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function extractProviderErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return "";
}

function extractAssistantText(data) {
  const directContent = data?.choices?.[0]?.message?.content;
  const normalizedDirect = normalizeContent(directContent);
  if (normalizedDirect) return normalizedDirect;

  const toolStyle = data?.choices?.[0]?.message?.output_text;
  return normalizeContent(toolStyle);
}

function normalizeContent(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item?.text === "string") return item.text.trim();
      if (typeof item?.content === "string") return item.content.trim();
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((item) => ({
      role: normalizeRole(item?.role),
      content: normalizeText(item?.content)
    }))
    .filter((item) => item.content);
}

function normalizeRole(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "system" || normalized === "assistant" || normalized === "user") {
    return normalized;
  }
  return "user";
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, "");
}

function sanitizeProviderErrorBody(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return "[text body omitted]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => sanitizeProviderErrorBody(item));
  }
  if (typeof value !== "object") return value;

  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = `${key || ""}`.trim();
    if (shouldRedactProviderBodyKey(normalizedKey)) {
      output[key] = "[redacted]";
      continue;
    }

    if (!SAFE_ERROR_BODY_KEYS.has(normalizedKey)) {
      continue;
    }

    output[key] = typeof raw === "string"
      ? redactSensitiveText(raw).slice(0, 500)
      : sanitizeProviderErrorBody(raw);
  }
  return output;
}

function shouldRedactProviderBodyKey(key) {
  return (
    /(api[_-]?key|token|authorization|secret|password|credential)/i.test(key)
    || /^(prompt|messages|content|parts|text|input|inputs|question|transcript|request|body|payload|data)$/i.test(key)
  );
}

function redactSensitiveText(value) {
  return `${value || ""}`
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "gsk_[redacted]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "AIza[redacted]");
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function toPositiveInt(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
  }
  return 0;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - startedAt));
}
