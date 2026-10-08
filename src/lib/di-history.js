import { supabase } from "@/lib/supabase";

const DEFAULT_HISTORY_LIMIT = 20;
const PRACTICE_AUDIO_BUCKET = "practice-audio";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 30;

function toObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeImageType(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function normalizeNullableBool(value) {
  if (value === true || value === false) return value;
  return null;
}

function normalizeRating(value) {
  const num = normalizeNumber(value, Number.NaN);
  if (!Number.isFinite(num)) return null;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function normalizeCount(value) {
  const num = normalizeNumber(value, Number.NaN);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function normalizeAudioMeta(audio) {
  const value = toObject(audio);
  const bucket = normalizeText(value?.bucket);
  const path = normalizeText(value?.path);
  if (!bucket || !path) return null;

  return {
    bucket,
    path,
    mimeType: normalizeText(value?.mimeType),
    size: Math.max(0, normalizeNumber(value?.size, 0)),
    uploadedAt: normalizeText(value?.uploadedAt)
  };
}

function normalizeScoreJson(rawValue) {
  const scoreJson = toObject(rawValue) || {};
  const question = toObject(scoreJson?.question) || {};
  const session = toObject(scoreJson?.session) || {};
  const metrics = toObject(scoreJson?.metrics) || {};
  const timestamps = toObject(scoreJson?.timestamps) || {};

  return {
    mode: normalizeText(scoreJson?.mode),
    question: {
      id: normalizeText(question?.id),
      imageType: normalizeImageType(question?.image_type),
      difficulty: normalizeNumber(question?.difficulty, 2),
      tags: toArray(question?.tags).map((item) => normalizeText(item).toLowerCase()).filter(Boolean),
      isHighFrequency: Boolean(question?.is_high_frequency)
    },
    session: {
      hintLevel: normalizeText(session?.hint_level).toLowerCase(),
      fiveSecondMode: Boolean(session?.five_second_mode),
      drillRound: Math.max(1, normalizeCount(session?.drill_round) || 1),
      drillTotalRounds: Math.max(1, normalizeCount(session?.drill_total_rounds) || 1),
      usedTemplateBlockIds: toArray(session?.used_template_block_ids).map((item) => normalizeText(item)).filter(Boolean)
    },
    metrics: {
      openedIn5s: normalizeNullableBool(metrics?.opened_in_5s),
      openDetectionMode: normalizeText(metrics?.open_detection_mode),
      speechDurationSec: Math.max(0, normalizeNumber(metrics?.speech_duration_sec, 0)),
      rescueUsedCount: normalizeCount(metrics?.rescue_used_count),
      selfFluencyRating: normalizeRating(metrics?.self_fluency_rating),
      selfStructureRating: normalizeRating(metrics?.self_structure_rating),
      selfFreezeCount: normalizeCount(metrics?.self_freeze_count)
    },
    timestamps: {
      practiceStartedAt: normalizeText(timestamps?.practice_started_at),
      practiceFinishedAt: normalizeText(timestamps?.practice_finished_at)
    },
    audio: normalizeAudioMeta(scoreJson?.audio)
  };
}

function normalizeDILog(row) {
  const score = normalizeScoreJson(row?.score_json);
  return {
    id: row?.id ?? "",
    taskType: normalizeText(row?.task_type).toUpperCase() || "DI",
    questionId: normalizeText(row?.question_id),
    transcript: normalizeText(row?.transcript),
    feedback: normalizeText(row?.feedback),
    createdAt: normalizeText(row?.created_at),
    score
  };
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("DI history session read failed:", error);
    return "";
  }
  return normalizeText(data?.session?.user?.id);
}

async function fetchDIRawLogs({ limit = DEFAULT_HISTORY_LIMIT, questionId = "" } = {}) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = supabase
    .from("practice_logs")
    .select("id, user_id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("task_type", "DI")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit || DEFAULT_HISTORY_LIMIT))));

  const normalizedQuestionId = normalizeText(questionId);
  if (normalizedQuestionId) {
    query = query.eq("question_id", normalizedQuestionId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("DI history load failed:", error, { questionId: normalizedQuestionId });
    return [];
  }

  const rows = toArray(data).map((row) => normalizeDILog(row));
  return rows;
}

function sanitizePathSegment(value) {
  const cleaned = normalizeText(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || "unknown";
}

function normalizeMimeType(value) {
  return normalizeText(value).toLowerCase();
}

function getAudioExtByMimeType(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function normalizeSignedUrlTtl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SIGNED_URL_TTL_SECONDS;
  return Math.max(30, Math.min(60 * 60 * 24, Math.floor(parsed)));
}

export function hasDIAudio(logOrAudioMeta) {
  const audioMeta = normalizeAudioMeta(
    logOrAudioMeta?.score?.audio || logOrAudioMeta?.audio || logOrAudioMeta
  );
  return Boolean(audioMeta);
}

export async function uploadDIAudio({ userId, questionId, blob } = {}) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) {
    return buildUploadFailureResult({
      reasonCode: "auth_session_failed",
      errorMessage: "missing_user_id"
    });
  }
  if (!blob || Number(blob?.size || 0) <= 0) {
    return buildUploadFailureResult({
      reasonCode: "audio_upload_failed",
      errorMessage: "missing_audio_blob"
    });
  }

  const mimeType = normalizeMimeType(blob?.type);
  const ext = getAudioExtByMimeType(mimeType);
  const safeQuestionId = sanitizePathSegment(questionId || "unknown");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const path = `di/${normalizedUserId}/${timestamp}-${safeQuestionId}-${randomSuffix}.${ext}`;

  try {
    const { error } = await supabase.storage.from(PRACTICE_AUDIO_BUCKET).upload(path, blob, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

    if (error) {
      console.warn("DI audio upload failed:", error, {
        path,
        mimeType,
        size: Number(blob?.size || 0)
      });
      return buildUploadFailureResult({
        reasonCode: normalizeDIAudioUploadFailureReason(error),
        errorMessage: normalizeText(error?.message || error?.error || error)
      });
    }

    return {
      bucket: PRACTICE_AUDIO_BUCKET,
      path,
      mimeType: mimeType || "",
      size: Number(blob?.size || 0),
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("DI audio upload error:", error, {
      path,
      mimeType,
      size: Number(blob?.size || 0)
    });
    return buildUploadFailureResult({
      reasonCode: normalizeDIAudioUploadFailureReason(error),
      errorMessage: normalizeText(error?.message || error)
    });
  }
}

function buildUploadFailureResult({ reasonCode = "", errorMessage = "" } = {}) {
  return {
    bucket: "",
    path: "",
    mimeType: "",
    size: 0,
    uploadedAt: "",
    reasonCode: normalizeText(reasonCode),
    errorMessage: normalizeText(errorMessage)
  };
}

function normalizeDIAudioUploadFailureReason(error) {
  const message = normalizeText(error?.message || error?.error || error).toLowerCase();
  if (!message) return "audio_upload_failed";
  if (
    message.includes("auth")
    || message.includes("token")
    || message.includes("jwt")
    || message.includes("session")
    || message.includes("unauthorized")
  ) {
    return "auth_session_failed";
  }
  if (
    message.includes("row-level security")
    || message.includes("policy")
    || message.includes("permission")
    || message.includes("forbidden")
    || message.includes("not allowed")
    || message.includes("access denied")
  ) {
    return "storage_policy_failed";
  }
  if (message.includes("bucket") || message.includes("not found")) {
    return "storage_bucket_failed";
  }
  return "audio_upload_failed";
}

export async function getDIPlaybackUrl(logOrAudioMeta, expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const userId = await getCurrentUserId();
  if (!userId) return "";

  const audioMeta = normalizeAudioMeta(
    logOrAudioMeta?.score?.audio || logOrAudioMeta?.audio || logOrAudioMeta
  );
  if (!audioMeta) return "";
  if (audioMeta.bucket !== PRACTICE_AUDIO_BUCKET) return "";
  if (!audioMeta.path.startsWith(`di/${userId}/`)) return "";

  const ttl = normalizeSignedUrlTtl(expiresIn);
  const { data, error } = await supabase.storage.from(audioMeta.bucket).createSignedUrl(audioMeta.path, ttl);
  if (error) {
    console.warn("DI playback signed URL failed:", error, {
      bucket: audioMeta.bucket,
      path: audioMeta.path
    });
    return "";
  }

  return normalizeText(data?.signedUrl);
}

export async function getDIHistorySummary({ limit = DEFAULT_HISTORY_LIMIT } = {}) {
  const logs = await fetchDIRawLogs({ limit });
  const practicedQuestionIds = [...new Set(logs.map((item) => item.questionId).filter(Boolean))];
  const attemptedCountByQuestionId = {};
  logs.forEach((item) => {
    const key = normalizeText(item.questionId);
    if (!key) return;
    attemptedCountByQuestionId[key] = (attemptedCountByQuestionId[key] || 0) + 1;
  });

  return {
    recentItems: logs,
    practicedQuestionIds,
    attemptedCountByQuestionId
  };
}

export async function getRecentDIPractices({ limit = 8 } = {}) {
  const logs = await fetchDIRawLogs({ limit });
  return logs;
}

function resolveWeaknessScore(log) {
  const metrics = log?.score?.metrics || {};
  let score = 0;
  if (metrics.openedIn5s === false) score += 2;

  if (Number.isFinite(Number(metrics.selfStructureRating))) {
    score += Math.max(0, 5 - Number(metrics.selfStructureRating));
  }

  if (Number.isFinite(Number(metrics.selfFluencyRating))) {
    score += Math.max(0, 5 - Number(metrics.selfFluencyRating));
  }

  score += Math.max(0, Number(metrics.selfFreezeCount || 0));
  return score;
}

export async function getDIWeaknessBoard({ limit = DEFAULT_HISTORY_LIMIT } = {}) {
  const logs = await fetchDIRawLogs({ limit });
  const buckets = new Map();

  logs.forEach((log) => {
    const imageType = normalizeImageType(log?.score?.question?.imageType);
    if (!imageType) return;

    if (!buckets.has(imageType)) {
      buckets.set(imageType, {
        imageType,
        totalScore: 0,
        attemptCount: 0,
        openedIn5sMisses: 0,
        lastPracticedAt: ""
      });
    }

    const bucket = buckets.get(imageType);
    const weakness = resolveWeaknessScore(log);
    bucket.totalScore += weakness;
    bucket.attemptCount += 1;
    if (log?.score?.metrics?.openedIn5s === false) {
      bucket.openedIn5sMisses += 1;
    }

    const currentDate = normalizeText(log?.createdAt);
    if (!bucket.lastPracticedAt || new Date(currentDate).getTime() > new Date(bucket.lastPracticedAt).getTime()) {
      bucket.lastPracticedAt = currentDate;
    }
  });

  return [...buckets.values()]
    .map((item) => ({
      imageType: item.imageType,
      weaknessScore: item.attemptCount ? Number((item.totalScore / item.attemptCount).toFixed(2)) : 0,
      attemptCount: item.attemptCount,
      openedIn5sMisses: item.openedIn5sMisses,
      lastPracticedAt: item.lastPracticedAt
    }))
    .sort((a, b) => {
      if (b.weaknessScore !== a.weaknessScore) return b.weaknessScore - a.weaknessScore;
      const timeA = new Date(a.lastPracticedAt).getTime() || 0;
      const timeB = new Date(b.lastPracticedAt).getTime() || 0;
      if (timeB !== timeA) return timeB - timeA;
      return b.attemptCount - a.attemptCount;
    });
}

export async function getWeakestDIImageType({ limit = DEFAULT_HISTORY_LIMIT } = {}) {
  const board = await getDIWeaknessBoard({ limit });
  return normalizeImageType(board[0]?.imageType);
}

export async function getDIQuestionHistory(questionId, { limit = 10 } = {}) {
  const normalizedQuestionId = normalizeText(questionId);
  if (!normalizedQuestionId) return [];
  return fetchDIRawLogs({
    questionId: normalizedQuestionId,
    limit: Math.max(1, Math.min(100, Number(limit || 10)))
  });
}
