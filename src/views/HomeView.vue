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
          <div class="home-agent-promo-title">PTE 备考资料包</div>
          <div class="home-agent-promo-sub">真题 · 高频词汇 · 模板</div>
          <button class="home-agent-promo-button" type="button" @click="goTo('/we/templates')">免费领取</button>
        </div>
      </div>
    </aside>

    <!-- ═══════════════ MAIN ═══════════════ -->
    <div class="main">
      <header class="topbar">
        <div class="tb-left">
          <div class="tb-greet">你好，{{ username }} 👋</div>
          <div class="tb-sub">坚持每天进步一点，PTE 梦想更近一步！</div>
        </div>
        <div class="tb-right">
          <div class="vip-pill" :class="`vip-pill--${membershipPill.kind}`">{{ membershipPill.icon }} {{ membershipPill.label }}</div>
          <div class="user-av">
            <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
            <span v-else>{{ userInitial }}</span>
          </div>
          <span class="user-name">{{ username }}</span>
        </div>
      </header>

      <div class="scroll">

        <!-- ── ROW 1：控台 + AI 私教 ── -->
        <div class="row">
          <div class="card hero-card">
            <div class="hc-top">
              <div class="hc-deco" style="width:150px;height:150px;top:-55px;right:20px;"></div>
              <div class="hc-deco" style="width:80px;height:80px;top:5px;right:140px;"></div>
              <div class="hc-eyebrow">PTE 学习总控台</div>
              <div class="hc-title">最近 RA 均分 <em>{{ raAvg }}</em> 分</div>
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
                <div class="s3-icon" :style="{ background: stat.bg }">{{ stat.icon }}</div>
                <div>
                  <div class="s3-val">{{ stat.value }}<span class="s3-unit">{{ stat.unit }}</span></div>
                  <div class="s3-label">{{ stat.label }}</div>
                  <div class="s3-sub">{{ stat.sub }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card ai-card">
            <div class="ai-header">
              <div class="ai-header-left">
                <span class="ai-star">✦</span>
                <div><div class="ai-title">AI 私教</div><div class="ai-subtitle">为你量身建议</div></div>
              </div>
              <span class="ai-link" role="button" tabindex="0" @click="goTo('/agent')" @keydown.enter.prevent="goTo('/agent')" @keydown.space.prevent="goTo('/agent')">与 AI 私教对话 →</span>
            </div>
            <div class="ai-banner">
              <span class="ai-banner-icon">💡</span>
              <span>建议优先练习 RTS 和 DI，提升整体得分效率</span>
            </div>
            <div class="ai-messages">
              <div v-for="msg in aiMessages" :key="msg.id" class="ai-msg">
                <div class="ai-msg-av">AI</div>
                <div class="ai-msg-bubble">
                  <div class="ai-msg-text">{{ msg.text }}</div>
                  <div class="ai-msg-time">{{ msg.time }}</div>
                </div>
              </div>
            </div>
            <div class="ai-actions">
              <div v-for="act in aiActions" :key="act.label" class="ai-act-btn" role="button" tabindex="0" @click="goTo(act.to)" @keydown.enter.prevent="goTo(act.to)" @keydown.space.prevent="goTo(act.to)">{{ act.label }}</div>
            </div>
          </div>
        </div>

        <!-- ── ROW 2：快捷入口 + AI建议 + 本周目标 ── -->
        <div class="row">

          <div class="card sc-card">
            <div class="sec-title"><span class="sec-star">◈</span> 模块快捷入口</div>
            <div class="sc-grid">
              <div v-for="mod in modules" :key="mod.code"
                class="sc-item" :class="`sc-${mod.code.toLowerCase()}`"
                role="button" tabindex="0"
                @click="goTo(mod.to)"
                @keydown.enter.prevent="goTo(mod.to)"
                @keydown.space.prevent="goTo(mod.to)">
                <div class="sc-icon-wrap" :style="{ background: mod.iconBg }">{{ mod.icon }}</div>
                <div class="sc-code">{{ mod.code }}</div>
                <div class="sc-desc">{{ mod.desc }}</div>
                <div class="sc-tag" :style="{ background: mod.tagBg, color: mod.tagColor, border: `1px solid ${mod.tagBorder}` }">
                  {{ mod.tag }}
                </div>
              </div>
            </div>
          </div>

          <div class="card advice-card">
            <div class="advice-header">
              <div class="sec-title" style="margin-bottom:0"><span class="sec-star">✦</span> 今日 AI 建议</div>
              <span class="badge-outline">{{ dailyAiSuggestionStatusLabel }}</span>
            </div>
            <div class="adv-banner">
              <span class="adv-banner-icon">💡</span>
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

          <div class="card goal-card">
            <div class="goal-header">
              <div class="sec-title" style="margin-bottom:0"><span class="sec-star">◎</span> 本周目标进度</div>
              <span class="badge-green">{{ weeklyGoalStatusLabel }}</span>
            </div>
            <div class="goal-top">
              <div class="goal-left">
                <div class="goal-pct">{{ weekProgress }}%</div>
                <div class="goal-done">已完成 {{ weekDone }} / {{ weekTotal }} 题</div>
              </div>
              <div class="goal-ring-wrap">
                <svg width="66" height="66" viewBox="0 0 66 66">
                  <circle cx="33" cy="33" r="26" fill="none" stroke="#D8D0C0" stroke-width="6"/>
                  <circle cx="33" cy="33" r="26" fill="none" stroke="#7C5C3E" stroke-width="6"
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
                  <div class="gb-bar-fill" :style="{ width: g.percent + '%', background: g.color }"></div>
                </div>
                <span class="gb-val">{{ g.done }}/{{ g.total }}</span>
              </div>
            </div>
            <div class="goal-btns">
              <button type="button" class="goal-btn goal-btn-p goal-btn-wide" @click="openGoalModal">设置本周目标</button>
            </div>
          </div>
        </div>

        <!-- ── ROW 3：热力图 + 趋势 + 弱项 + 最近练习 ── -->
        <div class="row">

          <div class="card hm-card">
            <div class="sec-title"><span class="sec-star">◈</span> 本周学习热力图</div>
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
              <div class="sec-title" style="margin-bottom:0"><span class="sec-star">◈</span> 得分趋势（近 7 天）</div>
              <div class="trend-avg">
                <div class="trend-avg-lbl">{{ trendScoreChip.label }}</div>
                <div class="trend-avg-val">{{ trendScoreChip.value }}</div>
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
            <div class="sec-title"><span class="sec-star">◈</span> 我的弱项 Top 3</div>
            <div v-if="hasWeakItems" class="weak-list">
              <div v-for="w in weakItems" :key="w.rank" class="weak-item">
                <div class="weak-rank" :style="{ background: w.accent }">{{ w.rank }}</div>
                <div>
                  <div class="weak-name">{{ w.title }}</div>
                  <div class="weak-score">{{ w.metricLabel }} · {{ w.delta }}</div>
                </div>
              </div>
            </div>
            <div v-else class="weak-empty">练习数据还不够，完成几道题后会自动识别弱项。</div>
          </div>

          <div class="card recent-card">
            <div class="sec-title"><span class="sec-star">◈</span> 最近练习</div>
            <div v-if="hasRecentItems" class="recent-list">
              <div v-for="r in recentItems" :key="r.key" class="rec-item" role="button" tabindex="0" @click="goTo(r.to)" @keydown.enter.prevent="goTo(r.to)" @keydown.space.prevent="goTo(r.to)">
                <div class="rec-badge" :style="{ background: r.color }">{{ r.code }}</div>
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
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { requestDailyAiSuggestion } from "@/lib/agent";
import { isDIEnabled } from "@/lib/di-feature";
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
const dashboard = ref(createEmptyDesktopDashboardState());
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

const DAILY_SUGGESTION_TASK_TYPES = ["RA", "WFD", "WE", "DI", "RTS"];
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
  { key: "library", label: "题库", icon: "box", to: "/home#quick" },
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
  if (item.key === "home") return route.path === "/home" || route.path === "/";
  return route.path === item.to || route.fullPath === item.to;
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
  return DAILY_SUGGESTION_TASK_TYPES.includes(normalized) ? normalized : "";
}

function buildDailyPracticeSummaryFromDashboard() {
  const analytics = dashboard.value.homeAnalytics || {};
  const recent = Array.isArray(dashboard.value.recentPractices) ? dashboard.value.recentPractices[0] : null;
  const weak = Array.isArray(dashboard.value.weakPoints) ? dashboard.value.weakPoints[0] : null;
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const todayKey = resolveDashboardTodayKey(weeklyStudy) || getTodayDateKey();
  const todayTaskCounts = Object.fromEntries(
    DAILY_SUGGESTION_TASK_TYPES.map((taskType) => {
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
  return DAILY_SUGGESTION_TASK_TYPES.some((taskType) => Number(currentCounts[taskType] || 0) - Number(cachedCounts[taskType] || 0) >= 3);
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
  dashboard.value = createEmptyDesktopDashboardState(homeAnalytics.value);
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
      diEnabled: isDIEnabled(),
      trendRows
    });
    loadWeeklyGoals();
    void refreshDailyAiSuggestion();
  } catch (error) {
    console.warn("Home dashboard load failed:", error);
    dashboardLoadError.value = "dashboard_failed";
    dashboard.value = {
      ...createEmptyDesktopDashboardState(),
      loading: false
    };
    loadWeeklyGoals();
    void refreshDailyAiSuggestion();
  }
}

onMounted(() => {
  loadDashboard();
});

const aiMessages = ref([
  { id: 1, text: "今天我们重点突破 RTS 和复述句子对应能力，这样能更快提升整体分数。", time: "10:32" },
  { id: 2, text: "从最近练习来看，RTS 的稳定性偏弱，建议安排针对性训练，2 天内可见提升。", time: "10:33" }
]);
const aiActions = ref([
  { label: "📋 生成今日计划", to: "/agent" },
  { label: "📊 分析我的弱项", to: "/agent" },
  { label: "📈 查看 7 天趋势", to: "/agent" }
]);

const moduleCardConfigs = [
  { code: "RA", icon: "🎙", iconBg: "#F2E4D0", desc: "朗读句子\n语流表达", tagBg: "#F2E4D0", tagColor: "#C07840", tagBorder: "#D4B090", to: "/ra" },
  { code: "WFD", icon: "✍", iconBg: "#DFF0E4", desc: "写作填空\n语法拼写", tagBg: "#DFF0E4", tagColor: "#3A7E50", tagBorder: "#A8D4B4", to: "/wfd" },
  { code: "RTS", icon: "🔁", iconBg: "#F2E4D0", desc: "复述句子\n逻辑连贯", tagBg: "#F0E0D8", tagColor: "#B05040", tagBorder: "#D4B0A0", to: "/rts/practice" },
  { code: "DI", icon: "📊", iconBg: "#E8E4F4", desc: "描述图表\n数据分析", tagBg: "#E8E4F4", tagColor: "#6050A0", tagBorder: "#C0B8E0", to: "/di" },
  { code: "WE", icon: "📝", iconBg: "#F0EAF4", desc: "写作议论\n结构论证", tagBg: "#F0EAF4", tagColor: "#7050A0", tagBorder: "#C8B8DC", to: "/we" }
];

const modules = computed(() =>
  moduleCardConfigs.map((module) => {
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
  { label: "🔍 我今天最该练哪个题型？", to: "/agent" },
  { label: "📈 RTS 怎么提升复述流畅度？", to: "/agent" }
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
  WFD: "写作填空",
  RA: "朗读句子",
  RTS: "复述句子",
  DI: "描述图表",
  WE: "写作议论"
};
const currentWeekStartKey = computed(() => getWeekStartKey());
const weeklyGoalStorageKey = computed(() => {
  const userId = `${authStore.user?.id || ""}`.trim();
  return userId ? `pte_weekly_goals:${userId}:${currentWeekStartKey.value}` : "";
});
const weeklyGoalTargets = ref(createDefaultWeeklyGoals());
const weeklyTaskCounts = computed(() => dashboard.value.weeklyStudy?.taskCounts || {});
const goalBreakdown = computed(() =>
  Object.entries(weeklyGoalTargets.value).map(([code, target]) => {
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
  Object.keys(WEEKLY_GOAL_TARGETS).map((code) => ({
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
  return { ...WEEKLY_GOAL_TARGETS };
}

function normalizeWeeklyGoals(goals) {
  const source = goals && typeof goals === "object" ? goals : {};
  return Object.fromEntries(
    Object.keys(WEEKLY_GOAL_TARGETS).map((code) => [
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
  if (!Object.prototype.hasOwnProperty.call(WEEKLY_GOAL_TARGETS, code)) return;
  goalDraft.value = {
    ...goalDraft.value,
    [code]: Math.max(0, Math.min(99, Math.floor(Number(value || 0))))
  };
}

function resetGoalDraft() {
  goalDraft.value = Object.fromEntries(Object.keys(WEEKLY_GOAL_TARGETS).map((code) => [code, 0]));
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
const fallbackHeatRows = Object.keys(WEEKLY_GOAL_TARGETS).map((code) => ({
  label: code,
  cells: Array.from({ length: 7 }, (_, index) => ({
    level: 0,
    count: 0,
    dateLabel: "",
    isToday: fallbackHeatDays[index]?.isToday || false
  }))
}));
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
  return fallbackHeatRows;
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
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.shell{
  --c0:#1E1208;--c1:#3A2510;--c2:#7C5C3E;--c3:#A07850;--c4:#C4A878;
  --bg0:#F5EFE4;--bg1:#EDE8DC;--bg2:#E4DDD0;--bg3:#D8D0C0;
  --card:#FAF6EF;--card2:#F2EBE0;--bdr:#D4C8B4;--bdr2:#C4B49C;
  --grn:#5A9E6A;--grn2:#DFF0E4;--grn3:#A8D4B4;
  --org:#C07840;--org2:#F2E4D0;--org3:#D4B090;--mute:#A89070;
  display:flex;width:100vw;height:100vh;background:var(--bg1);
  font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;
  color:var(--c0);overflow:hidden;
}
.home-agent-sidebar{display:flex;flex:0 0 200px;width:200px;flex-direction:column;background:#e5dfd4;border-right:.5px solid #d4cdbf;}
.home-agent-logo{display:flex;align-items:center;gap:9px;height:64px;flex:0 0 64px;padding:0 18px;border-bottom:.5px solid #d4cdbf;text-decoration:none;}
.home-agent-logo-icon{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:8px;background:#7c5c3e;flex-shrink:0;}
.home-agent-logo-name{color:#2c1f0e;font-size:17px;font-weight:500;letter-spacing:.03em;}
.home-agent-nav{display:flex;flex:1;flex-direction:column;gap:8px;padding:22px 12px 24px;}
.home-agent-nav-item{display:flex;align-items:center;gap:11px;min-height:42px;padding:0 12px;border:.5px solid transparent;border-radius:10px;background:transparent;color:#9a8f80;cursor:pointer;font-family:inherit;font-size:13.8px;line-height:1.3;text-align:left;text-decoration:none;transition:background .13s,border-color .13s,color .13s;}
.home-agent-nav-item:hover{background:#ede8df;color:#6b5a44;}
.home-agent-nav-item--active{border-color:#cabdaa;background:#d9cfbd;color:#7c5c3e;font-weight:600;box-shadow:inset 0 1px 0 rgba(245,239,228,.5);}
.home-agent-nav-icon{display:flex;align-items:center;justify-content:center;width:15px;height:15px;flex:0 0 15px;}
.home-agent-nav-icon svg{width:15px;height:15px;}
.home-agent-nav-item--active .home-agent-nav-icon{opacity:1;}
.home-agent-sidebar-footer{padding:16px 12px 18px;border-top:.5px solid #d4cdbf;}
.home-agent-promo{padding:12px;border:.5px solid #c4baa8;border-radius:10px;background:#d8cebc;}
.home-agent-promo-title{margin-bottom:2px;color:#7c5c3e;font-size:11.5px;font-weight:500;}
.home-agent-promo-sub{margin-bottom:9px;color:#9a8f80;font-size:10.5px;}
.home-agent-promo-button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:#7c5c3e;color:#f5efe4;font-size:11px;line-height:1;padding:6px 13px;cursor:pointer;font-family:inherit;}
.main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;}
.topbar{height:64px;flex-shrink:0;background:var(--bg2);border-bottom:.5px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;padding:0 22px;}
.tb-greet{font-size:13.5px;font-weight:700;color:var(--c0);}
.tb-sub{font-size:10px;color:var(--mute);}
.tb-right{display:flex;align-items:center;gap:8px;}
.vip-pill{display:flex;align-items:center;gap:5px;border-radius:99px;padding:4px 11px;font-size:11px;font-weight:700;border:1px solid var(--bdr2);white-space:nowrap;}
.vip-pill--vip{background:#FFF4CF;border-color:#D7A84B;color:#7C5520;box-shadow:inset 0 1px 0 rgba(255,255,255,.58);}
.vip-pill--trial{background:var(--org2);border-color:var(--org3);color:var(--org);}
.vip-pill--locked,.vip-pill--loading{background:var(--card2);border-color:var(--bdr2);color:var(--mute);}
.user-av{width:26px;height:26px;border-radius:50%;background:var(--c2);color:var(--bg0);font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.user-av img{width:100%;height:100%;object-fit:cover;display:block;}
.user-name{font-size:12px;color:var(--c1);}
.scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:14px 18px 20px;display:flex;flex-direction:column;gap:12px;}
.scroll::-webkit-scrollbar{width:4px;}
.scroll::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.row{display:flex;gap:12px;align-items:stretch;}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:15px;display:flex;flex-direction:column;}
.sec-title{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:var(--c0);margin-bottom:12px;}
.sec-star{color:var(--c2);}

/* ROW1 HERO */
.hero-card{flex:1.45;overflow:hidden;}
.hc-top{background:linear-gradient(135deg,var(--c2) 0%,var(--c3) 55%,#C4A070 100%);padding:18px 20px 16px;position:relative;overflow:hidden;}
.hc-deco{position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.1);pointer-events:none;}
.hc-eyebrow{font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(250,246,239,.5);margin-bottom:5px;}
.hc-title{font-size:18px;font-weight:700;color:#FAF6EF;line-height:1.35;margin-bottom:3px;}
.hc-title em{color:#F0D0A0;font-style:normal;}
.hc-sub{font-size:11px;color:rgba(250,246,239,.6);margin-bottom:12px;}
.task-block{background:rgba(255,255,255,.13);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:10px 13px;}
.task-hd{display:flex;align-items:center;gap:6px;font-size:11px;color:#FAF6EF;font-weight:600;margin-bottom:8px;}
.task-hd-dot{width:5px;height:5px;border-radius:50%;background:#F0D0A0;flex-shrink:0;}
.t-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.t-row:last-child{margin-bottom:0;}
.t-chk{width:14px;height:14px;border-radius:3.5px;border:1.5px solid rgba(255,255,255,.4);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s;}
.t-chk.done{background:#5A9E6A;border-color:#5A9E6A;}
.t-lbl{font-size:11px;color:rgba(250,246,239,.85);flex:1;}
.t-bar-bg{width:64px;height:3px;background:rgba(255,255,255,.18);border-radius:99px;overflow:hidden;flex-shrink:0;}
.t-bar-fill{height:100%;background:rgba(255,255,255,.65);border-radius:99px;transition:width .4s ease;}
.t-cnt{font-size:9.5px;color:rgba(250,246,239,.5);width:22px;text-align:right;flex-shrink:0;}
.hc-bottom{display:flex;border-top:1px solid var(--bdr);}
.s3{flex:1;padding:12px 14px;border-right:1px solid var(--bdr);display:flex;align-items:center;gap:10px;}
.s3:last-child{border-right:none;}
.s3-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.s3-val{font-size:18px;font-weight:700;color:var(--c0);line-height:1;}
.s3-unit{font-size:10px;font-weight:400;color:var(--mute);}
.s3-label{font-size:10px;color:var(--mute);margin-top:2px;}
.s3-sub{font-size:9px;color:var(--bdr2);}

/* ROW1 AI */
.ai-card{flex:1;overflow:hidden;}
.ai-header{padding:13px 15px 11px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
.ai-header-left{display:flex;align-items:center;gap:5px;}
.ai-star{color:var(--c2);font-size:12px;}
.ai-title{font-size:12.5px;font-weight:700;color:var(--c0);}
.ai-subtitle{font-size:9.5px;color:var(--mute);}
.ai-link{font-size:11px;color:var(--c2);cursor:pointer;text-decoration:underline;text-underline-offset:2px;}
.ai-banner{margin:11px 13px 9px;background:var(--org2);border:1px solid var(--org3);border-radius:8px;padding:8px 11px;font-size:11.5px;color:var(--org);display:flex;gap:7px;line-height:1.5;}
.ai-banner-icon{font-size:13px;flex-shrink:0;margin-top:1px;}
.ai-messages{padding:0 13px;flex:1;overflow:hidden;display:flex;flex-direction:column;gap:7px;}
.ai-msg{display:flex;gap:7px;align-items:flex-start;}
.ai-msg-av{width:22px;height:22px;border-radius:50%;background:var(--c2);color:var(--bg0);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
.ai-msg-bubble{background:var(--card2);border:1px solid var(--bdr);border-radius:0 8px 8px 8px;padding:7px 10px;flex:1;}
.ai-msg-text{font-size:11px;color:var(--c1);line-height:1.6;margin-bottom:2px;}
.ai-msg-time{font-size:9px;color:var(--mute);}
.ai-actions{padding:10px 13px 13px;border-top:1px solid var(--bdr);margin-top:auto;display:flex;gap:6px;}
.ai-act-btn{flex:1;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:7px 4px;font-size:10px;color:var(--c1);cursor:pointer;text-align:center;line-height:1.4;}

/* ROW2 SHORTCUTS */
.sc-card{flex:1.5;padding:16px 18px;}
.sc-grid{display:flex;gap:8px;}
.sc-item{flex:1;background:var(--card2);border:1px solid var(--bdr);border-radius:12px;padding:14px 10px 12px;display:flex;flex-direction:column;align-items:center;cursor:pointer;text-align:center;position:relative;overflow:hidden;transition:transform .13s,box-shadow .13s;}
.sc-item:hover{transform:translateY(-2px);box-shadow:0 5px 16px rgba(44,21,8,.08);}
.sc-item::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:12px 12px 0 0;}
.sc-ra::before{background:linear-gradient(90deg,#C07840,#D4A060);}
.sc-wfd::before{background:linear-gradient(90deg,#5A9E6A,#80C080);}
.sc-rts::before{background:linear-gradient(90deg,#D4775A,#E09070);}
.sc-di::before{background:linear-gradient(90deg,#7A6ABF,#A090D0);}
.sc-we::before{background:linear-gradient(90deg,#9060A0,#B080C0);}
.sc-icon-wrap{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:8px;margin-top:4px;}
.sc-code{font-size:14px;font-weight:700;color:var(--c0);margin-bottom:4px;}
.sc-desc{font-size:10px;color:var(--mute);line-height:1.5;white-space:pre-line;}
.sc-tag{margin-top:8px;font-size:9px;padding:2px 8px;border-radius:99px;font-weight:500;}

/* ROW2 ADVICE */
.advice-card{flex:1;padding:15px 16px;display:flex;flex-direction:column;}
.advice-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;}
.adv-banner{background:var(--org2);border:1px solid var(--org3);border-radius:8px;padding:8px 11px;margin-bottom:10px;display:flex;gap:7px;align-items:flex-start;}
.adv-banner-icon{font-size:13px;flex-shrink:0;margin-top:1px;}
.adv-banner-text{font-size:11.5px;color:var(--org);line-height:1.5;font-weight:500;}
.adv-headline{font-size:15px;font-weight:700;color:var(--c0);margin-bottom:5px;line-height:1.3;}
.adv-body{font-size:11.5px;color:var(--c1);line-height:1.7;margin-bottom:9px;}
.adv-tags{display:flex;gap:5px;margin-bottom:7px;}
.adv-tag{font-size:10px;background:var(--org2);border:1px solid var(--org3);color:var(--org);border-radius:4px;padding:2px 8px;font-weight:500;}
.adv-meta{font-size:9.5px;color:var(--mute);margin-bottom:10px;}
.adv-questions{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.adv-q{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--card2);border:1px solid var(--bdr);border-radius:7px;cursor:pointer;gap:6px;transition:background .13s,border-color .13s;}
.adv-q:hover{background:var(--org2);border-color:var(--org3);}
.adv-q-text{font-size:11px;color:var(--c1);}
.adv-q-arr{font-size:13px;color:var(--mute);}
.adv-btns{display:flex;gap:7px;margin-top:auto;}
.btn-primary{flex:1;background:var(--c2);color:var(--bg0);border:none;border-radius:8px;padding:8px 0;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .13s;}
.btn-primary:hover{background:#6A4D32;}
.btn-ghost{flex:1;background:var(--card2);color:var(--c1);border:1px solid var(--bdr2);border-radius:8px;padding:8px 0;font-size:12px;cursor:pointer;font-family:inherit;}
.badge-outline{font-size:9px;background:var(--bg1);border:1px solid var(--bdr2);border-radius:4px;padding:2px 7px;color:var(--mute);}
.badge-green{font-size:9px;background:#DFF0E4;border:1px solid #A8D4B4;border-radius:4px;padding:2px 7px;color:#3A7E50;font-weight:600;}

/* ROW2 GOAL */
.goal-card{flex:.85;padding:15px 16px;display:flex;flex-direction:column;}
.goal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.goal-top{display:flex;align-items:center;gap:12px;margin-bottom:11px;}
.goal-left{flex:1;}
.goal-pct{font-size:36px;font-weight:800;color:var(--c0);letter-spacing:-.02em;line-height:1;}
.goal-done{font-size:10.5px;color:var(--mute);margin-top:3px;}
.goal-ring-wrap{position:relative;width:66px;height:66px;flex-shrink:0;}
.ring-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:var(--c2);}
.goal-bar-section{margin-bottom:11px;}
.goal-bar-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--mute);margin-bottom:4px;}
.goal-bar-bg{height:5px;background:var(--bdr);border-radius:99px;overflow:hidden;}
.goal-bar-fill{height:100%;background:linear-gradient(90deg,var(--c2),var(--c3));border-radius:99px;transition:width .4s ease;}
.goal-breakdown{display:flex;flex-direction:column;gap:5px;margin-bottom:11px;}
.gb-row{display:flex;align-items:center;gap:7px;}
.gb-code{width:30px;font-size:10px;font-weight:700;color:var(--c1);flex-shrink:0;}
.gb-bar-bg{flex:1;height:4px;background:var(--bdr);border-radius:99px;overflow:hidden;}
.gb-bar-fill{height:100%;border-radius:99px;transition:width .4s ease;}
.gb-val{font-size:10px;color:var(--mute);width:26px;text-align:right;flex-shrink:0;}
.goal-btns{display:flex;gap:6px;margin-top:auto;}
.goal-btn{flex:1;background:var(--card2);color:var(--c1);border:1px solid var(--bdr2);border-radius:8px;padding:7px 0;font-size:11.5px;cursor:pointer;font-family:inherit;}
.goal-btn-p{background:var(--c2);color:var(--bg0);border:none;font-weight:600;}
.goal-btn-wide{flex:1 1 100%;}

.goal-modal-backdrop{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(30,18,8,.24);backdrop-filter:blur(10px);}
.goal-modal{width:min(440px,calc(100vw - 32px));border:1px solid rgba(212,200,180,.72);border-radius:16px;background:rgba(250,246,239,.86);box-shadow:0 22px 60px rgba(30,18,8,.2);padding:18px;color:var(--c0);}
.goal-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;}
.goal-modal-kicker{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--mute);margin-bottom:3px;}
.goal-modal h2{font-size:18px;line-height:1.25;font-weight:800;}
.goal-modal-close{width:30px;height:30px;border:1px solid var(--bdr2);border-radius:9px;background:rgba(250,246,239,.55);color:var(--c2);font-size:20px;line-height:1;cursor:pointer;}
.goal-modal-body{display:flex;flex-direction:column;gap:9px;}
.goal-modal-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 11px;border:1px solid rgba(212,200,180,.8);border-radius:10px;background:rgba(250,246,239,.62);}
.goal-modal-row span{display:flex;flex-direction:column;gap:2px;}
.goal-modal-row b{font-size:13px;color:var(--c0);}
.goal-modal-row em{font-size:10.5px;font-style:normal;color:var(--mute);}
.goal-modal-row input{width:90px;height:34px;border:1px solid var(--bdr2);border-radius:8px;background:rgba(255,255,255,.58);color:var(--c0);font:700 14px/1 inherit;text-align:center;outline:none;}
.goal-modal-row input:focus{border-color:var(--c2);box-shadow:0 0 0 3px rgba(124,92,62,.12);}
.goal-modal-summary{display:flex;justify-content:space-between;gap:12px;margin:13px 0 15px;font-size:11px;color:var(--mute);}
.goal-modal-summary b{color:var(--c0);}
.goal-modal-actions{display:flex;gap:9px;}
.goal-modal-ghost,.goal-modal-primary{flex:1;border-radius:9px;padding:10px 0;font:700 12px/1 inherit;cursor:pointer;}
.goal-modal-ghost{border:1px solid var(--bdr2);background:rgba(250,246,239,.55);color:var(--c1);}
.goal-modal-primary{border:0;background:var(--c2);color:var(--bg0);}

/* ROW3 */
.hm-card{flex:1;padding:17px 18px 16px;display:flex;flex-direction:column;min-height:186px;}
.hm-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;padding-left:34px;margin:7px 0 7px;}
.hm-dlbl{text-align:center;font-size:10px;color:var(--mute);line-height:1;}
.hm-dlbl.today{color:var(--c2);font-weight:700;}
.hm-grid{display:flex;flex-direction:column;gap:6px;}
.hm-row{display:grid;grid-template-columns:28px repeat(7,minmax(0,1fr));align-items:center;gap:6px;}
.hm-code{font-size:10px;font-weight:700;color:var(--c1);}
.hm-cell{height:18px;border-radius:5px;border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--c1);line-height:1;}
.hc0{background:var(--card2);}
.hc1{background:#E8DCCB;}
.hc2{background:#D7BE96;}
.hc3{background:#B58B5F;color:#fff;}
.hc4{background:#7C5C3E;color:#fff;}
.hm-today{border-color:var(--c2)!important;box-shadow:inset 0 0 0 1px rgba(124,92,62,.32);}
.hm-footer{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:13px;font-size:10px;color:var(--mute);}
.hm-legend{display:flex;gap:3px;}
.hml{width:11px;height:11px;border-radius:3px;border:1px solid var(--bdr);}
.hm-total{margin-left:auto;font-size:10px;color:var(--mute);font-weight:600;}

.trend-card{flex:1;padding:17px 18px 16px;display:flex;flex-direction:column;min-height:206px;}
.trend-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;}
.trend-avg{text-align:right;}
.trend-avg-lbl{font-size:9px;color:var(--mute);}
.trend-avg-val{font-size:20px;font-weight:800;color:var(--c0);line-height:1;}
.chart-svg{width:100%;height:154px;display:block;margin-top:0;}
.trend-grid{stroke:var(--bdr);stroke-width:.8;}
.trend-axis{font-size:8px;fill:var(--mute);}
.trend-line{fill:none;stroke:var(--c2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;}
.trend-point{fill:var(--c2);stroke:var(--bg0);stroke-width:1.6;filter:drop-shadow(0 1px 2px rgba(77,52,28,.18));vector-effect:non-scaling-stroke;}
.trend-empty{font-size:10px;fill:var(--mute);}
.trend-date{font-size:8.6px;fill:var(--mute);}
.trend-note{margin-top:8px;font-size:10px;color:var(--mute);background:var(--card2);border-radius:7px;padding:7px 10px;text-align:center;}

.weak-card{flex:1;padding:14px 15px;}
.weak-list,.recent-list{display:flex;flex-direction:column;gap:7px;}
.weak-item{display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--card2);border:1px solid var(--bdr);border-radius:9px;margin-bottom:7px;}
.weak-list .weak-item,.recent-list .rec-item{margin-bottom:0;}
.weak-item:last-child{margin-bottom:0;}
.weak-rank{width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;}
.rank-1{background:#C07840;}.rank-2{background:#B09060;}.rank-3{background:#A09080;}
.weak-name{font-size:12px;font-weight:600;color:var(--c0);margin-bottom:1px;}
.weak-score{font-size:10px;color:var(--mute);}
.weak-empty,.recent-empty{min-height:72px;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;border:1px dashed var(--bdr2);border-radius:9px;background:var(--card2);font-size:11px;color:var(--mute);}

.recent-card{flex:1;padding:14px 15px;}
.rec-item{display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--card2);border:1px solid var(--bdr);border-radius:9px;margin-bottom:7px;cursor:pointer;transition:background .13s;}
.rec-item:last-child{margin-bottom:0;}
.rec-item:hover{background:var(--bg1);}
.rec-badge{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#fff;flex-shrink:0;}
.rec-name{font-size:12px;font-weight:600;color:var(--c0);margin-bottom:1px;}
.rec-meta{font-size:10px;color:var(--mute);}
.rec-arr{font-size:15px;color:var(--bdr2);margin-left:auto;}

@media(max-width:1100px){.row{flex-wrap:wrap;}.hero-card,.ai-card{flex:1 1 100%;}}
@media(max-width:900px){.home-agent-sidebar{display:none;}.hm-card,.trend-card,.weak-card,.recent-card{flex:1 1 48%;}}
@media(max-width:640px){.scroll{padding:10px 12px;}.hm-card,.trend-card,.weak-card,.recent-card{flex:1 1 100%;}}
</style>
