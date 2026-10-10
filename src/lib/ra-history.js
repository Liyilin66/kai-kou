import { isRADiagnosis, diagnosisLabel, hasNumericScore, legacySpeakingDisplayOverall } from "./ra-diagnosis-score.js";
import { supabase } from "@/lib/supabase";

const PER_QUESTION_HISTORY_LIMIT = 10;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 30;

function createEmptyRAQuestionPerformance() {
  return {
    hasHistory: false,
    bestScore: null,
    lastScore: null,
    totalAttempts: 0,
    levelTag: "待提升"
  };
}

export async function fetchRAHistoryByQuestion(questionId) {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (!normalizedQuestionId) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, user_id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("task_type", "RA")
    .eq("user_id", userId)
    .eq("question_id", normalizedQuestionId)
    .order("created_at", { ascending: false })
    .limit(PER_QUESTION_HISTORY_LIMIT);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => normalizeRALog(row));
}

export async function fetchRAQuestionPerformance(questionId) {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (!normalizedQuestionId) return createEmptyRAQuestionPerformance();

  const userId = await getCurrentUserId();
  if (!userId) return createEmptyRAQuestionPerformance();

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, user_id, task_type, question_id, score_json, created_at")
    .eq("task_type", "RA")
    .eq("user_id", userId)
    .eq("question_id", normalizedQuestionId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return createEmptyRAQuestionPerformance();

  // Reuse normalizeRALog so score parsing and fallback behavior stay aligned with history list.
  const normalizedLogs = rows.map((row) => normalizeRALog(row));
  const totalAttempts = normalizedLogs.length;
  const scoredLogs = normalizedLogs.filter((log) => hasNumericScore(log.overall));
  const lastScore = scoredLogs[0]?.overall ?? null;
  const bestScore = scoredLogs.length ? Math.max(...scoredLogs.map((log) => log.overall)) : null;

  return {
    hasHistory: totalAttempts > 0,
    bestScore,
    lastScore,
    totalAttempts,
    diagnosisLabel: normalizedLogs[0]?.diagnosisLabel || "",
    levelTag: bestScore === null ? "诊断练习" : getRALevelTag(bestScore)
  };
}

export async function getRAPlaybackUrl(logOrAudioMeta, expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const userId = await getCurrentUserId();
  if (!userId) return "";

  const audioMeta = normalizeAudioMeta(logOrAudioMeta?.audio || logOrAudioMeta);
  if (!audioMeta) return "";
  if (audioMeta.bucket !== "practice-audio") return "";
  if (!audioMeta.path.startsWith(`ra/${userId}/`)) return "";

  const ttl = normalizeSignedUrlTtl(expiresIn);
  const { data, error } = await supabase.storage.from(audioMeta.bucket).createSignedUrl(audioMeta.path, ttl);
  if (error) {
    console.warn("RA playback signed URL failed:", error, {
      bucket: audioMeta.bucket,
      path: audioMeta.path
    });
    return "";
  }

  return `${data?.signedUrl || ""}`.trim();
}

export function hasRAAudio(log) {
  const audioMeta = normalizeAudioMeta(log?.audio || null);
  return Boolean(audioMeta);
}

export function normalizeRALog(row) {
  const scoreJson = toObject(row?.score_json);
  const nestedScores = toObject(scoreJson?.scores);
  const legacyScores = nestedScores || scoreJson;
  const diagnosis = isRADiagnosis(scoreJson);
  // Pronunciation is not assessed (docs/ra-scoring-rules.md); old rows' pronunciation numbers are not shown.
  const pronunciation = null;
  const fluency = diagnosis ? null : normalizeScore(legacyScores?.fluency);
  const content = diagnosis ? null : normalizeScore(legacyScores?.content);
  const overall = diagnosis ? null : (legacySpeakingDisplayOverall(scoreJson) ?? normalizeOverall(
    nestedScores?.overall ?? scoreJson?.overall,
    [fluency, content]
  ));
  const questionSnapshot = toObject(scoreJson?.questionSnapshot);
  const questionContent = `${questionSnapshot?.content || ""}`.trim();
  const audio = normalizeAudioMeta(scoreJson?.audio);

  return {
    id: row?.id ?? "",
    taskType: `${row?.task_type || "RA"}`.toUpperCase(),
    questionId: `${row?.question_id || ""}`.trim(),
    questionContent,
    transcript: `${row?.transcript || ""}`.trim(),
    feedback: `${row?.feedback || ""}`.trim(),
    createdAt: `${row?.created_at || ""}`.trim(),
    scores: {
      pronunciation,
      fluency,
      content
    },
    overall,
    analysisId: scoreJson?.analysis_id ? `${scoreJson.analysis_id || ""}` : "",
    diagnosisVersion: scoreJson?.diagnosis_version ? `${scoreJson.diagnosis_version || ""}` : "",
    diagnosisLabel: diagnosisLabel(scoreJson),
    metrics: scoreJson?.analysis_id ? toObject(scoreJson.metrics) : null,
    scoreVersion: scoreJson?.score_version || null,
    audio,
    questionSnapshot: questionSnapshot
      ? {
          id: `${questionSnapshot?.id || row?.question_id || ""}`.trim(),
          content: questionContent,
          taskType: `${questionSnapshot?.taskType || "RA"}`.trim() || "RA"
        }
      : null
  };
}

function normalizeAudioMeta(audio) {
  const value = toObject(audio);
  const bucket = `${value?.bucket || ""}`.trim();
  const path = `${value?.path || ""}`.trim();
  if (!bucket || !path) return null;

  return {
    bucket,
    path,
    mimeType: `${value?.mimeType || ""}`.trim(),
    size: normalizeNumber(value?.size, 0),
    uploadedAt: `${value?.uploadedAt || ""}`.trim()
  };
}

function normalizeSignedUrlTtl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SIGNED_URL_TTL_SECONDS;
  return Math.max(30, Math.min(60 * 60 * 24, Math.floor(parsed)));
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeScore(value) {
  if (!hasNumericScore(value)) return null;
  return Math.max(0, Math.min(90, Math.round(Number(value))));
}

function normalizeOverall(value, scores = []) {
  const parsed = hasNumericScore(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  const validScores = (Array.isArray(scores) ? scores : []).filter(hasNumericScore);
  if (!validScores.length) return null;
  const sum = validScores.reduce((total, score) => total + Number(score), 0);
  return Math.round(sum / validScores.length);
}

function getRALevelTag(bestScore) {
  const score = normalizeNumber(bestScore, 0);
  if (score >= 75) return "优秀";
  if (score >= 60) return "良好";
  return "待提升";
}

function toObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("RA history session read failed:", error);
    return "";
  }
  return `${data?.session?.user?.id || ""}`.trim();
}
