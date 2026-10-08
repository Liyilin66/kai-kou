import { getApiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export const RTS_SCORE_STATUS_PENDING = "pending";
export const RTS_SCORE_STATUS_SCORED = "scored";
export const RTS_SCORE_STATUS_RULE_GATED = "rule_gated";
export const RTS_SCORE_STATUS_DEGRADED = "ai_review_degraded";

export const RTS_AI_REVIEW_JOB_PENDING = "pending";
export const RTS_AI_REVIEW_JOB_RUNNING = "running";
export const RTS_AI_REVIEW_JOB_COMPLETED = "completed";
export const RTS_AI_REVIEW_JOB_FAILED = "failed";

export const RTS_CONTENT_RAW_MAX = 3;
export const RTS_PRONUNCIATION_RAW_MAX = 5;
export const RTS_FLUENCY_RAW_MAX = 5;
export const RTS_DISPLAY_MIN_SCORE = 10;
export const RTS_DISPLAY_MAX_SCORE = 90;
const RTS_CONTENT_BASE_FLOOR = 45;
const RTS_CONTENT_MEDIUM_COVERAGE_FLOOR = 65;
const RTS_CONTENT_HIGH_COVERAGE_FLOOR = 70;
const RTS_CONTENT_VERY_HIGH_COVERAGE_FLOOR = 78;
const RTS_CONTENT_WEAK_RELATED_MIN = 30;
const RTS_CONTENT_WEAK_RELATED_MAX = 44;
const RTS_CONTENT_OFF_TOPIC_MAX = 30;
const RTS_FLUENCY_PASS_LINE = 70;
const RTS_OVERALL_FLUENCY_PASS_FLOOR = 65;
const RTS_SCORE_API_TIMEOUT_MS = 15000;
const RTS_AI_REVIEW_STALL_THRESHOLD_MS = 90000;

const RTS_RELEVANCE_ENTITY_HINTS = new Set([
  "professor",
  "teacher",
  "friend",
  "classmate",
  "librarian",
  "roommate",
  "staff",
  "lecturer",
  "tutor",
  "manager",
  "colleague",
  "supervisor",
  "coach",
  "boss"
]);

const RTS_RELEVANCE_EVENT_HINTS = new Set([
  "email",
  "assignment",
  "assignments",
  "homework",
  "address",
  "wrong",
  "class",
  "classes",
  "late",
  "borrow",
  "notes",
  "broken",
  "computer",
  "noisy",
  "noise",
  "party",
  "missed",
  "missing",
  "lost",
  "notebook",
  "deadline",
  "extension",
  "resend",
  "submit"
]);

const RTS_RELEVANCE_ACTION_HINTS = new Set([
  "apology",
  "apologize",
  "apologise",
  "explain",
  "ask",
  "request",
  "help",
  "suggest",
  "advice",
  "advise",
  "recommend",
  "report",
  "extension",
  "resend",
  "borrow",
  "lend"
]);

const RTS_TEMPLATE_NOISE_TOKENS = new Set([
  "hello",
  "excuse",
  "minute",
  "thank",
  "thanks",
  "understanding",
  "bother",
  "hope",
  "helps",
  "talk",
  "calling",
  "lot"
]);

const RTS_TEMPLATE_NOISE_PHRASES = [
  "hello",
  "excuse me",
  "do you have a minute",
  "i am calling because",
  "i'm calling because",
  "thank you",
  "thank you for understanding",
  "i am sorry to bother you",
  "i'm sorry to bother you",
  "i hope this helps",
  "could i talk to you for a minute",
  "thanks a lot"
];

export const RTS_SCORE_REASON_MESSAGE_MAP = {
  appropriacy_zero_off_topic: "回答内容与题目场景不匹配。",
  appropriacy_zero_goal_not_met: "回答没有完成题目要求的回应目标。",
  appropriacy_zero_template_like: "表达有些模板化，建议补充更具体的场景细节。",
  appropriacy_zero_context_incoherent: "语境不够清晰，影响理解。",
  appropriacy_zero_register_mismatch: "语气可再调整，但主要先保证关键信息完整。",
  appropriacy_zero_too_short: "回答过短，关键信息不足。",
  transcript_empty: "未识别到有效转写文本。",
  audio_not_usable: "录音可用性不足，无法稳定评阅。",
  ai_review_unavailable: "AI评阅服务暂时不可用。",
  ai_review_timeout: "AI评阅超时，已返回降级估分结果。",
  ai_review_parse_failed: "AI评阅结果解析失败，已返回降级估分结果。",
  ai_review_provider_error: "AI评阅服务异常，已返回降级估分结果。",
  llm_api_keys_missing: "AI评阅服务尚未完成配置。",
  auth_session_missing: "登录状态缺失，请重新登录后重试。",
  auth_session_expired: "登录状态已过期，请重新登录后重试。",
  practice_logs_update_failed: "评分结果写回失败，请稍后重试。"
};

const inflightRTSReviewMap = new Map();

export function normalizeTextValue(value) {
  return `${value || ""}`.trim();
}

export function toObjectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeTextValue(item)).filter(Boolean);
}

export function parseRTSScoreJson(value) {
  if (typeof value === "string") {
    try {
      return toObjectValue(JSON.parse(value)) || {};
    } catch {
      return {};
    }
  }
  return toObjectValue(value) || {};
}

export function normalizeRTSReviewStatus(value) {
  const normalized = normalizeTextValue(value).toLowerCase();
  if (normalized === RTS_SCORE_STATUS_SCORED) return RTS_SCORE_STATUS_SCORED;
  if (normalized === RTS_SCORE_STATUS_RULE_GATED) return RTS_SCORE_STATUS_RULE_GATED;
  if (normalized === RTS_SCORE_STATUS_DEGRADED) return RTS_SCORE_STATUS_DEGRADED;
  return RTS_SCORE_STATUS_PENDING;
}

export function getRTSReviewFromScoreJson(scoreJson) {
  return toObjectValue(parseRTSScoreJson(scoreJson)?.ai_review) || null;
}

export function buildRTSQuestionMetaPayload(question) {
  const safeQuestion = toObjectValue(question) || {};
  const firstDirection = Array.isArray(safeQuestion?.key_points?.directions)
    ? safeQuestion.key_points.directions[0]
    : null;
  return {
    topic: normalizeTextValue(safeQuestion?.topic),
    tone: normalizeTextValue(safeQuestion?.key_points?.tone),
    role: normalizeTextValue(safeQuestion?.key_points?.role),
    directions_head: normalizeTextValue(firstDirection?.head)
  };
}

export function normalizeRTSQuestionMeta(rawValue) {
  const source = toObjectValue(rawValue) || {};
  return {
    topic: normalizeTextValue(source?.topic),
    tone: normalizeTextValue(source?.tone),
    role: normalizeTextValue(source?.role),
    directions_head: normalizeTextValue(source?.directions_head || source?.directionsHead)
  };
}

export function buildRTSAudioSignalsPayload(stopResult, durationSec = 0) {
  const safeStopResult = toObjectValue(stopResult) || {};
  return {
    duration_sec: Math.max(0, Math.round(Number(durationSec || 0))),
    duration_ms: Math.max(0, Math.round(Number(safeStopResult?.durationMs || 0))),
    non_silent_frame_ratio: Math.max(0, Math.min(1, Number(safeStopResult?.nonSilentFrameRatio || 0))),
    silence_warning: Boolean(
      safeStopResult?.finalSilenceWarning
      || safeStopResult?.rtsSilentFallback
      || safeStopResult?.blobIssueCode === "RTS_SILENT_FALLBACK"
    ),
    final_usable_reason: normalizeTextValue(safeStopResult?.finalUsableReason),
    has_usable_audio: Boolean(safeStopResult?.hasUsableAudio),
    playback_usable: Boolean(safeStopResult?.finalPlaybackUsable)
  };
}

export function normalizeRTSAudioSignals(rawValue) {
  const source = toObjectValue(rawValue) || {};
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
    final_usable_reason: normalizeTextValue(source?.final_usable_reason || source?.finalUsableReason),
    has_usable_audio: hasUsableAudioRaw == null ? true : Boolean(hasUsableAudioRaw),
    playback_usable: playbackUsableRaw == null ? true : Boolean(playbackUsableRaw)
  };
}

export function normalizeRTSFallbackReason(reason, rawErrorType = "") {
  const normalized = normalizeTextValue(reason || rawErrorType).toLowerCase();
  if (!normalized) return "ai_review_unavailable";
  if (normalized === "transcript_empty") return "transcript_empty";
  if (normalized === "audio_not_usable") return "audio_not_usable";
  if (normalized === "llm_api_keys_missing") return "llm_api_keys_missing";
  if (normalized.includes("auth_session_missing")) return "auth_session_missing";
  if (normalized.includes("auth_session_expired")) return "auth_session_expired";
  if (normalized.includes("practice_logs_update_failed")) return "practice_logs_update_failed";
  if (
    normalized.includes("timeout")
    || normalized.includes("abort")
    || normalized === "rts_score_timeout"
  ) {
    return "ai_review_timeout";
  }
  if (
    normalized.includes("parse")
    || normalized.includes("invalid_json")
    || normalized.includes("invalid json")
    || normalized.includes("normalize")
  ) {
    return "ai_review_parse_failed";
  }
  if (
    normalized.includes("gemini")
    || normalized.includes("groq")
    || normalized.includes("provider")
    || normalized.includes("fetch")
    || normalized.includes("http_")
    || normalized.includes("service")
    || normalized.includes("route_not_found")
  ) {
    return "ai_review_provider_error";
  }
  if (normalized === "ai_review_unavailable") return "ai_review_unavailable";
  return normalized.replace(/[^a-z0-9_]+/g, "_") || "ai_review_unavailable";
}

export function getRTSFallbackReasonMessage(reasonCode) {
  return RTS_SCORE_REASON_MESSAGE_MAP[normalizeRTSFallbackReason(reasonCode)] || RTS_SCORE_REASON_MESSAGE_MAP.ai_review_unavailable;
}

export function getRTSAiReviewJob(scoreJson) {
  const source = toObjectValue(parseRTSScoreJson(scoreJson)?.ai_review_job) || {};
  return {
    status: normalizeRTSAiReviewJobStatus(source?.status),
    request_id: normalizeTextValue(source?.request_id || source?.requestId),
    attempts: Math.max(0, Math.round(Number(source?.attempts || 0))),
    created_at: normalizeTextValue(source?.created_at || source?.createdAt),
    started_at: normalizeTextValue(source?.started_at || source?.startedAt),
    updated_at: normalizeTextValue(source?.updated_at || source?.updatedAt),
    completed_at: normalizeTextValue(source?.completed_at || source?.completedAt),
    final_status: normalizeRTSReviewStatus(source?.final_status || source?.finalStatus),
    fallback_reason: normalizeTextValue(source?.fallback_reason || source?.fallbackReason),
    last_error_code: normalizeTextValue(source?.last_error_code || source?.lastErrorCode),
    last_error_message: normalizeTextValue(source?.last_error_message || source?.lastErrorMessage)
  };
}

export function isRTSAiReviewComplete(aiReview) {
  const status = normalizeRTSReviewStatus(aiReview?.status);
  return (
    status === RTS_SCORE_STATUS_SCORED
    || status === RTS_SCORE_STATUS_RULE_GATED
    || status === RTS_SCORE_STATUS_DEGRADED
  );
}

export function isRTSReviewReadyFromLog(logRow) {
  return isRTSAiReviewComplete(getRTSReviewFromScoreJson(logRow?.score_json));
}

export function shouldRedirectRTSResultToAnalyzing(logRow) {
  if (!logRow) return false;
  if (isRTSReviewReadyFromLog(logRow)) return false;
  if (isRTSReviewJobStalled(logRow)) return false;
  const job = getRTSAiReviewJob(logRow?.score_json);
  return job.status === RTS_AI_REVIEW_JOB_PENDING || job.status === RTS_AI_REVIEW_JOB_RUNNING;
}

export function isRTSReviewJobStalled(
  logRow,
  {
    nowMs = Date.now(),
    thresholdMs = RTS_AI_REVIEW_STALL_THRESHOLD_MS
  } = {}
) {
  if (!logRow) return false;
  const job = getRTSAiReviewJob(logRow?.score_json);
  if (job.status !== RTS_AI_REVIEW_JOB_PENDING && job.status !== RTS_AI_REVIEW_JOB_RUNNING) {
    return false;
  }
  const referenceMs = parseIsoToMs(
    job.updated_at
    || job.started_at
    || job.created_at
    || normalizeTextValue(logRow?.created_at)
  );
  if (!referenceMs) return false;
  return nowMs - referenceMs >= Math.max(1000, Number(thresholdMs || RTS_AI_REVIEW_STALL_THRESHOLD_MS));
}

export function isRTSReviewFailedFromLog(logRow) {
  if (!logRow) return false;
  const job = getRTSAiReviewJob(logRow?.score_json);
  return job.status === RTS_AI_REVIEW_JOB_FAILED;
}

export function createPendingRTSAiReviewJob() {
  const nowIso = new Date().toISOString();
  return {
    status: RTS_AI_REVIEW_JOB_PENDING,
    request_id: "",
    attempts: 0,
    created_at: nowIso,
    started_at: "",
    updated_at: nowIso,
    completed_at: "",
    final_status: RTS_SCORE_STATUS_PENDING,
    fallback_reason: "",
    last_error_code: "",
    last_error_message: ""
  };
}

export function buildRTSAiReviewJobState({
  previousJob = null,
  status = RTS_AI_REVIEW_JOB_PENDING,
  requestId = "",
  finalStatus = RTS_SCORE_STATUS_PENDING,
  fallbackReason = "",
  lastErrorCode = "",
  lastErrorMessage = ""
} = {}) {
  const previous = toObjectValue(previousJob) || {};
  const nowIso = new Date().toISOString();
  const normalizedStatus = normalizeRTSAiReviewJobStatus(status);
  const attempts = normalizedStatus === RTS_AI_REVIEW_JOB_RUNNING
    ? Math.max(0, Math.round(Number(previous?.attempts || 0))) + 1
    : Math.max(0, Math.round(Number(previous?.attempts || 0)));
  const isTerminalStatus = normalizedStatus === RTS_AI_REVIEW_JOB_COMPLETED || normalizedStatus === RTS_AI_REVIEW_JOB_FAILED;
  return {
    status: normalizedStatus,
    request_id: normalizeTextValue(requestId || previous?.request_id || previous?.requestId),
    attempts,
    created_at: normalizeTextValue(previous?.created_at || previous?.createdAt) || nowIso,
    started_at: normalizedStatus === RTS_AI_REVIEW_JOB_RUNNING
      ? (normalizeTextValue(previous?.started_at || previous?.startedAt) || nowIso)
      : normalizeTextValue(previous?.started_at || previous?.startedAt),
    updated_at: nowIso,
    completed_at: isTerminalStatus ? nowIso : "",
    final_status: normalizeRTSReviewStatus(finalStatus || previous?.final_status || previous?.finalStatus),
    fallback_reason: normalizeTextValue(fallbackReason || previous?.fallback_reason || previous?.fallbackReason),
    last_error_code: normalizeTextValue(lastErrorCode || previous?.last_error_code || previous?.lastErrorCode),
    last_error_message: normalizeTextValue(lastErrorMessage || previous?.last_error_message || previous?.lastErrorMessage)
  };
}

export function mergeRTSScoreJson(baseScoreJson, aiReview, aiReviewJob) {
  const safeBase = parseRTSScoreJson(baseScoreJson);
  const merged = { ...safeBase };
  if (aiReview !== undefined) {
    merged.ai_review = toObjectValue(aiReview) || {};
  }
  if (aiReviewJob !== undefined) {
    merged.ai_review_job = toObjectValue(aiReviewJob) || createPendingRTSAiReviewJob();
  }
  return merged;
}

export async function resolveCurrentUserId() {
  const authStore = useAuthStore();
  const storeUserId = normalizeTextValue(authStore.user?.id);
  if (storeUserId) return storeUserId;
  const { data, error } = await supabase.auth.getUser();
  if (error) return "";
  return normalizeTextValue(data?.user?.id);
}

export async function fetchRTSPracticeLog(logId) {
  const normalizedLogId = normalizeTextValue(logId);
  if (!normalizedLogId) return null;
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("id", normalizedLogId)
    .eq("task_type", "RTS")
    .maybeSingle();
  if (error) {
    const wrapped = new Error(normalizeTextValue(error?.message) || "practice_logs_read_failed");
    wrapped.cause = error;
    throw wrapped;
  }
  return data || null;
}

export function buildRTSReviewContext({ logRow = null, question = null } = {}) {
  const scoreJson = parseRTSScoreJson(logRow?.score_json);
  const questionMetaFromLog = normalizeRTSQuestionMeta(scoreJson?.question_meta);
  const questionMetaFromQuestion = normalizeRTSQuestionMeta(buildRTSQuestionMetaPayload(question));
  const questionMeta = {
    topic: questionMetaFromLog.topic || questionMetaFromQuestion.topic,
    tone: questionMetaFromLog.tone || questionMetaFromQuestion.tone,
    role: questionMetaFromLog.role || questionMetaFromQuestion.role,
    directions_head: questionMetaFromLog.directions_head || questionMetaFromQuestion.directions_head
  };
  return {
    logId: normalizeTextValue(logRow?.id),
    userId: normalizeTextValue(logRow?.user_id),
    transcript: normalizeTextValue(logRow?.transcript),
    scoreJson,
    questionId: normalizeTextValue(logRow?.question_id),
    questionContent: normalizeTextValue(question?.content || scoreJson?.question_content),
    questionMeta,
    audioSignals: normalizeRTSAudioSignals(scoreJson?.audio_signals),
    aiReview: getRTSReviewFromScoreJson(scoreJson)
  };
}

export function createRTSClientDegradedReview({
  transcript = "",
  questionContent = "",
  questionMeta = null,
  audioSignals = null,
  reasonCode = "ai_review_unavailable",
  reasonMessage = ""
} = {}) {
  const transcriptText = normalizeTextValue(transcript);
  const transcriptWords = transcriptText ? transcriptText.split(/\s+/).filter(Boolean) : [];
  const normalizedReasonCode = normalizeRTSFallbackReason(reasonCode);
  const normalizedReasonMessage = normalizeTextValue(reasonMessage) || getRTSFallbackReasonMessage(normalizedReasonCode);
  const reasonCodes = [...new Set([normalizedReasonCode, "ai_review_unavailable"].filter(Boolean))];
  const relevanceSignals = computeRTSRelevanceSignals({
    transcript: transcriptText,
    questionContent
  });
  const coverageTier = relevanceSignals.coverage_tier;
  const pronunciationRaw = transcriptWords.length >= 12 ? 2 : transcriptWords.length >= 6 ? 1 : 0;
  const fluencyRaw = transcriptWords.length >= 12 ? 2 : transcriptWords.length >= 6 ? 1 : 0;
  const baselineContentRaw = transcriptWords.length >= 8 ? 1 : 0;
  const coverageContentRaw = (
    coverageTier === "very_high" ? 3
      : coverageTier === "high" ? 2
        : coverageTier === "medium" ? 2
          : coverageTier === "low" ? 1
            : 0
  );
  const contentRaw = Math.max(baselineContentRaw, coverageContentRaw);
  const displayScores = buildRTSDisplayScoresFromRaw({
    contentRaw,
    pronunciationRaw,
    fluencyRaw,
    coverageTier,
    relevanceSignals,
    wordCount: transcriptWords.length
  });
  return {
    taskType: "RTS",
    status: RTS_SCORE_STATUS_DEGRADED,
    is_ai_review_degraded: true,
    is_estimated: true,
    review_label: "AI评阅（降级）",
    official_traits: {
      appropriacy: { score: contentRaw, max: RTS_CONTENT_RAW_MAX },
      pronunciation: { score: pronunciationRaw, max: RTS_PRONUNCIATION_RAW_MAX },
      oral_fluency: { score: fluencyRaw, max: RTS_FLUENCY_RAW_MAX }
    },
    raw_traits: {
      content_raw: contentRaw,
      pronunciation_raw: pronunciationRaw,
      fluency_raw: fluencyRaw
    },
    scores: {
      content: displayScores.content,
      pronunciation: displayScores.pronunciation,
      fluency: displayScores.fluency
    },
    gate: {
      triggered: false,
      reason_codes: reasonCodes,
      policy: "product_relaxed_fluency_first"
    },
    overall: displayScores.overall,
    product: {
      overall: displayScores.overall,
      content: displayScores.content,
      pronunciation: displayScores.pronunciation,
      fluency: displayScores.fluency,
      feedback_zh: [
        "录音与练习记录已保存，但本次 AI 评阅暂时不可用。",
        normalizedReasonMessage
      ],
      better_expression_zh: buildSimpleEnglishRTSSuggestion({
        coverageTier,
        questionContent
      })
    },
    diagnostics: {
      transcript_metrics: {
        word_count: transcriptWords.length,
        unique_word_ratio: transcriptWords.length ? Number((new Set(transcriptWords).size / transcriptWords.length).toFixed(3)) : 0,
        template_overlap_ratio: 0
      },
      content_signals: {
        ...relevanceSignals
      },
      audio_signals: normalizeRTSAudioSignals(audioSignals),
      question_meta: normalizeRTSQuestionMeta(questionMeta),
      question_preview: normalizeTextValue(questionContent).slice(0, 180),
      display_scores: displayScores
    },
    feedback: `录音已保存，${normalizedReasonMessage}`,
    provider_used: "none",
    fallback_reason: normalizedReasonCode,
    fallback_reason_message_zh: normalizedReasonMessage,
    gate_reason_messages_zh: reasonCodes
      .map((item) => RTS_SCORE_REASON_MESSAGE_MAP[item] || normalizedReasonMessage)
      .filter(Boolean)
  };
}

export async function patchRTSPracticeLog({
  logId = "",
  userId = "",
  transcript = "",
  scoreJson = null,
  feedback = ""
} = {}) {
  const normalizedLogId = normalizeTextValue(logId);
  const normalizedUserId = normalizeTextValue(userId) || await resolveCurrentUserId();
  if (!normalizedLogId || !normalizedUserId) {
    throw new Error("RTS_LOG_UPDATE_MISSING_CONTEXT");
  }
  const { data, error } = await supabase
    .from("practice_logs")
    .update({
      transcript: normalizeTextValue(transcript),
      score_json: scoreJson,
      feedback: normalizeTextValue(feedback)
    })
    .eq("id", normalizedLogId)
    .eq("user_id", normalizedUserId)
    .eq("task_type", "RTS")
    .select("id, score_json, feedback, transcript")
    .maybeSingle();
  if (error) {
    const wrapped = new Error(normalizeTextValue(error?.message) || "practice_logs_update_failed");
    wrapped.cause = error;
    throw wrapped;
  }
  if (!data?.id) {
    throw new Error("practice_logs_update_failed_no_rows");
  }
  return data;
}

export async function requestRTSScore({
  transcript = "",
  questionContent = "",
  questionMeta = null,
  audioSignals = null,
  requestId = ""
} = {}) {
  const authStore = useAuthStore();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error("RTS_SCORE_AUTH_SESSION_ERROR");
  }
  const token = normalizeTextValue(sessionData?.session?.access_token || authStore.session?.access_token);
  if (!token) {
    throw new Error("RTS_SCORE_AUTH_SESSION_MISSING");
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RTS_SCORE_API_TIMEOUT_MS);
  try {
    const response = await fetch(getApiUrl("/api/score"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        taskType: "RTS",
        transcript: normalizeTextValue(transcript),
        questionContent: normalizeTextValue(questionContent),
        question_meta: normalizeRTSQuestionMeta(questionMeta),
        audio_signals: normalizeRTSAudioSignals(audioSignals),
        request_id: normalizeTextValue(requestId) || `rts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }),
      signal: controller.signal
    });
    const payload = await readRTSScoreApiResponse(response);
    if (response.status === 401) {
      throw new Error("RTS_SCORE_AUTH_SESSION_EXPIRED");
    }
    if (!response.ok) {
      throw new Error(normalizeTextValue(payload?.error) || `RTS_SCORE_API_${response.status}`);
    }
    return toObjectValue(payload) || {};
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("RTS_SCORE_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function ensureRTSReviewForLog({ logRow = null, question = null } = {}) {
  const context = buildRTSReviewContext({ logRow, question });
  if (!context.logId) {
    throw new Error("RTS_REVIEW_LOG_ID_MISSING");
  }
  const currentJob = getRTSAiReviewJob(context.scoreJson);
  if (isRTSAiReviewComplete(context.aiReview) || currentJob.status === RTS_AI_REVIEW_JOB_FAILED) {
    const terminalReview = isRTSAiReviewComplete(context.aiReview)
      ? context.aiReview
      : createRTSClientDegradedReview({
        transcript: context.transcript,
        questionContent: context.questionContent,
        questionMeta: context.questionMeta,
        audioSignals: context.audioSignals,
        reasonCode: currentJob.last_error_code || currentJob.fallback_reason || "practice_logs_update_failed"
      });
    return {
      status: normalizeRTSReviewStatus(terminalReview?.status),
      review: terminalReview,
      logId: context.logId,
      scoreJson: context.scoreJson
    };
  }
  if (inflightRTSReviewMap.has(context.logId)) {
    return inflightRTSReviewMap.get(context.logId);
  }

  const jobPromise = runRTSReviewForLog(context).finally(() => {
    inflightRTSReviewMap.delete(context.logId);
  });
  inflightRTSReviewMap.set(context.logId, jobPromise);
  return jobPromise;
}

export function clearRTSReviewInflight(logId = "") {
  const normalizedLogId = normalizeTextValue(logId);
  if (!normalizedLogId) return;
  inflightRTSReviewMap.delete(normalizedLogId);
}

export async function finalizeRTSReviewAsDegraded({
  logRow = null,
  question = null,
  reasonCode = "ai_review_timeout"
} = {}) {
  const context = buildRTSReviewContext({ logRow, question });
  const userId = normalizeTextValue(context.userId) || await resolveCurrentUserId();
  if (!context.logId || !userId) {
    throw new Error("RTS_REVIEW_FINALIZE_MISSING_CONTEXT");
  }
  const degradedReview = createRTSClientDegradedReview({
    transcript: context.transcript,
    questionContent: context.questionContent,
    questionMeta: context.questionMeta,
    audioSignals: context.audioSignals,
    reasonCode
  });
  const completedJob = buildRTSAiReviewJobState({
    previousJob: getRTSAiReviewJob(context.scoreJson),
    status: RTS_AI_REVIEW_JOB_COMPLETED,
    finalStatus: degradedReview.status,
    fallbackReason: degradedReview.fallback_reason,
    lastErrorCode: degradedReview.fallback_reason,
    lastErrorMessage: degradedReview.fallback_reason_message_zh
  });
  const finalScoreJson = mergeRTSScoreJson(context.scoreJson, degradedReview, completedJob);
  await patchRTSPracticeLog({
    logId: context.logId,
    userId,
    transcript: context.transcript,
    scoreJson: finalScoreJson,
    feedback: normalizeTextValue(
      degradedReview?.feedback
      || degradedReview?.product?.feedback_zh?.[0]
      || ""
    )
  });
  return {
    status: RTS_SCORE_STATUS_DEGRADED,
    review: degradedReview,
    logId: context.logId,
    userId,
    scoreJson: finalScoreJson
  };
}

function normalizeRTSAiReviewJobStatus(value) {
  const normalized = normalizeTextValue(value).toLowerCase();
  if (normalized === RTS_AI_REVIEW_JOB_RUNNING) return RTS_AI_REVIEW_JOB_RUNNING;
  if (normalized === RTS_AI_REVIEW_JOB_COMPLETED) return RTS_AI_REVIEW_JOB_COMPLETED;
  if (normalized === RTS_AI_REVIEW_JOB_FAILED) return RTS_AI_REVIEW_JOB_FAILED;
  return RTS_AI_REVIEW_JOB_PENDING;
}

async function runRTSReviewForLog(context) {
  const userId = normalizeTextValue(context.userId) || await resolveCurrentUserId();
  if (!userId) {
    throw new Error("RTS_REVIEW_USER_ID_MISSING");
  }
  const requestId = `rts_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runningJob = buildRTSAiReviewJobState({
    previousJob: getRTSAiReviewJob(context.scoreJson),
    status: RTS_AI_REVIEW_JOB_RUNNING,
    requestId
  });
  const runningScoreJson = mergeRTSScoreJson(context.scoreJson, context.aiReview, runningJob);

  try {
    await patchRTSPracticeLog({
      logId: context.logId,
      userId,
      transcript: context.transcript,
      scoreJson: runningScoreJson,
      feedback: normalizeTextValue(context.scoreJson?.feedback)
    });
  } catch {
    // Best effort only. The final result patch below is the source of truth.
  }

  let normalizedReview;
  try {
    const review = await requestRTSScore({
      transcript: context.transcript,
      questionContent: context.questionContent,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      requestId
    });
    normalizedReview = toObjectValue(review) || createRTSClientDegradedReview({
      transcript: context.transcript,
      questionContent: context.questionContent,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: "ai_review_parse_failed"
    });
  } catch (error) {
    const normalizedReason = normalizeRTSFallbackReason(error?.message, error?.raw_error_type);
    normalizedReview = createRTSClientDegradedReview({
      transcript: context.transcript,
      questionContent: context.questionContent,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: normalizedReason
    });
  }

  const normalizedStatus = normalizeRTSReviewStatus(normalizedReview?.status);
  const fallbackReason = normalizeTextValue(normalizedReview?.fallback_reason);
  const completedJob = buildRTSAiReviewJobState({
    previousJob: runningJob,
    status: RTS_AI_REVIEW_JOB_COMPLETED,
    requestId,
    finalStatus: normalizedStatus,
    fallbackReason,
    lastErrorCode: normalizedStatus === RTS_SCORE_STATUS_DEGRADED ? fallbackReason : "",
    lastErrorMessage: normalizedStatus === RTS_SCORE_STATUS_DEGRADED ? getRTSFallbackReasonMessage(fallbackReason) : ""
  });
  const finalScoreJson = mergeRTSScoreJson(runningScoreJson, normalizedReview, completedJob);
  const feedback = normalizeTextValue(
    normalizedReview?.feedback
    || normalizedReview?.product?.feedback_zh?.[0]
    || ""
  );

  try {
    await patchRTSPracticeLog({
      logId: context.logId,
      userId,
      transcript: context.transcript,
      scoreJson: finalScoreJson,
      feedback
    });

    return {
      status: normalizedStatus,
      review: normalizedReview,
      logId: context.logId,
      userId,
      scoreJson: finalScoreJson
    };
  } catch (finalPatchError) {
    const failedReason = normalizeRTSFallbackReason(
      finalPatchError?.message || "practice_logs_update_failed",
      finalPatchError?.raw_error_type
    );
    const failedReview = createRTSClientDegradedReview({
      transcript: context.transcript,
      questionContent: context.questionContent,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: failedReason
    });
    const failedJob = buildRTSAiReviewJobState({
      previousJob: completedJob,
      status: RTS_AI_REVIEW_JOB_FAILED,
      requestId,
      finalStatus: failedReview.status,
      fallbackReason: failedReview.fallback_reason,
      lastErrorCode: failedReview.fallback_reason,
      lastErrorMessage: failedReview.fallback_reason_message_zh || getRTSFallbackReasonMessage(failedReview.fallback_reason)
    });
    const failedScoreJson = mergeRTSScoreJson(runningScoreJson, failedReview, failedJob);
    const failedFeedback = normalizeTextValue(
      failedReview?.feedback
      || failedReview?.product?.feedback_zh?.[0]
      || ""
    );
    try {
      await patchRTSPracticeLog({
        logId: context.logId,
        userId,
        transcript: context.transcript,
        scoreJson: failedScoreJson,
        feedback: failedFeedback
      });

      return {
        status: failedReview.status,
        review: failedReview,
        logId: context.logId,
        userId,
        scoreJson: failedScoreJson
      };
    } catch (failedPatchError) {
      const wrapped = new Error("practice_logs_update_failed_terminal");
      wrapped.cause = failedPatchError;
      wrapped.raw_error_type = normalizeRTSFallbackReason(
        failedPatchError?.message || finalPatchError?.message,
        failedPatchError?.raw_error_type || finalPatchError?.raw_error_type
      );
      throw wrapped;
    }
  }
}

async function readRTSScoreApiResponse(response) {
  const text = await response.text();
  const trimmed = normalizeTextValue(text);
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("RTS_SCORE_API_INVALID_JSON");
  }
}

function mapRTSRawToDisplay(rawScore, rawMax) {
  const boundedRaw = clampScore(rawScore, 0, rawMax);
  if (rawMax <= 0) return RTS_DISPLAY_MIN_SCORE;
  return clampScore(
    Math.round(RTS_DISPLAY_MIN_SCORE + (boundedRaw / rawMax) * (RTS_DISPLAY_MAX_SCORE - RTS_DISPLAY_MIN_SCORE)),
    RTS_DISPLAY_MIN_SCORE,
    RTS_DISPLAY_MAX_SCORE
  );
}

function composeRTSDisplayOverall(content, pronunciation, fluency) {
  return clampScore(
    Math.round(Number(content || 0) * 0.15 + Number(pronunciation || 0) * 0.25 + Number(fluency || 0) * 0.6),
    RTS_DISPLAY_MIN_SCORE,
    RTS_DISPLAY_MAX_SCORE
  );
}

function buildRTSDisplayScoresFromRaw({
  contentRaw = 0,
  pronunciationRaw = 0,
  fluencyRaw = 0,
  coverageTier = "none",
  relevanceSignals = null,
  wordCount = 0
} = {}) {
  const resolvedSignals = toObjectValue(relevanceSignals) || {};
  const coverageFloor = resolveClientCoverageContentFloor(coverageTier, resolvedSignals);
  let content = Math.max(
    mapRTSRawToDisplay(contentRaw, RTS_CONTENT_RAW_MAX),
    coverageFloor
  );
  content = applyClientRelevanceContentBand({
    content,
    relevanceSignals: resolvedSignals,
    wordCount
  }).content;
  const pronunciation = mapRTSRawToDisplay(pronunciationRaw, RTS_PRONUNCIATION_RAW_MAX);
  const fluency = mapRTSRawToDisplay(fluencyRaw, RTS_FLUENCY_RAW_MAX);
  const weightedOverall = composeRTSDisplayOverall(content, pronunciation, fluency);
  const fluencyGuardOverall = fluency >= RTS_FLUENCY_PASS_LINE && resolvedSignals.relevance_gate_passed
    ? Math.max(weightedOverall, RTS_OVERALL_FLUENCY_PASS_FLOOR)
    : weightedOverall;
  return {
    content,
    pronunciation,
    fluency,
    overall: clampScore(fluencyGuardOverall, RTS_DISPLAY_MIN_SCORE, RTS_DISPLAY_MAX_SCORE)
  };
}

function resolveClientCoverageContentFloor(coverageTier = "none", relevanceSignals = null) {
  if (!relevanceSignals?.relevance_gate_passed) return 0;
  if (coverageTier === "very_high") return RTS_CONTENT_VERY_HIGH_COVERAGE_FLOOR;
  if (coverageTier === "high") return RTS_CONTENT_HIGH_COVERAGE_FLOOR;
  if (coverageTier === "medium") return RTS_CONTENT_MEDIUM_COVERAGE_FLOOR;
  return RTS_CONTENT_BASE_FLOOR;
}

function applyClientRelevanceContentBand({
  content = RTS_DISPLAY_MIN_SCORE,
  relevanceSignals = null,
  wordCount = 0
} = {}) {
  const signals = toObjectValue(relevanceSignals) || {};
  if (signals.relevance_gate_passed) {
    return {
      content: clampScore(content, RTS_CONTENT_BASE_FLOOR, RTS_DISPLAY_MAX_SCORE),
      band: "relevant_45_plus"
    };
  }

  if (signals.weak_relevance && !signals.severe_off_topic_like) {
    const categoryCount = Math.max(0, Math.min(3, Number(signals.relevance_category_count || 0)));
    const overlapHits = Math.max(0, Number(signals.question_overlap_hits || 0));
    const weakBoost = (
      (categoryCount >= 2 ? 8 : categoryCount >= 1 ? 4 : 0)
      + (overlapHits >= 2 ? 4 : overlapHits >= 1 ? 2 : 0)
      + (wordCount >= 15 ? 2 : 0)
    );
    const weakTarget = clampScore(
      RTS_CONTENT_WEAK_RELATED_MIN + weakBoost,
      RTS_CONTENT_WEAK_RELATED_MIN,
      RTS_CONTENT_WEAK_RELATED_MAX
    );
    return {
      content: clampScore(
        Math.max(RTS_CONTENT_WEAK_RELATED_MIN, Math.min(content, weakTarget)),
        RTS_CONTENT_WEAK_RELATED_MIN,
        RTS_CONTENT_WEAK_RELATED_MAX
      ),
      band: "weak_related_30_44"
    };
  }

  const offTopicBoost = (
    (wordCount >= 12 ? 4 : wordCount >= 7 ? 2 : 0)
    + (Number(signals.question_overlap_hits || 0) > 0 ? 2 : 0)
  );
  const offTopicTarget = clampScore(
    RTS_DISPLAY_MIN_SCORE + offTopicBoost,
    RTS_DISPLAY_MIN_SCORE,
    RTS_CONTENT_OFF_TOPIC_MAX
  );
  return {
    content: clampScore(Math.min(content, offTopicTarget), RTS_DISPLAY_MIN_SCORE, RTS_CONTENT_OFF_TOPIC_MAX),
    band: "off_topic_10_30"
  };
}

function computeRTSRelevanceSignals({ transcript = "", questionContent = "" } = {}) {
  const transcriptTokens = tokenizeCoverageWords(transcript);
  const transcriptTextLower = normalizeTextValue(transcript).toLowerCase();
  const transcriptEffectiveTokens = filterEffectiveTokens(transcriptTokens, RTS_TEMPLATE_NOISE_TOKENS);
  const questionTokens = tokenizeCoverageWords(questionContent);
  const questionEffectiveTokens = filterEffectiveTokens(questionTokens, RTS_TEMPLATE_NOISE_TOKENS);
  if (!transcriptTokens.length || !questionTokens.length) {
    return {
      coverage_tier: "none",
      relevance_gate_passed: false,
      relevance_category_count: 0,
      weak_relevance: false,
      severe_off_topic_like: false,
      template_only_like: false,
      question_overlap_hits: 0
    };
  }

  const questionSet = new Set(questionEffectiveTokens);
  const overlapHits = transcriptEffectiveTokens.reduce((count, token) => (
    questionSet.has(token) ? count + 1 : count
  ), 0);
  const uniqueOverlap = new Set(transcriptEffectiveTokens.filter((token) => questionSet.has(token))).size;
  const overlapRatio = questionEffectiveTokens.length ? uniqueOverlap / questionEffectiveTokens.length : 0;
  const templatePhraseHits = countPhraseHits(transcriptTextLower, RTS_TEMPLATE_NOISE_PHRASES);

  const entityHits = countSetHits(transcriptEffectiveTokens, RTS_RELEVANCE_ENTITY_HINTS);
  const eventHits = countSetHits(transcriptEffectiveTokens, RTS_RELEVANCE_EVENT_HINTS);
  const actionHits = countSetHits(transcriptEffectiveTokens, RTS_RELEVANCE_ACTION_HINTS);

  const questionEntityTokens = questionEffectiveTokens.filter((token) => RTS_RELEVANCE_ENTITY_HINTS.has(token));
  const questionEventTokens = questionEffectiveTokens.filter((token) => RTS_RELEVANCE_EVENT_HINTS.has(token));
  const questionActionTokens = questionEffectiveTokens.filter((token) => RTS_RELEVANCE_ACTION_HINTS.has(token));

  const objectOverlapHits = countTokenOverlap(transcriptEffectiveTokens, questionEntityTokens);
  const eventOverlapHits = countTokenOverlap(transcriptEffectiveTokens, questionEventTokens);
  const actionOverlapHits = countTokenOverlap(transcriptEffectiveTokens, questionActionTokens);
  const relevanceCategoryCount = [
    entityHits > 0 || objectOverlapHits > 0,
    eventHits > 0 || eventOverlapHits > 0,
    actionHits > 0 || actionOverlapHits > 0
  ].filter(Boolean).length;

  const relevanceGatePassed = (
    transcriptEffectiveTokens.length >= 6
    && relevanceCategoryCount >= 2
    && (
      relevanceCategoryCount >= 3
      || uniqueOverlap >= 2
      || eventOverlapHits >= 1
      || actionOverlapHits >= 1
      || (entityHits >= 1 && eventHits >= 1)
    )
  );
  const weakRelevance = (
    !relevanceGatePassed
    && (
      relevanceCategoryCount >= 1
      || uniqueOverlap >= 1
      || overlapHits >= 1
      || (eventHits + actionHits) >= 1
    )
  );
  const templateOnlyLike = (
    transcriptTokens.length > 0
    && !relevanceGatePassed
    && templatePhraseHits >= 2
    && transcriptEffectiveTokens.length <= 4
    && relevanceCategoryCount <= 1
    && uniqueOverlap === 0
  );
  const severeOffTopicLike = (
    !relevanceGatePassed
    && (
      templateOnlyLike
      || (!weakRelevance && uniqueOverlap === 0 && relevanceCategoryCount === 0)
    )
  );

  let coverageTier = "none";
  if ((relevanceCategoryCount >= 3 && uniqueOverlap >= 4) || overlapRatio >= 0.55) {
    coverageTier = "very_high";
  } else if (relevanceCategoryCount >= 3 || (uniqueOverlap >= 3 && eventHits > 0)) {
    coverageTier = "high";
  } else if (relevanceCategoryCount >= 2 || uniqueOverlap >= 2) {
    coverageTier = "medium";
  } else if (weakRelevance || overlapHits > 0) {
    coverageTier = "low";
  }

  return {
    coverage_tier: coverageTier,
    relevance_gate_passed: relevanceGatePassed,
    relevance_category_count: relevanceCategoryCount,
    weak_relevance: weakRelevance,
    severe_off_topic_like: severeOffTopicLike,
    template_only_like: templateOnlyLike,
    template_phrase_hits: templatePhraseHits,
    meaningful_token_count: transcriptEffectiveTokens.length,
    question_overlap_hits: uniqueOverlap,
    overlap_hits: overlapHits,
    entity_hits: entityHits,
    event_hits: eventHits,
    action_hits: actionHits
  };
}

function tokenizeCoverageWords(text) {
  return `${text || ""}`
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

function countSetHits(tokens, hintSet) {
  if (!Array.isArray(tokens) || !tokens.length || !(hintSet instanceof Set) || !hintSet.size) return 0;
  const tokenSet = new Set(tokens);
  let count = 0;
  for (const item of hintSet) {
    if (tokenSet.has(item)) count += 1;
  }
  return count;
}

function countTokenOverlap(tokens, referenceTokens) {
  if (!Array.isArray(tokens) || !tokens.length || !Array.isArray(referenceTokens) || !referenceTokens.length) return 0;
  const tokenSet = new Set(tokens);
  let count = 0;
  for (const token of referenceTokens) {
    if (tokenSet.has(token)) count += 1;
  }
  return count;
}

function filterEffectiveTokens(tokens, noiseTokenSet) {
  if (!Array.isArray(tokens) || !tokens.length) return [];
  if (!(noiseTokenSet instanceof Set) || !noiseTokenSet.size) return [...tokens];
  return tokens.filter((token) => !noiseTokenSet.has(token));
}

function countPhraseHits(text, phrases = []) {
  const source = normalizeTextValue(text).toLowerCase();
  if (!source || !Array.isArray(phrases) || !phrases.length) return 0;
  let hitCount = 0;
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeTextValue(phrase).toLowerCase();
    if (!normalizedPhrase) continue;
    if (source.includes(normalizedPhrase)) hitCount += 1;
  }
  return hitCount;
}

function buildSimpleEnglishRTSSuggestion({
  coverageTier = "none",
  questionContent = ""
} = {}) {
  const questionTokens = new Set(tokenizeCoverageWords(questionContent));
  const hasClassScene = (
    questionTokens.has("class")
    || questionTokens.has("classes")
    || questionTokens.has("assignment")
    || questionTokens.has("assignments")
    || questionTokens.has("homework")
    || questionTokens.has("skip")
    || questionTokens.has("skips")
    || questionTokens.has("late")
    || questionTokens.has("early")
  );

  if (hasClassScene) {
    return "Hey, try one small step first: go to class on time and submit homework on time.";
  }
  if (coverageTier === "very_high" || coverageTier === "high") {
    return "Hey, your answer matches the scene. Add one clear next step to make it stronger.";
  }
  if (coverageTier === "medium") {
    return "Hey, this is close. Add one more key point and one clear action.";
  }
  return "Hey, say the main problem first, then give one simple and clear suggestion.";
}

function clampScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function parseIsoToMs(value) {
  const text = normalizeTextValue(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}


