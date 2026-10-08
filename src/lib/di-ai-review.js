import { getApiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export const DI_SCORE_STATUS_PENDING = "pending";
export const DI_SCORE_STATUS_SCORED = "scored";
export const DI_SCORE_STATUS_DEGRADED = "ai_review_degraded";
export const DI_SCORE_STATUS_FAILED = "failed";

export const DI_AI_REVIEW_JOB_PENDING = "pending";
export const DI_AI_REVIEW_JOB_RUNNING = "running";
export const DI_AI_REVIEW_JOB_COMPLETED = "completed";
export const DI_AI_REVIEW_JOB_FAILED = "failed";

const DI_SCORE_API_TIMEOUT_MS = 15000;
const DI_AI_REVIEW_STALL_THRESHOLD_MS = 90000;
const GENERIC_DI_PROMPT = "describe the image in detail.";
const DI_META_NOISE_TERMS = new Set([
  "phase1",
  "local-import",
  "phase 1",
  "local import"
]);
const DI_META_GENERIC_TERMS = new Set([
  "trend",
  "comparison",
  "stage",
  "sequence",
  "data",
  "chart",
  "graph",
  "diagram",
  "table",
  "map",
  "figure",
  "category",
  "number",
  "numbers",
  "amount",
  "value",
  "rate",
  "percent",
  "percentage",
  "year",
  "years",
  "period",
  "location",
  "layout",
  "feature",
  "pattern",
  "process"
]);

const inflightDIReviewMap = new Map();

const DI_REASON_MESSAGE_MAP = {
  content_zero: "回答和图像内容关联不足，内容分按最低档处理。",
  audio_upload_failed: "录音上传失败，请稍后重试。",
  storage_policy_failed: "录音上传权限不足，请检查 storage policy。",
  storage_bucket_failed: "录音存储配置异常，请检查 storage bucket。",
  practice_log_insert_failed: "练习记录写入失败，请稍后重试。",
  practice_log_policy_failed: "练习记录写入权限不足，请检查 practice_logs 的权限配置。",
  auth_session_failed: "登录状态失效，请重新登录后重试。",
  transcript_empty: "未识别到有效 transcript，本次无法完成稳定评分。",
  transcript_too_short: "回答过短，系统暂时无法给出稳定评分。",
  audio_not_usable: "录音可用性不足，本次无法完成稳定评分。",
  metadata_insufficient: "题目图像元数据不足，本次先返回降级结果。",
  ai_review_unavailable: "AI评分服务暂时不可用，已返回降级结果。",
  ai_review_timeout: "AI评分超时，已返回降级结果。",
  ai_review_parse_failed: "AI评分结果解析失败，已返回降级结果。",
  ai_review_provider_error: "AI评分服务异常，已返回降级结果。",
  llm_api_keys_missing: "AI评分服务尚未完成配置。",
  auth_session_missing: "登录状态缺失，请重新登录后重试。",
  auth_session_expired: "登录状态已过期，请重新登录后重试。",
  score_api_failed: "评分请求失败，本次仅保存练习记录。",
  score_api_http_error: "评分服务返回异常，本次仅保存练习记录。",
  practice_logs_update_failed: "评分结果写回失败，请稍后重试。"
};

export function normalizeTextValue(value) {
  return `${value || ""}`.trim();
}

export function toObjectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function parseDIScoreJson(value) {
  if (typeof value === "string") {
    try {
      return toObjectValue(JSON.parse(value)) || {};
    } catch {
      return {};
    }
  }
  return toObjectValue(value) || {};
}

export function normalizeDIReviewStatus(value) {
  const normalized = normalizeTextValue(value).toLowerCase();
  if (normalized === DI_SCORE_STATUS_SCORED) return DI_SCORE_STATUS_SCORED;
  if (normalized === DI_SCORE_STATUS_DEGRADED) return DI_SCORE_STATUS_DEGRADED;
  if (normalized === DI_SCORE_STATUS_FAILED) return DI_SCORE_STATUS_FAILED;
  return DI_SCORE_STATUS_PENDING;
}

export function normalizeDIQuestionMeta(value = {}) {
  const source = toObjectValue(value) || {};
  const visualFeatures = toObjectValue(source?.visual_features || source?.visualFeatures) || {};
  const normalizedQuestion = {
    id: source?.question_id || source?.questionId || source?.id,
    topic: source?.title || source?.topic || source?.display_title || source?.displayTitle,
    displayTitle: source?.display_title || source?.displayTitle || source?.title || source?.topic,
    content: source?.question_content || source?.questionContent || source?.content,
    imageType: source?.image_type || source?.imageType,
    keyPoints: source?.key_points || source?.keyPoints,
    keyTerms: source?.key_terms || source?.keyTerms,
    keyElements: source?.key_elements || source?.keyElements,
    relations: source?.relations,
    implicationsOrConclusion: source?.implications_or_conclusion || source?.implicationsOrConclusion,
    numbersOrExtremes: source?.numbers_or_extremes || source?.numbersOrExtremes,
    sequenceOrTrend: source?.sequence_or_trend || source?.sequenceOrTrend,
    comparisonAxes: source?.comparison_axes || source?.comparisonAxes,
    visualFeatures
  };
  const derived = deriveDIQuestionScoringHints(normalizedQuestion);
  return {
    question_id: normalizeTextValue(normalizedQuestion.id),
    title: derived.title,
    question_content: derived.questionContent,
    image_type: derived.imageType,
    metadata_quality: normalizeTextValue(source?.metadata_quality || source?.metadataQuality || derived.metadataQuality),
    key_points: derived.keyPoints,
    key_terms: derived.keyTerms,
    key_elements: derived.keyElements,
    relations: derived.relations,
    implications_or_conclusion: derived.implicationsOrConclusion,
    numbers_or_extremes: derived.numbersOrExtremes,
    sequence_or_trend: derived.sequenceOrTrend,
    comparison_axes: derived.comparisonAxes,
    visual_features: {
      has_trend: Boolean(derived.visualFeatures.hasTrend),
      has_comparison: Boolean(derived.visualFeatures.hasComparison),
      has_extreme: Boolean(derived.visualFeatures.hasExtreme),
      has_numbers: Boolean(derived.visualFeatures.hasNumbers)
    }
  };
}

export function normalizeDIQuestionSnapshot(value = {}) {
  const source = toObjectValue(value) || {};
  const questionMeta = normalizeDIQuestionMeta(source);
  return {
    id: normalizeTextValue(source?.id || source?.question_id || source?.questionId || questionMeta.question_id),
    topic: normalizeTextValue(source?.topic || source?.title || questionMeta.title),
    displayTitle: normalizeTextValue(source?.display_title || source?.displayTitle || source?.topic || questionMeta.title),
    sourceNumberLabel: normalizeTextValue(source?.source_number_label || source?.sourceNumberLabel),
    imageType: normalizeTextValue(source?.image_type || source?.imageType || questionMeta.image_type).toLowerCase(),
    imageUrl: normalizeTextValue(source?.image_url || source?.imageUrl),
    imageAlt: normalizeTextValue(source?.image_alt || source?.imageAlt || source?.topic || source?.display_title || source?.displayTitle),
    questionContent: normalizeQuestionContent(
      source?.question_content || source?.questionContent || source?.content || questionMeta.question_content
    ),
    metadataQuality: normalizeTextValue(source?.metadata_quality || source?.metadataQuality || questionMeta.metadata_quality),
    keyPoints: normalizeStringList(source?.key_points || source?.keyPoints || questionMeta.key_points, 6),
    keyTerms: normalizeStringList(source?.key_terms || source?.keyTerms || questionMeta.key_terms, 8),
    keyElements: normalizeStringList(source?.key_elements || source?.keyElements || questionMeta.key_elements, 6),
    relations: normalizeStringList(source?.relations || questionMeta.relations, 6),
    implicationsOrConclusion: normalizeStringList(
      source?.implications_or_conclusion || source?.implicationsOrConclusion || questionMeta.implications_or_conclusion,
      4
    ),
    numbersOrExtremes: normalizeStringList(
      source?.numbers_or_extremes || source?.numbersOrExtremes || questionMeta.numbers_or_extremes,
      6
    ),
    sequenceOrTrend: normalizeStringList(
      source?.sequence_or_trend || source?.sequenceOrTrend || questionMeta.sequence_or_trend,
      5
    ),
    comparisonAxes: normalizeStringList(
      source?.comparison_axes || source?.comparisonAxes || questionMeta.comparison_axes,
      5
    ),
    visualFeatures: {
      hasTrend: Boolean(
        source?.visual_features?.has_trend
        ?? source?.visual_features?.hasTrend
        ?? source?.visualFeatures?.has_trend
        ?? source?.visualFeatures?.hasTrend
        ?? questionMeta.visual_features.has_trend
      ),
      hasComparison: Boolean(
        source?.visual_features?.has_comparison
        ?? source?.visual_features?.hasComparison
        ?? source?.visualFeatures?.has_comparison
        ?? source?.visualFeatures?.hasComparison
        ?? questionMeta.visual_features.has_comparison
      ),
      hasExtreme: Boolean(
        source?.visual_features?.has_extreme
        ?? source?.visual_features?.hasExtreme
        ?? source?.visualFeatures?.has_extreme
        ?? source?.visualFeatures?.hasExtreme
        ?? questionMeta.visual_features.has_extreme
      ),
      hasNumbers: Boolean(
        source?.visual_features?.has_numbers
        ?? source?.visual_features?.hasNumbers
        ?? source?.visualFeatures?.has_numbers
        ?? source?.visualFeatures?.hasNumbers
        ?? questionMeta.visual_features.has_numbers
      )
    }
  };
}

export function buildDIQuestionMetaPayload(question = {}) {
  const derived = deriveDIQuestionScoringHints(question);

  return {
    question_id: normalizeTextValue(question?.id),
    title: derived.title,
    question_content: derived.questionContent,
    image_type: derived.imageType,
    metadata_quality: derived.metadataQuality,
    key_points: derived.keyPoints,
    key_terms: derived.keyTerms,
    key_elements: derived.keyElements,
    relations: derived.relations,
    implications_or_conclusion: derived.implicationsOrConclusion,
    numbers_or_extremes: derived.numbersOrExtremes,
    sequence_or_trend: derived.sequenceOrTrend,
    comparison_axes: derived.comparisonAxes,
    visual_features: {
      has_trend: Boolean(derived.visualFeatures.hasTrend),
      has_comparison: Boolean(derived.visualFeatures.hasComparison),
      has_extreme: Boolean(derived.visualFeatures.hasExtreme),
      has_numbers: Boolean(derived.visualFeatures.hasNumbers)
    }
  };
}

export function buildDIQuestionSnapshot(question = {}, questionMeta = null) {
  const meta = normalizeDIQuestionMeta(questionMeta || buildDIQuestionMetaPayload(question));
  return {
    id: normalizeTextValue(question?.id || meta.question_id),
    topic: normalizeTextValue(question?.topic || meta.title),
    display_title: normalizeTextValue(question?.displayTitle || question?.topic || meta.title),
    source_number_label: normalizeTextValue(question?.sourceNumberLabel),
    image_type: normalizeTextValue(question?.imageType || meta.image_type).toLowerCase(),
    image_url: normalizeTextValue(question?.imageUrl),
    image_alt: normalizeTextValue(question?.imageAlt || question?.displayTitle || question?.topic || meta.title),
    question_content: normalizeQuestionContent(question?.content || meta.question_content),
    metadata_quality: normalizeTextValue(meta.metadata_quality),
    key_points: [...meta.key_points],
    key_terms: [...meta.key_terms],
    key_elements: [...meta.key_elements],
    relations: [...meta.relations],
    implications_or_conclusion: [...meta.implications_or_conclusion],
    numbers_or_extremes: [...meta.numbers_or_extremes],
    sequence_or_trend: [...meta.sequence_or_trend],
    comparison_axes: [...meta.comparison_axes],
    visual_features: {
      ...meta.visual_features
    }
  };
}

export function buildDIAudioSignalsPayload(stopResult = {}, recordingDurationSec = 0) {
  const durationSec = Math.max(
    0,
    Math.round(Number(stopResult?.playableDurationSec || recordingDurationSec || 0))
  );
  const transcriptWordCount = countTranscriptWords(stopResult?.transcript);
  const speechRateWps = durationSec > 0
    ? roundMetric(transcriptWordCount / Math.max(durationSec, 1), 2)
    : 0;
  return {
    duration_sec: durationSec,
    duration_ms: Math.max(
      0,
      Math.round(Number(stopResult?.durationMs || durationSec * 1000 || 0))
    ),
    non_silent_frame_ratio: clampRatio(stopResult?.nonSilentFrameRatio),
    silence_frame_ratio: clampRatio(stopResult?.silenceFrameRatio ?? (1 - Number(stopResult?.nonSilentFrameRatio || 0))),
    peak_amplitude: clampMetric(stopResult?.peakAmplitude, 0, 1, 4),
    rms_amplitude: clampMetric(stopResult?.rmsAmplitude, 0, 1, 4),
    mean_abs_amplitude: clampMetric(stopResult?.meanAbsAmplitude, 0, 1, 4),
    amplitude_dynamic_range: clampMetric(stopResult?.amplitudeDynamicRange, 0, 1, 4),
    transcript_word_count: Math.max(0, Math.round(Number(transcriptWordCount || 0))),
    speech_rate_wps: clampMetric(speechRateWps, 0, 8, 2),
    sample_rate: Math.max(0, Math.round(Number(stopResult?.sampleRate || 0))),
    channel_count: Math.max(0, Math.round(Number(stopResult?.channelCount || 0))),
    final_usable_reason: normalizeTextValue(stopResult?.finalUsableReason || stopResult?.stopErrorCode),
    has_usable_audio: stopResult?.hasUsableAudio == null ? true : Boolean(stopResult?.hasUsableAudio),
    playback_usable: stopResult?.finalPlaybackUsable == null ? true : Boolean(stopResult?.finalPlaybackUsable)
  };
}

export function normalizeDIAudioSignals(rawValue) {
  const source = toObjectValue(rawValue) || {};
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
    non_silent_frame_ratio: clampRatio(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio),
    silence_frame_ratio: clampRatio(
      source?.silence_frame_ratio
      ?? source?.silenceFrameRatio
      ?? (1 - Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0))
    ),
    peak_amplitude: clampMetric(source?.peak_amplitude ?? source?.peakAmplitude, 0, 1, 4),
    rms_amplitude: clampMetric(source?.rms_amplitude ?? source?.rmsAmplitude, 0, 1, 4),
    mean_abs_amplitude: clampMetric(source?.mean_abs_amplitude ?? source?.meanAbsAmplitude, 0, 1, 4),
    amplitude_dynamic_range: clampMetric(
      source?.amplitude_dynamic_range ?? source?.amplitudeDynamicRange,
      0,
      1,
      4
    ),
    transcript_word_count: transcriptWordCount,
    speech_rate_wps: clampMetric(
      source?.speech_rate_wps
      ?? source?.speechRateWps
      ?? (durationSec > 0 ? transcriptWordCount / Math.max(durationSec, 1) : 0),
      0,
      8,
      2
    ),
    sample_rate: Math.max(0, Math.round(Number(source?.sample_rate ?? source?.sampleRate ?? 0))),
    channel_count: Math.max(0, Math.round(Number(source?.channel_count ?? source?.channelCount ?? 0))),
    final_usable_reason: normalizeTextValue(source?.final_usable_reason ?? source?.finalUsableReason),
    has_usable_audio: hasUsableAudioRaw == null ? true : Boolean(hasUsableAudioRaw),
    playback_usable: playbackUsableRaw == null ? true : Boolean(playbackUsableRaw)
  };
}

export function getDIReviewFromScoreJson(scoreJson) {
  return toObjectValue(parseDIScoreJson(scoreJson)?.ai_review) || null;
}

export function getDIAiReviewJob(scoreJson) {
  const source = toObjectValue(parseDIScoreJson(scoreJson)?.ai_review_job) || {};
  return {
    status: normalizeDIAiReviewJobStatus(source?.status),
    request_id: normalizeTextValue(source?.request_id || source?.requestId),
    attempts: Math.max(0, Math.round(Number(source?.attempts || 0))),
    created_at: normalizeTextValue(source?.created_at || source?.createdAt),
    started_at: normalizeTextValue(source?.started_at || source?.startedAt),
    updated_at: normalizeTextValue(source?.updated_at || source?.updatedAt),
    completed_at: normalizeTextValue(source?.completed_at || source?.completedAt),
    final_status: normalizeDIReviewStatus(source?.final_status || source?.finalStatus),
    fallback_reason: normalizeTextValue(source?.fallback_reason || source?.fallbackReason),
    last_error_code: normalizeTextValue(source?.last_error_code || source?.lastErrorCode),
    last_error_message: normalizeTextValue(source?.last_error_message || source?.lastErrorMessage)
  };
}

export function isDIAiReviewComplete(aiReview) {
  const status = normalizeDIReviewStatus(aiReview?.status);
  return status === DI_SCORE_STATUS_SCORED || status === DI_SCORE_STATUS_DEGRADED || status === DI_SCORE_STATUS_FAILED;
}

export function isDIReviewReadyFromLog(logRow) {
  return isDIAiReviewComplete(getDIReviewFromScoreJson(logRow?.score_json));
}

export function isDIReviewFailedFromLog(logRow) {
  if (!logRow) return false;
  const reviewStatus = normalizeDIReviewStatus(getDIReviewFromScoreJson(logRow?.score_json)?.status);
  if (reviewStatus === DI_SCORE_STATUS_FAILED) return true;
  return getDIAiReviewJob(logRow?.score_json).status === DI_AI_REVIEW_JOB_FAILED;
}

export function shouldRedirectDIResultToAnalyzing(logRow) {
  if (!logRow) return false;
  if (isDIReviewReadyFromLog(logRow)) return false;
  if (isDIReviewJobStalled(logRow)) return false;
  const job = getDIAiReviewJob(logRow?.score_json);
  return job.status === DI_AI_REVIEW_JOB_PENDING || job.status === DI_AI_REVIEW_JOB_RUNNING;
}

export function isDIReviewJobStalled(
  logRow,
  {
    nowMs = Date.now(),
    thresholdMs = DI_AI_REVIEW_STALL_THRESHOLD_MS
  } = {}
) {
  if (!logRow) return false;
  const job = getDIAiReviewJob(logRow?.score_json);
  if (job.status !== DI_AI_REVIEW_JOB_PENDING && job.status !== DI_AI_REVIEW_JOB_RUNNING) {
    return false;
  }
  const referenceMs = parseIsoToMs(
    job.updated_at
    || job.started_at
    || job.created_at
    || normalizeTextValue(logRow?.created_at)
  );
  if (!referenceMs) return false;
  return nowMs - referenceMs >= Math.max(1000, Number(thresholdMs || DI_AI_REVIEW_STALL_THRESHOLD_MS));
}

export function createPendingDIAiReviewJob() {
  const nowIso = new Date().toISOString();
  return {
    status: DI_AI_REVIEW_JOB_PENDING,
    request_id: "",
    attempts: 0,
    created_at: nowIso,
    started_at: "",
    updated_at: nowIso,
    completed_at: "",
    final_status: DI_SCORE_STATUS_PENDING,
    fallback_reason: "",
    last_error_code: "",
    last_error_message: ""
  };
}

export function buildDIAiReviewJobState({
  previousJob = null,
  status = DI_AI_REVIEW_JOB_PENDING,
  requestId = "",
  finalStatus = DI_SCORE_STATUS_PENDING,
  fallbackReason = "",
  lastErrorCode = "",
  lastErrorMessage = ""
} = {}) {
  const previous = toObjectValue(previousJob) || {};
  const nowIso = new Date().toISOString();
  const normalizedStatus = normalizeDIAiReviewJobStatus(status);
  const attempts = normalizedStatus === DI_AI_REVIEW_JOB_RUNNING
    ? Math.max(0, Math.round(Number(previous?.attempts || 0))) + 1
    : Math.max(0, Math.round(Number(previous?.attempts || 0)));
  const isTerminalStatus = normalizedStatus === DI_AI_REVIEW_JOB_COMPLETED || normalizedStatus === DI_AI_REVIEW_JOB_FAILED;
  return {
    status: normalizedStatus,
    request_id: normalizeTextValue(requestId || previous?.request_id || previous?.requestId),
    attempts,
    created_at: normalizeTextValue(previous?.created_at || previous?.createdAt) || nowIso,
    started_at: normalizedStatus === DI_AI_REVIEW_JOB_RUNNING
      ? (normalizeTextValue(previous?.started_at || previous?.startedAt) || nowIso)
      : normalizeTextValue(previous?.started_at || previous?.startedAt),
    updated_at: nowIso,
    completed_at: isTerminalStatus ? nowIso : "",
    final_status: normalizeDIReviewStatus(finalStatus || previous?.final_status || previous?.finalStatus),
    fallback_reason: normalizeTextValue(fallbackReason || previous?.fallback_reason || previous?.fallbackReason),
    last_error_code: normalizeTextValue(lastErrorCode || previous?.last_error_code || previous?.lastErrorCode),
    last_error_message: normalizeTextValue(lastErrorMessage || previous?.last_error_message || previous?.lastErrorMessage)
  };
}

export function mergeDIScoreJson(baseScoreJson, aiReview, aiReviewJob) {
  const safeBase = parseDIScoreJson(baseScoreJson);
  const merged = { ...safeBase };
  if (aiReview !== undefined) {
    merged.ai_review = toObjectValue(aiReview) || {};
  }
  if (aiReviewJob !== undefined) {
    merged.ai_review_job = toObjectValue(aiReviewJob) || createPendingDIAiReviewJob();
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

export async function fetchDIPracticeLog(logId) {
  const normalizedLogId = normalizeTextValue(logId);
  if (!normalizedLogId) return null;
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, user_id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("id", normalizedLogId)
    .eq("task_type", "DI")
    .maybeSingle();
  if (error) {
    const wrapped = new Error(normalizeTextValue(error?.message) || "practice_logs_read_failed");
    wrapped.cause = error;
    throw wrapped;
  }
  return data || null;
}

export async function patchDIPracticeLog({
  logId = "",
  userId = "",
  transcript = "",
  scoreJson = null,
  feedback = ""
} = {}) {
  const normalizedLogId = normalizeTextValue(logId);
  const normalizedUserId = normalizeTextValue(userId) || await resolveCurrentUserId();
  if (!normalizedLogId || !normalizedUserId) {
    throw new Error("DI_LOG_UPDATE_MISSING_CONTEXT");
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
    .eq("task_type", "DI")
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

export function buildDIReviewContext({ logRow = null, question = null } = {}) {
  const scoreJson = parseDIScoreJson(logRow?.score_json);
  const questionSnapshot = normalizeDIQuestionSnapshot(
    scoreJson?.question
    || question
    || {}
  );
  const questionMetaFromLog = normalizeDIQuestionMeta(scoreJson?.question_meta || scoreJson?.question || {});
  const questionMetaFromQuestion = normalizeDIQuestionMeta(
    question ? buildDIQuestionMetaPayload(question) : questionSnapshot
  );
  const questionMeta = {
    question_id: questionMetaFromLog.question_id || questionSnapshot.id || questionMetaFromQuestion.question_id,
    title: questionMetaFromLog.title || questionSnapshot.topic || questionMetaFromQuestion.title,
    question_content: questionMetaFromLog.question_content || questionSnapshot.questionContent || questionMetaFromQuestion.question_content,
    image_type: questionMetaFromLog.image_type || questionSnapshot.imageType || questionMetaFromQuestion.image_type,
    metadata_quality: questionMetaFromLog.metadata_quality || questionSnapshot.metadataQuality || questionMetaFromQuestion.metadata_quality,
    key_points: questionMetaFromLog.key_points.length ? questionMetaFromLog.key_points : questionMetaFromQuestion.key_points,
    key_terms: questionMetaFromLog.key_terms.length ? questionMetaFromLog.key_terms : questionMetaFromQuestion.key_terms,
    key_elements: questionMetaFromLog.key_elements.length ? questionMetaFromLog.key_elements : questionMetaFromQuestion.key_elements,
    relations: questionMetaFromLog.relations.length ? questionMetaFromLog.relations : questionMetaFromQuestion.relations,
    implications_or_conclusion: questionMetaFromLog.implications_or_conclusion.length
      ? questionMetaFromLog.implications_or_conclusion
      : questionMetaFromQuestion.implications_or_conclusion,
    numbers_or_extremes: questionMetaFromLog.numbers_or_extremes.length
      ? questionMetaFromLog.numbers_or_extremes
      : questionMetaFromQuestion.numbers_or_extremes,
    sequence_or_trend: questionMetaFromLog.sequence_or_trend.length
      ? questionMetaFromLog.sequence_or_trend
      : questionMetaFromQuestion.sequence_or_trend,
    comparison_axes: questionMetaFromLog.comparison_axes.length
      ? questionMetaFromLog.comparison_axes
      : questionMetaFromQuestion.comparison_axes,
    visual_features: Object.values(questionMetaFromLog.visual_features).some(Boolean)
      ? questionMetaFromLog.visual_features
      : questionMetaFromQuestion.visual_features
  };
  return {
    logId: normalizeTextValue(logRow?.id),
    userId: normalizeTextValue(logRow?.user_id),
    transcript: normalizeTextValue(logRow?.transcript),
    scoreJson,
    questionId: normalizeTextValue(logRow?.question_id || questionSnapshot.id),
    questionSnapshot,
    questionContent: normalizeQuestionContent(
      scoreJson?.question_content
      || questionSnapshot.questionContent
      || questionMeta.question_content
    ),
    questionMeta,
    audioSignals: normalizeDIAudioSignals(scoreJson?.audio_signals),
    aiReview: getDIReviewFromScoreJson(scoreJson)
  };
}

export function createDIClientDegradedReview({
  transcript = "",
  questionMeta = null,
  audioSignals = null,
  reasonCode = "ai_review_unavailable",
  requestId = ""
} = {}) {
  return buildDIClientFallbackReview({
    status: DI_SCORE_STATUS_DEGRADED,
    transcript,
    questionMeta,
    audioSignals,
    reasonCode,
    requestId
  });
}

export function buildDIClientFailedResult({
  transcript = "",
  questionMeta = null,
  audioSignals = null,
  reasonCode = "score_api_failed",
  requestId = ""
} = {}) {
  return buildDIClientFallbackReview({
    status: DI_SCORE_STATUS_FAILED,
    transcript,
    questionMeta,
    audioSignals,
    reasonCode,
    requestId
  });
}

export async function requestDIScore({
  transcript = "",
  questionContent = "",
  questionMeta = null,
  audioSignals = null,
  requestId = ""
} = {}) {
  const authStore = useAuthStore();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error("DI_SCORE_AUTH_SESSION_ERROR");
  }
  const token = normalizeTextValue(sessionData?.session?.access_token || authStore.session?.access_token);
  if (!token) {
    throw new Error("DI_SCORE_AUTH_SESSION_MISSING");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DI_SCORE_API_TIMEOUT_MS);

  try {
    const response = await fetch(getApiUrl("/api/score"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        taskType: "DI",
        transcript: normalizeTextValue(transcript),
        questionContent: normalizeTextValue(questionContent),
        question_meta: normalizeDIQuestionMeta(questionMeta),
        audio_signals: normalizeDIAudioSignals(audioSignals),
        request_id: normalizeTextValue(requestId) || `di_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }),
      signal: controller.signal
    });

    const payload = await readDIScoreApiResponse(response);

    if (response.status === 401) {
      throw new Error("DI_SCORE_AUTH_SESSION_EXPIRED");
    }
    if (!response.ok) {
      throw new Error(normalizeTextValue(payload?.error) || `DI_SCORE_API_${response.status}`);
    }

    return toObjectValue(payload) || {};
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("DI_SCORE_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function ensureDIReviewForLog({ logRow = null, question = null } = {}) {
  const context = buildDIReviewContext({ logRow, question });
  if (!context.logId) {
    throw new Error("DI_REVIEW_LOG_ID_MISSING");
  }
  const currentJob = getDIAiReviewJob(context.scoreJson);
  if (isDIAiReviewComplete(context.aiReview) || currentJob.status === DI_AI_REVIEW_JOB_FAILED) {
    const terminalReview = isDIAiReviewComplete(context.aiReview)
      ? context.aiReview
      : buildDIClientFailedResult({
        transcript: context.transcript,
        questionMeta: context.questionMeta,
        audioSignals: context.audioSignals,
        reasonCode: currentJob.last_error_code || currentJob.fallback_reason || "practice_logs_update_failed"
      });
    return {
      status: normalizeDIReviewStatus(terminalReview?.status),
      review: terminalReview,
      logId: context.logId,
      scoreJson: context.scoreJson
    };
  }
  if (inflightDIReviewMap.has(context.logId)) {
    return inflightDIReviewMap.get(context.logId);
  }

  const jobPromise = runDIReviewForLog(context).finally(() => {
    inflightDIReviewMap.delete(context.logId);
  });
  inflightDIReviewMap.set(context.logId, jobPromise);
  return jobPromise;
}

export function clearDIReviewInflight(logId = "") {
  const normalizedLogId = normalizeTextValue(logId);
  if (!normalizedLogId) return;
  inflightDIReviewMap.delete(normalizedLogId);
}

export async function finalizeDIReviewAsDegraded({
  logRow = null,
  question = null,
  reasonCode = "ai_review_timeout"
} = {}) {
  const context = buildDIReviewContext({ logRow, question });
  const userId = normalizeTextValue(context.userId) || await resolveCurrentUserId();
  if (!context.logId || !userId) {
    throw new Error("DI_REVIEW_FINALIZE_MISSING_CONTEXT");
  }
  const degradedReview = createDIClientDegradedReview({
    transcript: context.transcript,
    questionMeta: context.questionMeta,
    audioSignals: context.audioSignals,
    reasonCode
  });
  const completedJob = buildDIAiReviewJobState({
    previousJob: getDIAiReviewJob(context.scoreJson),
    status: DI_AI_REVIEW_JOB_COMPLETED,
    finalStatus: degradedReview.status,
    fallbackReason: degradedReview.fallback_reason,
    lastErrorCode: degradedReview.fallback_reason,
    lastErrorMessage: degradedReview.reason_message_zh
  });
  const finalScoreJson = mergeDIScoreJson(context.scoreJson, degradedReview, completedJob);
  await patchDIPracticeLog({
    logId: context.logId,
    userId,
    transcript: context.transcript,
    scoreJson: finalScoreJson,
    feedback: normalizeTextValue(degradedReview?.feedback_zh || degradedReview?.feedback)
  });
  return {
    status: DI_SCORE_STATUS_DEGRADED,
    review: degradedReview,
    logId: context.logId,
    userId,
    scoreJson: finalScoreJson
  };
}

export function getDIFallbackReasonMessage(reasonCode = "") {
  return DI_REASON_MESSAGE_MAP[normalizeDIReasonCode(reasonCode)] || DI_REASON_MESSAGE_MAP.ai_review_unavailable;
}

export function mapDIReasonCodeToZh(reasonCode = "") {
  return getDIFallbackReasonMessage(reasonCode);
}

function normalizeQuestionContent(value) {
  const text = normalizeTextValue(value);
  if (!text) return "";
  if (text.toLowerCase() === GENERIC_DI_PROMPT) return "";
  return text;
}

function countTranscriptWords(text) {
  return (`${text || ""}`.trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
}

function clampMetric(value, min = 0, max = 1, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  const bounded = Math.max(min, Math.min(max, num));
  return Number(bounded.toFixed(digits));
}

function roundMetric(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
}

function normalizeStringList(value, limit = 6) {
  return uniqueTextList(value, limit);
}

function normalizeKeyPointList(value, limit = 6) {
  return uniqueTextList(value, limit * 2)
    .filter((item) => !isWeakMetadataDescriptor(item))
    .slice(0, limit);
}

function normalizeLooseText(value) {
  if (typeof value === "string") return normalizeTextValue(value);
  if (!value || typeof value !== "object") return "";
  return normalizeTextValue(
    value.text
    || value.label
    || value.title
    || value.name
    || value.head
    || value.point
    || value.keyword
    || value.word
    || value.value
  );
}

function uniqueTextList(value, limit = 8) {
  const list = [];
  const seen = new Set();
  const source = Array.isArray(value) ? value : [value];

  source.forEach((item) => {
    const text = normalizeLooseText(item);
    if (!text) return;
    const lower = text.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    list.push(text);
  });

  return list.slice(0, limit);
}

function pickFirstNonEmptyList(...candidates) {
  for (const candidate of candidates) {
    const normalized = uniqueTextList(candidate, 12);
    if (normalized.length) return normalized;
  }
  return [];
}

function isWeakMetadataDescriptor(text = "") {
  const normalized = normalizeTextValue(text).toLowerCase();
  if (!normalized) return true;
  return DI_META_NOISE_TERMS.has(normalized);
}

function isGenericMetadataDescriptor(text = "") {
  const normalized = normalizeTextValue(text).toLowerCase();
  if (!normalized) return true;
  return DI_META_GENERIC_TERMS.has(normalized);
}

function prioritizeKeyTerms(values = [], limit = 8) {
  const unique = uniqueTextList(values, limit * 2);
  const specific = unique.filter((item) => !isGenericMetadataDescriptor(item));
  const generic = unique.filter((item) => isGenericMetadataDescriptor(item));
  return [...specific, ...generic].slice(0, limit);
}

function normalizeVisualFeatures(value, imageType = "") {
  const source = toObjectValue(value) || {};
  const normalizedImageType = normalizeTextValue(imageType).toLowerCase();
  const inferred = inferVisualFeaturesByImageType(normalizedImageType);
  const sourceAllTrue = ["hasTrend", "hasComparison", "hasExtreme", "hasNumbers"].every((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    return Boolean(source?.[key] ?? source?.[snakeKey]);
  });
  if (sourceAllTrue && (normalizedImageType === "process" || normalizedImageType === "map")) {
    return { ...inferred };
  }
  return {
    hasTrend: source.hasTrend ?? source.has_trend ?? inferred.hasTrend,
    hasComparison: source.hasComparison ?? source.has_comparison ?? inferred.hasComparison,
    hasExtreme: source.hasExtreme ?? source.has_extreme ?? inferred.hasExtreme,
    hasNumbers: source.hasNumbers ?? source.has_numbers ?? inferred.hasNumbers
  };
}

function inferVisualFeaturesByImageType(imageType = "") {
  if (["bar", "line", "pie", "table", "mixed"].includes(imageType)) {
    return { hasTrend: true, hasComparison: true, hasExtreme: true, hasNumbers: true };
  }
  if (imageType === "process") {
    return { hasTrend: false, hasComparison: false, hasExtreme: false, hasNumbers: false };
  }
  if (imageType === "map") {
    return { hasTrend: false, hasComparison: true, hasExtreme: false, hasNumbers: false };
  }
  return { hasTrend: false, hasComparison: false, hasExtreme: false, hasNumbers: false };
}

function stripDITypePrefix(text = "") {
  return normalizeTextValue(text).replace(/^(map|line chart|bar chart|pie chart|table|process diagram|mixed chart)\s*:\s*/i, "").trim();
}

function extractTopicTerms(title = "") {
  const core = stripDITypePrefix(title);
  if (!core) return [];

  return uniqueTextList([
    core,
    ...core.split(/\s+vs\.?\s+/i),
    ...core.split(/[|,/]/),
    ...core.split(/\s+and\s+/i)
  ], 6);
}

function extractVsPair(title = "", keyTerms = []) {
  const core = stripDITypePrefix(title);
  const matched = core.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (matched) {
    return uniqueTextList([matched[1], matched[2]], 2);
  }

  return prioritizeKeyTerms(keyTerms, 4)
    .filter((item) => !isGenericMetadataDescriptor(item))
    .slice(0, 2);
}

function extractNumberTokens(texts = []) {
  const source = texts
    .map((item) => normalizeTextValue(item))
    .filter(Boolean)
    .join(" | ");
  if (!source) return [];

  const pattern = /\b\d+(?:\.\d+)?(?:\s?(?:%|percent|m|km|cm|mm|years?|months?|days?|hours?|minutes?|mins?|seconds?|kg|g|tons?|million|billion|miles?|meters?|metres?))?\b/gi;
  const matched = source.match(pattern) || [];
  return uniqueTextList(matched, 6);
}

function buildTypeSpecificDescriptors({
  imageType = "",
  pairTerms = [],
  specificTerms = [],
  numbers = [],
  visualFeatures = {}
} = {}) {
  const pairLabel = pairTerms.length >= 2
    ? `${pairTerms[0]} versus ${pairTerms[1]}`
    : "the main categories";
  const mainTerm = specificTerms[0] || "the key feature";

  if (imageType === "process") {
    return {
      relations: [
        `show how ${mainTerm} moves from one stage to the next`,
        "connect the start, middle and end of the process"
      ],
      implicationsOrConclusion: [
        "overall the process moves from input to output",
        "summarize the final result or ending stage"
      ],
      numbersOrExtremes: numbers,
      sequenceOrTrend: [
        "first stage",
        "next stage",
        "final stage",
        "step by step"
      ],
      comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : []
    };
  }

  if (imageType === "map") {
    return {
      relations: [
        `describe where ${mainTerm} is located in the area`,
        "compare positions across the map or layout"
      ],
      implicationsOrConclusion: [
        "overall the layout or distribution is clear",
        "highlight the central or most noticeable area"
      ],
      numbersOrExtremes: [
        ...numbers,
        ...(visualFeatures.hasExtreme ? ["largest area", "smallest area"] : [])
      ],
      sequenceOrTrend: [
        "left and right",
        "top and bottom",
        "near the center"
      ],
      comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : ["left side and right side", "top area and bottom area"]
    };
  }

  if (imageType === "line") {
    return {
      relations: [
        `compare ${pairLabel} across the period`,
        "describe peaks, lows and turning points"
      ],
      implicationsOrConclusion: [
        "overall the trend direction is clear",
        "summarize the ending position or main turning point"
      ],
      numbersOrExtremes: [
        ...numbers,
        "highest point",
        "lowest point"
      ],
      sequenceOrTrend: [
        "over time",
        "upward trend",
        "downward trend",
        "fluctuation"
      ],
      comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : ["across different years", "between the main series"]
    };
  }

  if (imageType === "pie") {
    return {
      relations: [
        `compare ${pairLabel} by share or percentage`,
        "mention the largest and smallest segments"
      ],
      implicationsOrConclusion: [
        "overall one segment accounts for the biggest proportion",
        "summarize the overall composition of the whole"
      ],
      numbersOrExtremes: [
        ...numbers,
        "largest share",
        "smallest share",
        "percentage gap"
      ],
      sequenceOrTrend: [
        "share of the whole",
        "percentage distribution"
      ],
      comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : ["across the major segments", "between the main portions"]
    };
  }

  if (imageType === "bar" || imageType === "table" || imageType === "mixed") {
    return {
      relations: [
        `compare ${pairLabel}`,
        "identify the highest and lowest figures"
      ],
      implicationsOrConclusion: [
        "overall one category stands out from the rest",
        "summarize the main difference or ranking"
      ],
      numbersOrExtremes: [
        ...numbers,
        "highest value",
        "lowest value"
      ],
      sequenceOrTrend: visualFeatures.hasTrend
        ? ["rise or fall over time", "overall trend"]
        : ["main ranking", "overall comparison"],
      comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : ["across categories", "between groups"]
    };
  }

  return {
    relations: [
      `compare ${pairLabel}`,
      "describe the main relationship between features"
    ],
    implicationsOrConclusion: [
      "overall the main pattern is clear",
      "summarize the most noticeable result"
    ],
    numbersOrExtremes: numbers,
    sequenceOrTrend: visualFeatures.hasTrend ? ["overall trend"] : [],
    comparisonAxes: pairTerms.length >= 2 ? [pairLabel] : []
  };
}

export function deriveDIQuestionScoringHints(question = {}) {
  const title = normalizeTextValue(question?.topic || question?.title || question?.displayTitle || question?.display_title || question?.id);
  const questionContent = normalizeQuestionContent(
    question?.content || question?.questionContent || question?.question_content
  );
  const imageType = normalizeTextValue(question?.imageType || question?.image_type).toLowerCase();
  const visualFeatures = normalizeVisualFeatures(question?.visualFeatures || question?.visual_features, imageType);
  const explicitKeyPoints = normalizeKeyPointList(
    pickFirstNonEmptyList(question?.keyPoints, question?.key_points),
    6
  );
  const directKeyTerms = normalizeStringList(
    pickFirstNonEmptyList(question?.keyTerms, question?.key_terms),
    8
  );
  const vocabKeyTerms = normalizeStringList(
    toArray(question?.highFrequencyWords).map((item) => item?.word || item),
    8
  );
  const titleTerms = extractTopicTerms(title);
  const keyTerms = prioritizeKeyTerms([...directKeyTerms, ...vocabKeyTerms, ...titleTerms], 8);
  const pairTerms = extractVsPair(title, keyTerms);
  const specificTerms = keyTerms.filter((item) => !isGenericMetadataDescriptor(item));
  const extractedNumbers = extractNumberTokens([
    title,
    questionContent,
    ...explicitKeyPoints,
    ...keyTerms,
    ...normalizeStringList(question?.numbersOrExtremes || question?.numbers_or_extremes, 6)
  ]);
  const typeSpecific = buildTypeSpecificDescriptors({
    imageType,
    pairTerms,
    specificTerms,
    numbers: extractedNumbers,
    visualFeatures
  });
  const explicitKeyElements = pickFirstNonEmptyList(question?.keyElements, question?.key_elements);
  const keyElements = uniqueTextList(
    explicitKeyElements.length
      ? explicitKeyElements
      : [...explicitKeyPoints, ...specificTerms, ...pairTerms],
    6
  );
  const relations = uniqueTextList(
    pickFirstNonEmptyList(question?.relations).length
      ? pickFirstNonEmptyList(question?.relations)
      : typeSpecific.relations,
    6
  );
  const implicationsOrConclusion = uniqueTextList(
    pickFirstNonEmptyList(question?.implicationsOrConclusion, question?.implications_or_conclusion).length
      ? pickFirstNonEmptyList(question?.implicationsOrConclusion, question?.implications_or_conclusion)
      : typeSpecific.implicationsOrConclusion,
    4
  );
  const numbersOrExtremes = uniqueTextList(
    pickFirstNonEmptyList(question?.numbersOrExtremes, question?.numbers_or_extremes).length
      ? pickFirstNonEmptyList(question?.numbersOrExtremes, question?.numbers_or_extremes)
      : typeSpecific.numbersOrExtremes,
    6
  );
  const sequenceOrTrend = uniqueTextList(
    pickFirstNonEmptyList(question?.sequenceOrTrend, question?.sequence_or_trend).length
      ? pickFirstNonEmptyList(question?.sequenceOrTrend, question?.sequence_or_trend)
      : typeSpecific.sequenceOrTrend,
    5
  );
  const comparisonAxes = uniqueTextList(
    pickFirstNonEmptyList(question?.comparisonAxes, question?.comparison_axes).length
      ? pickFirstNonEmptyList(question?.comparisonAxes, question?.comparison_axes)
      : typeSpecific.comparisonAxes,
    5
  );
  const explicitPointSource = pickFirstNonEmptyList(question?.keyPoints, question?.key_points);
  const keyPoints = normalizeKeyPointList(
    explicitPointSource.length
      ? explicitPointSource
      : [
        ...keyElements,
        ...relations.slice(0, 2),
        ...numbersOrExtremes.slice(0, 2),
        ...comparisonAxes.slice(0, 1)
      ],
    6
  );
  const metadataQuality = resolveMetadataQuality({
    title,
    questionContent,
    imageType,
    keyPoints,
    keyTerms,
    keyElements,
    relations,
    implicationsOrConclusion,
    numbersOrExtremes,
    sequenceOrTrend,
    comparisonAxes,
    visualFeatures
  });

  return {
    title,
    questionContent,
    imageType,
    metadataQuality,
    keyPoints,
    keyTerms,
    keyElements,
    relations,
    implicationsOrConclusion,
    numbersOrExtremes,
    sequenceOrTrend,
    comparisonAxes,
    visualFeatures
  };
}

function resolveMetadataQuality({
  title = "",
  questionContent = "",
  imageType = "",
  keyPoints = [],
  keyTerms = [],
  keyElements = [],
  relations = [],
  implicationsOrConclusion = [],
  numbersOrExtremes = [],
  sequenceOrTrend = [],
  comparisonAxes = [],
  visualFeatures = {}
} = {}) {
  let score = 0;
  if (normalizeTextValue(title)) score += 1;
  if (normalizeTextValue(questionContent)) score += 1;
  if (normalizeTextValue(imageType)) score += 1;
  if (keyPoints.length) score += 1;
  if (keyTerms.length >= 2) score += 1;
  if (keyElements.length >= 2) score += 1;
  if (relations.length || comparisonAxes.length) score += 1;
  if (implicationsOrConclusion.length || sequenceOrTrend.length) score += 1;
  if (numbersOrExtremes.length) score += 1;
  if (Object.values(visualFeatures).some(Boolean)) score += 1;
  if (score >= 7) return "strong";
  if (score >= 4) return "medium";
  return "limited";
}

function buildDIClientFallbackReview({
  status = DI_SCORE_STATUS_DEGRADED,
  transcript = "",
  questionMeta = null,
  audioSignals = null,
  reasonCode = "ai_review_unavailable",
  requestId = ""
} = {}) {
  const normalizedStatus = normalizeDIReviewStatus(status);
  const normalizedReasonCode = normalizeDIReasonCode(reasonCode);
  const feedbackZh = getDIFallbackReasonMessage(normalizedReasonCode);
  return {
    taskType: "DI",
    status: normalizedStatus,
    degraded: normalizedStatus === DI_SCORE_STATUS_DEGRADED,
    failed: normalizedStatus === DI_SCORE_STATUS_FAILED,
    is_estimated: true,
    review_label: resolveDIReviewLabel(normalizedStatus),
    reason_code: normalizedReasonCode,
    reason_codes: [normalizedReasonCode],
    reason_message_zh: feedbackZh,
    official_traits: {
      content: { score: 0, max: 6, judged: true },
      pronunciation: { score: 0, max: 5, judged: false },
      oral_fluency: { score: 0, max: 5, judged: false }
    },
    display_scores: {
      content: 10,
      pronunciation: 10,
      fluency: 10,
      overall: 10
    },
    scores: {
      content: 10,
      pronunciation: 10,
      fluency: 10
    },
    overall: 10,
    feedback_zh: feedbackZh,
    feedback: feedbackZh,
    better_response: buildFallbackBetterResponse(questionMeta, transcript),
    provider_used: "none",
    fallback_reason: normalizedReasonCode,
    request_id: normalizeTextValue(requestId),
    input_summary: toObjectValue(questionMeta) || null,
    audio_signals: toObjectValue(audioSignals) || null
  };
}

async function runDIReviewForLog(context) {
  const userId = normalizeTextValue(context.userId) || await resolveCurrentUserId();
  if (!userId) {
    throw new Error("DI_REVIEW_USER_ID_MISSING");
  }
  const requestId = `di_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runningJob = buildDIAiReviewJobState({
    previousJob: getDIAiReviewJob(context.scoreJson),
    status: DI_AI_REVIEW_JOB_RUNNING,
    requestId
  });
  const runningScoreJson = mergeDIScoreJson(context.scoreJson, context.aiReview, runningJob);

  try {
    await patchDIPracticeLog({
      logId: context.logId,
      userId,
      transcript: context.transcript,
      scoreJson: runningScoreJson,
      feedback: normalizeTextValue(context.scoreJson?.feedback)
    });
  } catch {
    // Best effort only. Final patch below is the source of truth.
  }

  let normalizedReview;
  try {
    const review = await requestDIScore({
      transcript: context.transcript,
      questionContent: context.questionContent,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      requestId
    });
    normalizedReview = toObjectValue(review) || createDIClientDegradedReview({
      transcript: context.transcript,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: "ai_review_parse_failed",
      requestId
    });
  } catch (error) {
    normalizedReview = createDIClientDegradedReview({
      transcript: context.transcript,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: normalizeDIReasonCode(error?.message || error),
      requestId
    });
  }

  const normalizedStatus = normalizeDIReviewStatus(normalizedReview?.status);
  const fallbackReason = normalizeTextValue(normalizedReview?.fallback_reason);
  const hasWarning = normalizedStatus === DI_SCORE_STATUS_DEGRADED || normalizedStatus === DI_SCORE_STATUS_FAILED;
  const completedJob = buildDIAiReviewJobState({
    previousJob: runningJob,
    status: DI_AI_REVIEW_JOB_COMPLETED,
    requestId,
    finalStatus: normalizedStatus,
    fallbackReason,
    lastErrorCode: hasWarning ? (fallbackReason || normalizedReview?.reason_code) : "",
    lastErrorMessage: hasWarning ? (normalizedReview?.reason_message_zh || getDIFallbackReasonMessage(fallbackReason)) : ""
  });
  const finalScoreJson = mergeDIScoreJson(runningScoreJson, normalizedReview, completedJob);
  const feedback = normalizeTextValue(
    normalizedReview?.feedback_zh
    || normalizedReview?.feedback
    || ""
  );

  try {
    await patchDIPracticeLog({
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
    const failedReason = normalizeDIReasonCode(
      finalPatchError?.message || "practice_logs_update_failed",
      finalPatchError?.raw_error_type
    );
    const failedReview = buildDIClientFailedResult({
      transcript: context.transcript,
      questionMeta: context.questionMeta,
      audioSignals: context.audioSignals,
      reasonCode: failedReason,
      requestId
    });
    const failedJob = buildDIAiReviewJobState({
      previousJob: completedJob,
      status: DI_AI_REVIEW_JOB_FAILED,
      requestId,
      finalStatus: failedReview.status,
      fallbackReason: failedReview.fallback_reason,
      lastErrorCode: failedReview.reason_code || failedReview.fallback_reason,
      lastErrorMessage: failedReview.reason_message_zh
    });
    const failedScoreJson = mergeDIScoreJson(runningScoreJson, failedReview, failedJob);
    const failedFeedback = normalizeTextValue(
      failedReview?.feedback_zh
      || failedReview?.feedback
      || ""
    );

    try {
      await patchDIPracticeLog({
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
      wrapped.raw_error_type = normalizeDIReasonCode(
        failedPatchError?.message || finalPatchError?.message,
        failedPatchError?.raw_error_type || finalPatchError?.raw_error_type
      );
      throw wrapped;
    }
  }
}

async function readDIScoreApiResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: response.ok ? "di_score_parse_failed" : "di_score_http_error",
      raw_text: text
    };
  }
}

function normalizeDIReasonCode(value = "", rawErrorType = "") {
  const normalized = normalizeTextValue(value || rawErrorType).toLowerCase();
  if (!normalized) return "score_api_failed";
  if (normalized.includes("practice_log_policy")) return "practice_log_policy_failed";
  if (normalized.includes("practice_log_insert")) return "practice_log_insert_failed";
  if (normalized.includes("audio_upload")) return "audio_upload_failed";
  if (normalized.includes("storage_policy")) return "storage_policy_failed";
  if (normalized.includes("storage_bucket")) return "storage_bucket_failed";
  if (normalized.includes("auth_session_failed")) return "auth_session_failed";
  if (normalized.includes("practice_logs_update_failed")) return "practice_logs_update_failed";
  if (normalized.includes("timeout")) return "ai_review_timeout";
  if (normalized.includes("access")) return "ai_review_unavailable";
  if (normalized.includes("expired")) return "auth_session_expired";
  if (normalized.includes("auth")) return "auth_session_missing";
  if (normalized.includes("api_key") || normalized.includes("key_missing") || normalized.includes("keys_missing")) {
    return "llm_api_keys_missing";
  }
  if (normalized.includes("http")) return "score_api_http_error";
  if (normalized.includes("parse") || normalized.includes("json")) return "ai_review_parse_failed";
  if (normalized.includes("provider") || normalized.includes("network")) return "ai_review_provider_error";
  if (normalized.includes("metadata")) return "metadata_insufficient";
  if (normalized.includes("audio")) return "audio_not_usable";
  if (normalized.includes("transcript") && normalized.includes("empty")) return "transcript_empty";
  if (normalized.includes("transcript") && normalized.includes("short")) return "transcript_too_short";
  return normalized;
}

function resolveDIReviewLabel(status = "") {
  if (status === DI_SCORE_STATUS_DEGRADED) return "AI评分（降级）";
  if (status === DI_SCORE_STATUS_FAILED) return "AI评分失败";
  return "AI评分（估分）";
}

function buildFallbackBetterResponse(questionMeta = null, transcript = "") {
  const imageType = normalizeTextValue(questionMeta?.image_type).toLowerCase();
  if (imageType === "process") {
    return "This image shows a process with several stages. Overall, the sequence moves step by step from the start to the end.";
  }
  if (imageType === "map") {
    return "This image shows the layout of an area. Overall, the main locations and their positions are clearly presented.";
  }
  if (imageType === "pie") {
    return "This pie chart compares several parts of the whole. Overall, one segment is the largest while another is much smaller.";
  }
  if (imageType === "bar" || imageType === "line" || imageType === "table" || imageType === "mixed") {
    return "This image compares several key figures. Overall, there is a clear difference and one item stands out the most.";
  }
  if (normalizeTextValue(transcript)) {
    return "This image presents several important features. Overall, the main pattern and the key comparison should be highlighted clearly.";
  }
  return "This image presents several important features. Overall, the key pattern and the main comparison should be stated clearly.";
}

function clampRatio(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function normalizeDIAiReviewJobStatus(value) {
  const normalized = normalizeTextValue(value).toLowerCase();
  if (normalized === DI_AI_REVIEW_JOB_RUNNING) return DI_AI_REVIEW_JOB_RUNNING;
  if (normalized === DI_AI_REVIEW_JOB_COMPLETED) return DI_AI_REVIEW_JOB_COMPLETED;
  if (normalized === DI_AI_REVIEW_JOB_FAILED) return DI_AI_REVIEW_JOB_FAILED;
  return DI_AI_REVIEW_JOB_PENDING;
}

function parseIsoToMs(value) {
  const text = normalizeTextValue(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
