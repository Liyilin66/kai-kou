<template>
  <div class="shell">

    <!-- ═══════════════ SIDEBAR ═══════════════ -->
    <aside class="home-agent-sidebar">
      <RouterLink class="home-agent-logo" to="/home" aria-label="返回首页">
        <div class="home-agent-logo-icon" aria-hidden="true">
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95" />
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75" />
          </svg>
        </div>
        <span class="home-agent-logo-name">开口 PTE</span>
      </RouterLink>

      <nav class="home-agent-nav" aria-label="首页导航">
        <RouterLink
          v-for="item in displayNavItems"
          :key="item.key"
          class="home-agent-nav-item"
          :class="{ 'home-agent-nav-item--active': isNavActive(item) }"
          :to="item.to"
          :aria-current="isNavActive(item) ? 'page' : undefined"
        >
          <span class="home-agent-nav-icon" aria-hidden="true" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="home-agent-sidebar-footer">
        <div class="home-agent-promo">
          <div class="home-agent-promo-title">WE 模板库</div>
          <div class="home-agent-promo-sub">写作结构 · 常用表达</div>
          <button class="home-agent-promo-button" type="button" @click="goTo('/we/templates')">查看模板</button>
        </div>
      </div>
    </aside>

    <!-- ═══════════════ MAIN ═══════════════ -->
    <div class="main">
      <header class="topbar">
        <div class="tb-left">
          <div class="tb-greet">你好，{{ username }}</div>
          <div class="tb-sub">坚持每天进步一点，PTE 梦想更近一步！</div>
        </div>
        <div class="tb-right">
          <div class="vip-pill" :class="`vip-pill--${membershipPill.kind}`">{{ membershipPill.label }}</div>
          <div class="user-av">
            <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
            <span v-else>{{ userInitial }}</span>
          </div>
          <span class="user-name">{{ username }}</span>
        </div>
      </header>

      <div class="scroll">

        <!-- ── ROW 1：控台 + 快捷入口 + AI 私教 ── -->
        <div class="row row-top">
          <div class="card hero-card">
            <div class="hc-top">
              <div class="hc-eyebrow">PTE 学习总控台</div>
              <div class="hc-title">最近 RA 均分 <em class="kk-num">{{ raAvg }}</em> 分</div>
              <div class="hc-sub">{{ heroSubtitle }}</div>
              <div class="task-block">
                <div class="task-hd"><div class="task-hd-dot"></div>{{ heroTaskTitle }}</div>
                <div v-for="task in todayTasks" :key="task.key" class="t-row">
                  <div class="t-chk" :class="{ done: task.done }">
                    <svg v-if="task.done" width="9" height="9" fill="none" viewBox="0 0 9 9">
                      <path d="M1.5 4.5l2.5 2.5 3.5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <span class="t-lbl">{{ task.label }}</span>
                  <div class="t-bar-bg"><div class="t-bar-fill" :style="{ width: task.progressPercent }"></div></div>
                  <span class="t-cnt">{{ task.current }}/{{ task.total }}</span>
                </div>
              </div>
            </div>
            <div class="hc-bottom">
              <div v-for="stat in heroStats" :key="stat.label" class="s3">
                <div>
                  <div class="s3-val kk-num">{{ stat.value }}<span class="s3-unit">{{ stat.unit }}</span></div>
                  <div class="s3-label">{{ stat.label }}</div>
                  <div class="s3-sub">{{ stat.sub }}</div>
                </div>
              </div>
            </div>
          </div>

          <div id="quick" class="card sc-card">
            <div class="sec-title">模块快捷入口</div>
            <div class="sc-grid">
              <div v-for="mod in modules" :key="mod.code"
                class="sc-item" :class="`sc-${mod.code.toLowerCase()}`"
                role="button" tabindex="0"
                @click="goTo(mod.to)"
                @keydown.enter.prevent="goTo(mod.to)"
                @keydown.space.prevent="goTo(mod.to)">
                <div class="sc-code">{{ mod.code }}</div>
                <div class="sc-desc">{{ mod.desc }}</div>
                <div class="sc-tag">
                  {{ mod.tag }}
                </div>
              </div>
            </div>
          </div>

          <div class="card ai-card">
            <div class="ai-header">
              <div class="ai-header-left">
                <div><div class="ai-title">AI 私教</div><div class="ai-subtitle">为你量身建议</div></div>
              </div>
              <span class="ai-link" role="button" tabindex="0" @click="goTo('/agent')" @keydown.enter.prevent="goTo('/agent')" @keydown.space.prevent="goTo('/agent')">与 AI 私教对话 →</span>
            </div>
            <div class="ai-banner">
              <span>{{ homeCoachBanner }}</span>
            </div>
            <div v-if="aiMessages.length" class="ai-messages">
              <div v-for="msg in aiMessages" :key="msg.id" class="ai-msg">
                <div class="ai-msg-av">AI</div>
                <div class="ai-msg-bubble">
                  <div class="ai-msg-text">{{ msg.text }}</div>
                  <div v-if="msg.time" class="ai-msg-time">{{ msg.time }}</div>
                </div>
              </div>
            </div>
            <div v-else class="ai-empty">还没有足够练习记录，先做一道 RA，AI 私教会按真实数据给建议。</div>
            <div class="ai-actions">
              <div v-for="act in aiActions" :key="act.label" class="ai-act-btn" role="button" tabindex="0" @click="goTo(act.to)" @keydown.enter.prevent="goTo(act.to)" @keydown.space.prevent="goTo(act.to)">{{ act.label }}</div>
            </div>
          </div>
        </div>

        <!-- ── ROW 2：今日 AI 建议 ── -->
        <div class="row row-advice">

          <div class="card advice-card">
            <div class="advice-header">
              <div class="sec-title" style="margin-bottom:0">今日 AI 建议</div>
              <span class="badge-outline">{{ dailyAiSuggestionStatusLabel }}</span>
            </div>
            <div class="adv-banner">
              <span class="adv-banner-text">{{ dailyAiBannerText }}</span>
            </div>
            <div class="adv-headline">{{ dailyAiSuggestion.headline }}</div>
            <div class="adv-body">{{ dailyAiSuggestion.reason }}<br>{{ dailyAiSuggestion.advice }}</div>
            <div class="adv-tags">
              <span v-for="task in dailyAiSuggestionTasks" :key="`${task.task_type}-${task.count}`" class="adv-tag">
                {{ task.task_type }} {{ task.count }} 道
              </span>
            </div>
            <div class="adv-meta">{{ dailyAiSuggestionTimeLabel }}</div>
            <div class="adv-questions">
              <div v-for="q in adviceQuestions" :key="q.label" class="adv-q" role="button" tabindex="0" @click="goTo(q.to)" @keydown.enter.prevent="goTo(q.to)" @keydown.space.prevent="goTo(q.to)">
                <span class="adv-q-text">{{ q.label }}</span>
                <span class="adv-q-arr">›</span>
              </div>
            </div>
            <div class="adv-btns">
              <button type="button" class="btn-primary" @click="goTo(dailyAiMainTaskPath)">{{ dailyAiSuggestion.cta_text }}</button>
              <button type="button" class="btn-ghost" @click="goTo('/agent')">问 AI 私教</button>
            </div>
          </div>

        </div>

        <!-- ── ROW 3：学习报告：热力图 + 趋势 + 弱项 + 本周目标 + 最近练习 ── -->
        <div id="report" class="row row-report">

          <div class="card hm-card">
            <div class="sec-title">本周学习热力图</div>
            <div class="hm-days">
              <div
                v-for="day in heatDays"
                :key="`${day.label}-${day.dateLabel}`"
                class="hm-dlbl"
                :class="{ today: day.isToday }"
                :title="day.dateLabel"
              >
                {{ day.label }}
              </div>
            </div>
            <div class="hm-grid">
              <div v-for="row in heatRows" :key="row.label" class="hm-row">
                <span class="hm-code">{{ row.label }}</span>
                <div
                  v-for="(cell, i) in row.cells"
                  :key="`${row.label}-${i}`"
                  class="hm-cell"
                  :class="[heatClass(cell.level), { 'hm-today': cell.isToday }]"
                  :title="formatHeatCellTitle(row, cell)"
                ></div>
              </div>
            </div>
            <div class="hm-footer">
              <span>少</span>
              <div class="hm-legend">
                <div v-for="level in heatLegendLevels" :key="level" class="hml" :class="heatClass(level)"></div>
              </div>
              <span>多</span>
              <span class="hm-total">{{ weeklyStudyFoot }}</span>
            </div>
          </div>

          <div class="card trend-card">
            <div class="trend-header">
              <div class="sec-title" style="margin-bottom:0">得分趋势（近 7 天）</div>
              <div class="trend-avg">
                <div class="trend-avg-lbl">{{ trendScoreChip.label }}</div>
                <div class="trend-avg-val kk-num">{{ trendScoreChip.value }}</div>
              </div>
            </div>
            <svg class="chart-svg" viewBox="0 0 260 136" role="img" aria-label="近 7 天得分趋势">
              <line
                v-for="tick in trendYTicks"
                :key="`trend-grid-${tick.value}`"
                :x1="TREND_CHART.left"
                :x2="TREND_CHART.right"
                :y1="tick.y"
                :y2="tick.y"
                class="trend-grid"
              />
              <text
                v-for="tick in trendYTicks"
                :key="`trend-tick-${tick.value}`"
                :x="6"
                :y="tick.y + 3"
                class="trend-axis"
              >
                {{ tick.value }}
              </text>
              <polyline
                v-for="segment in trendDrawableSegments"
                :key="segment.key"
                :points="segment.polyline"
                class="trend-line"
              />
              <text v-if="!trendHasData" x="135" y="62" text-anchor="middle" class="trend-empty">{{ trendEmptyText }}</text>
              <text
                v-for="label in trendAxisLabels"
                :key="`trend-date-${label.key}`"
                :x="label.x"
                y="126"
                text-anchor="middle"
                class="trend-date"
              >
                {{ label.label }}
              </text>
              <circle
                v-for="point in trendPlotPoints"
                :key="point.key"
                :cx="point.x"
                :cy="point.y"
                r="4"
                class="trend-point"
              >
                <title>{{ formatTrendPointTitle(point) }}</title>
              </circle>
            </svg>
            <div class="trend-note">{{ trendFootText }}</div>
          </div>

          <div class="card weak-card">
            <div class="sec-title">我的弱项 Top 3</div>
            <div v-if="hasWeakItems" class="weak-list">
              <div v-for="w in weakItems" :key="w.rank" class="weak-item">
                <div class="weak-rank">{{ w.rank }}</div>
                <div>
                  <div class="weak-name">{{ w.title }}</div>
                  <div class="weak-score">{{ w.metricLabel }} · {{ w.delta }}</div>
                </div>
              </div>
            </div>
            <div v-else class="weak-empty">练习数据还不够，完成几道题后会自动识别弱项。</div>
          </div>

          <div id="goal" class="card goal-card">
            <div class="goal-header">
              <div class="sec-title" style="margin-bottom:0">本周目标进度</div>
              <span class="badge-green">{{ weeklyGoalStatusLabel }}</span>
            </div>
            <div class="goal-top">
              <div class="goal-left">
                <div class="goal-pct kk-num">{{ weekProgress }}%</div>
                <div class="goal-done">已完成 {{ weekDone }} / {{ weekTotal }} 题</div>
              </div>
              <div class="goal-ring-wrap">
                <svg width="66" height="66" viewBox="0 0 66 66">
                  <circle class="ring-track" cx="33" cy="33" r="26" fill="none" stroke-width="6"/>
                  <circle class="ring-fill" cx="33" cy="33" r="26" fill="none" stroke-width="6"
                    stroke-linecap="round" :stroke-dasharray="ringDash"
                    stroke-dashoffset="41" transform="rotate(-90 33 33)"/>
                </svg>
                <div class="ring-center">{{ weekProgress }}%</div>
              </div>
            </div>
            <div class="goal-bar-section">
              <div class="goal-bar-labels"><span>本周进度</span><span>{{ weekDone }}/{{ weekTotal }} 题</span></div>
              <div class="goal-bar-bg"><div class="goal-bar-fill" :style="{ width: weekProgress + '%' }"></div></div>
            </div>
            <div class="goal-breakdown">
              <div v-for="g in goalBreakdown" :key="g.code" class="gb-row">
                <span class="gb-code">{{ g.code }}</span>
                <div class="gb-bar-bg">
                  <div class="gb-bar-fill" :style="{ width: g.percent + '%' }"></div>
                </div>
                <span class="gb-val">{{ g.done }}/{{ g.total }}</span>
              </div>
            </div>
            <div class="goal-btns">
              <button type="button" class="goal-btn goal-btn-p goal-btn-wide" @click="openGoalModal">设置本周目标</button>
            </div>
          </div>
          <div class="card recent-card">
            <div class="sec-title">最近练习</div>
            <div v-if="hasRecentItems" class="recent-list">
              <div v-for="r in recentItems" :key="r.key" class="rec-item" role="button" tabindex="0" @click="goTo(r.to)" @keydown.enter.prevent="goTo(r.to)" @keydown.space.prevent="goTo(r.to)">
                <div class="rec-badge">{{ r.code }}</div>
                <div>
                  <div class="rec-name">{{ r.name }}</div>
                  <div class="rec-meta">{{ r.score }} · {{ r.date }}</div>
                </div>
                <span class="rec-arr">›</span>
              </div>
            </div>
            <div v-else class="recent-empty">暂无练习记录，完成一次练习后这里会自动更新。</div>
          </div>
        </div>

      </div>
    </div>

    <div v-if="goalModalOpen" class="goal-modal-backdrop" @click.self="closeGoalModal">
      <section class="goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
        <div class="goal-modal-head">
          <div>
            <p class="goal-modal-kicker">Weekly Target</p>
            <h2 id="goal-modal-title">设置本周目标</h2>
          </div>
          <button type="button" class="goal-modal-close" aria-label="关闭" @click="closeGoalModal">×</button>
        </div>
        <div class="goal-modal-body">
          <label v-for="item in goalDraftRows" :key="item.code" class="goal-modal-row">
            <span>
              <b>{{ item.code }}</b>
              <em>{{ item.name }}</em>
            </span>
            <input
              type="number"
              min="0"
              max="99"
              step="1"
              :value="item.value"
              @input="updateGoalDraft(item.code, $event.target.value)"
            />
          </label>
        </div>
        <div class="goal-modal-summary">
          <span>目标总数 <b>{{ goalDraftTotal }}</b> 题</span>
          <span>本周已完成 <b>{{ weekDone }}</b> 题</span>
        </div>
        <div class="goal-modal-actions">
          <button type="button" class="goal-modal-ghost" @click="resetGoalDraft">清空</button>
          <button type="button" class="goal-modal-primary" @click="saveGoalDraft">保存目标</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { requestDailyAiSuggestion } from "@/lib/agent";
import { isDIEnabled } from "@/lib/di-feature";
import { HOME_TASK_TYPES, getEnabledTaskTypes, hasUnavailableTaskRecommendation } from "@/lib/enabled-task-types";
import { formatInteger, formatScore, loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";
import {
  buildDesktopDashboardState,
  createEmptyDesktopDashboardState,
  fetchDashboardPracticeRowsForAuth,
  fetchDashboardScoreTrendRowsForAuth
} from "@/lib/home-desktop-dashboard";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const diEnabled = computed(() => isDIEnabled());
const enabledHomeTaskTypes = computed(() => getEnabledTaskTypes({
  types: HOME_TASK_TYPES,
  diEnabled: diEnabled.value
}));
const enabledHomeTaskTypeSet = computed(() => new Set(enabledHomeTaskTypes.value));
const dashboard = ref(createEmptyDesktopDashboardState(null, { diEnabled: diEnabled.value }));
const dashboardLoadError = ref("");
const TREND_MIN_SCORE = 10;
const TREND_MAX_SCORE = 90;
const TREND_Y_TICKS = [90, 70, 50, 30, 10];
const TREND_CHART = {
  left: 28,
  right: 252,
  top: 12,
  bottom: 108
};

const DAILY_SUGGESTION_TASK_TYPES = HOME_TASK_TYPES;
const dailyTaskPathMap = {
  RA: "/ra",
  WFD: "/wfd",
  WE: "/we",
  DI: "/di",
  RTS: "/rts/practice"
};
const taskPathMap = {
  RA: "/ra",
  WFD: "/wfd",
  WE: "/we",
  DI: "/di",
  RTS: "/rts/practice",
  RS: "/rs",
  RL: "/rl"
};

const dailyAiSuggestionState = ref(createDailySuggestionState());
let dailySuggestionLoadPromise = null;
const goalModalOpen = ref(false);
const goalDraft = ref({});

const username = computed(() => authStore.displayName || "同学");
const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const userInitial = computed(() => {
  const first = `${username.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});
const homeAnalytics = computed(() => dashboard.value.homeAnalytics || {});
const moduleMetrics = computed(() => dashboard.value.moduleMetrics || {});
const raAvg = computed(() => {
  if (dashboard.value.loading) return "--";
  const score = moduleMetrics.value.RA?.averageScore;
  return score === null || score === undefined ? "--" : formatScore(score);
});
const streakDays = computed(() => {
  if (dashboard.value.loading) return "--";
  return formatInteger(homeAnalytics.value.currentStreak);
});
const membershipPill = computed(() => {
  if (!authStore.loaded) {
    return { kind: "loading", icon: "⌛", label: "同步中" };
  }
  if (authStore.isPremium) {
    return { kind: "vip", icon: "👑", label: "VIP 无限练习" };
  }
  if (authStore.isInTrial) {
    return { kind: "trial", icon: "✨", label: `试用 ${formatInteger(authStore.trialDaysLeft)} 天` };
  }
  return { kind: "locked", icon: "🔒", label: "未开通" };
});

const navIconMap = {
  home: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>',
  list: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  spark: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M7 1.5C4.24 1.5 2 3.74 2 6.5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6.5h4M7 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  square: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  report: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 11l3-4 3 2.5 3-5 2 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 3h11M1.5 7h7M1.5 11h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  circle: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
};

const navItems = [
  { key: "home", label: "首页", icon: "home", to: "/home" },
  { key: "practice", label: "练习中心", icon: "list", to: "/home#quick" },
  { key: "agent", label: "AI 私教", icon: "spark", to: "/agent" },
  { key: "plan", label: "学习计划", icon: "square", to: "/home#goal" },
  { key: "report", label: "学习报告", icon: "report", to: "/home#report" },
  { key: "profile", label: "个人中心", icon: "circle", to: "/profile" }
];

const displayNavItems = computed(() =>
  navItems.map((item) => ({
    ...item,
    icon: navIconMap[item.icon] || navIconMap.circle
  }))
);

function goTo(path) {
  if (!path || path === route.path) return;
  router.push(path);
}

function isNavActive(item) {
  if (item.key === "home") return (route.path === "/home" || route.path === "/") && !route.hash;
  return route.path === item.to || route.fullPath === item.to;
}

function scrollToHash(hash = route.hash) {
  const id = `${hash || ""}`.replace(/^#/, "");
  if (!id || typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

const heroTask = computed(() => dashboard.value.heroTask || {});
const heroTaskTitle = computed(() => heroTask.value.title || "今日重点");
const heroSubtitle = computed(() => {
  if (dashboard.value.loading) return "正在同步你的真实练习记录，今日任务会自动刷新。";
  if (dashboardLoadError.value) return "暂时无法同步练习记录，已保留默认任务。";
  return heroTask.value.subtitle || "按真实记录安排今日任务 · 持续练习让分数稳步上升";
});
const todayTasks = computed(() => {
  const checklist = Array.isArray(heroTask.value.checklist) ? heroTask.value.checklist : [];
  return checklist.map((item, index) => {
    const total = Math.max(0, Number(item.total ?? item.target_count ?? 0) || 0);
    const current = Math.max(0, Math.min(total, Number(item.current ?? item.completed_count_today ?? 0) || 0));
    const ratio = total > 0 ? Math.min(current / total, 1) : 0;
    return {
      key: `${item.task_type || item.label || "task"}-${index}`,
      label: item.label || "完成今日练习",
      done: total > 0 && current >= total,
      total,
      current,
      progressPercent: `${Math.round(ratio * 100)}%`
    };
  });
});

const heroStats = computed(() => [
  {
    icon: "✅",
    bg: "#DFF0E4",
    value: dashboard.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore),
    unit: homeAnalytics.value.averageScore === null || homeAnalytics.value.averageScore === undefined ? "" : "/90",
    label: "平均均分",
    sub: homeAnalytics.value.scoreComparisonText || "暂无上周对比"
  },
  {
    icon: "📝",
    bg: "#E8E4F4",
    value: dashboard.value.loading ? "--" : formatInteger(homeAnalytics.value.totalCount),
    unit: " 题",
    label: "练习总量",
    sub: `今日完成 ${formatInteger(homeAnalytics.value.todayCount)} 题`
  },
  {
    icon: "🔥",
    bg: "#F2E4D0",
    value: dashboard.value.loading ? "--" : formatInteger(homeAnalytics.value.currentStreak),
    unit: " 天",
    label: "连续学习",
    sub: `最长 ${formatInteger(homeAnalytics.value.longestStreak)} 天`
  }
]);

const dailySuggestionCacheKey = computed(() => {
  const userId = `${authStore.user?.id || ""}`.trim();
  return userId ? `pte_daily_ai_suggestion:${userId}:${getTodayDateKey()}` : "";
});
const dailyPracticeSummary = computed(() => buildDailyPracticeSummaryFromDashboard());
const dailyAiSuggestion = computed(() => dailyAiSuggestionState.value.suggestion || createNewUserDailySuggestion());
const dailyAiSuggestionTasks = computed(() =>
  sanitizeDailySuggestionTasks(dailyAiSuggestion.value.tasks, dailyAiSuggestion.value.main_task_type)
);
const dailyAiSuggestionStatusLabel = computed(() => {
  if (dailyAiSuggestionState.value.loading) return "生成中";
  if (dailyAiSuggestionState.value.source === "agent") return "AI 已生成";
  if (dailyAiSuggestionState.value.source === "new_user") return "新手建议";
  return "临时建议";
});
const dailyAiSuggestionTimeLabel = computed(() => {
  if (dailyAiSuggestionState.value.loading) return "正在生成今日 AI 建议...";
  if (dailyAiSuggestionState.value.source === "new_user") return "新手建议";
  if (dailyAiSuggestionState.value.source === "fallback") {
    return `临时建议 · ${formatSuggestionGeneratedAt(dailyAiSuggestionState.value.generated_at)}`;
  }
  return formatSuggestionGeneratedAt(dailyAiSuggestionState.value.generated_at);
});
const dailyAiBannerText = computed(() => {
  const tasks = dailyAiSuggestionTasks.value.map((task) => task.task_type).filter(Boolean).slice(0, 2);
  return tasks.length
    ? `建议优先练习 ${tasks.join(" 和 ")}，提升整体得分效率`
    : "建议先完成一轮基础练习，积累真实数据";
});
const dailyAiMainTaskPath = computed(() => {
  const taskType = normalizeDailyTaskType(dailyAiSuggestion.value.main_task_type) || "RA";
  return dailyTaskPathMap[taskType] || "/ra";
});

function createDailySuggestionState(payload = {}) {
  const sourceSuggestion = payload.suggestion || createNewUserDailySuggestion();
  const suggestion = shouldDiscardDisabledDailySuggestion(sourceSuggestion)
    ? createFallbackDailySuggestion(payload.summary || dailyPracticeSummary.value || {})
    : sourceSuggestion;

  return {
    date: payload.date || getTodayDateKey(),
    user_id: payload.user_id || "",
    practice_signature: payload.practice_signature || "",
    suggestion: sanitizeDailySuggestion(suggestion),
    generated_at: payload.generated_at || "",
    source: payload.source || "new_user",
    summary: payload.summary || null,
    loading: Boolean(payload.loading),
    reason_code: payload.reason_code || ""
  };
}

function shouldDiscardDisabledDailySuggestion(suggestion) {
  return hasUnavailableTaskRecommendation(suggestion, { diEnabled: diEnabled.value });
}

function createNewUserDailySuggestion() {
  const tasks = enabledHomeTaskTypes.value.includes("WFD")
    ? [
        { task_type: "RA", count: 2 },
        { task_type: "WFD", count: 5 }
      ]
    : [{ task_type: enabledHomeTaskTypes.value[0] || "RA", count: 2 }];

  return {
    title: "今日 AI 建议",
    main_task_type: "RA",
    headline: "先完成一轮基础测温",
    reason: "你还没有足够练习记录，我需要先了解你的表现。",
    advice: "建议先做一组基础练习。完成后我会根据真实数据给你下一步建议。",
    tasks,
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
      { task_type: pickSecondarySuggestionTask(mainTaskType), count: 2 }
    ],
    cta_text: `开始 ${mainTaskType} 训练`
  };
}

function pickSecondarySuggestionTask(mainTaskType) {
  return enabledHomeTaskTypes.value.find((taskType) => taskType !== mainTaskType) || "RA";
}

function sanitizeDailySuggestion(suggestion) {
  const source = suggestion && typeof suggestion === "object" ? suggestion : {};
  if (shouldDiscardDisabledDailySuggestion(source)) return createFallbackDailySuggestion();
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
  return DAILY_SUGGESTION_TASK_TYPES.includes(normalized) && enabledHomeTaskTypeSet.value.has(normalized) ? normalized : "";
}

function buildDailyPracticeSummaryFromDashboard() {
  const analytics = dashboard.value.homeAnalytics || {};
  const recent = Array.isArray(dashboard.value.recentPractices) ? dashboard.value.recentPractices[0] : null;
  const weak = Array.isArray(dashboard.value.weakPoints) ? dashboard.value.weakPoints[0] : null;
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const todayKey = resolveDashboardTodayKey(weeklyStudy) || getTodayDateKey();
  const todayTaskCounts = Object.fromEntries(
    enabledHomeTaskTypes.value.map((taskType) => {
      const count = Number(weeklyStudy.counters?.[taskType]?.[todayKey] || 0);
      return [taskType, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0];
    })
  );
  const todayAttempts = Number(analytics.todayCount || 0)
    || Object.values(todayTaskCounts).reduce((total, count) => total + Number(count || 0), 0);

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
  return enabledHomeTaskTypes.value.some((taskType) => Number(currentCounts[taskType] || 0) - Number(cachedCounts[taskType] || 0) >= 3);
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

function limitText(value, fallback, maxLength) {
  const text = `${value || fallback || ""}`.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

async function loadDashboard() {
  dashboard.value = createEmptyDesktopDashboardState(homeAnalytics.value, { diEnabled: diEnabled.value });
  dashboardLoadError.value = "";

  try {
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const analyticsSnapshot = await loadHomeAnalyticsSnapshotForAuth(authStore);
    let practiceRows = [];
    let trendRows = {
      currentRows: [],
      previousRows: []
    };

    try {
      practiceRows = await fetchDashboardPracticeRowsForAuth(authStore);
    } catch (error) {
      console.warn("Home dashboard practice rows load failed:", error);
      dashboardLoadError.value = "practice_rows_failed";
    }

    try {
      trendRows = await fetchDashboardScoreTrendRowsForAuth(authStore);
    } catch (error) {
      console.warn("Home dashboard trend rows load failed:", error);
      dashboardLoadError.value = dashboardLoadError.value || "trend_rows_failed";
    }

    dashboard.value = buildDesktopDashboardState(analyticsSnapshot, practiceRows, {
      diEnabled: diEnabled.value,
      trendRows
    });
    loadWeeklyGoals();
    void refreshDailyAiSuggestion();
  } catch (error) {
    console.warn("Home dashboard load failed:", error);
    dashboardLoadError.value = "dashboard_failed";
    dashboard.value = {
      ...createEmptyDesktopDashboardState(null, { diEnabled: diEnabled.value }),
      loading: false
    };
    loadWeeklyGoals();
    void refreshDailyAiSuggestion();
  }
}

onMounted(() => {
  loadDashboard();
  nextTick(() => scrollToHash());
});

watch(
  () => route.fullPath,
  () => {
    nextTick(() => scrollToHash());
  }
);

const homeCoachBanner = computed(() => dashboard.value.coach?.banner || "完成几道练习后，AI 私教会按真实数据给出优先题型。");
const aiMessages = computed(() =>
  (Array.isArray(dashboard.value.coach?.summaries) ? dashboard.value.coach.summaries : [])
    .map((item, index) => ({
      id: `${index}-${item?.text || ""}`,
      text: `${item?.text || ""}`.trim(),
      time: `${item?.time || ""}`.trim()
    }))
    .filter((item) => item.text)
);
const aiActions = ref([
  { label: "生成今日计划", to: "/agent" },
  { label: "分析我的弱项", to: "/agent" },
  { label: "查看 7 天趋势", to: "/agent" }
]);

const moduleCardConfigs = [
  { code: "RA", icon: "🎙", iconBg: "#F2E4D0", desc: "朗读句子\n语流表达", tagBg: "#F2E4D0", tagColor: "#C07840", tagBorder: "#D4B090", to: "/ra" },
  { code: "WFD", icon: "✍", iconBg: "#DFF0E4", desc: "听写句子\n拼写准确", tagBg: "#DFF0E4", tagColor: "#3A7E50", tagBorder: "#A8D4B4", to: "/wfd" },
  { code: "RTS", icon: "🔁", iconBg: "#F2E4D0", desc: "情景回应\n情境沟通", tagBg: "#F0E0D8", tagColor: "#B05040", tagBorder: "#D4B0A0", to: "/rts/practice" },
  { code: "DI", icon: "📊", iconBg: "#E8E4F4", desc: "描述图表\n数据分析", tagBg: "#E8E4F4", tagColor: "#6050A0", tagBorder: "#C0B8E0", to: "/di" },
  { code: "WE", icon: "📝", iconBg: "#F0EAF4", desc: "写作议论\n结构论证", tagBg: "#F0EAF4", tagColor: "#7050A0", tagBorder: "#C8B8DC", to: "/we" }
];

const modules = computed(() =>
  moduleCardConfigs.filter((module) => enabledHomeTaskTypeSet.value.has(module.code)).map((module) => {
    const metrics = moduleMetrics.value[module.code] || {};
    const hasScore = metrics.averageScore !== null && metrics.averageScore !== undefined;
    return {
      ...module,
      tag: dashboard.value.loading
        ? "同步中"
        : hasScore
          ? `均分 ${formatScore(metrics.averageScore)}`
          : "暂无数据"
    };
  })
);

const adviceQuestions = ref([
  { label: "我今天最该练哪个题型？", to: "/agent" },
  { label: "RTS 怎么提升复述流畅度？", to: "/agent" }
]);

const WEEKLY_GOAL_TARGETS = {
  WFD: 5,
  RA: 2,
  RTS: 2,
  DI: 2,
  WE: 1
};
const WEEKLY_GOAL_COLORS = {
  WFD: "#5A9E6A",
  RA: "#C07840",
  RTS: "#D4775A",
  DI: "#7A6ABF",
  WE: "#A07850"
};
const WEEKLY_GOAL_LABELS = {
  WFD: "听写句子",
  RA: "朗读句子",
  RTS: "情景回应",
  DI: "描述图表",
  WE: "写作议论"
};
const enabledWeeklyGoalCodes = computed(() =>
  enabledHomeTaskTypes.value.filter((code) => Object.prototype.hasOwnProperty.call(WEEKLY_GOAL_TARGETS, code))
);
const currentWeekStartKey = computed(() => getWeekStartKey());
const weeklyGoalStorageKey = computed(() => {
  const userId = `${authStore.user?.id || ""}`.trim();
  return userId ? `pte_weekly_goals:${userId}:${currentWeekStartKey.value}` : "";
});
const weeklyGoalTargets = ref(createDefaultWeeklyGoals());
const weeklyTaskCounts = computed(() => dashboard.value.weeklyStudy?.taskCounts || {});
const goalBreakdown = computed(() =>
  Object.entries(weeklyGoalTargets.value).filter(([code]) => enabledWeeklyGoalCodes.value.includes(code)).map(([code, target]) => {
    const done = Math.max(0, Math.floor(Number(weeklyTaskCounts.value[code] || 0)));
    const total = Math.max(0, Math.floor(Number(target || 0)));
    return {
      code,
      done,
      total,
      color: WEEKLY_GOAL_COLORS[code] || "#A07850",
      percent: total > 0 ? Math.min(100, Math.round((Math.min(done, total) / total) * 100)) : 0
    };
  })
);
const weekDone = computed(() =>
  goalBreakdown.value.reduce((sum, item) => sum + Math.min(item.done, item.total), 0)
);
const weekTotal = computed(() =>
  goalBreakdown.value.reduce((sum, item) => sum + item.total, 0)
);
const weekProgress = computed(() =>
  weekTotal.value > 0 ? Math.min(100, Math.round((weekDone.value / weekTotal.value) * 100)) : 0
);
const weeklyGoalStatusLabel = computed(() => {
  if (dashboard.value.loading) return "同步中";
  if (weekTotal.value <= 0) return "未设置";
  return weekDone.value >= weekTotal.value ? "已达成" : "进行中";
});
const goalDraftRows = computed(() =>
  enabledWeeklyGoalCodes.value.map((code) => ({
    code,
    name: WEEKLY_GOAL_LABELS[code] || code,
    value: Number(goalDraft.value[code] || 0)
  }))
);
const goalDraftTotal = computed(() =>
  Object.values(goalDraft.value).reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value || 0))), 0)
);
const ringDash = computed(() => {
  const r = 26;
  const c = 2 * Math.PI * r;
  return `${(weekProgress.value / 100) * c} ${c}`;
});

function createDefaultWeeklyGoals() {
  return Object.fromEntries(enabledWeeklyGoalCodes.value.map((code) => [code, WEEKLY_GOAL_TARGETS[code] || 0]));
}

function normalizeWeeklyGoals(goals) {
  const source = goals && typeof goals === "object" ? goals : {};
  return Object.fromEntries(
    enabledWeeklyGoalCodes.value.map((code) => [
      code,
      Math.max(0, Math.min(99, Math.floor(Number(source[code] ?? WEEKLY_GOAL_TARGETS[code] ?? 0))))
    ])
  );
}

function getWeekStartKey(date = new Date()) {
  const parsed = date instanceof Date ? new Date(date) : new Date(date);
  if (!Number.isFinite(parsed.getTime())) return "";
  parsed.setHours(0, 0, 0, 0);
  const day = parsed.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  parsed.setDate(parsed.getDate() + offset);
  return getTodayDateKey(parsed);
}

function loadWeeklyGoals() {
  const key = weeklyGoalStorageKey.value;
  if (!key || typeof window === "undefined") {
    weeklyGoalTargets.value = createDefaultWeeklyGoals();
    return;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    weeklyGoalTargets.value = normalizeWeeklyGoals(parsed?.goals || createDefaultWeeklyGoals());
  } catch (error) {
    console.warn("Weekly goals load failed:", error);
    weeklyGoalTargets.value = createDefaultWeeklyGoals();
  }
}

function persistWeeklyGoals(goals) {
  const normalized = normalizeWeeklyGoals(goals);
  weeklyGoalTargets.value = normalized;

  const key = weeklyGoalStorageKey.value;
  if (!key || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify({
      week_start: currentWeekStartKey.value,
      goals: normalized,
      updated_at: new Date().toISOString()
    }));
  } catch (error) {
    console.warn("Weekly goals save failed:", error);
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

function updateGoalDraft(code, value) {
  if (!enabledWeeklyGoalCodes.value.includes(code)) return;
  goalDraft.value = {
    ...goalDraft.value,
    [code]: Math.max(0, Math.min(99, Math.floor(Number(value || 0))))
  };
}

function resetGoalDraft() {
  goalDraft.value = Object.fromEntries(enabledWeeklyGoalCodes.value.map((code) => [code, 0]));
}

function saveGoalDraft() {
  persistWeeklyGoals(goalDraft.value);
  closeGoalModal();
}

const heatLegendLevels = [0, 1, 2, 3, 4];
const fallbackHeatDays = ["一", "二", "三", "四", "五", "六", "日"].map((label) => ({
  label,
  dateLabel: "",
  isToday: label === "五"
}));
const fallbackHeatRows = computed(() => enabledWeeklyGoalCodes.value.map((code) => ({
  label: code,
  cells: Array.from({ length: 7 }, (_, index) => ({
    level: 0,
    count: 0,
    dateLabel: "",
    isToday: fallbackHeatDays[index]?.isToday || false
  }))
})));
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
      label: row.taskType || row.label,
      cells: (row.cells || []).slice(0, 7).map((cell, index) => {
        const day = heatDays.value[index] || {};
        return {
          level: normalizeHeatLevel(cell?.level),
          count: Math.max(0, Math.floor(Number(cell?.count || 0))),
          dateLabel: cell?.dateLabel || day.dateLabel || "",
          isToday: Boolean(cell?.isToday || day.isToday)
        };
      })
    }));
  }
  return fallbackHeatRows.value;
});
const weeklyStudyFoot = computed(() => {
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const minutes = Number(weeklyStudy.estimatedWeekMinutes || 0);
  const hours = Number.isFinite(minutes) ? minutes / 60 : 0;
  const prefix = weeklyStudy.usesEstimatedDuration ? "本周学习约" : "本周学习";
  return `${prefix} ${formatScore(hours)} 小时`;
});

function normalizeHeatLevel(value) {
  const level = Math.floor(Number(value || 0));
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(4, level));
}

function heatClass(value) {
  return `hc${normalizeHeatLevel(value)}`;
}

function formatHeatCellTitle(row, cell) {
  const task = row?.label || "练习";
  const date = cell?.dateLabel ? `${cell.dateLabel} ` : "";
  const count = Math.max(0, Math.floor(Number(cell?.count || 0)));
  return `${date}${task}: ${count} 题`;
}

const trendSourcePoints = computed(() => {
  const points = dashboard.value.scoreTrend;
  return Array.isArray(points) ? points.slice(0, 7) : [];
});
const trendAxisLabels = computed(() => {
  if (!trendSourcePoints.value.length) return [];
  const total = trendSourcePoints.value.length;
  return trendSourcePoints.value.map((point, index) => ({
    key: point.key || `${point.label || "day"}-${index}`,
    label: formatTrendAxisLabel(point.label),
    x: getTrendX(index, total)
  }));
});
const trendYTicks = computed(() =>
  TREND_Y_TICKS.map((value) => ({
    value,
    y: scoreToTrendY(value)
  }))
);
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
    polyline: points.map((point) => `${point.x},${point.y}`).join(" ")
  }));
});
const trendDrawableSegments = computed(() => trendLineSegments.value.filter((segment) => segment.points.length > 1));
const trendPlotPoints = computed(() => trendLineSegments.value.flatMap((segment) => segment.points));
const trendHasData = computed(() => trendPlotPoints.value.length > 0);
const trendEmptyText = computed(() => {
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return "";
});
const trendFootText = computed(() => {
  const meta = dashboard.value.trendMeta || {};
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return meta.comparisonText || "暂无上周对比";
});
const trendScoreChip = computed(() => {
  const latestPoint = [...trendPlotPoints.value].reverse()[0];
  if (!latestPoint) {
    return { label: "近 7 天", value: "--" };
  }
  return {
    label: `${latestPoint.label} 均分`,
    value: latestPoint.displayValue
  };
});

function formatTrendAxisLabel(label) {
  const text = `${label || ""}`.trim();
  const match = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return text.replace(/-/g, "/");
  return `${Number.parseInt(match[1], 10)}/${Number.parseInt(match[2], 10)}`;
}

function scoreToTrendY(value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : TREND_MIN_SCORE;
  const clamped = Math.max(TREND_MIN_SCORE, Math.min(TREND_MAX_SCORE, safe));
  const ratio = (clamped - TREND_MIN_SCORE) / (TREND_MAX_SCORE - TREND_MIN_SCORE);
  return Number((TREND_CHART.bottom - ratio * (TREND_CHART.bottom - TREND_CHART.top)).toFixed(1));
}

function createTrendPlotPoint(point, index, total) {
  if (point?.value === null || point?.value === undefined || point?.value === "") return null;
  const value = Number(point.value);
  if (!Number.isFinite(value)) return null;

  return {
    key: point.key || `${point.label || "day"}-${index}`,
    label: formatTrendAxisLabel(point.label),
    value,
    displayValue: formatScore(value),
    practiceCount: Math.max(0, Math.floor(Number(point.practiceCount || 0))),
    scoredCount: Math.max(0, Math.floor(Number(point.scoredCount || 0))),
    x: getTrendX(index, total),
    y: scoreToTrendY(value)
  };
}

function getTrendX(index, total) {
  const step = (TREND_CHART.right - TREND_CHART.left) / Math.max(1, total - 1 || 6);
  return Number((TREND_CHART.left + step * index).toFixed(1));
}

function formatTrendPointTitle(point) {
  return `${point.label} 均分 ${point.displayValue}，评分 ${formatInteger(point.scoredCount)} 条，练习 ${formatInteger(point.practiceCount)} 次`;
}

const weakItems = computed(() => {
  const source = Array.isArray(dashboard.value.weakPoints) ? dashboard.value.weakPoints : [];
  return source.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    accent: item.accent || "#C07840",
    title: item.title ? `${item.label || ""} ${item.title}`.trim() : item.label || item.taskType || "练习",
    metricLabel: item.metricLabel || (typeof item.averageScore === "number" ? `均分 ${formatScore(item.averageScore)}` : "--"),
    delta: item.deltaText || "暂无上周对比"
  }));
});
const hasWeakItems = computed(() => weakItems.value.length > 0);

const recentItems = computed(() => {
  const source = Array.isArray(dashboard.value.recentPractices) ? dashboard.value.recentPractices : [];
  return source.slice(0, 3).map((item, index) => {
    const taskType = item.taskType || item.type || "";
    return {
      key: item.key || `${item.id || "log"}-${item.timeLabel || index}`,
      code: taskType || "PTE",
      name: item.title || `${item.label || taskType || "PTE"} 练习`,
      score: item.metricLabel || item.scoreLabel || item.score || "暂无分数",
      date: item.timeLabel || item.time || "--",
      color: item.accent || "#C07840",
      to: taskPathMap[taskType] || "/home"
    };
  });
});
const hasRecentItems = computed(() => recentItems.value.length > 0);
</script>

<style scoped>
/* Visual rules: docs/ui-guidelines.md. Tokens (--kk-*) live in src/assets/styles/main.css. */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.shell{display:flex;width:100vw;height:100vh;overflow:hidden;background:var(--kk-bg);color:var(--kk-ink);font-family:var(--kk-font);font-size:15px;line-height:1.55;}

/* Sidebar (desktop only) */
.home-agent-sidebar{display:none;flex:0 0 232px;width:232px;flex-direction:column;background:var(--kk-surface);border-right:1px solid var(--kk-line);}
.home-agent-logo{display:flex;align-items:center;gap:10px;height:72px;flex:0 0 72px;padding:0 24px;text-decoration:none;}
.home-agent-logo-icon{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:var(--kk-action);flex-shrink:0;}
.home-agent-logo-name{color:var(--kk-ink);font-size:18px;font-weight:700;}
.home-agent-nav{display:flex;flex:1;flex-direction:column;gap:4px;padding:8px 16px 24px;}
.home-agent-nav-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 14px;border-radius:12px;color:var(--kk-ink-2);font-size:15px;text-decoration:none;transition:background .15s,color .15s;}
.home-agent-nav-item:hover{background:var(--kk-surface-2);color:var(--kk-ink);}
.home-agent-nav-item--active,.home-agent-nav-item--active:hover{background:var(--kk-action-soft);color:var(--kk-action-text);font-weight:600;}
.home-agent-nav-icon{display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;}
.home-agent-nav-icon :deep(svg){width:18px;height:18px;}
.home-agent-sidebar-footer{padding:16px;}
.home-agent-promo{padding:16px;border-radius:16px;background:var(--kk-surface-2);}
.home-agent-promo-title{margin-bottom:2px;color:var(--kk-ink);font-size:15px;font-weight:600;}
.home-agent-promo-sub{margin-bottom:12px;color:var(--kk-ink-3);font-size:13px;}
.home-agent-promo-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 16px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font:600 13px/1 var(--kk-font);cursor:pointer;}

/* Top bar */
.main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
.topbar{min-height:64px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:var(--kk-surface);border-bottom:1px solid var(--kk-line);}
.tb-left{min-width:0;}
.tb-greet{font-size:18px;font-weight:700;color:var(--kk-ink);line-height:1.3;overflow-wrap:anywhere;}
.tb-sub{display:none;font-size:13px;color:var(--kk-ink-3);}
.tb-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.vip-pill{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 12px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--kk-surface-2);color:var(--kk-ink-2);}
.vip-pill--vip{background:var(--kk-notice-bg);color:var(--kk-notice);}
.user-av{width:36px;height:36px;border-radius:50%;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
.user-av img{width:100%;height:100%;object-fit:cover;display:block;}
.user-name{display:none;font-size:14px;font-weight:500;color:var(--kk-ink);}

/* Scroll area and rows */
.scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 16px 40px;display:flex;flex-direction:column;gap:16px;}
.scroll::-webkit-scrollbar{width:6px;}
.scroll::-webkit-scrollbar-thumb{background:var(--kk-line);border-radius:99px;}
.row{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;width:100%;max-width:1160px;margin:0 auto;}
.card{min-width:0;background:var(--kk-surface);border:1px solid var(--kk-line);border-radius:20px;box-shadow:var(--kk-shadow);display:flex;flex-direction:column;padding:20px;}
.sec-title{font-size:17px;font-weight:600;color:var(--kk-ink);margin-bottom:14px;line-height:1.4;}
.badge-outline,.badge-green{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--kk-surface-2);color:var(--kk-ink-2);}
.badge-green{background:var(--kk-success-bg);color:var(--kk-success);}

/* Hero: the one dark card on the page */
.hero-card{padding:0;overflow:hidden;}
.hc-top{background:var(--kk-ink);color:var(--kk-ink-inverse);padding:22px 20px 20px;}
.hc-eyebrow{font-size:13px;color:rgba(251,247,241,.72);margin-bottom:4px;}
.hc-title{font-size:24px;font-weight:700;line-height:1.3;margin-bottom:4px;}
.hc-title em{font-style:normal;font-size:1.15em;font-weight:800;}
.hc-sub{font-size:14px;color:rgba(251,247,241,.72);margin-bottom:18px;}
.task-block{display:flex;flex-direction:column;gap:12px;}
.task-hd{font-size:14px;font-weight:600;color:var(--kk-ink-inverse);}
.t-row{display:grid;grid-template-columns:20px minmax(0,1fr) 64px 36px;align-items:center;gap:10px;}
.t-chk{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--kk-dark-line);display:flex;align-items:center;justify-content:center;}
.t-chk.done{background:var(--kk-action);border-color:var(--kk-action);}
.t-lbl{font-size:15px;color:var(--kk-ink-inverse);min-width:0;}
.t-bar-bg{height:6px;background:#3A342E;border-radius:99px;overflow:hidden;}
.t-bar-fill{height:100%;background:var(--kk-action);border-radius:99px;transition:width .4s ease;}
.t-cnt{font-size:13px;color:rgba(251,247,241,.72);text-align:right;font-family:var(--kk-font-num);font-variant-numeric:tabular-nums;}
.hc-bottom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:16px 4px;}
.s3{min-width:0;padding:0 12px;border-left:1px solid var(--kk-line);}
.s3:first-child{border-left:0;}
.s3-val{font-size:24px;font-weight:800;color:var(--kk-ink);line-height:1.15;}
.s3-unit{font-size:13px;font-weight:500;color:var(--kk-ink-2);margin-left:2px;font-family:var(--kk-font);}
.s3-label{font-size:13px;color:var(--kk-ink-2);margin-top:4px;}
.s3-sub{font-size:12px;color:var(--kk-ink-3);}

/* AI coach */
.ai-card{gap:14px;}
.ai-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.ai-title{font-size:17px;font-weight:600;color:var(--kk-ink);}
.ai-subtitle{font-size:13px;color:var(--kk-ink-3);}
.ai-link{display:inline-flex;align-items:center;min-height:44px;margin-top:-10px;color:var(--kk-action-text);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;}
.ai-banner{padding:12px 14px;border-radius:12px;background:var(--kk-surface-2);color:var(--kk-ink);font-size:14px;font-weight:500;line-height:1.6;}
.ai-messages{display:flex;flex-direction:column;gap:10px;}
.ai-msg{display:flex;gap:10px;align-items:flex-start;}
.ai-msg-av{width:28px;height:28px;border-radius:50%;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ai-msg-bubble{flex:1;min-width:0;padding:10px 12px;border-radius:4px 12px 12px 12px;background:var(--kk-surface-2);}
.ai-msg-text{font-size:14px;color:var(--kk-ink);line-height:1.6;}
.ai-msg-time{font-size:12px;color:var(--kk-ink-3);margin-top:2px;}
.ai-empty{padding:14px;border:1px dashed var(--kk-line);border-radius:12px;font-size:14px;color:var(--kk-ink-2);line-height:1.6;}
.ai-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;}
.ai-act-btn{flex:1 1 auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font-size:14px;font-weight:600;cursor:pointer;text-align:center;}
.ai-act-btn:hover{background:var(--kk-surface-2);}

/* Module shortcuts */
.sc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.sc-item{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;min-height:112px;padding:16px;border-radius:16px;background:var(--kk-surface-2);cursor:pointer;text-align:left;transition:background .15s;}
.sc-item:hover{background:var(--kk-line);}
.sc-code{font-family:var(--kk-font-num);font-size:22px;font-weight:800;color:var(--kk-ink);line-height:1.2;}
.sc-desc{font-size:13px;color:var(--kk-ink-2);line-height:1.5;white-space:pre-line;}
.sc-desc::first-line{font-size:15px;font-weight:600;color:var(--kk-ink);}
.sc-tag{margin-top:auto;padding-top:6px;font-size:12px;color:var(--kk-ink-3);}

/* Daily advice */
.advice-card{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-content:start;}
.advice-header{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.adv-banner{padding:12px 14px;border-radius:12px;background:var(--kk-surface-2);}
.adv-banner-text{font-size:14px;color:var(--kk-ink);font-weight:500;line-height:1.6;}
.adv-headline{font-size:20px;font-weight:700;color:var(--kk-ink);line-height:1.35;}
.adv-body{font-size:15px;color:var(--kk-ink-2);line-height:1.7;}
.adv-tags{display:flex;flex-wrap:wrap;gap:8px;}
.adv-tags:empty{display:none;}
.adv-tag{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:13px;font-weight:600;}
.adv-meta{font-size:12px;color:var(--kk-ink-3);}
.adv-meta:empty{display:none;}
.adv-questions{display:flex;flex-direction:column;}
.adv-q{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;border-top:1px solid var(--kk-line);cursor:pointer;}
.adv-q:last-child{border-bottom:1px solid var(--kk-line);}
.adv-q:hover .adv-q-text{color:var(--kk-action-text);}
.adv-q-text{font-size:15px;color:var(--kk-ink);}
.adv-q-arr{font-size:18px;color:var(--kk-ink-3);}
.adv-btns{display:flex;flex-wrap:wrap;gap:10px;}
.btn-primary,.btn-ghost{flex:1 1 140px;min-height:48px;padding:0 20px;border-radius:999px;font:700 15px/1.2 var(--kk-font);cursor:pointer;transition:background .15s;}
.btn-primary{border:0;background:var(--kk-action);color:var(--kk-on-action);}
.btn-primary:hover{background:var(--kk-action-hover);}
.btn-primary:active{background:var(--kk-action-press);}
.btn-ghost{border:1px solid var(--kk-line);background:var(--kk-surface);color:var(--kk-ink);}
.btn-ghost:hover{background:var(--kk-surface-2);}

/* Weekly goal */
.goal-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}
.goal-top{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.goal-left{flex:1;min-width:0;}
.goal-pct{font-size:40px;font-weight:800;color:var(--kk-ink);line-height:1;}
.goal-done{font-size:13px;color:var(--kk-ink-3);margin-top:6px;}
.goal-ring-wrap{position:relative;width:66px;height:66px;flex-shrink:0;}
.ring-track{stroke:var(--kk-surface-2);}
.ring-fill{stroke:var(--kk-ink);}
.ring-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--kk-ink);font-family:var(--kk-font-num);}
.goal-bar-section{margin-bottom:14px;}
.goal-bar-labels{display:flex;justify-content:space-between;font-size:13px;color:var(--kk-ink-2);margin-bottom:6px;}
.goal-bar-bg,.gb-bar-bg{height:6px;background:var(--kk-surface-2);border-radius:99px;overflow:hidden;}
.goal-bar-fill{height:100%;background:var(--kk-ink);border-radius:99px;transition:width .4s ease;}
.goal-breakdown{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;}
.gb-row{display:grid;grid-template-columns:44px minmax(0,1fr) 36px;align-items:center;gap:10px;}
.gb-code{font-family:var(--kk-font-num);font-size:13px;font-weight:700;color:var(--kk-ink);}
.gb-bar-fill{height:100%;border-radius:99px;background:var(--kk-ink-2);transition:width .4s ease;}
.gb-val{font-size:13px;color:var(--kk-ink-3);text-align:right;font-family:var(--kk-font-num);}
.goal-btns{display:flex;gap:8px;margin-top:auto;}
.goal-btn{flex:1;min-height:44px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font:600 14px/1.2 var(--kk-font);cursor:pointer;}
.goal-btn:hover{background:var(--kk-surface-2);}

/* Goal modal */
.goal-modal-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(30,27,24,.32);}
.goal-modal{width:min(440px,100%);max-height:calc(100vh - 32px);overflow-y:auto;border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow-pop);padding:24px;color:var(--kk-ink);}
.goal-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;}
.goal-modal-kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--kk-ink-3);font-weight:600;margin-bottom:2px;}
.goal-modal h2{font-size:22px;line-height:1.3;font-weight:700;}
.goal-modal-close{width:44px;height:44px;border:1px solid var(--kk-line);border-radius:50%;background:var(--kk-surface);color:var(--kk-ink);font-size:22px;line-height:1;cursor:pointer;flex-shrink:0;}
.goal-modal-body{display:flex;flex-direction:column;}
.goal-modal-row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:60px;border-top:1px solid var(--kk-line);}
.goal-modal-row span{display:flex;flex-direction:column;}
.goal-modal-row b{font-family:var(--kk-font-num);font-size:15px;color:var(--kk-ink);}
.goal-modal-row em{font-size:13px;font-style:normal;color:var(--kk-ink-3);}
.goal-modal-row input{width:96px;height:44px;border:1px solid var(--kk-line);border-radius:12px;background:var(--kk-surface-2);color:var(--kk-ink);font:700 16px/1 var(--kk-font-num);text-align:center;outline:none;}
.goal-modal-row input:focus{border-color:var(--kk-ink);background:var(--kk-surface);}
.goal-modal-summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;padding:14px 0 18px;border-top:1px solid var(--kk-line);font-size:14px;color:var(--kk-ink-2);}
.goal-modal-summary b{color:var(--kk-ink);}
.goal-modal-actions{display:flex;gap:10px;}
.goal-modal-ghost,.goal-modal-primary{flex:1;min-height:48px;border-radius:999px;font:700 15px/1 var(--kk-font);cursor:pointer;}
.goal-modal-ghost{border:1px solid var(--kk-line);background:var(--kk-surface);color:var(--kk-ink);}
.goal-modal-primary{border:0;background:var(--kk-action);color:var(--kk-on-action);}
.goal-modal-primary:hover{background:var(--kk-action-hover);}

/* Report: heatmap */
.hm-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;padding-left:46px;margin-bottom:8px;}
.hm-dlbl{text-align:center;font-size:12px;color:var(--kk-ink-3);line-height:1;}
.hm-dlbl.today{color:var(--kk-ink);font-weight:700;}
.hm-grid{display:flex;flex-direction:column;gap:6px;}
.hm-row{display:grid;grid-template-columns:40px repeat(7,minmax(0,1fr));align-items:center;gap:6px;}
.hm-code{font-family:var(--kk-font-num);font-size:12px;font-weight:700;color:var(--kk-ink-2);}
.hm-cell{height:22px;border-radius:6px;}
.hc0{background:var(--kk-surface-2);}
.hc1{background:#E6DACB;}
.hc2{background:#C9B49C;}
.hc3{background:#8C7763;}
.hc4{background:var(--kk-ink);}
.hm-today{box-shadow:inset 0 0 0 2px var(--kk-ink-2);}
.hm-footer{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:16px;font-size:12px;color:var(--kk-ink-3);}
.hm-legend{display:flex;gap:3px;}
.hml{width:12px;height:12px;border-radius:3px;}
.hm-total{margin-left:auto;font-size:13px;color:var(--kk-ink-2);font-weight:600;}

/* Report: trend */
.trend-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;}
.trend-avg{text-align:right;flex-shrink:0;}
.trend-avg-lbl{font-size:12px;color:var(--kk-ink-3);}
.trend-avg-val{font-size:22px;font-weight:800;color:var(--kk-ink);line-height:1.1;}
.chart-svg{width:100%;height:160px;display:block;}
.trend-grid{stroke:var(--kk-line);stroke-width:.8;}
.trend-axis,.trend-date{font-size:9px;fill:var(--kk-ink-3);}
.trend-line{fill:none;stroke:var(--kk-ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;}
.trend-point{fill:var(--kk-ink);stroke:var(--kk-surface);stroke-width:1.6;vector-effect:non-scaling-stroke;}
.trend-empty{font-size:11px;fill:var(--kk-ink-3);}
.trend-note{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--kk-surface-2);font-size:13px;color:var(--kk-ink-2);text-align:center;}

/* Report: weak points and recent practice */
.weak-list,.recent-list{display:flex;flex-direction:column;}
.weak-item,.rec-item{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 0;border-top:1px solid var(--kk-line);}
.weak-item:first-child,.rec-item:first-child{border-top:0;}
.weak-rank{width:28px;height:28px;border-radius:50%;background:var(--kk-surface-2);color:var(--kk-ink);font-family:var(--kk-font-num);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.weak-name,.rec-name{font-size:15px;font-weight:600;color:var(--kk-ink);}
.weak-score,.rec-meta{font-size:13px;color:var(--kk-ink-3);}
.rec-item{cursor:pointer;}
.rec-item:hover .rec-name{color:var(--kk-action-text);}
.rec-badge{width:48px;height:32px;border-radius:10px;background:var(--kk-surface-2);color:var(--kk-ink);font-family:var(--kk-font-num);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.rec-arr{font-size:18px;color:var(--kk-ink-3);margin-left:auto;}
.weak-empty,.recent-empty{min-height:88px;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;border:1px dashed var(--kk-line);border-radius:12px;font-size:14px;color:var(--kk-ink-3);line-height:1.6;}

/* Tablet 768–1023 */
@media (min-width:768px){
  .topbar{padding:12px 24px;}
  .tb-greet{font-size:22px;}
  .tb-sub{display:block;}
  .scroll{padding:24px 24px 48px;}
  .sc-grid{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));}
  .hc-top{padding:26px 28px 24px;}
  .hc-title{font-size:26px;}
  .s3-val{font-size:28px;}
  .row-report{grid-template-columns:repeat(2,minmax(0,1fr));}
  .row-report .recent-card{grid-column:1 / -1;}
}

/* Desktop ≥1024: sidebar appears */
@media (min-width:1024px){
  .home-agent-sidebar{display:flex;}
  .user-name{display:block;}
  .topbar{min-height:72px;padding:12px 40px;}
  .tb-greet{font-size:26px;}
  .scroll{padding:28px 40px 56px;gap:20px;}
  .row{gap:20px;}
  .card{padding:24px;}
  .hero-card{padding:0;}
  .hc-title{font-size:28px;}
  .s3{padding:0 20px;}
  .s3-val{font-size:32px;}
  .advice-card{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);column-gap:32px;}
  .advice-card > :not(.adv-questions):not(.adv-btns){grid-column:1;}
  .adv-questions{grid-column:2;grid-row:1 / span 4;}
  .adv-btns{grid-column:2;grid-row:5 / span 2;align-self:end;}
}

/* Wide desktop: hero + modules on the left, coach on the right; report on 12 columns */
@media (min-width:1200px){
  .row-top{grid-template-columns:minmax(0,2fr) minmax(0,1fr);}
  .row-top .hero-card{grid-column:1;grid-row:1;}
  .row-top .sc-card{grid-column:1;grid-row:2;}
  /* Size to its own content: with few messages the actions sit right under them instead of at the bottom of a stretched card. */
  .row-top .ai-card{grid-column:2;grid-row:1 / span 2;align-self:start;}
  .row-report{grid-template-columns:repeat(12,minmax(0,1fr));}
  .row-report .hm-card,.row-report .trend-card{grid-column:span 6;}
  .row-report .weak-card,.row-report .goal-card,.row-report .recent-card{grid-column:span 4;}
}
</style>
