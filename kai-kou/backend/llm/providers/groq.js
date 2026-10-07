import { createProviderError, toProviderError } from "../provider-error.js";

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 8000;
const SAFE_ERROR_BODY_KEYS = new Set(["error", "message", "type", "code", "param", "status", "status_code", "statusCode"]);

let hasWarnedLegacyGroqKey = false;

export async function callGroq({ prompt, apiKey, model, timeoutMs } = {}) {
  const resolvedApiKey = `${apiKey || getGroqApiKeyFromEnv() || ""}`.trim();
  const resolvedModel = `${model || process.env.LLM_GROQ_MODEL || DEFAULT_GROQ_MODEL}`.trim() || DEFAULT_GROQ_MODEL;
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, process.env.LLM_FALLBACK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  if (!resolvedApiKey) {
    throw createProviderError("groq", {
      message: "Groq API key is missing",
      status: 500,
      raw_error_type: "groq_api_key_missing",
      fallback_allowed: true,
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    });
  }

  const startedAt = nowMs();

  try {
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedApiKey}`
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [{ role: "user", content: `${prompt || ""}` }],
          response_format: { type: "json_object" }
        })
      },
      resolvedTimeoutMs
    );

    const { data, sanitizedBody } = await safeReadProviderBody(response);
    if (!response.ok) {
      const message = extractGroqErrorMessage(data) || `Groq request failed with status ${response.status}`;
      throw createProviderError("groq", {
        message,
        status: response.status,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs,
        sanitized_error_body: sanitizedBody
      });
    }

    const rawText = data?.choices?.[0]?.message?.content;
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw createProviderError("groq", {
        message: "Groq returned empty content",
        status: 502,
        raw_error_type: "groq_empty_content",
        fallback_allowed: true,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs
      });
    }

    return {
      raw_text: rawText,
      provider_used: "groq",
      latency_ms: elapsedMs(startedAt),
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    };
  } catch (error) {
    const normalized = toProviderError("groq", error);
    normalized.latency_ms = elapsedMs(startedAt);
    normalized.model = normalized.model || resolvedModel;
    normalized.timeout_ms = Number.isFinite(Number(normalized.timeout_ms))
      ? normalized.timeout_ms
      : resolvedTimeoutMs;
    throw normalized;
  }
}

export function getGroqApiKeyFromEnv() {
  const canonical = `${process.env.GROQ_API_KEY || ""}`.trim();
  if (canonical) return canonical;

  const legacy = `${process.env.GROP_API_KEY || ""}`.trim();
  if (legacy) {
    if (!hasWarnedLegacyGroqKey) {
      hasWarnedLegacyGroqKey = true;
      console.warn("[llm] legacy env key GROP_API_KEY detected; please migrate to GROQ_API_KEY.");
    }
    return legacy;
  }

  return "";
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

function extractGroqErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return "";
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
    .replace(/gsk_[A-Za-z0-9_-]+/g, "gsk_[redacted]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "AIza[redacted]");
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

function toPositiveInt(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
  }
  return DEFAULT_TIMEOUT_MS;
}
