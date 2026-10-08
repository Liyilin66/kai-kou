import { supabase } from "@/lib/supabase";

const DEFAULT_HISTORY_LIMIT = 60;
const WE_STATUS_SCORED = "scored";
const WE_STATUS_RULE_GATED = "rule_gated";
const WE_STATUS_AI_DEGRADED = "ai_review_degraded";
const WE_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";

function toObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function clampRange(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function getWordCount(text) {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function normalizeReasonCodes(value) {
  return toArray(value)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function mapGateReasonCodeToZh(code) {
  const map = {
    form_zero_word_count_too_short: "作文字数过少，未达到 WE 最低长度要求。",
    form_zero_word_count_too_long: "作文字数过多，超出 WE 推荐长度范围。",
    form_zero_all_caps: "全文大写会被判定为格式不合规。",
    form_zero_missing_punctuation: "标点过少，句子边界不清晰。",
    form_zero_bullets_or_fragmented_sentences: "内容过于碎片化或使用了项目符号，影响作文结构。",
    content_zero_off_topic: "内容与题目关联度不足，存在离题风险。",
    content_zero_template_not_filled: "模板占位内容未替换，作文未完成。",
    content_zero_no_meaningful_response: "有效内容不足，无法形成可评阅作文。",
    ai_review_unavailable: "AI评阅服务暂时不可用，本次已进入降级结果。"
  };

  return map[normalizeText(code)] || "本次作文触发规则限制，请根据建议重写后再提交。";
}

function normalizeWEStatus(rawStatus, reasonCodes, gateTriggered) {
  const normalizedStatus = normalizeText(rawStatus).toLowerCase();
  if (reasonCodes.includes(WE_AI_FALLBACK_REASON_CODE)) return WE_STATUS_AI_DEGRADED;
  if (normalizedStatus === WE_STATUS_AI_DEGRADED) return WE_STATUS_AI_DEGRADED;
  if (normalizedStatus === WE_STATUS_RULE_GATED) return WE_STATUS_RULE_GATED;
  if (normalizedStatus === WE_STATUS_SCORED) return WE_STATUS_SCORED;
  if (gateTriggered) return WE_STATUS_RULE_GATED;
  return WE_STATUS_SCORED;
}

function resolveStatusMeta(status) {
  if (status === WE_STATUS_SCORED) {
    return {
      label: "AI评阅完成",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }

  if (status === WE_STATUS_AI_DEGRADED) {
    return {
      label: "AI评阅降级",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700"
    };
  }

  return {
    label: "规则判定",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700"
  };
}

function normalizeSummary(summary, feedback, status) {
  const value = toObject(summary) || {};
  const strengths = toArray(value.strengths)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const improvements = toArray(value.improvements)
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const finalComment = normalizeText(value.final_comment || value.finalComment || feedback);

  let level = normalizeText(value.level);
  if (!level && status === WE_STATUS_AI_DEGRADED) level = "评阅降级";
  if (!level && status === WE_STATUS_RULE_GATED) level = "需重写";
  if (!level) level = "中等";

  return {
    level,
    strengths,
    improvements,
    finalComment
  };
}

function normalizeTraits(rawTraits) {
  const traits = toObject(rawTraits) || {};
  const keys = [
    "content",
    "form",
    "development_structure_coherence",
    "grammar",
    "general_linguistic_range",
    "vocabulary_range",
    "spelling"
  ];

  return keys
    .map((key) => {
      const value = toObject(traits[key]);
      if (!value) return null;
      const score = clampRange(value.score, 0, Number(value.max || 0), 0);
      const max = Math.max(0, Number(value.max || 0));
      if (!max) return null;
      return { key, score, max };
    })
    .filter(Boolean);
}

function normalizeWEHistoryRow(row) {
  const scoreJson = toObject(row?.score_json) || {};
  const gate = toObject(scoreJson.gate) || {};
  const gateTriggered = Boolean(gate.triggered);
  const reasonCodes = normalizeReasonCodes(gate.reason_codes);
  const status = normalizeWEStatus(scoreJson.status, reasonCodes, gateTriggered);
  const statusMeta = resolveStatusMeta(status);
  const feedback = normalizeText(row?.feedback);
  const summary = normalizeSummary(scoreJson.visible_summary, feedback, status);
  const overallEstimated = status === WE_STATUS_SCORED
    ? clampRange(scoreJson.overall_estimated, 0, 90, 0)
    : 0;

  const transcript = normalizeText(row?.transcript);
  const submittedWordCount = Math.max(
    0,
    normalizeNumber(scoreJson.submitted_word_count, getWordCount(transcript))
  );

  return {
    id: row?.id ?? "",
    taskType: "WE",
    questionId: normalizeText(row?.question_id),
    transcript,
    createdAt: normalizeText(row?.created_at),
    reviewedAt: normalizeText(scoreJson.reviewed_at || row?.created_at),
    requestId: normalizeText(scoreJson.request_id),
    providerUsed: normalizeText(scoreJson.provider_used || "none") || "none",
    fallbackReason: scoreJson.fallback_reason ?? null,
    status,
    statusLabel: statusMeta.label,
    statusBadgeClass: statusMeta.badgeClass,
    overallEstimated,
    rawTotal: clampRange(scoreJson.raw_total, 0, 26, 0),
    rawMax: clampRange(scoreJson.raw_max, 0, 26, 26),
    submittedWordCount,
    summary,
    gateReasonCodes: reasonCodes,
    gateReasonMessagesZh: reasonCodes.map((code) => mapGateReasonCodeToZh(code)),
    feedback: normalizeText(feedback || summary.finalComment),
    traits: normalizeTraits(scoreJson.traits),
    scoreJson
  };
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("WE history session read failed:", error);
    return "";
  }
  return normalizeText(data?.session?.user?.id);
}

export async function fetchWEHistory({ limit = DEFAULT_HISTORY_LIMIT } = {}) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const normalizedLimit = Math.max(1, Math.min(200, Number(limit || DEFAULT_HISTORY_LIMIT)));

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, user_id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("task_type", "WE")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    console.warn("WE history load failed:", error);
    return [];
  }

  return toArray(data).map((row) => normalizeWEHistoryRow(row));
}

export function filterWEHistory(records, { status = "all", keyword = "", questionId = "" } = {}) {
  const list = toArray(records);
  const normalizedStatus = normalizeText(status).toLowerCase();
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  const normalizedQuestionId = normalizeText(questionId).toLowerCase();

  return list.filter((item) => {
    if (normalizedStatus && normalizedStatus !== "all" && normalizeText(item?.status).toLowerCase() !== normalizedStatus) {
      return false;
    }

    if (normalizedQuestionId && normalizeText(item?.questionId).toLowerCase() !== normalizedQuestionId) {
      return false;
    }

    if (!normalizedKeyword) return true;

    const haystack = [
      item?.questionId,
      item?.transcript,
      item?.summary?.finalComment,
      ...(item?.summary?.strengths || []),
      ...(item?.summary?.improvements || []),
      ...(item?.gateReasonMessagesZh || [])
    ]
      .map((value) => normalizeText(value).toLowerCase())
      .join("\n");

    return haystack.includes(normalizedKeyword);
  });
}

export function summarizeWEHistory(records) {
  const list = toArray(records);
  const scored = list.filter((item) => item?.status === WE_STATUS_SCORED);
  const avgScore = scored.length
    ? Number((scored.reduce((sum, item) => sum + Number(item?.overallEstimated || 0), 0) / scored.length).toFixed(1))
    : 0;

  return {
    total: list.length,
    scoredCount: scored.length,
    avgScore,
    latestAt: normalizeText(list[0]?.createdAt)
  };
}

export function formatWEStatusLabel(status) {
  return resolveStatusMeta(normalizeText(status).toLowerCase()).label;
}
