import { createProviderError, toProviderError } from "../provider-error.js";
import { getPrimaryFailSimulationMode } from "../runtime-env.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 8000;

export async function callGemini({
  prompt,
  apiKey,
  model,
  timeoutMs,
  disablePrimaryFailSimulation = false,
  generationConfig = null
} = {}) {
  const resolvedApiKey = `${apiKey || ""}`.trim();
  const resolvedModel = `${model || process.env.LLM_GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`.trim() || DEFAULT_GEMINI_MODEL;
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, process.env.LLM_PRIMARY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  if (!resolvedApiKey || resolvedApiKey === "YOUR_GEMINI_API_KEY") {
    throw createProviderError("gemini", {
      message: "Gemini API key is missing",
      status: 500,
      raw_error_type: "gemini_api_key_missing",
      fallback_allowed: true,
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    });
  }

  const startedAt = nowMs();
  const simulatedFailure = disablePrimaryFailSimulation ? "" : getPrimaryFailSimulationMode();

  try {
    if (simulatedFailure) {
      throw buildSimulatedPrimaryError(simulatedFailure);
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${encodeURIComponent(resolvedApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt || ""}` }] }],
          ...(generationConfig && typeof generationConfig === "object"
            ? { generationConfig }
            : {})
        })
      },
      resolvedTimeoutMs
    );

    const data = await safeReadJson(response);
    if (!response.ok) {
      throw createProviderError("gemini", {
        message: extractGeminiErrorMessage(data) || `Gemini request failed with status ${response.status}`,
        status: response.status,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs
      });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw createProviderError("gemini", {
        message: "Gemini returned empty content",
        status: 502,
        raw_error_type: "gemini_empty_content",
        fallback_allowed: true,
        model: resolvedModel,
        timeout_ms: resolvedTimeoutMs
      });
    }

    return {
      raw_text: rawText,
      provider_used: "gemini",
      latency_ms: elapsedMs(startedAt),
      model: resolvedModel,
      timeout_ms: resolvedTimeoutMs
    };
  } catch (error) {
    const normalized = toProviderError("gemini", error);
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

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractGeminiErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return "";
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

function buildSimulatedPrimaryError(mode) {
  if (mode === "timeout") {
    return createProviderError("gemini", {
      message: "Simulated Gemini timeout for fallback test",
      raw_error_type: "gemini_timeout",
      fallback_allowed: true,
      timeout: true
    });
  }

  if (mode === "429") {
    return createProviderError("gemini", {
      message: "Simulated Gemini 429 for fallback test",
      status: 429,
      raw_error_type: "gemini_http_429",
      fallback_allowed: true
    });
  }

  return createProviderError("gemini", {
    message: "Simulated Gemini 503 for fallback test",
    status: 503,
    raw_error_type: "gemini_http_503",
    fallback_allowed: true
  });
}
