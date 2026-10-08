<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { isDIEnabled } from "@/lib/di-feature";
import { requestDailyAiSuggestion } from "@/lib/agent";
import { buildHomeAnalyticsSnapshotFromRows, formatInteger, formatScore } from "@/lib/home-analytics";
import {
  buildDashboardScoreTrendRowsFromRows,
  buildDashboardWeeklyPracticeRowsFromRows,
  buildDesktopDashboardState,
  createEmptyDesktopDashboardState,
  fetchDashboardPracticeRowsForAuth,
  fetchDashboardRecentPracticeRowsForAuth,
  fetchDashboardWeaknessRowsForAuth,
} from "@/lib/home-desktop-dashboard";

const TREND_MIN_SCORE = 10;
const TREND_MAX_SCORE = 90;
const TREND_TICKS = [90, 70, 50, 30, 10];
const TREND_CHART = {
  left: 58,
  right: 472,
  top: 34,
  bottom: 176
};
const WEEKLY_GOAL_TASKS = [
  { type: "RA", name: "朗读句子", accent: "#8a6845" },
  { type: "WFD", name: "写作填空", accent: "#6d8f72" },
  { type: "WE", name: "写作议论文", accent: "#9a7a54" },
  { type: "DI", name: "描述图表", accent: "#8f735b" },
  { type: "RTS", name: "复述句子", accent: "#b07a4b" }
];

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const { tasks } = storeToRefs(practiceStore);
const dashboard = ref(createEmptyDesktopDashboardState());
const weeklyGoalState = ref(createWeeklyGoalState());
const goalModalOpen = ref(false);
const goalDraft = ref(createEmptyWeeklyGoals());
const dailyAiSuggestionState = ref(createDailySuggestionState());
const DASHBOARD_REFRESH_DEBOUNCE_MS = 1000;
let dashboardLoadPromise = null;
let dailySuggestionLoadPromise = null;
let lastPassiveDashboardRefreshAt = 0;

const fallbackNavItems = [
  { key: "home", label: "首页", icon: "◆", active: true },
  { key: "practice", label: "练习中心", icon: "▤" },
  { key: "coach", label: "AI 私教", icon: "◎" },
  { key: "plan", label: "学习计划", icon: "□" },
  { key: "report", label: "学习报告", icon: "▧" },
  { key: "library", label: "题库", icon: "▣" },
  { key: "profile", label: "个人中心", icon: "○" }
];

const fallbackFocusTasks = [
  { task_type: "RA", label: "完成 2 道 RA 练习", completed_count_today: 0, target_count: 2, progress: 0 },
  { task_type: "DI", label: "完成 2 道 DI 练习", completed_count_today: 0, target_count: 2, progress: 0 },
  { task_type: "WFD", label: "完成 5 道 WFD 练习", completed_count_today: 0, target_count: 5, progress: 0 }
];

const fallbackStatCards = [
  { label: "平均得分", value: "--", suffix: "", helper: "暂无上周对比", color: "#8a6845", icon: "✓" },
  { label: "练习总量", value: "0", suffix: "题", helper: "今日完成 0 题", color: "#6d8f72", icon: "✓" },
  { label: "连续学习", value: "0", suffix: "天", helper: "今天开始建立节奏", color: "#b07a4b", icon: "●" }
];

const fallbackQuickModules = [
  { title: "RA", subtitle: "朗读句子\n流利表达", color: "#8a6845", icon: "●" },
  { title: "WFD", subtitle: "写作填空\n语法拼写", color: "#6d8f72", icon: "◆" },
  { title: "RTS", subtitle: "复述句子\n逻辑连贯", color: "#b07a4b", icon: "▤" },
  { title: "DI", subtitle: "描述图表\n数据分析", color: "#8f735b", icon: "◔" },
  { title: "WE", subtitle: "写作议论文\n结构论证", color: "#9a7a54", icon: "▣" }
];

const fallbackHeatRows = [
  { label: "RA", cells: [2, 3, 2, 1, 2, 3, 1] },
  { label: "WFD", cells: [2, 4, 3, 2, 1, 2, 2] },
  { label: "RTS", cells: [1, 3, 4, 2, 2, 1, 2] },
  { label: "DI", cells: [3, 2, 3, 1, 2, 2, 1] },
  { label: "WE", cells: [1, 2, 1, 2, 3, 2, 1] }
];
const fallbackHeatDays = [
  { label: "一", isToday: false },
  { label: "二", isToday: false },
  { label: "三", isToday: false },
  { label: "四", isToday: false },
  { label: "五", isToday: false },
  { label: "六", isToday: false },
  { label: "日", isToday: false }
];
const heatLegendLevels = [1, 2, 3, 4];

const taskVisuals = {
  RA: { title: "RA", subtitle: "朗读句子\n流利表达", color: "#8a6845", icon: "●", path: "/ra" },
  WFD: { title: "WFD", subtitle: "写作填空\n语法拼写", color: "#6d8f72", icon: "◆", path: "/wfd" },
  RTS: { title: "RTS", subtitle: "复述句子\n逻辑连贯", color: "#b07a4b", icon: "▤", path: "/rts" },
  DI: { title: "DI", subtitle: "描述图表\n数据分析", color: "#8f735b", icon: "◔", path: "/di" },
  WE: { title: "WE", subtitle: "写作议论文\n结构论证", color: "#9a7a54", icon: "▣", path: "/we" }
};

const navItems = computed(() =>
  fallbackNavItems.map((item) => {
    const paths = {
      home: "/home",
      practice: "#quick",
      coach: "/agent",
      plan: "#goal",
      report: "#report",
      library: "#quick",
      profile: "/profile"
    };
    return { ...item, target: paths[item.key] || "" };
  })
);

const avatarLoadFailed = ref(false);
const userDisplayName = computed(() => {
  if (!authStore.isLoggedIn && authStore.loaded) return "未登录";
  return authStore.displayName || "同学";
});
const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});
const showUserAvatar = computed(() => Boolean(userAvatarUrl.value) && !avatarLoadFailed.value);
const homeAnalytics = computed(() => dashboard.value.homeAnalytics || {});
const heroSubtitle = computed(() => dashboard.value.heroTask?.subtitle || "根据真实练习记录自动生成今日任务");
const focusTitle = computed(() => dashboard.value.heroTask?.title || "今日重点");

const currentWeekStartKey = computed(() => getWeekStartKey());
const weeklyGoalStorageKey = computed(() => {
  const userId = `${authStore.user?.id || ""}`.trim();
  return userId ? `pte_weekly_goals:${userId}:${currentWeekStartKey.value}` : "";
});

watch(userAvatarUrl, () => {
  avatarLoadFailed.value = false;
});

watch(() => authStore.user?.id, () => {
  loadWeeklyGoals();
  loadCachedDailySuggestion();
});

const focusTasks = computed(() => {
  const realTasks = dashboard.value.heroTask?.checklist;
  const source = Array.isArray(realTasks) && realTasks.length ? realTasks : fallbackFocusTasks;
  return source.map((item) => {
    const current = Number(item.completed_count_today ?? item.current ?? 0);
    const total = Number(item.target_count ?? item.total ?? 0);
    const ratio = Number(item.progress ?? item.ratio ?? (total ? current / total : 0));
    return {
      label: item.label,
      count: item.count || `${formatInteger(current)}/${formatInteger(total)}`,
      width: Math.max(0, Math.min(100, Math.round(ratio * 100)))
    };
  });
});

const statCards = computed(() => {
  if (dashboard.value.loading) return fallbackStatCards;
  const averageScore = homeAnalytics.value.averageScore;
  const scoreComparisonText = homeAnalytics.value.scoreComparisonText || dashboard.value.trendMeta?.comparisonText || "暂无上周对比";
  const longestStreak = Number(homeAnalytics.value.longestStreak || homeAnalytics.value.currentStreak || 0);
  return [
    {
      label: "平均得分",
      value: averageScore === null || averageScore === undefined ? "--" : formatScore(averageScore),
      suffix: averageScore === null || averageScore === undefined ? "" : "/90",
      helper: homeAnalytics.value.scoredCount ? scoreComparisonText : "暂无上周对比",
      color: "#8a6845",
      icon: "✓"
    },
    {
      label: "练习总量",
      value: formatInteger(homeAnalytics.value.totalCount || 0),
      suffix: "题",
      helper: `今日完成 ${formatInteger(homeAnalytics.value.todayCount || 0)} 题`,
      color: "#6d8f72",
      icon: "✓"
    },
    {
      label: "连续学习",
      value: formatInteger(homeAnalytics.value.currentStreak || 0),
      suffix: "天",
      helper: longestStreak ? `最长 ${formatInteger(longestStreak)} 天` : "今天开始建立节奏",
      color: "#b07a4b",
      icon: "●"
    }
  ];
});

const quickModules = computed(() => {
  const taskMap = new Map(tasks.value.map((task) => [`${task.id || ""}`.trim().toUpperCase(), task]));
  return ["RA", "WFD", "RTS", "DI", "WE"]
    .filter((taskType) => (taskType === "DI" ? isDIEnabled() : true))
    .map((taskType) => {
      const visual = taskVisuals[taskType];
      const task = taskMap.get(taskType);
      return {
        ...visual,
        path: task?.to || visual.path
      };
    });
});

const coachBanner = computed(() => dashboard.value.coach?.banner || "建议优先练习 RA 和 DI，提升整体得分效率");
const coachSummaries = computed(() => {
  const summaries = dashboard.value.coach?.summaries;
  const source = Array.isArray(summaries) && summaries.length
    ? summaries
    : [
      { text: "小K，今天我们重点突破 RA 流利度和 DI 数据解读能力，这样能更快提升你的整体分数。", time: "10:32" },
      { text: "从最近练习来看，DI 和 WE 的正确率偏低，建议安排针对性训练，2 天内可见提升哦。", time: "10:33" }
    ];
  return source.map((item) => (typeof item === "string" ? { text: item, time: "" } : item)).slice(0, 2);
});

const dailySuggestionCacheKey = computed(() => {
  const userId = `${authStore.user?.id || ""}`.trim();
  return userId ? `pte_daily_ai_suggestion:${userId}:${getTodayDateKey()}` : "";
});
const dailyPracticeSummary = computed(() => buildDailyPracticeSummaryFromDashboard());
const dailyAiSuggestion = computed(() => dailyAiSuggestionState.value.suggestion || createNewUserDailySuggestion());
const dailyAiSuggestionTasks = computed(() => sanitizeDailySuggestionTasks(dailyAiSuggestion.value.tasks, dailyAiSuggestion.value.main_task_type));
const dailyAiSuggestionStatusLabel = computed(() => {
  if (dailyAiSuggestionState.value.loading) return "生成中";
  if (dailyAiSuggestionState.value.source === "new_user") return "新手建议";
  if (dailyAiSuggestionState.value.source === "fallback") return "临时建议";
  return "AI 已生成";
});
const dailyAiSuggestionTimeLabel = computed(() => {
  if (dailyAiSuggestionState.value.loading) return "正在生成今日 AI 建议...";
  if (dailyAiSuggestionState.value.source === "new_user") return "新手建议";
  if (dailyAiSuggestionState.value.source === "fallback") {
    return `临时建议 · ${formatSuggestionGeneratedAt(dailyAiSuggestionState.value.generated_at)}`;
  }
  return formatSuggestionGeneratedAt(dailyAiSuggestionState.value.generated_at);
});
const dailyAiMainTaskPath = computed(() => {
  const taskType = normalizeDailyTaskType(dailyAiSuggestion.value.main_task_type) || "RA";
  return taskVisuals[taskType]?.path || "/ra";
});
const weeklyCompletionCounts = computed(() => {
  const source = dashboard.value.weeklyStudy?.taskCounts || {};
  return Object.fromEntries(
    WEEKLY_GOAL_TASKS.map((task) => [task.type, Math.max(0, Math.floor(Number(source[task.type] || 0)))])
  );
});
const weeklyGoalTargets = computed(() => normalizeWeeklyGoals(weeklyGoalState.value.goals));
const weeklyGoalTargetTotal = computed(() => sumGoalValues(weeklyGoalTargets.value));
const weeklyGoalEffectiveCompletedTotal = computed(() =>
  calculateEffectiveGoalCompleted(weeklyGoalTargets.value, weeklyCompletionCounts.value)
);
const weeklyGoalProgressRatio = computed(() => {
  if (weeklyGoalTargetTotal.value <= 0) return 0;
  return Math.min(1, weeklyGoalEffectiveCompletedTotal.value / weeklyGoalTargetTotal.value);
});
const weeklyGoalPercent = computed(() => Math.round(weeklyGoalProgressRatio.value * 100));
const weeklyGoalIsSet = computed(() => weeklyGoalTargetTotal.value > 0);
const weeklyGoalIsComplete = computed(() =>
  weeklyGoalIsSet.value && weeklyGoalEffectiveCompletedTotal.value >= weeklyGoalTargetTotal.value
);
const weeklyGoalStatusLabel = computed(() => {
  if (!weeklyGoalIsSet.value) return "未设置";
  return weeklyGoalIsComplete.value ? "已达成" : "进行中";
});
const weeklyGoalSummary = computed(() => {
  if (!weeklyGoalIsSet.value) return "尚未设置本周目标";
  const base = `已完成 ${formatInteger(weeklyGoalEffectiveCompletedTotal.value)} / ${formatInteger(weeklyGoalTargetTotal.value)} 题`;
  return weeklyGoalIsComplete.value ? `${base}，目标已达成` : base;
});
const weeklyGoalButtonLabel = computed(() => (weeklyGoalIsSet.value ? "调整目标" : "去设置目标"));
const weeklyGoalRingStyle = computed(() => ({
  background: `conic-gradient(#8a6845 ${weeklyGoalPercent.value * 3.6}deg, #e4dbcc 0deg)`
}));
const weeklyGoalChips = computed(() =>
  WEEKLY_GOAL_TASKS.map((task) => {
    const target = Number(weeklyGoalTargets.value[task.type] || 0);
    const completed = Number(weeklyCompletionCounts.value[task.type] || 0);
    return {
      ...task,
      target,
      completed,
      active: target > 0,
      complete: target > 0 && completed >= target
    };
  })
);
const goalDraftRows = computed(() =>
  WEEKLY_GOAL_TASKS.map((task) => ({
    ...task,
    target: Number(goalDraft.value[task.type] || 0),
    completed: Number(weeklyCompletionCounts.value[task.type] || 0)
  }))
);
const goalDraftTargetTotal = computed(() => sumGoalValues(goalDraft.value));
const goalDraftCompletedTotal = computed(() =>
  calculateEffectiveGoalCompleted(goalDraft.value, weeklyCompletionCounts.value)
);
const goalDraftProgressPercent = computed(() => {
  if (goalDraftTargetTotal.value <= 0) return 0;
  return Math.min(100, Math.round((goalDraftCompletedTotal.value / goalDraftTargetTotal.value) * 100));
});

const heatDays = computed(() => {
  const weekDays = dashboard.value.weeklyStudy?.weekDays;
  if (Array.isArray(weekDays) && weekDays.length) {
    return weekDays.slice(0, 7).map((day) => ({
      label: day.isToday ? "今日" : day.label,
      dateLabel: day.dateLabel || "",
      isToday: Boolean(day.isToday)
    }));
  }
  return fallbackHeatDays;
});

const heatRows = computed(() => {
  const matrix = dashboard.value.heatmapMatrix;
  if (Array.isArray(matrix) && matrix.length) {
    return matrix.map((row) => ({
      label: row.label || row.taskType,
      cells: (row.cells || []).slice(0, 7).map((cell, index) => {
        const level = Number(cell.level || 0);
        const day = heatDays.value[index] || {};
        return {
          level: Number.isFinite(level) ? Math.max(0, Math.min(4, level)) : 0,
          count: Number(cell.count || 0),
          dateLabel: cell.dateLabel || day.dateLabel || "",
          isToday: Boolean(cell.isToday || day.isToday)
        };
      })
    }));
  }
  return fallbackHeatRows.map((row) => ({
    label: row.label,
    cells: row.cells.map((level, index) => ({
      level,
      count: level,
      dateLabel: heatDays.value[index]?.dateLabel || "",
      isToday: Boolean(heatDays.value[index]?.isToday)
    }))
  }));
});

const weeklyStudyFoot = computed(() => {
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const minutes = Number(weeklyStudy.estimatedWeekMinutes || 0);
  const hours = Number.isFinite(minutes) ? minutes / 60 : 0;
  const prefix = weeklyStudy.usesEstimatedDuration ? "本周学习约" : "本周学习";
  return `${prefix} ${formatScore(hours)} 小时`;
});

function formatTrendAxisLabel(label) {
  const text = `${label || ""}`.trim();
  const match = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return text.replace(/-/g, "/");
  return `${Number.parseInt(match[1], 10)}/${Number.parseInt(match[2], 10)}`;
}

const trendLabels = computed(() => {
  const points = dashboard.value.scoreTrend;
  if (!Array.isArray(points) || !points.length) return ["5/10", "5/11", "5/12", "5/13", "5/14", "5/15", "5/16"];
  return points.map((point) => formatTrendAxisLabel(point.label));
});

const trendSourcePoints = computed(() => {
  const points = dashboard.value.scoreTrend;
  return Array.isArray(points) ? points.slice(0, 7) : [];
});

const trendYTicks = computed(() =>
  TREND_TICKS.map((value) => ({
    value,
    y: scoreToTrendY(value)
  }))
);

const trendPlotPoints = computed(() => {
  return trendLineSegments.value.flatMap((segment) => segment.points);
});

const trendLineSegments = computed(() => {
  const sourcePoints = trendSourcePoints.value;
  const segments = [];
  let current = [];

  sourcePoints.forEach((point, index) => {
    const plottedPoint = createTrendPlotPoint(point, index, sourcePoints.length);
    if (!plottedPoint) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }

    current.push(plottedPoint);
  });

  if (current.length) segments.push(current);

  return segments.map((points, index) => ({
    key: `trend-segment-${index}`,
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
    areaPath: points.length > 1
      ? `M${points[0].x} ${TREND_CHART.bottom} ${points.map((point) => `L${point.x} ${point.y}`).join(" ")} L${points[points.length - 1].x} ${TREND_CHART.bottom} Z`
      : ""
  }));
});

const trendDrawableSegments = computed(() => trendLineSegments.value.filter((segment) => segment.points.length > 1));

const trendHasData = computed(() => trendPlotPoints.value.length > 0);
const trendFootText = computed(() => {
  const meta = dashboard.value.trendMeta || {};
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return meta.comparisonText || "暂无上周对比";
});

const trendScoreChip = computed(() => {
  const latestPoint = [...trendPlotPoints.value].reverse()[0];
  if (!latestPoint) {
    return {
      label: "近 7 天",
      value: "--"
    };
  }
  return {
    label: `${latestPoint.label} 平均分`,
    value: latestPoint.displayValue
  };
});

function scoreToTrendY(value) {
  const numeric = Number(value);
  const clamped = Math.max(TREND_MIN_SCORE, Math.min(TREND_MAX_SCORE, Number.isFinite(numeric) ? numeric : TREND_MIN_SCORE));
  const ratio = (clamped - TREND_MIN_SCORE) / (TREND_MAX_SCORE - TREND_MIN_SCORE);
  return TREND_CHART.bottom - ratio * (TREND_CHART.bottom - TREND_CHART.top);
}

function createTrendPlotPoint(point, index, total) {
  if (point?.value === null || point?.value === undefined || point?.value === "") return null;

  const value = Number(point?.value);
  if (!Number.isFinite(value)) return null;

  const xStep = (TREND_CHART.right - TREND_CHART.left) / Math.max(1, total - 1 || 6);
  const x = TREND_CHART.left + xStep * index;
  const y = scoreToTrendY(value);
  return {
    key: point.key || `${point.label}-${index}`,
    label: point.label || "",
    value,
    displayValue: formatScore(value),
    practiceCount: Number(point.practiceCount || point.scoredCount || 0),
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1))
  };
}

function formatTrendPointTitle(point) {
  return `${point.label}，平均分 ${point.displayValue}，练习 ${formatInteger(point.practiceCount)} 次`;
}

const trendEmptyText = computed(() => {
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return "";
});

const weakItems = computed(() => {
  const realItems = dashboard.value.weakPoints;
  const source = Array.isArray(realItems) ? realItems : [];
  return source.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    accent: item.accent || "#b07a4b",
    title: item.title ? `${item.label || ""} ${item.title}`.trim() : item.title,
    metricLabel: item.metricLabel || (typeof item.averageScore === "number" ? `均分 ${formatScore(item.averageScore)}` : "--"),
    delta: item.deltaText || "暂无上周对比",
    deltaMuted: !item.deltaText || /暂无|--/.test(`${item.deltaText}`)
  }));
});

const hasWeakItems = computed(() => weakItems.value.length > 0);

const recentItems = computed(() => {
  const realItems = dashboard.value.recentPractices;
  const source = Array.isArray(realItems) ? realItems : [];
  return source.slice(0, 3).map((item, index) => ({
    key: item.key || `${item.id || item.question_id || "log"}-${item.created_at || item.timeLabel || index}-${index}`,
    type: item.taskType || item.type,
    title: item.title,
    score: item.metricLabel || item.scoreLabel || item.score || "暂无分数",
    time: item.timeLabel || item.time || "--",
    color: item.accent || item.color || "#8a6845",
    scoreMuted: /暂无|--/.test(`${item.metricLabel || item.scoreLabel || item.score || ""}`)
  }));
});

const hasRecentItems = computed(() => recentItems.value.length > 0);

function createDailySuggestionState(payload = {}) {
  return {
    date: payload.date || getTodayDateKey(),
    user_id: payload.user_id || "",
    practice_signature: payload.practice_signature || "",
    suggestion: sanitizeDailySuggestion(payload.suggestion || createNewUserDailySuggestion()),
    generated_at: payload.generated_at || "",
    source: payload.source || "new_user",
    summary: payload.summary || null,
    loading: Boolean(payload.loading),
    reason_code: payload.reason_code || ""
  };
}

function createNewUserDailySuggestion() {
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

function createFallbackDailySuggestion(summary = {}) {
  const mainTaskType = normalizeDailyTaskType(summary.weakest_task_type || summary.latest_task_type) || "RA";
  const taskMethods = {
    RA: "重点保持不断句，卡顿超过 3 秒就重读一遍。",
    WFD: "先听主干，再补冠词、复数和时态细节。",
    WE: "先列结构，再写正文，避免边想边写。",
    DI: "先说主图信息，再补 2 个细节，最后总结一句。",
    RTS: "先抓场景和任务，再复述关键动作。"
  };

  return {
    title: "今日 AI 建议",
    main_task_type: mainTaskType,
    headline: `今天先稳住 ${mainTaskType} 表现`,
    reason: summary.weakest_task_type ? `最近 ${mainTaskType} 更值得优先补强。` : "AI 建议暂时不可用，先用保守计划兜底。",
    advice: taskMethods[mainTaskType] || taskMethods.RA,
    tasks: [
      { task_type: mainTaskType, count: mainTaskType === "WFD" ? 5 : 3 },
      { task_type: mainTaskType === "RA" ? "DI" : "RA", count: 2 }
    ],
    cta_text: `开始 ${mainTaskType} 训练`
  };
}

function sanitizeDailySuggestion(suggestion) {
  const source = suggestion && typeof suggestion === "object" ? suggestion : {};
  const mainTaskType = normalizeDailyTaskType(source.main_task_type) || "RA";
  return {
    title: "今日 AI 建议",
    main_task_type: mainTaskType,
    headline: limitText(source.headline, "先完成一轮基础测温", 30),
    reason: limitText(source.reason, "根据你的练习记录，今天先做一组稳定训练。", 62),
    advice: limitText(source.advice, "每题只盯一个训练动作，完成后再看反馈。", 92),
    tasks: sanitizeDailySuggestionTasks(source.tasks, mainTaskType),
    cta_text: limitText(source.cta_text, `开始 ${mainTaskType} 训练`, 18)
  };
}

function sanitizeDailySuggestionTasks(tasks, mainTaskType = "RA") {
  const normalized = (Array.isArray(tasks) ? tasks : [])
    .map((item) => ({
      task_type: normalizeDailyTaskType(item?.task_type),
      count: Math.max(0, Math.min(10, Math.floor(Number(item?.count || 0))))
    }))
    .filter((item) => item.task_type && item.count > 0)
    .slice(0, 3);

  if (normalized.length) return normalized;
  return [{ task_type: normalizeDailyTaskType(mainTaskType) || "RA", count: 2 }];
}

function normalizeDailyTaskType(value) {
  const normalized = `${value || ""}`.trim().toUpperCase();
  return ["RA", "WFD", "WE", "DI", "RTS"].includes(normalized) ? normalized : "";
}

function buildDailyPracticeSummaryFromDashboard() {
  const analytics = dashboard.value.homeAnalytics || {};
  const recent = Array.isArray(dashboard.value.recentPractices) ? dashboard.value.recentPractices[0] : null;
  const weak = Array.isArray(dashboard.value.weakPoints) ? dashboard.value.weakPoints[0] : null;
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const todayKey = resolveDashboardTodayKey(weeklyStudy) || getTodayDateKey();
  const todayTaskCounts = Object.fromEntries(
    WEEKLY_GOAL_TASKS.map((task) => {
      const count = Number(weeklyStudy.counters?.[task.type]?.[todayKey] || 0);
      return [task.type, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0];
    })
  );
  const todayAttempts = Number(analytics.todayCount || 0) || Object.values(todayTaskCounts).reduce((total, count) => total + Number(count || 0), 0);

  const summary = {
    total_attempts: Math.max(0, Math.floor(Number(analytics.totalCount || 0))),
    today_attempts: Math.max(0, Math.floor(Number(todayAttempts || 0))),
    latest_practice_id: `${recent?.id || ""}`.trim(),
    latest_practice_at: `${recent?.timeLabel || recent?.created_at || ""}`.trim(),
    latest_task_type: normalizeDailyTaskType(recent?.taskType || recent?.type),
    recent_7_days_attempts: Math.max(0, Math.floor(Number(weeklyStudy.totalCount || 0))),
    recent_7_days_average_score: normalizeNullableNumber(dashboard.value.trendMeta?.currentAverage ?? analytics.averageScore),
    weakest_task_type: normalizeDailyTaskType(weak?.taskType),
    weakest_task_average_score: normalizeNullableNumber(weak?.averageScore),
    today_task_counts: todayTaskCounts
  };

  return {
    ...summary,
    practice_signature: createDailyPracticeSignature(summary)
  };
}

function createDailyPracticeSignature(summary) {
  return [
    `total=${formatSignatureInteger(summary.total_attempts)}`,
    `today=${formatSignatureInteger(summary.today_attempts)}`,
    `latest=${summary.latest_practice_id || ""}`,
    `latestAt=${summary.latest_practice_at || ""}`,
    `r7=${formatSignatureInteger(summary.recent_7_days_attempts)}`,
    `avg7=${formatSignatureNumber(summary.recent_7_days_average_score)}`,
    `weak=${summary.weakest_task_type || ""}:${formatSignatureNumber(summary.weakest_task_average_score)}`
  ].join("|");
}

function shouldRegenerateSuggestion(cache, summary, force = false) {
  if (force) return true;
  if (!cache?.suggestion) return true;
  if (cache.date !== getTodayDateKey()) return true;
  if (Number(summary.total_attempts || 0) <= 0) return false;
  if (cache.source === "new_user") return true;
  if (cache.source === "fallback") return isFallbackSuggestionRetryDue(cache);
  if (!cache.practice_signature) return true;
  if (cache.practice_signature === summary.practice_signature) return false;

  const cachedSummary = cache.summary || {};
  const todayIncrease = Number(summary.today_attempts || 0) - Number(cachedSummary.today_attempts || 0);
  const latestChanged = Boolean(summary.latest_practice_id)
    && summary.latest_practice_id !== cachedSummary.latest_practice_id;
  const mainTaskType = normalizeDailyTaskType(cache.suggestion?.main_task_type);

  if (latestChanged && todayIncrease >= 2) return true;
  if (latestChanged && mainTaskType && summary.latest_task_type === mainTaskType) return true;

  const averageGap = Math.abs(Number(summary.recent_7_days_average_score || 0) - Number(cachedSummary.recent_7_days_average_score || 0));
  if (Number.isFinite(averageGap) && averageGap >= 5) return true;

  if (
    summary.weakest_task_type
    && cachedSummary.weakest_task_type
    && summary.weakest_task_type !== cachedSummary.weakest_task_type
  ) {
    return true;
  }

  const currentCounts = summary.today_task_counts || {};
  const cachedCounts = cachedSummary.today_task_counts || {};
  return WEEKLY_GOAL_TASKS.some((task) => Number(currentCounts[task.type] || 0) - Number(cachedCounts[task.type] || 0) >= 3);
}

function isFallbackSuggestionRetryDue(cache) {
  const generatedAt = new Date(cache?.generated_at || "");
  if (!Number.isFinite(generatedAt.getTime())) return true;
  return Date.now() - generatedAt.getTime() >= 10 * 60 * 1000;
}

function readDailySuggestionCache() {
  const key = dailySuggestionCacheKey.value;
  if (!key || typeof window === "undefined") return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return createDailySuggestionState(parsed);
  } catch {
    return null;
  }
}

function persistDailySuggestionCache(payload) {
  const key = dailySuggestionCacheKey.value;
  if (!key || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify({
      date: payload.date || getTodayDateKey(),
      user_id: payload.user_id || authStore.user?.id || "",
      practice_signature: payload.practice_signature || "",
      suggestion: sanitizeDailySuggestion(payload.suggestion),
      generated_at: payload.generated_at || new Date().toISOString(),
      source: payload.source || "fallback",
      summary: payload.summary || null,
      reason_code: payload.reason_code || ""
    }));
  } catch (error) {
    console.warn("Daily AI suggestion cache save failed:", error);
  }
}

function loadCachedDailySuggestion() {
  const cache = readDailySuggestionCache();
  if (cache) {
    dailyAiSuggestionState.value = {
      ...cache,
      loading: false
    };
    return cache;
  }

  dailyAiSuggestionState.value = createDailySuggestionState({
    source: "new_user",
    suggestion: createNewUserDailySuggestion()
  });
  return null;
}

async function refreshDailyAiSuggestion({ force = false } = {}) {
  if (dailySuggestionLoadPromise) return dailySuggestionLoadPromise;

  const currentLoad = (async () => {
    const summary = dailyPracticeSummary.value;
    const userId = `${authStore.user?.id || ""}`.trim();
    const cache = readDailySuggestionCache();

    if (!userId || Number(summary.total_attempts || 0) <= 0) {
      const nextState = createDailySuggestionState({
        date: getTodayDateKey(),
        user_id: userId,
        practice_signature: summary.practice_signature,
        suggestion: createNewUserDailySuggestion(),
        generated_at: new Date().toISOString(),
        source: "new_user",
        summary,
        reason_code: "new_user"
      });
      dailyAiSuggestionState.value = nextState;
      persistDailySuggestionCache(nextState);
      return nextState;
    }

    if (cache && !shouldRegenerateSuggestion(cache, summary, force)) {
      dailyAiSuggestionState.value = {
        ...cache,
        loading: false
      };
      return cache;
    }

    dailyAiSuggestionState.value = {
      ...(cache || dailyAiSuggestionState.value),
      loading: true
    };

    try {
      const result = await requestDailyAiSuggestion({
        force,
        practiceSignature: summary.practice_signature
      });

      if (!result.ok || !result.suggestion) {
        throw new Error(result.reason_code || "daily_suggestion_failed");
      }

      const nextState = createDailySuggestionState({
        date: getTodayDateKey(),
        user_id: userId,
        practice_signature: result.practice_signature || summary.practice_signature,
        suggestion: result.suggestion,
        generated_at: result.generated_at || new Date().toISOString(),
        source: result.source || "agent",
        summary: result.summary || summary,
        reason_code: result.reason_code || "ok"
      });
      dailyAiSuggestionState.value = nextState;
      persistDailySuggestionCache(nextState);
      return nextState;
    } catch (error) {
      console.warn("Daily AI suggestion load failed:", error);
      const nextState = createDailySuggestionState({
        date: getTodayDateKey(),
        user_id: userId,
        practice_signature: summary.practice_signature,
        suggestion: createFallbackDailySuggestion(summary),
        generated_at: new Date().toISOString(),
        source: "fallback",
        summary,
        reason_code: "fallback_error"
      });
      dailyAiSuggestionState.value = nextState;
      persistDailySuggestionCache(nextState);
      return nextState;
    }
  })();

  dailySuggestionLoadPromise = currentLoad;
  try {
    return await currentLoad;
  } finally {
    if (dailySuggestionLoadPromise === currentLoad) {
      dailySuggestionLoadPromise = null;
    }
  }
}

function resolveDashboardTodayKey(weeklyStudy) {
  const today = Array.isArray(weeklyStudy?.weekDays)
    ? weeklyStudy.weekDays.find((day) => day?.isToday)
    : null;
  return `${today?.key || ""}`.trim();
}

function getTodayDateKey(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatSuggestionGeneratedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "今日更新";
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  if (getTodayDateKey(date) === getTodayDateKey()) {
    return `今日 ${hours}:${minutes} 更新`;
  }
  return `${date.getMonth() + 1}-${`${date.getDate()}`.padStart(2, "0")} ${hours}:${minutes} 更新`;
}

function openDailySuggestionPractice() {
  openPath(dailyAiMainTaskPath.value);
}

function limitText(value, fallback, maxLength) {
  const text = `${value || fallback || ""}`.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(1)) : null;
}

function formatSignatureInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.max(0, Math.floor(numeric))}` : "0";
}

function formatSignatureNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "na";
}

function createEmptyWeeklyGoals() {
  return Object.fromEntries(WEEKLY_GOAL_TASKS.map((task) => [task.type, 0]));
}

function createWeeklyGoalState(goals = createEmptyWeeklyGoals()) {
  return {
    week_start: getWeekStartKey(),
    goals: normalizeWeeklyGoals(goals),
    updated_at: ""
  };
}

function normalizeWeeklyGoals(goals) {
  const source = goals && typeof goals === "object" ? goals : {};
  return Object.fromEntries(
    WEEKLY_GOAL_TASKS.map((task) => [task.type, normalizeGoalNumber(source[task.type])])
  );
}

function normalizeGoalNumber(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(numeric, 999);
}

function sumGoalValues(goals) {
  const normalized = normalizeWeeklyGoals(goals);
  return WEEKLY_GOAL_TASKS.reduce((total, task) => total + Number(normalized[task.type] || 0), 0);
}

function calculateEffectiveGoalCompleted(goals, completedCounts) {
  const normalizedGoals = normalizeWeeklyGoals(goals);
  const completed = completedCounts && typeof completedCounts === "object" ? completedCounts : {};

  return WEEKLY_GOAL_TASKS.reduce((total, task) => {
    const target = Number(normalizedGoals[task.type] || 0);
    const done = Math.max(0, Math.floor(Number(completed[task.type] || 0)));
    return total + Math.min(done, target);
  }, 0);
}

function getWeekStartKey(date = new Date()) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  const day = localDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  localDate.setDate(localDate.getDate() + mondayOffset);
  return formatLocalDateKey(localDate);
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadWeeklyGoals() {
  const emptyState = createWeeklyGoalState();
  if (typeof window === "undefined") {
    weeklyGoalState.value = emptyState;
    return;
  }

  const key = weeklyGoalStorageKey.value;
  if (!key) {
    weeklyGoalState.value = emptyState;
    return;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      weeklyGoalState.value = emptyState;
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed?.week_start !== currentWeekStartKey.value) {
      weeklyGoalState.value = emptyState;
      return;
    }

    weeklyGoalState.value = {
      week_start: currentWeekStartKey.value,
      goals: normalizeWeeklyGoals(parsed.goals),
      updated_at: `${parsed.updated_at || ""}`
    };
  } catch (error) {
    console.warn("Replica weekly goals load failed:", error);
    weeklyGoalState.value = emptyState;
  }
}

function persistWeeklyGoals(goals) {
  const normalized = normalizeWeeklyGoals(goals);
  const key = weeklyGoalStorageKey.value;
  const nextState = {
    week_start: currentWeekStartKey.value,
    goals: normalized,
    updated_at: new Date().toISOString()
  };

  if (typeof window === "undefined" || !key) {
    weeklyGoalState.value = nextState;
    return;
  }

  try {
    if (sumGoalValues(normalized) <= 0) {
      window.localStorage.removeItem(key);
      weeklyGoalState.value = createWeeklyGoalState();
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(nextState));
    weeklyGoalState.value = nextState;
  } catch (error) {
    console.warn("Replica weekly goals save failed:", error);
    weeklyGoalState.value = nextState;
  }
}

function openGoalModal() {
  loadWeeklyGoals();
  goalDraft.value = { ...weeklyGoalTargets.value };
  goalModalOpen.value = true;
}

function closeGoalModal() {
  goalModalOpen.value = false;
}

function updateGoalDraft(taskType, event) {
  goalDraft.value = {
    ...goalDraft.value,
    [taskType]: normalizeGoalNumber(event?.target?.value)
  };
}

function clearGoalDraft() {
  goalDraft.value = createEmptyWeeklyGoals();
}

function clearWeeklyGoals() {
  persistWeeklyGoals(createEmptyWeeklyGoals());
  goalDraft.value = createEmptyWeeklyGoals();
  goalModalOpen.value = false;
}

function saveWeeklyGoals() {
  persistWeeklyGoals(goalDraft.value);
  goalModalOpen.value = false;
}

async function loadDashboard(options = {}) {
  if (dashboardLoadPromise) return dashboardLoadPromise;

  const { showLoading = true } = options;
  const currentLoad = (async () => {
    if (showLoading) {
      dashboard.value = createEmptyDesktopDashboardState();
    }
    try {
      if (!authStore.loaded) {
        await authStore.loadStatus();
      }
      loadWeeklyGoals();

      const [rows, weaknessRows, recentRows] = await Promise.all([
        fetchDashboardPracticeRowsForAuth(authStore).catch((error) => {
          console.warn("Replica dashboard rows load failed:", error);
          return [];
        }),
        fetchDashboardWeaknessRowsForAuth(authStore).catch((error) => {
          console.warn("Replica dashboard weakness rows load failed:", error);
          return [];
        }),
        fetchDashboardRecentPracticeRowsForAuth(authStore).catch((error) => {
          console.warn("Replica dashboard recent rows load failed:", error);
          return [];
        })
      ]);
      const analyticsSnapshot = buildHomeAnalyticsSnapshotFromRows(rows);
      const weeklyRows = buildDashboardWeeklyPracticeRowsFromRows(rows);
      const trendRows = buildDashboardScoreTrendRowsFromRows(rows);

      dashboard.value = buildDesktopDashboardState(analyticsSnapshot, rows, {
        diEnabled: isDIEnabled(),
        weeklyRows,
        weaknessRows,
        recentRows,
        trendRows
      });
      void refreshDailyAiSuggestion();
    } catch (error) {
      console.warn("Replica dashboard load failed:", error);
      dashboard.value = {
        ...createEmptyDesktopDashboardState(),
        loading: false
      };
      void refreshDailyAiSuggestion();
    }
  })();

  dashboardLoadPromise = currentLoad;
  try {
    return await currentLoad;
  } finally {
    if (dashboardLoadPromise === currentLoad) {
      dashboardLoadPromise = null;
    }
  }
}

function handleNav(item) {
  if (!item?.target) return;
  if (item.target.startsWith("#")) {
    const id = item.target.slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  router.push(item.target);
}

function openPath(path) {
  if (path) router.push(path);
}

function formatHeatCellTitle(row, cell) {
  const date = cell.dateLabel ? `${cell.dateLabel} ` : "";
  return `${date}${row.label} 练习 ${formatInteger(cell.count || 0)} 次`;
}

function refreshDashboardOnFocus() {
  const now = Date.now();
  if (now - lastPassiveDashboardRefreshAt < DASHBOARD_REFRESH_DEBOUNCE_MS) return;

  lastPassiveDashboardRefreshAt = now;
  loadWeeklyGoals();
  loadDashboard({ showLoading: false });
}

function handleAvatarError() {
  avatarLoadFailed.value = true;
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    refreshDashboardOnFocus();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && goalModalOpen.value) {
    closeGoalModal();
  }
}

onMounted(() => {
  loadWeeklyGoals();
  loadCachedDailySuggestion();
  window.addEventListener("focus", refreshDashboardOnFocus);
  window.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  loadDashboard();
});

onBeforeUnmount(() => {
  window.removeEventListener("focus", refreshDashboardOnFocus);
  window.removeEventListener("keydown", handleGlobalKeydown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <div class="home-replica-page">
    <div class="home-replica-scale-slot">
      <div class="home-replica-canvas">
      <aside class="replica-sidebar">
        <div class="replica-brand">
          <div class="replica-brand-mark" aria-hidden="true"></div>
          <div class="replica-brand-text">开口</div>
        </div>

        <nav class="replica-nav" aria-label="复刻页面导航">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="replica-nav-item"
            :class="{ 'replica-nav-item--active': item.active }"
            type="button"
            @click="handleNav(item)"
          >
            <span class="replica-nav-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <section class="replica-resource-card">
          <p class="replica-resource-title">PTE 备考资料包</p>
          <p class="replica-resource-copy">真题 · 高频词汇 · 模板</p>
          <button class="replica-resource-button" type="button">免费领取</button>
          <div class="replica-gift" aria-hidden="true">
            <span class="replica-gift-box"></span>
            <span class="replica-gift-lid"></span>
            <span class="replica-gift-ribbon"></span>
          </div>
        </section>
      </aside>

      <main class="replica-main">
        <header class="replica-topbar">
          <div class="replica-greeting">
            <h1>你好，{{ userDisplayName }} <span>👋</span></h1>
            <p>坚持每天进步一点点，PTE 梦想更进一步！</p>
          </div>

          <div class="replica-top-actions">
            <button class="replica-profile" type="button" @click="openPath('/profile')">
              <span class="replica-profile-avatar" aria-hidden="true">
                <img v-if="showUserAvatar" :src="userAvatarUrl" :alt="`${userDisplayName}头像`" @error="handleAvatarError" />
                <b v-else>{{ userInitial }}</b>
              </span>
              <strong>{{ userDisplayName }}</strong>
              <svg class="replica-profile-chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5.5 7.5 10 12l4.5-4.5" />
              </svg>
            </button>
          </div>
        </header>

        <section class="replica-content">
          <div class="replica-left-column">
            <section class="replica-hero">
              <div class="replica-hero-copy">
                <h2>你的 <span>PTE</span> 学习总控台</h2>
                <p>{{ heroSubtitle }}</p>

                <div class="replica-focus-card">
                  <h3><span>◎</span> {{ focusTitle }}</h3>
                  <div v-for="task in focusTasks" :key="task.label" class="replica-focus-row">
                    <span class="replica-check">✓</span>
                    <strong>{{ task.label }}</strong>
                    <i class="replica-progress">
                      <b :style="{ width: `${task.width}%` }"></b>
                    </i>
                    <em>{{ task.count }}</em>
                  </div>
                </div>
              </div>

              <div class="replica-stat-grid">
                <article v-for="stat in statCards" :key="stat.label" class="replica-stat-card">
                  <span class="replica-stat-icon" :style="{ backgroundColor: stat.color }">{{ stat.icon }}</span>
                  <div>
                    <p>{{ stat.label }}</p>
                    <strong>{{ stat.value }} <small>{{ stat.suffix }}</small></strong>
                    <em>{{ stat.helper }}</em>
                  </div>
                </article>
              </div>
            </section>

            <section id="quick" class="replica-card replica-quick-card">
              <h3>模块快捷入口</h3>
              <div class="replica-quick-grid">
                <article
                  v-for="item in quickModules"
                  :key="item.title"
                  class="replica-quick-item"
                  role="button"
                  tabindex="0"
                  :aria-label="`进入 ${item.title} 练习`"
                  @click="openPath(item.path)"
                  @keydown.enter="openPath(item.path)"
                  @keydown.space.prevent="openPath(item.path)"
                >
                  <span class="replica-quick-icon" :style="{ backgroundColor: item.color }">{{ item.icon }}</span>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.subtitle }}</p>
                  </div>
                  <em>›</em>
                </article>
              </div>
            </section>
          </div>

          <div class="replica-right-column">
            <section class="replica-card replica-ai-card">
              <div class="replica-section-head">
                <h3><span>✦</span> AI 私教 <small>· 为你量身建议</small></h3>
                <button type="button" @click="openPath('/agent')">与 AI 私教对话 →</button>
              </div>

              <div class="replica-suggestion">
                <span>♧</span>
                <strong>{{ coachBanner }}</strong>
              </div>

              <div class="replica-chat-list">
                <div v-for="summary in coachSummaries" :key="`${summary.text}-${summary.time}`" class="replica-chat-row">
                  <img src="/agent/assistant-avatar.png" alt="AI" />
                  <div class="replica-chat-bubble">
                    <p>{{ summary.text }}</p>
                    <time>{{ summary.time }}</time>
                  </div>
                </div>
              </div>

              <div class="replica-ai-actions">
                <button type="button" @click="openPath('/ra')"><span>▣</span> 生成今日计划</button>
                <button type="button" @click="handleNav({ target: '#weakness' })"><span>◎</span> 分析我的弱项</button>
                <button type="button" @click="handleNav({ target: '#trend' })"><span>↗</span> 查看 7 天趋势</button>
              </div>
            </section>

            <div class="replica-side-card-grid">
              <section class="replica-card replica-mini-card replica-daily-ai-card">
                <div class="replica-mini-title replica-daily-ai-title">
                  <span>✦</span>
                  <strong>今日 AI 建议</strong>
                  <em>{{ dailyAiSuggestionStatusLabel }}</em>
                </div>
                <p class="replica-daily-ai-headline">{{ dailyAiSuggestion.headline }}</p>
                <p class="replica-daily-ai-reason">{{ dailyAiSuggestion.reason }}</p>
                <p class="replica-daily-ai-advice">{{ dailyAiSuggestion.advice }}</p>
                <div class="replica-daily-ai-bottom">
                  <div class="replica-daily-ai-meta">
                    <div class="replica-daily-ai-pills">
                      <span v-for="task in dailyAiSuggestionTasks" :key="`${task.task_type}-${task.count}`">
                        {{ task.task_type }} {{ task.count }} 道
                      </span>
                    </div>
                    <time>{{ dailyAiSuggestionTimeLabel }}</time>
                  </div>
                  <div class="replica-daily-ai-actions">
                    <button type="button" class="replica-daily-ai-primary" @click="openDailySuggestionPractice">
                      {{ dailyAiSuggestion.cta_text || "开始练习" }}
                    </button>
                    <button type="button" class="replica-daily-ai-secondary" @click="openPath('/agent')">问 AI 私教</button>
                  </div>
                </div>
              </section>

              <section id="goal" class="replica-card replica-goal-card">
                <div class="replica-goal-head">
                  <div class="replica-goal-title"><span>◎</span><strong>本周目标进度</strong></div>
                  <div class="replica-goal-head-actions">
                    <em :class="{ 'is-complete': weeklyGoalIsComplete, 'is-empty': !weeklyGoalIsSet }">{{ weeklyGoalStatusLabel }}</em>
                    <i>›</i>
                  </div>
                </div>
                <div class="replica-goal-body">
                  <div>
                    <div class="replica-goal-percent">{{ weeklyGoalPercent }}%</div>
                    <p>{{ weeklyGoalSummary }}</p>
                  </div>
                  <div class="replica-goal-ring" :style="weeklyGoalRingStyle">
                    <span>{{ weeklyGoalPercent }}%</span>
                  </div>
                </div>
                <div class="replica-goal-track"><span :style="{ width: `${weeklyGoalPercent}%` }"></span></div>
                <div class="replica-goal-chip-list">
                  <span
                    v-for="chip in weeklyGoalChips"
                    :key="chip.type"
                    class="replica-goal-chip"
                    :class="{ 'is-muted': !chip.active, 'is-complete': chip.complete }"
                  >
                    <b>{{ chip.type }}</b>
                    <i>{{ chip.completed }}/{{ chip.target }}</i>
                  </span>
                </div>
                <button type="button" class="replica-goal-button" @click="openGoalModal">{{ weeklyGoalButtonLabel }}</button>
              </section>
            </div>
          </div>

          <section id="report" class="replica-bottom-grid">
            <article class="replica-card replica-heatmap-card">
              <div class="replica-bottom-title">
                <h3>本周学习热力图 <span>◎</span></h3>
              </div>
              <div class="replica-heatmap">
                <div class="replica-heatmap-days">
                  <span></span>
                  <span
                    v-for="day in heatDays"
                    :key="`${day.label}-${day.dateLabel}`"
                    :class="{ 'is-today': day.isToday }"
                    :title="day.dateLabel"
                  >
                    {{ day.label }}
                  </span>
                </div>
                <div v-for="row in heatRows" :key="row.label" class="replica-heatmap-row">
                  <strong>{{ row.label }}</strong>
                  <i
                    v-for="(cell, index) in row.cells"
                    :key="`${row.label}-${index}`"
                    :class="[`heat-${cell.level}`, { 'is-today': cell.isToday }]"
                    :title="formatHeatCellTitle(row, cell)"
                  ></i>
                </div>
              </div>
              <div class="replica-heat-legend">
                <span>少</span>
                <i v-for="level in heatLegendLevels" :key="level" :class="`heat-${level}`"></i>
                <span>多</span>
              </div>
              <p class="replica-bottom-foot">{{ weeklyStudyFoot }}</p>
            </article>

            <article id="trend" class="replica-card replica-trend-card">
              <div class="replica-bottom-title">
                <h3>得分趋势（近 7 天）</h3>
                <span class="replica-score-chip">{{ trendScoreChip.label }}<br /><strong>{{ trendScoreChip.value }}</strong></span>
              </div>
              <svg class="replica-trend-chart" viewBox="0 0 500 210" role="img" aria-label="得分趋势">
                <defs>
                  <linearGradient id="replicaTrendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="rgba(62, 107, 255, 0.22)" />
                    <stop offset="100%" stop-color="rgba(62, 107, 255, 0.02)" />
                  </linearGradient>
                </defs>
                <line
                  v-for="tick in trendYTicks"
                  :key="`grid-${tick.value}`"
                  :x1="TREND_CHART.left"
                  :x2="TREND_CHART.right"
                  :y1="tick.y"
                  :y2="tick.y"
                  class="trend-grid"
                />
                <text v-for="tick in trendYTicks" :key="`tick-${tick.value}`" x="8" :y="tick.y + 5">{{ tick.value }}</text>
                <path v-for="segment in trendDrawableSegments" :key="`${segment.key}-area`" :d="segment.areaPath" fill="url(#replicaTrendFill)" />
                <polyline v-for="segment in trendDrawableSegments" :key="`${segment.key}-line`" :points="segment.polyline" class="trend-line" />
                <text v-if="!trendHasData" class="trend-empty-state" x="265" y="108" text-anchor="middle">{{ trendEmptyText }}</text>
                <circle v-for="point in trendPlotPoints" :key="point.key" :cx="point.x" :cy="point.y" r="6">
                  <title>{{ formatTrendPointTitle(point) }}</title>
                </circle>
              </svg>
              <div class="replica-trend-labels"><span v-for="label in trendLabels" :key="label">{{ label }}</span></div>
              <p class="replica-bottom-foot">{{ trendFootText }}</p>
            </article>

            <article id="weakness" class="replica-card replica-weak-card">
              <div class="replica-bottom-title">
                <h3>我的弱项 Top 3</h3>
              </div>
              <div v-if="hasWeakItems" class="replica-weak-list">
                <div v-for="item in weakItems" :key="item.rank" class="replica-weak-row" :style="{ '--weak-accent': item.accent }">
                  <span class="replica-weak-rank">{{ item.rank }}</span>
                  <div class="replica-weak-main">
                    <strong>{{ item.title }}</strong>
                    <div class="replica-weak-meta">
                      <em>{{ item.metricLabel }}</em>
                      <i :class="{ 'is-muted': item.deltaMuted }">{{ item.delta }}</i>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="replica-weak-empty">
                练习数据还不够，完成几道题后我会帮你识别弱项。
              </div>
            </article>

            <article class="replica-card replica-recent-card">
              <div class="replica-bottom-title">
                <h3>最近练习</h3>
              </div>
              <div v-if="hasRecentItems" class="replica-recent-list">
                <div v-for="item in recentItems" :key="item.key" class="replica-recent-row">
                  <span class="replica-recent-type" :style="{ backgroundColor: item.color }">{{ item.type }}</span>
                  <div class="replica-recent-main">
                    <strong>{{ item.title }}</strong>
                    <div class="replica-recent-meta">
                      <em :class="{ 'is-muted': item.scoreMuted }">{{ item.score }}</em>
                      <time>{{ item.time }}</time>
                    </div>
                  </div>
                  <i aria-hidden="true">›</i>
                </div>
              </div>
              <div v-else class="replica-recent-empty">
                暂无练习记录，完成一次练习后这里会自动更新。
              </div>
            </article>
          </section>
        </section>
      </main>
      </div>
    </div>
    <div v-if="goalModalOpen" class="replica-goal-modal-layer" @click.self="closeGoalModal">
      <section class="replica-goal-modal" role="dialog" aria-modal="true" aria-labelledby="weekly-goal-modal-title">
        <header>
          <div>
            <h2 id="weekly-goal-modal-title">设置本周目标</h2>
            <p>填写你本周每个题型想完成的题数</p>
          </div>
          <button type="button" class="replica-goal-modal-close" aria-label="关闭" @click="closeGoalModal">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" /></svg>
          </button>
        </header>

        <div class="replica-goal-form">
          <label v-for="row in goalDraftRows" :key="row.type" class="replica-goal-form-row">
            <span class="replica-goal-form-badge" :style="{ backgroundColor: row.accent }">{{ row.type }}</span>
            <strong>{{ row.name }}<small>已完成 {{ formatInteger(row.completed) }} 题</small></strong>
            <input
              type="number"
              min="0"
              max="999"
              step="1"
              inputmode="numeric"
              :value="row.target"
              @input="updateGoalDraft(row.type, $event)"
            />
            <em>题</em>
          </label>
        </div>

        <div class="replica-goal-modal-summary">
          <span>目标总数 <b>{{ formatInteger(goalDraftTargetTotal) }}</b> 题</span>
          <span>本周已完成 <b>{{ formatInteger(goalDraftCompletedTotal) }}</b> 题</span>
          <span>当前进度 <b>{{ goalDraftProgressPercent }}%</b></span>
        </div>

        <footer>
          <button type="button" class="replica-goal-modal-secondary" @click="closeGoalModal">取消</button>
          <button type="button" class="replica-goal-modal-clear" @click="clearWeeklyGoals">清空目标</button>
          <button type="button" class="replica-goal-modal-save" @click="saveWeeklyGoals">保存目标</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.home-replica-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding-bottom: max(48px, env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
  overflow-y: auto;
  background: #f8faff;
}

.home-replica-scale-slot {
  position: relative;
  overflow: visible;
}

.home-replica-canvas,
.home-replica-canvas * {
  box-sizing: border-box;
}

.home-replica-canvas {
  position: relative;
  width: 2560px;
  height: 1399px;
  transform-origin: top left;
  overflow: hidden;
  display: grid;
  grid-template-columns: 360px 1fr;
  background:
    radial-gradient(circle at 70% -6%, rgba(225, 231, 255, 0.88), transparent 28%),
    linear-gradient(180deg, #f9fbff 0%, #f7faff 46%, #f8fbff 100%);
  color: #17213f;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
}

.replica-sidebar {
  position: relative;
  height: 1399px;
  padding: 32px 30px 0;
  border-right: 1px solid #e7edf8;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 249, 255, 0.96));
  box-shadow: 28px 0 58px rgba(59, 89, 150, 0.055);
}

.replica-brand {
  display: flex;
  align-items: center;
  gap: 22px;
  padding-left: 26px;
}

.replica-brand-mark {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1674ff 0%, #1662ee 100%);
  box-shadow: 0 18px 32px rgba(26, 105, 245, 0.2);
}

.replica-brand-mark::before {
  content: "";
  position: absolute;
  left: 15px;
  top: 13px;
  width: 21px;
  height: 27px;
  border: 11px solid #fff;
  border-right: 0;
  border-radius: 14px 0 0 14px;
}

.replica-brand-mark::after {
  content: "";
  position: absolute;
  right: 11px;
  bottom: 11px;
  width: 19px;
  height: 19px;
  border-radius: 6px;
  background: #fff;
}

.replica-brand-text {
  color: #111629;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
}

.replica-nav {
  display: grid;
  gap: 24px;
  margin-top: 67px;
}

.replica-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 72px;
  width: 306px;
  border: 0;
  border-radius: 10px;
  padding: 0 28px;
  background: transparent;
  color: #6d7897;
  font: inherit;
  font-size: 25px;
  font-weight: 800;
}

.replica-nav-item--active {
  color: #176cff;
  background: linear-gradient(90deg, #e9efff 0%, rgba(242, 246, 255, 0.82) 100%);
}

.replica-nav-item--active::after {
  content: "";
  position: absolute;
  top: 0;
  right: -1px;
  width: 6px;
  height: 100%;
  border-radius: 10px 0 0 10px;
  background: #236cff;
}

.replica-nav-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: currentColor;
  font-size: 24px;
  line-height: 1;
}

.replica-resource-card {
  position: absolute;
  left: 33px;
  bottom: 125px;
  width: 304px;
  height: 265px;
  overflow: hidden;
  padding: 26px 24px;
  border: 1px solid #edf2fb;
  border-radius: 16px;
  background: linear-gradient(180deg, #f4f7ff 0%, #eef2ff 100%);
}

.replica-resource-title {
  margin: 0;
  color: #2a365a;
  font-size: 23px;
  font-weight: 900;
}

.replica-resource-copy {
  margin: 18px 0 0;
  color: #7f8aaa;
  font-size: 17px;
  font-weight: 700;
}

.replica-resource-button {
  position: relative;
  z-index: 2;
  height: 47px;
  margin-top: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 25px;
  background: linear-gradient(135deg, #7363ff, #8b72ff);
  box-shadow: 0 18px 32px rgba(116, 101, 255, 0.24);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
}

.replica-gift {
  position: absolute;
  right: 22px;
  bottom: 24px;
  width: 92px;
  height: 88px;
  transform: rotate(-12deg);
}

.replica-gift-box,
.replica-gift-lid {
  position: absolute;
  display: block;
  border-radius: 12px;
  background: linear-gradient(135deg, #5e88ff, #8a6bff);
  box-shadow: 0 16px 24px rgba(93, 117, 255, 0.2);
}

.replica-gift-box {
  left: 18px;
  bottom: 0;
  width: 56px;
  height: 54px;
}

.replica-gift-lid {
  left: 10px;
  top: 17px;
  width: 72px;
  height: 20px;
}

.replica-gift-ribbon {
  position: absolute;
  left: 40px;
  top: 14px;
  width: 13px;
  height: 70px;
  border-radius: 999px;
  background: #ff9d3b;
}

.replica-gift::before,
.replica-gift::after {
  content: "";
  position: absolute;
  top: 0;
  width: 28px;
  height: 22px;
  border: 7px solid #686cff;
  border-radius: 999px 999px 4px 999px;
}

.replica-gift::before {
  left: 23px;
  transform: rotate(28deg);
}

.replica-gift::after {
  right: 21px;
  transform: rotate(-28deg) scaleX(-1);
}

.replica-main {
  position: relative;
  height: 1399px;
}

.replica-topbar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 130px;
  border-bottom: 1px solid #e8eef8;
  background: rgba(255, 255, 255, 0.42);
}

.replica-greeting {
  position: absolute;
  left: 58px;
  top: 29px;
}

.replica-greeting h1 {
  margin: 0;
  color: #16213f;
  font-size: 31px;
  line-height: 1.24;
  font-weight: 900;
  letter-spacing: 0;
}

.replica-greeting p {
  margin: 9px 0 0;
  color: #8a96b4;
  font-size: 18px;
  font-weight: 700;
}

.replica-top-actions {
  position: absolute;
  top: 29px;
  right: 78px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.replica-profile {
  display: flex;
  align-items: center;
  gap: 18px;
  border: 0;
  background: transparent;
  color: #16213f;
  font: inherit;
  cursor: pointer;
  transition: color 0.18s ease;
}

.replica-profile:hover {
  color: #315dff;
}

.replica-profile-avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(135deg, #eef3ff 0%, #dfe7ff 100%);
  color: #496aff;
  font-size: 22px;
  font-weight: 950;
  box-shadow: 0 0 0 4px #fff;
}

.replica-profile-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.replica-profile-avatar b {
  font: inherit;
  line-height: 1;
}

.replica-profile strong {
  max-width: 190px;
  overflow: hidden;
  font-size: 21px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-profile-chevron {
  width: 16px;
  height: 16px;
  color: #7180a1;
  transition: color 0.18s ease, transform 0.18s ease;
}

.replica-profile-chevron path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.1;
}

.replica-profile:hover .replica-profile-chevron {
  color: #4f63ff;
  transform: translateY(1px);
}

.replica-content {
  position: absolute;
  left: 45px;
  top: 160px;
  width: 2107px;
  height: 1239px;
}

.replica-left-column {
  position: absolute;
  left: 0;
  top: 0;
  width: 1094px;
}

.replica-right-column {
  position: absolute;
  right: 0;
  top: 0;
  width: 977px;
}

.replica-card,
.replica-hero {
  border: 1px solid rgba(230, 236, 248, 0.96);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 32px rgba(69, 94, 155, 0.055);
}

.replica-hero {
  position: relative;
  width: 1094px;
  height: 633px;
  overflow: hidden;
  border-radius: 22px;
  background: #eef1ff url("/home/desktop-hero-bg.png") center / 100% 100% no-repeat;
}

.replica-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06) 50%, transparent 70%);
  pointer-events: none;
}

.replica-hero-copy {
  position: absolute;
  left: 37px;
  top: 44px;
  width: 548px;
}

.replica-hero-copy h2 {
  margin: 0;
  color: #111b39;
  font-size: 52px;
  line-height: 1.12;
  font-weight: 950;
  letter-spacing: 0;
  white-space: nowrap;
}

.replica-hero-copy h2 span {
  color: #1971ff;
}

.replica-hero-copy > p {
  margin: 20px 0 0;
  color: #6f7e9d;
  font-size: 24px;
  font-weight: 800;
}

.replica-focus-card {
  width: 535px;
  height: 235px;
  margin-top: 17px;
  padding: 26px 40px 34px 30px;
  border: 1px solid rgba(240, 243, 251, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 18px 42px rgba(94, 109, 177, 0.12);
  backdrop-filter: blur(6px);
}

.replica-focus-card h3 {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 0 0 21px;
  color: #202943;
  font-size: 22px;
  font-weight: 950;
}

.replica-focus-card h3 span {
  color: #ff3e48;
  font-size: 26px;
}

.replica-focus-row {
  display: grid;
  grid-template-columns: 22px 175px 170px 44px;
  align-items: center;
  gap: 13px;
  height: 39px;
  color: #33405d;
  font-size: 18px;
  font-weight: 800;
}

.replica-check {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 3px solid #a3afc5;
  border-radius: 999px;
  color: #7f8fab;
  font-size: 10px;
  line-height: 1;
}

.replica-progress {
  position: relative;
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8edf6;
}

.replica-progress b {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #3769ff, #6e80ff);
}

.replica-focus-row em {
  color: #73809e;
  font-style: normal;
  text-align: right;
}

.replica-stat-grid {
  position: absolute;
  left: 29px;
  right: 25px;
  bottom: 32px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.replica-stat-card {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  height: 165px;
  padding: 26px 34px 31px;
  border: 1px solid rgba(239, 242, 250, 0.92);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 16px 34px rgba(74, 92, 151, 0.06);
}

.replica-stat-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 45px;
  height: 45px;
  margin-top: 22px;
  border-radius: 15px;
  color: #fff;
  font-size: 25px;
  font-weight: 900;
  box-shadow: 0 12px 20px rgba(67, 97, 190, 0.16);
}

.replica-stat-card > div {
  transform: translateY(-10px);
}

.replica-stat-card p {
  margin: 0;
  color: #667491;
  font-size: 18px;
  font-weight: 900;
}

.replica-stat-card strong {
  display: block;
  margin-top: 10px;
  color: #17203d;
  font-size: 38px;
  line-height: 1;
  font-weight: 950;
}

.replica-stat-card small {
  color: #697692;
  font-size: 18px;
  font-weight: 800;
}

.replica-stat-card em {
  display: block;
  margin-top: 16px;
  color: #667491;
  font-size: 17px;
  font-style: normal;
  font-weight: 800;
}

.replica-quick-card {
  width: 1094px;
  height: 240px;
  margin-top: 28px;
  padding: 25px 29px;
  border-radius: 18px;
}

.replica-quick-card h3 {
  margin: 0;
  color: #222b48;
  font-size: 20px;
  font-weight: 950;
}

.replica-quick-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin-top: 25px;
}

.replica-quick-item {
  position: relative;
  display: grid;
  grid-template-columns: 45px minmax(70px, 1fr) 12px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 144px;
  padding: 0 13px 0 14px;
  border: 1px solid #e4ebf6;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 26px rgba(61, 88, 150, 0.04);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.replica-quick-item:hover {
  border-color: #c7d2fe;
  background: #ffffff;
  box-shadow: 0 18px 34px rgba(61, 88, 150, 0.12);
  transform: translateY(-4px);
}

.replica-quick-item:focus-visible {
  border-color: #8da2ff;
  box-shadow: 0 0 0 4px rgba(91, 111, 255, 0.16), 0 18px 34px rgba(61, 88, 150, 0.12);
  outline: none;
  transform: translateY(-4px);
}

.replica-quick-icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border-radius: 999px;
  color: #fff;
  font-size: 20px;
  font-weight: 900;
}

.replica-quick-item strong {
  display: block;
  color: #26304d;
  font-size: 23px;
  line-height: 1;
  font-weight: 950;
}

.replica-quick-item p {
  margin: 14px 0 0;
  color: #7785a2;
  white-space: pre;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 800;
}

.replica-quick-item em {
  color: #6f7fa2;
  font-size: 34px;
  font-style: normal;
  line-height: 1;
}

.replica-ai-card {
  height: 555px;
  padding: 27px 25px 21px;
  border-radius: 20px;
}

.replica-section-head,
.replica-bottom-title,
.replica-mini-title {
  display: flex;
  align-items: center;
}

.replica-section-head {
  justify-content: space-between;
}

.replica-section-head h3,
.replica-bottom-title h3 {
  margin: 0;
  color: #222b49;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 950;
}

.replica-section-head h3 span {
  color: #5e6dff;
  font-size: 37px;
  vertical-align: -4px;
}

.replica-section-head h3 small {
  color: #667492;
  font-size: 17px;
  font-weight: 800;
}

.replica-section-head button {
  height: 50px;
  border: 1px solid #dfe7fa;
  border-radius: 11px;
  padding: 0 25px;
  background: #fbfcff;
  color: #536dff;
  font-size: 17px;
  font-weight: 950;
}

.replica-suggestion {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 70px;
  margin-top: 24px;
  padding: 0 25px;
  border: 1px solid #f2dfc8;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(255, 249, 240, 0.98), rgba(255, 253, 248, 0.94));
}

.replica-suggestion span {
  color: #ff982a;
  font-size: 27px;
}

.replica-suggestion strong {
  color: #303a55;
  font-size: 18px;
  font-weight: 900;
}

.replica-chat-list {
  display: grid;
  gap: 15px;
  margin-top: 22px;
}

.replica-chat-row {
  display: grid;
  grid-template-columns: 48px 1fr;
  align-items: start;
  gap: 18px;
}

.replica-chat-row img {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  object-fit: cover;
}

.replica-chat-bubble {
  width: 766px;
  min-height: 102px;
  padding: 16px 22px 10px;
  border: 1px solid #e8edf7;
  border-radius: 16px;
  background: #fff;
}

.replica-chat-bubble p {
  margin: 0;
  color: #65728d;
  font-size: 18px;
  line-height: 1.6;
  font-weight: 800;
}

.replica-chat-bubble time {
  display: block;
  margin-top: 3px;
  color: #8e9bb3;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.replica-ai-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 26px;
  margin-top: 41px;
}

.replica-ai-actions button {
  height: 83px;
  border: 1px solid #e4ebf7;
  border-radius: 13px;
  background: #fff;
  color: #536dff;
  font-size: 18px;
  font-weight: 950;
}

.replica-ai-actions span {
  margin-right: 10px;
  color: #536dff;
  font-size: 22px;
}

.replica-side-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  margin-top: 28px;
}

.replica-mini-card {
  height: 284px;
  padding: 27px 27px;
  border-radius: 18px;
}

.replica-mini-title {
  gap: 16px;
}

.replica-mini-title span {
  color: #536dff;
  font-size: 27px;
}

.replica-mini-title strong {
  color: #24304d;
  font-size: 21px;
  font-weight: 950;
}

.replica-mini-title em {
  margin-left: auto;
  color: #8390ab;
  font-size: 35px;
  font-style: normal;
  line-height: 1;
}

.replica-daily-ai-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 8%, rgba(91, 111, 255, 0.08), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
}

.replica-daily-ai-title em {
  height: 27px;
  border: 1px solid #dfe7ff;
  border-radius: 999px;
  padding: 0 12px;
  background: #f5f8ff;
  color: #566dff;
  font-size: 13px;
  font-style: normal;
  font-weight: 950;
  line-height: 25px;
}

.replica-daily-ai-headline {
  margin: 18px 0 0;
  color: #24304d;
  font-size: 21px;
  line-height: 1.22;
  font-weight: 950;
}

.replica-daily-ai-reason,
.replica-daily-ai-advice {
  margin: 9px 0 0;
  color: #7a87a3;
  font-size: 14px;
  line-height: 1.42;
  font-weight: 750;
}

.replica-daily-ai-advice {
  color: #5f6d8b;
}

.replica-daily-ai-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 0;
}

.replica-daily-ai-pills span {
  height: 27px;
  border: 1px solid #dfe6ff;
  border-radius: 999px;
  padding: 0 11px;
  background: #f4f7ff;
  color: #536dff;
  font-size: 13px;
  line-height: 25px;
  font-weight: 950;
}

.replica-daily-ai-bottom {
  margin-top: auto;
  padding-top: 15px;
  display: grid;
  gap: 12px;
}

.replica-daily-ai-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 9px 12px;
}

.replica-daily-ai-meta time {
  color: #9aa6bb;
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
}

.replica-daily-ai-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  align-items: center;
  gap: 10px;
  width: 100%;
}

.replica-daily-ai-actions button {
  display: inline-flex;
  min-width: 0;
  min-height: 38px;
  width: 100%;
  border: 1px solid #e4eaf8;
  border-radius: 11px;
  padding: 7px 12px;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 950;
  line-height: 1.18;
  text-align: center;
  white-space: nowrap;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.replica-daily-ai-actions button:hover {
  transform: translateY(-1px);
}

.replica-daily-ai-primary {
  background: linear-gradient(90deg, #4d6dff, #767cff);
  color: #fff;
  box-shadow: 0 10px 20px rgba(83, 109, 255, 0.2);
}

.replica-daily-ai-secondary {
  background: #f8faff;
  color: #536dff;
}

.replica-goal-card {
  height: 284px;
  padding: 20px 25px 18px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 82% 18%, rgba(116, 133, 255, 0.13), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 252, 255, 0.96));
}

.replica-goal-head,
.replica-goal-body,
.replica-goal-head-actions,
.replica-goal-title {
  display: flex;
  align-items: center;
}

.replica-goal-head {
  justify-content: space-between;
}

.replica-goal-title {
  gap: 12px;
}

.replica-goal-title span {
  color: #536dff;
  font-size: 25px;
}

.replica-goal-title strong {
  color: #24304d;
  font-size: 21px;
  font-weight: 950;
}

.replica-goal-head-actions {
  gap: 9px;
}

.replica-goal-head-actions em {
  display: inline-flex;
  align-items: center;
  height: 27px;
  border: 1px solid #dfe7ff;
  border-radius: 999px;
  padding: 0 12px;
  background: #f5f7ff;
  color: #5d6eff;
  font-size: 13px;
  font-style: normal;
  font-weight: 950;
}

.replica-goal-head-actions em.is-empty {
  color: #8390ab;
}

.replica-goal-head-actions em.is-complete {
  border-color: #c8f0df;
  background: #effcf7;
  color: #17a86f;
}

.replica-goal-head-actions i {
  color: #8390ab;
  font-size: 28px;
  font-style: normal;
  line-height: 1;
}

.replica-goal-body {
  justify-content: space-between;
  margin-top: 12px;
}

.replica-goal-percent {
  color: #17213e;
  font-size: 38px;
  line-height: 1;
  font-weight: 950;
}

.replica-goal-body p {
  max-width: 215px;
  margin: 5px 0 0;
  color: #7785a3;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 850;
}

.replica-goal-ring {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(99, 116, 255, 0.16), 0 12px 24px rgba(86, 103, 180, 0.12);
}

.replica-goal-ring span {
  display: grid;
  place-items: center;
  width: 47px;
  height: 47px;
  border-radius: inherit;
  background: #fff;
  color: #32405f;
  font-size: 16px;
  font-weight: 950;
}

.replica-goal-track {
  height: 11px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef8;
}

.replica-goal-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4a6dff, #7e86ff);
  box-shadow: 0 0 14px rgba(91, 111, 255, 0.35);
}

.replica-goal-chip-list {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
  margin-top: 9px;
}

.replica-goal-chip {
  display: grid;
  gap: 2px;
  min-width: 0;
  border: 1px solid #e4eaff;
  border-radius: 10px;
  padding: 5px 4px 4px;
  background: #f9fbff;
  text-align: center;
}

.replica-goal-chip b {
  color: #31405f;
  font-size: 12px;
  font-weight: 950;
}

.replica-goal-chip i {
  color: #667594;
  font-size: 12px;
  font-style: normal;
  font-weight: 850;
}

.replica-goal-chip.is-muted {
  opacity: 0.46;
}

.replica-goal-chip.is-complete {
  border-color: #ccefe1;
  background: #f2fbf7;
}

.replica-goal-button {
  height: 34px;
  margin-top: 9px;
  border: 1px solid #dfe7ff;
  border-radius: 11px;
  padding: 0 18px;
  background: #f8faff;
  color: #536dff;
  font-size: 15px;
  font-weight: 950;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.replica-goal-button:hover {
  transform: translateY(-1px);
  border-color: #c8d3ff;
  background: #eef3ff;
}

.replica-goal-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 32px;
  background: rgba(28, 38, 70, 0.24);
  backdrop-filter: blur(10px);
}

.replica-goal-modal {
  width: min(720px, calc(100vw - 48px));
  border: 1px solid rgba(224, 231, 255, 0.96);
  border-radius: 28px;
  padding: 30px;
  background:
    radial-gradient(circle at 86% 8%, rgba(111, 128, 255, 0.14), transparent 30%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 30px 80px rgba(34, 49, 92, 0.24);
  color: #17213f;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
}

.replica-goal-modal header,
.replica-goal-modal footer,
.replica-goal-form-row,
.replica-goal-modal-summary {
  display: flex;
  align-items: center;
}

.replica-goal-modal header {
  justify-content: space-between;
  gap: 24px;
}

.replica-goal-modal h2 {
  margin: 0;
  color: #1a2544;
  font-size: 28px;
  line-height: 1.18;
  font-weight: 950;
}

.replica-goal-modal header p {
  margin: 8px 0 0;
  color: #7a87a3;
  font-size: 15px;
  font-weight: 750;
}

.replica-goal-modal-close {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid #e3eaff;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #7180a1;
}

.replica-goal-modal-close svg {
  width: 18px;
  height: 18px;
}

.replica-goal-modal-close path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2.2;
}

.replica-goal-form {
  display: grid;
  gap: 12px;
  margin-top: 22px;
}

.replica-goal-form-row {
  min-height: 64px;
  border: 1px solid #e6ecf8;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.86);
}

.replica-goal-form-badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  color: #fff;
  font-size: 14px;
  font-weight: 950;
  box-shadow: 0 10px 22px rgba(83, 109, 255, 0.16);
}

.replica-goal-form-row strong {
  flex: 1;
  min-width: 0;
  margin-left: 14px;
  color: #24304d;
  font-size: 17px;
  font-weight: 950;
}

.replica-goal-form-row small {
  display: block;
  margin-top: 4px;
  color: #8390aa;
  font-size: 13px;
  font-weight: 800;
}

.replica-goal-form-row input {
  width: 92px;
  height: 42px;
  border: 1px solid #dfe7ff;
  border-radius: 13px;
  background: #f9fbff;
  color: #1d2948;
  font-size: 18px;
  font-weight: 950;
  text-align: center;
  outline: none;
}

.replica-goal-form-row input:focus {
  border-color: #8fa0ff;
  box-shadow: 0 0 0 4px rgba(91, 111, 255, 0.12);
}

.replica-goal-form-row em {
  margin-left: 9px;
  color: #7684a1;
  font-size: 15px;
  font-style: normal;
  font-weight: 850;
}

.replica-goal-modal-summary {
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
  border: 1px solid #e2e9fb;
  border-radius: 18px;
  padding: 15px 18px;
  background: linear-gradient(90deg, rgba(241, 245, 255, 0.95), rgba(248, 251, 255, 0.95));
  color: #6f7d9b;
  font-size: 14px;
  font-weight: 850;
}

.replica-goal-modal-summary b {
  color: #24304d;
  font-size: 18px;
  font-weight: 950;
}

.replica-goal-modal footer {
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.replica-goal-modal footer button {
  height: 44px;
  border-radius: 13px;
  padding: 0 20px;
  font-size: 15px;
  font-weight: 950;
}

.replica-goal-modal-secondary,
.replica-goal-modal-clear {
  border: 1px solid #e2e9fb;
  background: #fff;
  color: #697794;
}

.replica-goal-modal-clear {
  color: #5366d9;
}

.replica-goal-modal-save {
  border: 0;
  background: linear-gradient(90deg, #4a6dff, #7c84ff);
  color: #fff;
  box-shadow: 0 14px 28px rgba(83, 109, 255, 0.24);
}

.replica-bottom-grid {
  position: absolute;
  left: 0;
  top: 925px;
  display: grid;
  grid-template-columns: 448px 515px 462px 598px;
  gap: 28px;
  width: 2107px;
}

.replica-bottom-grid .replica-card {
  height: 330px;
  padding: 21px 24px;
  border-radius: 17px;
}

.replica-bottom-title {
  justify-content: space-between;
}

.replica-bottom-title h3 {
  font-size: 19px;
}

.replica-bottom-title h3 span {
  color: #8996b2;
}

.replica-bottom-title--link a {
  color: #496aff;
  font-size: 14px;
  font-weight: 950;
  text-decoration: none;
}

.replica-heatmap-card {
  overflow: hidden;
}

.replica-heatmap {
  display: grid;
  gap: 8px;
  margin-top: 15px;
}

.replica-heatmap-days,
.replica-heatmap-row {
  display: grid;
  grid-template-columns: 44px repeat(7, 1fr);
  align-items: center;
  gap: 10px;
}

.replica-heatmap-days span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 31px;
  height: 22px;
  border-radius: 999px;
  color: #627091;
  font-size: 14px;
  font-weight: 950;
  text-align: center;
}

.replica-heatmap-days span.is-today {
  border: 1px solid #cbd4ff;
  background: #eef2ff;
  color: #4f63ff;
}

.replica-heatmap-row strong {
  color: #4f5d7e;
  font-size: 15px;
  font-weight: 950;
}

.replica-heatmap-row i {
  display: block;
  justify-self: center;
  width: 32px;
  height: 23px;
  border-radius: 8px;
  border: 1px solid #dfe5ff;
  background: #f6f7ff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.replica-heatmap-row i.is-today {
  border-color: #8796ff;
  box-shadow: 0 0 0 2px rgba(108, 124, 255, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.replica-heatmap-row i:hover {
  transform: translateY(-1px);
  border-color: #9eaaff;
}

.heat-0 {
  background: #f6f7ff;
}

.heat-1 {
  border-color: #cdd6ff;
  background: #e9edff;
}

.heat-2 {
  border-color: #b9c4ff;
  background: #cfd8ff;
}

.heat-3 {
  border-color: #9ca8ff;
  background: #aebaff;
}

.heat-4 {
  border-color: #7d8aff;
  background: #7685ff;
}

.replica-heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 11px;
  color: #8994ad;
  font-size: 13px;
  font-weight: 850;
}

.replica-heat-legend i {
  width: 24px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(109, 124, 255, 0.28);
}

.replica-bottom-foot {
  display: inline-flex;
  align-items: center;
  height: 28px;
  margin: 9px 0 0;
  border-radius: 7px;
  border: 1px solid #dce5ff;
  padding: 0 15px;
  background: #eef2ff;
  color: #586a9c;
  font-size: 14px;
  font-weight: 900;
}

.replica-score-chip {
  display: grid;
  place-items: center;
  width: 88px;
  height: 54px;
  border: 1px solid #e7ecf8;
  border-radius: 14px;
  background: #fff;
  color: #7986a2;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 850;
  text-align: center;
}

.replica-score-chip strong {
  color: #17213e;
  font-size: 20px;
  font-weight: 950;
}

.replica-trend-chart {
  width: 100%;
  height: 174px;
  margin-top: 8px;
  overflow: visible;
}

.replica-trend-chart text {
  fill: #74819f;
  font-size: 15px;
  font-weight: 800;
}

.trend-grid {
  stroke: #e9eef7;
  stroke-width: 2;
}

.trend-line {
  fill: none;
  stroke: #3869ff;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.replica-trend-chart circle {
  fill: #fff;
  stroke: #3869ff;
  stroke-width: 5;
}

.replica-trend-labels {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-left: 50px;
  margin-top: -7px;
  color: #7b88a3;
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
  column-gap: 4px;
}

.replica-trend-labels span {
  min-width: 0;
  text-align: center;
  white-space: nowrap;
}

.replica-trend-card .replica-bottom-foot {
  margin-top: 9px;
}

.replica-weak-list,
.replica-recent-list {
  display: grid;
  gap: 14px;
  margin-top: 21px;
}

.replica-weak-empty {
  display: grid;
  min-height: 205px;
  place-items: center;
  padding: 0 34px;
  color: #7d89a5;
  font-size: 16px;
  font-weight: 850;
  line-height: 1.8;
  text-align: center;
}

.replica-recent-empty {
  display: grid;
  min-height: 205px;
  place-items: center;
  padding: 0 34px;
  color: #7d89a5;
  font-size: 16px;
  font-weight: 850;
  line-height: 1.8;
  text-align: center;
}

.replica-weak-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  min-height: 84px;
  padding: 15px 17px;
  border: 1px solid #e9eef7;
  border-left: 2px solid var(--weak-accent, #ff6d35);
  border-radius: 16px;
  background:
    radial-gradient(circle at 9% 14%, rgba(116, 133, 255, 0.06), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 252, 255, 0.96));
  box-shadow: 0 10px 24px rgba(72, 94, 138, 0.05);
}

.replica-weak-rank {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 109, 53, 0.14);
  border-radius: 13px;
  background: #fff3ee;
  color: #ff6d35;
  font-size: 21px;
  font-weight: 950;
  line-height: 1;
  box-shadow: inset 0 -8px 15px rgba(255, 109, 53, 0.08);
}

.replica-weak-main {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.replica-weak-row strong {
  min-width: 0;
  overflow: hidden;
  color: #26304d;
  font-size: 15px;
  font-weight: 950;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-weak-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.replica-weak-meta em,
.replica-weak-meta i {
  font-size: 13px;
  font-style: normal;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}

.replica-weak-meta em {
  border-radius: 999px;
  padding: 4px 9px;
  background: #f4f7ff;
  color: #5365ca;
}

.replica-weak-meta i {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: #7c66ff;
  text-overflow: ellipsis;
}

.replica-weak-meta i::before {
  content: "";
  flex: 0 0 auto;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #d7deef;
}

.replica-weak-meta i.is-muted {
  color: #9aa6bb;
}

.replica-recent-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 15px;
  min-height: 82px;
  padding: 14px 16px;
  border: 1px solid #e8edf7;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 255, 0.96));
  box-shadow: 0 10px 24px rgba(72, 94, 138, 0.05);
}

.replica-recent-type {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  color: #fff;
  font-size: 13px;
  font-weight: 950;
  line-height: 1;
  box-shadow: inset 0 -10px 18px rgba(0, 0, 0, 0.08);
}

.replica-recent-main {
  display: grid;
  min-width: 0;
  gap: 9px;
}

.replica-recent-row strong {
  min-width: 0;
  overflow: hidden;
  color: #25304d;
  font-size: 15px;
  font-weight: 950;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-recent-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.replica-recent-meta em,
.replica-recent-meta time {
  color: #64728f;
  font-size: 13px;
  font-style: normal;
  font-weight: 850;
  line-height: 1.2;
  white-space: nowrap;
}

.replica-recent-meta em {
  max-width: 128px;
  overflow: hidden;
  border-radius: 999px;
  padding: 4px 9px;
  background: #f4f7ff;
  color: #5269d7;
  text-overflow: ellipsis;
}

.replica-recent-meta em.is-muted {
  background: #f7f9fd;
  color: #98a4b8;
}

.replica-recent-meta time {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  color: #8b97ad;
  text-overflow: ellipsis;
}

.replica-recent-meta time::before {
  content: "";
  flex: 0 0 auto;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #d7deef;
}

.replica-recent-row i {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #f7f9ff;
  color: #8a98b4;
  font-size: 21px;
  font-style: normal;
  font-weight: 800;
  line-height: 1;
}

/* Desktop responsive pass: keep the existing visual language but remove the
   fixed 2560x1399 scaled canvas so the page can use the available viewport. */
.home-replica-page {
  --desktop-shell-max: 1920px;
  --desktop-sidebar-width: clamp(224px, 14vw, 300px);
  --desktop-gutter: clamp(18px, 2vw, 40px);
  --desktop-card-gap: clamp(16px, 1.45vw, 28px);
  padding-bottom: max(32px, env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at 72% -8%, rgba(225, 231, 255, 0.82), transparent 26%),
    linear-gradient(180deg, #f9fbff 0%, #f6f9ff 48%, #f8fbff 100%);
}

.home-replica-scale-slot {
  width: min(100%, var(--desktop-shell-max));
  min-height: 100vh;
  margin: 0 auto;
}

.home-replica-canvas {
  width: 100%;
  height: auto;
  min-height: 100vh;
  transform: none;
  overflow: visible;
  grid-template-columns: var(--desktop-sidebar-width) minmax(0, 1fr);
  background: transparent;
}

.replica-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  height: auto;
  padding: clamp(24px, 2vw, 34px) clamp(16px, 1.45vw, 30px);
}

.replica-brand {
  gap: 14px;
  padding-left: clamp(4px, 1vw, 18px);
}

.replica-brand-mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
}

.replica-brand-mark::before {
  left: 12px;
  top: 11px;
  width: 17px;
  height: 22px;
  border-width: 9px;
}

.replica-brand-mark::after {
  right: 9px;
  bottom: 9px;
  width: 16px;
  height: 16px;
}

.replica-brand-text {
  font-size: 30px;
}

.replica-nav {
  gap: 12px;
  margin-top: clamp(34px, 5vh, 66px);
}

.replica-nav-item {
  width: 100%;
  height: 54px;
  gap: 14px;
  padding: 0 18px;
  font-size: 17px;
}

.replica-nav-icon {
  width: 24px;
  height: 24px;
  font-size: 18px;
}

.replica-resource-card {
  position: relative;
  left: auto;
  bottom: auto;
  width: 100%;
  height: auto;
  min-height: 214px;
  margin-top: auto;
  padding: 22px 20px;
}

.replica-resource-title {
  font-size: 18px;
}

.replica-resource-copy {
  margin-top: 12px;
  font-size: 14px;
}

.replica-resource-button {
  height: 40px;
  margin-top: 24px;
  padding: 0 18px;
  font-size: 14px;
}

.replica-gift {
  width: 78px;
  height: 74px;
}

.replica-main {
  min-width: 0;
  height: auto;
}

.replica-topbar {
  position: relative;
  inset: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 102px;
  height: auto;
  padding: 22px var(--desktop-gutter);
}

.replica-greeting,
.replica-top-actions {
  position: static;
}

.replica-greeting h1 {
  font-size: 25px;
}

.replica-greeting p {
  margin-top: 6px;
  font-size: 14px;
}

.replica-top-actions {
  gap: 18px;
}

.replica-profile {
  gap: 12px;
}

.replica-profile-avatar {
  width: 44px;
  height: 44px;
  font-size: 17px;
}

.replica-profile strong {
  max-width: 150px;
  font-size: 16px;
}

.replica-content {
  position: relative;
  left: auto;
  top: auto;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  gap: var(--desktop-card-gap);
  width: 100%;
  height: auto;
  padding: var(--desktop-gutter);
}

.replica-left-column,
.replica-right-column {
  position: static;
  display: grid;
  gap: var(--desktop-card-gap);
  width: auto;
  min-width: 0;
}

.replica-hero {
  width: 100%;
  height: auto;
  min-height: 520px;
  border-radius: 20px;
  background-size: cover;
}

.replica-hero-copy {
  left: 32px;
  top: 34px;
  width: min(56%, 520px);
}

.replica-hero-copy h2 {
  font-size: 38px;
}

.replica-hero-copy > p {
  margin-top: 14px;
  font-size: 17px;
}

.replica-focus-card {
  width: min(100%, 500px);
  height: auto;
  min-height: 204px;
  margin-top: 16px;
  padding: 22px 24px;
}

.replica-focus-card h3 {
  gap: 10px;
  margin-bottom: 16px;
  font-size: 18px;
}

.replica-focus-row {
  grid-template-columns: 20px minmax(120px, 1fr) minmax(90px, 0.85fr) 42px;
  gap: 10px;
  height: 34px;
  font-size: 14px;
}

.replica-stat-grid {
  left: 24px;
  right: 24px;
  bottom: 24px;
  gap: 16px;
}

.replica-stat-card {
  gap: 14px;
  height: auto;
  min-height: 128px;
  padding: 20px 18px;
}

.replica-stat-icon {
  width: 38px;
  height: 38px;
  margin-top: 16px;
  font-size: 20px;
}

.replica-stat-card > div {
  transform: translateY(-6px);
}

.replica-stat-card p,
.replica-stat-card small,
.replica-stat-card em {
  font-size: 13px;
}

.replica-stat-card strong {
  margin-top: 8px;
  font-size: 30px;
}

.replica-quick-card {
  width: 100%;
  height: auto;
  min-height: 214px;
  margin-top: 0;
  padding: 22px;
}

.replica-quick-grid {
  grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
  gap: 14px;
  margin-top: 20px;
}

.replica-quick-item {
  grid-template-columns: 38px minmax(0, 1fr) 12px;
  height: 126px;
  gap: 9px;
}

.replica-quick-icon {
  width: 38px;
  height: 38px;
  font-size: 17px;
}

.replica-quick-item strong {
  font-size: 18px;
}

.replica-quick-item p {
  margin-top: 10px;
  font-size: 13px;
}

.replica-quick-item em {
  font-size: 24px;
}

.replica-ai-card {
  height: auto;
  min-height: 500px;
  padding: 24px;
}

.replica-section-head {
  gap: 16px;
}

.replica-section-head h3,
.replica-bottom-title h3 {
  font-size: 20px;
}

.replica-section-head h3 span {
  font-size: 28px;
}

.replica-section-head h3 small {
  font-size: 13px;
}

.replica-section-head button {
  height: 42px;
  padding: 0 16px;
  font-size: 14px;
}

.replica-suggestion {
  height: auto;
  min-height: 58px;
  margin-top: 18px;
  padding: 13px 18px;
}

.replica-suggestion strong,
.replica-chat-bubble p {
  font-size: 14px;
}

.replica-chat-list {
  gap: 12px;
  margin-top: 18px;
}

.replica-chat-row {
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
}

.replica-chat-row img {
  width: 38px;
  height: 38px;
}

.replica-chat-bubble {
  width: 100%;
  min-height: 86px;
  padding: 14px 16px 10px;
}

.replica-ai-actions {
  gap: 12px;
  margin-top: 22px;
}

.replica-ai-actions button {
  height: 58px;
  font-size: 14px;
}

.replica-side-card-grid {
  gap: var(--desktop-card-gap);
  margin-top: 0;
}

.replica-mini-card,
.replica-goal-card {
  height: auto;
  min-height: 248px;
  padding: 22px;
}

.replica-mini-title strong,
.replica-goal-title strong {
  font-size: 18px;
}

.replica-daily-ai-headline {
  font-size: 18px;
}

.replica-goal-body p {
  max-width: 190px;
}

.replica-goal-chip-list {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.replica-bottom-grid {
  position: static;
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--desktop-card-gap);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.replica-bottom-grid .replica-card {
  height: auto;
  min-height: 300px;
  min-width: 0;
  padding: 20px;
}

.replica-heatmap-row i {
  width: min(32px, 100%);
}

.replica-trend-chart {
  height: 168px;
}

.replica-weak-row {
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 13px;
  min-height: 82px;
  height: auto;
  padding: 14px 15px;
}

.replica-recent-row {
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  gap: 12px;
  min-height: 80px;
  height: auto;
  padding: 13px 14px;
}

@media (max-width: 1700px) {
  .home-replica-page {
    --desktop-shell-max: 100%;
  }

  .replica-bottom-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1320px) {
  .home-replica-page {
    --desktop-sidebar-width: 220px;
    --desktop-gutter: 18px;
    --desktop-card-gap: 16px;
  }

  .replica-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .replica-right-column {
    grid-template-columns: minmax(0, 1fr);
  }

  .replica-side-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .replica-hero {
    min-height: 500px;
  }
}

@media (max-width: 1120px) {
  .home-replica-page {
    --desktop-sidebar-width: 204px;
  }

  .replica-sidebar {
    padding-left: 14px;
    padding-right: 14px;
  }

  .replica-nav-item {
    padding: 0 14px;
    font-size: 15px;
  }

  .replica-brand-text {
    font-size: 26px;
  }

  .replica-topbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }

  .replica-hero {
    display: grid;
    min-height: 0;
    padding: 24px;
    background-position: center top;
  }

  .replica-hero-copy {
    position: relative;
    left: auto;
    top: auto;
    width: 100%;
  }

  .replica-hero-copy h2 {
    font-size: 34px;
    white-space: normal;
  }

  .replica-focus-card {
    width: min(100%, 560px);
  }

  .replica-stat-grid {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 22px;
  }

  .replica-stat-card {
    min-height: 118px;
  }

  .replica-bottom-grid,
  .replica-side-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Warm workbench redesign: keeps the existing data/route bindings, replaces only the desktop visual system. */
.home-replica-page {
  --warm-page: #ede8df;
  --warm-shell: #e6dfd4;
  --warm-surface: #f8f1e6;
  --warm-surface-strong: #fbf7ef;
  --warm-card: #fffaf1;
  --warm-card-soft: #f4ecdf;
  --warm-line: #d9d0bf;
  --warm-line-soft: rgba(137, 112, 82, 0.16);
  --warm-ink: #2f281f;
  --warm-muted: #8d8272;
  --warm-soft: #b6aa98;
  --warm-brown: #8a6845;
  --warm-brown-dark: #6f5033;
  --warm-green: #6d8f72;
  --warm-shadow: 0 18px 42px rgba(110, 87, 57, 0.08);
  --warm-shadow-soft: 0 10px 24px rgba(110, 87, 57, 0.06);
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background:
    radial-gradient(circle at 78% 8%, rgba(255, 250, 241, 0.9), transparent 30%),
    linear-gradient(180deg, #f0eadf 0%, var(--warm-page) 46%, #e8e1d6 100%) !important;
  color: var(--warm-ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
}

.home-replica-scale-slot {
  width: 100% !important;
  min-height: 100vh !important;
  height: auto !important;
  margin: 0 !important;
  transform: none !important;
}

.home-replica-canvas {
  display: grid !important;
  grid-template-columns: 204px minmax(0, 1fr) !important;
  align-items: stretch !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  min-height: 100vh !important;
  height: auto !important;
  margin: 0 !important;
  overflow: visible !important;
  background: transparent !important;
  box-shadow: none !important;
}

.replica-sidebar {
  position: sticky !important;
  top: 0 !important;
  left: auto !important;
  width: auto !important;
  min-width: 0 !important;
  height: 100vh !important;
  padding: 22px 12px 18px !important;
  background: rgba(225, 218, 206, 0.88) !important;
  border-right: 1px solid var(--warm-line) !important;
  box-shadow: none !important;
  color: var(--warm-muted) !important;
  backdrop-filter: blur(10px);
}

.replica-brand {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  width: 100% !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 6px 24px !important;
  border-bottom: 1px solid rgba(137, 112, 82, 0.08) !important;
}

.replica-brand-mark {
  position: relative !important;
  width: 32px !important;
  height: 32px !important;
  border-radius: 9px !important;
  background: var(--warm-brown) !important;
  box-shadow: none !important;
}

.replica-brand-mark::before {
  content: "" !important;
  position: absolute !important;
  left: 9px !important;
  top: 9px !important;
  display: block !important;
  width: 5px !important;
  height: 5px !important;
  border-radius: 2px !important;
  background: rgba(255, 250, 241, 0.82) !important;
  box-shadow:
    9px 0 0 rgba(255, 250, 241, 0.82),
    0 9px 0 rgba(255, 250, 241, 0.82),
    9px 9px 0 rgba(255, 250, 241, 0.82) !important;
}

.replica-brand-mark::after {
  display: none !important;
}

.replica-brand-text {
  color: #251f18 !important;
  font-size: 22px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  letter-spacing: 0 !important;
}

.replica-nav {
  display: grid !important;
  gap: 10px !important;
  width: 100% !important;
  margin: 30px 0 0 !important;
  padding: 0 !important;
}

.replica-nav-item {
  display: grid !important;
  grid-template-columns: 18px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 12px !important;
  width: 100% !important;
  min-height: 42px !important;
  height: 42px !important;
  padding: 0 12px !important;
  border: 1px solid transparent !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: #948a7a !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  text-align: left !important;
  box-shadow: none !important;
  cursor: pointer !important;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.replica-nav-item:hover {
  background: rgba(255, 250, 241, 0.44) !important;
  color: #70583e !important;
}

.replica-nav-item--active {
  background: #d8cab4 !important;
  border-color: #cbbda7 !important;
  color: var(--warm-brown-dark) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 250, 241, 0.34) !important;
}

.replica-nav-item::before,
.replica-nav-item::after {
  display: none !important;
}

.replica-nav-icon {
  display: block !important;
  width: 14px !important;
  height: 14px !important;
  border-radius: 4px !important;
  background: currentColor !important;
  color: inherit !important;
  opacity: 0.22 !important;
  font-size: 0 !important;
  line-height: 0 !important;
}

.replica-nav-item--active .replica-nav-icon {
  opacity: 1 !important;
}

.replica-resource-card {
  position: absolute !important;
  left: 12px !important;
  right: 12px !important;
  bottom: 18px !important;
  width: auto !important;
  min-height: 96px !important;
  height: auto !important;
  padding: 14px 12px !important;
  border: 1px solid #d1c4ae !important;
  border-radius: 9px !important;
  background: rgba(214, 202, 181, 0.72) !important;
  box-shadow: none !important;
}

.replica-resource-title {
  margin: 0 !important;
  color: #755c3e !important;
  font-size: 13px !important;
  font-weight: 700 !important;
}

.replica-resource-copy {
  margin: 7px 0 12px !important;
  color: #9a8d79 !important;
  font-size: 11px !important;
}

.replica-resource-button {
  min-width: 68px !important;
  height: 28px !important;
  padding: 0 12px !important;
  border: 0 !important;
  border-radius: 6px !important;
  background: var(--warm-brown) !important;
  color: #fff7ec !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  box-shadow: none !important;
}

.replica-gift {
  display: none !important;
}

.replica-main {
  position: relative !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 100vh !important;
  height: auto !important;
  overflow: visible !important;
  background: rgba(239, 234, 224, 0.64) !important;
}

.replica-topbar {
  position: sticky !important;
  top: 0 !important;
  z-index: 20 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  height: 52px !important;
  min-height: 52px !important;
  padding: 0 28px !important;
  border-bottom: 1px solid var(--warm-line) !important;
  background: rgba(225, 218, 206, 0.82) !important;
  box-shadow: none !important;
  backdrop-filter: blur(12px);
}

.replica-greeting {
  position: static !important;
  width: auto !important;
  min-width: 0 !important;
}

.replica-greeting h1 {
  margin: 0 !important;
  color: #9e8f7c !important;
  font-size: 11px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  letter-spacing: 0.14em !important;
  text-transform: uppercase !important;
}

.replica-greeting h1 span {
  display: none !important;
}

.replica-greeting p {
  display: none !important;
}

.replica-top-actions {
  position: static !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}

.replica-profile {
  display: flex !important;
  align-items: center !important;
  gap: 9px !important;
  min-width: 0 !important;
  height: 34px !important;
  padding: 0 12px 0 6px !important;
  border: 1px solid rgba(137, 112, 82, 0.16) !important;
  border-radius: 999px !important;
  background: rgba(255, 250, 241, 0.58) !important;
  color: #6f6251 !important;
  box-shadow: none !important;
}

.replica-profile-avatar {
  width: 24px !important;
  height: 24px !important;
  border-radius: 50% !important;
  background: #d8cab4 !important;
  color: var(--warm-brown-dark) !important;
  font-size: 12px !important;
  font-weight: 800 !important;
}

.replica-profile strong {
  color: #7c705f !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}

.replica-profile-chevron {
  width: 14px !important;
  height: 14px !important;
  stroke: #9b8f7d !important;
}

.replica-content {
  position: static !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1.42fr) minmax(340px, 0.86fr) !important;
  gap: 18px !important;
  width: min(100%, 1680px) !important;
  max-width: 1680px !important;
  min-width: 0 !important;
  height: auto !important;
  margin: 0 auto !important;
  padding: 24px 28px 34px !important;
}

.replica-left-column,
.replica-right-column {
  position: static !important;
  display: grid !important;
  grid-auto-rows: max-content !important;
  gap: 18px !important;
  width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
}

.replica-right-column {
  grid-template-columns: minmax(0, 1fr) !important;
}

.replica-card,
.replica-hero,
.replica-focus-card,
.replica-chat-bubble,
.replica-suggestion {
  border: 1px solid var(--warm-line-soft) !important;
  background: rgba(255, 250, 241, 0.78) !important;
  color: var(--warm-ink) !important;
  box-shadow: var(--warm-shadow-soft) !important;
}

.replica-card {
  width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
  border-radius: 12px !important;
}

.replica-hero {
  position: relative !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 0.78fr) !important;
  gap: 20px !important;
  align-items: stretch !important;
  min-height: 430px !important;
  height: auto !important;
  padding: 26px !important;
  overflow: hidden !important;
  border-radius: 14px !important;
  background:
    linear-gradient(135deg, rgba(255, 250, 241, 0.88) 0%, rgba(246, 238, 225, 0.92) 54%, rgba(232, 222, 206, 0.72) 100%) !important;
}

.replica-hero::before,
.replica-hero::after {
  display: none !important;
}

.replica-hero-copy {
  position: static !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  width: 100% !important;
  min-width: 0 !important;
}

.replica-hero-copy h2 {
  max-width: 560px !important;
  margin: 0 !important;
  color: #2b241d !important;
  font-size: clamp(32px, 2.6vw, 48px) !important;
  font-weight: 760 !important;
  line-height: 1.06 !important;
  letter-spacing: 0 !important;
  white-space: normal !important;
}

.replica-hero-copy h2 span {
  color: var(--warm-brown) !important;
}

.replica-hero-copy p {
  max-width: 500px !important;
  margin: 14px 0 0 !important;
  color: #817565 !important;
  font-size: 14px !important;
  line-height: 1.65 !important;
}

.replica-focus-card {
  width: min(100%, 520px) !important;
  height: auto !important;
  min-height: 0 !important;
  margin-top: 26px !important;
  padding: 18px !important;
  border-radius: 12px !important;
  background: rgba(248, 241, 230, 0.84) !important;
}

.replica-focus-card h3 {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 0 14px !important;
  color: #3d3328 !important;
  font-size: 15px !important;
  font-weight: 800 !important;
}

.replica-focus-card h3 span,
.replica-section-head h3 span,
.replica-mini-title span,
.replica-goal-title span,
.replica-bottom-title h3 span {
  color: var(--warm-brown) !important;
  font-size: 14px !important;
}

.replica-focus-row {
  display: grid !important;
  grid-template-columns: 22px minmax(88px, 0.52fr) minmax(120px, 1fr) auto !important;
  align-items: center !important;
  gap: 10px !important;
  min-height: 36px !important;
  padding: 8px 0 !important;
  border-top: 1px solid rgba(137, 112, 82, 0.09) !important;
}

.replica-focus-row:first-of-type {
  border-top: 0 !important;
}

.replica-check {
  display: grid !important;
  place-items: center !important;
  width: 22px !important;
  height: 22px !important;
  border-radius: 50% !important;
  background: rgba(109, 143, 114, 0.18) !important;
  color: #527456 !important;
  font-size: 12px !important;
  font-weight: 800 !important;
}

.replica-focus-row strong {
  min-width: 0 !important;
  color: #514537 !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.replica-progress {
  width: 100% !important;
  height: 6px !important;
  border-radius: 999px !important;
  background: #e5dccd !important;
  overflow: hidden !important;
}

.replica-progress b {
  display: block !important;
  height: 100% !important;
  border-radius: inherit !important;
  background: linear-gradient(90deg, var(--warm-brown), #b08a5a) !important;
}

.replica-focus-row em {
  color: #8f826f !important;
  font-size: 12px !important;
  font-style: normal !important;
  font-weight: 700 !important;
  white-space: nowrap !important;
}

.replica-stat-grid {
  position: static !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 12px !important;
  width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
}

.replica-stat-card {
  display: grid !important;
  grid-template-columns: 42px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 12px !important;
  min-height: 112px !important;
  height: auto !important;
  padding: 16px !important;
  border: 1px solid rgba(137, 112, 82, 0.14) !important;
  border-radius: 12px !important;
  background: rgba(255, 250, 241, 0.68) !important;
  box-shadow: none !important;
}

.replica-stat-icon,
.replica-quick-icon {
  display: grid !important;
  place-items: center !important;
  border-radius: 10px !important;
  color: #fff8ed !important;
  box-shadow: none !important;
}

.replica-stat-icon {
  width: 42px !important;
  height: 42px !important;
  font-size: 16px !important;
}

.replica-stat-card p {
  margin: 0 !important;
  color: var(--warm-muted) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}

.replica-stat-card strong {
  display: block !important;
  margin-top: 6px !important;
  color: #2f281f !important;
  font-size: 29px !important;
  font-weight: 760 !important;
  line-height: 1 !important;
  letter-spacing: 0 !important;
}

.replica-stat-card small {
  color: #867865 !important;
  font-size: 13px !important;
  font-weight: 700 !important;
}

.replica-stat-card em {
  display: block !important;
  margin-top: 8px !important;
  color: #9b8c78 !important;
  font-size: 12px !important;
  font-style: normal !important;
  line-height: 1.35 !important;
}

.replica-quick-card,
.replica-ai-card,
.replica-mini-card,
.replica-goal-card,
.replica-bottom-grid .replica-card {
  padding: 20px !important;
  background: rgba(255, 250, 241, 0.72) !important;
}

.replica-quick-card h3,
.replica-section-head h3,
.replica-bottom-title h3,
.replica-mini-title strong,
.replica-goal-title strong {
  margin: 0 !important;
  color: #3a3127 !important;
  font-size: 16px !important;
  font-weight: 780 !important;
  line-height: 1.25 !important;
  letter-spacing: 0 !important;
}

.replica-quick-grid {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 12px !important;
  margin-top: 16px !important;
}

.replica-quick-item {
  position: relative !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  align-content: start !important;
  align-items: start !important;
  gap: 9px !important;
  min-height: 118px !important;
  height: auto !important;
  padding: 14px !important;
  border: 1px solid rgba(137, 112, 82, 0.14) !important;
  border-radius: 11px !important;
  background: rgba(248, 241, 230, 0.72) !important;
  box-shadow: none !important;
  cursor: pointer !important;
}

.replica-quick-item:hover {
  background: #fffaf1 !important;
  border-color: rgba(138, 104, 69, 0.28) !important;
  transform: translateY(-1px);
}

.replica-quick-icon {
  width: 40px !important;
  height: 40px !important;
  font-size: 15px !important;
}

.replica-quick-item strong {
  display: block !important;
  color: #342b22 !important;
  font-size: 15px !important;
  font-weight: 800 !important;
  line-height: 1.15 !important;
}

.replica-quick-item p {
  margin: 6px 0 0 !important;
  color: var(--warm-muted) !important;
  font-size: 12px !important;
  line-height: 1.35 !important;
  white-space: pre-line !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
}

.replica-quick-item em {
  position: absolute !important;
  top: 14px !important;
  right: 14px !important;
  color: #b8ac9a !important;
  font-size: 18px !important;
  font-style: normal !important;
}

.replica-ai-card {
  min-height: 430px !important;
  height: auto !important;
  border-radius: 12px !important;
}

.replica-section-head,
.replica-bottom-title,
.replica-goal-head,
.replica-mini-title {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
}

.replica-section-head h3 small {
  color: var(--warm-muted) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

.replica-section-head button {
  height: 34px !important;
  padding: 0 13px !important;
  border: 1px solid rgba(138, 104, 69, 0.18) !important;
  border-radius: 999px !important;
  background: rgba(244, 236, 223, 0.82) !important;
  color: var(--warm-brown-dark) !important;
  font-size: 12px !important;
  font-weight: 750 !important;
  box-shadow: none !important;
}

.replica-suggestion {
  display: grid !important;
  grid-template-columns: 28px minmax(0, 1fr) !important;
  align-items: center !important;
  gap: 10px !important;
  min-height: 52px !important;
  height: auto !important;
  margin-top: 18px !important;
  padding: 12px 14px !important;
  border-radius: 11px !important;
  background: rgba(244, 236, 223, 0.72) !important;
}

.replica-suggestion span {
  display: grid !important;
  place-items: center !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  background: rgba(109, 143, 114, 0.16) !important;
  color: #597a5d !important;
  font-size: 13px !important;
}

.replica-suggestion strong,
.replica-chat-bubble p {
  color: #4e4234 !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
}

.replica-chat-list {
  display: grid !important;
  gap: 12px !important;
  margin-top: 16px !important;
}

.replica-chat-row {
  display: grid !important;
  grid-template-columns: 34px minmax(0, 1fr) !important;
  gap: 10px !important;
  align-items: start !important;
}

.replica-chat-row img {
  width: 34px !important;
  height: 34px !important;
  border-radius: 50% !important;
  filter: sepia(0.16) saturate(0.75) brightness(0.96) !important;
}

.replica-chat-bubble {
  width: 100% !important;
  min-height: 82px !important;
  padding: 12px 14px !important;
  border-radius: 11px !important;
  background: rgba(255, 250, 241, 0.66) !important;
}

.replica-chat-bubble time {
  display: block !important;
  margin-top: 8px !important;
  color: #aa9c88 !important;
  font-size: 11px !important;
}

.replica-ai-actions {
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  gap: 10px !important;
  margin-top: 18px !important;
}

.replica-ai-actions button,
.replica-daily-ai-primary,
.replica-daily-ai-secondary,
.replica-goal-button,
.replica-goal-modal-secondary,
.replica-goal-modal-clear,
.replica-goal-modal-save {
  border-radius: 9px !important;
  border: 1px solid rgba(138, 104, 69, 0.18) !important;
  box-shadow: none !important;
  font-weight: 750 !important;
}

.replica-ai-actions button {
  min-height: 48px !important;
  height: auto !important;
  padding: 10px 12px !important;
  background: rgba(244, 236, 223, 0.72) !important;
  color: #6e573b !important;
  font-size: 12px !important;
  line-height: 1.35 !important;
}

.replica-ai-actions button span {
  color: var(--warm-brown) !important;
}

.replica-side-card-grid {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 18px !important;
  margin: 0 !important;
}

.replica-mini-card,
.replica-goal-card {
  min-height: 238px !important;
  border-radius: 12px !important;
}

.replica-mini-title em,
.replica-goal-head-actions em {
  padding: 4px 9px !important;
  border-radius: 999px !important;
  background: rgba(109, 143, 114, 0.14) !important;
  color: #5d7b61 !important;
  font-size: 11px !important;
  font-style: normal !important;
  font-weight: 750 !important;
}

.replica-daily-ai-headline {
  margin: 16px 0 0 !important;
  color: #332b22 !important;
  font-size: 17px !important;
  font-weight: 800 !important;
  line-height: 1.36 !important;
}

.replica-daily-ai-reason,
.replica-daily-ai-advice {
  color: #817461 !important;
  font-size: 12px !important;
  line-height: 1.58 !important;
}

.replica-daily-ai-advice {
  margin-bottom: 0 !important;
}

.replica-daily-ai-bottom {
  display: grid !important;
  gap: 12px !important;
  margin-top: 14px !important;
}

.replica-daily-ai-pills {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 7px !important;
}

.replica-daily-ai-pills span,
.replica-goal-chip {
  border: 1px solid rgba(138, 104, 69, 0.14) !important;
  border-radius: 999px !important;
  background: rgba(244, 236, 223, 0.74) !important;
  color: #725b3e !important;
  font-size: 11px !important;
  font-weight: 750 !important;
}

.replica-daily-ai-meta time {
  display: block !important;
  margin-top: 8px !important;
  color: #aa9c88 !important;
  font-size: 11px !important;
}

.replica-daily-ai-actions {
  display: flex !important;
  gap: 9px !important;
}

.replica-daily-ai-primary,
.replica-goal-button,
.replica-goal-modal-save {
  min-height: 34px !important;
  padding: 0 14px !important;
  background: var(--warm-brown) !important;
  color: #fff8ec !important;
}

.replica-daily-ai-secondary,
.replica-goal-modal-secondary,
.replica-goal-modal-clear {
  min-height: 34px !important;
  padding: 0 14px !important;
  background: rgba(255, 250, 241, 0.74) !important;
  color: #725b3e !important;
}

.replica-goal-body {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 18px !important;
  margin-top: 18px !important;
}

.replica-goal-percent {
  color: #312820 !important;
  font-size: 42px !important;
  font-weight: 780 !important;
  line-height: 1 !important;
}

.replica-goal-body p {
  margin-top: 8px !important;
  color: var(--warm-muted) !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

.replica-goal-ring {
  width: 86px !important;
  height: 86px !important;
  border-radius: 50% !important;
  box-shadow: inset 0 0 0 8px rgba(255, 250, 241, 0.68) !important;
}

.replica-goal-ring span {
  color: var(--warm-brown-dark) !important;
  background: #fffaf1 !important;
}

.replica-goal-track {
  height: 7px !important;
  margin: 18px 0 14px !important;
  border-radius: 999px !important;
  background: #e5dccd !important;
  overflow: hidden !important;
}

.replica-goal-track span {
  display: block !important;
  height: 100% !important;
  border-radius: inherit !important;
  background: linear-gradient(90deg, var(--warm-brown), #ad8758) !important;
}

.replica-goal-chip-list {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 7px !important;
}

.replica-goal-chip {
  display: grid !important;
  gap: 3px !important;
  padding: 7px 4px !important;
  text-align: center !important;
}

.replica-goal-chip.is-muted {
  opacity: 0.56 !important;
}

.replica-goal-chip.is-complete {
  background: rgba(109, 143, 114, 0.14) !important;
  color: #58775a !important;
}

.replica-goal-button {
  width: 100% !important;
  margin-top: 14px !important;
}

.replica-bottom-grid {
  position: static !important;
  grid-column: 1 / -1 !important;
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 18px !important;
  width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
}

.replica-bottom-grid .replica-card {
  min-height: 300px !important;
  height: auto !important;
}

.replica-bottom-foot {
  margin: 14px 0 0 !important;
  color: #9c8f7b !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

.replica-heatmap {
  margin-top: 16px !important;
}

.replica-heatmap-days,
.replica-heatmap-row {
  display: grid !important;
  grid-template-columns: 34px repeat(7, minmax(18px, 1fr)) !important;
  gap: 7px !important;
  align-items: center !important;
}

.replica-heatmap-days span,
.replica-heatmap-row strong {
  color: #9a8d79 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}

.replica-heatmap-row {
  margin-top: 8px !important;
}

.replica-heatmap-row i,
.replica-heat-legend i {
  border: 1px solid rgba(137, 112, 82, 0.1) !important;
  border-radius: 6px !important;
  background: #ece4d8 !important;
}

.replica-heatmap-row i {
  width: 100% !important;
  height: 24px !important;
}

.replica-heatmap-row i.heat-1,
.replica-heat-legend i.heat-1 {
  background: #e7ddcd !important;
}

.replica-heatmap-row i.heat-2,
.replica-heat-legend i.heat-2 {
  background: #d7c6ad !important;
}

.replica-heatmap-row i.heat-3,
.replica-heat-legend i.heat-3 {
  background: #b99467 !important;
}

.replica-heatmap-row i.heat-4,
.replica-heat-legend i.heat-4 {
  background: #89643f !important;
}

.replica-heatmap-row i.is-today,
.replica-heatmap-days .is-today {
  outline: 2px solid rgba(138, 104, 69, 0.3) !important;
  outline-offset: 2px !important;
}

.replica-heat-legend {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin-top: 15px !important;
  color: #9b8e7b !important;
  font-size: 11px !important;
}

.replica-trend-chart {
  width: 100% !important;
  height: 170px !important;
  margin-top: 10px !important;
}

.replica-trend-chart .trend-grid {
  stroke: rgba(137, 112, 82, 0.13) !important;
}

.replica-trend-chart text {
  fill: #9c8f7b !important;
  font-size: 11px !important;
}

.replica-trend-chart .trend-line {
  stroke: var(--warm-brown) !important;
  stroke-width: 3 !important;
}

.replica-trend-chart circle {
  fill: #fffaf1 !important;
  stroke: var(--warm-brown) !important;
  stroke-width: 3 !important;
}

.trend-empty-state {
  fill: #9c8f7b !important;
}

.replica-trend-labels {
  display: grid !important;
  grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
  gap: 2px !important;
  margin: 4px 0 0 38px !important;
}

.replica-trend-labels span {
  color: #9c8f7b !important;
  font-size: 11px !important;
  line-height: 1 !important;
  text-align: center !important;
  white-space: nowrap !important;
}

.replica-score-chip {
  min-width: 78px !important;
  padding: 6px 10px !important;
  border-radius: 999px !important;
  background: rgba(244, 236, 223, 0.78) !important;
  color: #7a664a !important;
  font-size: 10px !important;
  line-height: 1.25 !important;
  text-align: right !important;
}

.replica-score-chip strong {
  color: #3b3025 !important;
  font-size: 15px !important;
}

.replica-weak-list,
.replica-recent-list {
  display: grid !important;
  gap: 10px !important;
  margin-top: 16px !important;
}

.replica-weak-row,
.replica-recent-row {
  min-height: 72px !important;
  height: auto !important;
  padding: 12px !important;
  border: 1px solid rgba(137, 112, 82, 0.12) !important;
  border-radius: 11px !important;
  background: rgba(248, 241, 230, 0.66) !important;
  box-shadow: none !important;
}

.replica-weak-row {
  display: grid !important;
  grid-template-columns: 34px minmax(0, 1fr) !important;
  gap: 11px !important;
  border-left: 3px solid var(--weak-accent, var(--warm-brown)) !important;
}

.replica-weak-rank {
  display: grid !important;
  place-items: center !important;
  width: 34px !important;
  height: 34px !important;
  border-radius: 50% !important;
  background: rgba(138, 104, 69, 0.14) !important;
  color: var(--warm-brown-dark) !important;
  font-size: 13px !important;
  font-weight: 800 !important;
}

.replica-weak-main strong,
.replica-recent-main strong {
  color: #3a3127 !important;
  font-size: 13px !important;
  font-weight: 780 !important;
  line-height: 1.35 !important;
}

.replica-weak-meta,
.replica-recent-meta {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  margin-top: 7px !important;
}

.replica-weak-meta em,
.replica-weak-meta i,
.replica-recent-meta em,
.replica-recent-meta time {
  color: #8d806d !important;
  font-size: 11px !important;
  font-style: normal !important;
}

.replica-weak-empty,
.replica-recent-empty {
  margin-top: 16px !important;
  padding: 16px !important;
  border: 1px dashed rgba(137, 112, 82, 0.2) !important;
  border-radius: 11px !important;
  background: rgba(244, 236, 223, 0.58) !important;
  color: #918471 !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}

.replica-recent-row {
  display: grid !important;
  grid-template-columns: 42px minmax(0, 1fr) 14px !important;
  gap: 10px !important;
  align-items: center !important;
}

.replica-recent-type {
  display: grid !important;
  place-items: center !important;
  width: 42px !important;
  height: 42px !important;
  border-radius: 10px !important;
  color: #fff8ed !important;
  font-size: 12px !important;
  font-weight: 800 !important;
}

.replica-recent-row > i {
  color: #b6aa98 !important;
  font-style: normal !important;
}

.replica-goal-modal-layer {
  background: rgba(56, 47, 37, 0.28) !important;
  backdrop-filter: blur(12px) !important;
}

.replica-goal-modal {
  border: 1px solid rgba(137, 112, 82, 0.18) !important;
  border-radius: 18px !important;
  background: #fffaf1 !important;
  color: var(--warm-ink) !important;
  box-shadow: var(--warm-shadow) !important;
}

.replica-goal-modal h2 {
  color: #342b22 !important;
}

.replica-goal-modal p,
.replica-goal-modal-summary,
.replica-goal-form-row strong small {
  color: var(--warm-muted) !important;
}

.replica-goal-form-row {
  border: 1px solid rgba(137, 112, 82, 0.14) !important;
  background: rgba(248, 241, 230, 0.72) !important;
}

.replica-goal-form-row input {
  border-color: rgba(137, 112, 82, 0.2) !important;
  background: #fffaf1 !important;
  color: #342b22 !important;
}

@media (min-width: 1800px) {
  .home-replica-canvas {
    grid-template-columns: 220px minmax(0, 1fr) !important;
  }

  .replica-content {
    gap: 22px !important;
    padding: 28px 34px 40px !important;
  }

  .replica-left-column,
  .replica-right-column,
  .replica-side-card-grid,
  .replica-bottom-grid {
    gap: 22px !important;
  }

  .replica-hero {
    min-height: 470px !important;
  }
}

@media (max-width: 1700px) {
  .replica-bottom-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 1320px) {
  .home-replica-canvas {
    grid-template-columns: 198px minmax(0, 1fr) !important;
  }

  .replica-content {
    grid-template-columns: minmax(0, 1.44fr) minmax(326px, 0.84fr) !important;
    gap: 16px !important;
    padding: 20px 20px 30px !important;
  }

  .replica-left-column,
  .replica-right-column,
  .replica-side-card-grid {
    gap: 16px !important;
  }

  .replica-hero {
    min-height: 414px !important;
    padding: 22px !important;
  }

  .replica-quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .replica-stat-card {
    min-height: 102px !important;
    padding: 14px !important;
  }

  .replica-ai-actions {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}

@media (max-width: 1120px) {
  .home-replica-canvas {
    grid-template-columns: 190px minmax(0, 1fr) !important;
  }

  .replica-content {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .replica-hero {
    grid-template-columns: minmax(0, 1fr) !important;
    min-height: 0 !important;
  }

  .replica-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    margin-top: 20px !important;
  }

  .replica-side-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}
</style>
