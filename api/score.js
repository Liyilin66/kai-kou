import { createClient } from "@supabase/supabase-js";
import { buildDIPrompt, buildDIResponseJsonSchema } from "../backend/di/di-prompt.js";
import {
  buildDIAiFallbackResult,
  finalizeDIScorePayload,
  normalizeDIFallbackReasonCode
} from "../backend/di/normalize-di-score.js";
import { generateScoreTextWithFallback } from "../backend/llm/score-llm-service.js";
import { getGroqApiKeyFromEnv } from "../backend/llm/providers/groq.js";
import { getScoringOpenAICompatibleApiKeyFromEnv } from "../backend/llm/providers/openai-compatible.js";
import { buildRTSPrompt, buildRTSResponseJsonSchema } from "../backend/rts/rts-prompt.js";
import { analyzeWEEssayForm } from "../backend/we/form-gate-rules.js";
import {
  buildRTSAiFallbackResult,
  finalizeRTSScorePayload,
  normalizeRTSFallbackReasonCode
} from "../backend/rts/normalize-rts-score.js";
import {
  buildWEAiFallbackResult,
  buildWEFormGateResult,
  finalizeWEScorePayload
} from "../backend/we/normalize-we-score.js";
import { buildWEPrompt } from "../backend/we/we-prompt.js";
import { getAccessStatus } from "../backend/auth/access-status.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const RA_MIN_SCORE = 10;
const RA_MAX_SCORE = 90;
const RA_WEIGHTS = {
  content: 0.2,
  fluency: 0.45,
  pronunciation: 0.35
};
const RA_FORCE_BASELINE_RESPONSE_TYPES = new Set(["silence", "noise_only"]);
const RA_CONTENT_MATCH_FLOOR_SCORE = 45;
const RA_CONTENT_MATCH_WORD_THRESHOLD = 10;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  let requestId = createRequestId(req);
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      request_id: requestId
    });
  }

  if (!supabase) {
    return res.status(500).json({
      error: "supabase_not_configured",
      message: "Supabase environment variables are not configured.",
      request_id: requestId
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Please sign in first.",
      request_id: requestId
    });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const user = authData?.user || null;
  if (authError || !user) {
    return res.status(401).json({
      error: "Session expired. Please sign in again.",
      request_id: requestId
    });
  }

  const { taskType, transcript, questionContent } = req.body || {};
  const normalizedTaskType = normalizeTaskType(taskType);
  requestId = resolveTaskRequestId(req, normalizedTaskType, requestId);
  const safeTranscript = typeof transcript === "string" ? transcript : "";
  const safeQuestionContent = typeof questionContent === "string" ? questionContent : "";
  const trimmedTranscript = safeTranscript.trim();
  const weFormAnalysis = normalizedTaskType === "WE" ? analyzeWEEssayForm(safeTranscript) : null;
  const diQuestionMeta = normalizedTaskType === "DI"
    ? normalizeDIQuestionMeta(req.body?.question_meta)
    : null;
  const diAudioSignals = normalizedTaskType === "DI"
    ? normalizeDIAudioSignals(req.body?.audio_signals)
    : null;
  const rtsQuestionMeta = normalizedTaskType === "RTS"
    ? normalizeRTSQuestionMeta(req.body?.question_meta)
    : null;
  const rtsAudioSignals = normalizedTaskType === "RTS"
    ? normalizeRTSAudioSignals(req.body?.audio_signals)
    : null;

  if (!trimmedTranscript) {
    if (normalizedTaskType === "RA") {
      const raSilenceResult = finalizeRAScore(
        { responseType: "silence" },
        {
          transcript: safeTranscript,
          questionContent: safeQuestionContent
        }
      );
      return res.status(200).json({
        ...raSilenceResult,
        provider_used: "none",
        fallback_reason: null,
        request_id: requestId
      });
    }

    if (normalizedTaskType === "WE") {
      return res.status(200).json({
        ...buildWEFormGateResult({ formAnalysis: weFormAnalysis }),
        request_id: requestId
      });
    }

    if (normalizedTaskType === "RTS") {
      return res.status(200).json({
        ...buildRTSAiFallbackResult({
          transcript: safeTranscript,
          questionContent: safeQuestionContent,
          questionMeta: rtsQuestionMeta,
          audioSignals: rtsAudioSignals,
          providerUsed: "none",
          fallbackReason: "transcript_empty",
          errorStage: "precheck_transcript",
          rawErrorType: "transcript_empty",
          reasonCodes: ["transcript_empty"]
        }),
        request_id: requestId
      });
    }

    if (normalizedTaskType === "DI") {
      return res.status(200).json({
        ...buildDIAiFallbackResult({
          transcript: safeTranscript,
          questionMeta: diQuestionMeta,
          audioSignals: diAudioSignals,
          providerUsed: "none",
          fallbackReason: "transcript_empty",
          errorStage: "precheck_transcript",
          rawErrorType: "transcript_empty",
          reasonCode: "transcript_empty"
        }),
        request_id: requestId
      });
    }

    return res.status(400).json({
      error: "transcript_too_short",
      scores: { pronunciation: 0, fluency: 0, content: 0 },
      feedback: "No speech/text recognized. Please retry.",
      overall: 0,
      request_id: requestId
    });
  }

  if (
    normalizedTaskType !== "RA"
    && normalizedTaskType !== "WE"
    && normalizedTaskType !== "RTS"
    && normalizedTaskType !== "DI"
    && trimmedTranscript.length < 3
  ) {
    return res.status(400).json({
      error: "transcript_too_short",
      scores: { pronunciation: 0, fluency: 0, content: 0 },
      feedback: "No speech/text recognized. Please retry.",
      overall: 0,
      request_id: requestId
    });
  }

  try {
    const authedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: profile, error: profileError } = await authedSupabase
      .from("profiles")
      .select("is_premium, trial_days, trial_granted_at, vip_plan, vip_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("load profile error:", profileError);
      return res.status(500).json({
        error: "profile_load_failed",
        request_id: requestId
      });
    }

    const access = getAccessStatus(user, profile);
    if (!access.canUseAiScoring) {
      return res.status(403).json({
        error: "access_expired",
        message: "AI scoring access is not available for this account.",
        access,
        request_id: requestId
      });
    }

    if (normalizedTaskType === "WE" && Number(weFormAnalysis?.form_score || 0) === 0) {
      return res.status(200).json({
        ...buildWEFormGateResult({ formAnalysis: weFormAnalysis }),
        request_id: requestId
      });
    }

    if (normalizedTaskType === "DI") {
      const diPrecheckReasonCode = resolveDIPrecheckReasonCode({
        questionMeta: diQuestionMeta,
        audioSignals: diAudioSignals
      });
      if (diPrecheckReasonCode) {
        return res.status(200).json({
          ...buildDIAiFallbackResult({
            transcript: safeTranscript,
            questionMeta: diQuestionMeta,
            audioSignals: diAudioSignals,
            providerUsed: "none",
            fallbackReason: diPrecheckReasonCode,
            errorStage: "precheck_input",
            rawErrorType: diPrecheckReasonCode,
            reasonCode: diPrecheckReasonCode
          }),
          request_id: requestId
        });
      }
    }

    const hasGeminiApiKey = hasConfiguredGeminiApiKey();
    const hasScoringOpenAIApiKey = hasConfiguredScoringOpenAIApiKey();
    const hasGroqApiKey = hasConfiguredGroqApiKey();
    const hasConfiguredScoringProvider = normalizedTaskType === "RA"
      ? hasScoringOpenAIApiKey || hasGroqApiKey
      : hasGeminiApiKey || hasGroqApiKey;
    if (!hasConfiguredScoringProvider) {
      if (normalizedTaskType === "RTS") {
        return res.status(200).json(
          {
            ...buildRTSAiFallbackResult({
              transcript: safeTranscript,
              questionContent: safeQuestionContent,
              questionMeta: rtsQuestionMeta,
              audioSignals: rtsAudioSignals,
              providerUsed: "none",
              fallbackReason: "llm_api_keys_missing",
              errorStage: "precheck_missing_all_keys",
              rawErrorType: "llm_api_keys_missing",
              reasonCodes: ["ai_review_unavailable"]
            }),
            request_id: requestId
          }
        );
      }

      if (normalizedTaskType === "WE") {
        return res.status(200).json(
          {
            ...buildWEAiFallbackResult({
              formAnalysis: weFormAnalysis,
              providerUsed: "none",
              fallbackReason: "llm_api_keys_missing",
              errorStage: "precheck_missing_all_keys",
              rawErrorType: "llm_api_keys_missing",
              reasonCodes: ["ai_review_unavailable"]
            }),
            request_id: requestId
          }
        );
      }

      if (normalizedTaskType === "DI") {
        return res.status(200).json(
          {
            ...buildDIAiFallbackResult({
              transcript: safeTranscript,
              questionMeta: diQuestionMeta,
              audioSignals: diAudioSignals,
              providerUsed: "none",
              fallbackReason: "llm_api_keys_missing",
              errorStage: "precheck_missing_all_keys",
              rawErrorType: "llm_api_keys_missing",
              reasonCode: "llm_api_keys_missing"
            }),
            request_id: requestId
          }
        );
      }

      if (normalizedTaskType === "RA") {
        return res.status(500).json({
          error: "missing_api_key",
          message: "AI scoring is temporarily unavailable. Please retry.",
          is_fallback: true,
          error_stage: "precheck_missing_all_keys",
          raw_error_type: "llm_api_keys_missing",
          provider_used: null,
          last_provider_attempted: null,
          fallback_reason: "llm_api_keys_missing",
          provider_attempts: [],
          request_id: requestId
        });
      }

      return res.status(500).json({
        error: "missing_api_key",
        scores: { pronunciation: 60, fluency: 60, content: 60 },
        feedback: "AI service is not configured yet.",
        overall: 60,
        request_id: requestId
      });
    }

    const prompt = buildPrompt(
      normalizedTaskType,
      safeTranscript,
      safeQuestionContent,
      weFormAnalysis,
      {
        diQuestionMeta,
        diAudioSignals,
        questionMeta: rtsQuestionMeta,
        audioSignals: rtsAudioSignals
      }
    );
    const llmResult = await generateScoreTextWithFallback({
      prompt,
      taskType: normalizedTaskType,
      structuredOutput: getStructuredOutputConfig(normalizedTaskType)
    });
    const latency = normalizeLatency(llmResult?.latency);
    const providerAttempts = normalizeProviderAttempts(llmResult?.provider_attempts);

    let parsedPayload;
    try {
      parsedPayload = parseModelJson(llmResult?.raw_text, { taskType: normalizedTaskType });
    } catch (error) {
      error.error_stage = "response_parse";
      error.provider_used = llmResult?.provider_used || null;
      error.last_provider_attempted = llmResult?.last_provider_attempted || llmResult?.provider_used || null;
      error.fallback_reason = llmResult?.fallback_reason ?? null;
      error.raw_error_type = error?.raw_error_type || "model_json_parse_failed";
      error.provider_attempts = providerAttempts;
      error.latency = latency;
      throw error;
    }

    let parsed;
    try {
      parsed = normalizeResult(parsedPayload, {
        taskType: normalizedTaskType,
        transcript: safeTranscript,
        questionContent: safeQuestionContent,
        weFormAnalysis,
        diQuestionMeta,
        diAudioSignals,
        rtsQuestionMeta,
        rtsAudioSignals,
        providerUsed: resolveSuccessfulProviderUsed(normalizedTaskType, llmResult),
        fallbackReason: llmResult?.fallback_reason ?? null
      });
    } catch (error) {
      error.error_stage = "response_normalize";
      error.provider_used = llmResult?.provider_used || null;
      error.last_provider_attempted = llmResult?.last_provider_attempted || llmResult?.provider_used || null;
      error.fallback_reason = llmResult?.fallback_reason ?? null;
      error.raw_error_type = error?.raw_error_type || "score_normalize_failed";
      error.provider_attempts = providerAttempts;
      error.latency = latency;
      throw error;
    }

    const responsePayload = {
      ...parsed,
      provider_used: llmResult?.provider_used || "gemini",
      fallback_reason: llmResult?.fallback_reason ?? null,
      request_id: requestId
    };

    logScoreEvent("score_success", {
      request_id: requestId,
      task_type: normalizedTaskType,
      provider_used: responsePayload.provider_used,
      fallback_reason: responsePayload.fallback_reason,
      raw_error_type: llmResult?.raw_error_type || null,
      error_stage: "",
      response_status: 200,
      provider_attempts: providerAttempts,
      latency_total_ms: latency.total_ms,
      latency_primary_ms: latency.primary_ms,
      latency_fallback_ms: latency.fallback_ms
    });

    return res.json(responsePayload);
  } catch (error) {
    const latency = normalizeLatency(error?.latency);
    const providerUsed = resolveFailedProviderUsed(error);
    const rawErrorType = error?.raw_error_type || "ai_error_unknown";
    const fallbackReason = normalizeFallbackReason(
      error?.fallback_reason,
      rawErrorType,
      normalizedTaskType
    );
    const errorStage = error?.error_stage || "provider_call";
    const providerAttempts = normalizeProviderAttempts(error?.provider_attempts);
    const lastProviderAttempted = resolveLastProviderAttempted(error, providerAttempts);
    const fallbackErrorType = `${error?.fallback_error_type || ""}`.trim() || null;

    logScoreEvent("score_failed", {
      request_id: requestId,
      task_type: normalizedTaskType,
      provider_used: providerUsed,
      last_provider_attempted: lastProviderAttempted,
      fallback_reason: fallbackReason,
      fallback_error_type: fallbackErrorType,
      raw_error_type: rawErrorType,
      error_stage: errorStage,
      response_status: (normalizedTaskType === "WE" || normalizedTaskType === "RTS" || normalizedTaskType === "DI") ? 200 : 500,
      provider_attempts: providerAttempts,
      latency_total_ms: latency.total_ms,
      latency_primary_ms: latency.primary_ms,
      latency_fallback_ms: latency.fallback_ms
    });

    if (normalizedTaskType === "WE") {
      return res.status(200).json(
        {
          ...buildWEAiFallbackResult({
            formAnalysis: weFormAnalysis,
            providerUsed,
            fallbackReason,
            errorStage,
            rawErrorType,
            reasonCodes: ["ai_review_unavailable"]
          }),
          request_id: requestId
        }
      );
    }

    if (normalizedTaskType === "RTS") {
      return res.status(200).json(
        {
          ...buildRTSAiFallbackResult({
            transcript: safeTranscript,
            questionContent: safeQuestionContent,
            questionMeta: rtsQuestionMeta,
            audioSignals: rtsAudioSignals,
            providerUsed,
            fallbackReason,
            errorStage,
            rawErrorType,
            reasonCodes: ["ai_review_unavailable"]
          }),
          request_id: requestId
        }
      );
    }

    if (normalizedTaskType === "DI") {
      return res.status(200).json(
        {
          ...buildDIAiFallbackResult({
            transcript: safeTranscript,
            questionMeta: diQuestionMeta,
            audioSignals: diAudioSignals,
            providerUsed,
            fallbackReason,
            errorStage,
            rawErrorType,
            reasonCode: fallbackReason
          }),
          request_id: requestId
        }
      );
    }

    return res.status(500).json({
      error: "ai_error",
      message: "AI scoring is temporarily unavailable. Please retry.",
      is_fallback: true,
      error_stage: errorStage,
      raw_error_type: rawErrorType,
      provider_used: providerUsed,
      last_provider_attempted: lastProviderAttempted,
      fallback_reason: fallbackReason,
      fallback_error_type: fallbackErrorType,
      provider_attempts: providerAttempts,
      request_id: requestId
    });
  }
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function createRequestId(req) {
  const existingId = `${req.headers?.["x-request-id"] || ""}`.trim();
  if (existingId) return existingId;
  return `score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTaskRequestId(req, taskType, fallbackId) {
  const existingHeader = `${req.headers?.["x-request-id"] || ""}`.trim();
  if (existingHeader) return normalizeRequestIdForTask(existingHeader, taskType);
  const existingBody = `${req.body?.request_id || ""}`.trim();
  if (existingBody) return normalizeRequestIdForTask(existingBody, taskType);
  const prefix = normalizeTaskType(taskType).toLowerCase() || "score";
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRequestIdForTask(requestId, taskType) {
  const normalized = `${requestId || ""}`.trim();
  if (!normalized) return normalized;
  const taskPrefix = normalizeTaskType(taskType).toLowerCase();
  if (!taskPrefix) return normalized;
  const knownTaskPrefix = /^(ra|we|rts|di)_/i;
  if (!knownTaskPrefix.test(normalized)) return normalized;
  return normalized.replace(knownTaskPrefix, `${taskPrefix}_`);
}

function normalizeLatency(latency) {
  return {
    total_ms: Math.max(0, Math.round(Number(latency?.total_ms || 0))),
    primary_ms: Math.max(0, Math.round(Number(latency?.primary_ms || 0))),
    fallback_ms: Math.max(0, Math.round(Number(latency?.fallback_ms || 0)))
  };
}

function logScoreEvent(event, payload) {
  const entry = {
    event,
    ...payload
  };
  if (event === "score_failed") {
    console.error("[score:llm]", entry);
    return;
  }
  console.info("[score:llm]", entry);
}

function resolveFailedProviderUsed(error) {
  if (Object.prototype.hasOwnProperty.call(error || {}, "provider_used")) {
    return error.provider_used || null;
  }
  return `${error?.provider || ""}`.trim() || null;
}

function resolveSuccessfulProviderUsed(taskType, llmResult) {
  const providerUsed = `${llmResult?.provider_used || ""}`.trim();
  if (providerUsed) return providerUsed;
  return taskType === "RA" ? null : "gemini";
}

function resolveLastProviderAttempted(error, providerAttempts = []) {
  const explicit = `${error?.last_provider_attempted || ""}`.trim();
  if (explicit) return explicit;
  const lastAttempt = Array.isArray(providerAttempts) && providerAttempts.length
    ? providerAttempts[providerAttempts.length - 1]
    : null;
  return `${lastAttempt?.provider || error?.provider || ""}`.trim() || null;
}

function normalizeTaskType(taskType) {
  if (typeof taskType !== "string") return "RA";
  const normalized = taskType.trim().toUpperCase();
  return normalized || "RA";
}

function normalizeRTSQuestionMeta(rawValue) {
  const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue
    : {};
  return {
    topic: `${source?.topic || ""}`.trim(),
    tone: `${source?.tone || ""}`.trim(),
    role: `${source?.role || ""}`.trim(),
    directions_head: `${source?.directions_head || source?.directionsHead || ""}`.trim()
  };
}

function normalizeDIQuestionMeta(rawValue) {
  const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue
    : {};
  return {
    question_id: `${source?.question_id || source?.questionId || ""}`.trim(),
    title: `${source?.title || source?.topic || ""}`.trim(),
    question_content: `${source?.question_content || source?.questionContent || ""}`.trim(),
    image_type: `${source?.image_type || source?.imageType || ""}`.trim().toLowerCase(),
    metadata_quality: `${source?.metadata_quality || source?.metadataQuality || ""}`.trim().toLowerCase(),
    key_points: Array.isArray(source?.key_points)
      ? source.key_points.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 6)
      : [],
    key_terms: Array.isArray(source?.key_terms)
      ? source.key_terms.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 8)
      : [],
    key_elements: Array.isArray(source?.key_elements)
      ? source.key_elements.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 6)
      : [],
    relations: Array.isArray(source?.relations)
      ? source.relations.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 6)
      : [],
    implications_or_conclusion: Array.isArray(source?.implications_or_conclusion)
      ? source.implications_or_conclusion.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 4)
      : [],
    numbers_or_extremes: Array.isArray(source?.numbers_or_extremes)
      ? source.numbers_or_extremes.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 6)
      : [],
    sequence_or_trend: Array.isArray(source?.sequence_or_trend)
      ? source.sequence_or_trend.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 5)
      : [],
    comparison_axes: Array.isArray(source?.comparison_axes)
      ? source.comparison_axes.map((item) => `${item || ""}`.trim()).filter(Boolean).slice(0, 5)
      : [],
    visual_features: {
      has_trend: Boolean(source?.visual_features?.has_trend ?? source?.visualFeatures?.hasTrend),
      has_comparison: Boolean(source?.visual_features?.has_comparison ?? source?.visualFeatures?.hasComparison),
      has_extreme: Boolean(source?.visual_features?.has_extreme ?? source?.visualFeatures?.hasExtreme),
      has_numbers: Boolean(source?.visual_features?.has_numbers ?? source?.visualFeatures?.hasNumbers)
    }
  };
}

function normalizeDIAudioSignals(rawValue) {
  const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue
    : {};
  const hasUsableAudioRaw = source?.has_usable_audio ?? source?.hasUsableAudio;
  const playbackUsableRaw = source?.playback_usable ?? source?.playbackUsable;
  const durationSec = Math.max(0, Math.round(Number(source?.duration_sec ?? source?.durationSec ?? 0)));
  const transcriptWordCount = Math.max(
    0,
    Math.round(Number(source?.transcript_word_count ?? source?.transcriptWordCount ?? 0))
  );
  return {
    duration_sec: durationSec,
    duration_ms: Math.max(0, Math.round(Number(source?.duration_ms ?? source?.durationMs ?? 0))),
    non_silent_frame_ratio: Math.max(
      0,
      Math.min(1, Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0))
    ),
    silence_frame_ratio: Math.max(
      0,
      Math.min(
        1,
        Number(
          source?.silence_frame_ratio
          ?? source?.silenceFrameRatio
          ?? (1 - Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0))
        )
      )
    ),
    peak_amplitude: Math.max(0, Math.min(1, Number(source?.peak_amplitude ?? source?.peakAmplitude ?? 0))),
    rms_amplitude: Math.max(0, Math.min(1, Number(source?.rms_amplitude ?? source?.rmsAmplitude ?? 0))),
    mean_abs_amplitude: Math.max(0, Math.min(1, Number(source?.mean_abs_amplitude ?? source?.meanAbsAmplitude ?? 0))),
    amplitude_dynamic_range: Math.max(
      0,
      Math.min(1, Number(source?.amplitude_dynamic_range ?? source?.amplitudeDynamicRange ?? 0))
    ),
    transcript_word_count: transcriptWordCount,
    speech_rate_wps: Math.max(
      0,
      Math.min(
        8,
        Number(
          source?.speech_rate_wps
          ?? source?.speechRateWps
          ?? (durationSec > 0 ? transcriptWordCount / Math.max(durationSec, 1) : 0)
        )
      )
    ),
    sample_rate: Math.max(0, Math.round(Number(source?.sample_rate ?? source?.sampleRate ?? 0))),
    channel_count: Math.max(0, Math.round(Number(source?.channel_count ?? source?.channelCount ?? 0))),
    final_usable_reason: `${source?.final_usable_reason || source?.finalUsableReason || ""}`.trim(),
    has_usable_audio: hasUsableAudioRaw == null ? true : Boolean(hasUsableAudioRaw),
    playback_usable: playbackUsableRaw == null ? true : Boolean(playbackUsableRaw)
  };
}

function resolveDIPrecheckReasonCode({ questionMeta = null, audioSignals = null } = {}) {
  if (audioSignals?.has_usable_audio === false || audioSignals?.playback_usable === false) {
    return "audio_not_usable";
  }

  const hasTitle = Boolean(`${questionMeta?.title || ""}`.trim());
  const hasQuestionContent = Boolean(`${questionMeta?.question_content || ""}`.trim());
  const hasImageType = Boolean(`${questionMeta?.image_type || ""}`.trim());
  const keyPointCount = Array.isArray(questionMeta?.key_points) ? questionMeta.key_points.filter(Boolean).length : 0;
  const keyTermCount = Array.isArray(questionMeta?.key_terms) ? questionMeta.key_terms.filter(Boolean).length : 0;
  const keyElementCount = Array.isArray(questionMeta?.key_elements) ? questionMeta.key_elements.filter(Boolean).length : 0;
  const relationCount = Array.isArray(questionMeta?.relations) ? questionMeta.relations.filter(Boolean).length : 0;
  const implicationCount = Array.isArray(questionMeta?.implications_or_conclusion)
    ? questionMeta.implications_or_conclusion.filter(Boolean).length
    : 0;
  const numbersCount = Array.isArray(questionMeta?.numbers_or_extremes)
    ? questionMeta.numbers_or_extremes.filter(Boolean).length
    : 0;
  const sequenceCount = Array.isArray(questionMeta?.sequence_or_trend)
    ? questionMeta.sequence_or_trend.filter(Boolean).length
    : 0;
  const comparisonAxisCount = Array.isArray(questionMeta?.comparison_axes)
    ? questionMeta.comparison_axes.filter(Boolean).length
    : 0;
  const hasVisualFeatures = Boolean(
    questionMeta?.visual_features?.has_trend
    || questionMeta?.visual_features?.has_comparison
    || questionMeta?.visual_features?.has_extreme
    || questionMeta?.visual_features?.has_numbers
  );

  if (
    !hasTitle
    && !hasQuestionContent
    && !hasImageType
    && keyPointCount === 0
    && keyTermCount === 0
    && keyElementCount === 0
    && relationCount === 0
    && implicationCount === 0
    && numbersCount === 0
    && sequenceCount === 0
    && comparisonAxisCount === 0
    && !hasVisualFeatures
  ) {
    return "metadata_insufficient";
  }

  const metadataQuality = `${questionMeta?.metadata_quality || ""}`.trim().toLowerCase();
  if (
    metadataQuality === "limited"
    && !hasTitle
    && !hasQuestionContent
    && keyPointCount === 0
    && keyTermCount < 2
    && keyElementCount === 0
    && relationCount === 0
    && implicationCount === 0
    && numbersCount === 0
    && sequenceCount === 0
    && comparisonAxisCount === 0
    && !hasVisualFeatures
  ) {
    return "metadata_insufficient";
  }

  return "";
}

function normalizeRTSAudioSignals(rawValue) {
  const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue
    : {};
  const hasUsableAudioRaw = source?.has_usable_audio ?? source?.hasUsableAudio;
  const playbackUsableRaw = source?.playback_usable ?? source?.playbackUsable;
  return {
    duration_sec: Math.max(0, Math.round(Number(source?.duration_sec ?? source?.durationSec ?? 0))),
    duration_ms: Math.max(0, Math.round(Number(source?.duration_ms ?? source?.durationMs ?? 0))),
    non_silent_frame_ratio: Math.max(
      0,
      Math.min(1, Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0))
    ),
    silence_warning: Boolean(source?.silence_warning ?? source?.silenceWarning),
    final_usable_reason: `${source?.final_usable_reason || source?.finalUsableReason || ""}`.trim(),
    has_usable_audio: hasUsableAudioRaw == null ? true : Boolean(hasUsableAudioRaw),
    playback_usable: playbackUsableRaw == null ? true : Boolean(playbackUsableRaw)
  };
}

function hasConfiguredGeminiApiKey() {
  const apiKey = `${process.env.GEMINI_API_KEY || ""}`.trim();
  return Boolean(apiKey && apiKey !== "YOUR_GEMINI_API_KEY");
}

function hasConfiguredScoringOpenAIApiKey() {
  return Boolean(getScoringOpenAICompatibleApiKeyFromEnv());
}

function hasConfiguredGroqApiKey() {
  return Boolean(getGroqApiKeyFromEnv());
}

function normalizeFallbackReason(fallbackReason, rawErrorType, taskType = "") {
  if (taskType === "DI") {
    return normalizeDIFallbackReasonCode(fallbackReason, rawErrorType);
  }
  if (taskType === "RTS") {
    return normalizeRTSFallbackReasonCode(fallbackReason, rawErrorType);
  }
  const reason = `${fallbackReason || rawErrorType || ""}`.trim();
  return reason || null;
}

function normalizeProviderAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts
    .map((item) => ({
      provider: `${item?.provider || ""}`.trim(),
      stage: `${item?.stage || ""}`.trim(),
      started_at: `${item?.started_at || ""}`.trim(),
      ended_at: `${item?.ended_at || ""}`.trim(),
      duration_ms: Math.max(0, Math.round(Number(item?.duration_ms || 0))),
      timeout_ms: Number.isFinite(Number(item?.timeout_ms)) ? Math.round(Number(item.timeout_ms)) : undefined,
      status: `${item?.status || ""}`.trim(),
      raw_error_type: `${item?.raw_error_type || ""}`.trim(),
      http_status: Number.isFinite(Number(item?.http_status ?? item?.status_code))
        ? Math.round(Number(item?.http_status ?? item?.status_code))
        : undefined,
      model: `${item?.model || ""}`.trim() || undefined,
      sanitized_error_body: item?.sanitized_error_body || undefined
    }))
    .filter((item) => item.provider);
}

function parseModelJson(rawText, options = {}) {
  const cleanText = `${rawText || ""}`.replace(/```json|```/gi, "").trim();
  const strictPayload = tryParseJsonObject(cleanText);
  if (strictPayload) return strictPayload;

  if (options?.taskType !== "RA") {
    throw new Error("Invalid JSON from model");
  }

  return parseRALoosePayload(cleanText);
}

function tryParseJsonObject(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return tryParseRepairedJson(text.slice(start, end + 1));
  }
}

function tryParseRepairedJson(text) {
  const repaired = `${text || ""}`
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  if (!repaired) return null;
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

function parseRALoosePayload(text) {
  const pronunciation = extractNumberByKeys(text, ["pronunciation"]);
  const fluency = extractNumberByKeys(text, ["fluency"]);
  const content = extractNumberByKeys(text, ["content"]);
  const responseType = normalizeRAResponseType(extractStringByKeys(text, ["responseType", "response_type", "type"]));
  const feedback = extractStringByKeys(text, ["feedback", "comment"]);

  return {
    responseType: responseType || "invalid_response",
    scores: {
      pronunciation,
      fluency,
      content
    },
    feedback: feedback || ""
  };
}

function extractNumberByKeys(text, keys) {
  for (const key of keys) {
    const withQuotes = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const plain = new RegExp(`${key}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const quotedMatch = text.match(withQuotes);
    if (quotedMatch?.[1]) return Number(quotedMatch[1]);
    const plainMatch = text.match(plain);
    if (plainMatch?.[1]) return Number(plainMatch[1]);
  }
  return undefined;
}

function extractStringByKeys(text, keys) {
  for (const key of keys) {
    const quotedPattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
    const plainPattern = new RegExp(`${key}\\s*[:=]\\s*([a-zA-Z_\\-]+)`, "i");
    const quotedMatch = text.match(quotedPattern);
    if (quotedMatch?.[1]) return quotedMatch[1].trim();
    const plainMatch = text.match(plainPattern);
    if (plainMatch?.[1]) return plainMatch[1].trim();
  }
  return "";
}

function normalizeResult(payload, options = {}) {
  if (options?.taskType === "RA") {
    return finalizeRAScore(payload, options);
  }

  if (options?.taskType === "WE") {
    return finalizeWEScorePayload(payload, {
      formAnalysis: options?.weFormAnalysis,
      providerUsed: options?.providerUsed || "gemini",
      fallbackReason: options?.fallbackReason ?? null
    });
  }

  if (options?.taskType === "RTS") {
    return finalizeRTSScorePayload(payload, {
      transcript: options?.transcript || "",
      questionContent: options?.questionContent || "",
      questionMeta: options?.rtsQuestionMeta || null,
      audioSignals: options?.rtsAudioSignals || null,
      providerUsed: options?.providerUsed || "gemini",
      fallbackReason: options?.fallbackReason ?? null
    });
  }

  if (options?.taskType === "DI") {
    return finalizeDIScorePayload(payload, {
      transcript: options?.transcript || "",
      questionMeta: options?.diQuestionMeta || null,
      audioSignals: options?.diAudioSignals || null,
      providerUsed: options?.providerUsed || "gemini",
      fallbackReason: options?.fallbackReason ?? null
    });
  }

  const pronunciation = clampScore(payload?.scores?.pronunciation);
  const fluency = clampScore(payload?.scores?.fluency);
  const content = clampScore(payload?.scores?.content);
  const feedback = typeof payload?.feedback === "string"
    ? payload.feedback.trim()
    : "Practice completed. Keep the momentum.";
  const overallRaw = Number(payload?.overall);
  const overall = Number.isFinite(overallRaw)
    ? Math.max(0, Math.min(100, Math.round(overallRaw)))
    : Math.round((pronunciation + fluency + content) / 3);
  const keywords = Array.isArray(payload?.keywords)
    ? payload.keywords
        .map((item) => ({
          word: typeof item?.word === "string" ? item.word : "",
          hit: Boolean(item?.hit)
        }))
        .filter((item) => item.word)
    : [];

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords,
    feedback,
    overall
  };
}

function finalizeRAScore(payload, context = {}) {
  const responseType = normalizeRAResponseType(
    payload?.responseType || payload?.response_type || payload?.transcriptQuality || payload?.resultType
  );
  const rawPronunciation = pickRAScore(payload, "pronunciation");
  const rawFluency = pickRAScore(payload, "fluency");
  const rawContent = pickRAScore(payload, "content");
  const invalidCheck = checkInvalidRAResponse({
    responseType
  });

  if (invalidCheck.isInvalid) {
    return buildRAInvalidResult(payload, invalidCheck.responseType);
  }

  const overlap = calculateWordOverlap(context?.transcript, context?.questionContent);
  const pronunciation = clampRASubScore(rawPronunciation);
  const fluency = clampRASubScore(rawFluency);
  let content = clampRASubScore(rawContent);
  if (overlap.uniqueMatchedCount >= RA_CONTENT_MATCH_WORD_THRESHOLD) {
    content = Math.max(content, RA_CONTENT_MATCH_FLOOR_SCORE);
  }
  const weightedOverall =
    pronunciation * RA_WEIGHTS.pronunciation + fluency * RA_WEIGHTS.fluency + content * RA_WEIGHTS.content;
  const overall = clampRAOverall(weightedOverall);
  const feedback = normalizeFeedback(payload?.feedback, "Keep practicing pacing and stress patterns for steadier delivery.");

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords: [],
    feedback,
    overall,
    responseType: responseType || "valid_reading"
  };
}

function pickRAScore(payload, key) {
  const score = payload?.scores?.[key] ?? payload?.[key];
  return Number(score);
}

function checkInvalidRAResponse({ responseType }) {
  if (RA_FORCE_BASELINE_RESPONSE_TYPES.has(responseType)) {
    return { isInvalid: true, responseType };
  }

  return { isInvalid: false, responseType: responseType || "valid_reading" };
}

function calculateWordOverlap(transcript, referenceText) {
  const transcriptTokens = tokenizeForOverlap(transcript);
  const referenceTokens = tokenizeForOverlap(referenceText);

  if (!referenceTokens.length) {
    return { hasReference: false, matchedCount: 0, uniqueMatchedCount: 0 };
  }

  const referenceSet = new Set(referenceTokens);
  const matchedWords = new Set();
  let matchedCount = 0;
  for (const token of transcriptTokens) {
    if (referenceSet.has(token)) {
      matchedCount += 1;
      matchedWords.add(token);
    }
  }

  return {
    hasReference: true,
    matchedCount,
    uniqueMatchedCount: matchedWords.size
  };
}

function tokenizeForOverlap(text) {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildRAInvalidResult(payload, responseType) {
  const feedback = normalizeFeedback(payload?.feedback, "No valid reading was detected this time, so a baseline score was used.");

  return {
    scores: {
      pronunciation: RA_MIN_SCORE,
      fluency: RA_MIN_SCORE,
      content: RA_MIN_SCORE
    },
    keywords: [],
    feedback,
    overall: RA_MIN_SCORE,
    responseType: responseType || "invalid_response"
  };
}

function normalizeRAResponseType(value) {
  const normalized = `${value || ""}`.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "";
  if (normalized.includes("silence") || normalized.includes("no_speech")) return "silence";
  if (normalized.includes("too_short") || normalized.includes("short")) return "too_short";
  if (normalized.includes("gibber")) return "gibberish";
  if (normalized.includes("off") && normalized.includes("topic")) return "off_topic";
  if (normalized.includes("noise")) return "noise_only";
  if (normalized.includes("valid")) return "valid_reading";
  if (normalized === "random" || normalized === "invalid") return "invalid_response";
  return normalized;
}

function clampRASubScore(value) {
  if (!Number.isFinite(value)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(value)));
}

function clampRAOverall(value) {
  if (!Number.isFinite(value)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(value)));
}

function normalizeFeedback(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(90, Math.round(num)));
}

function getStructuredOutputConfig(taskType) {
  if (taskType === "RTS") {
    return {
      responseMimeType: "application/json",
      responseJsonSchema: buildRTSResponseJsonSchema()
    };
  }
  if (taskType === "DI") {
    return {
      responseMimeType: "application/json",
      responseJsonSchema: buildDIResponseJsonSchema()
    };
  }
  return null;
}

function buildPrompt(taskType, transcript, questionContent, weFormAnalysis, options = {}) {
  const question = questionContent || "";

  if (taskType === "WE") {
    return buildWEPrompt({
      essayText: transcript,
      questionContent: questionContent || "",
      formAnalysis: weFormAnalysis || analyzeWEEssayForm(transcript)
    });
  }

  if (taskType === "RTS") {
    return buildRTSPrompt({
      transcript,
      questionContent: question,
      questionMeta: options?.questionMeta || null,
      audioSignals: options?.audioSignals || null
    });
  }

  if (taskType === "DI") {
    return buildDIPrompt({
      transcript,
      questionContent: question,
      questionMeta: options?.diQuestionMeta || null,
      audioSignals: options?.diAudioSignals || null
    });
  }

  const prompts = {
    RA: `
You are a PTE Academic examiner evaluating ONLY a Read Aloud response.

Original passage:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Task:
1) First classify responseType as one of:
- valid_reading
- silence
- too_short
- gibberish
- off_topic
- noise_only

2) Then score ONLY these 3 dimensions (10-90 scale):
- pronunciation: clarity and accuracy of individual sounds
- fluency: pace, rhythm, and smooth delivery
- content: coverage and correctness of the original passage

Rules:
- If responseType is silence / noise_only, set all 3 scores to 10.
- For too_short / gibberish / off_topic, keep normal scoring based on recognized useful content.
- If 10 or more valid words clearly match the original passage, set content to at least 45.
- Even for valid_reading, do not return any score below 10.
- Feedback must be in Chinese, warm coach tone, 2-3 sentences, with one actionable tip.
- Output JSON only, no markdown, no extra text.

Respond ONLY with this JSON shape:
{
  "responseType": "<valid_reading|silence|too_short|gibberish|off_topic|noise_only>",
  "scores": {
    "pronunciation": <number 10-90>,
    "fluency": <number 10-90>,
    "content": <number 10-90>
  },
  "feedback": "<Chinese feedback>",
  "overall": <number 10-90>
}`,

    RS: `
You are a PTE Academic examiner evaluating a Repeat Sentence response.

Original sentence:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate keyword coverage: compare what the student said against the original sentence.
Identify which important content words (nouns, verbs, adjectives) were:
- hit: present in student's response
- missed: not present in student's response

Score overall as a percentage of keywords covered (0-100).

Rules:
- Feedback in Chinese, warm coach tone
- Never use harsh negative words like "太差", "错误很多", "不行"
- Instead say things like "这次已经抓住关键词了，下次把句尾补完整会更稳。"

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "keywords": [
    { "word": "<keyword>", "hit": <true or false> }
  ],
  "feedback": "<Chinese feedback, warm tone, 2 sentences>",
  "overall": <keyword coverage percentage 0-100>
}`,

    RL: `
You are a PTE Academic examiner evaluating a Re-tell Lecture response.

Lecture content / topic hint:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate:
- content: key points coverage (did they mention the main topic and at least 2 points?)
- pronunciation: clarity
- fluency: natural delivery

Rules:
- Feedback in Chinese, warm coach tone
- Encourage use of template: "The lecture mainly discusses... The speaker mentions... In conclusion..."
- Never use negative words

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 2-3 sentences, mention specific points they did well>",
  "overall": <average of three scores>
}`,

    WFD: `
You are a PTE Academic examiner evaluating a Write From Dictation response.

Original sentence:
"${question}"

Student input:
"${transcript}"

Evaluate:
- content: exact word match coverage
- pronunciation: use 0 for WFD
- fluency: use 0 for WFD

Rules:
- Feedback in Chinese, warm coach tone
- Focus on spelling, function words, and missing words
- Never use harsh negative words like "太差", "错误很多", "不行"

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": 0,
    "fluency": 0,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 1-2 sentences>",
  "overall": <number 0-100>
}`
  };

  return prompts[taskType] || prompts.RA;
}




