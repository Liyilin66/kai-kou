import { callOpenAICompatibleChat, getOpenAICompatibleConfig } from "../llm/providers/openai-compatible.js";
import { buildDailySuggestionMessages } from "./daily-suggestion-prompt.js";

const DAILY_TASK_TYPES = ["RA", "WFD", "WE", "DI", "RTS"];
const RECENT_LOG_LIMIT = 100;
const PROVIDER_MAX_TOKENS = 500;
const PROVIDER_TEMPERATURE = 0.5;
const DAILY_SUGGESTION_CACHE_LIMIT = 200;
const DAILY_SUMMARY_CACHE_TTL_MS = 45 * 1000;
const DAILY_SUMMARY_CACHE_LIMIT = 300;
const dailySuggestionCache = new Map();
const dailySuggestionInFlight = new Map();
const dailySuggestionGenerationTokens = new Map();
const dailySummaryCache = new Map();
const dailySummaryInFlight = new Map();

const TASK_META = {
  RA: { title: "RA 朗读句子", method: "重点保持不断句，卡顿超过 3 秒就重读一遍。" },
  WFD: { title: "WFD 写作填空", method: "先听主干，再补冠词、复数和时态细节。" },
  WE: { title: "WE 写作议论文", method: "先列结构，再写正文，避免边想边写。" },
  DI: { title: "DI 描述图表", method: "先说主图信息，再补 2 个细节，最后总结一句。" },
  RTS: { title: "RTS 复述句子", method: "先抓场景和任务，再复述关键动作。" }
};

export async function buildDailySuggestionResponse({ supabase, user, requestId = "", force = false, practiceSignature = "" } = {}) {
  const startedAt = nowMs();
  const summary = await loadDailyPracticeSummary({ supabase, user, practiceSignature });
  const userId = normalizeText(user?.id);
  const effectivePracticeSignature = summary.practice_signature || normalizeText(practiceSignature);
  const cacheKey = buildDailySuggestionCacheKey({ userId, practiceSignature: effectivePracticeSignature });

  if (summary.total_attempts <= 0) {
    const response = {
      ok: true,
      suggestion: createNewUserSuggestion(),
      generated_at: new Date().toISOString(),
      source: "new_user",
      practice_signature: effectivePracticeSignature || summary.practice_signature,
      summary,
      model: "",
      provider: "local_fallback",
      reason_code: "new_user",
      request_id: requestId
    };
    logDailySuggestion({ requestId, summary, response, totalMs: elapsedMs(startedAt), reasonCode: "new_user", cacheKey });
    return response;
  }

  if (cacheKey && !force) {
    const cached = dailySuggestionCache.get(cacheKey);
    if (cached) {
      const response = cloneDailySuggestionResponse(cached, {
        requestId,
        reasonCode: "cached"
      });
      logDailySuggestion({ requestId, summary, response, totalMs: elapsedMs(startedAt), reasonCode: "cached", cacheKey });
      return response;
    }
  }

  if (cacheKey && !force && dailySuggestionInFlight.has(cacheKey)) {
    const joined = await dailySuggestionInFlight.get(cacheKey);
    const response = cloneDailySuggestionResponse(joined, {
      requestId,
      reasonCode: "in_flight_joined"
    });
    logDailySuggestion({ requestId, summary, response, totalMs: elapsedMs(startedAt), reasonCode: "in_flight_joined", cacheKey });
    return response;
  }

  const generatePromise = generateDailySuggestionResponse({
    summary,
    requestId,
    force,
    practiceSignature: effectivePracticeSignature,
    startedAt,
    cacheKey
  });

  if (!cacheKey) return generatePromise;

  const generationToken = Symbol(cacheKey);
  dailySuggestionGenerationTokens.set(cacheKey, generationToken);
  dailySuggestionInFlight.set(cacheKey, generatePromise);
  try {
    const response = await generatePromise;
    if (response?.source === "agent" && dailySuggestionGenerationTokens.get(cacheKey) === generationToken) {
      dailySuggestionCache.set(cacheKey, cloneDailySuggestionResponse(response, {
        requestId: response.request_id,
        source: response.source,
        reasonCode: response.reason_code
      }));
      trimDailySuggestionCache();
    }
    return response;
  } finally {
    if (dailySuggestionGenerationTokens.get(cacheKey) === generationToken) {
      dailySuggestionGenerationTokens.delete(cacheKey);
    }
    if (dailySuggestionInFlight.get(cacheKey) === generatePromise) {
      dailySuggestionInFlight.delete(cacheKey);
    }
  }
}

async function generateDailySuggestionResponse({ summary, requestId = "", force = false, practiceSignature = "", startedAt = nowMs(), cacheKey = "" } = {}) {
  const config = getOpenAICompatibleConfig();
  let providerResult = null;
  let suggestion = null;
  let source = "agent";
  let reasonCode = force ? "force_regenerated" : "regenerated";

  try {
    providerResult = await callOpenAICompatibleChat({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxTokens: PROVIDER_MAX_TOKENS,
      temperature: PROVIDER_TEMPERATURE,
      messages: buildDailySuggestionMessages(compactSummaryForPrompt(summary))
    });
    const parsedSuggestion = parseSuggestionJson(providerResult?.raw_text);
    if (!parsedSuggestion) {
      throw createDailyProviderFailure("provider_parse_failed", providerResult);
    }
    suggestion = sanitizeSuggestion(parsedSuggestion, summary);
  } catch (error) {
    reasonCode = normalizeDailyProviderReasonCode(error);
    suggestion = createFallbackSuggestion(summary);
    const response = {
      ok: true,
      suggestion,
      generated_at: new Date().toISOString(),
      source: "fallback",
      practice_signature: practiceSignature || summary.practice_signature,
      summary,
      model: normalizeText(config.model),
      provider: "local_fallback",
      usage: {},
      provider_reason_code: reasonCode,
      reason_code: reasonCode,
      request_id: requestId
    };

    logDailySuggestion({
      requestId,
      summary,
      response,
      totalMs: elapsedMs(startedAt),
      providerRequestMs: error?.provider_request_ms || providerResult?.provider_request_ms || 0,
      reasonCode,
      cacheKey
    });

    return response;
  }

  const response = {
    ok: true,
    suggestion,
    generated_at: new Date().toISOString(),
    source,
    practice_signature: practiceSignature || summary.practice_signature,
    summary,
    model: normalizeText(providerResult?.model || config.model),
    provider: normalizeText(providerResult?.provider_used || (source === "agent" ? "openai_compatible" : "local_fallback")),
    usage: providerResult?.usage || {},
    reason_code: reasonCode,
    request_id: requestId
  };

  logDailySuggestion({
    requestId,
    summary,
    response,
    totalMs: elapsedMs(startedAt),
    providerRequestMs: providerResult?.provider_request_ms || 0,
    reasonCode,
    cacheKey
  });

  return response;
}

export async function loadDailyPracticeSummary({ supabase, user, practiceSignature = "" } = {}) {
  const userId = normalizeText(user?.id);
  if (!supabase || !userId) {
    return createEmptySummary();
  }

  const expectedPracticeSignature = normalizeText(practiceSignature);
  const now = Date.now();
  pruneDailySummaryCache(now);

  const cached = dailySummaryCache.get(userId);
  if (
    cached
    && cached.expiresAt > now
    && (!expectedPracticeSignature || normalizeText(cached.summary?.practice_signature) === expectedPracticeSignature)
  ) {
    return cloneJsonValue(cached.summary, createEmptySummary());
  }

  const inFlight = dailySummaryInFlight.get(userId);
  if (inFlight) {
    const summary = await inFlight;
    if (!expectedPracticeSignature || normalizeText(summary?.practice_signature) === expectedPracticeSignature) {
      return cloneJsonValue(summary, createEmptySummary());
    }
  }

  const loadPromise = loadFreshDailyPracticeSummary({ supabase, userId });
  dailySummaryInFlight.set(userId, loadPromise);
  try {
    const summary = await loadPromise;
    dailySummaryCache.set(userId, {
      summary: cloneJsonValue(summary, createEmptySummary()),
      expiresAt: now + DAILY_SUMMARY_CACHE_TTL_MS
    });
    trimDailySummaryCache();
    return cloneJsonValue(summary, createEmptySummary());
  } finally {
    if (dailySummaryInFlight.get(userId) === loadPromise) {
      dailySummaryInFlight.delete(userId);
    }
  }
}

async function loadFreshDailyPracticeSummary({ supabase, userId } = {}) {
  const countPromise = supabase
    .from("practice_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("task_type", DAILY_TASK_TYPES);

  const rowsPromise = supabase
    .from("practice_logs")
    .select("id, task_type, score_json, created_at")
    .eq("user_id", userId)
    .in("task_type", DAILY_TASK_TYPES)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(RECENT_LOG_LIMIT);

  const [countResult, rowsResult] = await Promise.all([countPromise, rowsPromise]);
  if (rowsResult.error) throw rowsResult.error;

  const rows = Array.isArray(rowsResult.data) ? rowsResult.data : [];
  const totalAttempts = Number.isFinite(Number(countResult?.count)) ? Number(countResult.count) : rows.length;
  return buildSummaryFromRows(rows, totalAttempts);
}

function buildSummaryFromRows(rows, totalAttempts) {
  const now = new Date();
  const todayKey = toDateKey(now);
  const recent7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const latest = rows[0] || null;
  const taskStats = Object.fromEntries(
    DAILY_TASK_TYPES.map((taskType) => [taskType, {
      attempts: 0,
      scored_attempts: 0,
      average_score: null,
      today_attempts: 0,
      scores: []
    }])
  );

  let todayAttempts = 0;
  let recent7DaysAttempts = 0;
  let recent30DaysAttempts = 0;
  const recent7Scores = [];
  const todayTaskCounts = Object.fromEntries(DAILY_TASK_TYPES.map((taskType) => [taskType, 0]));

  rows.forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!taskType || !taskStats[taskType]) return;

    const createdAt = new Date(row?.created_at);
    const createdAtValid = Number.isFinite(createdAt.getTime());
    const dateKey = createdAtValid ? toDateKey(createdAt) : "";
    const score = extractOverallScore(row?.score_json);
    const bucket = taskStats[taskType];

    bucket.attempts += 1;

    if (dateKey === todayKey) {
      todayAttempts += 1;
      todayTaskCounts[taskType] += 1;
      bucket.today_attempts += 1;
    }

    if (createdAtValid && createdAt >= recent7Start) {
      recent7DaysAttempts += 1;
      if (score !== null) recent7Scores.push(score);
    }

    if (createdAtValid && createdAt >= recent30Start) {
      recent30DaysAttempts += 1;
    }

    if (score !== null) {
      bucket.scores.push(score);
      bucket.scored_attempts += 1;
    }
  });

  Object.values(taskStats).forEach((bucket) => {
    bucket.average_score = average(bucket.scores);
    delete bucket.scores;
  });

  const weakest = Object.entries(taskStats)
    .filter(([, bucket]) => bucket.scored_attempts > 0)
    .map(([taskType, bucket]) => ({
      task_type: taskType,
      average_score: bucket.average_score,
      attempts: bucket.attempts
    }))
    .sort((left, right) => {
      const scoreGap = Number(left.average_score ?? 90) - Number(right.average_score ?? 90);
      if (Math.abs(scoreGap) >= 3) return scoreGap;
      return Number(right.attempts || 0) - Number(left.attempts || 0);
    })[0] || null;

  const volatile = Object.entries(taskStats)
    .filter(([, bucket]) => bucket.scored_attempts >= 3)
    .map(([taskType, bucket]) => ({
      task_type: taskType,
      average_score: bucket.average_score,
      attempts: bucket.attempts
    }))
    .sort((left, right) => Number(right.attempts || 0) - Number(left.attempts || 0))[0] || weakest;

  const weakTop3 = Object.entries(taskStats)
    .filter(([, bucket]) => bucket.scored_attempts > 0)
    .map(([taskType, bucket]) => ({
      task_type: taskType,
      title: TASK_META[taskType]?.title || taskType,
      average_score: bucket.average_score,
      attempts: bucket.attempts
    }))
    .sort((left, right) => Number(left.average_score ?? 90) - Number(right.average_score ?? 90))
    .slice(0, 3);

  const summary = {
    total_attempts: Math.max(0, Math.floor(Number(totalAttempts || 0))),
    today_attempts: todayAttempts,
    latest_practice_id: normalizeText(latest?.id),
    latest_practice_at: normalizeText(latest?.created_at),
    latest_task_type: normalizeTaskType(latest?.task_type),
    recent_7_days_attempts: recent7DaysAttempts,
    recent_30_days_attempts: recent30DaysAttempts,
    recent_7_days_average_score: average(recent7Scores),
    weakest_task_type: weakest?.task_type || "",
    weakest_task_average_score: weakest?.average_score ?? null,
    volatile_task_type: volatile?.task_type || "",
    today_task_counts: todayTaskCounts,
    task_stats: taskStats,
    weak_top_3: weakTop3
  };

  return {
    ...summary,
    practice_signature: createPracticeSignature(summary)
  };
}

function compactSummaryForPrompt(summary) {
  return {
    total_attempts: summary.total_attempts,
    today_attempts: summary.today_attempts,
    recent_7_days_attempts: summary.recent_7_days_attempts,
    recent_30_days_attempts: summary.recent_30_days_attempts,
    recent_7_days_average_score: summary.recent_7_days_average_score,
    task_stats: summary.task_stats,
    weakest_task_type: summary.weakest_task_type,
    weakest_task_average_score: summary.weakest_task_average_score,
    volatile_task_type: summary.volatile_task_type,
    latest_practice: {
      task_type: summary.latest_task_type,
      created_at: summary.latest_practice_at
    },
    weak_top_3: summary.weak_top_3,
    today_task_counts: summary.today_task_counts
  };
}

function createPracticeSignature(summary) {
  return [
    `total=${toInt(summary.total_attempts)}`,
    `today=${toInt(summary.today_attempts)}`,
    `latest=${normalizeText(summary.latest_practice_id)}`,
    `latestAt=${normalizeText(summary.latest_practice_at)}`,
    `r7=${toInt(summary.recent_7_days_attempts)}`,
    `avg7=${formatSignatureNumber(summary.recent_7_days_average_score)}`,
    `weak=${normalizeText(summary.weakest_task_type)}:${formatSignatureNumber(summary.weakest_task_average_score)}`
  ].join("|");
}

function parseSuggestionJson(rawText) {
  const text = normalizeText(rawText)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function sanitizeSuggestion(rawSuggestion, summary) {
  const fallback = createFallbackSuggestion(summary);
  const suggestion = isPlainObject(rawSuggestion) ? rawSuggestion : {};
  const mainTaskType = normalizeTaskType(suggestion.main_task_type) || fallback.main_task_type;
  const tasks = sanitizeTasks(suggestion.tasks, mainTaskType);

  return {
    title: "今日 AI 建议",
    main_task_type: mainTaskType,
    headline: limitText(suggestion.headline, fallback.headline, 24),
    reason: limitText(suggestion.reason, fallback.reason, 54),
    advice: limitText(suggestion.advice, fallback.advice, 78),
    tasks,
    cta_text: limitText(suggestion.cta_text, `开始 ${mainTaskType} 训练`, 18)
  };
}

function sanitizeTasks(tasks, mainTaskType) {
  const normalized = (Array.isArray(tasks) ? tasks : [])
    .map((item) => ({
      task_type: normalizeTaskType(item?.task_type),
      count: clampCount(item?.count)
    }))
    .filter((item) => item.task_type && item.count > 0)
    .slice(0, 3);

  if (normalized.length) return normalized;
  return [
    { task_type: mainTaskType, count: mainTaskType === "WFD" ? 5 : 3 },
    { task_type: mainTaskType === "RA" ? "DI" : "RA", count: 2 }
  ];
}

function createFallbackSuggestion(summary) {
  const mainTaskType = normalizeTaskType(summary?.weakest_task_type) || normalizeTaskType(summary?.latest_task_type) || "DI";
  const meta = TASK_META[mainTaskType] || TASK_META.DI;

  return {
    title: "今日 AI 建议",
    main_task_type: mainTaskType,
    headline: `今天先稳住 ${mainTaskType} 基础表现`,
    reason: summary?.weakest_task_type
      ? `最近 ${mainTaskType} 是更值得优先补强的题型。`
      : "最近练习样本还不多，先做一轮稳定训练。",
    advice: meta.method,
    tasks: [
      { task_type: mainTaskType, count: mainTaskType === "WFD" ? 5 : 3 },
      { task_type: mainTaskType === "RA" ? "DI" : "RA", count: 2 }
    ],
    cta_text: `开始 ${mainTaskType} 训练`
  };
}

function createNewUserSuggestion() {
  return {
    title: "今日 AI 建议",
    main_task_type: "RA",
    headline: "先完成一轮基础测温",
    reason: "你还没有足够练习记录，我需要先了解你的表现。",
    advice: "建议先做 RA 2 道、DI 2 道、WFD 5 道。完成后我会根据真实数据给你下一步建议。",
    tasks: [
      { task_type: "RA", count: 2 },
      { task_type: "DI", count: 2 },
      { task_type: "WFD", count: 5 }
    ],
    cta_text: "开始练习"
  };
}

function createEmptySummary() {
  const summary = {
    total_attempts: 0,
    today_attempts: 0,
    latest_practice_id: "",
    latest_practice_at: "",
    latest_task_type: "",
    recent_7_days_attempts: 0,
    recent_30_days_attempts: 0,
    recent_7_days_average_score: null,
    weakest_task_type: "",
    weakest_task_average_score: null,
    volatile_task_type: "",
    today_task_counts: Object.fromEntries(DAILY_TASK_TYPES.map((taskType) => [taskType, 0])),
    task_stats: Object.fromEntries(DAILY_TASK_TYPES.map((taskType) => [taskType, {
      attempts: 0,
      scored_attempts: 0,
      average_score: null,
      today_attempts: 0
    }])),
    weak_top_3: []
  };

  return {
    ...summary,
    practice_signature: createPracticeSignature(summary)
  };
}

function extractOverallScore(scoreJson) {
  const score = parseJsonObject(scoreJson);
  const nestedScores = parseJsonObject(score?.scores);
  const candidates = [
    score?.overall,
    score?.score_overall,
    score?.overall_score,
    score?.overall_estimated,
    score?.total_score,
    score?.final_score,
    nestedScores?.overall,
    score?.score,
    score?.estimated_score
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    return Number(Math.max(0, Math.min(90, numeric)).toFixed(1));
  }

  return null;
}

function parseJsonObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isPlainObject(value) ? value : {};
}

function average(values) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numericValues.length) return null;
  return Number((numericValues.reduce((total, value) => total + value, 0) / numericValues.length).toFixed(1));
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return DAILY_TASK_TYPES.includes(normalized) ? normalized : "";
}

function clampCount(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(1, Math.min(10, numeric));
}

function limitText(value, fallback, maxLength) {
  const text = normalizeText(value) || normalizeText(fallback);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function toDateKey(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function formatSignatureNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "na";
}

function logDailySuggestion({
  requestId,
  summary,
  response,
  totalMs,
  providerRequestMs = 0,
  reasonCode = "",
  cacheKey = ""
}) {
  try {
    const normalizedReasonCode = normalizeText(reasonCode || response?.reason_code);
    console.info("[daily-suggestion]", JSON.stringify({
      request_id: requestId,
      user_has_logs: Number(summary?.total_attempts || 0) > 0,
      practice_signature: normalizeText(response?.practice_signature || summary?.practice_signature),
      cache_key: cacheKey ? hashCacheKey(cacheKey) : null,
      source: normalizeText(response?.source),
      regenerated: response?.source === "agent" && !["cached", "in_flight_joined"].includes(normalizedReasonCode),
      model: normalizeText(response?.model),
      provider_request_ms: Math.round(Number(providerRequestMs || 0)),
      total_ms: Math.round(Number(totalMs || 0)),
      provider_reason_code: normalizeText(response?.provider_reason_code),
      reason_code: normalizedReasonCode
    }));
  } catch {
    // Logging must never affect the user-facing dashboard.
  }
}

function buildDailySuggestionCacheKey({ userId, practiceSignature, date = new Date() } = {}) {
  const normalizedUserId = normalizeText(userId);
  const normalizedSignature = normalizeText(practiceSignature);
  if (!normalizedUserId || !normalizedSignature) return "";
  return `${normalizedUserId}:${toDateKey(date)}:${normalizedSignature}`;
}

function cloneDailySuggestionResponse(response, overrides = {}) {
  const cloned = {
    ...(response && typeof response === "object" ? response : {}),
    suggestion: cloneJsonValue(response?.suggestion, null),
    summary: cloneJsonValue(response?.summary, null),
    usage: cloneJsonValue(response?.usage, {})
  };

  if (Object.prototype.hasOwnProperty.call(overrides, "requestId")) {
    cloned.request_id = normalizeText(overrides.requestId);
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "source")) {
    cloned.source = normalizeText(overrides.source) || cloned.source;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "reasonCode")) {
    cloned.reason_code = normalizeText(overrides.reasonCode) || cloned.reason_code;
  }

  return cloned;
}

function cloneJsonValue(value, fallback) {
  if (!isPlainObject(value) && !Array.isArray(value)) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? [...value] : { ...value };
  }
}

function trimDailySuggestionCache() {
  while (dailySuggestionCache.size > DAILY_SUGGESTION_CACHE_LIMIT) {
    const oldestKey = dailySuggestionCache.keys().next().value;
    if (!oldestKey) return;
    dailySuggestionCache.delete(oldestKey);
  }
}

function pruneDailySummaryCache(now = Date.now()) {
  for (const [key, value] of dailySummaryCache.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) {
      dailySummaryCache.delete(key);
    }
  }
}

function trimDailySummaryCache() {
  while (dailySummaryCache.size > DAILY_SUMMARY_CACHE_LIMIT) {
    const oldestKey = dailySummaryCache.keys().next().value;
    if (!oldestKey) return;
    dailySummaryCache.delete(oldestKey);
  }
}

function createDailyProviderFailure(reasonCode, providerResult = null) {
  const error = new Error(reasonCode);
  error.raw_error_type = reasonCode;
  error.provider_request_ms = providerResult?.provider_request_ms || 0;
  return error;
}

function normalizeDailyProviderReasonCode(error) {
  const raw = normalizeText(error?.raw_error_type || error?.code || error?.message).toLowerCase();
  const status = Number(error?.status);
  if (raw.includes("api_key_missing")) return "missing_api_key";
  if (raw.includes("base_url_missing")) return "provider_base_url_missing";
  if (raw.includes("model_missing")) return "provider_model_missing";
  if (raw.includes("connect_timeout") || raw.includes("und_err_connect_timeout") || raw.includes("network_error")) return "provider_connect_timeout";
  if (raw.includes("response_timeout") || raw.includes("timeout")) return "provider_response_timeout";
  if ((Number.isFinite(status) && status >= 500 && status <= 599) || /http_5\d\d/.test(raw)) return "provider_http_5xx";
  if (raw.includes("empty_content")) return "provider_empty_content";
  if (raw.includes("parse_failed") || raw.includes("invalid_json")) return "provider_parse_failed";
  return raw || "provider_error";
}

function hashCacheKey(value) {
  const text = normalizeText(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - Number(startedAt || 0)));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
