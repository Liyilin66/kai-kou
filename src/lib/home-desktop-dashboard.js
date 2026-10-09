import { isRADiagnosis, diagnosisLabel, hasNumericScore } from "./ra-diagnosis-score.js";
import { supabase } from "@/lib/supabase";

const DASHBOARD_PAGE_SIZE = 1000;
const DASHBOARD_WEAKNESS_PAGE_SIZE = 100;
const DASHBOARD_WEAKNESS_LOOKBACK_DAYS = 30;
const DASHBOARD_RECENT_PRACTICE_LIMIT = 3;
const MAX_DURATION_SEC = 60 * 60 * 3;
const MAX_SCORE = 90;
const DISPLAY_TASKS = ["RA", "WFD", "RTS", "DI", "WE"];
const WEAKNESS_TASKS = ["RA", "WFD", "RTS", "DI", "WE"];
const TARGET_WEEKLY_SCORE = 70;
const WEEKDAY_SHORT_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const ESTIMATED_TASK_DURATION_MINUTES = {
  RA: 1.5,
  WFD: 1,
  RTS: 2,
  DI: 2,
  WE: 20
};

const TASK_META = {
  RA: { label: "RA", title: "朗读句子", accent: "#5B6FFF" },
  WFD: { label: "WFD", title: "写作填空", accent: "#20C997" },
  RTS: { label: "RTS", title: "复述句子", accent: "#FF9B42" },
  DI: { label: "DI", title: "描述图表", accent: "#7B6CFF" },
  WE: { label: "WE", title: "写作议论文", accent: "#4D8DFF" },
  RS: { label: "RS", title: "细节理解", accent: "#F67C4A" },
  RL: { label: "RL", title: "复述讲座", accent: "#4D8DFF" }
};

export function createEmptyDesktopDashboardState(homeAnalytics) {
  return {
    loading: true,
    homeAnalytics: homeAnalytics || createHomeAnalyticsFallback(),
    heroTask: {
      title: "先完成今日热身",
      subtitle: "把今天最值得优先完成的任务收进一张卡里。",
      checklist: buildPlaceholderChecklist()
    },
    coach: {
      banner: "建议优先练习 RA 和 DI，提升整体得分效率",
      summaries: [
        {
          text: "你好，今天我们重点先突破 RA 流利度和 DI 数据解读能力。",
          time: "10:32"
        },
        {
          text: "从最近练习来看，DI 和 WE 的正确率偏低，建议安排针对性训练。",
          time: "10:33"
        }
      ]
    },
    weeklyGoal: {
      percent: 0,
      currentValue: 0,
      targetValue: TARGET_WEEKLY_SCORE,
      progress: 0,
      caption: "目标：平均分达到 70 分"
    },
    reminder: {
      title: "今日有 3 个学习任务待完成",
      detail: "建议合理安排时间，保持连续学习"
    },
    moduleMetrics: {},
    heatmapMatrix: buildPlaceholderHeatmapMatrix(),
    weeklyStudy: createEmptyWeeklyStudySummary(),
    scoreTrend: buildPlaceholderTrend(),
    trendMeta: {
      hasData: false,
      caption: "近 7 天暂无评分记录",
      comparisonText: "暂无上周对比",
      currentAverage: null,
      previousAverage: null,
      difference: null
    },
    weakPoints: [],
    recentPractices: []
  };
}

export async function fetchDashboardPracticeRowsForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return [];

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + DASHBOARD_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, created_at, score_json")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;

    rows.push(...chunk);
    if (chunk.length < DASHBOARD_PAGE_SIZE) break;
    from = to + 1;
  }

  return rows;
}

export async function fetchDashboardWeeklyPracticeRowsForAuth(authStore, today = new Date()) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return [];

  const { start, end } = getWeekRange(today);
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, created_at, score_json")
    .eq("user_id", userId)
    .in("task_type", DISPLAY_TASKS)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchDashboardWeaknessRowsForAuth(authStore, today = new Date()) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return [];

  const start = addDays(startOfDay(today), -DASHBOARD_WEAKNESS_LOOKBACK_DAYS + 1);
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, question_id, score_json, feedback, created_at")
    .eq("user_id", userId)
    .in("task_type", WEAKNESS_TASKS)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DASHBOARD_WEAKNESS_PAGE_SIZE);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchDashboardRecentPracticeRowsForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return [];

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, question_id, score_json, feedback, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(DASHBOARD_RECENT_PRACTICE_LIMIT);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchDashboardScoreTrendRowsForAuth(authStore, today = new Date()) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      currentRows: [],
      previousRows: []
    };
  }

  const currentStart = addDays(startOfDay(today), -6);
  const currentEnd = addDays(startOfDay(today), 1);
  const previousStart = addDays(currentStart, -7);

  const selectFields = "id, task_type, score_json, created_at";
  const queryRows = async (start, end) => {
    const { data, error } = await supabase
      .from("practice_logs")
      .select(selectFields)
      .eq("user_id", userId)
      .in("task_type", DISPLAY_TASKS)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const [currentRows, previousRows] = await Promise.all([
    queryRows(currentStart, currentEnd),
    queryRows(previousStart, currentStart)
  ]);

  return {
    currentRows,
    previousRows
  };
}

export function buildDashboardWeeklyPracticeRowsFromRows(rows, today = new Date()) {
  const { start, end } = getWeekRange(today);
  return filterDashboardRowsByDate(rows, start, end, DISPLAY_TASKS)
    .sort(comparePracticeRowsAscending);
}

export function buildDashboardScoreTrendRowsFromRows(rows, today = new Date()) {
  const currentStart = addDays(startOfDay(today), -6);
  const currentEnd = addDays(startOfDay(today), 1);
  const previousStart = addDays(currentStart, -7);

  return {
    currentRows: filterDashboardRowsByDate(rows, currentStart, currentEnd, DISPLAY_TASKS)
      .sort(comparePracticeRowsAscending),
    previousRows: filterDashboardRowsByDate(rows, previousStart, currentStart, DISPLAY_TASKS)
      .sort(comparePracticeRowsAscending)
  };
}

export function buildDesktopDashboardState(homeAnalytics, rows, options = {}) {
  const snapshot = isObject(homeAnalytics) ? homeAnalytics : createHomeAnalyticsFallback();
  const safeRows = Array.isArray(rows) ? rows : [];
  const displayTasks = DISPLAY_TASKS.filter((taskType) => (taskType === "DI" ? options.diEnabled !== false : true));
  const weaknessTasks = WEAKNESS_TASKS.filter((taskType) => (taskType === "DI" ? options.diEnabled !== false : true));
  const weeklyRows = Array.isArray(options.weeklyRows) ? options.weeklyRows : safeRows;
  const optionWeaknessRows = Array.isArray(options.weaknessRows) ? options.weaknessRows : [];
  const weaknessRows = optionWeaknessRows.length ? optionWeaknessRows : safeRows.slice(0, DASHBOARD_WEAKNESS_PAGE_SIZE);
  const recentRows = Array.isArray(options.recentRows) ? options.recentRows : safeRows.slice(0, DASHBOARD_RECENT_PRACTICE_LIMIT);
  const trendRows = normalizeTrendRows(options.trendRows);
  const weeklyStudy = buildWeeklyStudySummary(weeklyRows, displayTasks);

  const moduleMetrics = buildModuleMetrics(snapshot, safeRows, displayTasks);
  const weakPoints = buildWeakPoints(weaknessRows, weaknessTasks);
  const weeklyGoal = buildWeeklyGoal(snapshot);
  const heroTask = buildHeroTask(snapshot, moduleMetrics, options.diEnabled !== false, safeRows, displayTasks);
  const coach = buildCoach(snapshot, weakPoints);
  const reminder = buildReminder(moduleMetrics);
  const heatmapMatrix = buildHeatmapMatrix(weeklyStudy, displayTasks);
  const scoreTrend = buildScoreTrend(trendRows.currentRows, trendRows.previousRows);
  const recentPractices = buildRecentPractices(recentRows);

  return {
    loading: false,
    homeAnalytics: snapshot,
    heroTask,
    coach,
    weeklyGoal,
    reminder,
    moduleMetrics,
    heatmapMatrix,
    weeklyStudy,
    scoreTrend: scoreTrend.points,
    trendMeta: {
      hasData: scoreTrend.hasData,
      caption: scoreTrend.caption,
      comparisonText: scoreTrend.comparisonText,
      currentAverage: scoreTrend.currentAverage,
      previousAverage: scoreTrend.previousAverage,
      difference: scoreTrend.difference
    },
    weakPoints,
    recentPractices
  };
}

function buildModuleMetrics(homeAnalytics, rows, displayTasks) {
  const metrics = {};
  const taskWeekCounts = isObject(homeAnalytics?.taskWeekCounts) ? homeAnalytics.taskWeekCounts : {};
  const groupedRows = {};
  const groupedScores = {};

  rows.forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!taskType) return;

    groupedRows[taskType] = groupedRows[taskType] || [];
    groupedRows[taskType].push(row);

    const overall = resolveOverallScore(taskType, row?.score_json);
    if (overall === null) return;

    groupedScores[taskType] = groupedScores[taskType] || [];
    groupedScores[taskType].push(overall);
  });

  displayTasks.forEach((taskType) => {
    const scores = groupedScores[taskType] || [];
    const practices = groupedRows[taskType] || [];
    const averageScore = scores.length
      ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1))
      : null;

    metrics[taskType] = {
      taskType,
      label: TASK_META[taskType]?.label || taskType,
      title: TASK_META[taskType]?.title || taskType,
      accent: TASK_META[taskType]?.accent || "#5B6FFF",
      weekCount: Number(taskWeekCounts[taskType] || 0),
      totalCount: practices.length,
      averageScore,
      averageScoreLabel: averageScore === null ? "--" : formatNumericScore(averageScore),
      lastPracticeAt: practices[0]?.created_at || ""
    };
  });

  return metrics;
}

function buildHeroTask(homeAnalytics, moduleMetrics, diEnabled, rows, displayTasks) {
  const enabledTasks = (Array.isArray(displayTasks) && displayTasks.length ? displayTasks : DISPLAY_TASKS)
    .filter((taskType) => (taskType === "DI" ? diEnabled : true));
  const metrics = buildHeroTaskMetrics(rows, enabledTasks, moduleMetrics);
  const hasPracticeLogs = metrics.some((item) => item.totalCount > 0);

  if (!hasPracticeLogs) {
    const checklist = buildNewUserChecklist(enabledTasks);
    const firstTask = checklist[0]?.task_type || "RA";
    return {
      title: `今日重点从 ${firstTask} 开始`,
      subtitle: "新手默认任务会在练习后自动按真实记录调整",
      checklist
    };
  }

  const recommendations = pickHeroTaskRecommendations(metrics).slice(0, 3);
  const checklist = recommendations.map((item) => createHeroChecklistItem(item));
  const primary = recommendations[0];

  return {
    title: resolveHeroTaskTitle(primary),
    subtitle: resolveHeroSubtitle(homeAnalytics, primary),
    checklist
  };
}

function buildHeroTaskMetrics(rows, displayTasks, moduleMetrics, today = new Date()) {
  const enabledTasks = new Set(displayTasks);
  const todayKey = toDateKey(today);
  const recentStart = addDays(startOfDay(today), -6);
  const seeds = Object.fromEntries(
    displayTasks.map((taskType) => {
      const meta = TASK_META[taskType] || { label: taskType, title: taskType };
      const moduleAverage = moduleMetrics?.[taskType]?.averageScore;
      return [
        taskType,
        {
          taskType,
          label: meta.label || taskType,
          title: meta.title || taskType,
          totalCount: Number(moduleMetrics?.[taskType]?.totalCount || 0),
          todayCount: 0,
          recentCount: 0,
          recent20Count: 0,
          recentScores: [],
          recent20Scores: [],
          allAverageScore: moduleAverage === null || moduleAverage === undefined ? null : Number(moduleAverage)
        }
      ];
    })
  );
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => enabledTasks.has(normalizeTaskType(row?.task_type)));

  safeRows.forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    const metric = seeds[taskType];
    if (!metric) return;

    const dateKey = toDateKey(row?.created_at);
    if (dateKey === todayKey) {
      metric.todayCount += 1;
    }

    const createdAt = new Date(row?.created_at);
    if (Number.isFinite(createdAt.getTime()) && createdAt >= recentStart) {
      metric.recentCount += 1;
      const score = extractOverallScore(row);
      if (score !== null) metric.recentScores.push(score);
    }
  });

  safeRows.slice(0, 20).forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    const metric = seeds[taskType];
    if (!metric) return;

    metric.recent20Count += 1;
    const score = extractOverallScore(row);
    if (score !== null) metric.recent20Scores.push(score);
  });

  return displayTasks.map((taskType) => {
    const metric = seeds[taskType];
    const averageScore = metric.recentScores.length
      ? averageScores(metric.recentScores)
      : metric.recent20Scores.length
        ? averageScores(metric.recent20Scores)
        : metric.allAverageScore;

    const normalizedAverageScore = averageScore === null || averageScore === undefined ? null : Number(averageScore);

    return {
      ...metric,
      averageScore: Number.isFinite(normalizedAverageScore) ? normalizedAverageScore : null
    };
  });
}

function pickHeroTaskRecommendations(metrics) {
  const scoredTasks = [...metrics]
    .filter((item) => item.averageScore !== null)
    .sort((left, right) =>
      left.averageScore - right.averageScore ||
      left.recentCount - right.recentCount ||
      left.totalCount - right.totalCount
    );
  const sparseTasks = [...metrics].sort((left, right) =>
    left.recentCount - right.recentCount ||
    left.recent20Count - right.recent20Count ||
    left.totalCount - right.totalCount
  );
  const recommendations = [];
  const seen = new Set();

  [...scoredTasks, ...sparseTasks].forEach((item) => {
    if (seen.has(item.taskType)) return;
    seen.add(item.taskType);
    recommendations.push(item);
  });

  return recommendations;
}

function buildNewUserChecklist(displayTasks) {
  const preferred = ["RA", "DI", "WFD"].filter((taskType) => displayTasks.includes(taskType));
  const fallbacks = displayTasks.filter((taskType) => !preferred.includes(taskType));
  return [...preferred, ...fallbacks].slice(0, 3).map((taskType) =>
    createHeroChecklistItem({
      taskType,
      label: TASK_META[taskType]?.label || taskType,
      todayCount: 0
    })
  );
}

function createHeroChecklistItem(item) {
  const taskType = item.taskType;
  const target = resolveHeroTargetCount(taskType);
  const completed = Math.min(Number(item.todayCount || 0), target);
  const ratio = target > 0 ? Math.min(completed / target, 1) : 0;

  return {
    task_type: taskType,
    label: `完成 ${target} 道 ${taskType} 练习`,
    target_count: target,
    completed_count_today: completed,
    progress: ratio,
    current: completed,
    total: target,
    ratio
  };
}

function resolveHeroTargetCount(taskType) {
  const targets = {
    RA: 2,
    DI: 2,
    WFD: 5,
    RTS: 2,
    WE: 1
  };
  return targets[taskType] || 2;
}

function resolveHeroTaskTitle(primary) {
  if (!primary) return "今日重点";
  if (primary.averageScore !== null && primary.averageScore < 70) {
    return `今日重点补强 ${primary.label}`;
  }
  if (primary.recentCount <= 1) {
    return `今日重点优先练 ${primary.label}`;
  }
  return `今日重点保持 ${primary.label}`;
}

function resolveHeroSubtitle(homeAnalytics, primary) {
  if (!primary) return "根据真实练习记录自动生成今日任务";
  if (primary.averageScore !== null) {
    return `最近 ${primary.label} 平均 ${formatNumericScore(primary.averageScore)} 分，按真实记录安排今日任务`;
  }
  if (Number(homeAnalytics?.totalCount || 0) > 0) {
    return `最近 ${primary.label} 练习偏少，今天优先补齐`;
  }
  return "根据真实练习记录自动生成今日任务";
}

function buildHeatmapMatrix(weeklyStudy, displayTasks) {
  const weekDays = Array.isArray(weeklyStudy?.weekDays) && weeklyStudy.weekDays.length
    ? weeklyStudy.weekDays
    : buildWeekDaysSnapshot();
  const counters = isObject(weeklyStudy?.counters) ? weeklyStudy.counters : {};

  return displayTasks.map((taskType) => {
    const meta = TASK_META[taskType] || { label: taskType, accent: "#5B6FFF" };
    const taskCounters = isObject(counters[taskType]) ? counters[taskType] : {};
    return {
      taskType,
      label: meta.label,
      accent: meta.accent,
      cells: weekDays.map((day) => {
        const count = Number(taskCounters[day.key] || 0);
        return {
          key: `${taskType}-${day.key}`,
          count,
          label: day.label,
          dateLabel: day.dateLabel,
          isToday: Boolean(day.isToday),
          level: resolveHeatLevel(count)
        };
      })
    };
  });
}

function buildWeeklyStudySummary(rows, displayTasks, today = new Date()) {
  const weekDays = buildWeekDaysSnapshot(today);
  const dateKeys = new Set(weekDays.map((day) => day.key));
  const enabledTasks = new Set(displayTasks);
  const counters = {};
  const taskCounts = {};

  displayTasks.forEach((taskType) => {
    counters[taskType] = Object.fromEntries(weekDays.map((day) => [day.key, 0]));
    taskCounts[taskType] = 0;
  });

  let estimatedWeekSeconds = 0;
  let durationTrackedCount = 0;
  let durationEstimatedCount = 0;
  let totalCount = 0;

  rows.forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    const dateKey = toDateKey(row?.created_at);
    if (!enabledTasks.has(taskType) || !dateKey || !dateKeys.has(dateKey)) return;

    counters[taskType][dateKey] += 1;
    taskCounts[taskType] += 1;
    totalCount += 1;

    const durationSec = resolvePracticeDurationSec(row?.score_json);
    if (durationSec > 0) {
      estimatedWeekSeconds += durationSec;
      durationTrackedCount += 1;
      return;
    }

    // Some historical practice_logs do not store reliable duration fields.
    // In that case the weekly study time uses a task-level estimate.
    estimatedWeekSeconds += resolveEstimatedTaskDurationSec(taskType);
    durationEstimatedCount += 1;
  });

  return {
    weekDays,
    counters,
    taskCounts,
    totalCount,
    estimatedWeekMinutes: Number((estimatedWeekSeconds / 60).toFixed(1)),
    durationTrackedCount,
    durationEstimatedCount,
    usesEstimatedDuration: durationEstimatedCount > 0
  };
}

function createEmptyWeeklyStudySummary(today = new Date()) {
  const weekDays = buildWeekDaysSnapshot(today);
  return {
    weekDays,
    counters: Object.fromEntries(
      DISPLAY_TASKS.map((taskType) => [
        taskType,
        Object.fromEntries(weekDays.map((day) => [day.key, 0]))
      ])
    ),
    taskCounts: Object.fromEntries(DISPLAY_TASKS.map((taskType) => [taskType, 0])),
    totalCount: 0,
    estimatedWeekMinutes: 0,
    durationTrackedCount: 0,
    durationEstimatedCount: 0,
    usesEstimatedDuration: false
  };
}

function buildWeekDaysSnapshot(today = new Date()) {
  const todayKey = toDateKey(today);
  const { start } = getWeekRange(today);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = toDateKey(date);
    const isToday = key === todayKey;
    return {
      key,
      label: isToday ? "今日" : WEEKDAY_SHORT_LABELS[date.getDay()],
      dateLabel: formatMonthDay(date),
      isToday
    };
  });
}

function getWeekRange(today = new Date()) {
  const start = startOfWeekMonday(today);
  return {
    start,
    end: addDays(start, 7)
  };
}

function startOfWeekMonday(value) {
  const date = startOfDay(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function resolvePracticeDurationSec(scoreJson) {
  const score = toObject(scoreJson) || {};
  const candidates = [
    score?.analytics?.total_active_sec,
    score?.analytics?.totalActiveSec,
    score?.analytics?.breakdown?.total_sec,
    score?.duration_sec,
    score?.durationSec,
    score?.durationSeconds,
    score?.recording_duration_sec,
    score?.recordingDurationSec,
    score?.recordingDuration,
    score?.elapsed_seconds,
    score?.elapsedSeconds,
    score?.time_spent_sec,
    score?.timeSpentSec,
    score?.timeSpentSeconds,
    score?.practice_seconds,
    score?.practiceSeconds,
    score?.total_seconds,
    score?.totalSeconds,
    score?.metrics?.speech_duration_sec,
    score?.metrics?.speechDurationSec,
    score?.audio_signals?.duration_sec,
    score?.audio_signals?.durationSec,
    score?.audio?.duration_sec,
    score?.audio?.durationSec,
    score?.audio?.playableDurationSec
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDurationSec(candidate);
    if (normalized > 0) return normalized;
  }

  const millisecondCandidates = [
    score?.duration_ms,
    score?.durationMs,
    score?.recording_duration_ms,
    score?.recordingDurationMs,
    score?.elapsed_ms,
    score?.elapsedMs,
    score?.time_spent_ms,
    score?.timeSpentMs,
    score?.audio_signals?.duration_ms,
    score?.audio_signals?.durationMs,
    score?.audio?.duration_ms,
    score?.audio?.durationMs
  ];

  for (const candidate of millisecondCandidates) {
    const normalized = normalizeDurationSec(Number(candidate) / 1000);
    if (normalized > 0) return normalized;
  }

  return 0;
}

function resolveEstimatedTaskDurationSec(taskType) {
  const minutes = Number(ESTIMATED_TASK_DURATION_MINUTES[normalizeTaskType(taskType)] || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(minutes * 60);
}

function buildCoach(homeAnalytics, weakPoints) {
  const firstWeak = weakPoints.find((item) => !item.isPlaceholder) || weakPoints[0];
  const averageScore = Number(homeAnalytics?.averageScore || 0);
  const firstSummary = firstWeak && !firstWeak.isPlaceholder
    ? `小K，今天我们重点突破 ${firstWeak.label} 和 ${firstWeak.title} 对应能力，这样能更快提升整体分数。`
    : "小K，今天我们重点突破 RA 流利度和 DI 数据解读能力，这样能更快提升整体分数。";
  const secondSummary = firstWeak && !firstWeak.isPlaceholder
    ? `从最近练习来看，${firstWeak.label} 的稳定性偏弱，建议安排针对性训练，2 天内可见提升。`
    : "从最近练习来看，DI 和 WE 的正确率偏低，建议安排针对性训练，2 天内可见提升哦。";

  return {
    banner: firstWeak && !firstWeak.isPlaceholder
      ? `建议优先练习 ${firstWeak.label} 和 DI，提升整体得分效率`
      : "建议优先练习 RA 和 DI，提升整体得分效率",
    summaries: [
      { text: firstSummary, time: "10:32" },
      {
        text: averageScore > 0 ? secondSummary : "先积累更多真实练习记录，我会把你的弱项建议和趋势分析继续收紧。",
        time: "10:33"
      }
    ]
  };
}

function buildWeeklyGoal(homeAnalytics) {
  const currentScore = hasNumericScore(homeAnalytics?.averageScore) ? Number(homeAnalytics.averageScore) : null;
  const progress = currentScore > 0 ? Math.min(currentScore / TARGET_WEEKLY_SCORE, 1) : 0;
  return {
    percent: Math.round(progress * 100),
    currentValue: currentScore,
    targetValue: TARGET_WEEKLY_SCORE,
    progress,
    caption: "目标：平均分达到 70 分"
  };
}

function buildReminder(moduleMetrics) {
  const missingTasks = ["RA", "WFD", "RTS"].filter((taskType) => Number(moduleMetrics[taskType]?.weekCount || 0) <= 0);
  const taskCount = Math.max(1, Math.min(3, missingTasks.length || 3));

  return {
    title: `今日有 ${taskCount} 个学习任务待完成`,
    detail: "建议合理安排时间，保持连续学习"
  };
}

function buildScoreTrend(currentRows, previousRows) {
  const dateKeys = buildRecentDateKeys(7);
  const buckets = Object.fromEntries(
    dateKeys.map((item) => [
      item.key,
      {
        label: item.label,
        practiceCount: 0,
        total: 0,
        count: 0
      }
    ])
  );

  (Array.isArray(currentRows) ? currentRows : []).forEach((row) => {
    const dateKey = toDateKey(row?.created_at);
    if (!dateKey || !buckets[dateKey]) return;

    buckets[dateKey].practiceCount += 1;

    const overall = extractTrendOverallScore(row);
    if (overall === null) return;

    buckets[dateKey].total += overall;
    buckets[dateKey].count += 1;
  });

  const points = dateKeys.map((item) => {
    const bucket = buckets[item.key];
    const value = bucket.count ? Number((bucket.total / bucket.count).toFixed(1)) : null;
    return {
      key: item.key,
      label: item.label,
      value,
      practiceCount: bucket.practiceCount,
      scoredCount: bucket.count
    };
  });
  const currentAverage = calculateRowsAverage(currentRows);
  const previousAverage = calculateRowsAverage(previousRows);
  const difference = currentAverage !== null && previousAverage !== null
    ? Number((currentAverage - previousAverage).toFixed(1))
    : null;
  const hasData = points.some((item) => item.value !== null);
  const validDayCount = points.filter((item) => item.value !== null).length;

  return {
    hasData,
    validDayCount,
    caption: hasData
      ? validDayCount === 1
        ? "近 7 天仅 1 天有评分记录"
        : "真实评分趋势（近 7 天）"
      : "近 7 天暂无评分记录",
    comparisonText: formatTrendComparison(difference, previousAverage),
    currentAverage,
    previousAverage,
    difference,
    points
  };
}

function normalizeTrendRows(value) {
  if (!isObject(value)) {
    return {
      currentRows: [],
      previousRows: []
    };
  }

  return {
    currentRows: Array.isArray(value.currentRows) ? value.currentRows : [],
    previousRows: Array.isArray(value.previousRows) ? value.previousRows : []
  };
}

function calculateRowsAverage(rows) {
  const scores = (Array.isArray(rows) ? rows : [])
    .map((row) => extractTrendOverallScore(row))
    .filter((value) => value !== null);

  if (!scores.length) return null;
  return averageScores(scores);
}

function averageScores(scores) {
  const safeScores = (Array.isArray(scores) ? scores : []).filter((value) => value !== null);
  if (!safeScores.length) return null;
  return Number((safeScores.reduce((sum, value) => sum + value, 0) / safeScores.length).toFixed(1));
}

function formatTrendComparison(difference, previousAverage) {
  if (previousAverage === null || difference === null) return "暂无上周对比";
  if (Math.abs(difference) < 0.05) return `较上周 ${formatNumericScore(0)}`;
  const arrow = difference > 0 ? "↑" : "↓";
  return `较上周 ${arrow} ${formatNumericScore(Math.abs(difference))}`;
}

function buildWeakPoints(rows, allowedTasks) {
  const buckets = {};
  const currentStart = addDays(startOfDay(new Date()), -6);
  const currentEnd = addDays(startOfDay(new Date()), 1);
  const previousStart = addDays(currentStart, -7);

  rows.forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!taskType || !allowedTasks.includes(taskType)) return;

    const createdAt = new Date(row?.created_at);
    const bucket = buckets[taskType] || {
      taskType,
      attempts: 0,
      scoredRows: [],
      currentScores: [],
      previousScores: [],
      accuracyValues: []
    };

    bucket.attempts += 1;

    const score = resolveWeaknessScore(taskType, row);
    if (score === null) {
      buckets[taskType] = bucket;
      return;
    }

    bucket.scoredRows.push({
      score,
      createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(0)
    });

    const accuracy = resolveAccuracyPercent(row);
    if (accuracy !== null) {
      bucket.accuracyValues.push(accuracy);
    }

    if (Number.isFinite(createdAt.getTime())) {
      if (createdAt >= currentStart && createdAt < currentEnd) {
        bucket.currentScores.push(score);
      } else if (createdAt >= previousStart && createdAt < currentStart) {
        bucket.previousScores.push(score);
      }
    }

    buckets[taskType] = bucket;
  });

  const realItems = Object.entries(buckets)
    .map(([taskType, bucket]) => {
      const scores = bucket.scoredRows.map((item) => item.score);
      if (!scores.length) return null;

      const averageScore = averageScores(scores);
      if (averageScore === null) return null;

      const recentAverageScore = averageScores(
        [...bucket.scoredRows]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, 5)
          .map((item) => item.score)
      );
      const currentAverageScore = averageScores(bucket.currentScores);
      const previousAverageScore = averageScores(bucket.previousScores);
      const changeFromLastWeek = currentAverageScore !== null && previousAverageScore !== null
        ? Number((currentAverageScore - previousAverageScore).toFixed(1))
        : null;
      const averageAccuracy = averageScores(bucket.accuracyValues);
      const meta = TASK_META[taskType] || { label: taskType, title: taskType, accent: "#5B6FFF" };
      const metricType = taskType === "WFD" && averageAccuracy !== null ? "accuracy" : "score";
      const metricLabel = metricType === "accuracy"
        ? `正确率 ${formatInteger(averageAccuracy)}%`
        : `均分 ${formatNumericScore(averageScore)}`;

      return {
        taskType,
        label: meta.label,
        title: meta.title,
        accent: meta.accent,
        attempts: bucket.attempts,
        scoredCount: scores.length,
        averageScore,
        recentAverageScore,
        currentAverageScore,
        previousAverageScore,
        changeFromLastWeek,
        metricType,
        metricLabel,
        accuracy: averageAccuracy,
        deltaText: formatTrendComparison(changeFromLastWeek, previousAverageScore),
        isPlaceholder: false
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const scoreGap = left.averageScore - right.averageScore;
      if (Math.abs(scoreGap) >= 3) return scoreGap;

      const recentLeft = left.recentAverageScore ?? left.averageScore;
      const recentRight = right.recentAverageScore ?? right.averageScore;
      const recentGap = recentLeft - recentRight;
      if (Math.abs(recentGap) >= 3) return recentGap;

      return right.attempts - left.attempts;
    });

  return realItems.slice(0, 3);
}

function buildRecentPractices(rows) {
  return rows.slice(0, DASHBOARD_RECENT_PRACTICE_LIMIT).map((row, index) => {
    const taskType = normalizeTaskType(row?.task_type);
    const meta = TASK_META[taskType] || { label: taskType || "PTE", title: "练习", accent: "#5B6FFF" };
    const score = resolveOverallScore(taskType, row?.score_json);
    const accuracy = score === null ? resolveAccuracyPercent(row) : null;
    const questionId = `${row?.question_id || ""}`.trim();
    const id = `${row?.id || ""}`.trim();
    const createdAt = `${row?.created_at || ""}`.trim();
    const diagnosisText = taskType === "RA" ? diagnosisLabel(toObject(row?.score_json)) : "";
    const metricLabel = diagnosisText || (score !== null
      ? `得分 ${formatNumericScore(score)}/90`
      : accuracy !== null
        ? `正确率 ${formatInteger(accuracy)}%`
        : "暂无分数");

    return {
      id: id || `${questionId || taskType || "log"}-${createdAt || index}`,
      key: `${id || questionId || "log"}-${createdAt || index}-${index}`,
      taskType,
      label: meta.label,
      accent: meta.accent,
      title: `${meta.label} 练习`,
      subtitle: questionId ? `· ${questionId}` : "",
      score,
      accuracy,
      metricLabel,
      scoreLabel: metricLabel,
      timeLabel: formatDateTime(row?.created_at)
    };
  });
}

function buildPlaceholderChecklist() {
  return [
    createHeroChecklistItem({ taskType: "RA", label: "RA", todayCount: 0 }),
    createHeroChecklistItem({ taskType: "DI", label: "DI", todayCount: 0 }),
    createHeroChecklistItem({ taskType: "WFD", label: "WFD", todayCount: 0 })
  ];
}

function buildPlaceholderTrend() {
  return buildRecentDateKeys(7).map((item) => ({
    key: item.key,
    label: item.label,
    value: null,
    practiceCount: 0
  }));
}

function buildPlaceholderHeatmapMatrix() {
  const weekDays = buildWeekDaysSnapshot();
  return DISPLAY_TASKS.map((taskType) => ({
    taskType,
    label: TASK_META[taskType]?.label || taskType,
    accent: TASK_META[taskType]?.accent || "#5B6FFF",
    cells: weekDays.map((day) => ({
      key: `${taskType}-${day.key}`,
      count: 0,
      label: day.label,
      dateLabel: day.dateLabel,
      isToday: Boolean(day.isToday),
      level: 0
    }))
  }));
}

function createHomeAnalyticsFallback() {
  return {
    loading: false,
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
    recentDays: [],
    taskWeekCounts: {},
    lastPracticeAt: ""
  };
}

function filterDashboardRowsByDate(rows, start, end, allowedTasks = DISPLAY_TASKS) {
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  const allowedTaskSet = new Set(Array.isArray(allowedTasks) ? allowedTasks : DISPLAY_TASKS);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!allowedTaskSet.has(taskType)) return false;

    const createdAtMs = resolveCreatedAtMs(row);
    return Number.isFinite(createdAtMs) && createdAtMs >= startMs && createdAtMs < endMs;
  });
}

function comparePracticeRowsAscending(left, right) {
  const timeGap = resolveCreatedAtMs(left) - resolveCreatedAtMs(right);
  if (timeGap !== 0) return timeGap;
  return `${left?.id || ""}`.localeCompare(`${right?.id || ""}`);
}

function resolveCreatedAtMs(row) {
  const createdAt = new Date(row?.created_at);
  return createdAt.getTime();
}

async function resolveCurrentUserId(authStore) {
  const authUserId = `${authStore?.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

function buildRecentDateKeys(days) {
  const items = [];
  const today = startOfDay(new Date());

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    items.push({
      key: toDateKey(date),
      label: formatMonthDay(date)
    });
  }

  return items;
}

export function extractOverallScore(log) {
  if (["RA", "RS"].includes(normalizeTaskType(log?.task_type)) && isRADiagnosis(toObject(log?.score_json))) return null;
  const score = toObject(log?.score_json) || {};
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
    score?.display_scores?.overall
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOverallCandidate(candidate);
    if (normalized !== null) return normalized;
  }

  const normalizedTaskType = normalizeTaskType(log?.task_type);
  if (normalizedTaskType === "RS" || normalizedTaskType === "RL") {
    return resolveLegacySpeechOverall(score);
  }

  return null;
}

function extractTrendOverallScore(log) {
  if (["RA", "RS"].includes(normalizeTaskType(log?.task_type)) && isRADiagnosis(toObject(log?.score_json))) return null;
  const score = toObject(log?.score_json) || {};
  const candidates = [
    score?.overall,
    score?.score_overall,
    score?.overall_score,
    score?.overall_estimated,
    score?.total_score,
    score?.final_score,
    score?.scores?.overall,
    score?.score,
    score?.estimated_score
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTrendScoreCandidate(candidate);
    if (normalized !== null) return normalized;
  }

  return null;
}

function resolveWeaknessScore(taskType, row) {
  if (["RA", "RS"].includes(normalizeTaskType(taskType)) && isRADiagnosis(toObject(row?.score_json))) return null;
  const overall = resolveOverallScore(taskType, row?.score_json);
  if (overall !== null) return overall;

  const accuracy = resolveAccuracyPercent(row);
  if (accuracy === null) return null;

  return Number(((accuracy / 100) * MAX_SCORE).toFixed(1));
}

function resolveAccuracyPercent(row) {
  const score = toObject(row?.score_json) || {};
  const nestedScores = toObject(score?.scores) || {};
  const feedback = toObject(row?.feedback) || {};
  const feedbackScores = toObject(feedback?.scores) || {};
  const candidates = [
    score?.accuracy,
    score?.accuracy_percent,
    score?.accuracy_pct,
    score?.accuracy_rate,
    score?.correct_rate,
    score?.correctRate,
    score?.word_accuracy,
    score?.wordAccuracy,
    score?.wfd_accuracy,
    score?.wfdAccuracy,
    nestedScores?.accuracy,
    nestedScores?.accuracy_percent,
    nestedScores?.correct_rate,
    feedback?.accuracy,
    feedback?.accuracy_percent,
    feedback?.accuracy_rate,
    feedback?.correct_rate,
    feedbackScores?.accuracy
  ];

  for (const candidate of candidates) {
    const normalized = normalizePercentCandidate(candidate);
    if (normalized !== null) return normalized;
  }

  const correct = pickFirstNumeric(
    score?.correct_count,
    score?.correctCount,
    score?.correct,
    score?.matched_count,
    score?.matchedCount,
    nestedScores?.correct_count,
    feedback?.correct_count,
    feedback?.correct
  );
  const total = pickFirstNumeric(
    score?.total_count,
    score?.totalCount,
    score?.total,
    score?.word_count,
    score?.wordCount,
    nestedScores?.total_count,
    feedback?.total_count,
    feedback?.total
  );

  if (correct !== null && total !== null && total > 0) {
    return Number(Math.max(0, Math.min(100, (correct / total) * 100)).toFixed(1));
  }

  return null;
}

function resolveOverallScore(taskType, scoreJson) {
  if (["RA", "RS"].includes(normalizeTaskType(taskType)) && isRADiagnosis(toObject(scoreJson))) return null;
  const score = toObject(scoreJson) || {};
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
    score?.display_scores?.overall
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

function pickFirstPresentScore(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizePresentScore(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function normalizeTaskType(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function normalizeDurationSec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(MAX_DURATION_SEC, Math.round(numeric)));
}

function normalizePresentScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(Math.max(0, Math.min(MAX_SCORE, numeric)).toFixed(1));
}

function normalizeOverallCandidate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) return null;
  return Number(Math.max(0, Math.min(MAX_SCORE, numeric)).toFixed(1));
}

function normalizeTrendScoreCandidate(value) {
  if (value === null || value === undefined || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return Number(Math.max(0, Math.min(MAX_SCORE, numeric)).toFixed(1));
}

function normalizePercentCandidate(value) {
  if (value === null || value === undefined || value === "") return null;

  const numeric = typeof value === "string" ? Number(value.replace("%", "").trim()) : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;

  const percent = numeric <= 1 ? numeric * 100 : numeric;
  if (percent > 100) return null;
  return Number(percent.toFixed(1));
}

function pickFirstNumeric(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;

    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
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

function formatNumericScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(numeric);
}

function formatInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0
  }).format(Math.round(numeric));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${formatMonthDay(date)} ${hours}:${minutes}`;
}

function formatMonthDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}-${day}`;
}

function resolveHeatLevel(count) {
  const safeCount = Number(count || 0);
  if (!Number.isFinite(safeCount) || safeCount <= 0) return 0;
  if (safeCount === 1) return 1;
  if (safeCount <= 3) return 2;
  if (safeCount <= 6) return 3;
  return 4;
}

function toDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
