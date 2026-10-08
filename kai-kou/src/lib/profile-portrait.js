import { isRADiagnosis } from "./ra-diagnosis-score.js";
import { supabase } from "@/lib/supabase";

const MAX_ANALYTICS_DURATION_SEC = 60 * 60 * 3;

const PORTRAIT_METRIC_DEFS = [
  {
    key: "content",
    label: "内容覆盖",
    shortLabel: "内容",
    color: "#E8845A",
    weakAdvice: "建议先练“总览句 + 关键点”表达，回答时先说主线，再补对比和结论",
    strongPraise: "继续保持抓主线和提炼重点的表达习惯"
  },
  {
    key: "fluency",
    label: "流利度",
    shortLabel: "流利",
    color: "#2563EB",
    weakAdvice: "建议先稳住语速和停顿，宁可短句清晰，也不要抢话或拖慢节奏",
    strongPraise: "继续保持顺畅输出、自然停顿和稳定节奏"
  },
  {
    key: "pronunciation",
    label: "发音",
    shortLabel: "发音",
    color: "#059669",
    weakAdvice: "建议多练 RA 朗读，放慢语速，先把重音和口型咬清楚",
    strongPraise: "继续保持清晰发音和稳定重音"
  },
  {
    key: "vocabulary",
    label: "词汇",
    shortLabel: "词汇",
    color: "#6941C6",
    weakAdvice: "建议刻意替换重复词，多积累高频题型表达和连接词",
    strongPraise: "继续扩展表达层次，让用词更有区分度"
  },
  {
    key: "coherence",
    label: "结构组织",
    shortLabel: "结构",
    color: "#F59E0B",
    weakAdvice: "建议固定“总览 - 展开 - 总结”的结构，减少跳跃式表达",
    strongPraise: "继续保持结构清晰、句间衔接自然"
  }
];

const STRUCTURE_CONNECTORS = [
  "overall",
  "in summary",
  "to sum up",
  "first",
  "second",
  "third",
  "then",
  "next",
  "finally",
  "however",
  "while",
  "compared",
  "compared with",
  "by contrast",
  "in addition",
  "therefore",
  "because"
];

const EMPTY_ADVICE = "💡 继续练习后，这里会根据你的历史作答自动生成能力画像和建议。";

export function createEmptyProfilePortrait() {
  return {
    loading: true,
    sampleCount: 0,
    metrics: PORTRAIT_METRIC_DEFS.map((metric) => ({
      ...metric,
      score: 0,
      signalCount: 0,
      directCount: 0,
      proxyCount: 0
    })),
    weakestMetricKey: "",
    strongestMetricKey: "",
    advice: EMPTY_ADVICE
  };
}

export async function loadProfilePortraitSnapshotForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      ...createEmptyProfilePortrait(),
      loading: false
    };
  }

  try {
    const rows = await fetchPortraitRows(userId);
    const buckets = createMetricBuckets();

    rows.forEach((row) => applyRowSignalsToBuckets(row, buckets));

    const metrics = PORTRAIT_METRIC_DEFS.map((metric) => finalizeMetric(metric, buckets[metric.key]));
    const metricsWithSignals = metrics.filter((item) => item.signalCount > 0);
    const weakestMetric = pickWeakestMetric(metricsWithSignals);
    const strongestMetric = pickStrongestMetric(metricsWithSignals);

    return {
      loading: false,
      sampleCount: rows.length,
      metrics,
      weakestMetricKey: weakestMetric?.key || "",
      strongestMetricKey: strongestMetric?.key || "",
      advice: buildPortraitAdvice({
        metrics,
        weakestMetric,
        strongestMetric,
        sampleCount: rows.length
      })
    };
  } catch (error) {
    console.warn("Profile portrait load failed:", error);
    return {
      ...createEmptyProfilePortrait(),
      loading: false
    };
  }
}

function createMetricBuckets() {
  return PORTRAIT_METRIC_DEFS.reduce((acc, metric) => {
    acc[metric.key] = {
      total: 0,
      weight: 0,
      signalCount: 0,
      directCount: 0,
      proxyCount: 0
    };
    return acc;
  }, {});
}

async function resolveCurrentUserId(authStore) {
  const authUserId = `${authStore?.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function fetchPortraitRows(userId) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + 999;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, created_at, transcript, score_json")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;

    rows.push(...chunk);

    if (chunk.length < 1000) break;
    from = to + 1;
  }

  return rows;
}

function applyRowSignalsToBuckets(row, buckets) {
  const taskType = normalizeTaskType(row?.task_type);
  const transcript = normalizeText(row?.transcript);
  const score = parseScoreJson(row?.score_json);
  if (taskType === "RA" && isRADiagnosis(score)) return;

  const contentScore = resolveContentScore(score, taskType);
  pushSignal(buckets.content, contentScore, 1.25, "direct");

  const fluencyScore = resolveFluencyScore(score);
  pushSignal(buckets.fluency, fluencyScore, 1.15, "direct");

  const pronunciationScore = resolvePronunciationScore(score);
  pushSignal(buckets.pronunciation, pronunciationScore, 1.15, "direct");

  const vocabularyDirectScore = resolveVocabularyDirectScore(score);
  pushSignal(buckets.vocabulary, vocabularyDirectScore, 1.1, "direct");

  const coherenceDirectScore = resolveCoherenceDirectScore(score);
  pushSignal(buckets.coherence, coherenceDirectScore, 1.1, "direct");

  const speedDirectScore = resolveDirectDisplayScore(
    score?.display_scores?.speed,
    score?.diagnostics?.display_scores?.speed,
    score?.ai_review?.display_scores?.speed,
    score?.ai_review?.diagnostics?.display_scores?.speed,
    score?.display_scores?.speech_rate,
    score?.ai_review?.display_scores?.speech_rate
  );
  pushSignal(buckets.fluency, speedDirectScore, 0.65, "proxy");

  const lexicalProxyScore = resolveLexicalRichnessScore(transcript);
  pushSignal(buckets.vocabulary, lexicalProxyScore, 0.7, "proxy");

  const coherenceProxyScore = resolveCoherenceProxyScore({ score, transcript });
  pushSignal(buckets.coherence, coherenceProxyScore, 0.7, "proxy");

  const speedProxyScore = resolveSpeechSpeedScore({ score, transcript, taskType });
  pushSignal(buckets.fluency, speedProxyScore, 0.85, "proxy");

  const overallScore = resolveOverallScore(score, taskType);
  const softenedOverall = Number.isFinite(overallScore) ? clampScore(overallScore * 0.92) : null;
  pushSignal(buckets.content, softenedOverall, 0.35, "proxy");
  pushSignal(buckets.fluency, softenedOverall, 0.25, "proxy");
  pushSignal(buckets.pronunciation, softenedOverall, 0.25, "proxy");
}

function resolveContentScore(score, taskType) {
  const direct = resolveDirectDisplayScore(
    score?.scores?.content,
    score?.display_scores?.content,
    score?.diagnostics?.display_scores?.content,
    score?.ai_review?.display_scores?.content,
    score?.ai_review?.diagnostics?.display_scores?.content,
    score?.product?.content,
    score?.ai_review?.product?.content
  );
  if (direct !== null) return direct;

  const contentTraitScore = normalizeTraitDisplayScore(score?.traits?.content, 6);
  if (contentTraitScore !== null) return contentTraitScore;

  if (taskType === "WFD") {
    const accuracyPercent = resolveWFDPercent(score);
    if (accuracyPercent !== null) return mapPercentToDisplay(accuracyPercent);
  }

  const rawContent = mapRawTraitToDisplay(
    score?.official_traits?.content?.score,
    3
  );
  return rawContent;
}

function resolveFluencyScore(score) {
  const direct = resolveDirectDisplayScore(
    score?.scores?.fluency,
    score?.scores?.oral_fluency,
    score?.display_scores?.fluency,
    score?.display_scores?.oral_fluency,
    score?.diagnostics?.display_scores?.fluency,
    score?.diagnostics?.display_scores?.oral_fluency,
    score?.ai_review?.display_scores?.fluency,
    score?.ai_review?.diagnostics?.display_scores?.fluency,
    score?.product?.fluency,
    score?.ai_review?.product?.fluency
  );
  if (direct !== null) return direct;

  const officialFluency = mapRawTraitToDisplay(
    score?.official_traits?.oral_fluency?.score ?? score?.official_traits?.fluency?.score,
    5
  );
  if (officialFluency !== null) return officialFluency;

  return mapLikertToDisplay(score?.metrics?.self_fluency_rating, 5);
}

function resolvePronunciationScore(score) {
  const direct = resolveDirectDisplayScore(
    score?.scores?.pronunciation,
    score?.display_scores?.pronunciation,
    score?.diagnostics?.display_scores?.pronunciation,
    score?.ai_review?.display_scores?.pronunciation,
    score?.ai_review?.diagnostics?.display_scores?.pronunciation,
    score?.product?.pronunciation,
    score?.ai_review?.product?.pronunciation
  );
  if (direct !== null) return direct;

  return mapRawTraitToDisplay(score?.official_traits?.pronunciation?.score, 5);
}

function resolveVocabularyDirectScore(score) {
  const direct = resolveDirectDisplayScore(
    score?.display_scores?.vocabulary,
    score?.diagnostics?.display_scores?.vocabulary,
    score?.ai_review?.display_scores?.vocabulary,
    score?.ai_review?.diagnostics?.display_scores?.vocabulary,
    score?.product?.vocabulary,
    score?.ai_review?.product?.vocabulary
  );
  if (direct !== null) return direct;

  const traitScores = [
    normalizeTraitDisplayScore(score?.traits?.general_linguistic_range, 6),
    normalizeTraitDisplayScore(score?.traits?.vocabulary_range, 2)
  ].filter((item) => item !== null);

  if (!traitScores.length) return null;
  return clampScore(averageNumbers(traitScores));
}

function resolveCoherenceDirectScore(score) {
  const direct = resolveDirectDisplayScore(
    score?.display_scores?.coherence,
    score?.diagnostics?.display_scores?.coherence,
    score?.ai_review?.display_scores?.coherence,
    score?.ai_review?.diagnostics?.display_scores?.coherence,
    score?.product?.coherence,
    score?.ai_review?.product?.coherence
  );
  if (direct !== null) return direct;

  const structureTrait = normalizeTraitDisplayScore(score?.traits?.development_structure_coherence, 6);
  if (structureTrait !== null) return structureTrait;

  return mapLikertToDisplay(score?.metrics?.self_structure_rating, 5);
}

function resolveSpeechSpeedScore({ score, transcript, taskType }) {
  if (!isSpeakingTask(taskType)) return null;

  const durationSec = resolveDurationSec(score);
  const wordCount = countEnglishWords(transcript);
  if (!durationSec || wordCount < 4) return null;

  const wpm = (wordCount / durationSec) * 60;
  if (!Number.isFinite(wpm) || wpm <= 0) return null;

  const deviation = Math.abs(wpm - 135);
  if (deviation <= 20) return clampScore(90 - (deviation / 20) * 6);
  if (deviation <= 45) return clampScore(84 - ((deviation - 20) / 25) * 14);
  if (deviation <= 75) return clampScore(70 - ((deviation - 45) / 30) * 20);
  return clampScore(42 - Math.min(12, ((deviation - 75) / 40) * 12));
}

function resolveLexicalRichnessScore(transcript) {
  const words = tokenizeWords(transcript);
  if (words.length < 8) return null;

  const uniqueCount = new Set(words).size;
  const uniqueRatio = uniqueCount / words.length;
  const longWordCount = words.filter((word) => word.length >= 7).length;
  const longWordRatio = longWordCount / words.length;
  const lexicalBase = 24 + uniqueRatio * 54 + longWordRatio * 28;

  return clampScore(lexicalBase);
}

function resolveCoherenceProxyScore({ score, transcript }) {
  const connectorHits = countConnectorHits(transcript);
  const wordCount = countEnglishWords(transcript);
  const freezeCount = clampNonNegativeInteger(score?.metrics?.self_freeze_count);
  const structureRating = mapLikertToDisplay(score?.metrics?.self_structure_rating, 5);

  const proxyParts = [];
  if (Number.isFinite(structureRating)) {
    proxyParts.push(structureRating);
  }

  if (wordCount >= 8) {
    const connectorScore = clampScore(40 + connectorHits * 10 + Math.min(16, wordCount / 3));
    proxyParts.push(connectorScore);
  }

  if (freezeCount > 0) {
    proxyParts.push(clampScore(82 - freezeCount * 9));
  }

  if (!proxyParts.length) return null;
  return clampScore(averageNumbers(proxyParts));
}

function resolveOverallScore(score, taskType) {
  const direct = resolveDirectDisplayScore(
    score?.scores?.overall,
    score?.overall_estimated,
    score?.display_scores?.overall,
    score?.diagnostics?.display_scores?.overall,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.product?.overall,
    score?.ai_review?.product?.overall,
    score?.overall
  );
  if (direct !== null) return direct;

  if (taskType === "WFD") {
    const accuracyPercent = resolveWFDPercent(score);
    if (accuracyPercent !== null) return mapPercentToDisplay(accuracyPercent);
  }

  return null;
}

function resolveWFDPercent(score) {
  const directScore = Number(score?.score);
  if (Number.isFinite(directScore) && directScore >= 0) {
    return Math.max(0, Math.min(100, directScore));
  }

  const correct = Number(score?.correct);
  const total = Number(score?.total);
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(100, (correct / total) * 100));
  }

  return null;
}

function resolveDurationSec(score) {
  const candidates = [
    score?.analytics?.total_active_sec,
    score?.analytics?.totalActiveSec,
    score?.duration_sec,
    score?.durationSec,
    score?.metrics?.speech_duration_sec,
    score?.metrics?.speechDurationSec,
    score?.audio_signals?.duration_sec,
    score?.audio_signals?.durationSec
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDurationSec(candidate);
    if (normalized > 0) return normalized;
  }

  const durationMs = Number(score?.audio_signals?.duration_ms ?? score?.audio_signals?.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    return normalizeDurationSec(durationMs / 1000);
  }

  return 0;
}

function normalizeDurationSec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(MAX_ANALYTICS_DURATION_SEC, Math.round(numeric)));
}

function pushSignal(bucket, value, weight = 1, source = "direct") {
  const numeric = Number(value);
  const normalizedWeight = Number(weight);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  if (!Number.isFinite(normalizedWeight) || normalizedWeight <= 0) return;

  bucket.total += clampScore(numeric) * normalizedWeight;
  bucket.weight += normalizedWeight;
  bucket.signalCount += 1;
  if (source === "proxy") bucket.proxyCount += 1;
  else bucket.directCount += 1;
}

function finalizeMetric(metric, bucket) {
  const score = bucket.weight > 0 ? clampScore(bucket.total / bucket.weight) : 0;
  return {
    ...metric,
    score,
    signalCount: bucket.signalCount,
    directCount: bucket.directCount,
    proxyCount: bucket.proxyCount
  };
}

function pickWeakestMetric(metrics) {
  return [...metrics].sort((a, b) => a.score - b.score)[0] || null;
}

function pickStrongestMetric(metrics) {
  return [...metrics].sort((a, b) => b.score - a.score)[0] || null;
}

function buildPortraitAdvice({ metrics, weakestMetric, strongestMetric, sampleCount }) {
  if (!sampleCount || !metrics.some((item) => item.signalCount > 0)) {
    return EMPTY_ADVICE;
  }

  if (!weakestMetric || !strongestMetric) {
    return EMPTY_ADVICE;
  }

  if (weakestMetric.key === strongestMetric.key) {
    return `💡 当前画像还在收集更多样本，先继续保持 ${strongestMetric.label} 的训练节奏，后续会自动细化建议。`;
  }

  return `💡 ${weakestMetric.label}是目前最弱的维度，${weakestMetric.weakAdvice}。${strongestMetric.label}表现不错，${strongestMetric.strongPraise}。`;
}

function resolveDirectDisplayScore(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeDisplayScore(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function normalizeDisplayScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric >= 10 && numeric <= 90) return clampScore(numeric);
  if (numeric > 90 && numeric <= 100) return mapPercentToDisplay(numeric);
  return null;
}

function normalizeTraitDisplayScore(trait, fallbackMax = 6) {
  if (!trait || typeof trait !== "object") return null;
  const score = Number(trait.score);
  const max = Number(trait.max || fallbackMax);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return clampScore(10 + (Math.max(0, Math.min(score, max)) / max) * 80);
}

function mapRawTraitToDisplay(value, rawMax) {
  const numeric = Number(value);
  const max = Number(rawMax);
  if (!Number.isFinite(numeric) || !Number.isFinite(max) || max <= 0 || numeric < 0) return null;
  return clampScore(10 + (Math.max(0, Math.min(numeric, max)) / max) * 80);
}

function mapLikertToDisplay(value, max = 5) {
  const numeric = Number(value);
  const normalizedMax = Number(max);
  if (!Number.isFinite(numeric) || !Number.isFinite(normalizedMax) || normalizedMax <= 1 || numeric <= 0) return null;
  return clampScore(10 + ((Math.max(1, Math.min(numeric, normalizedMax)) - 1) / (normalizedMax - 1)) * 80);
}

function mapPercentToDisplay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return clampScore(10 + (Math.max(0, Math.min(numeric, 100)) / 100) * 80);
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(10, Math.min(90, Math.round(numeric)));
}

function averageNumbers(values) {
  const normalized = values.filter((item) => Number.isFinite(Number(item)));
  if (!normalized.length) return 0;
  return normalized.reduce((sum, item) => sum + Number(item || 0), 0) / normalized.length;
}

function parseScoreJson(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value : {};
}

function normalizeTaskType(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function isSpeakingTask(taskType) {
  return ["RA", "RS", "RL", "RTS", "DI"].includes(taskType);
}

function tokenizeWords(text) {
  return normalizeText(text)
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

function countEnglishWords(text) {
  return tokenizeWords(text).length;
}

function countConnectorHits(text) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return 0;
  return STRUCTURE_CONNECTORS.reduce((sum, item) => {
    return normalized.includes(item) ? sum + 1 : sum;
  }, 0);
}

function clampNonNegativeInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}
