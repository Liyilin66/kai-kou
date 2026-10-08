<script setup>
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { isDIEnabled } from "@/lib/di-feature";
import { formatInteger, formatScore, loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";
import {
  buildDesktopDashboardState,
  createEmptyDesktopDashboardState,
  fetchDashboardPracticeRowsForAuth,
  fetchDashboardScoreTrendRowsForAuth,
  fetchDashboardWeeklyPracticeRowsForAuth
} from "@/lib/home-desktop-dashboard";

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const { tasks } = storeToRefs(practiceStore);

const searchQuery = ref("");
const coachAction = ref("plan");
const dashboard = ref(createEmptyDesktopDashboardState());

const TASK_VISUALS = {
  RA: { accent: "#7765F6", glow: "rgba(119, 101, 246, 0.14)", icon: "🎙", title: "RA", subtitle: "朗读句子\n流利表达", path: "/ra" },
  WFD: { accent: "#1BC58E", glow: "rgba(27, 197, 142, 0.14)", icon: "✎", title: "WFD", subtitle: "写作填空\n语法拼写", path: "/wfd" },
  RTS: { accent: "#FF9348", glow: "rgba(255, 147, 72, 0.14)", icon: "▤", title: "RTS", subtitle: "复述句子\n逻辑重组", path: "/rts" },
  DI: { accent: "#7B6CFF", glow: "rgba(123, 108, 255, 0.14)", icon: "◔", title: "DI", subtitle: "描述图表\n数据分析", path: "/di" },
  WE: { accent: "#4E8BFF", glow: "rgba(78, 139, 255, 0.14)", icon: "▣", title: "WE", subtitle: "写作议论文\n结构论证", path: "/we" }
};

const QUICK_TASK_ORDER = ["RA", "WFD", "RTS", "DI", "WE"];
const RECENT_PLACEHOLDERS = [
  { id: "placeholder-ra", taskType: "RA", accent: "#7765F6", title: "RA 练习 - 20题", subtitle: "", scoreLabel: "72/90", timeLabel: "05-16 10:32", isPlaceholder: true },
  { id: "placeholder-di", taskType: "DI", accent: "#7B6CFF", title: "DI 练习 - 数据图表题", subtitle: "", scoreLabel: "64/90", timeLabel: "05-16 09:41", isPlaceholder: true },
  { id: "placeholder-wfd", taskType: "WFD", accent: "#1BC58E", title: "WFD 练习 - 20题", subtitle: "", scoreLabel: "70/90", timeLabel: "05-15 21:36", isPlaceholder: true }
];

const userDisplayName = computed(() => authStore.displayName || "同学");
const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});
const diEnabled = computed(() => isDIEnabled());
const homeAnalytics = computed(() => dashboard.value.homeAnalytics || {});

const greetingLabel = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "凌晨好";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

const heroSupportText = computed(() => {
  if (dashboard.value.loading) return "正在同步你的真实练习记录，桌面总控台会优先接入可用链路。";
  if (homeAnalytics.value.currentStreak > 0) {
    return `你已经连续学习 ${formatInteger(homeAnalytics.value.currentStreak)} 天，今天只要开练就能继续保持节奏。`;
  }
  if (homeAnalytics.value.totalCount > 0) {
    return "今日先做一轮热身，热力图、趋势和 AI 建议就会继续自动刷新。";
  }
  return "从第一题开始，桌面总控台会持续接入你的真实学习数据。";
});

const sidebarItems = computed(() => [
  { key: "home", label: "首页", icon: "⌂", path: "/home", active: true },
  { key: "practice", label: "练习中心", icon: "▤", sectionId: "desktop-quick" },
  { key: "coach", label: "AI 私教", icon: "✧", path: "/agent" },
  { key: "plan", label: "学习计划", icon: "□", sectionId: "desktop-goal" },
  { key: "report", label: "学习报告", icon: "▣", sectionId: "desktop-report" },
  { key: "question-bank", label: "题库", icon: "☷", sectionId: "desktop-library" },
  { key: "profile", label: "个人中心", icon: "○", path: "/profile" }
]);

const heroStats = computed(() => [
  {
    key: "avg-score",
    icon: "◉",
    label: "平均得分",
    value: dashboard.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore),
    suffix: homeAnalytics.value.averageScore !== null ? "/90" : "",
    helper: homeAnalytics.value.scoredCount
      ? `较上周 ↑ ${formatScore(Math.min(9.9, Math.max(1.2, homeAnalytics.value.scoredCount / 2)))}`
      : "较上周 ↑ 5.2"
  },
  {
    key: "total-count",
    icon: "✓",
    label: "练习总量",
    value: dashboard.value.loading ? "--" : formatInteger(homeAnalytics.value.totalCount),
    suffix: "题",
    helper: homeAnalytics.value.totalCount
      ? `今日完成 ${formatInteger(homeAnalytics.value.todayCount)} 题`
      : "较上周 ↑ 86"
  },
  {
    key: "streak",
    icon: "🔥",
    label: "连续学习",
    value: dashboard.value.loading ? "--" : formatInteger(homeAnalytics.value.currentStreak),
    suffix: homeAnalytics.value.currentStreak ? "天" : "",
    helper: homeAnalytics.value.currentStreak
      ? "继续保持今天的练习节奏"
      : "最长 18 天"
  }
]);

const quickTasks = computed(() => {
  const taskMap = new Map(tasks.value.map((task) => [`${task.id || ""}`.trim().toUpperCase(), task]));

  return QUICK_TASK_ORDER
    .filter((taskType) => (taskType === "DI" ? diEnabled.value : true))
    .map((taskType) => {
      const task = taskMap.get(taskType);
      const visuals = TASK_VISUALS[taskType] || TASK_VISUALS.RA;
      const metrics = dashboard.value.moduleMetrics?.[taskType] || {};
      return {
        key: task?.id || taskType.toLowerCase(),
        taskType,
        label: taskType,
        icon: visuals.icon,
        title: visuals.title,
        subtitle: visuals.subtitle,
        path: task?.to || visuals.path,
        accent: visuals.accent,
        glow: visuals.glow,
        weekCount: Number(metrics.weekCount || 0),
        averageScoreLabel: metrics.averageScoreLabel || "--",
        averageScore: metrics.averageScore,
        statusText: metrics.averageScore === null ? "待统计" : "真实均分",
        footer: metrics.lastPracticeAt
          ? `最近练习 ${formatDateChip(metrics.lastPracticeAt)}`
          : "点击进入专项练习"
      };
    });
});

const filteredQuickTasks = computed(() => {
  const query = `${searchQuery.value || ""}`.trim().toLowerCase();
  if (!query) return quickTasks.value;
  return quickTasks.value.filter((task) =>
    `${task.label} ${task.title}`.toLowerCase().includes(query)
  );
});

const notificationCount = computed(() => {
  let count = 0;
  if (!homeAnalytics.value.todayCount) count += 1;
  if ((dashboard.value.weeklyGoal?.percent || 0) < 100) count += 1;
  return Math.max(1, count);
});

const coachSummaries = computed(() =>
  (dashboard.value.coach?.summaries || []).map((summary) => {
    if (typeof summary === "string") return { text: summary, time: "" };
    return {
      text: `${summary?.text || ""}`.trim(),
      time: `${summary?.time || ""}`.trim()
    };
  }).filter((summary) => summary.text)
);

const heatmapWeekLabels = computed(() => {
  const firstRow = dashboard.value.heatmapMatrix?.[0]?.cells || [];
  return firstRow.map((cell) => cell.label);
});

const recentPracticeList = computed(() => {
  const realItems = Array.isArray(dashboard.value.recentPractices) ? dashboard.value.recentPractices : [];
  return realItems.length ? realItems : RECENT_PLACEHOLDERS;
});

const weeklyGoalPercent = computed(() => {
  const percent = Number(dashboard.value.weeklyGoal?.percent || 0);
  return Math.max(0, Math.min(100, Math.round(percent)));
});

const weeklyPracticeHoursLabel = computed(() => {
  const minutes = Number(dashboard.value.weeklyStudy?.estimatedWeekMinutes || 0);
  return formatScore(minutes / 60);
});

const coachActionCopy = computed(() => {
  if (coachAction.value === "weakness") {
    return "弱项区域已定位到当前最低分模块，建议先补最弱项再回到强项保温。";
  }
  if (coachAction.value === "trend") {
    return "7 天趋势区已经对齐到下方折线图，便于你直接观察最近的得分波动。";
  }
  return "今日计划会优先围绕当前弱项和本周目标缺口来安排。";
});

const trendChart = computed(() => buildTrendChart(dashboard.value.scoreTrend || []));
const trendComparisonLabel = computed(() => dashboard.value.trendMeta?.comparisonText || "暂无上周对比");

async function loadDashboard() {
  dashboard.value = createEmptyDesktopDashboardState(homeAnalytics.value);

  try {
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const analyticsSnapshot = await loadHomeAnalyticsSnapshotForAuth(authStore);
    let rows = [];
    let weeklyRows = [];
    let trendRows = { currentRows: [], previousRows: [] };

    try {
      rows = await fetchDashboardPracticeRowsForAuth(authStore);
    } catch (rowError) {
      console.warn("Desktop dashboard rows load failed:", rowError);
    }

    try {
      weeklyRows = await fetchDashboardWeeklyPracticeRowsForAuth(authStore);
    } catch (weeklyRowError) {
      console.warn("Desktop dashboard weekly rows load failed:", weeklyRowError);
    }

    try {
      trendRows = await fetchDashboardScoreTrendRowsForAuth(authStore);
    } catch (trendRowError) {
      console.warn("Desktop dashboard score trend rows load failed:", trendRowError);
    }

    dashboard.value = buildDesktopDashboardState(analyticsSnapshot, rows, {
      diEnabled: diEnabled.value,
      weeklyRows,
      trendRows
    });
  } catch (error) {
    console.warn("Desktop dashboard load failed:", error);
    dashboard.value = {
      ...createEmptyDesktopDashboardState(),
      loading: false
    };
  }
}

function handleSidebarClick(item) {
  if (item.path) {
    router.push(item.path);
    return;
  }

  if (item.sectionId) {
    scrollToSection(item.sectionId);
  }
}

function handleCoachAction(action) {
  coachAction.value = action;
  if (action === "plan") {
    scrollToSection("desktop-quick");
    return;
  }
  if (action === "weakness") {
    scrollToSection("desktop-weakness");
    return;
  }
  scrollToSection("desktop-trend");
}

function openTask(path) {
  const normalized = `${path || ""}`.trim();
  if (!normalized) return;
  router.push(normalized);
}

function openAgent() {
  router.push("/agent");
}

function scrollToSection(sectionId) {
  if (typeof document === "undefined") return;
  const element = document.getElementById(sectionId);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

onMounted(() => {
  loadDashboard();
});

function buildTrendChart(points) {
  const safePoints = Array.isArray(points) ? points : [];
  const width = 420;
  const height = 180;
  const plotLeft = 44;
  const plotRight = 408;
  const paddingTop = 16;
  const paddingBottom = 20;
  const minValue = 30;
  const maxValue = 90;
  const valueRange = maxValue - minValue;
  const plotHeight = height - paddingTop - paddingBottom;
  const baselineY = height - paddingBottom;
  const stepX = safePoints.length > 1 ? (plotRight - plotLeft) / (safePoints.length - 1) : 0;
  const yTicks = [90, 75, 60, 45, 30].map((value) => {
    const y = baselineY - ((value - minValue) / valueRange) * plotHeight;
    return {
      value,
      y: Number(y.toFixed(2)),
      x1: plotLeft,
      x2: plotRight,
      labelX: plotLeft - 12
    };
  });

  const chartPoints = safePoints.map((point, index) => {
    const rawValue = Number(point?.value);
    const hasValue = point?.value !== null && point?.value !== undefined && point?.value !== "" && Number.isFinite(rawValue);
    const displayValue = hasValue ? Math.max(minValue, Math.min(maxValue, rawValue)) : minValue;
    const x = plotLeft + stepX * index;
    const y = baselineY - ((displayValue - minValue) / valueRange) * plotHeight;
    const practiceCount = Number(point?.practiceCount || 0);
    return {
      ...point,
      hasValue,
      rawValue: hasValue ? Number(rawValue.toFixed(1)) : null,
      practiceCount,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      title: hasValue
        ? `${point.label} · 平均分 ${formatScore(rawValue)} · ${formatInteger(practiceCount)} 次练习`
        : ""
    };
  });

  const segments = [];
  const areaPaths = [];
  let activeSegment = [];

  const closeSegment = () => {
    if (activeSegment.length > 1) {
      segments.push(activeSegment.map((point) => `${point.x},${point.y}`).join(" "));
      areaPaths.push([
        `M ${activeSegment[0].x} ${baselineY}`,
        ...activeSegment.map((point) => `L ${point.x} ${point.y}`),
        `L ${activeSegment[activeSegment.length - 1].x} ${baselineY}`,
        "Z"
      ].join(" "));
    }
    activeSegment = [];
  };

  chartPoints.forEach((point) => {
    if (!point.hasValue) {
      closeSegment();
      return;
    }
    activeSegment.push(point);
  });
  closeSegment();

  return {
    areaPaths,
    baselineY,
    hasData: chartPoints.some((point) => point.hasValue),
    plotLeft,
    plotRight,
    points: chartPoints.filter((point) => point.hasValue),
    segments,
    yTicks
  };
}

function formatDateChip(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
</script>

<template>
  <div class="desktop-home">
    <div class="desktop-home__glow desktop-home__glow--left" aria-hidden="true" />
    <div class="desktop-home__glow desktop-home__glow--right" aria-hidden="true" />

    <aside class="desktop-sidebar">
      <div class="desktop-sidebar__brand">
        <div class="desktop-sidebar__brand-mark" aria-hidden="true" />
        <div>
          <p class="desktop-sidebar__brand-title">开口</p>
        </div>
      </div>

      <nav class="desktop-sidebar__nav" aria-label="桌面导航">
        <button
          v-for="item in sidebarItems"
          :key="item.key"
          type="button"
          class="desktop-nav-item"
          :class="{ 'desktop-nav-item--active': item.active }"
          @click="handleSidebarClick(item)"
        >
          <span class="desktop-nav-item__icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="desktop-sidebar__resource">
        <p class="desktop-sidebar__resource-eyebrow">PTE 备考资料包</p>
        <p class="desktop-sidebar__resource-title">真题 · 高频词汇 · 模板</p>
        <button type="button" class="desktop-sidebar__resource-btn" @click="scrollToSection('desktop-goal')">
          免费领取
        </button>
        <span class="desktop-sidebar__gift" aria-hidden="true">▱</span>
      </div>
    </aside>

    <main class="desktop-main">
      <header class="desktop-topbar">
        <div>
          <h1 class="desktop-topbar__title">你好，{{ userDisplayName }} 👋</h1>
          <p class="desktop-topbar__eyebrow">坚持每天进步一点点，PTE 梦想更进一步！</p>
        </div>

        <div class="desktop-topbar__tools">
          <label class="desktop-search">
            <span class="desktop-search__icon">⌕</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索题目、技巧、课程..."
              aria-label="搜索模块或能力项"
            />
            <span class="desktop-search__hint">⌘ /</span>
          </label>

          <button type="button" class="desktop-notify" aria-label="通知">
            <span class="desktop-notify__icon">♧</span>
            <span class="desktop-notify__badge">{{ notificationCount }}</span>
          </button>

          <button type="button" class="desktop-user" @click="router.push('/profile')">
            <span class="desktop-user__avatar">
              <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
              <span v-else>{{ userInitial }}</span>
            </span>
            <span class="desktop-user__name">{{ userDisplayName }}</span>
            <span class="desktop-user__chevron">⌄</span>
          </button>
        </div>
      </header>

      <section class="desktop-overview-grid">
        <div class="desktop-overview-grid__left">
          <section class="desktop-hero">
            <div class="desktop-hero__copy">
              <h2 class="desktop-hero__title">
                你的 <span>PTE</span><br />
                <strong class="desktop-hero__title-lock">学习总控台</strong>
              </h2>
              <p class="desktop-hero__support">聚焦今日任务，高效备考每一步</p>

              <div class="desktop-hero__today">
                <p class="desktop-hero__today-label">🎯 今日重点</p>
                <div
                  v-for="item in dashboard.heroTask.checklist"
                  :key="item.label"
                  class="desktop-hero__task"
                >
                  <span class="desktop-hero__task-check">✓</span>
                  <span class="desktop-hero__task-label">{{ item.label }}</span>
                  <span class="desktop-hero__task-track">
                    <span :style="{ width: `${Math.round(item.ratio * 100)}%` }" />
                  </span>
                  <span class="desktop-hero__task-count">{{ formatInteger(item.current) }}/{{ formatInteger(item.total) }}</span>
                </div>
              </div>
            </div>

            <section class="desktop-stat-grid" aria-label="关键统计">
              <article v-for="stat in heroStats" :key="stat.key" class="desktop-stat">
                <span class="desktop-stat__icon">{{ stat.icon }}</span>
                <div>
                  <p class="desktop-stat__label">{{ stat.label }}</p>
                  <p class="desktop-stat__value">
                    <span>{{ stat.value }}</span>
                    <span v-if="stat.suffix" class="desktop-stat__suffix">{{ stat.suffix }}</span>
                  </p>
                  <p class="desktop-stat__helper">{{ stat.helper }}</p>
                </div>
              </article>
            </section>
          </section>

          <section id="desktop-library" class="desktop-card desktop-quick-panel">
            <div class="desktop-section-head">
              <div>
                <h3 class="desktop-section-head__title">模块快捷入口</h3>
              </div>
            </div>

            <div id="desktop-quick" class="desktop-quick-grid">
              <button
                v-for="task in filteredQuickTasks"
                :key="task.key"
                type="button"
                class="desktop-quick-card"
                :style="{ '--task-accent': task.accent, '--task-glow': task.glow }"
                @click="openTask(task.path)"
              >
                <span class="desktop-quick-card__icon">{{ task.icon }}</span>
                <div>
                  <p class="desktop-quick-card__title">{{ task.label }}</p>
                  <p class="desktop-quick-card__subtitle">{{ task.subtitle }}</p>
                </div>
                <span class="desktop-quick-card__arrow">›</span>
              </button>

              <div v-if="!filteredQuickTasks.length" class="desktop-empty-search">
                <p class="desktop-empty-search__title">没有找到匹配模块</p>
                <p class="desktop-empty-search__copy">试试输入 `RA`、`WFD`、`RTS`、`DI` 或 `WE`。</p>
              </div>
            </div>
          </section>
        </div>

        <div class="desktop-overview-grid__right">
          <section class="desktop-card desktop-card--coach">
            <div class="desktop-coach__head">
              <div class="desktop-coach__title-wrap">
                <span class="desktop-coach__spark">✦</span>
                <div>
                  <h3 class="desktop-section-head__title">AI 私教</h3>
                  <p class="desktop-section-head__hint">为你量身建议</p>
                </div>
              </div>
              <button type="button" class="desktop-coach__talk" @click="openAgent">与 AI 私教对话 →</button>
            </div>

            <div class="desktop-coach__banner">
              <span>💡</span>
              <strong>{{ dashboard.coach.banner }}</strong>
            </div>

            <div class="desktop-coach__summary">
              <article v-for="(summary, index) in coachSummaries" :key="index" class="desktop-coach__summary-item">
                <img class="desktop-coach__avatar" src="/agent/assistant-avatar.png" alt="" />
                <div class="desktop-coach__bubble">
                  <p>{{ summary.text }}</p>
                  <time v-if="summary.time">{{ summary.time }}</time>
                </div>
              </article>
            </div>

            <div class="desktop-coach__actions">
              <button type="button" class="desktop-coach__ghost" @click="handleCoachAction('plan')">□ 生成今日计划</button>
              <button type="button" class="desktop-coach__ghost" @click="handleCoachAction('weakness')">◎ 分析我的弱项</button>
              <button type="button" class="desktop-coach__ghost" @click="handleCoachAction('trend')">↗ 查看 7 天趋势</button>
            </div>
          </section>

          <div class="desktop-side-cards">
            <section class="desktop-card desktop-card--mini">
              <div class="desktop-mini-head">
                <span>♧</span>
                <h3 class="desktop-section-head__title">学习提醒</h3>
                <span class="desktop-mini-head__arrow">›</span>
              </div>
              <p class="desktop-reminder__title">{{ dashboard.reminder.title }}</p>
              <p class="desktop-reminder__copy">{{ dashboard.reminder.detail }}</p>
              <button type="button" class="desktop-mini-button" @click="scrollToSection('desktop-quick')">去查看任务</button>
            </section>

            <section id="desktop-goal" class="desktop-card desktop-card--mini">
              <div class="desktop-mini-head">
                <span>◎</span>
                <h3 class="desktop-section-head__title">本周目标进度</h3>
                <span class="desktop-mini-head__arrow">›</span>
              </div>

              <div class="desktop-goal">
                <p class="desktop-goal__percent">{{ weeklyGoalPercent }}%</p>
                <div class="desktop-goal__track">
                  <span :style="{ width: `${weeklyGoalPercent}%` }" />
                </div>
                <p class="desktop-goal__caption">{{ dashboard.weeklyGoal.caption }}</p>
                <button type="button" class="desktop-mini-button">去调整目标</button>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section id="desktop-report" class="desktop-bottom-grid">
        <article class="desktop-card desktop-card--heatmap">
          <div class="desktop-section-head desktop-section-head--compact">
            <div>
              <h3 class="desktop-section-head__title">本周学习热力图</h3>
            </div>
            <span class="desktop-section-head__info">ⓘ</span>
          </div>

          <div class="desktop-heatmap">
            <div class="desktop-heatmap__weekdays">
              <span />
              <span v-for="label in heatmapWeekLabels" :key="label">{{ label }}</span>
            </div>
            <div
              v-for="row in dashboard.heatmapMatrix"
              :key="row.taskType"
              class="desktop-heatmap__row"
            >
              <strong>{{ row.label }}</strong>
              <span
                v-for="cell in row.cells"
                :key="cell.key"
                class="desktop-heatmap__dot"
                :class="`desktop-heatmap__dot--${cell.level}`"
                :title="`${row.label} · ${cell.label} · ${formatInteger(cell.count)} 次练习`"
              />
            </div>
          </div>
          <div class="desktop-heatmap__legend">
            <span>少</span>
            <i class="desktop-heatmap__dot desktop-heatmap__dot--0" />
            <i class="desktop-heatmap__dot desktop-heatmap__dot--1" />
            <i class="desktop-heatmap__dot desktop-heatmap__dot--2" />
            <i class="desktop-heatmap__dot desktop-heatmap__dot--3" />
            <i class="desktop-heatmap__dot desktop-heatmap__dot--4" />
            <span>多</span>
          </div>
          <p class="desktop-heatmap__footer">本周学习 {{ weeklyPracticeHoursLabel }} 小时</p>
        </article>

        <article id="desktop-trend" class="desktop-card desktop-card--trend">
          <div class="desktop-section-head desktop-section-head--compact">
            <div>
              <h3 class="desktop-section-head__title">得分趋势（近 7 天）</h3>
            </div>
          </div>

          <div class="desktop-trend">
            <svg viewBox="0 0 420 180" class="desktop-trend__chart" role="img" aria-label="近 7 天平均得分趋势">
              <defs>
                <linearGradient id="desktopTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="rgba(90, 112, 255, 0.22)" />
                  <stop offset="100%" stop-color="rgba(90, 112, 255, 0.03)" />
                </linearGradient>
              </defs>
              <g class="desktop-trend__grid">
                <g v-for="tick in trendChart.yTicks" :key="tick.value">
                  <text :x="tick.labelX" :y="tick.y + 4" class="desktop-trend__axis-text">{{ tick.value }}</text>
                  <line :x1="tick.x1" :x2="tick.x2" :y1="tick.y" :y2="tick.y" class="desktop-trend__grid-line" />
                </g>
              </g>
              <path
                v-for="areaPath in trendChart.areaPaths"
                :key="areaPath"
                :d="areaPath"
                class="desktop-trend__area"
                fill="url(#desktopTrendFill)"
              />
              <polyline
                v-for="segment in trendChart.segments"
                :key="segment"
                :points="segment"
                class="desktop-trend__line"
              />
              <circle
                v-for="point in trendChart.points"
                :key="point.key"
                :cx="point.x"
                :cy="point.y"
                r="5"
                class="desktop-trend__point"
              >
                <title>{{ point.title }}</title>
              </circle>
            </svg>
            <div v-if="!trendChart.hasData" class="desktop-trend__empty">近 7 天暂无评分记录</div>

            <div class="desktop-trend__labels">
              <div
                v-for="point in dashboard.scoreTrend"
                :key="point.key"
                class="desktop-trend__label"
              >
                <span>{{ point.label }}</span>
              </div>
            </div>
          </div>
          <p class="desktop-trend__footer">{{ trendComparisonLabel }}</p>
        </article>

        <article id="desktop-weakness" class="desktop-card desktop-card--weak">
          <div class="desktop-section-head desktop-section-head--compact">
            <div>
              <h3 class="desktop-section-head__title">我的弱项 Top 3</h3>
            </div>
            <button type="button" class="desktop-card-link" @click="handleCoachAction('weakness')">查看全部 →</button>
          </div>

          <div class="desktop-weak-list">
            <div v-for="(item, index) in dashboard.weakPoints" :key="`${item.taskType}-${index}`" class="desktop-weak-item">
              <div class="desktop-weak-item__rank">{{ index + 1 }}</div>
              <div class="desktop-weak-item__copy">
                <div class="desktop-weak-item__row">
                  <strong>{{ item.label }} {{ item.title }}</strong>
                  <span>正确率 {{ formatInteger(item.accuracy) }}%</span>
                  <em>{{ item.deltaText }}</em>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="desktop-card desktop-card--recent">
          <div class="desktop-section-head desktop-section-head--compact">
            <div>
              <h3 class="desktop-section-head__title">最近练习</h3>
            </div>
            <button type="button" class="desktop-card-link" @click="scrollToSection('desktop-quick')">查看全部 →</button>
          </div>

          <div class="desktop-recent-list">
            <div
              v-for="item in recentPracticeList"
              :key="item.id"
              class="desktop-recent-item"
            >
              <span class="desktop-recent-item__pill" :style="{ backgroundColor: item.accent }">{{ item.taskType }}</span>
              <div class="desktop-recent-item__copy">
                <strong>{{ item.title }}</strong>
                <span v-if="item.subtitle">{{ item.subtitle }}</span>
              </div>
              <span class="desktop-recent-item__score">得分 {{ item.scoreLabel }}</span>
              <time class="desktop-recent-item__time">{{ item.timeLabel }}</time>
              <span class="desktop-recent-item__arrow">›</span>
            </div>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<style scoped>
.desktop-home {
  position: relative;
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-height: 100vh;
  padding: 24px;
  gap: 24px;
  background:
    radial-gradient(circle at top left, rgba(194, 213, 255, 0.72), transparent 34%),
    radial-gradient(circle at top right, rgba(229, 216, 255, 0.84), transparent 34%),
    linear-gradient(180deg, #eef4ff 0%, #f8f8ff 38%, #f7f9ff 100%);
}

.desktop-home__glow {
  position: absolute;
  pointer-events: none;
  filter: blur(24px);
  opacity: 0.66;
}

.desktop-home__glow--left {
  inset: 48px auto auto 200px;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(167, 199, 255, 0.56);
}

.desktop-home__glow--right {
  inset: 120px 120px auto auto;
  width: 300px;
  height: 300px;
  border-radius: 999px;
  background: rgba(216, 196, 255, 0.54);
}

.desktop-sidebar,
.desktop-main {
  position: relative;
  z-index: 1;
}

.desktop-sidebar {
  position: sticky;
  top: 24px;
  align-self: start;
  display: flex;
  min-height: calc(100vh - 48px);
  flex-direction: column;
  gap: 24px;
  padding: 24px 20px;
  border: 1px solid rgba(201, 214, 242, 0.8);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow:
    0 30px 80px rgba(72, 94, 170, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px);
}

.desktop-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.desktop-sidebar__brand-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: linear-gradient(135deg, #5976ff 0%, #8464ff 100%);
  color: #fff;
  font-size: 1.25rem;
  font-weight: 800;
  box-shadow: 0 16px 34px rgba(93, 113, 255, 0.26);
}

.desktop-sidebar__brand-title,
.desktop-sidebar__brand-subtitle,
.desktop-topbar__eyebrow,
.desktop-topbar__title,
.desktop-hero__eyebrow,
.desktop-hero__title,
.desktop-hero__support,
.desktop-hero__today-label,
.desktop-hero__today-title,
.desktop-hero__today-detail,
.desktop-section-head__eyebrow,
.desktop-section-head__title,
.desktop-section-head__hint,
.desktop-stat__value,
.desktop-stat__label,
.desktop-stat__helper,
.desktop-sidebar__resource-eyebrow,
.desktop-sidebar__resource-title,
.desktop-coach__note,
.desktop-reminder__copy,
.desktop-goal__caption,
.desktop-recent-empty {
  margin: 0;
}

.desktop-sidebar__brand-title {
  font-size: 1.42rem;
  font-weight: 800;
  color: #1d2b58;
  letter-spacing: -0.03em;
}

.desktop-sidebar__brand-subtitle {
  margin-top: 4px;
  font-size: 0.82rem;
  color: #8090b2;
}

.desktop-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.desktop-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: #65769d;
  font-size: 0.98rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.desktop-nav-item:hover {
  transform: translateX(2px);
  background: rgba(91, 111, 255, 0.08);
  color: #31467e;
}

.desktop-nav-item--active {
  background: linear-gradient(135deg, rgba(97, 123, 255, 0.16), rgba(179, 154, 255, 0.14));
  color: #2e4583;
  box-shadow: inset 0 0 0 1px rgba(108, 121, 255, 0.12);
}

.desktop-nav-item__icon {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  color: inherit;
  font-size: 0.92rem;
}

.desktop-sidebar__resource {
  margin-top: auto;
  padding: 18px;
  border-radius: 26px;
  background: linear-gradient(180deg, #edf4ff 0%, #f7f2ff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.desktop-sidebar__resource-eyebrow {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #5f74ff;
  text-transform: uppercase;
}

.desktop-sidebar__resource-title {
  margin-top: 12px;
  color: #293861;
  font-size: 0.94rem;
  line-height: 1.6;
}

.desktop-sidebar__resource-btn {
  margin-top: 16px;
  width: 100%;
  min-height: 42px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #5d78ff 0%, #8661ff 100%);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(109, 120, 255, 0.22);
}

.desktop-main {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.desktop-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 24px;
  border: 1px solid rgba(205, 216, 242, 0.88);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 20px 60px rgba(88, 104, 173, 0.1);
  backdrop-filter: blur(18px);
}

.desktop-topbar__eyebrow {
  font-size: 0.88rem;
  font-weight: 700;
  color: #6880b3;
}

.desktop-topbar__title {
  margin-top: 6px;
  font-size: 1.54rem;
  color: #22325f;
  letter-spacing: -0.04em;
}

.desktop-topbar__tools {
  display: flex;
  align-items: center;
  gap: 14px;
}

.desktop-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 340px;
  padding: 0 14px;
  min-height: 52px;
  border: 1px solid rgba(210, 220, 243, 0.92);
  border-radius: 18px;
  background: rgba(248, 250, 255, 0.92);
}

.desktop-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #334a7d;
  font-size: 0.95rem;
}

.desktop-search__icon {
  color: #8093b9;
  font-size: 1rem;
}

.desktop-search__hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(222, 230, 250, 0.88);
  color: #7488af;
  font-size: 0.74rem;
  font-weight: 700;
}

.desktop-notify,
.desktop-user {
  border: 0;
  cursor: pointer;
}

.desktop-notify {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 0 0 1px rgba(214, 223, 246, 0.88);
}

.desktop-notify__icon {
  color: #657cb0;
  font-size: 1.08rem;
}

.desktop-notify__badge {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff7e8b;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
}

.desktop-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 8px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(214, 223, 246, 0.9);
}

.desktop-user__avatar {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: linear-gradient(135deg, #607cff 0%, #8d65ff 100%);
  color: #fff;
  font-weight: 800;
  overflow: hidden;
}

.desktop-user__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.desktop-user__name {
  color: #2d4172;
  font-size: 0.92rem;
  font-weight: 700;
}

.desktop-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 360px);
  gap: 26px;
  padding: 30px 30px 26px;
  border: 1px solid rgba(205, 216, 242, 0.92);
  border-radius: 34px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.86) 0%, rgba(243, 246, 255, 0.96) 100%);
  box-shadow: 0 30px 80px rgba(88, 104, 173, 0.12);
  backdrop-filter: blur(18px);
}

.desktop-hero__copy {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.desktop-hero__eyebrow,
.desktop-section-head__eyebrow {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6a7fff;
}

.desktop-hero__title {
  font-size: 3rem;
  line-height: 1.04;
  color: #20305d;
  letter-spacing: -0.05em;
}

.desktop-hero__support {
  max-width: 640px;
  color: #62759f;
  font-size: 1rem;
  line-height: 1.8;
}

.desktop-hero__today {
  max-width: 500px;
  padding: 22px 24px;
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(238, 243, 255, 0.96) 0%, rgba(255, 255, 255, 0.9) 100%);
  box-shadow:
    0 16px 40px rgba(108, 121, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.desktop-hero__today-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #5f75ff;
}

.desktop-hero__today-title {
  margin-top: 10px;
  font-size: 1.35rem;
  color: #25355f;
}

.desktop-hero__today-detail {
  margin-top: 8px;
  color: #63759d;
  line-height: 1.7;
}

.desktop-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.desktop-hero__chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #5d72a3;
  font-size: 0.82rem;
  font-weight: 700;
}

.desktop-hero__art {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 320px;
  border-radius: 30px;
  background: linear-gradient(180deg, rgba(223, 228, 255, 0.84) 0%, rgba(244, 247, 255, 0.76) 100%);
  overflow: hidden;
}

.desktop-hero__orbit {
  position: absolute;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.64);
}

.desktop-hero__orbit--large {
  width: 250px;
  height: 250px;
}

.desktop-hero__orbit--small {
  width: 174px;
  height: 174px;
}

.desktop-hero__bot {
  position: relative;
  z-index: 1;
  width: min(100%, 250px);
  object-fit: contain;
}

.desktop-hero__bubble {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #4a63ff;
  font-size: 0.82rem;
  font-weight: 700;
  box-shadow: 0 12px 24px rgba(106, 123, 255, 0.14);
}

.desktop-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.desktop-stat {
  padding: 22px 24px;
  border: 1px solid rgba(205, 216, 242, 0.92);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 20px 48px rgba(88, 104, 173, 0.08);
}

.desktop-stat__value {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  font-size: 2.1rem;
  font-weight: 800;
  color: #25355f;
  letter-spacing: -0.05em;
}

.desktop-stat__suffix {
  margin-bottom: 5px;
  font-size: 0.88rem;
  color: #7f91b4;
}

.desktop-stat__label {
  margin-top: 6px;
  color: #62749f;
  font-size: 0.92rem;
  font-weight: 700;
}

.desktop-stat__helper {
  margin-top: 10px;
  color: #8a99b8;
  font-size: 0.84rem;
  line-height: 1.6;
}

.desktop-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 24px;
}

.desktop-grid__left,
.desktop-grid__right {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.desktop-card {
  padding: 24px;
  border: 1px solid rgba(205, 216, 242, 0.92);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 24px 60px rgba(88, 104, 173, 0.09);
}

.desktop-card--soft {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(246, 248, 255, 0.86) 100%);
}

.desktop-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.desktop-section-head--compact {
  align-items: center;
}

.desktop-section-head__title {
  margin-top: 6px;
  color: #25355f;
  font-size: 1.18rem;
  letter-spacing: -0.03em;
}

.desktop-section-head__hint {
  color: #8696b5;
  font-size: 0.84rem;
  line-height: 1.6;
  text-align: right;
}

.desktop-quick-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.desktop-quick-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 232px;
  padding: 18px;
  border: 0;
  border-radius: 24px;
  background:
    radial-gradient(circle at top right, var(--task-glow), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(242, 247, 255, 0.92) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(213, 223, 246, 0.86),
    0 18px 40px rgba(93, 107, 168, 0.12);
  text-align: left;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.desktop-quick-card:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 0 0 1px rgba(213, 223, 246, 0.86),
    0 24px 48px rgba(93, 107, 168, 0.16);
}

.desktop-quick-card__top,
.desktop-quick-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.desktop-quick-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--task-accent) 14%, #ffffff 86%);
  color: var(--task-accent);
  font-weight: 800;
  letter-spacing: 0.04em;
}

.desktop-quick-card__metric {
  color: #8594b5;
  font-size: 0.82rem;
  font-weight: 700;
}

.desktop-quick-card__title {
  margin: 0;
  color: #26365f;
  font-size: 1.24rem;
  font-weight: 800;
}

.desktop-quick-card__subtitle {
  margin: 10px 0 0;
  color: #6c7da2;
  font-size: 0.92rem;
  line-height: 1.6;
}

.desktop-quick-card__meta {
  margin-top: auto;
  color: #7f90b3;
  font-size: 0.82rem;
}

.desktop-quick-card__meta strong {
  color: var(--task-accent);
  font-size: 1.02rem;
}

.desktop-quick-card__footer {
  margin: 0;
  color: #8a99b8;
  font-size: 0.82rem;
}

.desktop-empty-search {
  display: grid;
  place-items: center;
  min-height: 232px;
  border-radius: 24px;
  border: 1px dashed rgba(194, 206, 236, 0.9);
  background: rgba(250, 252, 255, 0.92);
  text-align: center;
}

.desktop-empty-search__title,
.desktop-empty-search__copy {
  margin: 0;
}

.desktop-empty-search__title {
  color: #2d416f;
  font-weight: 700;
}

.desktop-empty-search__copy {
  margin-top: 8px;
  color: #8696b5;
  font-size: 0.88rem;
}

.desktop-data-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, 1.18fr);
  gap: 24px;
}

.desktop-heatmap {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.desktop-heatmap__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.desktop-heatmap__cell {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 18px;
  color: #314372;
  font-size: 0.84rem;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgba(206, 218, 246, 0.78);
}

.desktop-heatmap__cell--today {
  box-shadow:
    inset 0 0 0 1px rgba(206, 218, 246, 0.78),
    0 0 0 4px rgba(126, 143, 191, 0.12);
}

.desktop-heatmap__label {
  color: #7f90b4;
  font-size: 0.8rem;
}

.desktop-trend {
  margin-top: 18px;
  position: relative;
}

.desktop-trend__chart {
  width: 100%;
  height: auto;
}

.desktop-trend__axis-text {
  fill: #a2abc0;
  font-size: 10px;
  font-weight: 700;
  text-anchor: end;
}

.desktop-trend__grid-line {
  stroke: rgba(126, 143, 191, 0.14);
  stroke-width: 1;
}

.desktop-trend__area {
  pointer-events: none;
}

.desktop-trend__line {
  fill: none;
  stroke: #6578ff;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.desktop-trend__point {
  fill: #fff;
  stroke: #6578ff;
  stroke-width: 4;
}

.desktop-trend__empty {
  position: absolute;
  top: 74px;
  right: 20px;
  left: 56px;
  color: #8a99b8;
  font-size: 0.82rem;
  font-weight: 800;
  text-align: center;
  pointer-events: none;
}

.desktop-trend__labels {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
  padding: 0 12px 0 44px;
  box-sizing: border-box;
}

.desktop-trend__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.desktop-trend__label strong {
  color: #2c3e6d;
  font-size: 0.9rem;
}

.desktop-trend__label span {
  color: #8a99b8;
  font-size: 0.78rem;
}

.desktop-bottom-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
  gap: 24px;
}

.desktop-weak-list,
.desktop-recent-list,
.desktop-coach__summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}

.desktop-weak-item,
.desktop-recent-item,
.desktop-coach__summary-item {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px 18px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(247, 249, 255, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%);
  box-shadow: inset 0 0 0 1px rgba(214, 223, 246, 0.84);
}

.desktop-weak-item__rank {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 14px;
  background: rgba(99, 121, 255, 0.12);
  color: #516cff;
  font-weight: 800;
}

.desktop-weak-item__copy,
.desktop-recent-item__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.desktop-weak-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.desktop-weak-item__copy strong,
.desktop-recent-item__copy strong {
  color: #2b3d6b;
}

.desktop-weak-item__copy p,
.desktop-recent-item__copy span,
.desktop-coach__summary-item p {
  margin: 0;
  color: #7a8aae;
  line-height: 1.7;
  font-size: 0.88rem;
}

.desktop-recent-item {
  align-items: center;
}

.desktop-recent-item__pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  color: #fff;
  font-size: 0.76rem;
  font-weight: 800;
}

.desktop-recent-item__time,
.desktop-recent-item__score {
  color: #6f81a9;
  font-size: 0.82rem;
  font-weight: 700;
}

.desktop-recent-item__score {
  color: #324476;
}

.desktop-recent-empty {
  margin-top: 18px;
  color: #8897b6;
  line-height: 1.7;
}

.desktop-card--coach {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(244, 247, 255, 0.94) 100%);
}

.desktop-coach__banner {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(93, 121, 255, 0.1), rgba(160, 137, 255, 0.1));
  color: #34477a;
  line-height: 1.7;
  font-size: 0.92rem;
  font-weight: 600;
}

.desktop-coach__summary-mark {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: linear-gradient(135deg, #607cff 0%, #8b66ff 100%);
  color: #fff;
  font-size: 0.76rem;
  font-weight: 800;
  flex: none;
}

.desktop-coach__actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 18px;
}

.desktop-coach__ghost,
.desktop-coach__primary {
  min-height: 46px;
  border-radius: 16px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.desktop-coach__ghost {
  border: 1px solid rgba(212, 221, 245, 0.9);
  background: rgba(255, 255, 255, 0.88);
  color: #44598b;
}

.desktop-coach__primary {
  margin-top: 18px;
  width: 100%;
  border: 0;
  background: linear-gradient(135deg, #5d78ff 0%, #8762ff 100%);
  color: #fff;
  box-shadow: 0 16px 28px rgba(109, 120, 255, 0.22);
}

.desktop-coach__note {
  margin-top: 14px;
  color: #8293b4;
  line-height: 1.7;
  font-size: 0.84rem;
}

.desktop-reminder__copy {
  margin-top: 18px;
  color: #6d7ea3;
  line-height: 1.8;
}

.desktop-goal {
  margin-top: 20px;
}

.desktop-goal__track {
  position: relative;
  height: 14px;
  border-radius: 999px;
  background: rgba(228, 234, 249, 0.96);
  overflow: hidden;
}

.desktop-goal__track span {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #5f78ff 0%, #8f69ff 100%);
}

.desktop-goal__caption {
  margin-top: 14px;
  color: #7182a7;
  line-height: 1.7;
  font-size: 0.86rem;
}

@media (max-width: 1600px) {
  .desktop-quick-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1440px) {
  .desktop-home {
    grid-template-columns: 236px minmax(0, 1fr);
    padding: 20px;
  }

  .desktop-grid {
    grid-template-columns: minmax(0, 1fr) 320px;
  }

  .desktop-quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .desktop-data-grid,
  .desktop-bottom-grid {
    grid-template-columns: 1fr;
  }

  .desktop-search {
    min-width: 280px;
  }
}

@media (max-width: 1200px) {
  .desktop-home {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 18px;
  }

  .desktop-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .desktop-topbar__tools {
    justify-content: space-between;
  }

  .desktop-search {
    flex: 1;
    min-width: 0;
  }

  .desktop-hero {
    grid-template-columns: 1fr;
  }

  .desktop-grid {
    grid-template-columns: 1fr;
  }

  .desktop-grid__right {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .desktop-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1080px) {
  .desktop-sidebar {
    padding: 22px 16px;
  }

  .desktop-grid__right,
  .desktop-stat-grid {
    grid-template-columns: 1fr;
  }

  .desktop-topbar__tools {
    width: 100%;
  }
}

/* Reference-aligned desktop dashboard overrides. Mobile is rendered by HomeView's v-else branch. */
.desktop-home {
  position: relative;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  min-height: 100vh;
  gap: 36px;
  padding: 0 34px 32px 0;
  background:
    radial-gradient(circle at 68% 0%, rgba(224, 229, 255, 0.86), transparent 30%),
    linear-gradient(180deg, #f6f8ff 0%, #f9fbff 46%, #f7f9ff 100%);
  color: #17234a;
  overflow-x: hidden;
}

.desktop-home__glow {
  display: none;
}

.desktop-sidebar {
  position: sticky;
  top: 0;
  min-height: 100vh;
  padding: 28px 16px 24px;
  border: 0;
  border-right: 1px solid #e8edf8;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 18px 0 42px rgba(54, 83, 150, 0.06);
  backdrop-filter: blur(18px);
}

.desktop-sidebar__brand {
  gap: 14px;
  padding: 0 18px;
}

.desktop-sidebar__brand-mark {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: linear-gradient(135deg, #1d75ff 0%, #1658e8 100%);
  box-shadow: 0 12px 28px rgba(23, 93, 232, 0.22);
}

.desktop-sidebar__brand-mark::before {
  content: "";
  position: absolute;
  inset: 10px 8px 8px 12px;
  border: 7px solid #fff;
  border-right: 0;
  border-radius: 10px 0 0 10px;
}

.desktop-sidebar__brand-mark::after {
  content: "";
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 15px;
  height: 15px;
  border-radius: 5px;
  background: #fff;
}

.desktop-sidebar__brand-title {
  font-size: 1.58rem;
  line-height: 1;
  letter-spacing: -0.04em;
  color: #111a35;
}

.desktop-sidebar__nav {
  gap: 14px;
  margin-top: 46px;
}

.desktop-nav-item {
  position: relative;
  min-height: 52px;
  gap: 16px;
  padding: 0 20px;
  border-radius: 10px;
  color: #687795;
  font-size: 1rem;
  font-weight: 700;
}

.desktop-nav-item:hover {
  transform: none;
  background: #f1f5ff;
  color: #2d63f0;
}

.desktop-nav-item--active {
  background: linear-gradient(90deg, rgba(231, 237, 255, 0.98), rgba(241, 244, 255, 0.86));
  color: #1769f4;
  box-shadow: none;
}

.desktop-nav-item--active::after {
  content: "";
  position: absolute;
  top: 0;
  right: -1px;
  width: 4px;
  height: 100%;
  border-radius: 999px 0 0 999px;
  background: #1769f4;
}

.desktop-nav-item__icon {
  width: 26px;
  height: 26px;
  border-radius: 0;
  background: transparent;
  color: currentColor;
  font-size: 1.06rem;
}

.desktop-sidebar__resource {
  position: relative;
  margin: 198px 7px 0;
  min-height: 206px;
  padding: 24px 18px 18px;
  border: 1px solid #eef2fb;
  border-radius: 14px;
  background: linear-gradient(180deg, #f4f7ff 0%, #f0f2ff 100%);
  overflow: hidden;
}

.desktop-sidebar__resource-eyebrow {
  color: #25345b;
  font-size: 0.92rem;
  letter-spacing: 0;
  text-transform: none;
}

.desktop-sidebar__resource-title {
  max-width: 150px;
  margin-top: 12px;
  color: #7b88a6;
  font-size: 0.84rem;
  line-height: 1.7;
}

.desktop-sidebar__resource-btn {
  width: auto;
  min-height: 40px;
  margin-top: 20px;
  padding: 0 18px;
  border-radius: 999px;
  background: linear-gradient(135deg, #7565ff 0%, #8e70ff 100%);
  box-shadow: 0 14px 30px rgba(117, 101, 255, 0.28);
  font-size: 0.84rem;
}

.desktop-sidebar__gift {
  position: absolute;
  right: 18px;
  bottom: 22px;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 18px;
  color: #7a64ff;
  font-size: 2rem;
  background: rgba(255, 255, 255, 0.68);
  transform: rotate(-10deg);
}

.desktop-main {
  gap: 22px;
  padding-top: 24px;
}

.desktop-topbar {
  min-height: 78px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.desktop-topbar__title {
  margin: 0;
  color: #151f3d;
  font-size: 1.42rem;
  line-height: 1.25;
  letter-spacing: -0.03em;
}

.desktop-topbar__eyebrow {
  margin-top: 6px;
  color: #8a98b6;
  font-size: 0.92rem;
  font-weight: 600;
}

.desktop-topbar__tools {
  gap: 16px;
}

.desktop-search {
  width: 506px;
  min-width: 0;
  min-height: 50px;
  padding: 0 16px;
  border-color: #dce4f2;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.desktop-search input {
  color: #5f6f90;
  font-size: 0.9rem;
  font-weight: 600;
}

.desktop-search__hint {
  min-width: 54px;
  height: 32px;
  background: rgba(247, 249, 255, 0.95);
  color: #9ba7bd;
  box-shadow: inset 0 0 0 1px #e4eaf5;
}

.desktop-notify {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
}

.desktop-notify__icon {
  color: #8391ad;
  font-size: 1.24rem;
}

.desktop-notify__badge {
  top: -2px;
  right: -1px;
  min-width: 20px;
  height: 20px;
  background: #ff4d42;
  border: 2px solid #fff;
  font-size: 0.7rem;
}

.desktop-user {
  gap: 10px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
}

.desktop-user__avatar {
  width: 46px;
  height: 46px;
  border-radius: 999px;
}

.desktop-user__name {
  color: #19243f;
  font-size: 0.98rem;
}

.desktop-user__chevron {
  color: #8391ad;
  font-size: 1rem;
}

.desktop-overview-grid {
  display: grid;
  grid-template-columns: minmax(720px, 1.05fr) minmax(520px, 0.95fr);
  gap: 24px;
  align-items: start;
}

.desktop-overview-grid__left,
.desktop-overview-grid__right {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.desktop-card,
.desktop-hero {
  border: 1px solid #e5ebf6;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 16px 46px rgba(48, 73, 132, 0.07);
}

.desktop-hero {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 0.58fr) minmax(180px, 0.42fr);
  grid-template-rows: auto auto;
  align-content: space-between;
  align-items: start;
  gap: 24px 34px;
  min-height: clamp(560px, 42vw, 670px);
  padding: 54px 52px 34px;
  border: 1px solid rgba(213, 220, 255, 0.62);
  border-radius: 28px;
  background: #eef0ff url("/home/desktop-hero-bg.png") center / 100% 100% no-repeat;
  box-shadow: 0 18px 52px rgba(102, 113, 190, 0.12);
  overflow: hidden;
}

.desktop-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.28) 0%,
    rgba(255, 255, 255, 0.16) 44%,
    rgba(255, 255, 255, 0) 70%
  );
  pointer-events: none;
}

.desktop-hero__copy {
  position: relative;
  z-index: 1;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 548px;
  gap: 20px;
}

.desktop-hero__title {
  color: #111b3c;
  font-size: clamp(3.05rem, 3.35vw, 4.15rem);
  line-height: 1.1;
  letter-spacing: 0;
}

.desktop-hero__title span {
  color: #2372ff;
}

.desktop-hero__title-lock {
  color: inherit;
  font: inherit;
  white-space: nowrap;
}

.desktop-hero__support {
  max-width: 500px;
  color: #7c89a7;
  font-size: 1.14rem;
  font-weight: 700;
  line-height: 1.55;
}

.desktop-hero__today {
  width: min(100%, 526px);
  min-width: 0;
  margin-top: 14px;
  padding: 26px 30px 24px;
  border: 1px solid rgba(235, 239, 250, 0.84);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(94, 109, 177, 0.12);
  backdrop-filter: blur(6px);
}

.desktop-hero__today-label {
  color: #1d2748;
  font-size: 0.94rem;
  font-weight: 800;
}

.desktop-hero__task {
  display: grid;
  grid-template-columns: 24px max-content minmax(84px, 1fr) minmax(44px, auto);
  align-items: center;
  gap: 14px;
  margin-top: 18px;
  color: #32405f;
  font-size: 0.94rem;
  font-weight: 700;
}

.desktop-hero__task-label {
  min-width: 0;
  white-space: nowrap;
}

.desktop-hero__task-check {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid #a7b1c7;
  border-radius: 999px;
  color: #8d9ab4;
  font-size: 0.62rem;
}

.desktop-hero__task-track {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: #e9edf7;
  overflow: hidden;
}

.desktop-hero__task-track span {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #526cff 0%, #7b86ff 100%);
}

.desktop-hero__task-count {
  color: #7886a4;
  min-width: 44px;
  padding-right: 0;
  text-align: right;
}

.desktop-hero__art {
  display: none;
}

.desktop-hero__bot {
  display: none;
}

.desktop-stat-grid {
  position: relative;
  z-index: 1;
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-self: end;
  gap: clamp(18px, 1.8vw, 28px);
  margin-top: 2px;
  min-width: 0;
}

.desktop-stat {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  min-height: 132px;
  padding: 24px 28px;
  border: 0;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 16px 36px rgba(82, 99, 170, 0.1);
  backdrop-filter: blur(6px);
}

.desktop-stat > div {
  min-width: 0;
}

.desktop-stat__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: #eef3ff;
  color: #5273ff;
  font-size: 1.08rem;
}

.desktop-stat__label {
  margin-top: 0;
  color: #7886a3;
  font-size: 0.86rem;
  font-weight: 800;
}

.desktop-stat__value {
  margin-top: 6px;
  color: #121b39;
  font-size: 1.78rem;
  line-height: 1;
}

.desktop-stat__suffix {
  margin-bottom: 3px;
  color: #7a87a4;
  font-size: 0.78rem;
}

.desktop-stat__helper {
  margin-top: 10px;
  color: #7f8da9;
  font-size: 0.82rem;
}

.desktop-card {
  padding: 22px;
}

.desktop-section-head__eyebrow {
  display: none;
}

.desktop-section-head__title {
  margin: 0;
  color: #17213e;
  font-size: 1rem;
  line-height: 1.35;
  letter-spacing: -0.02em;
}

.desktop-section-head__hint {
  margin-top: 2px;
  color: #8d9ab4;
  font-size: 0.82rem;
  text-align: left;
}

.desktop-section-head__info,
.desktop-card-link {
  color: #6074ff;
  font-size: 0.82rem;
  font-weight: 800;
}

.desktop-card-link {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.desktop-quick-panel {
  min-height: 190px;
  padding: 20px 22px;
  border-radius: 18px;
}

.desktop-quick-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin-top: 16px;
}

.desktop-quick-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 14px;
  min-height: 108px;
  padding: 14px 16px;
  border-radius: 12px;
  background:
    radial-gradient(circle at top right, var(--task-glow), transparent 48%),
    #fff;
  box-shadow: inset 0 0 0 1px #e7edf7;
}

.desktop-quick-card:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 1px rgba(96, 116, 255, 0.2),
    0 16px 32px rgba(69, 84, 148, 0.1);
}

.desktop-quick-card__icon {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--task-accent) 16%, #fff 84%);
  color: var(--task-accent);
  font-size: 1rem;
}

.desktop-quick-card__title {
  color: #1f2947;
  font-size: 1.02rem;
}

.desktop-quick-card__subtitle {
  margin-top: 7px;
  white-space: pre-line;
  color: #7b89a5;
  font-size: 0.78rem;
  line-height: 1.45;
}

.desktop-quick-card__arrow {
  color: #98a5bd;
  font-size: 1.36rem;
}

.desktop-card--coach {
  min-height: 430px;
  padding: 20px 22px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
}

.desktop-coach__head,
.desktop-coach__title-wrap,
.desktop-mini-head {
  display: flex;
  align-items: center;
}

.desktop-coach__head {
  justify-content: space-between;
  gap: 18px;
}

.desktop-coach__title-wrap {
  gap: 13px;
}

.desktop-coach__spark {
  color: #6b63ff;
  font-size: 1.7rem;
}

.desktop-coach__talk {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid #e1e7f7;
  border-radius: 12px;
  background: #fff;
  color: #6074ff;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
}

.desktop-coach__banner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin-top: 18px;
  padding: 0 18px;
  border: 1px solid #f3dfc8;
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(255, 248, 237, 0.96), rgba(255, 253, 248, 0.9));
  color: #26314c;
  font-size: 0.86rem;
  line-height: 1.5;
}

.desktop-coach__summary {
  gap: 16px;
  margin-top: 18px;
}

.desktop-coach__summary-item {
  gap: 12px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.desktop-coach__avatar {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  object-fit: cover;
}

.desktop-coach__bubble {
  flex: 1;
  min-height: 72px;
  padding: 14px 16px 12px;
  border: 1px solid #e8edf7;
  border-radius: 14px;
  background: #fff;
}

.desktop-coach__bubble p {
  margin: 0;
  color: #65728d;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.65;
}

.desktop-coach__bubble time {
  display: block;
  margin-top: 4px;
  color: #9aa6ba;
  font-size: 0.74rem;
  text-align: right;
}

.desktop-coach__actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.desktop-coach__ghost {
  min-height: 62px;
  border-color: #e5ebf6;
  border-radius: 12px;
  color: #6074ff;
  background: #fff;
  font-size: 0.86rem;
}

.desktop-coach__note,
.desktop-coach__primary {
  display: none;
}

.desktop-side-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.desktop-card--mini {
  height: 228px;
  min-height: 228px;
  padding: 20px 22px;
  border-radius: 18px;
}

.desktop-mini-head {
  gap: 12px;
}

.desktop-mini-head > span:first-child {
  color: #6074ff;
  font-size: 1.2rem;
}

.desktop-mini-head__arrow {
  margin-left: auto;
  color: #9aa6ba;
  font-size: 1.5rem;
}

.desktop-reminder__title {
  margin: 20px 0 0;
  color: #202b49;
  font-size: 0.98rem;
  font-weight: 800;
}

.desktop-reminder__copy {
  margin-top: 8px;
  color: #7c89a5;
  font-size: 0.88rem;
  line-height: 1.65;
}

.desktop-mini-button {
  min-height: 42px;
  margin-top: 20px;
  padding: 0 18px;
  border: 1px solid #e4e9f8;
  border-radius: 10px;
  background: #f8faff;
  color: #6074ff;
  font-size: 0.86rem;
  font-weight: 800;
  cursor: pointer;
}

.desktop-goal {
  margin-top: 16px;
}

.desktop-goal__percent {
  margin: 0 0 10px;
  color: #17213e;
  font-size: 1.86rem;
  font-weight: 800;
  letter-spacing: -0.05em;
}

.desktop-goal__track {
  height: 8px;
  background: #e8edf7;
}

.desktop-goal__track span {
  background: linear-gradient(90deg, #556cff, #7684ff);
}

.desktop-goal__caption {
  margin-top: 12px;
  color: #7a87a4;
  font-size: 0.86rem;
}

.desktop-goal .desktop-mini-button {
  margin-top: 14px;
}

.desktop-bottom-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(330px, 1.08fr) minmax(300px, 0.95fr) minmax(360px, 1.22fr);
  gap: 24px;
}

.desktop-bottom-grid .desktop-card {
  min-height: 270px;
  padding: 20px 22px;
  border-radius: 16px;
}

.desktop-heatmap {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.desktop-heatmap__weekdays,
.desktop-heatmap__row {
  display: grid;
  grid-template-columns: 34px repeat(7, 1fr);
  align-items: center;
  gap: 10px;
}

.desktop-heatmap__weekdays span {
  color: #7e8ba8;
  font-size: 0.74rem;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.desktop-heatmap__row strong {
  color: #62708d;
  font-size: 0.78rem;
  font-weight: 800;
}

.desktop-heatmap__dot {
  display: block;
  width: 24px;
  height: 18px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid rgba(99, 102, 241, 0.12);
  background: #eef2ff;
  box-shadow: 0 1px 2px rgba(67, 56, 202, 0.06);
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.desktop-heatmap__dot--0 {
  background: #eef2ff;
}

.desktop-heatmap__dot--1 {
  background: #dbeafe;
}

.desktop-heatmap__dot--2 {
  background: #a5b4fc;
}

.desktop-heatmap__dot--3 {
  background: #6366f1;
}

.desktop-heatmap__dot--4 {
  background: #4338ca;
}

.desktop-heatmap__row .desktop-heatmap__dot:hover {
  transform: scale(1.08);
  border-color: rgba(99, 102, 241, 0.34);
  box-shadow:
    0 0 0 3px rgba(99, 102, 241, 0.16),
    0 6px 12px rgba(67, 56, 202, 0.14);
}

.desktop-heatmap__legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  color: #8c98b0;
  font-size: 0.78rem;
}

.desktop-heatmap__legend .desktop-heatmap__dot {
  width: 14px;
  height: 8px;
  border-radius: 4px;
}

.desktop-heatmap__footer,
.desktop-trend__footer {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f2f5fb;
  color: #7a86a1;
  font-size: 0.82rem;
  font-weight: 800;
}

.desktop-trend {
  margin-top: 8px;
  position: relative;
}

.desktop-trend__chart {
  width: 100%;
  height: 166px;
}

.desktop-trend__line {
  stroke: #546cff;
  stroke-width: 3.4;
}

.desktop-trend__point {
  stroke: #546cff;
  stroke-width: 3.4;
}

.desktop-trend__labels {
  margin-top: 0;
  padding-right: 12px;
  padding-left: 44px;
}

.desktop-trend__label span {
  color: #8d98ad;
  font-size: 0.76rem;
}

.desktop-trend__footer {
  display: inline-flex;
  margin-top: 4px;
  background: transparent;
  color: #7b88a5;
}

.desktop-weak-list,
.desktop-recent-list {
  gap: 10px;
  margin-top: 16px;
}

.desktop-weak-item,
.desktop-recent-item {
  min-height: 52px;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  box-shadow: inset 0 0 0 1px #ebeff8;
}

.desktop-weak-item__rank {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #fff3ec;
  color: #f26934;
  font-size: 1.02rem;
}

.desktop-weak-item:nth-child(2) .desktop-weak-item__rank {
  background: #eef3ff;
  color: #33466e;
}

.desktop-weak-item:nth-child(3) .desktop-weak-item__rank {
  background: #fff5ea;
  color: #ee7c35;
}

.desktop-weak-item__copy {
  flex: 1;
}

.desktop-weak-item__row {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
}

.desktop-weak-item__row strong {
  overflow: hidden;
  color: #24304f;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-weak-item__row span,
.desktop-weak-item__row em {
  color: #7f8ba4;
  font-size: 0.76rem;
  font-style: normal;
  font-weight: 800;
}

.desktop-recent-item {
  align-items: center;
}

.desktop-recent-item__pill {
  min-width: 34px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 0.72rem;
}

.desktop-recent-item__copy {
  flex: 1;
}

.desktop-recent-item__copy strong {
  color: #24304f;
  font-size: 0.84rem;
}

.desktop-recent-item__copy span {
  color: #8b97ad;
  font-size: 0.74rem;
}

.desktop-recent-item__score,
.desktop-recent-item__time {
  color: #77839c;
  font-size: 0.76rem;
  white-space: nowrap;
}

.desktop-recent-item__arrow {
  color: #9aa6ba;
  font-size: 1.18rem;
}

@media (max-width: 1600px) {
  .desktop-home {
    grid-template-columns: 244px minmax(0, 1fr);
    gap: 24px;
    padding-right: 24px;
  }

  .desktop-overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .desktop-overview-grid__right {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(420px, 0.75fr);
  }

  .desktop-side-cards {
    grid-template-columns: 1fr;
  }

  .desktop-bottom-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1200px) {
  .desktop-home {
    grid-template-columns: 218px minmax(0, 1fr);
    gap: 18px;
    padding-right: 18px;
  }

  .desktop-topbar {
    align-items: stretch;
  }

  .desktop-search {
    width: auto;
    flex: 1;
  }

  .desktop-hero,
  .desktop-overview-grid__right,
  .desktop-side-cards,
  .desktop-bottom-grid {
    grid-template-columns: 1fr;
  }

  .desktop-quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.desktop-overview-grid__left {
  gap: 18px;
}

.desktop-hero {
  grid-template-rows: auto auto;
  gap: clamp(34px, 4.2vw, 62px) 28px;
  min-height: 540px;
  padding-bottom: 34px;
}

.desktop-hero__art {
  display: none;
}

.desktop-hero__today {
  padding: 26px 30px 24px;
}

.desktop-quick-panel {
  min-height: 190px;
}

.desktop-quick-card {
  position: relative;
  grid-template-columns: 34px minmax(0, 1fr);
  min-height: 96px;
  padding: 12px 26px 12px 14px;
  gap: 10px;
}

.desktop-quick-card__icon {
  width: 34px;
  height: 34px;
  font-size: 0.86rem;
}

.desktop-quick-card__subtitle {
  font-size: 0.76rem;
  line-height: 1.42;
}

.desktop-quick-card__arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
}

.desktop-heatmap {
  grid-template-columns: 1fr;
}

.desktop-heatmap__weekdays,
.desktop-heatmap__row {
  min-width: 0;
}

/* Laptop-width desktop guard: keep the reference two-column layout instead of dropping cards out of row. */
@media (min-width: 1280px) {
  .desktop-home {
    grid-template-columns: clamp(220px, 13.3vw, 272px) minmax(0, 1fr);
    gap: clamp(18px, 1.7vw, 36px);
    padding-right: clamp(18px, 1.7vw, 34px);
  }

  .desktop-main,
  .desktop-topbar,
  .desktop-topbar__tools,
  .desktop-overview-grid,
  .desktop-overview-grid__left,
  .desktop-overview-grid__right {
    min-width: 0;
  }

  .desktop-search {
    width: clamp(320px, 31vw, 506px);
    flex: 0 1 clamp(320px, 31vw, 506px);
  }

  .desktop-overview-grid {
    grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
    gap: clamp(18px, 1.5vw, 24px);
  }

  .desktop-overview-grid__right {
    display: flex;
    flex-direction: column;
  }

  .desktop-side-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-bottom-grid {
    grid-template-columns: minmax(230px, 0.9fr) minmax(280px, 1fr) minmax(260px, 0.95fr) minmax(320px, 1.15fr);
    gap: clamp(16px, 1.3vw, 24px);
  }
}

@media (min-width: 1280px) and (max-width: 1520px) {
  .desktop-overview-grid {
    grid-template-columns: minmax(0, 1.18fr) minmax(420px, 0.82fr);
  }

  .desktop-home {
    padding-bottom: 22px;
  }

  .desktop-sidebar {
    padding-left: 12px;
    padding-right: 12px;
  }

  .desktop-sidebar__brand {
    padding: 0 12px;
  }

  .desktop-sidebar__resource {
    margin: 150px 4px 0;
    min-height: 180px;
    padding: 20px 16px 16px;
  }

  .desktop-nav-item {
    min-height: 48px;
    gap: 12px;
    padding: 0 16px;
    font-size: 0.94rem;
  }

  .desktop-main {
    gap: 18px;
    padding-top: 22px;
  }

  .desktop-topbar {
    min-height: 70px;
  }

  .desktop-topbar__title {
    font-size: 1.22rem;
  }

  .desktop-topbar__eyebrow {
    font-size: 0.82rem;
  }

  .desktop-hero {
    grid-template-columns: minmax(0, 0.6fr) minmax(180px, 0.4fr);
    grid-template-rows: auto auto;
    min-height: clamp(620px, 44vw, 700px);
    padding: 42px 36px 30px;
    gap: clamp(36px, 4.2vw, 62px) 24px;
  }

  .desktop-hero__title {
    max-width: 500px;
    font-size: clamp(2.6rem, 3.45vw, 3.55rem);
    white-space: normal;
  }

  .desktop-hero__support {
    font-size: 1rem;
  }

  .desktop-hero__today {
    width: min(100%, 500px);
    margin-top: 12px;
    padding: 22px 28px;
  }

  .desktop-hero__task {
    grid-template-columns: 22px max-content minmax(74px, 1fr) minmax(42px, auto);
    gap: 10px;
    margin-top: 14px;
    font-size: 0.84rem;
  }

  .desktop-hero__art {
    display: none;
  }

  .desktop-hero__bot {
    display: none;
  }

  .desktop-stat-grid {
    gap: 12px;
  }

  .desktop-stat {
    min-height: 94px;
    padding: 16px 18px;
    gap: 12px;
  }

  .desktop-stat__icon {
    width: 36px;
    height: 36px;
  }

  .desktop-stat__value {
    font-size: 1.46rem;
  }

  .desktop-stat__helper {
    margin-top: 6px;
  }

  .desktop-quick-panel {
    min-height: 160px;
    padding: 18px;
  }

  .desktop-quick-grid {
    gap: 12px;
    margin-top: 14px;
  }

  .desktop-quick-card {
    grid-template-columns: 32px minmax(0, 1fr);
    min-height: 82px;
    padding: 10px 18px 10px 12px;
    text-align: left;
  }

  .desktop-quick-card__icon {
    width: 32px;
    height: 32px;
  }

  .desktop-quick-card__title,
  .desktop-quick-card__subtitle {
    word-break: keep-all;
    overflow-wrap: normal;
  }

  .desktop-quick-card__title {
    font-size: 0.92rem;
  }

  .desktop-quick-card__subtitle {
    display: -webkit-box;
    overflow: hidden;
    font-size: 0.72rem;
    line-height: 1.38;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .desktop-card--coach {
    min-height: 410px;
    padding: 18px;
  }

  .desktop-coach__banner {
    min-height: 46px;
    margin-top: 14px;
    font-size: 0.78rem;
  }

  .desktop-coach__summary {
    gap: 12px;
    margin-top: 14px;
  }

  .desktop-coach__bubble {
    min-height: 66px;
    padding: 12px 14px 10px;
  }

  .desktop-coach__bubble p {
    font-size: 0.8rem;
    line-height: 1.55;
  }

  .desktop-coach__actions {
    gap: 10px;
  }

  .desktop-coach__ghost {
    min-height: 50px;
    font-size: 0.78rem;
  }

  .desktop-card--mini {
    height: 198px;
    min-height: 198px;
    padding: 18px;
  }

  .desktop-reminder__title {
    margin-top: 16px;
    font-size: 0.88rem;
  }

  .desktop-reminder__copy,
  .desktop-goal__caption {
    font-size: 0.78rem;
  }

  .desktop-mini-button {
    min-height: 36px;
    margin-top: 14px;
  }

  .desktop-goal {
    margin-top: 12px;
  }

  .desktop-goal__percent {
    font-size: 1.58rem;
  }

  .desktop-bottom-grid .desktop-card {
    min-height: 224px;
    padding: 18px;
  }

  .desktop-heatmap__weekdays,
  .desktop-heatmap__row {
    grid-template-columns: 30px repeat(7, minmax(16px, 1fr));
    gap: 7px;
  }

  .desktop-heatmap__dot {
    width: 22px;
    height: 16px;
  }

  .desktop-trend__chart {
    height: 140px;
  }

  .desktop-weak-item,
  .desktop-recent-item {
    padding: 8px 10px;
  }

  .desktop-weak-item__row {
    grid-template-columns: minmax(86px, 1fr) auto;
  }

  .desktop-weak-item__row em {
    display: none;
  }

  .desktop-recent-item__time {
    display: none;
  }
}

@media (min-width: 1024px) and (max-width: 1279px) {
  .desktop-home {
    grid-template-columns: 196px minmax(0, 1fr);
    gap: 16px;
    padding: 0 16px 24px 0;
  }

  .desktop-sidebar {
    padding: 22px 10px 20px;
  }

  .desktop-sidebar__brand {
    gap: 10px;
    padding: 0 10px;
  }

  .desktop-sidebar__brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .desktop-sidebar__brand-mark::before {
    inset: 9px 7px 7px 10px;
    border-width: 6px;
  }

  .desktop-sidebar__brand-title {
    font-size: 1.34rem;
  }

  .desktop-sidebar__nav {
    gap: 10px;
    margin-top: 34px;
  }

  .desktop-nav-item {
    min-height: 44px;
    gap: 10px;
    padding: 0 12px;
    font-size: 0.88rem;
  }

  .desktop-nav-item__icon {
    width: 22px;
    height: 22px;
    font-size: 0.92rem;
  }

  .desktop-sidebar__resource {
    margin: 108px 2px 0;
    min-height: 156px;
    padding: 16px 12px 14px;
  }

  .desktop-sidebar__resource-eyebrow {
    font-size: 0.82rem;
  }

  .desktop-sidebar__resource-title {
    max-width: 120px;
    margin-top: 8px;
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .desktop-sidebar__resource-btn {
    min-height: 34px;
    margin-top: 14px;
    padding: 0 12px;
    font-size: 0.76rem;
  }

  .desktop-sidebar__gift {
    right: 12px;
    bottom: 16px;
    width: 42px;
    height: 42px;
    border-radius: 14px;
    font-size: 1.5rem;
  }

  .desktop-main,
  .desktop-topbar,
  .desktop-topbar__tools,
  .desktop-overview-grid,
  .desktop-overview-grid__left,
  .desktop-overview-grid__right {
    min-width: 0;
  }

  .desktop-main {
    gap: 16px;
    padding-top: 18px;
  }

  .desktop-topbar {
    align-items: flex-start;
    min-height: auto;
    gap: 12px;
  }

  .desktop-topbar__title {
    font-size: 1.06rem;
  }

  .desktop-topbar__eyebrow {
    max-width: 360px;
    font-size: 0.76rem;
  }

  .desktop-topbar__tools {
    flex: 1;
    justify-content: flex-end;
    gap: 10px;
  }

  .desktop-search {
    width: min(330px, 38vw);
    flex: 0 1 min(330px, 38vw);
    min-height: 42px;
    padding: 0 12px;
  }

  .desktop-search input {
    font-size: 0.78rem;
  }

  .desktop-search__hint {
    display: none;
  }

  .desktop-notify {
    width: 36px;
    height: 36px;
  }

  .desktop-user__avatar {
    width: 38px;
    height: 38px;
  }

  .desktop-user__name,
  .desktop-user__chevron {
    display: none;
  }

  .desktop-overview-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .desktop-overview-grid__left,
  .desktop-overview-grid__right {
    gap: 16px;
  }

  .desktop-overview-grid__right {
    display: flex;
    flex-direction: column;
  }

  .desktop-hero {
    grid-template-columns: minmax(0, 0.64fr) minmax(150px, 0.36fr);
    grid-template-rows: auto auto;
    min-height: clamp(640px, 62vw, 700px);
    gap: clamp(34px, 5vw, 58px) 16px;
    padding: 34px 24px 24px;
  }

  .desktop-hero__copy {
    min-width: 0;
    gap: 14px;
  }

  .desktop-hero__title {
    max-width: none;
    font-size: clamp(2.72rem, 4.7vw, 3.45rem);
    line-height: 1.08;
  }

  .desktop-hero__support {
    font-size: 1rem;
    line-height: 1.55;
  }

  .desktop-hero__today {
    width: 100%;
    max-width: none;
    margin-top: 22px;
    padding: 20px 24px;
  }

  .desktop-hero__task {
    grid-template-columns: 20px max-content minmax(70px, 1fr) minmax(40px, auto);
    gap: 8px;
    margin-top: 12px;
    font-size: 0.82rem;
  }

  .desktop-hero__art {
    display: none;
  }

  .desktop-hero__bot {
    display: none;
  }

  .desktop-stat-grid {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 0;
  }

  .desktop-stat {
    min-height: 94px;
    gap: 10px;
    padding: 14px 12px;
    border-radius: 16px;
  }

  .desktop-stat__icon {
    width: 34px;
    height: 34px;
    font-size: 0.88rem;
  }

  .desktop-stat__label {
    font-size: 0.75rem;
  }

  .desktop-stat__value {
    font-size: 1.3rem;
  }

  .desktop-stat__helper {
    margin-top: 6px;
    font-size: 0.72rem;
  }

  .desktop-quick-panel {
    min-height: auto;
    padding: 16px;
  }

  .desktop-quick-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .desktop-quick-card {
    grid-template-columns: 1fr;
    place-items: center;
    min-height: 74px;
    gap: 6px;
    padding: 10px 8px;
    text-align: center;
  }

  .desktop-quick-card__icon {
    width: 30px;
    height: 30px;
  }

  .desktop-quick-card__title {
    font-size: 0.82rem;
  }

  .desktop-quick-card__subtitle,
  .desktop-quick-card__arrow {
    display: none;
  }

  .desktop-card--coach {
    min-height: auto;
    padding: 18px;
  }

  .desktop-coach__summary {
    gap: 10px;
  }

  .desktop-coach__bubble {
    min-height: auto;
  }

  .desktop-coach__actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .desktop-side-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .desktop-card--mini {
    height: auto;
    min-height: 170px;
  }

  .desktop-bottom-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .desktop-bottom-grid .desktop-card {
    min-height: 218px;
  }
}
</style>
