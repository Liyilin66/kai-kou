const WE_RAW_MAX = 26;
const WE_REVIEW_LABEL = "AI评阅（估分）";
const WE_REVIEW_LABEL_DEGRADED = "AI评阅（降级）";
const WE_REVIEW_LABEL_RULE_GATE = "规则判定（未进入AI评阅）";
const WE_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";
const WE_AI_FALLBACK_LEVEL = "评阅降级";
const WE_STATUS_SCORED = "scored";
const WE_STATUS_RULE_GATED = "rule_gated";
const WE_STATUS_AI_DEGRADED = "ai_review_degraded";
const WE_AI_FALLBACK_IMPROVEMENTS = [
  "AI评阅服务暂时不可用，请稍后重试。",
  "本次为降级结果，你的作文不一定存在内容不足问题。"
];
const WE_AI_FALLBACK_FINAL_COMMENT = "AI评阅服务暂时不可用，本次已进入降级结果。你的作文不一定存在内容不足问题，请稍后重试。";

const TRAIT_MAX = {
  content: 6,
  form: 2,
  development_structure_coherence: 6,
  grammar: 2,
  general_linguistic_range: 6,
  vocabulary_range: 2,
  spelling: 2
};

const SCORE_KEYS = {
  content: ["content"],
  development_structure_coherence: [
    "development_structure_coherence",
    "developmentStructureCoherence",
    "development",
    "structure_coherence",
    "dsc"
  ],
  grammar: ["grammar"],
  general_linguistic_range: [
    "general_linguistic_range",
    "generalLinguisticRange",
    "linguistic_range",
    "linguisticRange"
  ],
  vocabulary_range: ["vocabulary_range", "vocabularyRange", "vocabulary"],
  spelling: ["spelling"]
};

const GATE_LEVEL = "需重写";
const GATE_IMPROVEMENTS = [
  "请先满足作文长度与基本格式要求。",
  "请确保回应题目且填写完整内容。"
];
const GATE_FINAL_COMMENT = "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。";

const SUMMARY_STRENGTHS_FALLBACK = [
  "结构基本完整，主题方向较明确。",
  "主要观点能够被理解。"
];

const SUMMARY_IMPROVEMENTS_FALLBACK = [
  "补充更具体的论据和展开细节。",
  "提交前检查语法与拼写错误。"
];

export function buildWEFormGateResult({ formAnalysis } = {}) {
  const existingReasonCodes = Array.isArray(formAnalysis?.form_zero_reason_codes)
    ? formAnalysis.form_zero_reason_codes
    : [];
  const reasonCodes = dedupe(existingReasonCodes.length ? existingReasonCodes : ["form_zero_word_count_too_short"]);

  return buildGateScoredPayload({
    formAnalysis,
    reasonCodes,
    formScore: 0,
    contentScore: 0,
    providerUsed: "none",
    fallbackReason: null,
    status: WE_STATUS_RULE_GATED,
    reviewLabel: WE_REVIEW_LABEL_RULE_GATE
  });
}

export function buildWEAiFallbackResult({
  formAnalysis,
  providerUsed = "gemini",
  fallbackReason = null,
  errorStage = "provider_call",
  rawErrorType = "",
  reasonCodes = []
} = {}) {
  const safeReasonCodes = reasonCodes.length ? reasonCodes : [WE_AI_FALLBACK_REASON_CODE];
  const gatePayload = buildGateScoredPayload({
    formAnalysis,
    reasonCodes: safeReasonCodes,
    formScore: clampScore(formAnalysis?.form_score, 0, TRAIT_MAX.form),
    contentScore: 0,
    providerUsed,
    fallbackReason,
    status: WE_STATUS_AI_DEGRADED,
    reviewLabel: WE_REVIEW_LABEL_DEGRADED
  });

  return {
    ...gatePayload,
    visible_summary: {
      level: WE_AI_FALLBACK_LEVEL,
      strengths: [],
      improvements: [...WE_AI_FALLBACK_IMPROVEMENTS],
      final_comment: WE_AI_FALLBACK_FINAL_COMMENT
    },
    feedback: WE_AI_FALLBACK_FINAL_COMMENT,
    error_stage: normalizeText(errorStage) || "provider_call",
    raw_error_type: normalizeText(rawErrorType) || ""
  };
}

export function finalizeWEScorePayload(payload, { formAnalysis, providerUsed = "gemini", fallbackReason = null } = {}) {
  const normalizedFormScore = clampScore(formAnalysis?.form_score, 0, TRAIT_MAX.form);
  if (normalizedFormScore <= 0) {
    return buildWEFormGateResult({ formAnalysis });
  }

  const normalizedTraits = {
    content: buildTraitScore(readTraitScore(payload, "content"), TRAIT_MAX.content),
    form: buildTraitScore(normalizedFormScore, TRAIT_MAX.form),
    development_structure_coherence: buildTraitScore(
      readTraitScore(payload, "development_structure_coherence"),
      TRAIT_MAX.development_structure_coherence
    ),
    grammar: buildTraitScore(readTraitScore(payload, "grammar"), TRAIT_MAX.grammar),
    general_linguistic_range: buildTraitScore(
      readTraitScore(payload, "general_linguistic_range"),
      TRAIT_MAX.general_linguistic_range
    ),
    vocabulary_range: buildTraitScore(readTraitScore(payload, "vocabulary_range"), TRAIT_MAX.vocabulary_range),
    spelling: buildTraitScore(readTraitScore(payload, "spelling"), TRAIT_MAX.spelling)
  };

  const contentGateReasonCodes = resolveContentGateReasonCodes({
    formAnalysis,
    contentScore: normalizedTraits.content.score
  });

  if (contentGateReasonCodes.length) {
    return buildGateScoredPayload({
      formAnalysis,
      reasonCodes: contentGateReasonCodes,
      formScore: normalizedTraits.form.score,
      contentScore: 0,
      providerUsed,
      fallbackReason,
      status: WE_STATUS_RULE_GATED,
      reviewLabel: WE_REVIEW_LABEL_RULE_GATE
    });
  }

  const rawTotal = Object.values(normalizedTraits)
    .reduce((total, trait) => total + Number(trait?.score || 0), 0);
  const overallEstimated = Math.round((rawTotal / WE_RAW_MAX) * 90);
  const visibleSummary = normalizeVisibleSummary(payload?.visible_summary, {
    overallEstimated,
    fallbackComment: normalizeFeedback(payload?.feedback)
  });

  return {
    taskType: "WE",
    status: WE_STATUS_SCORED,
    is_ai_review_degraded: false,
    is_estimated: true,
    review_label: WE_REVIEW_LABEL,
    raw_total: rawTotal,
    raw_max: WE_RAW_MAX,
    overall_estimated: overallEstimated,
    traits: normalizedTraits,
    gate: {
      triggered: false,
      reason_codes: []
    },
    provider_used: providerUsed,
    fallback_reason: fallbackReason,
    visible_summary: visibleSummary,
    feedback: normalizeFeedback(payload?.feedback),
    form_signals: buildFormSignals(formAnalysis)
  };
}

function buildGateScoredPayload({
  formAnalysis,
  reasonCodes,
  formScore,
  contentScore,
  providerUsed,
  fallbackReason,
  status = WE_STATUS_RULE_GATED,
  reviewLabel = WE_REVIEW_LABEL_RULE_GATE
}) {
  const normalizedStatus = normalizeWEStatus(status);
  const resolvedReviewLabel = normalizeText(reviewLabel)
    || (normalizedStatus === WE_STATUS_AI_DEGRADED ? WE_REVIEW_LABEL_DEGRADED : WE_REVIEW_LABEL_RULE_GATE);

  return {
    taskType: "WE",
    status: normalizedStatus,
    is_ai_review_degraded: normalizedStatus === WE_STATUS_AI_DEGRADED,
    is_estimated: true,
    review_label: resolvedReviewLabel,
    raw_total: 0,
    raw_max: WE_RAW_MAX,
    overall_estimated: 0,
    traits: {
      content: buildTraitScore(contentScore, TRAIT_MAX.content),
      form: buildTraitScore(formScore, TRAIT_MAX.form),
      development_structure_coherence: null,
      grammar: null,
      general_linguistic_range: null,
      vocabulary_range: null,
      spelling: null
    },
    gate: {
      triggered: true,
      reason_codes: dedupe(reasonCodes)
    },
    provider_used: providerUsed,
    fallback_reason: fallbackReason,
    visible_summary: {
      level: GATE_LEVEL,
      strengths: [],
      improvements: [...GATE_IMPROVEMENTS],
      final_comment: GATE_FINAL_COMMENT
    },
    feedback: GATE_FINAL_COMMENT,
    form_signals: buildFormSignals(formAnalysis)
  };
}

function normalizeWEStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === WE_STATUS_AI_DEGRADED) return WE_STATUS_AI_DEGRADED;
  if (normalized === WE_STATUS_RULE_GATED) return WE_STATUS_RULE_GATED;
  return WE_STATUS_SCORED;
}

function resolveContentGateReasonCodes({ formAnalysis, contentScore }) {
  const reasonCodes = [];
  const isTemplateNotFilled = Boolean(formAnalysis?.placeholder_detected);
  const hasNoMeaningfulResponse = !Boolean(formAnalysis?.is_meaningful_response);

  if (isTemplateNotFilled) {
    reasonCodes.push("content_zero_template_not_filled");
  }
  if (hasNoMeaningfulResponse) {
    reasonCodes.push("content_zero_no_meaningful_response");
  }
  if (Number(contentScore) <= 0 && reasonCodes.length === 0) {
    reasonCodes.push("content_zero_off_topic");
  }

  return dedupe(reasonCodes);
}

function readTraitScore(payload, traitKey) {
  const candidateKeys = SCORE_KEYS[traitKey] || [traitKey];

  for (const key of candidateKeys) {
    const raw = payload?.traits?.[key] ?? payload?.[key];
    if (typeof raw === "number") return raw;
    if (raw && typeof raw === "object" && typeof raw.score === "number") {
      return raw.score;
    }
  }

  return 0;
}

function buildTraitScore(value, max) {
  return {
    score: clampScore(value, 0, max),
    max
  };
}

function normalizeVisibleSummary(summary, { overallEstimated, fallbackComment } = {}) {
  const strengths = normalizeChineseList(summary?.strengths, SUMMARY_STRENGTHS_FALLBACK);
  const improvements = normalizeChineseList(summary?.improvements, SUMMARY_IMPROVEMENTS_FALLBACK);
  const finalComment = normalizeChineseText(
    summary?.final_comment || summary?.finalComment,
    fallbackComment || "本次为AI估分结果，建议根据改进建议继续优化作文。"
  );

  return {
    level: normalizeLevel(summary?.level, overallEstimated),
    strengths: strengths.slice(0, 2),
    improvements: improvements.slice(0, 2),
    final_comment: finalComment
  };
}

function normalizeLevel(value, overallEstimated = 0) {
  const raw = normalizeText(value);
  if (hasChinese(raw)) return raw;

  const lower = raw.toLowerCase();
  if (lower.includes("rewrite") || lower.includes("not scored")) return "需重写";
  if (lower.includes("strong")) return "较强";
  if (lower.includes("fair")) return "中等";
  if (lower.includes("develop")) return "需提升";

  if (overallEstimated >= 78) return "较强";
  if (overallEstimated >= 60) return "中等";
  return "需提升";
}

function normalizeChineseList(value, fallback) {
  const fallbackList = Array.isArray(fallback) ? fallback : [];
  if (!Array.isArray(value)) return [...fallbackList];

  const normalized = [];
  for (let index = 0; index < Math.max(value.length, 2); index += 1) {
    const raw = normalizeText(value[index]);
    if (raw && hasChinese(raw)) {
      normalized.push(raw);
      continue;
    }

    if (fallbackList[index]) {
      normalized.push(fallbackList[index]);
    }
  }

  if (!normalized.length) return [...fallbackList];
  return dedupe(normalized);
}

function normalizeFeedback(value) {
  return normalizeChineseText(
    value,
    "本次结果为AI估分，请结合结构完整性、语法与拼写继续提升作文质量。"
  );
}

function normalizeChineseText(value, fallback) {
  const text = normalizeText(value);
  if (text && hasChinese(text)) return text;
  return normalizeText(fallback);
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function hasChinese(value) {
  return /[\u4e00-\u9fff]/.test(`${value || ""}`);
}

function buildFormSignals(formAnalysis) {
  return {
    word_count: toSafeNumber(formAnalysis?.word_count),
    paragraph_count: toSafeNumber(formAnalysis?.paragraph_count),
    form_score: clampScore(formAnalysis?.form_score, 0, TRAIT_MAX.form),
    is_all_caps: Boolean(formAnalysis?.is_all_caps),
    has_punctuation: Boolean(formAnalysis?.has_punctuation),
    has_bullets: Boolean(formAnalysis?.has_bullets),
    very_short_sentence_ratio: toSafeDecimal(formAnalysis?.very_short_sentence_ratio),
    placeholder_detected: Boolean(formAnalysis?.placeholder_detected)
  };
}

function clampScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function toSafeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function toSafeDecimal(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const bounded = Math.max(0, Math.min(1, num));
  return Math.round(bounded * 1000) / 1000;
}

function dedupe(list) {
  return [...new Set(Array.isArray(list) ? list : [])];
}
