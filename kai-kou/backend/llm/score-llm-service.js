import { isFallbackEligible } from "./provider-error.js";
import { callGemini } from "./providers/gemini.js";
import { callGroq, getGroqApiKeyFromEnv } from "./providers/groq.js";
import {
  callScoringOpenAICompatible,
  getScoringOpenAICompatibleApiKeyFromEnv
} from "./providers/openai-compatible.js";

const WE_DEFAULT_PRIMARY_PROVIDER = "groq";
const WE_DEFAULT_PRIMARY_TIMEOUT_MS = 3500;
const WE_DEFAULT_FALLBACK_TIMEOUT_MS = 3500;
const GEMINI_PLACEHOLDER_KEY = "YOUR_GEMINI_API_KEY";
const RA_DEFAULT_PRIMARY_TIMEOUT_MS = 20000;
const RA_DEFAULT_FALLBACK_TIMEOUT_MS = 20000;

export async function generateScoreTextWithFallback({ prompt, taskType, structuredOutput = null } = {}) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return generateWEScoreTextWithFallback({ prompt });
  }
  if (normalizedTaskType === "RA") {
    return generateRAScoreTextWithFallback({ prompt });
  }
  return generateDefaultScoreTextWithFallback({ prompt, taskType: normalizedTaskType, structuredOutput });
}

async function generateRAScoreTextWithFallback({ prompt } = {}) {
  const startedAt = nowMs();
  const openaiApiKey = getScoringOpenAICompatibleApiKeyFromEnv();
  const fallbackApiKey = getGroqApiKeyFromEnv();
  const providerAttempts = [];
  const primaryTimeoutMs = resolveDefaultProviderTimeoutMs("RA", "primary");
  const fallbackTimeoutMs = resolveDefaultProviderTimeoutMs("RA", "fallback");

  let primaryLatencyMs = 0;
  try {
    const primary = await callProviderWithAttempt({
      provider: "openai",
      stage: "primary",
      prompt,
      apiKey: openaiApiKey,
      timeoutMs: primaryTimeoutMs,
      providerAttempts
    });
    primaryLatencyMs = primary.duration_ms;
    return {
      raw_text: primary.result.raw_text,
      provider_used: "openai",
      fallback_reason: null,
      raw_error_type: null,
      provider_attempts: providerAttempts,
      latency: {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      }
    };
  } catch (primaryError) {
    primaryLatencyMs = Number(primaryError?.attempt_duration_ms || 0);
    const primaryRawErrorType = primaryError?.raw_error_type || "openai_provider_error";

    if (!isFallbackEligible(primaryError) || !fallbackApiKey) {
      primaryError.provider_used = null;
      primaryError.last_provider_attempted = "openai";
      primaryError.fallback_reason = primaryRawErrorType;
      if (!fallbackApiKey) primaryError.fallback_error_type = "groq_api_key_missing";
      primaryError.provider_attempts = providerAttempts;
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    try {
      const fallback = await callProviderWithAttempt({
        provider: "groq",
        stage: "fallback",
        prompt,
        apiKey: fallbackApiKey,
        timeoutMs: fallbackTimeoutMs,
        providerAttempts
      });
      return {
        raw_text: fallback.result.raw_text,
        provider_used: "groq",
        fallback_reason: primaryRawErrorType,
        raw_error_type: primaryRawErrorType,
        provider_attempts: providerAttempts,
        latency: {
          total_ms: elapsedMs(startedAt),
          primary_ms: primaryLatencyMs,
          fallback_ms: fallback.duration_ms
        }
      };
    } catch (fallbackError) {
      fallbackError.provider_used = null;
      fallbackError.last_provider_attempted = "groq";
      fallbackError.fallback_reason = primaryRawErrorType;
      fallbackError.fallback_error_type = fallbackError.raw_error_type || "groq_provider_error";
      fallbackError.primary_raw_error_type = primaryRawErrorType;
      fallbackError.provider_attempts = providerAttempts;
      fallbackError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: Number(fallbackError?.attempt_duration_ms || 0)
      };
      throw fallbackError;
    }
  }
}

async function generateDefaultScoreTextWithFallback({ prompt, taskType, structuredOutput = null } = {}) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const startedAt = nowMs();
  const geminiApiKey = `${process.env.GEMINI_API_KEY || ""}`.trim();
  const fallbackApiKey = getGroqApiKeyFromEnv();
  const providerAttempts = [];
  const primaryTimeoutMs = resolveDefaultProviderTimeoutMs(normalizedTaskType, "primary");
  const fallbackTimeoutMs = resolveDefaultProviderTimeoutMs(normalizedTaskType, "fallback");

  if (!geminiApiKey && fallbackApiKey) {
    try {
      const fallback = await callProviderWithAttempt({
        provider: "groq",
        stage: "primary",
        prompt,
        apiKey: fallbackApiKey,
        timeoutMs: fallbackTimeoutMs,
        providerAttempts,
        structuredOutput
      });
      return {
        raw_text: fallback.result.raw_text,
        provider_used: "groq",
        fallback_reason: "gemini_api_key_missing",
        raw_error_type: "gemini_api_key_missing",
        provider_attempts: providerAttempts,
        latency: {
          total_ms: elapsedMs(startedAt),
          primary_ms: 0,
          fallback_ms: fallback.duration_ms
        }
      };
    } catch (fallbackError) {
      fallbackError.provider_used = resolveFailureProviderUsed(normalizedTaskType, "groq");
      fallbackError.last_provider_attempted = "groq";
      fallbackError.fallback_reason = "gemini_api_key_missing";
      fallbackError.fallback_error_type = fallbackError.raw_error_type || "groq_provider_error";
      fallbackError.primary_raw_error_type = "gemini_api_key_missing";
      fallbackError.provider_attempts = providerAttempts;
      fallbackError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: 0,
        fallback_ms: Number(fallbackError?.attempt_duration_ms || 0)
      };
      throw fallbackError;
    }
  }

  let primaryLatencyMs = 0;
  try {
    const primary = await callProviderWithAttempt({
      provider: "gemini",
      stage: "primary",
      prompt,
      apiKey: geminiApiKey,
      timeoutMs: primaryTimeoutMs,
      providerAttempts,
      structuredOutput
    });
    primaryLatencyMs = primary.duration_ms;
    return {
      raw_text: primary.result.raw_text,
      provider_used: "gemini",
      fallback_reason: null,
      raw_error_type: null,
      provider_attempts: providerAttempts,
      latency: {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      }
    };
  } catch (primaryError) {
    primaryLatencyMs = Number(primaryError?.attempt_duration_ms || 0);
    if (!isFallbackEligible(primaryError)) {
      primaryError.provider_used = resolveFailureProviderUsed(normalizedTaskType, "gemini");
      primaryError.last_provider_attempted = "gemini";
      primaryError.fallback_reason = null;
      primaryError.provider_attempts = providerAttempts;
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    if (!fallbackApiKey) {
      primaryError.provider_used = resolveFailureProviderUsed(normalizedTaskType, "gemini");
      primaryError.last_provider_attempted = "gemini";
      primaryError.fallback_reason = primaryError.raw_error_type || "gemini_provider_error";
      primaryError.fallback_error_type = "groq_api_key_missing";
      primaryError.provider_attempts = providerAttempts;
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    try {
      const fallback = await callProviderWithAttempt({
        provider: "groq",
        stage: "fallback",
        prompt,
        apiKey: fallbackApiKey,
        timeoutMs: fallbackTimeoutMs,
        providerAttempts,
        structuredOutput
      });
      return {
        raw_text: fallback.result.raw_text,
        provider_used: "groq",
        fallback_reason: primaryError.raw_error_type || "gemini_provider_error",
        raw_error_type: primaryError.raw_error_type || "gemini_provider_error",
        provider_attempts: providerAttempts,
        latency: {
          total_ms: elapsedMs(startedAt),
          primary_ms: primaryLatencyMs,
          fallback_ms: fallback.duration_ms
        }
      };
    } catch (fallbackError) {
      fallbackError.provider_used = resolveFailureProviderUsed(normalizedTaskType, "groq");
      fallbackError.last_provider_attempted = "groq";
      fallbackError.fallback_reason = primaryError.raw_error_type || "gemini_provider_error";
      fallbackError.fallback_error_type = fallbackError.raw_error_type || "groq_provider_error";
      fallbackError.primary_raw_error_type = primaryError.raw_error_type || "gemini_provider_error";
      fallbackError.provider_attempts = providerAttempts;
      fallbackError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: Number(fallbackError?.attempt_duration_ms || 0)
      };
      throw fallbackError;
    }
  }
}

async function generateWEScoreTextWithFallback({ prompt } = {}) {
  const startedAt = nowMs();
  const geminiApiKey = `${process.env.GEMINI_API_KEY || ""}`.trim();
  const groqApiKey = getGroqApiKeyFromEnv();
  const geminiConfigured = Boolean(geminiApiKey && geminiApiKey !== GEMINI_PLACEHOLDER_KEY);
  const groqConfigured = Boolean(groqApiKey);
  const providerAttempts = [];
  const primaryProvider = resolveWEPrimaryProvider({ geminiConfigured, groqConfigured });
  const fallbackProvider = resolveWEFallbackProvider({
    primaryProvider,
    geminiConfigured,
    groqConfigured
  });

  if (!primaryProvider) {
    const error = new Error("No configured provider for WE scoring.");
    error.raw_error_type = "llm_api_keys_missing";
    error.provider_attempts = providerAttempts;
    throw error;
  }

  const primaryTimeoutMs = toPositiveInt(
    process.env.LLM_WE_PRIMARY_TIMEOUT_MS,
    process.env.LLM_PRIMARY_TIMEOUT_MS,
    WE_DEFAULT_PRIMARY_TIMEOUT_MS
  );
  const fallbackTimeoutMs = toPositiveInt(
    process.env.LLM_WE_FALLBACK_TIMEOUT_MS,
    process.env.LLM_FALLBACK_TIMEOUT_MS,
    WE_DEFAULT_FALLBACK_TIMEOUT_MS
  );

  const primaryApiKey = getProviderApiKey(primaryProvider, { geminiApiKey, groqApiKey });
  let primaryLatencyMs = 0;
  try {
    const primary = await callProviderWithAttempt({
      provider: primaryProvider,
      stage: "primary",
      prompt,
      apiKey: primaryApiKey,
      timeoutMs: primaryTimeoutMs,
      providerAttempts
    });
    primaryLatencyMs = primary.duration_ms;

    return {
      raw_text: primary.result.raw_text,
      provider_used: primaryProvider,
      fallback_reason: null,
      raw_error_type: null,
      provider_attempts: providerAttempts,
      latency: {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      }
    };
  } catch (primaryError) {
    primaryLatencyMs = Number(primaryError?.attempt_duration_ms || 0);
    const primaryRawErrorType = primaryError?.raw_error_type || `${primaryProvider}_provider_error`;
    if (!isFallbackEligible(primaryError) || !fallbackProvider) {
      primaryError.provider_used = primaryProvider;
      primaryError.fallback_reason = null;
      primaryError.provider_attempts = providerAttempts;
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    const fallbackApiKey = getProviderApiKey(fallbackProvider, { geminiApiKey, groqApiKey });
    try {
      const fallback = await callProviderWithAttempt({
        provider: fallbackProvider,
        stage: "fallback",
        prompt,
        apiKey: fallbackApiKey,
        timeoutMs: fallbackTimeoutMs,
        providerAttempts
      });

      return {
        raw_text: fallback.result.raw_text,
        provider_used: fallbackProvider,
        fallback_reason: primaryRawErrorType,
        raw_error_type: primaryRawErrorType,
        provider_attempts: providerAttempts,
        latency: {
          total_ms: elapsedMs(startedAt),
          primary_ms: primaryLatencyMs,
          fallback_ms: fallback.duration_ms
        }
      };
    } catch (fallbackError) {
      fallbackError.provider_used = fallbackProvider;
      fallbackError.fallback_reason = primaryRawErrorType;
      fallbackError.primary_raw_error_type = primaryRawErrorType;
      fallbackError.provider_attempts = providerAttempts;
      fallbackError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: Number(fallbackError?.attempt_duration_ms || 0)
      };
      throw fallbackError;
    }
  }
}

async function callProviderWithAttempt({
  provider,
  stage,
  prompt,
  apiKey,
  timeoutMs,
  providerAttempts,
  structuredOutput = null
} = {}) {
  const startTs = Date.now();
  const attemptBase = {
    provider: normalizeProviderName(provider),
    stage: normalizeStage(stage),
    started_at: new Date(startTs).toISOString(),
    timeout_ms: Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : undefined
  };

  try {
    let result;
    if (provider === "groq") {
      result = await callGroq({ prompt, apiKey, timeoutMs });
    } else if (provider === "openai") {
      result = await callScoringOpenAICompatible({ prompt, apiKey, timeoutMs });
    } else {
      result = await callGemini({
        prompt,
        apiKey,
        timeoutMs,
        generationConfig: structuredOutput
      });
    }
    const endTs = Date.now();
    const durationMs = Math.max(0, endTs - startTs);
    providerAttempts.push({
      ...attemptBase,
      ended_at: new Date(endTs).toISOString(),
      duration_ms: durationMs,
      status: "success",
      raw_error_type: "",
      model: `${result?.model || ""}`.trim() || undefined
    });
    return {
      result,
      duration_ms: durationMs
    };
  } catch (error) {
    const endTs = Date.now();
    const durationMs = Math.max(0, endTs - startTs);
    providerAttempts.push({
      ...attemptBase,
      ended_at: new Date(endTs).toISOString(),
      duration_ms: durationMs,
      status: "failed",
      raw_error_type: `${error?.raw_error_type || ""}`.trim(),
      fallback_allowed: Boolean(error?.fallback_allowed),
      status_code: Number.isFinite(Number(error?.status)) ? Math.round(Number(error.status)) : undefined,
      http_status: Number.isFinite(Number(error?.status)) ? Math.round(Number(error.status)) : undefined,
      model: `${error?.model || ""}`.trim() || undefined,
      sanitized_error_body: error?.sanitized_error_body || undefined
    });
    error.attempt_duration_ms = durationMs;
    throw error;
  }
}

function normalizeTaskType(taskType) {
  return `${taskType || ""}`.trim().toUpperCase();
}

function resolveDefaultProviderTimeoutMs(taskType, stage) {
  if (taskType !== "RA") return undefined;
  const specificEnv = stage === "fallback" ? process.env.LLM_RA_FALLBACK_TIMEOUT_MS : process.env.LLM_RA_PRIMARY_TIMEOUT_MS;
  const defaultTimeoutMs = stage === "fallback" ? RA_DEFAULT_FALLBACK_TIMEOUT_MS : RA_DEFAULT_PRIMARY_TIMEOUT_MS;
  return toPositiveInt(
    specificEnv,
    process.env.LLM_RA_TIMEOUT_MS,
    defaultTimeoutMs
  );
}

function resolveFailureProviderUsed(taskType, attemptedProvider) {
  return taskType === "RA" ? null : attemptedProvider;
}

function resolveWEPrimaryProvider({ geminiConfigured, groqConfigured } = {}) {
  const preferred = `${process.env.LLM_WE_PRIMARY_PROVIDER || WE_DEFAULT_PRIMARY_PROVIDER}`.trim().toLowerCase();
  if (preferred === "gemini" && geminiConfigured) return "gemini";
  if (preferred === "groq" && groqConfigured) return "groq";
  if (groqConfigured) return "groq";
  if (geminiConfigured) return "gemini";
  return "";
}

function resolveWEFallbackProvider({ primaryProvider, geminiConfigured, groqConfigured } = {}) {
  if (primaryProvider === "groq" && geminiConfigured) return "gemini";
  if (primaryProvider === "gemini" && groqConfigured) return "groq";
  return "";
}

function getProviderApiKey(provider, { geminiApiKey, groqApiKey } = {}) {
  if (provider === "groq") return `${groqApiKey || ""}`.trim();
  return `${geminiApiKey || ""}`.trim();
}

function normalizeProviderName(provider) {
  const normalized = `${provider || ""}`.trim().toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "groq") return "groq";
  return "gemini";
}

function normalizeStage(stage) {
  const normalized = `${stage || ""}`.trim().toLowerCase();
  if (normalized === "fallback") return "fallback";
  return "primary";
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
  return 0;
}
