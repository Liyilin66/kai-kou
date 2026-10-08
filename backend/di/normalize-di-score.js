const DI_STATUS_SCORED = "scored";
const DI_STATUS_AI_DEGRADED = "ai_review_degraded";
const DI_STATUS_FAILED = "failed";

const DI_REVIEW_LABEL = "AI评分（估分）";
const DI_REVIEW_LABEL_DEGRADED = "AI评分（降级）";
const DI_REVIEW_LABEL_FAILED = "AI评分失败";

const CONTENT_RAW_MAX = 6;
const PRONUNCIATION_RAW_MAX = 5;
const FLUENCY_RAW_MAX = 5;

const DISPLAY_MIN_SCORE = 10;
const DISPLAY_MAX_SCORE = 90;
const DI_DISPLAY_WEIGHTS = {
  content: 0.45,
  pronunciation: 0.25,
  fluency: 0.3
};
const CONTENT_DISPLAY_BANDS = [
  [10, 10],
  [18, 28],
  [31, 43],
  [46, 58],
  [60, 71],
  [73, 84],
  [86, 90]
];
const PRONUNCIATION_DISPLAY_BANDS = [
  [10, 10],
  [19, 29],
  [35, 46],
  [51, 62],
  [67, 78],
  [83, 89]
];
const FLUENCY_DISPLAY_BANDS = [
  [10, 10],
  [21, 31],
  [37, 48],
  [53, 64],
  [69, 80],
  [84, 90]
];
const DI_META_GENERIC_TERMS = new Set([
  "trend",
  "comparison",
  "stage",
  "sequence",
  "data",
  "chart",
  "graph",
  "image",
  "picture",
  "describe",
  "detail",
  "details",
  "information",
  "informative",
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
const DI_FILLER_WORDS = new Set(["um", "uh", "er", "ah", "like"]);
const DI_EN_COMMON_WORDS = new Set([
  "the",
  "this",
  "that",
  "there",
  "is",
  "are",
  "shows",
  "show",
  "chart",
  "graph",
  "image",
  "compare",
  "comparison",
  "overall",
  "trend",
  "figure",
  "value",
  "male",
  "female",
  "process",
  "map",
  "stage",
  "largest",
  "smallest",
  "high",
  "low"
]);
const DI_RELEVANCE_BAND_ORDER = ["severe_off_topic", "weak_related", "partial_related", "grounded"];
const DI_COVERAGE_BAND_ORDER = ["none", "limited", "partial", "solid"];
const DI_ACCURACY_BAND_ORDER = ["wrong", "mixed", "mostly_correct", "accurate"];
const DI_RESPONSE_PATTERNS = new Set([
  "short_but_relevant",
  "long_but_off_topic",
  "template_only",
  "generic_related",
  "grounded_description"
]);
const DI_TEMPLATE_PHRASE_PATTERNS = [
  /\bthis (image|picture|chart|graph)\b/i,
  /\bthe provided (image|picture)\b/i,
  /\bin front of us\b/i,
  /\bdetailed information about\b/i,
  /\bvery informative\b/i,
  /\bhelps me understand\b/i,
  /\buseful (knowledge|information)\b/i,
  /\bdaily study and research\b/i,
  /\bclear and beautiful picture\b/i,
  /\bwe can learn a lot\b/i
];
const DI_MAP_POSITION_PATTERN = /\b(left|right|top|bottom|north|south|east|west|center|central|near|next to|between)\b/i;
const DI_GATE_TIERS = new Set([
  "low_grounded",
  "severe_off_topic",
  "weak_related",
  "partial_related",
  "partial_related_poor_coverage",
  "accuracy_limited",
  "grounded"
]);
const DI_CONTENT_DISPLAY_CAPS = {
  low_grounded: 24,
  severe_off_topic: 30,
  weak_related: 45,
  partial_related: 62,
  partial_related_poor_coverage: 55,
  accuracy_limited: 72,
  grounded: DISPLAY_MAX_SCORE
};
const DI_PRONUNCIATION_DISPLAY_CAPS = {
  low_grounded: 48,
  severe_off_topic: 58,
  weak_related: 70,
  partial_related: 79,
  partial_related_poor_coverage: 78,
  accuracy_limited: DISPLAY_MAX_SCORE,
  grounded: DISPLAY_MAX_SCORE
};
const DI_FLUENCY_DISPLAY_CAPS = {
  low_grounded: 52,
  severe_off_topic: 60,
  weak_related: 73,
  partial_related: 82,
  partial_related_poor_coverage: 80,
  accuracy_limited: DISPLAY_MAX_SCORE,
  grounded: DISPLAY_MAX_SCORE
};
const DI_OVERALL_DISPLAY_CAPS = {
  low_grounded: 36,
  severe_off_topic: 42,
  weak_related: 55,
  partial_related: 70,
  partial_related_poor_coverage: 65,
  accuracy_limited: 72,
  grounded: DISPLAY_MAX_SCORE
};

const DI_REASON_MESSAGE_MAP = {
  content_zero: "回答与图内容关联不足，内容分按最低档处理。",
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
  practice_log_insert_failed: "评分完成，但练习记录写入失败。"
};

export function normalizeDIFallbackReasonCode(fallbackReason, rawErrorType = "") {
  const normalized = `${fallbackReason || rawErrorType || ""}`.trim().toLowerCase();
  if (!normalized) return "ai_review_unavailable";
  if (normalized.includes("auth") && normalized.includes("expired")) return "auth_session_expired";
  if (normalized.includes("auth")) return "auth_session_missing";
  if (normalized.includes("metadata")) return "metadata_insufficient";
  if (normalized.includes("transcript") && normalized.includes("empty")) return "transcript_empty";
  if (normalized.includes("transcript") && normalized.includes("short")) return "transcript_too_short";
  if (normalized.includes("audio")) return "audio_not_usable";
  if (normalized.includes("timeout")) return "ai_review_timeout";
  if (normalized.includes("parse") || normalized.includes("json")) return "ai_review_parse_failed";
  if (normalized.includes("key_missing") || normalized.includes("api_key") || normalized.includes("keys_missing")) {
    return "llm_api_keys_missing";
  }
  if (normalized.includes("provider") || normalized.includes("network") || normalized.includes("gemini") || normalized.includes("groq")) {
    return "ai_review_provider_error";
  }
  return "ai_review_unavailable";
}

export function mapDIReasonCodeToZh(reasonCode = "") {
  return DI_REASON_MESSAGE_MAP[normalizeText(reasonCode)] || DI_REASON_MESSAGE_MAP.ai_review_unavailable;
}

export function buildDIAiFallbackResult({
  transcript = "",
  questionMeta = null,
  audioSignals = null,
  providerUsed = "none",
  fallbackReason = null,
  errorStage = "provider_call",
  rawErrorType = "",
  reasonCode = ""
} = {}) {
  const normalizedReasonCode = normalizeText(reasonCode)
    || normalizeDIFallbackReasonCode(fallbackReason, rawErrorType);

  return buildDIReviewPayload({
    status: DI_STATUS_AI_DEGRADED,
    reasonCode: normalizedReasonCode,
    reasonCodes: [normalizedReasonCode],
    officialTraits: {
      content: buildTraitScore(0, CONTENT_RAW_MAX, true),
      pronunciation: buildTraitScore(0, PRONUNCIATION_RAW_MAX, false),
      oral_fluency: buildTraitScore(0, FLUENCY_RAW_MAX, false)
    },
    feedbackZh: buildFallbackFeedback(normalizedReasonCode),
    betterResponse: buildFallbackBetterResponse(questionMeta, transcript),
    providerUsed,
    fallbackReason,
    rawErrorType,
    errorStage
  });
}

export function finalizeDIScorePayload(
  payload,
  {
    transcript = "",
    questionMeta = null,
    audioSignals = null,
    providerUsed = "gemini",
    fallbackReason = null
  } = {}
) {
  const contentTrait = readTrait(payload, "content", CONTENT_RAW_MAX);
  const reasonCode = normalizeText(payload?.reason_code || payload?.reasonCode);
  const pronunciationTrait = readTrait(payload, "pronunciation", PRONUNCIATION_RAW_MAX);
  const fluencyTrait = readTrait(payload, "oral_fluency", FLUENCY_RAW_MAX);

  if (contentTrait.score <= 0 || !contentTrait.judged) {
    const normalizedQuestionMeta = normalizeQuestionMeta(questionMeta);
    const normalizedAudioSignals = normalizeAudioSignals(audioSignals, transcript);
    const contentEvidence = buildContentEvidence({
      transcript,
      questionMeta: normalizedQuestionMeta
    });
    const groundingDiagnostics = resolveDIGroundingDiagnostics({
      payload: payload?.diagnostics || null,
      transcript,
      questionMeta: normalizedQuestionMeta,
      contentEvidence: contentEvidence.score
    });
    const zeroScorePolicy = resolveDIContentZeroPolicy({
      transcript,
      audioSignals: normalizedAudioSignals,
      groundingDiagnostics,
      contentTrait,
      pronunciationTrait,
      fluencyTrait,
      pronunciationEvidence: buildPronunciationEvidence({
        transcript,
        audioSignals: normalizedAudioSignals
      }).score,
      fluencyEvidence: buildFluencyEvidence({
        transcript,
        audioSignals: normalizedAudioSignals
      }).score
    });

    if (!zeroScorePolicy.forceAllMinimum && zeroScorePolicy.rescueLowGrounding) {
      return buildDIReviewPayload({
        status: DI_STATUS_SCORED,
        reasonCode: reasonCode || "content_zero",
        reasonCodes: [reasonCode || "content_zero"],
        officialTraits: {
          content: buildTraitScore(zeroScorePolicy.bridgeContentRaw, CONTENT_RAW_MAX, true),
          pronunciation: buildTraitScore(
            zeroScorePolicy.bridgePronunciationRaw,
            PRONUNCIATION_RAW_MAX,
            zeroScorePolicy.pronunciationJudged
          ),
          oral_fluency: buildTraitScore(
            zeroScorePolicy.bridgeFluencyRaw,
            FLUENCY_RAW_MAX,
            zeroScorePolicy.fluencyJudged
          )
        },
        feedbackZh: normalizeFeedback(
          payload?.product?.feedback_zh || payload?.feedback,
          DI_REASON_MESSAGE_MAP.content_zero
        ),
        betterResponse: normalizeBetterResponse(
          payload?.product?.better_response || payload?.better_response,
          buildFallbackBetterResponse()
        ),
        diagnostics: {
          ...(toObject(payload?.diagnostics) || {}),
          gate_tier_override: zeroScorePolicy.gateTierOverride || ""
        },
        transcript,
        questionMeta,
        audioSignals,
        providerUsed,
        fallbackReason
      });
    }

    return buildDIReviewPayload({
      status: DI_STATUS_SCORED,
      reasonCode: reasonCode || "content_zero",
      reasonCodes: [reasonCode || "content_zero"],
      officialTraits: {
        content: buildTraitScore(0, CONTENT_RAW_MAX, true),
        pronunciation: buildTraitScore(0, PRONUNCIATION_RAW_MAX, false),
        oral_fluency: buildTraitScore(0, FLUENCY_RAW_MAX, false)
      },
      feedbackZh: normalizeFeedback(
        payload?.product?.feedback_zh || payload?.feedback,
        DI_REASON_MESSAGE_MAP.content_zero
      ),
      betterResponse: normalizeBetterResponse(
        payload?.product?.better_response || payload?.better_response,
        buildFallbackBetterResponse()
      ),
      diagnostics: payload?.diagnostics || null,
      transcript,
      questionMeta,
      audioSignals,
      providerUsed,
      fallbackReason
    });
  }

  return buildDIReviewPayload({
    status: DI_STATUS_SCORED,
    reasonCode,
    reasonCodes: reasonCode ? [reasonCode] : [],
    officialTraits: {
      content: contentTrait,
      pronunciation: buildTraitScore(pronunciationTrait.score, PRONUNCIATION_RAW_MAX, pronunciationTrait.judged),
      oral_fluency: buildTraitScore(fluencyTrait.score, FLUENCY_RAW_MAX, fluencyTrait.judged)
    },
    feedbackZh: normalizeFeedback(
      payload?.product?.feedback_zh || payload?.feedback,
      "你已经抓住了图表的主要信息，再把关系和总结说得更完整会更稳。"
    ),
    betterResponse: normalizeBetterResponse(
      payload?.product?.better_response || payload?.better_response,
      buildFallbackBetterResponse()
    ),
    diagnostics: payload?.diagnostics || null,
    transcript,
    questionMeta,
    audioSignals,
    providerUsed,
    fallbackReason
  });
}

function buildDIReviewPayload({
  status = DI_STATUS_SCORED,
  reasonCode = "",
  reasonCodes = [],
  officialTraits = {},
  feedbackZh = "",
  betterResponse = "",
  diagnostics = null,
  transcript = "",
  questionMeta = null,
  audioSignals = null,
  providerUsed = "gemini",
  fallbackReason = null,
  rawErrorType = "",
  errorStage = ""
} = {}) {
  const normalizedStatus = normalizeStatus(status);
  const contentTrait = buildTraitScore(
    officialTraits?.content?.score,
    CONTENT_RAW_MAX,
    officialTraits?.content?.judged !== false
  );
  const pronunciationTrait = buildTraitScore(
    officialTraits?.pronunciation?.score,
    PRONUNCIATION_RAW_MAX,
    officialTraits?.pronunciation?.judged !== false && contentTrait.score > 0
  );
  const fluencyTrait = buildTraitScore(
    officialTraits?.oral_fluency?.score,
    FLUENCY_RAW_MAX,
    officialTraits?.oral_fluency?.judged !== false && contentTrait.score > 0
  );
  const normalizedQuestionMeta = normalizeQuestionMeta(questionMeta);
  const normalizedAudioSignals = normalizeAudioSignals(audioSignals, transcript);
  const contentEvidence = buildContentEvidence({
    transcript,
    questionMeta: normalizedQuestionMeta
  });
  const pronunciationEvidence = buildPronunciationEvidence({
    transcript,
    audioSignals: normalizedAudioSignals
  });
  const fluencyEvidence = buildFluencyEvidence({
    transcript,
    audioSignals: normalizedAudioSignals
  });
  const groundingDiagnostics = resolveDIGroundingDiagnostics({
    payload: diagnostics,
    transcript,
    questionMeta: normalizedQuestionMeta,
    contentEvidence: contentEvidence.score
  });
  const effectiveContentEvidence = resolveEffectiveContentEvidence({
    contentEvidence: contentEvidence.score,
    groundingDiagnostics
  });

  let content = mapContentRawToDisplay(contentTrait.score, effectiveContentEvidence);
  let pronunciation = pronunciationTrait.judged
    ? mapPronunciationRawToDisplay(pronunciationTrait.score, pronunciationEvidence.score)
    : DISPLAY_MIN_SCORE;
  let fluency = fluencyTrait.judged
    ? mapFluencyRawToDisplay(fluencyTrait.score, fluencyEvidence.score)
    : DISPLAY_MIN_SCORE;
  const responseValidity = assessEffectiveResponse({
    transcript,
    contentTrait,
    questionMeta: normalizedQuestionMeta,
    audioSignals: normalizedAudioSignals,
    pronunciationEvidence: pronunciationEvidence.score,
    fluencyEvidence: fluencyEvidence.score,
    groundingDiagnostics
  });

  if (pronunciationTrait.judged && fluencyTrait.judged && contentTrait.score > 0) {
    ({ pronunciation, fluency } = ensureSpeechScoreSeparation({
      pronunciation,
      fluency,
      pronunciationRaw: pronunciationTrait.score,
      fluencyRaw: fluencyTrait.score,
      pronunciationEvidence: pronunciationEvidence.score,
      fluencyEvidence: fluencyEvidence.score
    }));
  }

  if (contentTrait.score > 0) {
    if (pronunciationTrait.judged) {
      pronunciation = applyEffectiveResponseFloor({
        currentScore: pronunciation,
        rawScore: pronunciationTrait.score,
        evidenceScore: pronunciationEvidence.score,
        responseValidity,
        trait: "pronunciation",
        groundingDiagnostics
      });
    }
    if (fluencyTrait.judged) {
      fluency = applyEffectiveResponseFloor({
        currentScore: fluency,
        rawScore: fluencyTrait.score,
        evidenceScore: fluencyEvidence.score,
        responseValidity,
        trait: "fluency",
        groundingDiagnostics
      });
    }
  }

  content = applyDisplayCap(content, groundingDiagnostics.contentDisplayCap);
  pronunciation = pronunciationTrait.judged
    ? applyDisplayCap(pronunciation, groundingDiagnostics.pronunciationDisplayCap)
    : DISPLAY_MIN_SCORE;
  fluency = fluencyTrait.judged
    ? applyDisplayCap(fluency, groundingDiagnostics.fluencyDisplayCap)
    : DISPLAY_MIN_SCORE;

  const weightedOverall = contentTrait.score <= 0
    ? DISPLAY_MIN_SCORE
    : (
      content * DI_DISPLAY_WEIGHTS.content
      + pronunciation * DI_DISPLAY_WEIGHTS.pronunciation
      + fluency * DI_DISPLAY_WEIGHTS.fluency
    );
  const overallAdjustment = contentTrait.score <= 0
    ? 0
    : computeOverallAdjustment({
      contentEvidence: effectiveContentEvidence,
      pronunciationEvidence: pronunciationEvidence.score,
      fluencyEvidence: fluencyEvidence.score,
      responseValidity,
      groundingDiagnostics
    });
  const overallBeforeCap = contentTrait.score <= 0
    ? DISPLAY_MIN_SCORE
    : clampScore(
      Math.round(weightedOverall + overallAdjustment),
      DISPLAY_MIN_SCORE,
      DISPLAY_MAX_SCORE
    );
  const overall = contentTrait.score <= 0
    ? DISPLAY_MIN_SCORE
    : applyDisplayCap(overallBeforeCap, groundingDiagnostics.overallDisplayCap);

  const normalizedReasonCode = normalizeText(reasonCode);
  const dedupedReasonCodes = dedupeReasonCodes(reasonCodes);
  const resolvedReasonCodes = normalizedReasonCode
    ? dedupeReasonCodes([normalizedReasonCode, ...dedupedReasonCodes])
    : dedupedReasonCodes;
  const hasStatusWarning = normalizedStatus === DI_STATUS_AI_DEGRADED || normalizedStatus === DI_STATUS_FAILED;
  const reasonMessageZh = hasStatusWarning && normalizedReasonCode
    ? mapDIReasonCodeToZh(normalizedReasonCode)
    : "";
  const feedbackFallback = hasStatusWarning
    ? reasonMessageZh || "请继续练习图表概括和结论表达。"
    : "请继续练习图表概括和结论表达。";

  return {
    taskType: "DI",
    status: normalizedStatus,
    degraded: normalizedStatus === DI_STATUS_AI_DEGRADED,
    failed: normalizedStatus === DI_STATUS_FAILED,
    is_estimated: true,
    review_label: resolveReviewLabel(normalizedStatus),
    reason_code: normalizedReasonCode,
    reason_codes: resolvedReasonCodes,
    reason_message_zh: reasonMessageZh,
    official_traits: {
      content: contentTrait,
      pronunciation: pronunciationTrait,
      oral_fluency: fluencyTrait
    },
    display_scores: {
      content,
      pronunciation,
      fluency,
      overall
    },
    scores: {
      content,
      pronunciation,
      fluency
    },
    overall,
    feedback_zh: normalizeFeedback(feedbackZh, feedbackFallback),
    feedback: normalizeFeedback(feedbackZh, feedbackFallback),
    better_response: normalizeBetterResponse(betterResponse, buildFallbackBetterResponse()),
    provider_used: normalizeText(providerUsed) || "none",
    fallback_reason: fallbackReason ?? null,
    gate: {
      content_zero: contentTrait.score <= 0,
      pronunciation_skipped: !pronunciationTrait.judged,
      fluency_skipped: !fluencyTrait.judged,
      content_cap: groundingDiagnostics.contentDisplayCap,
      pronunciation_cap: groundingDiagnostics.pronunciationDisplayCap,
      fluency_cap: groundingDiagnostics.fluencyDisplayCap,
      overall_cap: groundingDiagnostics.overallDisplayCap,
      gate_tier: groundingDiagnostics.gateTier
    },
    display_evidence: {
      content: roundMetric(effectiveContentEvidence, 3),
      pronunciation: roundMetric(pronunciationEvidence.score, 3),
      fluency: roundMetric(fluencyEvidence.score, 3),
      valid_response_strength: roundMetric(responseValidity.strengthScore, 3)
    },
    diagnostics: {
      relevance_band: groundingDiagnostics.relevanceBand,
      coverage_band: groundingDiagnostics.coverageBand,
      accuracy_band: groundingDiagnostics.accuracyBand,
      response_pattern: groundingDiagnostics.responsePattern,
      off_topic_level: groundingDiagnostics.offTopicLevel,
      grounding_signals: groundingDiagnostics.groundingSignals,
      applied_caps: {
        content: groundingDiagnostics.contentDisplayCap,
        pronunciation: groundingDiagnostics.pronunciationDisplayCap,
        fluency: groundingDiagnostics.fluencyDisplayCap,
        overall: groundingDiagnostics.overallDisplayCap
      },
      content_signal_score: roundMetric(groundingDiagnostics.contentSignalScore, 3),
      heuristic_anchor_hits: groundingDiagnostics.heuristicAnchorHits,
      heuristic_template_hits: groundingDiagnostics.heuristicTemplateHits,
      heuristic_signal_count: groundingDiagnostics.heuristicSignalCount,
      overall_before_cap: overallBeforeCap,
      signal_source: groundingDiagnostics.signalSource
    },
    raw_error_type: normalizeText(rawErrorType),
    error_stage: normalizeText(errorStage)
  };
}

function buildTraitScore(score, max, judged = true) {
  return {
    score: clampScore(score, 0, max),
    max,
    judged: Boolean(judged)
  };
}

function readTrait(payload, key, max) {
  const officialTraits = toObject(payload?.official_traits);
  const aliases = getTraitAliases(key);

  for (const alias of aliases) {
    const direct = toObject(officialTraits?.[alias]) || toObject(payload?.[alias]);
    if (direct) {
      return buildTraitScore(
        direct?.score ?? direct?.value ?? payload?.[alias],
        max,
        direct?.judged !== false
      );
    }
  }

  return buildTraitScore(payload?.[key], max, true);
}

function getTraitAliases(key) {
  if (key === "content") return ["content"];
  if (key === "pronunciation") return ["pronunciation"];
  return ["oral_fluency", "oralFluency", "fluency"];
}

function resolveDIContentZeroPolicy({
  transcript = "",
  audioSignals = null,
  groundingDiagnostics = null,
  contentTrait = null,
  pronunciationTrait = null,
  fluencyTrait = null,
  pronunciationEvidence = 0,
  fluencyEvidence = 0
} = {}) {
  const transcriptInfo = buildTranscriptInfo(transcript);
  const audio = normalizeAudioSignals(audioSignals, transcript);
  const hasAnyGrounding = hasAnyDIGrounding(groundingDiagnostics);
  const almostNoEnglish = (
    transcriptInfo.wordCount <= 0
    || (transcriptInfo.alphaWordRatio < 0.35 && transcriptInfo.wordCount < 6)
  );
  const silenceLike = !normalizeText(transcript) || transcriptInfo.wordCount <= 0;
  const veryShortNoGrounding = transcriptInfo.wordCount <= 3 && !hasAnyGrounding;
  const severeNoiseLike = (
    transcriptInfo.wordCount <= 5
    && transcriptInfo.alphaWordRatio < 0.3
    && !hasAnyGrounding
  );
  const extremelyWeakNoGrounding = (
    transcriptInfo.wordCount <= 7
    && !hasAnyGrounding
    && groundingDiagnostics?.relevanceBand === "severe_off_topic"
  );

  const forceAllMinimum = Boolean(
    contentTrait?.score <= 0
    && (
      silenceLike
      || severeNoiseLike
      || veryShortNoGrounding
      || (almostNoEnglish && !hasAnyGrounding)
      || extremelyWeakNoGrounding
    )
  );
  const rescueLowGrounding = Boolean(contentTrait?.score <= 0 && !forceAllMinimum && hasAnyGrounding);
  const pronunciationJudged = rescueLowGrounding
    && audio.has_usable_audio !== false
    && audio.playback_usable !== false
    && transcriptInfo.wordCount >= 4;
  const fluencyJudged = pronunciationJudged;

  return {
    forceAllMinimum,
    rescueLowGrounding,
    gateTierOverride: rescueLowGrounding ? "low_grounded" : "",
    bridgeContentRaw: rescueLowGrounding ? 2 : 0,
    bridgePronunciationRaw: pronunciationJudged
      ? resolveBridgeSpeechRaw(pronunciationTrait?.score, pronunciationEvidence, transcriptInfo.wordCount)
      : 0,
    bridgeFluencyRaw: fluencyJudged
      ? resolveBridgeSpeechRaw(fluencyTrait?.score, fluencyEvidence, transcriptInfo.wordCount)
      : 0,
    pronunciationJudged,
    fluencyJudged
  };
}

function hasAnyDIGrounding(groundingDiagnostics = null) {
  if ((groundingDiagnostics?.heuristicAnchorHits || 0) > 0) return true;
  return Object.values(toObject(groundingDiagnostics?.groundingSignals) || {}).some(Boolean);
}

function resolveBridgeSpeechRaw(currentRaw = 0, evidenceScore = 0, wordCount = 0) {
  const existingRaw = clampScore(currentRaw, 0, PRONUNCIATION_RAW_MAX);
  if (existingRaw > 0) return existingRaw;
  if (wordCount >= 10 && clampUnit(evidenceScore) >= 0.62) return 3;
  if (wordCount >= 5 && clampUnit(evidenceScore) >= 0.38) return 2;
  return 1;
}

function resolveDIGroundingDiagnostics({
  payload = null,
  transcript = "",
  questionMeta = null,
  contentEvidence = 0.5
} = {}) {
  const modelDiagnostics = normalizeDIDiagnosticsPayload(payload);
  const heuristicDiagnostics = buildHeuristicDIGroundingDiagnostics({
    transcript,
    questionMeta,
    contentEvidence
  });

  let relevanceBand = pickConservativeBand(
    modelDiagnostics.relevanceBand,
    heuristicDiagnostics.relevanceBand,
    DI_RELEVANCE_BAND_ORDER
  );
  let coverageBand = pickConservativeBand(
    modelDiagnostics.coverageBand,
    heuristicDiagnostics.coverageBand,
    DI_COVERAGE_BAND_ORDER
  );
  let accuracyBand = pickConservativeBand(
    modelDiagnostics.accuracyBand,
    heuristicDiagnostics.accuracyBand,
    DI_ACCURACY_BAND_ORDER
  );
  const responsePattern = mergeDIResponsePattern(
    modelDiagnostics.responsePattern,
    heuristicDiagnostics.responsePattern
  );
  let offTopicLevel = Math.max(modelDiagnostics.offTopicLevel, heuristicDiagnostics.offTopicLevel);

  if (
    responsePattern === "short_but_relevant"
    && relevanceBand === "weak_related"
    && heuristicDiagnostics.groundingSignalCount >= 2
  ) {
    relevanceBand = "partial_related";
  }

  if (responsePattern === "template_only") {
    offTopicLevel = Math.max(offTopicLevel, 2);
    relevanceBand = pickConservativeBand(relevanceBand, "weak_related", DI_RELEVANCE_BAND_ORDER);
    coverageBand = pickConservativeBand(coverageBand, "limited", DI_COVERAGE_BAND_ORDER);
    accuracyBand = pickConservativeBand(accuracyBand, "mixed", DI_ACCURACY_BAND_ORDER);
  }

  if (responsePattern === "long_but_off_topic") {
    offTopicLevel = Math.max(offTopicLevel, 2);
    coverageBand = pickConservativeBand(coverageBand, "none", DI_COVERAGE_BAND_ORDER);
    accuracyBand = pickConservativeBand(accuracyBand, "wrong", DI_ACCURACY_BAND_ORDER);
    relevanceBand = heuristicDiagnostics.heuristicAnchorHits > 0
      ? pickConservativeBand(relevanceBand, "weak_related", DI_RELEVANCE_BAND_ORDER)
      : "severe_off_topic";
  }

  if (relevanceBand === "severe_off_topic") {
    offTopicLevel = Math.max(offTopicLevel, 3);
    coverageBand = pickConservativeBand(coverageBand, "none", DI_COVERAGE_BAND_ORDER);
    accuracyBand = pickConservativeBand(accuracyBand, "wrong", DI_ACCURACY_BAND_ORDER);
  }

  const groundingSignals = {
    title_topic_grounding: resolveGroundingSignalValue(
      modelDiagnostics.groundingSignals.title_topic_grounding,
      heuristicDiagnostics.groundingSignals.title_topic_grounding
    ),
    chart_type_grounding: resolveGroundingSignalValue(
      modelDiagnostics.groundingSignals.chart_type_grounding,
      heuristicDiagnostics.groundingSignals.chart_type_grounding
    ),
    entity_grounding: resolveGroundingSignalValue(
      modelDiagnostics.groundingSignals.entity_grounding,
      heuristicDiagnostics.groundingSignals.entity_grounding
    ),
    relation_trend_grounding: resolveGroundingSignalValue(
      modelDiagnostics.groundingSignals.relation_trend_grounding,
      heuristicDiagnostics.groundingSignals.relation_trend_grounding
    ),
    detail_grounding: resolveGroundingSignalValue(
      modelDiagnostics.groundingSignals.detail_grounding,
      heuristicDiagnostics.groundingSignals.detail_grounding
    )
  };

  const gateTier = resolveDIGateTier({
    relevanceBand,
    coverageBand,
    accuracyBand,
    responsePattern,
    offTopicLevel,
    gateTierOverride: modelDiagnostics.gateTierOverride
  });
  const contentSignalScore = resolveDIContentSignalScore({
    relevanceBand,
    coverageBand,
    accuracyBand,
    responsePattern,
    offTopicLevel
  });
  const overallDisplayCap = Math.min(
    DI_OVERALL_DISPLAY_CAPS[gateTier] || DISPLAY_MAX_SCORE,
    resolveDIAccuracyOverallCap({
      accuracyBand,
      relevanceBand,
      coverageBand
    })
  );

  return {
    relevanceBand,
    coverageBand,
    accuracyBand,
    responsePattern,
    offTopicLevel,
    groundingSignals,
    gateTier,
    contentSignalScore,
    contentDisplayCap: DI_CONTENT_DISPLAY_CAPS[gateTier] || DISPLAY_MAX_SCORE,
    pronunciationDisplayCap: DI_PRONUNCIATION_DISPLAY_CAPS[gateTier] || DISPLAY_MAX_SCORE,
    fluencyDisplayCap: DI_FLUENCY_DISPLAY_CAPS[gateTier] || DISPLAY_MAX_SCORE,
    overallDisplayCap,
    heuristicAnchorHits: heuristicDiagnostics.heuristicAnchorHits,
    heuristicTemplateHits: heuristicDiagnostics.heuristicTemplateHits,
    heuristicSignalCount: heuristicDiagnostics.groundingSignalCount,
    signalSource: modelDiagnostics.hasAny ? "model+heuristic" : "heuristic_only"
  };
}

function normalizeDIDiagnosticsPayload(payload = null) {
  const direct = toObject(payload);
  const source = toObject(direct?.diagnostics) || direct || {};
  const grounding = toObject(source?.grounding_signals || source?.groundingSignals) || {};
  const relevanceBand = normalizeBandValue(
    source?.relevance_band ?? source?.relevanceBand,
    DI_RELEVANCE_BAND_ORDER
  );
  const coverageBand = normalizeBandValue(
    source?.coverage_band ?? source?.coverageBand,
    DI_COVERAGE_BAND_ORDER
  );
  const accuracyBand = normalizeBandValue(
    source?.accuracy_band ?? source?.accuracyBand,
    DI_ACCURACY_BAND_ORDER
  );
  const responsePattern = normalizeResponsePattern(source?.response_pattern ?? source?.responsePattern);
  const offTopicLevel = clampScore(
    source?.off_topic_level ?? source?.offTopicLevel,
    0,
    3
  );
  const gateTierOverride = normalizeDIGateTier(source?.gate_tier_override ?? source?.gateTierOverride);

  return {
    hasAny: Boolean(relevanceBand || coverageBand || accuracyBand || responsePattern || Number.isFinite(Number(source?.off_topic_level ?? source?.offTopicLevel))),
    relevanceBand: relevanceBand || "",
    coverageBand: coverageBand || "",
    accuracyBand: accuracyBand || "",
    responsePattern: responsePattern || "",
    offTopicLevel,
    gateTierOverride,
    groundingSignals: {
      title_topic_grounding: normalizeMaybeBoolean(
        grounding?.title_topic_grounding ?? grounding?.titleTopicGrounding
      ),
      chart_type_grounding: normalizeMaybeBoolean(
        grounding?.chart_type_grounding ?? grounding?.chartTypeGrounding
      ),
      entity_grounding: normalizeMaybeBoolean(
        grounding?.entity_grounding ?? grounding?.entityGrounding
      ),
      relation_trend_grounding: normalizeMaybeBoolean(
        grounding?.relation_trend_grounding ?? grounding?.relationTrendGrounding
      ),
      detail_grounding: normalizeMaybeBoolean(
        grounding?.detail_grounding ?? grounding?.detailGrounding
      )
    }
  };
}

function buildHeuristicDIGroundingDiagnostics({
  transcript = "",
  questionMeta = null,
  contentEvidence = 0.5
} = {}) {
  const meta = normalizeQuestionMeta(questionMeta);
  const transcriptInfo = buildTranscriptInfo(transcript);
  const topicDescriptors = buildDITopicDescriptors(meta);
  const entityDescriptors = meta.key_elements.length ? meta.key_elements : meta.key_points;
  const relationDescriptors = [
    ...meta.relations,
    ...meta.comparison_axes,
    ...meta.sequence_or_trend
  ];
  const topicScore = computeListCoverage(topicDescriptors, transcriptInfo);
  const entityScore = computeListCoverage(entityDescriptors, transcriptInfo);
  const relationScore = Math.max(
    computeListCoverage(relationDescriptors, transcriptInfo),
    meta.visual_features.has_comparison && transcriptInfo.comparisonCue ? 0.65 : 0,
    meta.visual_features.has_trend && transcriptInfo.trendCue ? 0.65 : 0,
    meta.image_type === "process" && transcriptInfo.sequenceCue ? 0.75 : 0,
    meta.image_type === "map" && DI_MAP_POSITION_PATTERN.test(transcriptInfo.text) ? 0.7 : 0
  );
  const detailScore = Math.max(
    computeListCoverage(meta.numbers_or_extremes, transcriptInfo),
    meta.visual_features.has_numbers && transcriptInfo.numberCue ? 0.65 : 0,
    meta.visual_features.has_extreme && transcriptInfo.extremeCue ? 0.6 : 0
  );
  const titleTopicGrounded = topicScore >= 0.22;
  const chartTypeGrounded = hasChartTypeGrounding(meta.image_type, transcriptInfo);
  const entityGrounded = entityScore >= 0.22;
  const relationTrendGrounded = relationScore >= 0.35;
  const detailGrounded = detailScore >= 0.3;
  const specificAnchors = buildDISpecificAnchors(meta);
  const specificAnchorHits = countDescriptorHits(specificAnchors, transcriptInfo);
  const groundingSignalCount = [
    titleTopicGrounded,
    chartTypeGrounded,
    entityGrounded,
    relationTrendGrounded,
    detailGrounded
  ].filter(Boolean).length;
  const templatePhraseHits = countTemplatePhraseHits(transcriptInfo.text);

  const shortButRelevant = (
    transcriptInfo.wordCount > 0
    && transcriptInfo.wordCount <= 16
    && specificAnchorHits >= 2
    && titleTopicGrounded
    && entityGrounded
    && (relationTrendGrounded || detailGrounded)
    && groundingSignalCount >= 3
  );
  const templateOnly = (
    templatePhraseHits >= 2
    && specificAnchorHits <= 1
    && !relationTrendGrounded
    && !detailGrounded
  );
  const longButOffTopic = (
    transcriptInfo.wordCount >= 22
    && !shortButRelevant
    && specificAnchorHits <= 1
    && groundingSignalCount <= 1
    && (templatePhraseHits >= 1 || clampUnit(contentEvidence) < 0.3)
  );
  const genericRelated = (
    !shortButRelevant
    && !longButOffTopic
    && !templateOnly
    && (titleTopicGrounded || chartTypeGrounded || specificAnchorHits >= 1)
    && groundingSignalCount <= 2
  );

  let relevanceBand = "severe_off_topic";
  if (
    titleTopicGrounded
    && specificAnchorHits >= 2
    && entityGrounded
    && (relationTrendGrounded || detailGrounded)
  ) {
    relevanceBand = "grounded";
  } else if (
    titleTopicGrounded
    && specificAnchorHits >= 1
    && (entityGrounded || relationTrendGrounded || detailGrounded || chartTypeGrounded)
  ) {
    relevanceBand = "partial_related";
  } else if (titleTopicGrounded || chartTypeGrounded || specificAnchorHits >= 1) {
    relevanceBand = "weak_related";
  }

  if (templateOnly) relevanceBand = "weak_related";
  if (longButOffTopic || (!titleTopicGrounded && specificAnchorHits === 0 && groundingSignalCount <= 1)) {
    relevanceBand = "severe_off_topic";
  }
  if (shortButRelevant && relevanceBand === "weak_related") {
    relevanceBand = "partial_related";
  }

  let coverageBand = "none";
  if (shortButRelevant && groundingSignalCount >= 2) {
    coverageBand = "partial";
  } else if (
    titleTopicGrounded
    && entityGrounded
    && (relationTrendGrounded || detailGrounded)
    && transcriptInfo.wordCount >= 10
  ) {
    coverageBand = "solid";
  } else if (groundingSignalCount >= 2 && (entityGrounded || relationTrendGrounded || detailGrounded)) {
    coverageBand = "partial";
  } else if (groundingSignalCount >= 1 || specificAnchorHits >= 1) {
    coverageBand = "limited";
  }

  let accuracyBand = "wrong";
  if (relevanceBand === "grounded" && (relationTrendGrounded || detailGrounded)) {
    accuracyBand = "accurate";
  } else if (relevanceBand === "partial_related" || shortButRelevant) {
    accuracyBand = "mostly_correct";
  } else if (relevanceBand === "weak_related") {
    accuracyBand = "mixed";
  }

  let responsePattern = "grounded_description";
  if (shortButRelevant) {
    responsePattern = "short_but_relevant";
  } else if (longButOffTopic) {
    responsePattern = "long_but_off_topic";
  } else if (templateOnly) {
    responsePattern = "template_only";
  } else if (genericRelated || relevanceBand === "weak_related") {
    responsePattern = "generic_related";
  }

  let offTopicLevel = 0;
  if (longButOffTopic || relevanceBand === "severe_off_topic") {
    offTopicLevel = 3;
  } else if (templateOnly) {
    offTopicLevel = 2;
  } else if (responsePattern === "generic_related" || relevanceBand === "weak_related") {
    offTopicLevel = 1;
  }

  return {
    relevanceBand,
    coverageBand,
    accuracyBand,
    responsePattern,
    offTopicLevel,
    groundingSignals: {
      title_topic_grounding: titleTopicGrounded,
      chart_type_grounding: chartTypeGrounded,
      entity_grounding: entityGrounded,
      relation_trend_grounding: relationTrendGrounded,
      detail_grounding: detailGrounded
    },
    heuristicAnchorHits: specificAnchorHits,
    heuristicTemplateHits: templatePhraseHits,
    groundingSignalCount
  };
}

function buildDITopicDescriptors(meta = {}) {
  return normalizeStringList([
    meta.title,
    meta.question_content,
    ...normalizeStringList(meta.key_terms, 8)
  ], 10);
}

function buildDISpecificAnchors(meta = {}) {
  return normalizeStringList([
    ...normalizeStringList(meta.key_terms, 8),
    ...normalizeStringList(meta.key_elements, 6),
    ...normalizeStringList(meta.key_points, 6),
    ...extractTextSegments(meta.title),
    ...extractTextSegments(meta.question_content)
  ], 12).filter((item) => !isGenericDescriptor(item));
}

function extractTextSegments(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalizeStringList([
    normalized,
    ...normalized.split(/[|,/]/),
    ...normalized.split(/\s+vs\.?\s+/i),
    ...normalized.split(/\s+and\s+/i)
  ], 8);
}

function isGenericDescriptor(value = "") {
  return tokenizeText(value).every((token) => DI_META_GENERIC_TERMS.has(token));
}

function countDescriptorHits(list = [], transcriptInfo = {}) {
  return normalizeStringList(list, 16)
    .filter((item) => !isGenericDescriptor(item))
    .filter((item) => hasDescriptorMatch(item, transcriptInfo)).length;
}

function countTemplatePhraseHits(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return DI_TEMPLATE_PHRASE_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
}

function hasChartTypeGrounding(imageType = "", transcriptInfo = {}) {
  const text = `${transcriptInfo?.text || ""}`;
  if (!text) return false;
  if (imageType === "line") {
    return /(line|over time|timeline|trend|increase|decrease|fluctuat)/i.test(text);
  }
  if (imageType === "bar") {
    return /(bar|bars|category|categories|compare|comparison)/i.test(text);
  }
  if (imageType === "pie") {
    return /(pie|percentage|proportion|share|segment|slice)/i.test(text);
  }
  if (imageType === "table") {
    return /(table|row|rows|column|columns|figures)/i.test(text);
  }
  if (imageType === "process") {
    return /(process|step|steps|stage|stages|sequence)/i.test(text);
  }
  if (imageType === "map") {
    return /(map|layout|location|locations|area|region)/i.test(text) || DI_MAP_POSITION_PATTERN.test(text);
  }
  if (imageType === "mixed") {
    return /(chart|graph|table|trend|compare|comparison)/i.test(text);
  }
  return false;
}

function mergeDIResponsePattern(modelPattern = "", heuristicPattern = "") {
  const normalizedModel = normalizeResponsePattern(modelPattern);
  const normalizedHeuristic = normalizeResponsePattern(heuristicPattern);

  if (!normalizedModel) {
    return normalizedHeuristic || "grounded_description";
  }
  if (!normalizedHeuristic) {
    return normalizedModel;
  }

  if (normalizedHeuristic === "long_but_off_topic" || normalizedHeuristic === "template_only") {
    return normalizedHeuristic;
  }
  if (normalizedModel === "long_but_off_topic" || normalizedModel === "template_only") {
    return normalizedModel;
  }

  if (
    normalizedHeuristic === "generic_related"
    && (normalizedModel === "grounded_description" || normalizedModel === "short_but_relevant")
  ) {
    return normalizedHeuristic;
  }

  return normalizedModel;
}

function resolveDIGateTier({
  relevanceBand = "",
  coverageBand = "",
  accuracyBand = "",
  responsePattern = "",
  offTopicLevel = 0,
  gateTierOverride = ""
} = {}) {
  const normalizedOverride = normalizeDIGateTier(gateTierOverride);
  if (normalizedOverride) return normalizedOverride;
  if (
    relevanceBand === "severe_off_topic"
    || offTopicLevel >= 3
    || responsePattern === "long_but_off_topic"
  ) {
    return "severe_off_topic";
  }
  if (
    responsePattern === "template_only"
    || relevanceBand === "weak_related"
    || offTopicLevel >= 2
  ) {
    return "weak_related";
  }
  if (
    responsePattern === "short_but_relevant"
    || relevanceBand === "partial_related"
  ) {
    if (coverageBand === "none" || coverageBand === "limited" || accuracyBand === "wrong" || accuracyBand === "mixed") {
      return "partial_related_poor_coverage";
    }
    return "partial_related";
  }
  if (
    responsePattern === "generic_related"
    || (relevanceBand === "grounded" && (coverageBand === "none" || coverageBand === "limited"))
  ) {
    return "partial_related_poor_coverage";
  }
  if (accuracyBand === "wrong" || accuracyBand === "mixed") {
    return "accuracy_limited";
  }
  return "grounded";
}

function resolveDIAccuracyOverallCap({
  accuracyBand = "",
  relevanceBand = "",
  coverageBand = ""
} = {}) {
  if (relevanceBand === "severe_off_topic" || relevanceBand === "weak_related") {
    return DISPLAY_MAX_SCORE;
  }
  if (accuracyBand === "wrong") {
    return coverageBand === "solid" ? 72 : 70;
  }
  if (accuracyBand === "mixed") {
    return coverageBand === "solid" ? 76 : 74;
  }
  return DISPLAY_MAX_SCORE;
}

function resolveDIContentSignalScore({
  relevanceBand = "",
  coverageBand = "",
  accuracyBand = "",
  responsePattern = "",
  offTopicLevel = 0
} = {}) {
  const relevanceScore = mapBandToScore(relevanceBand, {
    severe_off_topic: 0.08,
    weak_related: 0.34,
    partial_related: 0.62,
    grounded: 0.88
  });
  const coverageScore = mapBandToScore(coverageBand, {
    none: 0.06,
    limited: 0.3,
    partial: 0.6,
    solid: 0.86
  });
  const accuracyScore = mapBandToScore(accuracyBand, {
    wrong: 0.08,
    mixed: 0.36,
    mostly_correct: 0.68,
    accurate: 0.9
  });

  let score = clampUnit(relevanceScore * 0.55 + coverageScore * 0.27 + accuracyScore * 0.18);
  if (responsePattern === "long_but_off_topic") score = Math.min(score, 0.18);
  if (responsePattern === "template_only") score = Math.min(score, 0.4);
  if (responsePattern === "short_but_relevant") score = Math.max(score, 0.42);
  if (offTopicLevel >= 3) score = Math.min(score, 0.15);
  return score;
}

function resolveEffectiveContentEvidence({
  contentEvidence = 0.5,
  groundingDiagnostics = null
} = {}) {
  const base = clampUnit(contentEvidence);
  const signal = clampUnit(groundingDiagnostics?.contentSignalScore ?? base);
  let merged = clampUnit(base * 0.6 + signal * 0.4);

  if (groundingDiagnostics?.responsePattern === "long_but_off_topic") {
    merged = Math.min(merged, 0.2);
  } else if (groundingDiagnostics?.responsePattern === "template_only") {
    merged = Math.min(merged, 0.42);
  } else if (groundingDiagnostics?.responsePattern === "short_but_relevant") {
    merged = Math.max(merged, 0.42);
  }

  return merged;
}

function applyDisplayCap(score = DISPLAY_MIN_SCORE, cap = DISPLAY_MAX_SCORE) {
  return clampScore(Math.min(Number(score || 0), Number(cap || DISPLAY_MAX_SCORE)), DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE);
}

function normalizeBandValue(value, allowed = []) {
  const normalized = normalizeText(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : "";
}

function normalizeResponsePattern(value) {
  const normalized = normalizeText(value).toLowerCase();
  return DI_RESPONSE_PATTERNS.has(normalized) ? normalized : "";
}

function normalizeDIGateTier(value) {
  const normalized = normalizeText(value).toLowerCase();
  return DI_GATE_TIERS.has(normalized) ? normalized : "";
}

function pickConservativeBand(primary = "", secondary = "", order = []) {
  const firstIndex = order.indexOf(primary);
  const secondIndex = order.indexOf(secondary);
  if (firstIndex < 0) return secondIndex < 0 ? "" : secondary;
  if (secondIndex < 0) return primary;
  return firstIndex <= secondIndex ? primary : secondary;
}

function mapBandToScore(value, mapping = {}) {
  return clampUnit(mapping[normalizeText(value)] ?? 0);
}

function resolveGroundingSignalValue(modelValue, heuristicValue) {
  return typeof modelValue === "boolean" ? modelValue : Boolean(heuristicValue);
}

function normalizeMaybeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function mapContentRawToDisplay(rawScore, evidenceScore = 0.5) {
  return interpolateScoreBand(CONTENT_DISPLAY_BANDS, rawScore, evidenceScore);
}

function mapPronunciationRawToDisplay(rawScore, evidenceScore = 0.5) {
  return interpolateScoreBand(PRONUNCIATION_DISPLAY_BANDS, rawScore, evidenceScore);
}

function mapFluencyRawToDisplay(rawScore, evidenceScore = 0.5) {
  return interpolateScoreBand(FLUENCY_DISPLAY_BANDS, rawScore, evidenceScore);
}

function interpolateScoreBand(bands, rawScore, evidenceScore = 0.5) {
  const boundedRaw = clampScore(rawScore, 0, Math.max(0, bands.length - 1));
  const [bandMin, bandMax] = bands[boundedRaw] || [DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE];
  if (bandMin === bandMax) return bandMin;
  return clampScore(
    Math.round(bandMin + (bandMax - bandMin) * clampUnit(evidenceScore)),
    bandMin,
    bandMax
  );
}

function ensureSpeechScoreSeparation({
  pronunciation = DISPLAY_MIN_SCORE,
  fluency = DISPLAY_MIN_SCORE,
  pronunciationRaw = 0,
  fluencyRaw = 0,
  pronunciationEvidence = 0.5,
  fluencyEvidence = 0.5
} = {}) {
  if (pronunciation !== fluency) {
    return { pronunciation, fluency };
  }

  const delta = pronunciationEvidence - fluencyEvidence;
  if (Math.abs(delta) < 0.08) {
    return { pronunciation, fluency };
  }

  const shift = Math.min(2, Math.max(1, Math.round(Math.abs(delta) * 10)));
  if (delta > 0) {
    return {
      pronunciation: clampWithinBand(pronunciation + shift, pronunciationRaw, PRONUNCIATION_DISPLAY_BANDS),
      fluency: clampWithinBand(fluency - shift, fluencyRaw, FLUENCY_DISPLAY_BANDS)
    };
  }

  return {
    pronunciation: clampWithinBand(pronunciation - shift, pronunciationRaw, PRONUNCIATION_DISPLAY_BANDS),
    fluency: clampWithinBand(fluency + shift, fluencyRaw, FLUENCY_DISPLAY_BANDS)
  };
}

function clampWithinBand(value, rawScore, bands) {
  const boundedRaw = clampScore(rawScore, 0, Math.max(0, bands.length - 1));
  const [bandMin, bandMax] = bands[boundedRaw] || [DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE];
  return clampScore(value, bandMin, bandMax);
}

function computeOverallAdjustment({
  contentEvidence = 0.5,
  pronunciationEvidence = 0.5,
  fluencyEvidence = 0.5,
  responseValidity = null,
  groundingDiagnostics = null
} = {}) {
  const gateTier = `${groundingDiagnostics?.gateTier || ""}`;
  if (gateTier && gateTier !== "grounded" && groundingDiagnostics?.responsePattern !== "short_but_relevant") {
    return 0;
  }
  const responseBoost = responseValidity?.isValidResponse
    ? roundMetric((clampUnit(responseValidity.strengthScore) - 0.5) * 2, 2)
    : 0;
  const adjustment = Math.round(
    (clampUnit(contentEvidence) - 0.55) * 3
    + (clampUnit(pronunciationEvidence) - 0.5) * 1
    + (clampUnit(fluencyEvidence) - 0.5) * 1
    + responseBoost
  );
  return clampSigned(adjustment, -2, 2);
}

function applyEffectiveResponseFloor({
  currentScore = DISPLAY_MIN_SCORE,
  rawScore = 0,
  evidenceScore = 0,
  responseValidity = null,
  trait = "pronunciation",
  groundingDiagnostics = null
} = {}) {
  if (!responseValidity?.isValidResponse || responseValidity?.isSeverelyInvalid) {
    return currentScore;
  }
  if (
    groundingDiagnostics?.gateTier
    && groundingDiagnostics?.gateTier !== "grounded"
    && groundingDiagnostics?.responsePattern !== "short_but_relevant"
  ) {
    return currentScore;
  }

  const floorScore = trait === "fluency"
    ? computeFluencyFloor(rawScore, evidenceScore, responseValidity.strengthScore)
    : computePronunciationFloor(rawScore, evidenceScore, responseValidity.strengthScore);

  return clampScore(Math.max(currentScore, floorScore), DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE);
}

function computePronunciationFloor(rawScore, evidenceScore = 0.5, responseStrength = 0.5) {
  const evidence = clampUnit(evidenceScore);
  const strength = clampUnit(responseStrength);
  if (rawScore >= 3) return DISPLAY_MIN_SCORE;
  if (rawScore === 2) return clampScore(34 + evidence * 8 + strength * 4, DISPLAY_MIN_SCORE, 46);
  if (rawScore === 1) return clampScore(28 + evidence * 8 + strength * 6, DISPLAY_MIN_SCORE, 42);
  return clampScore(24 + evidence * 9 + strength * 8, DISPLAY_MIN_SCORE, 38);
}

function computeFluencyFloor(rawScore, evidenceScore = 0.5, responseStrength = 0.5) {
  const evidence = clampUnit(evidenceScore);
  const strength = clampUnit(responseStrength);
  if (rawScore >= 3) return DISPLAY_MIN_SCORE;
  if (rawScore === 2) return clampScore(38 + evidence * 8 + strength * 5, DISPLAY_MIN_SCORE, 50);
  if (rawScore === 1) return clampScore(33 + evidence * 9 + strength * 8, DISPLAY_MIN_SCORE, 46);
  return clampScore(30 + evidence * 10 + strength * 10, DISPLAY_MIN_SCORE, 42);
}

function buildContentEvidence({ transcript = "", questionMeta = null } = {}) {
  const meta = normalizeQuestionMeta(questionMeta);
  const transcriptInfo = buildTranscriptInfo(transcript);
  const keyElementCoverage = computeListCoverage(meta.key_elements.length ? meta.key_elements : meta.key_points, transcriptInfo);
  const relationCoverage = Math.max(
    computeListCoverage(meta.relations, transcriptInfo),
    meta.visual_features.has_comparison && transcriptInfo.comparisonCue ? 1 : 0,
    meta.visual_features.has_trend && transcriptInfo.trendCue ? 1 : 0,
    meta.sequence_or_trend.length && transcriptInfo.sequenceCue ? 0.9 : 0
  );
  const implicationCoverage = Math.max(
    computeListCoverage(meta.implications_or_conclusion, transcriptInfo),
    transcriptInfo.conclusionCue ? 1 : 0
  );
  const detailCoverage = Math.max(
    computeListCoverage(meta.numbers_or_extremes, transcriptInfo),
    transcriptInfo.numberCue ? 0.95 : 0,
    transcriptInfo.extremeCue ? 0.9 : 0
  );
  const structureCoverage = Math.max(
    computeListCoverage(meta.sequence_or_trend, transcriptInfo),
    computeListCoverage(meta.comparison_axes, transcriptInfo),
    meta.visual_features.has_comparison && transcriptInfo.comparisonCue ? 0.95 : 0,
    meta.visual_features.has_trend && transcriptInfo.trendCue ? 0.95 : 0
  );
  const lengthScore = windowScore(transcriptInfo.wordCount, 6, 16, 42, 80);

  return {
    score: clampUnit(
      keyElementCoverage * 0.36
      + relationCoverage * 0.2
      + implicationCoverage * 0.11
      + detailCoverage * 0.15
      + structureCoverage * 0.1
      + lengthScore * 0.08
      + (transcriptInfo.wordCount >= 10 && keyElementCoverage >= 0.5 ? 0.08 : 0)
    )
  };
}

function buildPronunciationEvidence({ transcript = "", audioSignals = null } = {}) {
  const audio = normalizeAudioSignals(audioSignals, transcript);
  const transcriptInfo = buildTranscriptInfo(transcript);
  const intelligibilityScore = clampUnit(
    windowScore(transcriptInfo.wordCount, 3, 8, 38, 90) * 0.32
    + transcriptInfo.alphaWordRatio * 0.46
    + (1 - Math.min(1, transcriptInfo.fillerRatio / 0.24)) * 0.22
  );
  const amplitudeScore = clampUnit(
    windowScore(audio.rms_amplitude, 0.005, 0.015, 0.12, 0.28) * 0.28
    + windowScore(audio.mean_abs_amplitude, 0.004, 0.012, 0.1, 0.24) * 0.2
    + windowScore(audio.peak_amplitude, 0.035, 0.12, 0.88, 1) * 0.18
    + windowScore(audio.amplitude_dynamic_range, 0.02, 0.06, 0.78, 1) * 0.12
    + (audio.playback_usable ? 0.12 : 0)
    + (audio.has_usable_audio ? 0.1 : 0)
  );
  const continuitySupport = windowScore(audio.non_silent_frame_ratio, 0.08, 0.22, 0.92, 1);

  return {
    score: clampUnit(
      intelligibilityScore * 0.48
      + amplitudeScore * 0.38
      + continuitySupport * 0.14
    )
  };
}

function buildFluencyEvidence({ transcript = "", audioSignals = null } = {}) {
  const audio = normalizeAudioSignals(audioSignals, transcript);
  const transcriptInfo = buildTranscriptInfo(transcript);
  const durationScore = windowScore(audio.duration_sec, 6, 14, 40, 65);
  const speechRateScore = windowScore(audio.speech_rate_wps, 0.6, 1.3, 3.6, 6.2);
  const continuityScore = windowScore(audio.non_silent_frame_ratio, 0.08, 0.22, 0.9, 1);
  const silenceControlScore = windowScore(audio.silence_frame_ratio, 0.02, 0.1, 0.58, 0.92);
  const fillerPenalty = 1 - Math.min(1, transcriptInfo.fillerRatio / 0.28);

  return {
    score: clampUnit(
      durationScore * 0.16
      + speechRateScore * 0.34
      + continuityScore * 0.28
      + silenceControlScore * 0.14
      + fillerPenalty * 0.08
    )
  };
}

function assessEffectiveResponse({
  transcript = "",
  contentTrait = null,
  questionMeta = null,
  audioSignals = null,
  pronunciationEvidence = 0,
  fluencyEvidence = 0,
  groundingDiagnostics = null
} = {}) {
  const transcriptInfo = buildTranscriptInfo(transcript);
  const audio = normalizeAudioSignals(audioSignals, transcript);
  const meta = normalizeQuestionMeta(questionMeta);
  const keyElementCoverage = computeListCoverage(meta.key_elements.length ? meta.key_elements : meta.key_points, transcriptInfo);
  const englishTokenRatio = transcriptInfo.alphaTokens.length
    ? transcriptInfo.alphaTokens.filter((token) => DI_EN_COMMON_WORDS.has(token)).length / transcriptInfo.alphaTokens.length
    : 0;
  const validSignals = [
    transcriptInfo.wordCount >= 6,
    transcriptInfo.alphaWordRatio >= 0.55,
    audio.has_usable_audio === true,
    audio.playback_usable === true,
    audio.duration_sec >= 8,
    audio.non_silent_frame_ratio >= 0.12,
    audio.speech_rate_wps >= 0.7 && audio.speech_rate_wps <= 5.8,
    englishTokenRatio >= 0.08 || transcriptInfo.wordCount >= 10,
    contentTrait?.score > 0 || keyElementCoverage >= 0.25
  ].filter(Boolean).length;

  const isSeverelyInvalid = (
    transcriptInfo.wordCount <= 1
    || audio.has_usable_audio === false
    || audio.playback_usable === false
    || (transcriptInfo.wordCount <= 3 && audio.duration_sec < 5)
    || (transcriptInfo.alphaWordRatio < 0.3 && transcriptInfo.wordCount < 6)
    || (audio.non_silent_frame_ratio < 0.06 && audio.duration_sec < 8)
  );

  const strengthScore = clampUnit(
    windowScore(transcriptInfo.wordCount, 3, 8, 40, 90) * 0.28
    + windowScore(audio.duration_sec, 5, 12, 40, 65) * 0.18
    + windowScore(audio.non_silent_frame_ratio, 0.08, 0.2, 0.92, 1) * 0.16
    + clampUnit(transcriptInfo.alphaWordRatio) * 0.12
    + clampUnit(pronunciationEvidence) * 0.12
    + clampUnit(fluencyEvidence) * 0.1
    + Math.min(1, validSignals / 7) * 0.04
  );

  return {
    isSeverelyInvalid,
    isValidResponse: !isSeverelyInvalid && validSignals >= 4,
    validSignals,
    strengthScore,
    isGroundingWeak: Boolean(
      groundingDiagnostics?.gateTier
      && groundingDiagnostics?.gateTier !== "grounded"
      && groundingDiagnostics?.responsePattern !== "short_but_relevant"
    )
  };
}

function normalizeQuestionMeta(questionMeta = null) {
  const source = toObject(questionMeta);
  const visualSource = toObject(source?.visual_features || source?.visualFeatures);
  return {
    title: normalizeText(source?.title || source?.topic),
    question_content: normalizeText(source?.question_content || source?.questionContent || source?.content),
    image_type: normalizeText(source?.image_type || source?.imageType).toLowerCase(),
    metadata_quality: normalizeText(source?.metadata_quality || source?.metadataQuality),
    key_points: normalizeStringList(source?.key_points || source?.keyPoints, 6),
    key_terms: normalizeStringList(source?.key_terms || source?.keyTerms, 8),
    key_elements: normalizeStringList(source?.key_elements || source?.keyElements, 6),
    relations: normalizeStringList(source?.relations, 6),
    implications_or_conclusion: normalizeStringList(
      source?.implications_or_conclusion || source?.implicationsOrConclusion,
      4
    ),
    numbers_or_extremes: normalizeStringList(source?.numbers_or_extremes || source?.numbersOrExtremes, 6),
    sequence_or_trend: normalizeStringList(source?.sequence_or_trend || source?.sequenceOrTrend, 5),
    comparison_axes: normalizeStringList(source?.comparison_axes || source?.comparisonAxes, 5),
    visual_features: {
      has_trend: Boolean(visualSource?.has_trend ?? visualSource?.hasTrend),
      has_comparison: Boolean(visualSource?.has_comparison ?? visualSource?.hasComparison),
      has_extreme: Boolean(visualSource?.has_extreme ?? visualSource?.hasExtreme),
      has_numbers: Boolean(visualSource?.has_numbers ?? visualSource?.hasNumbers)
    }
  };
}

function normalizeAudioSignals(audioSignals = null, transcript = "") {
  const source = toObject(audioSignals);
  const durationSec = Math.max(0, Math.round(Number(source?.duration_sec ?? source?.durationSec ?? 0)));
  const durationMs = Math.max(0, Math.round(Number(source?.duration_ms ?? source?.durationMs ?? durationSec * 1000)));
  const transcriptWordCount = Math.max(
    0,
    Math.round(Number(source?.transcript_word_count ?? source?.transcriptWordCount ?? countWordTokens(transcript)))
  );
  const speechRateWps = Number(source?.speech_rate_wps ?? source?.speechRateWps);
  const inferredSpeechRate = durationSec > 0 ? transcriptWordCount / Math.max(durationSec, 1) : 0;

  return {
    duration_sec: durationSec,
    duration_ms: durationMs,
    non_silent_frame_ratio: clampUnit(Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0)),
    silence_frame_ratio: clampUnit(
      Number(
        source?.silence_frame_ratio
        ?? source?.silenceFrameRatio
        ?? (1 - Number(source?.non_silent_frame_ratio ?? source?.nonSilentFrameRatio ?? 0))
      )
    ),
    peak_amplitude: clampUnit(Number(source?.peak_amplitude ?? source?.peakAmplitude ?? 0)),
    rms_amplitude: clampUnit(Number(source?.rms_amplitude ?? source?.rmsAmplitude ?? 0)),
    mean_abs_amplitude: clampUnit(Number(source?.mean_abs_amplitude ?? source?.meanAbsAmplitude ?? 0)),
    amplitude_dynamic_range: clampUnit(
      Number(source?.amplitude_dynamic_range ?? source?.amplitudeDynamicRange ?? 0)
    ),
    transcript_word_count: transcriptWordCount,
    speech_rate_wps: clampMetric(
      Number.isFinite(speechRateWps) ? speechRateWps : inferredSpeechRate,
      0,
      8,
      2
    ),
    playback_usable: source?.playback_usable == null ? true : Boolean(source?.playback_usable ?? source?.playbackUsable),
    has_usable_audio: source?.has_usable_audio == null ? true : Boolean(source?.has_usable_audio ?? source?.hasUsableAudio)
  };
}

function buildTranscriptInfo(transcript = "") {
  const normalized = normalizeText(transcript).toLowerCase();
  const tokens = tokenizeText(normalized);
  const alphaTokens = tokens.filter((token) => /[a-z]/.test(token));
  const fillerCount = tokens.filter((token) => DI_FILLER_WORDS.has(token)).length;

  return {
    text: normalized,
    tokenSet: new Set(tokens),
    alphaTokens,
    wordCount: alphaTokens.length,
    alphaWordRatio: tokens.length ? alphaTokens.length / tokens.length : 0,
    fillerRatio: tokens.length ? fillerCount / tokens.length : 0,
    comparisonCue: /(compare|compared|comparison|whereas|while|higher than|lower than|more than|less than|difference|gap|versus|vs)/i.test(normalized),
    conclusionCue: /(overall|in conclusion|to conclude|in summary|to sum up|it can be concluded|this suggests|this indicates)/i.test(normalized),
    trendCue: /(trend|increase|decrease|rise|fall|grew|dropped|upward|downward|fluctuat|peak|decline)/i.test(normalized),
    sequenceCue: /(first|then|next|after that|afterwards|finally|at the end|step|stage|begin|start|end)/i.test(normalized),
    numberCue: /\b\d+(?:\.\d+)?(?:\s?(?:%|percent|years?|months?|days?|hours?|minutes?|seconds?|kg|g|million|billion))?\b/i.test(normalized),
    extremeCue: /(highest|lowest|largest|smallest|most|least|majority|minority|peak|top|bottom)/i.test(normalized)
  };
}

function computeListCoverage(list = [], transcriptInfo = {}) {
  const items = normalizeStringList(list, 8);
  if (!items.length) return 0;
  const hits = items.filter((item) => hasDescriptorMatch(item, transcriptInfo)).length;
  return hits / items.length;
}

function hasDescriptorMatch(item = "", transcriptInfo = {}) {
  const normalizedItem = normalizeText(item).toLowerCase();
  if (!normalizedItem) return false;
  if (transcriptInfo.text?.includes(normalizedItem)) return true;

  if (/overall|conclusion|summary|suggests|indicates/.test(normalizedItem)) {
    return Boolean(transcriptInfo.conclusionCue);
  }
  if (/compare|versus|difference|gap/.test(normalizedItem)) {
    return Boolean(transcriptInfo.comparisonCue);
  }
  if (/trend|rise|fall|fluctuat|over time/.test(normalizedItem)) {
    return Boolean(transcriptInfo.trendCue);
  }
  if (/first|next|final|step|stage/.test(normalizedItem)) {
    return Boolean(transcriptInfo.sequenceCue);
  }
  if (/highest|lowest|largest|smallest|percentage|share|value|figure/.test(normalizedItem)) {
    return Boolean(transcriptInfo.extremeCue || transcriptInfo.numberCue);
  }

  const tokens = tokenizeText(normalizedItem).filter((token) => !DI_META_GENERIC_TERMS.has(token));
  if (!tokens.length) return false;
  const hitCount = tokens.filter((token) => transcriptInfo.tokenSet?.has(token)).length;
  return hitCount >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

function tokenizeText(text = "") {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9%\s']/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countWordTokens(text = "") {
  return tokenizeText(text).filter((token) => /[a-z]/.test(token)).length;
}

function normalizeStringList(value, limit = 6) {
  const source = Array.isArray(value) ? value : [value];
  const output = [];
  const seen = new Set();

  source.forEach((item) => {
    const text = normalizeLooseText(item);
    if (!text) return;
    const lower = text.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    output.push(text);
  });

  return output.slice(0, limit);
}

function normalizeLooseText(value) {
  if (typeof value === "string") return normalizeText(value);
  if (!value || typeof value !== "object") return "";
  return normalizeText(
    value.text
    || value.label
    || value.title
    || value.name
    || value.point
    || value.word
    || value.value
  );
}

function windowScore(value, floorMin, idealMin, idealMax, ceilingMax) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.5;
  if (num <= floorMin || num >= ceilingMax) return 0;
  if (num >= idealMin && num <= idealMax) return 1;
  if (num < idealMin) {
    return clampUnit((num - floorMin) / Math.max(idealMin - floorMin, 1e-6));
  }
  return clampUnit((ceilingMax - num) / Math.max(ceilingMax - idealMax, 1e-6));
}

function clampUnit(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function clampMetric(value, min = 0, max = 1, digits = 2) {
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

function clampSigned(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function clampScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeStatus(value) {
  const normalized = normalizeText(value);
  if (normalized === DI_STATUS_AI_DEGRADED) return DI_STATUS_AI_DEGRADED;
  if (normalized === DI_STATUS_FAILED) return DI_STATUS_FAILED;
  return DI_STATUS_SCORED;
}

function resolveReviewLabel(status) {
  if (status === DI_STATUS_AI_DEGRADED) return DI_REVIEW_LABEL_DEGRADED;
  if (status === DI_STATUS_FAILED) return DI_REVIEW_LABEL_FAILED;
  return DI_REVIEW_LABEL;
}

function normalizeFeedback(value, fallback = "") {
  const text = normalizeText(value);
  if (!text) return fallback;
  return text.slice(0, 140);
}

function normalizeBetterResponse(value, fallback = "") {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (!text) return fallback;
  return text.slice(0, 220);
}

function buildFallbackFeedback(reasonCode = "") {
  const message = mapDIReasonCodeToZh(reasonCode);
  if (reasonCode === "content_zero") {
    return "这次回答和图内容关联还不够强。下次先说主题，再补一个关系和一句总结。";
  }
  if (reasonCode === "transcript_empty" || reasonCode === "transcript_too_short") {
    return "这次没有拿到足够的转写文本。请保证开口更早、更完整，再提交一次。";
  }
  if (reasonCode === "audio_not_usable") {
    return "这次录音质量不稳定，系统没法做稳定评分。请检查麦克风后再试一次。";
  }
  return `${message} 建议先按“主题-细节关系-总结”三步来描述。`.slice(0, 140);
}

function buildFallbackBetterResponse(questionMeta = null, transcript = "") {
  const imageType = normalizeText(questionMeta?.image_type);
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
  if (normalizeText(transcript)) {
    return "This image presents several important features. Overall, the main pattern and the key comparison should be highlighted clearly.";
  }
  return "This image presents several important features. Overall, the key pattern and the main comparison should be stated clearly.";
}

function dedupeReasonCodes(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => normalizeText(item)).filter(Boolean))];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}
