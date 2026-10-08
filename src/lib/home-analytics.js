import { isRADiagnosis, hasNumericScore } from "./ra-diagnosis-score.js";
import { supabase } from "@/lib/supabase";

const TASK_TYPES = ["RA", "WFD", "RTS", "DI", "RS", "RL", "WE"];
const HOME_ANALYTICS_PAGE_SIZE = 1000;
const HOME_ANALYTICS_MAX_DURATION_SEC = 60 * 60 * 3;
const HOME_ANALYTICS_MAX_SCORE = 90;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const HEAT_COLORS = ["#E9EEF7", "#F7DFD0", "#F0BB98", "#E78857", "#CD6A31"];

export function createEmptyHomeAnalytics() {
  return {
    loading: true,
    totalCount: 0,
    todayCount: 0,
    weekMinutes: 0,
    averageScore: null,
    currentPeriodAverageScore: null,
    previousPeriodAverageScore: null,
    scoreDelta: null,
    scoreComparisonText: "暂无上周对比",
    scoredCount: 0,
    durationTrackedCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    activeDaysCount: 0,
    recentDays: buildRecentDaysSnapshot(),
    taskWeekCounts: buildTaskCounterSeed(),
    lastPracticeAt: ""
  };
}

export function formatInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0
  }).format(Math.max(0, Math.round(number)));
}

export function formatScore(value) {
  if (!hasNumericScore(value)) return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(number);
}

export async function loadHomeAnalyticsSnapshotForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      ...createEmptyHomeAnalytics(),
      loading: false
    };
  }

  try {
    const rows = await fetchHomeAnalyticsRows(userId);
    return buildHomeAnalyticsSnapshotFromRows(rows);
  } catch (error) {
    console.warn("Home analytics load failed:", error);
    return {
      ...createEmptyHomeAnalytics(),
      loading: false
    };
  }
}

export function buildHomeAnalyticsSnapshotFromRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const recentDays = buildRecentDaysSnapshot();
  const recentDayKeys = new Set(recentDays.map((item) => item.key));
  const recentDayCounter = recentDays.reduce((acc, item) => {
    acc[item.key] = 0;
    return acc;
  }, {});
  const practicedDaySet = new Set();
  const taskWeekCounts = buildTaskCounterSeed();
  const todayKey = toDateKey(new Date());

  let todayCount = 0;
  let weekDurationSec = 0;
  let durationTrackedCount = 0;
  let scoreTotal = 0;
  let scoredCount = 0;

  safeRows.forEach((row) => {
    const dateKey = toDateKey(row?.created_at);
    if (!dateKey) return;

    practicedDaySet.add(dateKey);

    if (dateKey === todayKey) {
      todayCount += 1;
    }

    if (recentDayKeys.has(dateKey)) {
      recentDayCounter[dateKey] += 1;
      const taskType = normalizeTaskType(row?.task_type);
      if (taskType) {
        taskWeekCounts[taskType] = (taskWeekCounts[taskType] || 0) + 1;
      }

      const durationSec = resolveDurationSec(row?.score_json);
      if (durationSec > 0) {
        weekDurationSec += durationSec;
        durationTrackedCount += 1;
      }
    }

    const overall = resolveOverallScore(row?.task_type, row?.score_json);
    if (overall !== null) {
      scoreTotal += overall;
      scoredCount += 1;
    }
  });

  const maxHeatCount = Math.max(...Object.values(recentDayCounter), 0);
  const normalizedDays = recentDays.map((item) => {
    const countValue = recentDayCounter[item.key] || 0;
    const level = resolveHeatLevel(countValue, maxHeatCount);
    const isToday = isTodayDateKey(item.key, todayKey);
    return {
      ...item,
      label: item.label,
      count: countValue,
      color: HEAT_COLORS[level],
      isToday
    };
  });
  const latestCreatedAt = safeRows.find((row) => toDateKey(row?.created_at))?.created_at || "";
  const streakStats = calculateStreakStats(practicedDaySet);
  const scoreComparison = calculateScoreComparison(safeRows);

  return {
    loading: false,
    totalCount: safeRows.length,
    todayCount,
    weekMinutes: Math.round(weekDurationSec / 60),
    averageScore: scoredCount ? Number((scoreTotal / scoredCount).toFixed(1)) : null,
    currentPeriodAverageScore: scoreComparison.currentAverage,
    previousPeriodAverageScore: scoreComparison.previousAverage,
    scoreDelta: scoreComparison.difference,
    scoreComparisonText: scoreComparison.text,
    scoredCount,
    durationTrackedCount,
    currentStreak: streakStats.current,
    longestStreak: streakStats.longest,
    activeDaysCount: practicedDaySet.size,
    recentDays: normalizedDays,
    taskWeekCounts,
    lastPracticeAt: `${latestCreatedAt || ""}`.trim()
  };
}

function buildTaskCounterSeed() {
  return TASK_TYPES.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function buildRecentDaysSnapshot(today = new Date()) {
  const todayKey = toDateKey(today);
  const weekStart = startOfWeekMonday(today);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = toDateKey(date);
    const isToday = isTodayDateKey(key, todayKey);
    return {
      key,
      label: isToday ? "今日" : WEEKDAY_LABELS[date.getDay()],
      dateLabel: formatMonthDay(date),
      count: 0,
      color: HEAT_COLORS[0],
      isToday
    };
  });
}

function startOfWeekMonday(value) {
  const date = startOfDay(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodayDateKey(dateKey, todayKey = toDateKey(new Date())) {
  return Boolean(dateKey) && dateKey === todayKey;
}

function formatMonthDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function calculateStreakStats(practicedDaySet) {
  return {
    current: calculateCurrentStreak(practicedDaySet),
    longest: calculateLongestStreak(practicedDaySet)
  };
}

function calculateCurrentStreak(practicedDaySet) {
  let streak = 0;
  let cursor = startOfDay(new Date());
  if (!practicedDaySet.has(toDateKey(cursor))) {
    cursor = addDays(cursor, -1);
  }

  while (practicedDaySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function calculateLongestStreak(practicedDaySet) {
  const dateKeys = [...practicedDaySet].sort();
  if (!dateKeys.length) return 0;

  let longest = 1;
  let current = 1;

  for (let index = 1; index < dateKeys.length; index += 1) {
    const previous = startOfDay(dateKeys[index - 1]);
    const next = startOfDay(dateKeys[index]);
    const diffDays = Math.round((next.getTime() - previous.getTime()) / 86400000);

    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function calculateScoreComparison(rows, today = new Date()) {
  const currentStart = addDays(startOfDay(today), -6);
  const currentEnd = addDays(startOfDay(today), 1);
  const previousStart = addDays(currentStart, -7);
  const currentRows = [];
  const previousRows = [];

  rows.forEach((row) => {
    const createdAt = new Date(row?.created_at);
    if (!Number.isFinite(createdAt.getTime())) return;

    if (createdAt >= currentStart && createdAt < currentEnd) {
      currentRows.push(row);
      return;
    }

    if (createdAt >= previousStart && createdAt < currentStart) {
      previousRows.push(row);
    }
  });

  const currentAverage = calculateRowsAverage(currentRows);
  const previousAverage = calculateRowsAverage(previousRows);
  const difference = currentAverage !== null && previousAverage !== null
    ? Number((currentAverage - previousAverage).toFixed(1))
    : null;

  return {
    currentAverage,
    previousAverage,
    difference,
    text: formatScoreComparison(difference, previousAverage)
  };
}

function calculateRowsAverage(rows) {
  const scores = rows
    .map((row) => resolveOverallScore(row?.task_type, row?.score_json))
    .filter((score) => score !== null);

  if (!scores.length) return null;
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

function formatScoreComparison(difference, previousAverage) {
  if (previousAverage === null || difference === null) return "暂无上周对比";
  if (Math.abs(difference) < 0.05) return `较上周 ${formatScore(0)}`;
  const direction = difference > 0 ? "↑" : "↓";
  return `较上周 ${direction} ${formatScore(Math.abs(difference))}`;
}

function resolveHeatLevel(count, maxCount) {
  const normalizedCount = Number(count || 0);
  const normalizedMax = Number(maxCount || 0);
  if (!normalizedCount || !normalizedMax) return 0;
  const ratio = normalizedCount / normalizedMax;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.55) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

function resolveDurationSec(scoreJson) {
  const score = toObject(scoreJson) || {};
  const analyticsDuration = normalizeDurationSec(
    score?.analytics?.total_active_sec ?? score?.analytics?.totalActiveSec
  );
  if (analyticsDuration > 0) return analyticsDuration;

  const direct = normalizeDurationSec(score?.duration_sec ?? score?.durationSec);
  if (direct > 0) return direct;

  const metricsDuration = normalizeDurationSec(
    score?.metrics?.speech_duration_sec ?? score?.metrics?.speechDurationSec
  );
  if (metricsDuration > 0) return metricsDuration;

  const audioSignalsDuration = normalizeDurationSec(
    score?.audio_signals?.duration_sec ?? score?.audio_signals?.durationSec
  );
  if (audioSignalsDuration > 0) return audioSignalsDuration;

  const audioSignalsMs = Number(score?.audio_signals?.duration_ms ?? score?.audio_signals?.durationMs);
  if (Number.isFinite(audioSignalsMs) && audioSignalsMs > 0) {
    return normalizeDurationSec(audioSignalsMs / 1000);
  }

  return 0;
}

function resolveOverallScore(taskType, scoreJson) {
  const score = toObject(scoreJson) || {};
  if (normalizeTaskType(taskType) === "RA" && isRADiagnosis(score)) return null;
  const candidates = [
    score?.overall,
    score?.score_overall,
    score?.overall_score,
    score?.overall_estimated,
    score?.total_score,
    score?.final_score,
    score?.scores?.overall,
    score?.score,
    score?.estimated_score,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.ai_review?.product?.overall,
    score?.ai_review?.overall,
    score?.product?.overall,
    score?.diagnostics?.display_scores?.overall,
    score?.display_scores?.overall,
    score?.scores?.overall,
    score?.overall
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOverallCandidate(candidate);
    if (normalized !== null) return normalized;
  }

  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "RS" || normalizedTaskType === "RL") {
    return resolveLegacySpeechOverall(score);
  }

  return null;
}

function normalizeTaskType(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function toObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeDurationSec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(HOME_ANALYTICS_MAX_DURATION_SEC, Math.round(numeric)));
}

function normalizeOverallCandidate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(Math.max(0, Math.min(HOME_ANALYTICS_MAX_SCORE, numeric)).toFixed(1));
}

function normalizePresentScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(Math.max(0, Math.min(HOME_ANALYTICS_MAX_SCORE, numeric)).toFixed(1));
}

function pickFirstPresentScore(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizePresentScore(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function resolveLegacySpeechOverall(scoreJson) {
  const score = toObject(scoreJson) || {};
  const nestedScores = toObject(score?.scores) || {};
  const pronunciation = pickFirstPresentScore(score?.pronunciation, nestedScores?.pronunciation);
  const fluency = pickFirstPresentScore(
    score?.fluency,
    score?.oral_fluency,
    score?.oralFluency,
    nestedScores?.fluency,
    nestedScores?.oral_fluency,
    nestedScores?.oralFluency
  );
  const content = pickFirstPresentScore(
    score?.content,
    score?.appropriacy,
    nestedScores?.content,
    nestedScores?.appropriacy
  );
  const validScores = [pronunciation, fluency, content].filter((item) => item !== null);
  if (validScores.length < 2) return null;

  const average = validScores.reduce((sum, item) => sum + Number(item || 0), 0) / validScores.length;
  return normalizeOverallCandidate(average);
}

async function resolveCurrentUserId(authStore) {
  const authUserId = `${authStore?.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function fetchHomeAnalyticsRows(userId) {
  const normalizedUserId = `${userId || ""}`.trim();
  if (!normalizedUserId) return [];

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + HOME_ANALYTICS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, created_at, score_json")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;

    rows.push(...chunk);

    if (chunk.length < HOME_ANALYTICS_PAGE_SIZE) break;
    from = to + 1;
  }

  return rows;
}
