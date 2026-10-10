<template>
  <div class="shell">

    <!-- ═══════════════════════ 侧边栏 ═══════════════════════ -->
    <aside class="sidebar">
      <RouterLink class="sb-logo" to="/home" aria-label="返回首页">
        <div class="logo-mark">
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95"/>
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5"/>
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5"/>
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75"/>
          </svg>
        </div>
        <span class="logo-text">开口 PTE</span>
      </RouterLink>

      <nav class="sb-nav">
        <RouterLink v-for="item in navItems" :key="item.label"
          :to="item.to"
          class="nav-item" :class="{ active: item.active }"
          :aria-current="item.active ? 'page' : undefined">
          <span class="nav-icon" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- 历史对话 -->
      <div class="history-section">
        <div class="history-label">历史对话</div>
        <div v-if="historyLoading" class="history-empty">加载历史中...</div>
        <div v-else-if="historyError" class="history-empty history-empty--error">{{ historyError }}</div>
        <div v-else-if="!chatHistory.length" class="history-empty">暂无历史对话</div>
        <div v-for="h in chatHistory" v-else :key="h.id"
          class="history-item-wrap"
          :class="{
            'history-item-wrap--active': h.active,
            'history-item-wrap--menu': openHistoryMenuId === h.id,
            'history-item-wrap--deleting': deletingSessionId === h.id
          }">
          <button
            class="history-item"
            type="button"
            :disabled="historySwitching || deletingSessionId === h.id"
            @click="selectHistory(h)"
          >
            <span class="history-dot"></span>
            <span class="history-body">
              <span class="history-title">{{ h.title }}</span>
              <span class="history-time">{{ h.time }}</span>
            </span>
          </button>
          <div
            class="history-menu"
            :ref="(el) => setHistoryMenuRef(el, h.id)"
          >
            <button
              class="history-more"
              type="button"
              :aria-expanded="openHistoryMenuId === h.id"
              :aria-label="`打开 ${h.title} 的会话操作`"
              :disabled="historySwitching || deletingSessionId === h.id"
              @click.stop="toggleHistoryMenu(h)"
            >
              <span class="history-more-dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>
            <div v-if="openHistoryMenuId === h.id" class="history-popover" @click.stop>
              <button
                class="history-delete"
                type="button"
                :class="{ 'history-delete--confirm': confirmingDeleteSessionId === h.id }"
                :disabled="deletingSessionId === h.id"
                @click="handleHistoryDeleteClick(h)"
              >
                {{
                  deletingSessionId === h.id
                    ? "删除中..."
                    : confirmingDeleteSessionId === h.id
                      ? "确认删除"
                      : "删除"
                }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="sb-footer">
        <div class="promo-card">
          <div>
            <div class="promo-title">WE 模板库</div>
            <div class="promo-sub">写作结构 · 模板参考</div>
          </div>
          <button class="promo-btn" type="button" @click="router.push('/we/templates')">查看模板</button>
        </div>
      </div>
    </aside>

    <!-- ═══════════════════════ 主区域 ═══════════════════════ -->
    <div class="main">

      <!-- 顶栏 -->
      <header class="topbar">
        <div class="topbar-main">
          <div class="topbar-heading">
            <div class="topbar-meta-row">
              <span class="page-eyebrow">AI TUTOR</span>
              <span class="status-pill status-pill--inline">
                <span class="status-dot"></span>
                {{ workspaceStatusLabel }}
              </span>
            </div>
            <h1 class="page-title">AI 私教</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="action-btn" @click="newSession">新对话</button>
          <button class="action-btn action-btn--ghost" @click="clearHistory">清空</button>
          <div class="user-chip">
            <div class="user-avatar">
              <img v-if="showUserAvatar" :src="userAvatarUrl" alt="" @error="emit('avatar-error')" />
              <span v-else>{{ userLetter }}</span>
            </div>
            <span>{{ userName }}</span>
          </div>
        </div>
      </header>

      <!-- 主体内容 -->
      <div class="body-area">

        <!-- ── 左侧：主对话区 ── -->
        <div class="chat-column">

          <!-- 对话消息区 -->
          <div class="messages-area" ref="messagesRef">
            <template v-if="displayMessages.length === 0">
              <div class="empty-state">
                <div class="empty-icon">✦</div>
                <div class="empty-title">开启你的 AI 私教对话</div>
                <div class="empty-sub">输入任何问题，或使用下方快捷指令开始</div>
              </div>
            </template>
            <template v-else>
              <div v-for="msg in displayMessages" :key="msg.id"
                class="message" :class="`message--${msg.role}`">
                <div class="msg-avatar" v-if="msg.role === 'assistant'">AI</div>
                <div class="msg-bubble">
                  <div class="msg-text">
                    <template v-for="(block, blockIndex) in msg.blocks" :key="`${msg.id}-${blockIndex}`">
                      <p v-if="block.type === 'paragraph'">{{ block.text }}</p>
                      <div v-else-if="block.type === 'table'" class="msg-table-wrap">
                        <table class="msg-table">
                          <thead>
                            <tr>
                              <th v-for="(header, headerIndex) in block.headers" :key="`${msg.id}-${blockIndex}-h-${headerIndex}`">{{ header }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(row, rowIndex) in block.rows" :key="`${msg.id}-${blockIndex}-r-${rowIndex}`">
                              <td v-for="(cell, cellIndex) in row" :key="`${msg.id}-${blockIndex}-r-${rowIndex}-c-${cellIndex}`">{{ cell }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </template>
                  </div>
                  <div class="msg-time">{{ msg.time }}</div>
                </div>
                <div class="msg-avatar msg-avatar--user" v-if="msg.role === 'user'">{{ userLetter }}</div>
                <div v-if="msg.role === 'assistant' && msg.planSuggestion" class="msg-plan-actions">
                  <button
                    type="button"
                    class="retry-btn"
                    :disabled="planSaving || getPlanAttachStatus(msg).state === 'saved'"
                    @click="emit('attach-plan', msg)"
                  >
                    {{
                      getPlanAttachStatus(msg).state === 'saving'
                        ? '正在接入...'
                        : getPlanAttachStatus(msg).state === 'saved'
                          ? '已接入今日计划'
                          : '一键接入可执行计划'
                    }}
                  </button>
                  <div v-if="getPlanAttachStatus(msg).state === 'error'" class="msg-plan-error">
                    {{ getPlanAttachStatus(msg).message }}
                  </div>
                </div>
              </div>
            </template>
            <div v-if="pending" class="message message--assistant message--thinking" aria-live="polite" aria-label="AI 私教思考中">
              <div class="msg-avatar">AI</div>
              <div class="msg-bubble msg-bubble--thinking">
                <div class="typing-indicator">
                  <span class="typing-label">思考中</span>
                  <span class="typing-dots" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 快捷指令 -->
          <div class="quick-cmds">
            <button v-for="cmd in quickCmds" :key="cmd.label"
              class="quick-btn" @click="sendQuick(cmd)">
              <span class="quick-icon">{{ cmd.icon }}</span>
              {{ cmd.label }}
            </button>
          </div>

          <!-- 输入框 -->
          <div class="input-wrap">
            <textarea
              class="chat-input"
              v-model="inputText"
              placeholder="问 AI：我今天该先练什么？或选择上方快捷操作..."
              :disabled="composerDisabled"
              rows="2"
              @keydown.enter.exact.prevent="sendMessage"
              @keydown.enter.shift.exact="inputText += '\n'"
            ></textarea>
            <button class="send-btn" @click="sendMessage" :disabled="composerDisabled || !inputText.trim()">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path d="M2 8l12-6-6 12V9L2 8z" stroke="currentColor" stroke-width="1.5"
                      stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="input-disclaimer">AI 内容仅供参考，请结合个人实际情况判断。</div>

        </div>

        <!-- ── 右侧：简报面板 ── -->
        <aside class="insight-panel">
          <!-- 私教工具 -->
          <div class="insight-section tutor-tools-section">
            <div class="insight-section-hd">
              <span class="insight-icon insight-icon--tools">✦</span>
              <span class="insight-section-title">私教工具</span>
            </div>
            <div class="tutor-tool-grid" aria-label="AI 私教能力入口">
              <button
                v-for="feat in features"
                :key="feat.title"
                class="tutor-tool"
                type="button"
                :aria-label="`${feat.title}：${feat.desc}`"
                @click="selectFeature(feat)"
              >
                <span class="tutor-tool-icon" aria-hidden="true">
                  <span v-html="feat.icon"></span>
                </span>
                <span class="tutor-tool-title">{{ feat.title }}</span>
                <span class="tutor-tool-desc">{{ feat.shortDesc }}</span>
              </button>
            </div>
          </div>

          <!-- 今日 AI 结论 -->
          <div class="insight-section">
            <div class="insight-section-hd">
              <span class="insight-icon insight-icon--star">✦</span>
              <span class="insight-section-title">今日 AI 结论</span>
              <button
                class="insight-badge insight-badge--mute insight-badge--button"
                type="button"
                :disabled="conclusionRefreshing || conclusionRetrying"
                @click="retryInsight"
              >
                AI 聚焦
              </button>
            </div>
            <div v-if="conclusionPanelState === 'loading'" class="insight-empty-card">
              <div class="insight-empty-title">正在分析</div>
              <div class="insight-empty-desc">正在读取练习记录并生成今日洞察。</div>
            </div>
            <div v-else-if="conclusionPanelState === 'ready'" class="insight-empty-card">
              <div class="insight-empty-title">{{ dailyConclusion.title }}</div>
              <div class="insight-empty-desc">{{ dailyConclusion.summary }}</div>
              <div v-if="conclusionRefreshing || conclusionRetrying" class="insight-refresh-note">
                {{ conclusionRetrying ? "正在重试..." : "同步中" }}
              </div>
              <div v-else-if="conclusionStatusNote" class="insight-refresh-note">{{ conclusionStatusNote }}</div>
              <button v-if="dailyConclusion.cta" class="retry-btn" @click="emit('conclusion-detail')">{{ dailyConclusion.cta }}</button>
            </div>
            <div v-else class="insight-empty-card">
              <div class="insight-empty-title">暂不可用</div>
              <div class="insight-empty-desc">{{ conclusionUnavailableMessage }}</div>
              <button class="retry-btn" :disabled="conclusionRefreshing || conclusionRetrying" @click="retryInsight">
                {{ conclusionRetrying ? "正在重试..." : "重试今日洞察" }}
              </button>
            </div>
          </div>

          <!-- AI 可执行计划 -->
          <div class="insight-section">
            <div class="insight-section-hd">
              <span class="insight-icon insight-icon--plan">📋</span>
              <span class="insight-section-title">AI 可执行计划</span>
              <span class="insight-badge insight-badge--wait">{{ planProgressDisplay }}</span>
            </div>
            <div v-if="planPanelState === 'ready'" class="plan-empty">
              <div class="plan-ready-head">
                <div>
                  <div class="plan-empty-title">{{ hasSavedExecutablePlan ? "今日计划" : "AI 建议草案" }}</div>
                  <div class="plan-empty-desc">{{ planStatusMessage || "接入后会用练习记录更新进度。" }}</div>
                </div>
                <strong>{{ displayPlanTotalMinutes || "--" }} 分钟</strong>
              </div>
              <div class="plan-ready-list">
                <button
                  v-for="(item, index) in displayPlanItems"
                  :key="`${item.task_type}-${item.label}-${index}`"
                  class="plan-ready-row"
                  type="button"
                  :disabled="item.is_complete || planSaving"
                  @click="emit('plan-item-click', item)"
                >
                  <span class="plan-ready-code">{{ item.task_type }}</span>
                  <span class="plan-ready-copy">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.focus }}</small>
                  </span>
                  <span class="plan-ready-count">
                    <template v-if="hasSavedExecutablePlan">{{ item.effective_completed_count || 0 }}/{{ item.target_count || item.count }}</template>
                    <template v-else>{{ item.count }} 次</template>
                  </span>
                </button>
              </div>
              <button class="retry-btn plan-start-btn" :disabled="planLoading || planSaving || isPlanComplete" @click="emit('start-training')">
                {{ startTrainingLabel }}
              </button>
              <div v-if="planRefreshing || planRetrying" class="insight-refresh-note">
                {{ planRetrying ? "正在重试..." : "同步中" }}
              </div>
            </div>
            <div v-else-if="planPanelState === 'loading'" class="plan-empty">
              <div class="plan-empty-title">正在同步今日计划</div>
              <div class="plan-empty-desc">正在读取可执行训练动作与进度。</div>
              <div class="plan-skeleton">
                <div class="skel skel--w80"></div>
                <div class="skel skel--w60"></div>
                <div class="skel skel--w70"></div>
              </div>
            </div>
            <div v-else-if="planPanelState === 'no_plan'" class="plan-empty">
              <div class="plan-empty-title">还没有可执行计划</div>
              <div class="plan-empty-desc">向 AI 说：帮我生成今日计划。</div>
              <button
                class="retry-btn plan-retry-btn"
                :disabled="composerDisabled || pending"
                @click="emit('generate-plan')"
              >
                去生成计划
              </button>
              <div v-if="planRefreshing || planRetrying" class="insight-refresh-note">
                {{ planRetrying ? "正在重试..." : "同步中" }}
              </div>
            </div>
            <div v-else class="plan-empty">
              <div class="plan-empty-title">{{ planUnavailableTitle }}</div>
              <div class="plan-empty-desc">{{ planUnavailableMessage }}</div>
              <div class="plan-skeleton">
                <div class="skel skel--w80"></div>
                <div class="skel skel--w60"></div>
                <div class="skel skel--w70"></div>
              </div>
              <button class="retry-btn plan-retry-btn" :disabled="planLoading || planRetrying" @click="retryPlan">
                {{ planRetrying ? "正在重试..." : "重试今日计划" }}
              </button>
            </div>
          </div>

          <!-- 推荐追问 -->
          <div class="insight-section followup-section">
            <div class="insight-section-hd">
              <span class="insight-icon insight-icon--chat">💬</span>
              <span class="insight-section-title">继续问 AI</span>
            </div>
            <div class="followup-intro">把建议继续问到具体动作</div>
            <div class="followup-list">
              <button v-for="q in followupQuestions" :key="q"
                class="followup-item" type="button" @click="handleFollowup(q)">
                <span class="followup-mark">问</span>
                <span class="followup-text">{{ q }}</span>
              </button>
            </div>
          </div>

        </aside>
      </div><!-- /body-area -->
    </div><!-- /main -->
  </div><!-- /shell -->
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { hasUnavailableTaskRecommendation } from "@/lib/enabled-task-types";
import { parseAgentContent } from "@/lib/agent-rich-content";

const router = useRouter();

const props = defineProps({
  navItems: { type: Array, default: () => [] },
  userDisplayName: { type: String, default: "同学" },
  userInitial: { type: String, default: "Y" },
  userAvatarUrl: { type: String, default: "" },
  showUserAvatar: { type: Boolean, default: false },
  workspaceState: { type: String, default: "empty" },
  workspaceStatusLabel: { type: String, default: "可开始新对话" },
  workbenchTitle: { type: String, default: "开启新的 AI 私教对话" },
  workbenchDescription: { type: String, default: "输入框是主入口：直接提问，或选择快捷入口，让 AI 把练习记录转成今天的训练动作。" },
  canUseAgent: { type: Boolean, default: false },
  pending: { type: Boolean, default: false },
  draft: { type: String, default: "" },
  composerDisabled: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  sessionHistory: { type: Array, default: () => [] },
  historyLoading: { type: Boolean, default: false },
  historyError: { type: String, default: "" },
  historySwitching: { type: Boolean, default: false },
  deletingSessionId: { type: String, default: "" },
  overviewStats: { type: Array, default: () => [] },
  practiceOverviewRows: { type: Array, default: () => [] },
  capabilityCards: { type: Array, default: () => [] },
  quickActions: { type: Array, default: () => [] },
  dailyConclusion: { type: Object, default: () => ({}) },
  conclusionPanelState: { type: String, default: "unavailable" },
  conclusionUnavailableMessage: { type: String, default: "今日洞察暂未完成，可稍后重试。" },
  conclusionRefreshing: { type: Boolean, default: false },
  conclusionRetrying: { type: Boolean, default: false },
  conclusionStatusNote: { type: String, default: "" },
  displayPlanItems: { type: Array, default: () => [] },
  displayPlanTotalMinutes: { type: Number, default: 0 },
  hasExecutablePlan: { type: Boolean, default: false },
  hasSavedExecutablePlan: { type: Boolean, default: false },
  isPlanComplete: { type: Boolean, default: false },
  planPanelState: { type: String, default: "unavailable" },
  planProgressDisplay: { type: String, default: "待接入" },
  planStatusMessage: { type: String, default: "" },
  planUnavailableTitle: { type: String, default: "暂无可执行计划" },
  planUnavailableMessage: { type: String, default: "还没有可执行计划，请在中间输入框向 AI 说明你想生成今日计划。" },
  planSaving: { type: Boolean, default: false },
  planLoading: { type: Boolean, default: false },
  planRefreshing: { type: Boolean, default: false },
  planRetrying: { type: Boolean, default: false },
  startTrainingLabel: { type: String, default: "开始训练" },
  recommendedQuestions: { type: Array, default: () => [] },
  questionPanelState: { type: String, default: "unavailable" },
  questionUnavailableMessage: { type: String, default: "恢复聊天完成后会显示可追问的问题。" },
  planAttachStatus: { type: Object, default: () => ({}) }
});

const emit = defineEmits([
  "update:draft",
  "submit",
  "quick-action",
  "feature-select",
  "restart-conversation",
  "delete-history",
  "session-select",
  "delete-session",
  "avatar-error",
  "conclusion-detail",
  "retry-conclusion",
  "retry-plan",
  "generate-plan",
  "start-training",
  "plan-item-click",
  "recommended-question",
  "attach-plan"
]);

const messagesRef = ref(null);
const openHistoryMenuId = ref("");
const confirmingDeleteSessionId = ref("");
const historyMenuRoot = ref(null);

const navIconMap = {
  home: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>',
  list: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  spark: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M7 1.5C4.24 1.5 2 3.74 2 6.5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6.5h4M7 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  square: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  report: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 11l3-4 3 2.5 3-5 2 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 3h11M1.5 7h7M1.5 11h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  circle: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  trend: '<svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 12l4-5 3 3 3-6 2 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plan: '<svg width="16" height="16" fill="none" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  chat: '<svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 4c0-1.1.9-2 2-2h8a2 2 0 012 2v5a2 2 0 01-2 2H6l-4 3V4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
};
const quickIconMap = {
  trend: "📊",
  calendar: "📋",
  question: "🎯",
  clock: "⏱",
  heart: "💪"
};
const featureColorMap = ["#EED8C8", "#D4EDD4", "#D4D4EE"];
const featureShortDescMap = {
  diagnose: "看弱项",
  plan: "排训练",
  coach: "继续聊"
};

const navItems = computed(() => props.navItems.map((item) => ({
  ...item,
  to: item.to || item.target || "/home",
  active: Boolean(item.active),
  icon: navIconMap[item.icon] || navIconMap[item.key] || navIconMap.circle
})));
const chatHistory = computed(() => (
  Array.isArray(props.sessionHistory) ? props.sessionHistory : []
)
  .map((item) => ({
    id: normalizeText(item?.id),
    title: normalizeText(item?.title).slice(0, 28) || "未命名对话",
    time: normalizeText(item?.time) || "刚刚",
    active: Boolean(item?.active)
  }))
  .filter((item) => item.id));
const features = computed(() => {
  const source = props.capabilityCards.length ? props.capabilityCards : [
    { id: "diagnose", title: "诊断", text: "把近期练习、分数和薄弱题型整理成优先级。", icon: "trend" },
    { id: "plan", title: "计划", text: "把建议转成今天能执行的题型、次数和训练顺序。", icon: "plan" },
    { id: "coach", title: "陪练", text: "在聊天中继续追问，直到下一步动作足够清晰。", icon: "chat" }
  ];
  return source.map((item, index) => ({
    ...item,
    icon: navIconMap[item.icon] || navIconMap.trend,
    iconBg: featureColorMap[index] || "#EED8C8",
    desc: item.text || item.desc || "",
    shortDesc: item.shortText || item.short || featureShortDescMap[item.id] || item.title
  }));
});
const inputText = computed({
  get: () => props.draft,
  set: (value) => emit("update:draft", value)
});
const displayMessages = computed(() => props.messages.map((item) => ({
  ...item,
  text: normalizeText(item.content || item.text),
  blocks: parseAgentContent(item.content || item.text)
})));
const quickCmds = computed(() => (props.quickActions.length ? props.quickActions : [
  { icon: "📊", label: "分析弱项", text: "请帮我分析近期的弱项题型，给出优先级排序。" },
  { icon: "📋", label: "生成今日计划", text: "请根据我的练习记录生成今日学习计划。" },
  { icon: "🎯", label: "解释低分", text: "请解释我最近分数偏低的原因，并给出改进建议。" },
  { icon: "⏱", label: "安排 40 分钟", text: "我有 40 分钟，请帮我安排一个高效的练习计划。" },
  { icon: "💪", label: "给我鼓励", text: "给我一些针对 PTE 备考的鼓励和建议。" }
]).map((item) => ({
  ...item,
  icon: quickIconMap[item.icon] || item.icon || "✦",
  text: item.prompt || item.text || item.label
})));
const followupQuestions = computed(() => (props.recommendedQuestions.length
  ? props.recommendedQuestions.map((item) => normalizeText(item.text || item.prompt || item)).filter(Boolean)
  : ["我今天最应该练哪个题型？", "DI 如何快速提高信息覆盖率？", "RTS 复述流畅度怎么练？", "WFD 总丢冠词和复数怎么办？"]).filter(question => !hasUnavailableTaskRecommendation({ advice: question })));
const userName = computed(() => normalizeText(props.userDisplayName) || "同学");
const userLetter = computed(() => normalizeText(props.userInitial) || userName.value.charAt(0).toUpperCase() || "Y");

watch(
  () => [props.messages.length, props.pending],
  async () => {
    await nextTick();
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  },
  { immediate: true }
);

watch(
  () => props.deletingSessionId,
  (sessionId) => {
    if (sessionId) {
      openHistoryMenuId.value = sessionId;
      confirmingDeleteSessionId.value = "";
      return;
    }
    openHistoryMenuId.value = "";
  }
);

onMounted(() => {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerdown", handleHistoryMenuPointerDown, true);
});

onBeforeUnmount(() => {
  if (typeof document === "undefined") return;
  document.removeEventListener("pointerdown", handleHistoryMenuPointerDown, true);
});

function selectFeature(feat) {
  emit("feature-select", feat);
}

function sendMessage() {
  const text = normalizeText(inputText.value);
  if (!text || props.composerDisabled) return;
  emit("submit", text);
}

function sendText(text) {
  const normalized = normalizeText(text);
  if (!normalized || props.composerDisabled) return;
  emit("submit", normalized);
}

function sendQuick(cmd) {
  emit("quick-action", cmd);
}

function newSession() {
  closeHistoryMenu();
  emit("restart-conversation");
}

function clearHistory() {
  closeHistoryMenu();
  emit("delete-history");
}

function selectHistory(item) {
  if (props.historySwitching || props.deletingSessionId) return;
  openHistoryMenuId.value = "";
  confirmingDeleteSessionId.value = "";
  emit("session-select", item);
}

function toggleHistoryMenu(item) {
  const sessionId = normalizeText(item?.id);
  if (!sessionId || props.historySwitching || props.deletingSessionId) return;
  openHistoryMenuId.value = openHistoryMenuId.value === sessionId ? "" : sessionId;
  confirmingDeleteSessionId.value = "";
}

function handleHistoryDeleteClick(item) {
  const sessionId = normalizeText(item?.id);
  if (!sessionId || props.deletingSessionId) return;
  if (confirmingDeleteSessionId.value !== sessionId) {
    confirmingDeleteSessionId.value = sessionId;
    return;
  }

  emit("delete-session", item);
}

function setHistoryMenuRef(element, sessionId) {
  if (openHistoryMenuId.value === normalizeText(sessionId)) {
    historyMenuRoot.value = element || null;
  }
}

function handleHistoryMenuPointerDown(event) {
  if (!openHistoryMenuId.value) return;
  const menuElement = historyMenuRoot.value;
  const target = event.target;
  if (menuElement && target instanceof Node && menuElement.contains(target)) return;
  closeHistoryMenu();
}

function closeHistoryMenu() {
  openHistoryMenuId.value = "";
  confirmingDeleteSessionId.value = "";
  historyMenuRoot.value = null;
}

function retryInsight() {
  emit("retry-conclusion");
}

function retryPlan() {
  emit("retry-plan");
}

function handleFollowup(question) {
  const source = props.recommendedQuestions.find((item) => normalizeText(item.text || item.prompt || item) === question);
  if (source) {
    emit("recommended-question", source);
    return;
  }
  sendText(question);
}

function getPlanAttachStatus(message) {
  return props.planAttachStatus?.[message?.id] || { state: "idle", message: "" };
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════
   CSS 变量
═══════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.shell {
  --cream:      var(--kk-surface);
  --cream-2:    var(--kk-bg);
  --cream-3:    var(--kk-surface);
  --border:     var(--kk-line);
  --border-2:   var(--kk-line);
  --brown:      var(--kk-ink);
  --brown-lt:   var(--kk-ink-2);
  --text-main:  var(--kk-ink);
  --text-mid:   var(--kk-ink-2);
  --text-soft:  var(--kk-ink-3);
  --text-mute:  var(--kk-ink-3);
  --green:      var(--kk-success);
  --orange:     var(--kk-action-text);
  --workspace-header-height: 64px;
  display: flex;
  width: 100vw;
  height: 100vh;
  background: var(--cream-2);
  font-family: var(--kk-font);
  color: var(--text-main);
  overflow: hidden;
}

/* ═══════════════════════════════════════════════════
   侧边栏
═══════════════════════════════════════════════════ */
.sidebar {
  width: 200px;
  flex: 0 0 200px;
  background: var(--cream-3);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sb-logo {
  display: flex;
  align-items: center;
  gap: 9px;
  height: var(--workspace-header-height);
  padding: 0 18px;
  border-bottom: 0.5px solid var(--border);
  flex-shrink: 0;
  text-decoration: none;
}

.logo-mark {
  width: 30px; height: 30px;
  background: var(--brown);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.logo-text { font-size: 17px; font-weight: 500; color: var(--text-main); letter-spacing: .03em; }

.sb-nav {
  padding: 22px 12px 24px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 0.5px solid var(--border);
}

.nav-item {
  display: flex; align-items: center; gap: 11px;
  min-height: 42px;
  padding: 0 12px; border-radius: 10px;
  font-size: 15px; line-height: 1.3; color: var(--text-soft); cursor: pointer;
  transition: background .13s, border-color .13s, color .13s;
  border: 0.5px solid transparent;
  text-decoration: none;
}
.nav-item:hover { background: var(--cream-2); color: var(--text-mid); }
.nav-item.active {
  background: var(--kk-action-soft);
  border-color: var(--kk-line);
  color: var(--brown);
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5);
}
.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}
.nav-icon svg {
  width: 15px;
  height: 15px;
}

/* 历史 */
.history-section { flex: 1; overflow-y: auto; padding: 12px 8px 8px; }
.history-section::-webkit-scrollbar { width: 3px; }
.history-section::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

.history-label {
  font-size: 12px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-mute); padding: 0 8px; margin-bottom: 8px;
}

.history-item-wrap {
  position: relative;
  border-radius: 8px;
  transition: background .13s;
}
.history-item-wrap:hover,
.history-item-wrap--active,
.history-item-wrap--menu {
  background: var(--cream-2);
}
.history-item-wrap--deleting {
  opacity: .72;
}
.history-item {
  display: flex; align-items: flex-start; gap: 8px;
  width: 100%;
  border: 0;
  min-height: 42px;
  padding: 8px 34px 8px 9px; border-radius: 8px; cursor: pointer;
  background: transparent;
  font-family: inherit;
  text-align: left;
  color: inherit;
}
.history-item:disabled { cursor: wait; opacity: .7; }
.history-empty {
  padding: 8px;
  color: var(--text-mute);
  font-size: 13px;
  line-height: 1.5;
}
.history-empty--error { color: var(--brown); }

.history-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--border-2); flex-shrink: 0; margin-top: 5px;
}

.history-body {
  display: block;
  min-width: 0;
}
.history-title {
  display: block;
  overflow: hidden;
  font-size: 13px;
  color: var(--text-mid);
  line-height: 1.4;
  margin-bottom: 2px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-time  { display: block; font-size: 12px; color: var(--text-mute); }
.history-menu {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 5;
}
.history-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0.5px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-mute);
  cursor: pointer;
  font-family: inherit;
  line-height: 0;
  opacity: 0;
  transition: opacity .13s, background .13s, border-color .13s, color .13s;
}
.history-more-dots {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2.5px;
  line-height: 0;
}
.history-more-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}
.history-item-wrap:hover .history-more,
.history-item-wrap--menu .history-more,
.history-more:focus-visible {
  opacity: 1;
}
.history-more:hover:not(:disabled),
.history-more[aria-expanded="true"] {
  background: rgba(30, 27, 24, .09);
  border-color: rgba(30, 27, 24, .18);
  color: var(--brown);
}
.history-more:disabled {
  cursor: wait;
  opacity: .55;
}
.history-popover {
  position: absolute;
  top: 28px;
  right: 0;
  min-width: 82px;
  padding: 5px;
  border: 0.5px solid var(--kk-line);
  border-radius: 8px;
  background: var(--kk-surface);
  box-shadow: 0 8px 20px rgba(30, 27, 24, .12);
}
.history-delete {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--kk-error);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 7px 9px;
  text-align: left;
  white-space: nowrap;
}
.history-delete:hover:not(:disabled),
.history-delete--confirm {
  background: var(--kk-surface-2);
  color: var(--kk-error);
}
.history-delete:disabled {
  cursor: wait;
  opacity: .66;
}

/* 底部推广 */
.sb-footer { padding: 16px 12px 18px; border-top: 0.5px solid var(--border); flex-shrink: 0; }
.promo-card {
  background: var(--kk-surface-2); border: 0.5px solid var(--border-2);
  border-radius: 10px; padding: 12px;
  display: block;
}
.promo-title { margin-bottom: 2px; font-size: 13px; font-weight: 500; color: var(--brown); }
.promo-sub   { margin-bottom: 9px; font-size: 12px; color: var(--text-mute); }
.promo-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--brown); color: var(--cream);
  border: none; font-size: 13px; line-height: 1; padding: 6px 13px; border-radius: 6px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
}

/* ═══════════════════════════════════════════════════
   主区域
═══════════════════════════════════════════════════ */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

/* 顶栏 */
.topbar {
  flex-shrink: 0;
  background: var(--cream-3);
  border-bottom: 0.5px solid var(--border);
  height: var(--workspace-header-height);
  min-height: var(--workspace-header-height);
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: stretch;
}

.topbar-main {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 28px 7px;
  border-right: 0.5px solid var(--border);
}
.topbar-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
  max-width: 520px;
}
.topbar-meta-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 16px;
}
.page-eyebrow {
  font-size: 12px;
  letter-spacing: .16em;
  color: var(--text-mute);
  text-transform: uppercase;
  line-height: 1;
  white-space: nowrap;
}
.page-title {
  font-size: 21px;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
}

.topbar-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  padding: 0 18px;
}

.status-pill {
  display: flex; align-items: center; gap: 6px;
  background: var(--kk-success-bg); border: 0.5px solid var(--kk-success-line);
  border-radius: 99px; padding: 4px 11px;
  font-size: 13px; color: var(--kk-success); font-weight: 500;
}
.status-pill--inline {
  padding: 2px 7px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--green);
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink { 0%,100%{opacity:1;} 50%{opacity:.3;} }

.action-btn {
  min-height: 31px;
  background: var(--brown); color: var(--cream); border: 0.5px solid rgba(30, 27, 24, .22);
  border-radius: 999px; padding: 0 13px; font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit; transition: background .14s, border-color .14s, color .14s;
  box-shadow: 0 1px 3px rgba(30, 27, 24, .08);
}
.action-btn:hover { background: var(--kk-ink-2); }
.action-btn--ghost {
  background: rgba(255, 255, 255, .44); color: var(--brown-lt); border-color: rgba(30, 27, 24, .18);
  box-shadow: none;
}
.action-btn--ghost:hover { background: rgba(243, 239, 232, .58); color: var(--brown); }
.user-chip {
  display: flex; align-items: center; gap: 7px;
  min-height: 31px;
  padding: 4px 10px; border: 0.5px solid rgba(30, 27, 24, .16);
  border-radius: 99px; font-size: 13px; color: var(--text-mid);
  background: rgba(255, 255, 255, .36);
}
.user-avatar {
  width: 21px; height: 21px; border-radius: 50%;
  background: var(--brown); color: var(--cream);
  font-size: 13px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* ── 主体双栏 ── */
.body-area {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* ═══════════════════════════════════════════════════
   左侧对话列
═══════════════════════════════════════════════════ */
.chat-column {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  padding: 0;
  border-right: 0.5px solid var(--border);
}

/* 消息区 */
.messages-area {
  flex: 1; overflow-y: auto; padding: 14px 20px;
  display: flex; flex-direction: column; gap: 12px;
}
.messages-area::-webkit-scrollbar { width: 4px; }
.messages-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center;
  padding: 36px 0;
}
.empty-icon  { font-size: 36px; color: var(--border-2); margin-bottom: 16px; line-height: 1; }
.empty-title { font-size: 18px; font-weight: 600; color: var(--text-mid); margin-bottom: 8px; }
.empty-sub   { font-size: 15px; color: var(--text-mute); }

.message { display: flex; align-items: flex-end; gap: 9px; }
.message--user { justify-content: flex-end; }
.message--thinking { align-items: center; }

.msg-avatar {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: var(--brown); color: var(--cream);
  font-size: 12px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.msg-avatar--user { background: var(--kk-ink-2); }

.msg-bubble {
  max-width: 70%;
  background: var(--cream); border: 0.5px solid var(--border);
  border-radius: 12px; padding: 10px 13px;
}
.message--user .msg-bubble {
  background: var(--kk-surface-2); border-color: var(--kk-line);
  border-radius: 12px 12px 3px 12px;
}
.message--assistant .msg-bubble { border-radius: 12px 12px 12px 3px; }

.msg-bubble--thinking {
  min-width: 96px;
  max-width: max-content;
  padding: 11px 14px;
  background: rgba(255, 255, 255, .96);
  border-color: rgba(30, 27, 24, .18);
}

.typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--brown);
  font-size: 13px;
  font-weight: 600;
}

.typing-label {
  line-height: 1;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.typing-dots span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(30, 27, 24, .72);
  transform-origin: center bottom;
  animation: agentTypingDot .9s cubic-bezier(.42, 0, .2, 1) infinite;
  will-change: transform, opacity;
}

.typing-dots span:nth-child(2) { animation-delay: .14s; }
.typing-dots span:nth-child(3) { animation-delay: .28s; }

@keyframes agentTypingDot {
  0%, 72%, 100% { transform: translateY(0) scale(.72); opacity: .34; }
  28% { transform: translateY(-6px) scale(1.18); opacity: 1; }
  44% { transform: translateY(1px) scale(.92); opacity: .62; }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dots span {
    animation: none;
    opacity: .72;
  }
}

.msg-text { font-size: 15px; color: var(--text-main); line-height: 1.65; margin-bottom: 4px; white-space: pre-wrap; }
.msg-text p + p { margin-top: 6px; }
.msg-time { font-size: 12px; color: var(--text-mute); }
.msg-table-wrap {
  overflow-x: auto;
  max-width: 100%;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  background: var(--cream);
}
.msg-table {
  min-width: 420px;
  width: 100%;
  border-collapse: collapse;
  white-space: normal;
}
.msg-table th,
.msg-table td {
  border-bottom: 0.5px solid var(--border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.msg-table th { color: var(--brown); font-weight: 600; background: var(--cream-2); }
.msg-plan-actions {
  display: flex;
  flex-direction: column;
  align-self: flex-end;
  gap: 4px;
}
.msg-plan-error { font-size: 12px; color: var(--orange); }

/* 快捷指令 */
.quick-cmds {
  flex-shrink: 0;
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 20px 0;
}

.quick-btn {
  display: flex; align-items: center; gap: 5px;
  background: var(--cream); border: 0.5px solid var(--border);
  border-radius: 20px; padding: 6px 12px;
  font-size: 13px; color: var(--text-mid); cursor: pointer; font-family: inherit;
  transition: background .13s, border-color .13s, color .13s;
}
.quick-btn:hover { background: var(--kk-surface-2); border-color: var(--kk-line); color: var(--brown); }
.quick-icon { font-size: 13px; }

/* 输入框 */
.input-wrap {
  flex-shrink: 0;
  display: flex; align-items: flex-end; gap: 10px;
  margin: 10px 20px 0;
  background: var(--cream); border: 0.5px solid var(--border-2);
  border-radius: 13px; padding: 10px 12px;
  box-shadow: 0 1px 4px rgba(30, 27, 24,.06);
  transition: border-color .15s, box-shadow .15s;
}
.input-wrap:focus-within {
  border-color: var(--brown);
  box-shadow: 0 0 0 3px rgba(30, 27, 24,.1);
}

.chat-input {
  flex: 1; border: none; background: transparent;
  font-size: 15px; color: var(--text-main); font-family: inherit;
  resize: none; outline: none; line-height: 1.6;
  min-height: 42px; max-height: 120px;
}
.chat-input::placeholder { color: var(--text-mute); }

.send-btn {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--brown); border: none; color: var(--cream);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .13s, transform .1s;
  flex-shrink: 0;
}
.send-btn:hover:not(:disabled) { background: var(--kk-ink-2); }
.send-btn:active:not(:disabled) { transform: scale(.95); }
.send-btn:disabled { background: var(--border); cursor: not-allowed; }

.input-disclaimer {
  font-size: 12px; color: var(--text-mute);
  padding: 6px 20px 14px; text-align: center;
}

/* ═══════════════════════════════════════════════════
   右侧简报
═══════════════════════════════════════════════════ */
.insight-panel {
  width: 320px; flex-shrink: 0;
  background: var(--cream-3);
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
}
.insight-panel::-webkit-scrollbar { width: 4px; }
.insight-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

/* section */
.insight-section {
  padding: 14px 14px;
  border-bottom: 0.5px solid var(--border);
}
.insight-section:last-child { border-bottom: none; }

.insight-section-hd {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 10px;
}
.insight-icon { font-size: 15px; }
.insight-icon--tools { color: var(--brown); }
.insight-icon--star  { color: var(--brown); }
.insight-icon--plan  {}
.insight-icon--chat  {}

.insight-section-title {
  font-size: 13px; font-weight: 600; color: var(--text-main); flex: 1;
}

.insight-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px; padding: 2px 7px; border-radius: 4px;
}
.insight-badge--mute { background: var(--cream-2); color: var(--text-mute); border: 0.5px solid var(--border); }
.insight-badge--wait { background: var(--kk-surface-2); color: var(--orange); border: 0.5px solid var(--kk-line); }
.insight-badge--button {
  cursor: pointer;
  font-family: inherit;
  transition: background .13s, color .13s, border-color .13s;
}
.insight-badge--button:hover:not(:disabled) {
  background: var(--kk-surface-2);
  border-color: var(--kk-line);
  color: var(--brown);
}
.insight-badge--button:disabled {
  cursor: wait;
  opacity: .58;
}

/* 空状态卡 */
.insight-empty-card {
  background: var(--cream-2); border: 0.5px solid var(--border);
  border-radius: 10px; padding: 12px 13px;
}
.insight-empty-title { font-size: 15px; font-weight: 600; color: var(--text-main); margin-bottom: 4px; }
.insight-empty-desc  { font-size: 13px; color: var(--text-soft); line-height: 1.6; margin-bottom: 10px; }

.retry-btn {
  background: var(--brown); color: var(--cream); border: none;
  border-radius: 7px; padding: 6px 12px; font-size: 13px;
  cursor: pointer; font-family: inherit; transition: background .13s;
}
.retry-btn:hover { background: var(--kk-ink-2); }
.retry-btn:disabled {
  cursor: not-allowed;
  opacity: .58;
}
.retry-btn:disabled:hover { background: var(--brown); }
.insight-refresh-note {
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-mute);
}

/* 私教工具 */
.tutor-tools-section {
  padding-bottom: 13px;
}
.tutor-tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.tutor-tool {
  min-width: 0;
  min-height: 66px;
  padding: 8px 6px 7px;
  border: 0.5px solid var(--border);
  border-radius: 8px;
  background: var(--cream-2);
  color: var(--text-main);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: background .13s, border-color .13s, transform .13s, box-shadow .13s;
}
.tutor-tool:hover {
  transform: translateY(-1px);
  background: var(--cream);
  border-color: var(--kk-line);
  box-shadow: 0 4px 12px rgba(30, 27, 24,.06);
}
.tutor-tool-icon {
  width: 26px;
  height: 26px;
  margin: 0 auto 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brown);
}
.tutor-tool-icon span {
  display: flex;
  align-items: center;
}
.tutor-tool-title {
  display: block;
  overflow: hidden;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tutor-tool-desc {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 计划空状态 */
.plan-empty { padding: 2px 0; }
.plan-empty-title { font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 5px; }
.plan-empty-desc  { font-size: 13px; color: var(--text-soft); line-height: 1.6; margin-bottom: 10px; }
.plan-ready-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.plan-ready-head strong {
  flex-shrink: 0;
  color: var(--brown);
  font-size: 16px;
}
.plan-ready-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 10px;
}
.plan-ready-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0.5px solid var(--border);
  border-radius: 9px;
  padding: 8px 9px;
  background: var(--cream);
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.plan-ready-row:disabled { cursor: not-allowed; opacity: .62; }
.plan-ready-code {
  flex-shrink: 0;
  min-width: 34px;
  border-radius: 5px;
  padding: 4px 6px;
  color: var(--cream);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}
.plan-ready-copy { min-width: 0; flex: 1; }
.plan-ready-copy strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  color: var(--text-main);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-ready-copy small {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-ready-count {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-mid);
  font-weight: 600;
}
.plan-start-btn { width: 100%; }
.plan-retry-btn { margin-top: 9px; }

.plan-skeleton { display: flex; flex-direction: column; gap: 5px; }
.skel {
  height: 7px; background: var(--border); border-radius: 4px;
  animation: shimmer 1.8s ease-in-out infinite;
}
@keyframes shimmer { 0%,100%{opacity:.5;} 50%{opacity:1;} }
.skel--w80 { width: 80%; }
.skel--w60 { width: 60%; }
.skel--w70 { width: 70%; }

/* 追问 */
.followup-section {
  background: linear-gradient(180deg, rgba(255, 255, 255,.26), transparent 68%);
}
.followup-intro {
  margin: -2px 0 9px;
  color: var(--text-soft);
  font-size: 13px;
  line-height: 1.4;
}
.followup-list  { display: flex; flex-direction: column; gap: 7px; }
.followup-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 42px;
  padding: 8px 9px;
  border: 0.5px solid rgba(30, 27, 24, .16);
  border-radius: 8px;
  background: rgba(255, 255, 255, .72);
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background .13s, border-color .13s, transform .13s;
}
.followup-item:hover {
  transform: translateX(1px);
  background: var(--cream);
  border-color: var(--kk-line);
}
.followup-mark {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--kk-surface-2);
  color: var(--brown);
  font-size: 12px;
  font-weight: 700;
}
.followup-text  {
  color: var(--text-mid);
  font-size: 13px;
  line-height: 1.42;
}

/* ═══════════════════════════════════════════════════
   响应式
═══════════════════════════════════════════════════ */
@media (max-width: 1200px) {
  .insight-panel { width: 270px; }
  .topbar {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
}
@media (max-width: 1000px) {
  .insight-panel { display: none; }
  .sidebar { display: none; }
  .topbar {
    grid-template-columns: 1fr;
    height: auto;
    min-height: var(--workspace-header-height);
  }
  .topbar-main {
    border-right: 0;
    min-height: var(--workspace-header-height);
  }
  .shell {
    width: 100%;
    min-height: 100vh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .main,
  .body-area,
  .chat-column {
    overflow: visible;
  }
  .body-area {
    flex-direction: column;
  }
  .chat-column {
    border-right: 0;
  }
}
@media (max-width: 768px) {
  .topbar {
    padding: 0;
  }
  .topbar-main,
  .topbar-actions {
    width: 100%;
    min-width: 0;
  }
  .topbar-main {
    padding: 8px 16px;
  }
  .topbar-actions {
    justify-content: center;
  }
  .topbar-actions {
    padding: 0 16px 10px;
    flex-shrink: 1;
    flex-wrap: wrap;
  }
  .action-btn {
    padding: 6px 11px;
  }
  .user-chip {
    max-width: 100%;
  }
  .tutor-tool-grid {
    grid-template-columns: repeat(3, minmax(88px, 1fr));
  }
}

/* docs/ui-guidelines.md: the send button is this page's one primary action; everything else stays neutral. */
.shell { background: var(--kk-bg); }
.logo-mark { background: var(--kk-action); border-radius: 50%; }
.nav-item.active { background: var(--kk-action-soft); border-color: transparent; color: var(--kk-action-text); box-shadow: none; }
.history-more[aria-expanded="true"] { background: var(--kk-surface-2); border-color: var(--kk-line); }
.history-popover { box-shadow: var(--kk-shadow-pop); }
.history-delete--confirm { background: var(--kk-error-bg); color: var(--kk-error); }
.promo-card { border-color: transparent; }
.promo-btn { background: var(--kk-surface); color: var(--kk-ink); border: 1px solid var(--kk-line); border-radius: 999px; }
.action-btn { background: var(--kk-surface); color: var(--kk-ink); border: 1px solid var(--kk-line); border-radius: 999px; }
.action-btn:hover { background: var(--kk-surface-2); color: var(--kk-ink); }
.action-btn--ghost, .action-btn--ghost:hover { background: transparent; color: var(--kk-ink-2); border-color: transparent; }
.user-chip { background: var(--kk-surface-2); border-color: transparent; }
.message--user .msg-bubble { background: var(--kk-surface-2); border-color: var(--kk-line); }
.msg-bubble--thinking { background: var(--kk-surface); border-color: var(--kk-line); }
.typing-dots span { background: var(--kk-ink-3); }
.msg-table th { background: var(--kk-surface-2); color: var(--kk-ink); }
.quick-btn { border-radius: 999px; min-height: 36px; }
.quick-btn:hover { background: var(--kk-surface-2); color: var(--kk-ink); border-color: var(--kk-line); }
.input-wrap { border-radius: 20px; }
.input-wrap:focus-within { border-color: var(--kk-ink); box-shadow: none; }
.send-btn { background: var(--kk-action); color: var(--kk-on-action); border-radius: 50%; }
.send-btn:hover:not(:disabled) { background: var(--kk-action-hover); }
.insight-badge--wait { background: var(--kk-notice-bg); border-color: var(--kk-notice-line); color: var(--kk-notice); }
.insight-badge--button:hover:not(:disabled) { background: var(--kk-surface-2); color: var(--kk-ink); border-color: var(--kk-line); }
.retry-btn, .retry-btn:disabled:hover { background: var(--kk-surface); color: var(--kk-ink); border: 1px solid var(--kk-line); border-radius: 999px; }
.retry-btn:hover { background: var(--kk-surface-2); color: var(--kk-ink); }
.followup-section { background: transparent; }
.followup-item { background: var(--kk-surface); border-color: var(--kk-line); }
.followup-mark { background: var(--kk-surface-2); color: var(--kk-ink-2); }
.tutor-tool-icon { background: var(--kk-surface-2); color: var(--kk-ink); }
.plan-ready-code { background: var(--kk-ink); color: var(--kk-ink-inverse); }
.promo-title { color: var(--kk-ink); }
</style>
