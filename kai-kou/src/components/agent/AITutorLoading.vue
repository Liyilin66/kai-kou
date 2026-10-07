<script setup>
import { computed } from "vue";

const DEFAULT_NAV_ITEMS = [
  { key: "home", label: "首页", to: "/home" },
  { key: "practice", label: "练习中心", to: "/home#quick" },
  { key: "agent", label: "AI 私教", to: "/agent", active: true },
  { key: "plan", label: "学习计划", to: "/home#goal" },
  { key: "report", label: "学习报告", to: "/home#report" },
  { key: "library", label: "题库", to: "/home#quick" },
  { key: "profile", label: "个人中心", to: "/profile" }
];

const DEFAULT_STEPS = [
  {
    name: "连接主聊天",
    desc: "确认你的长期 AI 私教会话",
    label: "同步中",
    status: "going"
  },
  {
    name: "恢复最近消息",
    desc: "拉取上次对话与训练上下文",
    label: "待处理",
    status: "wait"
  },
  {
    name: "同步今日洞察",
    desc: "准备结论、计划和推荐追问",
    label: "待处理",
    status: "wait"
  }
];

const props = defineProps({
  mode: {
    type: String,
    default: "restoring"
  },
  userId: {
    type: String,
    default: "同学"
  },
  userInitial: {
    type: String,
    default: "同"
  },
  userAvatarUrl: {
    type: String,
    default: ""
  },
  showUserAvatar: {
    type: Boolean,
    default: false
  },
  navItems: {
    type: Array,
    default: () => []
  },
  steps: {
    type: Array,
    default: () => []
  },
  progressPercent: {
    type: Number,
    default: 28
  },
  title: {
    type: String,
    default: ""
  },
  subtitle: {
    type: String,
    default: ""
  },
  progressNote: {
    type: String,
    default: ""
  },
  primaryActionLabel: {
    type: String,
    default: ""
  },
  primaryActionLoadingLabel: {
    type: String,
    default: ""
  },
  primaryActionLoading: {
    type: Boolean,
    default: false
  },
  secondaryActionLabel: {
    type: String,
    default: ""
  },
  featureItems: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["disabled-nav", "primary-action", "secondary-action", "avatar-error"]);

const navIconMap = {
  home: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>',
  list: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  spark: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M7 1.5C4.24 1.5 2 3.74 2 6.5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6.5h4M7 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  square: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  report: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 11l3-4 3 2.5 3-5 2 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 3h11M1.5 7h7M1.5 11h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  circle: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
};

const displayNavItems = computed(() => (
  (props.navItems?.length ? props.navItems : DEFAULT_NAV_ITEMS).map((item) => ({
    ...item,
    icon: navIconMap[item.icon] || navIconMap[item.key] || navIconMap.circle
  }))
));
const displaySteps = computed(() => (
  props.steps?.length ? props.steps : DEFAULT_STEPS
));
const isFailedMode = computed(() => props.mode === "failed");
const isAccessMode = computed(() => props.mode === "locked" || props.mode === "unavailable");
const userLetter = computed(() => normalizeText(props.userInitial) || normalizeText(props.userId).charAt(0).toUpperCase() || "同");
const cardTitle = computed(() => (
  props.title || (isAccessMode.value ? "AI 私教为 VIP 专属功能" : (isFailedMode.value ? "暂时没能恢复 AI 私教聊天" : "正在进入 AI 私教工作台"))
));
const subtitleText = computed(() => (
  props.subtitle || (isAccessMode.value ? "当前账号暂时不能使用 AI 私教。升级后可恢复聊天、生成今日计划与专属建议。" : (isFailedMode.value ? "AI 私教暂时不可用，请稍后再试。" : "正在连接会话、同步训练洞察\n稍后即可开始你的专属学习"))
));
const subtitleLines = computed(() => subtitleText.value.split("\n"));
const progressNoteText = computed(() => (
  props.progressNote || (isAccessMode.value ? "当前只保留权益说明和返回入口，不显示生成计划或推荐追问。" : (isFailedMode.value ? "恢复中断，请稍后重试。" : "恢复中，请稍候..."))
));
const progressWidth = computed(() => `${Math.min(100, Math.max(0, Number(props.progressPercent) || 0))}%`);
const topStatusText = computed(() => {
  if (isAccessMode.value) return "VIP 专属";
  return isFailedMode.value ? "恢复失败" : "正在恢复";
});
const insightBadgeText = computed(() => {
  if (isAccessMode.value) return "VIP 后解锁";
  return isFailedMode.value ? "待恢复" : "正在同步";
});
const mainAriaLabel = computed(() => {
  if (isAccessMode.value) return "AI 私教为 VIP 专属功能";
  return isFailedMode.value ? "暂时没能恢复 AI 私教聊天" : "正在进入 AI 私教工作台";
});
const showFeatureItems = computed(() => isAccessMode.value && props.featureItems?.length);
const showActions = computed(() => Boolean(props.primaryActionLabel || props.secondaryActionLabel));
const primaryActionText = computed(() => (
  props.primaryActionLoading && props.primaryActionLoadingLabel
    ? props.primaryActionLoadingLabel
    : props.primaryActionLabel
));
const insightPlanText = computed(() => (isAccessMode.value ? "VIP 后解锁训练计划" : "训练动作与进度"));
const insightNoteText = computed(() => (
  isAccessMode.value ? "升级后解锁今日洞察、计划和推荐追问。" : "恢复聊天完成后显示可追问的问题。"
));

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<template>
  <div
    class="ai-tutor-loading-shell"
    :class="{
      'ai-tutor-loading-shell--failed': isFailedMode,
      'ai-tutor-loading-shell--access': isAccessMode
    }"
  >
    <aside class="ai-tutor-loading-sidebar">
      <RouterLink class="ai-tutor-loading-logo" to="/home" aria-label="返回首页">
        <div class="ai-tutor-loading-logo-icon" aria-hidden="true">
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95" />
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75" />
          </svg>
        </div>
        <span class="ai-tutor-loading-logo-name">开口 PTE</span>
      </RouterLink>

      <nav class="ai-tutor-loading-nav" aria-label="AI 私教加载页导航">
        <template v-for="item in displayNavItems" :key="item.key || item.label">
          <RouterLink
            v-if="item.to && !item.disabled"
            class="ai-tutor-loading-nav-item"
            :class="{ 'ai-tutor-loading-nav-item--active': item.active }"
            :to="item.to"
            :aria-current="item.active ? 'page' : undefined"
          >
            <span class="ai-tutor-loading-nav-icon" aria-hidden="true" v-html="item.icon"></span>
            <span>{{ item.label }}</span>
          </RouterLink>
          <button
            v-else
            class="ai-tutor-loading-nav-item ai-tutor-loading-nav-item--disabled"
            type="button"
            :title="item.disabledReason || '该页面暂未开放'"
            disabled
            @click="emit('disabled-nav', item)"
          >
            <span class="ai-tutor-loading-nav-icon" aria-hidden="true" v-html="item.icon"></span>
            <span>{{ item.label }}</span>
          </button>
        </template>
      </nav>

      <div class="ai-tutor-loading-sidebar-footer">
        <div class="ai-tutor-loading-promo">
          <div class="ai-tutor-loading-promo-title">PTE 备考资料包</div>
          <div class="ai-tutor-loading-promo-sub">真题 · 高频词汇 · 模板</div>
          <button class="ai-tutor-loading-promo-button" type="button" tabindex="-1">免费领取</button>
        </div>
      </div>
    </aside>

    <main class="ai-tutor-loading-main">
      <header class="ai-tutor-loading-topbar">
        <span class="ai-tutor-loading-top-label">AI TUTOR WORKSPACE</span>
        <div class="ai-tutor-loading-top-right">
          <span class="ai-tutor-loading-live-dot" :class="{ 'ai-tutor-loading-live-dot--failed': isFailedMode }" aria-hidden="true"></span>
          <span class="ai-tutor-loading-live-text">{{ topStatusText }}</span>
          <span class="ai-tutor-loading-user-avatar">
            <img v-if="showUserAvatar" :src="userAvatarUrl" alt="" @error="emit('avatar-error')" />
            <b v-else>{{ userLetter }}</b>
          </span>
          <span class="ai-tutor-loading-user-id">{{ userId }}</span>
        </div>
      </header>

      <section class="ai-tutor-loading-content" :aria-label="mainAriaLabel">
        <div class="ai-tutor-loading-card" :class="{ 'ai-tutor-loading-card--failed': isFailedMode }">
          <div
            class="ai-tutor-loading-seal"
            :class="{
              'ai-tutor-loading-seal--failed': isFailedMode,
              'ai-tutor-loading-seal--access': isAccessMode
            }"
            aria-hidden="true"
          >
            <div class="ai-tutor-loading-seal-outer">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" stroke="#C4BAA8" stroke-width=".5" stroke-dasharray="3 2" />
              </svg>
            </div>
            <div class="ai-tutor-loading-seal-inner">
              <svg v-if="isFailedMode" width="18" height="18" fill="none" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="6.5" stroke="#F5EFE4" stroke-width="1.1" opacity=".72" />
                <path d="M6.3 6.3l5.4 5.4M11.7 6.3l-5.4 5.4" stroke="#F5EFE4" stroke-width="1.3" stroke-linecap="round" />
              </svg>
              <svg v-else-if="isAccessMode" width="18" height="18" fill="none" viewBox="0 0 18 18">
                <path d="M9 2.7 13.8 4.4v3.7c0 3.1-1.9 5.8-4.8 7.1-2.9-1.3-4.8-4-4.8-7.1V4.4L9 2.7Z" stroke="#F5EFE4" stroke-width="1.2" stroke-linejoin="round" />
                <path d="m6.8 8.7 1.5 1.5 3-3" stroke="#F5EFE4" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else width="18" height="18" fill="none" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="3.5" fill="#F5EFE4" />
                <circle cx="9" cy="9" r="6.5" stroke="#F5EFE4" stroke-width=".8" stroke-dasharray="2.5 1.8" opacity=".5">
                  <animateTransform attributeName="transform" type="rotate" from="0 9 9" to="360 9 9" dur="5s" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
          </div>

          <h1 class="ai-tutor-loading-title">{{ cardTitle }}</h1>
          <p class="ai-tutor-loading-subtitle">
            <template v-for="(line, index) in subtitleLines" :key="`${line}-${index}`">
              {{ line }}<br v-if="index < subtitleLines.length - 1" />
            </template>
          </p>

          <div v-if="showFeatureItems" class="ai-tutor-loading-features">
            <div
              v-for="item in featureItems"
              :key="item"
              class="ai-tutor-loading-feature"
            >
              <span aria-hidden="true">✓</span>
              <strong>{{ item }}</strong>
            </div>
          </div>

          <div v-else class="ai-tutor-loading-steps">
            <div
              v-for="step in displaySteps"
              :key="step.name"
              class="ai-tutor-loading-step"
              :class="`ai-tutor-loading-step--${step.status}`"
            >
              <div class="ai-tutor-loading-step-icon">
                <svg v-if="step.status === 'done'" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M2.5 6.5l3 3 5-5" stroke="#2D6A2D" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span v-else-if="step.status === 'going'" class="ai-tutor-loading-spinner" aria-hidden="true"></span>
                <svg v-else-if="step.status === 'failed'" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4.6" stroke="#8C5533" stroke-width="1.2" />
                  <path d="M4.6 4.6l3.8 3.8M8.4 4.6 4.6 8.4" stroke="#8C5533" stroke-width="1.35" stroke-linecap="round" />
                </svg>
                <svg v-else width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <circle cx="6.5" cy="6.5" r="4" stroke="#C4BAA8" stroke-width="1.2" />
                </svg>
              </div>

              <div class="ai-tutor-loading-step-text">
                <div class="ai-tutor-loading-step-name">{{ step.name }}</div>
                <div class="ai-tutor-loading-step-desc">{{ step.desc }}</div>
              </div>

              <span class="ai-tutor-loading-step-tag">{{ step.label }}</span>
            </div>
          </div>

          <div class="ai-tutor-loading-progress">
            <div
              class="ai-tutor-loading-progress-fill"
              :class="{ 'ai-tutor-loading-progress-fill--failed': isFailedMode }"
              :style="{ width: progressWidth }"
            ></div>
          </div>
          <p class="ai-tutor-loading-progress-note">{{ progressNoteText }}</p>

          <div v-if="showActions" class="ai-tutor-loading-actions">
            <button
              v-if="primaryActionLabel"
              class="ai-tutor-loading-action ai-tutor-loading-action--primary"
              type="button"
              :disabled="primaryActionLoading"
              @click="emit('primary-action')"
            >
              {{ primaryActionText }}
            </button>
            <button
              v-if="secondaryActionLabel"
              class="ai-tutor-loading-action ai-tutor-loading-action--secondary"
              type="button"
              :disabled="primaryActionLoading"
              @click="emit('secondary-action')"
            >
              {{ secondaryActionLabel }}
            </button>
          </div>
        </div>
      </section>
    </main>

    <aside class="ai-tutor-loading-insight" aria-label="Insight System 加载态">
      <div class="ai-tutor-loading-insight-head">
        <span class="ai-tutor-loading-insight-label">Insight System</span>
        <span class="ai-tutor-loading-insight-badge">{{ insightBadgeText }}</span>
      </div>

      <div class="ai-tutor-loading-insight-body">
        <section class="ai-tutor-loading-insight-section">
          <div class="ai-tutor-loading-insight-section-label">今日 AI 结论</div>
          <span class="ai-tutor-loading-skeleton ai-tutor-loading-skeleton--w80"></span>
          <span class="ai-tutor-loading-skeleton ai-tutor-loading-skeleton--w60"></span>
          <span class="ai-tutor-loading-skeleton ai-tutor-loading-skeleton--w45"></span>
        </section>

        <section class="ai-tutor-loading-insight-section">
          <div class="ai-tutor-loading-insight-section-label">AI 可执行计划</div>
          <div class="ai-tutor-loading-insight-item">
            <span class="ai-tutor-loading-insight-dot" aria-hidden="true"></span>
            <span>{{ insightPlanText }}</span>
          </div>
          <span class="ai-tutor-loading-skeleton ai-tutor-loading-skeleton--w60"></span>
          <span class="ai-tutor-loading-skeleton ai-tutor-loading-skeleton--w80"></span>
        </section>

        <section class="ai-tutor-loading-insight-section">
          <div class="ai-tutor-loading-insight-section-label">推荐追问</div>
          <div class="ai-tutor-loading-insight-note">{{ insightNoteText }}</div>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.ai-tutor-loading-shell {
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background: #ede8df;
  color: #2c1f0e;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
  font-synthesis: none;
  letter-spacing: 0;
}

.ai-tutor-loading-sidebar {
  display: flex;
  flex: 0 0 200px;
  width: 200px;
  flex-direction: column;
  background: #e5dfd4;
  border-right: .5px solid #d4cdbf;
}

.ai-tutor-loading-logo {
  display: flex;
  align-items: center;
  gap: 9px;
  box-sizing: border-box;
  height: 64px;
  flex: 0 0 64px;
  padding: 0 18px;
  border-bottom: .5px solid #d4cdbf;
  text-decoration: none;
}

.ai-tutor-loading-logo-icon {
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #7c5c3e;
}

.ai-tutor-loading-logo-name {
  color: #2c1f0e;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: .03em;
}

.ai-tutor-loading-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 22px 12px 24px;
}

.ai-tutor-loading-nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 0 12px;
  border: .5px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #9a8f80;
  cursor: pointer;
  font-family: inherit;
  font-size: 13.8px;
  line-height: 1.3;
  text-align: left;
  text-decoration: none;
  transition: background .13s, border-color .13s, color .13s;
}

.ai-tutor-loading-nav-item:hover {
  background: #ede8df;
  color: #6b5a44;
}

.ai-tutor-loading-nav-item--active {
  border-color: #cabdaa;
  background: #d9cfbd;
  color: #7c5c3e;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(245, 239, 228, .5);
}

.ai-tutor-loading-nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}

.ai-tutor-loading-nav-icon svg {
  width: 15px;
  height: 15px;
}

.ai-tutor-loading-nav-item--active .ai-tutor-loading-nav-icon {
  opacity: 1;
}

.ai-tutor-loading-nav-item--disabled {
  cursor: not-allowed;
  opacity: .52;
}

.ai-tutor-loading-sidebar-footer {
  padding: 16px 12px 18px;
  border-top: .5px solid #d4cdbf;
}

.ai-tutor-loading-promo {
  padding: 12px;
  border: .5px solid #c4baa8;
  border-radius: 10px;
  background: #d8cebc;
}

.ai-tutor-loading-promo-title {
  margin-bottom: 2px;
  color: #7c5c3e;
  font-size: 11.5px;
  font-weight: 500;
}

.ai-tutor-loading-promo-sub {
  margin-bottom: 9px;
  color: #9a8f80;
  font-size: 10.5px;
}

.ai-tutor-loading-promo-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: #7c5c3e;
  color: #f5efe4;
  font-size: 11px;
  line-height: 1;
  padding: 6px 13px;
}

.ai-tutor-loading-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.ai-tutor-loading-topbar {
  display: flex;
  box-sizing: border-box;
  height: 64px;
  flex: 0 0 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  border-bottom: .5px solid #d4cdbf;
  background: #e5dfd4;
}

.ai-tutor-loading-top-label {
  color: #b8afa0;
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.ai-tutor-loading-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ai-tutor-loading-live-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: #6baa6b;
  animation: aiTutorLoadingBlink 2s ease-in-out infinite;
}

.ai-tutor-loading-live-dot--failed {
  background: #9b6642;
  animation: none;
}

@keyframes aiTutorLoadingBlink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: .3;
  }
}

.ai-tutor-loading-live-text {
  color: #6baa6b;
  font-size: 12px;
  white-space: nowrap;
}

.ai-tutor-loading-shell--failed .ai-tutor-loading-live-text {
  color: #9b6642;
}

.ai-tutor-loading-shell--access .ai-tutor-loading-live-dot {
  background: #9b6642;
  animation: none;
}

.ai-tutor-loading-shell--access .ai-tutor-loading-live-text {
  color: #9b6642;
}

.ai-tutor-loading-user-avatar {
  width: 24px;
  height: 24px;
  margin-left: 8px;
  overflow: hidden;
  border-radius: 50%;
  background: #7c5c3e;
  color: #f5efe4;
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  font-size: 10px;
  font-weight: 800;
}

.ai-tutor-loading-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ai-tutor-loading-user-avatar b {
  font: inherit;
}

.ai-tutor-loading-user-id {
  min-width: 0;
  overflow: hidden;
  color: #b8afa0;
  font-size: 12px;
  margin-left: 6px;
  max-width: 160px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-tutor-loading-content {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 28px 50px;
  overflow: hidden;
}

.ai-tutor-loading-card {
  display: flex;
  width: min(680px, 100%);
  flex-direction: column;
  align-items: center;
  padding: 50px 60px;
  border: .5px solid #d4cdbf;
  border-radius: 22px;
  background: #f5efe4;
  box-shadow: 0 2px 0 #c4baa8;
}

.ai-tutor-loading-seal {
  position: relative;
  width: 56px;
  height: 56px;
  margin-bottom: 28px;
}

.ai-tutor-loading-seal-outer {
  display: flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #c4baa8;
  border-radius: 50%;
  animation: aiTutorLoadingSeal 12s linear infinite;
}

@keyframes aiTutorLoadingSeal {
  to {
    transform: rotate(360deg);
  }
}

.ai-tutor-loading-seal-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #7c5c3e;
}

.ai-tutor-loading-seal--failed .ai-tutor-loading-seal-outer {
  animation: none;
}

.ai-tutor-loading-seal--failed .ai-tutor-loading-seal-inner {
  background: #8c5533;
}

.ai-tutor-loading-seal--access .ai-tutor-loading-seal-outer {
  animation: none;
}

.ai-tutor-loading-seal--access .ai-tutor-loading-seal-inner {
  background: #7c5c3e;
}

.ai-tutor-loading-title {
  color: #2a2118;
  font-family: inherit;
  font-size: 25px;
  font-weight: 680;
  letter-spacing: .025em;
  line-height: 1.28;
  margin: 0 0 9px;
  text-align: center;
}

.ai-tutor-loading-subtitle {
  color: #b8afa0;
  font-size: 12.5px;
  line-height: 1.9;
  margin: 0 0 34px;
  text-align: center;
}

.ai-tutor-loading-steps {
  width: 100%;
  overflow: hidden;
  margin-bottom: 26px;
  border: .5px solid #d4cdbf;
  border-radius: 13px;
  background: #ede8df;
}

.ai-tutor-loading-features {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 22px;
}

.ai-tutor-loading-feature {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  border: .5px solid #d4cdbf;
  border-radius: 11px;
  padding: 0 14px;
  background: #f8f2e8;
  color: #7c5c3e;
}

.ai-tutor-loading-feature span {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  place-items: center;
  border-radius: 50%;
  background: #e5d9c8;
  color: #2d6a2d;
  font-size: 12px;
  font-weight: 800;
}

.ai-tutor-loading-feature strong {
  min-width: 0;
  color: #3d2a1c;
  font-size: 12px;
  font-weight: 680;
  line-height: 1.35;
}

.ai-tutor-loading-step {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: .5px solid #d4cdbf;
}

.ai-tutor-loading-step:last-child {
  border-bottom: 0;
}

.ai-tutor-loading-step--done {
  background: #f5efe4;
}

.ai-tutor-loading-step--going {
  background: #f0e9db;
}

.ai-tutor-loading-step--failed {
  background: #f3e8dc;
}

.ai-tutor-loading-step--wait {
  background: #ede8df;
  opacity: .55;
}

.ai-tutor-loading-step-icon {
  display: flex;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.ai-tutor-loading-step--done .ai-tutor-loading-step-icon {
  background: #d4edd4;
}

.ai-tutor-loading-step--going .ai-tutor-loading-step-icon {
  background: #e8dfd0;
}

.ai-tutor-loading-step--failed .ai-tutor-loading-step-icon {
  background: #ead8c9;
}

.ai-tutor-loading-step--wait .ai-tutor-loading-step-icon {
  background: #ddd7cc;
}

.ai-tutor-loading-step-text {
  min-width: 0;
  flex: 1;
}

.ai-tutor-loading-step-name {
  color: #2c1f0e;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 1px;
}

.ai-tutor-loading-step--wait .ai-tutor-loading-step-name {
  color: #b8afa0;
}

.ai-tutor-loading-step--failed .ai-tutor-loading-step-name {
  color: #4a2c1a;
}

.ai-tutor-loading-step-desc {
  color: #b8afa0;
  font-size: 11.5px;
  line-height: 1.45;
}

.ai-tutor-loading-step-tag {
  flex: 0 0 auto;
  border-radius: 20px;
  font-size: 10.5px;
  line-height: 1.25;
  padding: 3px 10px;
  white-space: nowrap;
}

.ai-tutor-loading-step--done .ai-tutor-loading-step-tag {
  background: #d4edd4;
  color: #2d6a2d;
}

.ai-tutor-loading-step--going .ai-tutor-loading-step-tag {
  background: #e8dfd0;
  color: #7c5c3e;
}

.ai-tutor-loading-step--failed .ai-tutor-loading-step-tag {
  background: #ead8c9;
  color: #8c5533;
}

.ai-tutor-loading-step--wait .ai-tutor-loading-step-tag {
  background: #ddd7cc;
  color: #b8afa0;
}

.ai-tutor-loading-spinner {
  width: 13px;
  height: 13px;
  border: 1.5px solid #c4baa8;
  border-top-color: #7c5c3e;
  border-radius: 50%;
  animation: aiTutorLoadingSpin .75s linear infinite;
}

@keyframes aiTutorLoadingSpin {
  to {
    transform: rotate(360deg);
  }
}

.ai-tutor-loading-progress {
  width: 100%;
  height: 2px;
  overflow: hidden;
  border-radius: 99px;
  background: #d4cdbf;
}

.ai-tutor-loading-progress-fill {
  height: 100%;
  border-radius: 99px;
  background: #7c5c3e;
  transition: width .35s ease;
}

.ai-tutor-loading-progress-fill--failed {
  background: #8c5533;
}

.ai-tutor-loading-progress-note {
  color: #b8afa0;
  font-size: 10.5px;
  letter-spacing: .03em;
  line-height: 1.4;
  margin: 8px 0 0;
}

.ai-tutor-loading-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.ai-tutor-loading-action {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 18px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease;
}

.ai-tutor-loading-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ai-tutor-loading-action:disabled {
  cursor: not-allowed;
  opacity: .62;
}

.ai-tutor-loading-action--primary {
  border: 1px solid #7c5c3e;
  background: #7c5c3e;
  color: #f5efe4;
}

.ai-tutor-loading-action--secondary {
  border: 1px solid #c4baa8;
  background: #f5efe4;
  color: #7c5c3e;
}

.ai-tutor-loading-insight {
  display: flex;
  flex: 0 0 260px;
  width: 260px;
  flex-direction: column;
  overflow: hidden;
  border-left: .5px solid #d4cdbf;
  background: #e5dfd4;
}

.ai-tutor-loading-insight-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: .5px solid #d4cdbf;
}

.ai-tutor-loading-insight-label {
  color: #b8afa0;
  font-size: 9.5px;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.ai-tutor-loading-insight-badge {
  border-radius: 6px;
  background: #d8cebc;
  color: #7c5c3e;
  font-size: 10px;
  line-height: 1;
  padding: 5px 9px;
}

.ai-tutor-loading-insight-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding: 14px;
}

.ai-tutor-loading-insight-section {
  display: flex;
  flex-direction: column;
}

.ai-tutor-loading-insight-section-label {
  color: #b8afa0;
  font-size: 10px;
  letter-spacing: .1em;
  line-height: 1.4;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.ai-tutor-loading-skeleton {
  display: block;
  height: 7px;
  border-radius: 4px;
  background: #d4cdbf;
  margin-bottom: 5px;
  animation: aiTutorLoadingShimmer 1.8s ease-in-out infinite;
}

@keyframes aiTutorLoadingShimmer {
  0%,
  100% {
    opacity: .48;
  }
  50% {
    opacity: 1;
  }
}

.ai-tutor-loading-skeleton--w80 {
  width: 80%;
}

.ai-tutor-loading-skeleton--w60 {
  width: 60%;
}

.ai-tutor-loading-skeleton--w45 {
  width: 45%;
}

.ai-tutor-loading-insight-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: #ddd7cc;
  color: #9a8f80;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 5px;
}

.ai-tutor-loading-insight-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: #c4baa8;
}

.ai-tutor-loading-insight-note {
  border-radius: 9px;
  background: #ddd7cc;
  color: #b8afa0;
  font-size: 11px;
  line-height: 1.7;
  padding: 10px 12px;
}

@media (max-width: 1100px) {
  .ai-tutor-loading-insight {
    display: none;
  }
}

@media (max-width: 768px) {
  .ai-tutor-loading-sidebar {
    display: none;
  }

  .ai-tutor-loading-topbar {
    padding: 0 18px;
  }

  .ai-tutor-loading-content {
    padding: 20px;
  }

  .ai-tutor-loading-card {
    padding: 36px 28px;
  }

  .ai-tutor-loading-features {
    grid-template-columns: 1fr;
  }
}
</style>
