const RTS_STATUS_SCORED = "scored";
const RTS_STATUS_RULE_GATED = "rule_gated";
const RTS_STATUS_AI_DEGRADED = "ai_review_degraded";
const RTS_GATE_POLICY = "product_relaxed_fluency_first";
const RTS_REVIEW_LABEL = "AI璇勯槄锛堜及鍒嗭級";
const RTS_REVIEW_LABEL_GATE = "鍐呭闂ㄦ鎻愮ず";
const RTS_REVIEW_LABEL_DEGRADED = "AI璇勯槄锛堥檷绾э級";
const RTS_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";
const RTS_AI_TIMEOUT_REASON_CODE = "ai_review_timeout";
const RTS_AI_PARSE_REASON_CODE = "ai_review_parse_failed";
const RTS_AI_PROVIDER_REASON_CODE = "ai_review_provider_error";
const RTS_KEYS_MISSING_REASON_CODE = "llm_api_keys_missing";
const RTS_AUTH_MISSING_REASON_CODE = "auth_session_missing";
const RTS_AUTH_EXPIRED_REASON_CODE = "auth_session_expired";
const RTS_STORAGE_FAILED_REASON_CODE = "practice_logs_update_failed";

const CONTENT_RAW_MAX = 3;
const PRONUNCIATION_RAW_MAX = 5;
const FLUENCY_RAW_MAX = 5;

const DISPLAY_MIN_SCORE = 10;
const DISPLAY_MAX_SCORE = 90;
const RTS_DISPLAY_WEIGHTS = {
  content: 0.15,
  pronunciation: 0.25,
  fluency: 0.6
};
const RTS_CONTENT_RELEVANCE_GATE_FLOOR = 45;
const RTS_CONTENT_MEDIUM_COVERAGE_FLOOR = 65;
const RTS_CONTENT_HIGH_COVERAGE_FLOOR = 70;
const RTS_CONTENT_VERY_HIGH_COVERAGE_FLOOR = 78;
const RTS_CONTENT_WEAK_RELATED_MIN = 30;
const RTS_CONTENT_WEAK_RELATED_MAX = 44;
const RTS_CONTENT_OFF_TOPIC_MAX = 30;
const RTS_FLUENCY_PASS_LINE = 70;
const RTS_OVERALL_FLUENCY_PASS_FLOOR = 65;
const RTS_SOFT_CONTENT_DEDUCTION_MAX = 6;

const RTS_SOFT_CONTENT_DEDUCTION_MAP = {
  appropriacy_zero_template_like: 2,
  appropriacy_zero_register_mismatch: 1,
  appropriacy_zero_goal_not_met: 2,
  appropriacy_zero_too_short: 2,
  appropriacy_zero_context_incoherent: 3
};

const RTS_REASON_CODE_SET = new Set([
  "appropriacy_zero_off_topic",
  "appropriacy_zero_goal_not_met",
  "appropriacy_zero_template_like",
  "appropriacy_zero_context_incoherent",
  "appropriacy_zero_register_mismatch",
  "appropriacy_zero_too_short",
  "transcript_empty",
  "audio_not_usable",
  RTS_AI_TIMEOUT_REASON_CODE,
  RTS_AI_PARSE_REASON_CODE,
  RTS_AI_PROVIDER_REASON_CODE,
  RTS_KEYS_MISSING_REASON_CODE,
  RTS_AUTH_MISSING_REASON_CODE,
  RTS_AUTH_EXPIRED_REASON_CODE,
  RTS_STORAGE_FAILED_REASON_CODE,
  RTS_AI_FALLBACK_REASON_CODE
]);

const RTS_HARD_GATE_REASON_CODES = new Set([
  "appropriacy_zero_off_topic",
  "appropriacy_zero_goal_not_met",
  "appropriacy_zero_context_incoherent",
  "appropriacy_zero_too_short",
  "transcript_empty",
  "audio_not_usable"
]);

const RTS_CONTENT_ENTITY_HINTS = new Set([
  "professor",
  "teacher",
  "friend",
  "classmate",
  "lecturer",
  "tutor",
  "manager",
  "colleague",
  "supervisor",
  "coach",
  "boss",
  "sir",
  "madam"
]);

const RTS_CONTENT_EVENT_HINTS = new Set([
  "email",
  "assignment",
  "assignments",
  "homework",
  "address",
  "wrong",
  "class",
  "classes",
  "lecture",
  "skip",
  "skips",
  "arrive",
  "arrives",
  "late",
  "leave",
  "leaves",
  "early",
  "absent",
  "attendance",
  "delay",
  "delayed",
  "missed",
  "missing",
  "borrow",
  "lend",
  "reschedule",
  "extension",
  "submit",
  "sent",
  "send",
  "resend",
  "message",
  "notes",
  "deadline",
  "received",
  "receive",
  "confusion",
  "fix",
  "correct",
  "broken",
  "computer",
  "noisy",
  "noise",
  "party",
  "lost",
  "notebook",
  "report"
]);

const RTS_CONTENT_INTENT_HINTS = new Set([
  "apology",
  "apologize",
  "apologise",
  "explain",
  "ask",
  "request",
  "suggest",
  "advice",
  "advise",
  "recommend",
  "report",
  "resend",
  "borrow",
  "lend",
  "extension",
  "help",
  "clarify",
  "inform",
  "check",
  "confirm"
]);

const RTS_CONTENT_PROBLEM_HINTS = new Set([
  "problem",
  "issue",
  "skip",
  "skips",
  "late",
  "early",
  "leave",
  "leaves",
  "arrive",
  "arrives",
  "deadline",
  "assignment",
  "assignments",
  "homework",
  "missing",
  "missed",
  "stress",
  "stressed"
]);

const RTS_CONTENT_GOAL_HINTS = new Set([
  "apology",
  "apologize",
  "apologise",
  "explain",
  "ask",
  "request",
  "advice",
  "advise",
  "suggest",
  "suggestion",
  "recommend",
  "report",
  "help",
  "fix",
  "solve",
  "extension",
  "resend",
  "borrow",
  "lend",
  "clarify",
  "inform",
  "confirm"
]);

const RTS_QUESTION_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "by",
  "can",
  "could",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "today",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your"
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

const RTS_REASON_CODE_ZH = {
  appropriacy_zero_off_topic: "回答内容与题目场景不匹配。",
  appropriacy_zero_goal_not_met: "回答没有完成题目要求的回应目标。",
  appropriacy_zero_template_like: "表达有些模板化，建议补充更具体的场景细节。",
  appropriacy_zero_context_incoherent: "语境不够清晰，影响理解。",
  appropriacy_zero_register_mismatch: "语气可再调整，但主要先保证关键信息完整。",
  appropriacy_zero_too_short: "回答过短，关键信息不足。",
  transcript_empty: "未识别到有效转写文本。",
  audio_not_usable: "录音可用性不足，无法稳定评阅。",
  [RTS_AI_TIMEOUT_REASON_CODE]: "AI评阅超时，已返回降级估分结果。",
  [RTS_AI_PARSE_REASON_CODE]: "AI评阅结果解析失败，已返回降级估分结果。",
  [RTS_AI_PROVIDER_REASON_CODE]: "AI评阅服务异常，已返回降级估分结果。",
  [RTS_KEYS_MISSING_REASON_CODE]: "AI评阅服务尚未完成配置。",
  [RTS_AUTH_MISSING_REASON_CODE]: "登录状态缺失，请重新登录后重试。",
  [RTS_AUTH_EXPIRED_REASON_CODE]: "登录状态已过期，请重新登录后重试。",
  [RTS_STORAGE_FAILED_REASON_CODE]: "评分结果写回失败，请稍后重试。",
  [RTS_AI_FALLBACK_REASON_CODE]: "AI评阅服务暂时不可用。"
};

export function normalizeRTSFallbackReasonCode(value, rawErrorType = "") {
  const normalized = normalizeText(value || rawErrorType).toLowerCase();
  if (!normalized) return RTS_AI_FALLBACK_REASON_CODE;
  if (normalized === "transcript_empty") return "transcript_empty";
  if (normalized === "audio_not_usable") return "audio_not_usable";
  if (normalized === RTS_KEYS_MISSING_REASON_CODE) return RTS_KEYS_MISSING_REASON_CODE;
  if (normalized.includes("auth_session_missing")) return RTS_AUTH_MISSING_REASON_CODE;
  if (normalized.includes("auth_session_expired")) return RTS_AUTH_EXPIRED_REASON_CODE;
  if (normalized.includes("practice_logs_update_failed")) return RTS_STORAGE_FAILED_REASON_CODE;
  if (
    normalized.includes("timeout")
    || normalized.includes("abort")
    || normalized === "rts_score_timeout"
  ) {
    return RTS_AI_TIMEOUT_REASON_CODE;
  }
  if (
    normalized.includes("parse")
    || normalized.includes("invalid_json")
    || normalized.includes("invalid json")
    || normalized.includes("normalize")
  ) {
    return RTS_AI_PARSE_REASON_CODE;
  }
  if (
    normalized.includes("provider")
    || normalized.includes("gemini")
    || normalized.includes("groq")
    || normalized.includes("fetch")
    || normalized.includes("service")
    || normalized.includes("http_")
    || normalized.includes("route_not_found")
  ) {
    return RTS_AI_PROVIDER_REASON_CODE;
  }
  if (normalized === RTS_AI_FALLBACK_REASON_CODE) return RTS_AI_FALLBACK_REASON_CODE;
  return normalized.replace(/[^a-z0-9_]+/g, "_") || RTS_AI_FALLBACK_REASON_CODE;
}

export function getRTSFallbackReasonMessage(reasonCode) {
  return RTS_REASON_CODE_ZH[normalizeRTSFallbackReasonCode(reasonCode)] || RTS_REASON_CODE_ZH[RTS_AI_FALLBACK_REASON_CODE];
}

export function finalizeRTSScorePayload(
  payload,
  {
    transcript = "",
    questionContent = "",
    questionMeta = {},
    audioSignals = {},
    providerUsed = "gemini",
    fallbackReason = null
  } = {}
) {
  const safePayload = toObject(payload) || {};
  const transcriptMetrics = buildTranscriptMetrics(transcript);
  const normalizedAudioSignals = normalizeAudioSignals(audioSignals);
  const questionMetaSnapshot = normalizeQuestionMeta(questionMeta);

  const contentRaw = clampScore(
    firstNumber(
      safePayload?.official_traits?.appropriacy?.score,
      safePayload?.official_traits?.appropriacy,
      safePayload?.traits?.appropriacy?.score,
      safePayload?.appropriacy
    ),
    0,
    CONTENT_RAW_MAX
  );
  const pronunciationRaw = clampScore(
    firstNumber(
      safePayload?.official_traits?.pronunciation?.score,
      safePayload?.official_traits?.pronunciation,
      safePayload?.traits?.pronunciation?.score,
      safePayload?.pronunciation
    ),
    0,
    PRONUNCIATION_RAW_MAX
  );
  const fluencyRaw = clampScore(
    firstNumber(
      safePayload?.official_traits?.oral_fluency?.score,
      safePayload?.official_traits?.oral_fluency,
      safePayload?.official_traits?.oralFluency?.score,
      safePayload?.traits?.oral_fluency?.score,
      safePayload?.oral_fluency,
      safePayload?.fluency
    ),
    0,
    FLUENCY_RAW_MAX
  );

  const modelReasonCodes = normalizeReasonCodes(
    safePayload?.gate?.reason_codes || safePayload?.gate?.reasonCodes
  );
  const contentSignals = buildRTSContentSignals({
    transcript,
    questionContent,
    questionMeta: questionMetaSnapshot,
    transcriptMetrics
  });
  const hardGateDecision = buildRTSHardGateDecision({
    transcriptMetrics,
    audioSignals: normalizedAudioSignals,
    contentSignals,
    modelReasonCodes,
    contentRaw
  });
  const gateTriggered = hardGateDecision.triggered;
  const reasonCodes = normalizeReasonCodes(
    hardGateDecision.reason_codes,
    {
      gateTriggered,
      fallbackCode: transcriptMetrics.word_count < 6 ? "appropriacy_zero_too_short" : "appropriacy_zero_goal_not_met",
      allowSet: RTS_HARD_GATE_REASON_CODES
    }
  );
  const status = gateTriggered ? RTS_STATUS_RULE_GATED : RTS_STATUS_SCORED;

  const modelOverallRaw = clampScore(
    firstNumber(
      safePayload?.product?.overall,
      safePayload?.overall
    ),
    0,
    DISPLAY_MAX_SCORE
  );
  const displayScores = buildDisplayScores({
    contentRaw,
    pronunciationRaw,
    fluencyRaw,
    gateTriggered,
    transcriptMetrics,
    audioSignals: normalizedAudioSignals,
    contentSignals,
    modelReasonCodes
  });

  const feedbackLines = normalizeFeedbackList(
    safePayload?.product?.feedback_zh || safePayload?.product?.feedbackZh,
    buildDefaultRTSFeedbackLines({
      gateTriggered,
      contentSignals
    })
  );
  const betterExpression = resolveSimpleEnglishBetterExpression({
    candidate: normalizeText(
      safePayload?.product?.better_expression_zh || safePayload?.product?.betterExpressionZh
    ),
    gateTriggered,
    contentSignals,
    questionContent
  });
  const feedback = normalizeText(
    safePayload?.feedback
      || safePayload?.product?.final_comment
      || feedbackLines.join(" ")
  ) || feedbackLines.join(" ");

  return {
    taskType: "RTS",
    status,
    is_ai_review_degraded: false,
    is_estimated: true,
    review_label: gateTriggered ? RTS_REVIEW_LABEL_GATE : RTS_REVIEW_LABEL,
    official_traits: {
      appropriacy: {
        score: contentRaw,
        max: CONTENT_RAW_MAX
      },
      pronunciation: {
        score: pronunciationRaw,
        max: PRONUNCIATION_RAW_MAX
      },
      oral_fluency: {
        score: fluencyRaw,
        max: FLUENCY_RAW_MAX
      }
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
    overall: displayScores.overall,
    gate: {
      triggered: gateTriggered,
      reason_codes: reasonCodes,
      policy: normalizePolicy(safePayload?.gate?.policy)
    },
    product: {
      overall: displayScores.overall,
      content: displayScores.content,
      pronunciation: displayScores.pronunciation,
      fluency: displayScores.fluency,
      feedback_zh: feedbackLines,
      better_expression_zh: betterExpression
    },
    diagnostics: {
      appropriacy_subsignals: normalizeAppropriacySubsignals(safePayload?.diagnostics?.appropriacy_subsignals),
      transcript_metrics: {
        ...transcriptMetrics,
        template_overlap_ratio: clampDecimal(
          firstNumber(
            safePayload?.diagnostics?.transcript_metrics?.template_overlap_ratio,
            safePayload?.diagnostics?.transcript_metrics?.templateOverlapRatio
          ),
          0,
          1
        )
      },
      audio_signals: normalizedAudioSignals,
      content_signals: contentSignals,
      hard_gate_decision: hardGateDecision,
      internal_traits: normalizeInternalTraits(safePayload?.diagnostics?.internal_traits),
      question_meta: questionMetaSnapshot,
      question_preview: normalizeText(questionContent).slice(0, 180),
      model_overall_raw: modelOverallRaw,
      display_scores: displayScores
    },
    feedback,
    provider_used: normalizeProvider(providerUsed),
    fallback_reason: normalizeFallbackReason(fallbackReason),
    gate_reason_messages_zh: reasonCodes.map((code) => RTS_REASON_CODE_ZH[code]).filter(Boolean)
  };
}

export function buildRTSAiFallbackResult(
  {
    transcript = "",
    questionContent = "",
    questionMeta = {},
    audioSignals = {},
    providerUsed = "none",
    fallbackReason = null,
    errorStage = "provider_call",
    rawErrorType = "",
    reasonCodes = []
  } = {}
) {
  const transcriptMetrics = buildTranscriptMetrics(transcript);
  const normalizedAudioSignals = normalizeAudioSignals(audioSignals);
  const questionMetaSnapshot = normalizeQuestionMeta(questionMeta);
  const normalizedFallbackReason = normalizeRTSFallbackReasonCode(fallbackReason, rawErrorType);
  const contentSignals = buildRTSContentSignals({
    transcript,
    questionContent,
    questionMeta: questionMetaSnapshot,
    transcriptMetrics
  });
  const heuristicTraits = buildHeuristicTraits({
    transcriptMetrics,
    audioSignals: normalizedAudioSignals,
    contentSignals
  });
  const displayScores = buildDisplayScores({
    contentRaw: heuristicTraits.content_raw,
    pronunciationRaw: heuristicTraits.pronunciation_raw,
    fluencyRaw: heuristicTraits.fluency_raw,
    gateTriggered: false,
    transcriptMetrics,
    audioSignals: normalizedAudioSignals,
    contentSignals,
    modelReasonCodes: []
  });

  const fallbackCodes = dedupe([
    ...normalizeReasonCodes(reasonCodes),
    normalizedFallbackReason,
    transcriptMetrics.word_count ? "" : "transcript_empty",
    normalizedAudioSignals.has_usable_audio ? "" : "audio_not_usable",
    RTS_AI_FALLBACK_REASON_CODE
  ]);

  const feedbackLines = [
    "录音与练习记录已保存，但本次 AI 评阅暂时不可用。",
    "你可以稍后重试评分，或先继续下一题保持练习节奏。"
  ];
  const feedback = "录音已保存，AI评阅暂时不可用，本次结果为降级估分。";

  return {
    taskType: "RTS",
    status: RTS_STATUS_AI_DEGRADED,
    is_ai_review_degraded: true,
    is_estimated: true,
    review_label: RTS_REVIEW_LABEL_DEGRADED,
    official_traits: {
      appropriacy: {
        score: heuristicTraits.content_raw,
        max: CONTENT_RAW_MAX
      },
      pronunciation: {
        score: heuristicTraits.pronunciation_raw,
        max: PRONUNCIATION_RAW_MAX
      },
      oral_fluency: {
        score: heuristicTraits.fluency_raw,
        max: FLUENCY_RAW_MAX
      }
    },
    raw_traits: {
      content_raw: heuristicTraits.content_raw,
      pronunciation_raw: heuristicTraits.pronunciation_raw,
      fluency_raw: heuristicTraits.fluency_raw
    },
    scores: {
      content: displayScores.content,
      pronunciation: displayScores.pronunciation,
      fluency: displayScores.fluency
    },
    overall: displayScores.overall,
    gate: {
      triggered: false,
      reason_codes: fallbackCodes,
      policy: RTS_GATE_POLICY
    },
    product: {
      overall: displayScores.overall,
      content: displayScores.content,
      pronunciation: displayScores.pronunciation,
      fluency: displayScores.fluency,
      feedback_zh: feedbackLines,
      better_expression_zh: buildSimpleEnglishSuggestion({
        gateTriggered: false,
        contentSignals,
        questionContent
      })
    },
    diagnostics: {
      appropriacy_subsignals: {
        task_completion: 0,
        context_fit: 0,
        info_completeness: 0,
        naturalness: 0,
        tone_politeness: 0
      },
      transcript_metrics: {
        ...transcriptMetrics,
        template_overlap_ratio: 0
      },
      audio_signals: normalizedAudioSignals,
      content_signals: contentSignals,
      internal_traits: {
        pronunciation_internal: heuristicTraits.pronunciation_raw,
        oral_fluency_internal: heuristicTraits.fluency_raw
      },
      question_meta: questionMetaSnapshot,
      question_preview: normalizeText(questionContent).slice(0, 180),
      display_scores: displayScores
    },
    feedback,
    provider_used: normalizeProvider(providerUsed),
    fallback_reason: normalizedFallbackReason,
    fallback_reason_message_zh: getRTSFallbackReasonMessage(normalizedFallbackReason),
    error_stage: normalizeText(errorStage) || "provider_call",
    raw_error_type: normalizeText(rawErrorType),
    gate_reason_messages_zh: fallbackCodes.map((code) => RTS_REASON_CODE_ZH[code]).filter(Boolean)
  };
}

function buildHeuristicTraits({ transcriptMetrics, audioSignals, contentSignals = null } = {}) {
  const wordCount = Number(transcriptMetrics?.word_count || 0);
  const uniqueWordRatio = Number(transcriptMetrics?.unique_word_ratio || 0);
  const nonSilentRatio = Number(audioSignals?.non_silent_frame_ratio || 0);
  const durationSec = Number(audioSignals?.duration_sec || 0);
  const hasUsableAudio = Boolean(audioSignals?.has_usable_audio);
  const coverageTier = `${contentSignals?.coverage_tier || contentSignals?.related_tier || "none"}`;
  const baselineContentRaw = wordCount >= 18 ? 2 : wordCount >= 8 ? 1 : 0;
  const coverageContentRaw = (
    coverageTier === "very_high" ? 3
      : coverageTier === "high" ? 2
        : coverageTier === "medium" ? 2
          : coverageTier === "low" ? 1
            : 0
  );
  const contentRaw = clampScore(
    Math.max(baselineContentRaw, coverageContentRaw),
    0,
    CONTENT_RAW_MAX
  );
  const pronunciationRaw = clampScore(
    (hasUsableAudio ? 1 : 0)
      + (nonSilentRatio >= 0.32 ? 2 : nonSilentRatio >= 0.12 ? 1 : 0)
      + (uniqueWordRatio >= 0.45 ? 1 : 0),
    0,
    PRONUNCIATION_RAW_MAX
  );
  const fluencyRaw = clampScore(
    (wordCount >= 14 ? 2 : wordCount >= 8 ? 1 : 0)
      + (durationSec >= 15 ? 1 : 0)
      + (nonSilentRatio >= 0.28 ? 1 : 0),
    0,
    FLUENCY_RAW_MAX
  );

  return {
    content_raw: contentRaw,
    pronunciation_raw: pronunciationRaw,
    fluency_raw: fluencyRaw
  };
}

function normalizeAppropriacySubsignals(value) {
  const source = toObject(value) || {};
  return {
    task_completion: clampScore(firstNumber(source?.task_completion, source?.taskCompletion), 0, 2),
    context_fit: clampScore(firstNumber(source?.context_fit, source?.contextFit), 0, 2),
    info_completeness: clampScore(firstNumber(source?.info_completeness, source?.infoCompleteness), 0, 2),
    naturalness: clampScore(firstNumber(source?.naturalness), 0, 2),
    tone_politeness: clampScore(firstNumber(source?.tone_politeness, source?.tonePoliteness), 0, 2)
  };
}

function normalizeInternalTraits(value) {
  const source = toObject(value) || {};
  const pronunciationInternal = firstNumber(source?.pronunciation_internal, source?.pronunciationInternal);
  const fluencyInternal = firstNumber(source?.oral_fluency_internal, source?.oralFluencyInternal);
  return {
    pronunciation_internal: Number.isFinite(pronunciationInternal) ? clampScore(pronunciationInternal, 0, PRONUNCIATION_RAW_MAX) : null,
    oral_fluency_internal: Number.isFinite(fluencyInternal) ? clampScore(fluencyInternal, 0, FLUENCY_RAW_MAX) : null
  };
}

function normalizeQuestionMeta(value) {
  const source = toObject(value) || {};
  return {
    topic: normalizeText(source?.topic),
    tone: normalizeText(source?.tone),
    role: normalizeText(source?.role),
    directions_head: normalizeText(source?.directions_head || source?.directionsHead)
  };
}

function normalizeAudioSignals(value) {
  const source = toObject(value) || {};
  const hasUsableAudioRaw = source?.has_usable_audio ?? source?.hasUsableAudio;
  const playbackUsableRaw = source?.playback_usable ?? source?.playbackUsable;
  return {
    duration_sec: Math.max(0, Math.round(firstNumber(source?.duration_sec, source?.durationSec, 0))),
    duration_ms: Math.max(0, Math.round(firstNumber(source?.duration_ms, source?.durationMs, 0))),
    non_silent_frame_ratio: clampDecimal(firstNumber(source?.non_silent_frame_ratio, source?.nonSilentFrameRatio, 0), 0, 1),
    silence_warning: Boolean(source?.silence_warning || source?.silenceWarning),
    final_usable_reason: normalizeText(source?.final_usable_reason || source?.finalUsableReason),
    has_usable_audio: hasUsableAudioRaw == null ? true : Boolean(hasUsableAudioRaw),
    playback_usable: playbackUsableRaw == null ? true : Boolean(playbackUsableRaw)
  };
}

function buildTranscriptMetrics(transcript) {
  const text = normalizeText(transcript);
  const rawTokens = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const words = tokenizeWords(text);
  const uniqueCount = new Set(words).size;
  const uniqueWordRatio = words.length ? uniqueCount / words.length : 0;
  const englishWordRatio = rawTokens.length ? words.length / rawTokens.length : (words.length ? 1 : 0);

  return {
    word_count: words.length,
    raw_token_count: rawTokens.length,
    unique_word_ratio: clampDecimal(uniqueWordRatio, 0, 1),
    english_word_ratio: clampDecimal(englishWordRatio, 0, 1)
  };
}

function buildDisplayScores({
  contentRaw = 0,
  pronunciationRaw = 0,
  fluencyRaw = 0,
  gateTriggered = false,
  transcriptMetrics = null,
  audioSignals = null,
  contentSignals = null,
  modelReasonCodes = []
} = {}) {
  if (gateTriggered) {
    return {
      content: DISPLAY_MIN_SCORE,
      pronunciation: DISPLAY_MIN_SCORE,
      fluency: DISPLAY_MIN_SCORE,
      overall: DISPLAY_MIN_SCORE,
      guards: {
        gate_triggered: true,
        content_floor_applied: false,
        fluency_pass_floor_applied: false,
        related_tier: "none",
        soft_penalty: 0
      }
    };
  }

  const resolvedSignals = toObject(contentSignals) || {};
  const softPenalty = computeSoftContentPenalty(modelReasonCodes);
  let content = rawToDisplay(contentRaw, CONTENT_RAW_MAX);
  const pronunciation = rawToDisplay(pronunciationRaw, PRONUNCIATION_RAW_MAX);
  const fluency = rawToDisplay(fluencyRaw, FLUENCY_RAW_MAX);
  if (softPenalty > 0) {
    content = clampScore(content - softPenalty, DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE);
  }

  let contentFloorApplied = false;
  const coverageTier = `${resolvedSignals.coverage_tier || resolvedSignals.related_tier || "none"}`;
  const contentFloor = resolveCoverageContentFloor({
    coverageTier,
    transcriptMetrics,
    contentSignals: resolvedSignals
  });
  if (contentFloor > 0) {
    const flooredContent = Math.max(content, contentFloor);
    contentFloorApplied = flooredContent !== content;
    content = flooredContent;
  }

  const relevanceAdjusted = applyRTSContentRelevanceBand({
    content,
    transcriptMetrics,
    contentSignals: resolvedSignals
  });
  content = relevanceAdjusted.content;

  let overall = composeDisplayOverall({ content, pronunciation, fluency });
  let fluencyPassFloorApplied = false;
  if (shouldApplyRTSFluencyPassFloor({ fluency, transcriptMetrics, audioSignals, contentSignals: resolvedSignals })) {
    const flooredOverall = Math.max(overall, RTS_OVERALL_FLUENCY_PASS_FLOOR);
    fluencyPassFloorApplied = flooredOverall !== overall;
    overall = flooredOverall;
  }
  overall = clampScore(overall, DISPLAY_MIN_SCORE, DISPLAY_MAX_SCORE);

  return {
    content,
    pronunciation,
    fluency,
    overall,
    guards: {
      gate_triggered: false,
      content_floor_applied: contentFloorApplied,
      fluency_pass_floor_applied: fluencyPassFloorApplied,
      coverage_tier: coverageTier,
      related_tier: `${resolvedSignals.related_tier || "none"}`,
      coverage_ratio: clampDecimal(firstNumber(resolvedSignals.coverage_ratio), 0, 1),
      soft_penalty: softPenalty,
      relevance_gate_passed: Boolean(resolvedSignals.relevance_gate_passed),
      relevance_category_count: clampScore(firstNumber(resolvedSignals.relevance_category_count), 0, 3),
      relevance_band: relevanceAdjusted.band
    }
  };
}

function resolveCoverageContentFloor({
  coverageTier = "none",
  transcriptMetrics = null,
  contentSignals = null
} = {}) {
  if (Number(transcriptMetrics?.word_count || 0) <= 0) return 0;
  if (!contentSignals?.relevance_gate_passed) return 0;
  if (contentSignals?.obvious_off_topic) return 0;
  if (contentSignals?.non_english_like) return 0;
  if (contentSignals?.transcript_unusable) return 0;

  if (coverageTier === "very_high") return RTS_CONTENT_VERY_HIGH_COVERAGE_FLOOR;
  if (coverageTier === "high") return RTS_CONTENT_HIGH_COVERAGE_FLOOR;
  if (coverageTier === "medium") return RTS_CONTENT_MEDIUM_COVERAGE_FLOOR;
  return RTS_CONTENT_RELEVANCE_GATE_FLOOR;
}

function applyRTSContentRelevanceBand({
  content = DISPLAY_MIN_SCORE,
  transcriptMetrics = null,
  contentSignals = null
} = {}) {
  const signals = toObject(contentSignals) || {};
  if (signals.relevance_gate_passed) {
    return {
      content: clampScore(content, RTS_CONTENT_RELEVANCE_GATE_FLOOR, DISPLAY_MAX_SCORE),
      band: "relevant_45_plus"
    };
  }

  const wordCount = Number(transcriptMetrics?.word_count || 0);
  const weakRelevance = Boolean(signals.weak_relevance) && !signals.severe_off_topic_like;

  if (weakRelevance) {
    const categoryCount = clampScore(firstNumber(signals.relevance_category_count), 0, 3);
    const overlapHits = Math.max(0, Math.round(Number(signals.question_overlap_hits || 0)));
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
    const adjustedWeak = clampScore(
      Math.max(RTS_CONTENT_WEAK_RELATED_MIN, Math.min(content, weakTarget)),
      RTS_CONTENT_WEAK_RELATED_MIN,
      RTS_CONTENT_WEAK_RELATED_MAX
    );
    return {
      content: adjustedWeak,
      band: "weak_related_30_44"
    };
  }

  const offTopicBoost = (
    (wordCount >= 12 ? 4 : wordCount >= 7 ? 2 : 0)
    + (Number(signals.question_overlap_hits || 0) > 0 ? 2 : 0)
  );
  const offTopicTarget = clampScore(
    DISPLAY_MIN_SCORE + offTopicBoost,
    DISPLAY_MIN_SCORE,
    RTS_CONTENT_OFF_TOPIC_MAX
  );
  return {
    content: clampScore(Math.min(content, offTopicTarget), DISPLAY_MIN_SCORE, RTS_CONTENT_OFF_TOPIC_MAX),
    band: "off_topic_10_30"
  };
}

function rawToDisplay(rawScore, maxRawScore) {
  const boundedRaw = clampScore(rawScore, 0, maxRawScore);
  if (maxRawScore <= 0) return DISPLAY_MIN_SCORE;
  return clampScore(
    Math.round(DISPLAY_MIN_SCORE + (boundedRaw / maxRawScore) * (DISPLAY_MAX_SCORE - DISPLAY_MIN_SCORE)),
    DISPLAY_MIN_SCORE,
    DISPLAY_MAX_SCORE
  );
}

function composeDisplayOverall({ content = 0, pronunciation = 0, fluency = 0 } = {}) {
  const weighted = (
    Number(content || 0) * RTS_DISPLAY_WEIGHTS.content
    + Number(pronunciation || 0) * RTS_DISPLAY_WEIGHTS.pronunciation
    + Number(fluency || 0) * RTS_DISPLAY_WEIGHTS.fluency
  );
  return Math.round(weighted);
}

function shouldApplyRTSFluencyPassFloor({
  fluency = 0,
  transcriptMetrics = null,
  audioSignals = null,
  contentSignals = null
} = {}) {
  if (Number(fluency || 0) < RTS_FLUENCY_PASS_LINE) return false;
  if (Number(transcriptMetrics?.word_count || 0) <= 0) return false;
  if (!audioSignals?.has_usable_audio) return false;
  if (contentSignals?.relevance_gate_passed === false) return false;
  if (contentSignals?.obvious_off_topic) return false;
  if (contentSignals?.non_english_like) return false;
  if (contentSignals?.transcript_unusable) return false;
  return true;
}

function computeSoftContentPenalty(modelReasonCodes = []) {
  const normalized = normalizeReasonCodes(modelReasonCodes);
  if (!normalized.length) return 0;
  const totalPenalty = normalized.reduce((sum, code) => sum + Number(RTS_SOFT_CONTENT_DEDUCTION_MAP[code] || 0), 0);
  return clampScore(totalPenalty, 0, RTS_SOFT_CONTENT_DEDUCTION_MAX);
}

function buildRTSContentSignals({
  transcript = "",
  questionContent = "",
  questionMeta = {},
  transcriptMetrics = null
} = {}) {
  const transcriptTokens = tokenizeWords(transcript);
  const transcriptTextLower = normalizeText(transcript).toLowerCase();
  const transcriptTokensForRelevance = filterEffectiveTokens(transcriptTokens, RTS_TEMPLATE_NOISE_TOKENS);
  const questionTokens = tokenizeWords(questionContent);
  const questionTokensForRelevance = filterEffectiveTokens(questionTokens, RTS_TEMPLATE_NOISE_TOKENS);
  const roleTokens = tokenizeWords(
    `${questionMeta?.role || ""} ${questionMeta?.topic || ""} ${questionMeta?.directions_head || ""}`
  );
  const roleTokensForRelevance = filterEffectiveTokens(roleTokens, RTS_TEMPLATE_NOISE_TOKENS);
  const questionCoreTokens = dedupe(
    questionTokensForRelevance.filter((token) => token.length >= 4 && !RTS_QUESTION_STOPWORDS.has(token))
  );
  const questionObjectTokens = questionCoreTokens.filter((token) => (
    RTS_CONTENT_ENTITY_HINTS.has(token) || roleTokensForRelevance.includes(token)
  ));
  const questionEventTokens = questionCoreTokens.filter((token) => RTS_CONTENT_EVENT_HINTS.has(token));
  const questionProblemTokens = questionCoreTokens.filter((token) => RTS_CONTENT_PROBLEM_HINTS.has(token));
  const questionGoalTokens = questionCoreTokens.filter((token) => RTS_CONTENT_GOAL_HINTS.has(token));

  const entityHits = countHintHits(transcriptTokensForRelevance, RTS_CONTENT_ENTITY_HINTS)
    + countTokenOverlap(transcriptTokensForRelevance, roleTokensForRelevance);
  const eventHits = countHintHits(transcriptTokensForRelevance, RTS_CONTENT_EVENT_HINTS);
  const intentHits = countHintHits(transcriptTokensForRelevance, RTS_CONTENT_INTENT_HINTS);
  const questionOverlapHits = countTokenOverlap(transcriptTokensForRelevance, questionCoreTokens);
  const objectOverlapHits = countTokenOverlap(transcriptTokensForRelevance, questionObjectTokens);
  const eventOverlapHits = countTokenOverlap(transcriptTokensForRelevance, questionEventTokens);
  const problemOverlapHits = countTokenOverlap(transcriptTokensForRelevance, questionProblemTokens);
  const goalOverlapHits = countTokenOverlap(transcriptTokensForRelevance, questionGoalTokens);
  const overlapRatio = questionCoreTokens.length
    ? questionOverlapHits / questionCoreTokens.length
    : 0;

  const wordCount = Number(transcriptMetrics?.word_count || transcriptTokens.length);
  const meaningfulTokenCount = transcriptTokensForRelevance.length;
  const rawTokenCount = Number(transcriptMetrics?.raw_token_count || 0);
  const englishWordRatio = Number(transcriptMetrics?.english_word_ratio || (wordCount ? 1 : 0));
  const uniqueWordRatio = Number(transcriptMetrics?.unique_word_ratio || 0);
  const repetitionRatio = wordCount > 0 ? Math.max(0, 1 - uniqueWordRatio) : 0;
  const templatePhraseHits = countPhraseHits(transcriptTextLower, RTS_TEMPLATE_NOISE_PHRASES);

  const coversCoreObject = entityHits > 0 || objectOverlapHits > 0;
  const coversCoreEvent = eventHits > 0 || eventOverlapHits > 0 || questionOverlapHits >= 3;
  const coversCoreProblem = problemOverlapHits > 0 || (questionOverlapHits >= 4 && (eventHits > 0 || eventOverlapHits > 0));
  const coversResponseGoal = goalOverlapHits > 0 || (intentHits > 0 && (questionOverlapHits >= 1 || eventHits > 0));

  const relevanceObjectHit = coversCoreObject || entityHits > 0 || objectOverlapHits > 0;
  const relevanceEventHit = coversCoreEvent || coversCoreProblem || eventHits > 0 || eventOverlapHits > 0 || problemOverlapHits > 0;
  const relevanceActionHit = coversResponseGoal || intentHits > 0 || goalOverlapHits > 0;
  const relevanceCategoryCount = [relevanceObjectHit, relevanceEventHit, relevanceActionHit].filter(Boolean).length;

  const coverageBucketCount = [
    coversCoreObject,
    coversCoreEvent,
    coversCoreProblem,
    coversResponseGoal
  ].filter(Boolean).length;
  const coverageRatio = coverageBucketCount / 4;

  const relatedEvidenceCount = (
    entityHits
    + eventHits
    + intentHits
    + objectOverlapHits
    + eventOverlapHits
    + problemOverlapHits
    + goalOverlapHits
  );

  const relevanceGatePassed = (
    wordCount >= 6
    && relevanceCategoryCount >= 2
    && (
      relevanceCategoryCount >= 3
      || questionOverlapHits >= 2
      || eventOverlapHits >= 1
      || problemOverlapHits >= 1
      || goalOverlapHits >= 1
      || (entityHits >= 1 && eventHits >= 1)
    )
  );
  const weakRelevance = (
    !relevanceGatePassed
    && (
      relevanceCategoryCount >= 1
      || questionOverlapHits >= 1
      || relatedEvidenceCount >= 2
    )
  );
  const templateOnlyLike = (
    wordCount > 0
    && !relevanceGatePassed
    && templatePhraseHits >= 2
    && meaningfulTokenCount <= 4
    && relevanceCategoryCount <= 1
    && questionOverlapHits === 0
  );

  let coverageTier = "none";
  if (coverageBucketCount >= 4 || (coverageBucketCount >= 3 && questionOverlapHits >= 6)) {
    coverageTier = "very_high";
  } else if (coverageBucketCount >= 3 || (questionOverlapHits >= 4 && intentHits >= 1)) {
    coverageTier = "high";
  } else if (coverageBucketCount >= 2 || questionOverlapHits >= 2) {
    coverageTier = "medium";
  } else if (weakRelevance || meaningfulTokenCount >= 4) {
    coverageTier = "low";
  }

  const signalBuckets = [
    coversCoreObject,
    coversCoreEvent,
    coversCoreProblem,
    coversResponseGoal,
    questionOverlapHits >= 3
  ];
  const relatedSignalCount = signalBuckets.filter(Boolean).length;
  const relatedLikely = (
    coverageBucketCount >= 2
    || relatedSignalCount >= 2
    || questionOverlapHits >= 4
    || (entityHits >= 1 && eventHits >= 1)
    || (eventHits >= 1 && intentHits >= 1)
  );
  const relatedStrong = (
    coverageBucketCount >= 3
    || relatedSignalCount >= 3
    || questionOverlapHits >= 6
    || (entityHits >= 1 && eventHits >= 2 && intentHits >= 1)
  );
  const nonEnglishLike = rawTokenCount >= 6 && englishWordRatio <= 0.35;
  const highRepetition = wordCount >= 12 && repetitionRatio >= 0.72;
  const nonsenseLike = wordCount >= 8 && uniqueWordRatio <= 0.25 && coverageBucketCount === 0 && !relatedLikely;
  const noEffectiveIntent = (
    wordCount > 0
    && !coversResponseGoal
    && eventHits === 0
    && !coversCoreObject
    && questionOverlapHits < 2
  );
  const obviousOffTopic = (
    wordCount >= 6
    && !relevanceGatePassed
    && relevanceCategoryCount === 0
    && questionOverlapHits === 0
    && !nonEnglishLike
    && !nonsenseLike
  );
  const severeOffTopicLike = (
    !relevanceGatePassed
    && (
      templateOnlyLike
      || obviousOffTopic
      || (!weakRelevance && relatedEvidenceCount === 0)
    )
  );
  const transcriptUnusable = (
    wordCount === 0
    || wordCount < 4
    || nonEnglishLike
    || nonsenseLike
    || (highRepetition && !relatedLikely && coverageBucketCount === 0)
    || (wordCount >= 6 && templatePhraseHits >= 2 && meaningfulTokenCount <= 2 && !relevanceGatePassed)
  );

  let relatedTier = "none";
  if (coverageTier === "very_high" || coverageTier === "high" || relatedStrong) {
    relatedTier = "high";
  } else if (coverageTier === "medium" || relatedLikely || relevanceGatePassed) {
    relatedTier = "medium";
  } else if (weakRelevance && coverageTier === "low" && wordCount > 0 && !transcriptUnusable) {
    relatedTier = "low";
  }

  return {
    coverage_tier: coverageTier,
    coverage_bucket_count: coverageBucketCount,
    coverage_ratio: clampDecimal(coverageRatio, 0, 1),
    covers_core_object: coversCoreObject,
    covers_core_event: coversCoreEvent,
    covers_core_problem: coversCoreProblem,
    covers_response_goal: coversResponseGoal,
    relevance_gate_passed: relevanceGatePassed && !transcriptUnusable && !nonEnglishLike,
    relevance_category_count: relevanceCategoryCount,
    relevance_object_hit: relevanceObjectHit,
    relevance_event_hit: relevanceEventHit,
    relevance_action_hit: relevanceActionHit,
    weak_relevance: weakRelevance,
    severe_off_topic_like: severeOffTopicLike,
    template_only_like: templateOnlyLike,
    template_phrase_hits: templatePhraseHits,
    meaningful_token_count: meaningfulTokenCount,
    related_tier: relatedTier,
    related_likely: relatedLikely,
    related_signal_count: relatedSignalCount,
    entity_hits: entityHits,
    event_hits: eventHits,
    intent_hits: intentHits,
    object_overlap_hits: objectOverlapHits,
    event_overlap_hits: eventOverlapHits,
    problem_overlap_hits: problemOverlapHits,
    goal_overlap_hits: goalOverlapHits,
    question_overlap_hits: questionOverlapHits,
    question_overlap_ratio: clampDecimal(overlapRatio, 0, 1),
    non_english_like: nonEnglishLike,
    obvious_off_topic: obviousOffTopic,
    transcript_unusable: transcriptUnusable,
    no_effective_intent: noEffectiveIntent,
    repetition_ratio: clampDecimal(repetitionRatio, 0, 1)
  };
}

function buildRTSHardGateDecision({
  transcriptMetrics = null,
  audioSignals = null,
  contentSignals = null,
  modelReasonCodes = [],
  contentRaw = 0
} = {}) {
  const wordCount = Number(transcriptMetrics?.word_count || 0);
  const hasUsableAudio = Boolean(audioSignals?.has_usable_audio);
  const signals = toObject(contentSignals) || {};
  const reasonCodes = [];

  if (wordCount <= 0) {
    reasonCodes.push("transcript_empty");
  }
  if (signals.obvious_off_topic) {
    reasonCodes.push("appropriacy_zero_off_topic");
  }
  if (signals.template_only_like || signals.severe_off_topic_like) {
    reasonCodes.push("appropriacy_zero_off_topic");
  }
  if (signals.non_english_like) {
    reasonCodes.push("appropriacy_zero_context_incoherent");
  }
  if (signals.no_effective_intent && !signals.related_likely && !signals.weak_relevance) {
    reasonCodes.push(wordCount < 6 ? "appropriacy_zero_too_short" : "appropriacy_zero_goal_not_met");
  }
  if (!hasUsableAudio && wordCount < 4) {
    reasonCodes.push("audio_not_usable");
  }
  if (Number(contentRaw || 0) <= 0 && wordCount < 5 && !signals.related_likely && !signals.weak_relevance) {
    reasonCodes.push("appropriacy_zero_too_short");
  }

  const modelHardReasons = normalizeReasonCodes(modelReasonCodes, {
    allowSet: RTS_HARD_GATE_REASON_CODES
  });
  for (const reasonCode of modelHardReasons) {
    if (reasonCode === "appropriacy_zero_off_topic" && !signals.related_likely) {
      reasonCodes.push(reasonCode);
      continue;
    }
    if (reasonCode === "appropriacy_zero_goal_not_met" && signals.no_effective_intent && !signals.related_likely && !signals.weak_relevance) {
      reasonCodes.push(reasonCode);
      continue;
    }
    if (reasonCode === "appropriacy_zero_context_incoherent" && (signals.non_english_like || signals.transcript_unusable)) {
      reasonCodes.push(reasonCode);
      continue;
    }
    if (reasonCode === "appropriacy_zero_too_short" && wordCount < 6) {
      reasonCodes.push(reasonCode);
      continue;
    }
    if (reasonCode === "transcript_empty" && wordCount <= 0) {
      reasonCodes.push(reasonCode);
      continue;
    }
    if (reasonCode === "audio_not_usable" && !hasUsableAudio && wordCount < 4) {
      reasonCodes.push(reasonCode);
    }
  }

  const normalizedReasons = normalizeReasonCodes(reasonCodes, {
    allowSet: RTS_HARD_GATE_REASON_CODES
  });
  return {
    triggered: normalizedReasons.length > 0,
    reason_codes: normalizedReasons
  };
}

function buildDefaultRTSFeedbackLines({ gateTriggered = false, contentSignals = null } = {}) {
  if (gateTriggered) {
    return [
      "当前回答与题目目标偏差较大，系统按最低档处理。",
      "建议先补齐场景中的核心信息，再给出一条明确行动建议。"
    ];
  }

  if (!contentSignals?.relevance_gate_passed && contentSignals?.severe_off_topic_like) {
    return [
      "当前回答和题目关联很弱，核心对象、事件或动作信息不足。",
      "建议先明确“对谁说 + 发生了什么 + 你要做什么”，再补一句具体请求。"
    ];
  }
  if (!contentSignals?.relevance_gate_passed && contentSignals?.weak_relevance) {
    return [
      "回答只触及了少量题目信息，相关性还不够稳定。",
      "建议补齐对象、核心事件和回应动作这三部分，再给出明确下一步。"
    ];
  }

  const coverageTier = `${contentSignals?.coverage_tier || contentSignals?.related_tier || "none"}`;
  if (coverageTier === "very_high" || coverageTier === "high") {
    return [
      "你的回答覆盖了大部分关键信息，场景相关性不错。",
      "下一步可以把建议再说得更具体，比如时间、动作和预期结果。",
      "再补一句明确行动建议，整体结构会更清楚。"
    ];
  }
  if (coverageTier === "medium") {
    return [
      "你的回答和题目场景基本相关，已覆盖一部分关键点。",
      "建议再补1到2个核心信息，并给出更明确的行动建议。"
    ];
  }
  return [
    "回答有一定场景关联，但关键点覆盖还不够完整。",
    "建议先说清对象和主要问题，再补一条可执行建议。"
  ];
}

function resolveSimpleEnglishBetterExpression({
  candidate = "",
  gateTriggered = false,
  contentSignals = null,
  questionContent = ""
} = {}) {
  const normalizedCandidate = normalizeText(candidate)
    .replace(/\s+/g, " ")
    .trim();
  if (isSimpleEnglishSuggestion(normalizedCandidate)) {
    return toSimpleSentence(normalizedCandidate);
  }
  return buildSimpleEnglishSuggestion({
    gateTriggered,
    contentSignals,
    questionContent
  });
}

function buildSimpleEnglishSuggestion({
  gateTriggered = false,
  contentSignals = null,
  questionContent = ""
} = {}) {
  const questionTokens = tokenizeWords(questionContent);
  const questionTokenSet = new Set(questionTokens);
  const hasClassScene = (
    questionTokenSet.has("class")
    || questionTokenSet.has("classes")
    || questionTokenSet.has("skip")
    || questionTokenSet.has("skips")
    || questionTokenSet.has("assignment")
    || questionTokenSet.has("assignments")
    || questionTokenSet.has("homework")
    || questionTokenSet.has("late")
    || questionTokenSet.has("early")
  );
  if (gateTriggered) {
    return "Hey, please say the main problem first, then give one clear action.";
  }
  if (hasClassScene) {
    return "Hey, try one small step first: go to class on time and submit homework on time.";
  }
  const coverageTier = `${contentSignals?.coverage_tier || contentSignals?.related_tier || "none"}`;
  if (coverageTier === "very_high" || coverageTier === "high") {
    return "Hey, your idea is good. Add one clear next step so the advice is easier to follow.";
  }
  if (coverageTier === "medium") {
    return "Hey, this is close. You can add one more key point and one clear action.";
  }
  return "Hey, tell the main problem first, then give one simple and clear suggestion.";
}

function isSimpleEnglishSuggestion(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/[\u4e00-\u9fff]/.test(normalized)) return false;
  const words = normalized.match(/[a-z]+(?:'[a-z]+)?/gi) || [];
  if (words.length < 6 || words.length > 24) return false;
  if (/[;:]/.test(normalized)) return false;
  if (words.some((word) => word.length > 11)) return false;
  return true;
}

function toSimpleSentence(text) {
  const words = (normalizeText(text).match(/[a-z]+(?:'[a-z]+)?/gi) || []).slice(0, 22);
  if (!words.length) return "";
  const sentence = words.join(" ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function normalizeFeedbackList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 4);
  if (!normalized.length) return [...fallback];
  return normalized;
}

function normalizeReasonCodes(value, { gateTriggered = false, fallbackCode = "", allowSet = null } = {}) {
  const list = Array.isArray(value) ? value : [];
  const targetSet = allowSet instanceof Set ? allowSet : RTS_REASON_CODE_SET;
  const normalized = list
    .map((item) => normalizeText(item))
    .filter((code) => targetSet.has(code));

  if (gateTriggered && !normalized.length && fallbackCode && targetSet.has(fallbackCode)) {
    normalized.push(fallbackCode);
  }

  return dedupe(normalized);
}

function normalizePolicy(value) {
  const text = normalizeText(value).toLowerCase();
  if (text === "strict_official") return RTS_GATE_POLICY;
  if (text === "product_enhanced") return "product_enhanced";
  if (text === "product_relaxed_fluency_first") return "product_relaxed_fluency_first";
  return RTS_GATE_POLICY;
}

function normalizeProvider(value) {
  const text = normalizeText(value).toLowerCase();
  if (text === "gemini" || text === "groq") return text;
  return "none";
}

function normalizeFallbackReason(value) {
  const text = normalizeText(value);
  return text || null;
}

function tokenizeWords(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return [];
  const tokens = text.match(/[a-z]+(?:'[a-z]+)?/g);
  return Array.isArray(tokens) ? tokens : [];
}

function countHintHits(tokens, hintSet) {
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
  const source = normalizeText(text).toLowerCase();
  if (!source || !Array.isArray(phrases) || !phrases.length) return 0;
  let hitCount = 0;
  for (const phrase of phrases) {
    const normalizedPhrase = normalizeText(phrase).toLowerCase();
    if (!normalizedPhrase) continue;
    if (source.includes(normalizedPhrase)) hitCount += 1;
  }
  return hitCount;
}

function clampScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function clampDecimal(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  const bounded = Math.max(min, Math.min(max, num));
  return Math.round(bounded * 1000) / 1000;
}

function firstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function dedupe(list) {
  return [...new Set(Array.isArray(list) ? list.filter(Boolean) : [])];
}


