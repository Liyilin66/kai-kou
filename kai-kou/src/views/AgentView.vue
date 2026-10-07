<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AIWorkspace from "@/components/agent/AIWorkspace.vue";
import AITutorLoading from "@/components/agent/AITutorLoading.vue";
import AgentIcon from "@/components/agent/AgentIcon.vue";
import { parseAgentContent } from "@/lib/agent-rich-content";
import {
  createAgentNewSession,
  deleteAgentChatHistory,
  deleteAgentSession,
  loadAgentMainSession,
  loadAgentOverview,
  loadAgentSessionList,
  loadAgentSessionMessages,
  requestDailyAiSuggestion,
  sendAgentMessage,
  switchAgentSession
} from "@/lib/agent";
import { loadAgentPlan, saveAgentPlan } from "@/lib/agent-plan";
import { useAuthStore } from "@/stores/auth";

const MAX_RECENT_MESSAGES = 10;
const OPTIMISTIC_AGENT_SESSION_ID_PREFIX = "agent_local_";

const router = useRouter();
const authStore = useAuthStore();

const AGENT_WORKSPACE_BOOT_PREFIX = "agent-workspace-booted";
const AGENT_WORKSPACE_SNAPSHOT_PREFIX = "agent-workspace-snapshot-v1";
const initialAgentBootLoading = shouldShowInitialAgentBootLoading();

const draft = ref("");
const pending = ref(false);
const aiResponding = ref(false);
const agentWorkspaceSyncing = ref(false);
const agentSessionSyncing = ref(false);
const messagesBodyRef = ref(null);
const conversationId = ref(`agent_${Date.now().toString(36)}`);
const messages = ref([]);
const agentSessionState = ref({
  loading: initialAgentBootLoading,
  session: null,
  error: "",
  reasonCode: "",
  isVip: false
});
const agentSessionHistory = ref([]);
const agentHistoryLoading = ref(false);
const agentHistoryError = ref("");
const agentSessionSwitching = ref(false);
const deletingAgentSessionId = ref("");
const agentOverview = ref(null);
const autoScrollEnabled = ref(false);
const dailySuggestionState = ref({
  loading: false,
  refreshing: false,
  retrying: false,
  source: "idle",
  suggestion: null,
  error: "",
  reasonCode: "",
  updatedAt: 0,
  expiresAt: 0,
  practiceSignature: ""
});
const planState = ref({
  loading: false,
  refreshing: false,
  retrying: false,
  saving: false,
  error: "",
  reasonCode: "",
  plan: null,
  updatedAt: 0,
  expiresAt: 0,
  practiceSignature: ""
});
const planAttachStatus = ref({});
const avatarLoadFailed = ref(false);
const agentToast = ref("");
let agentToastTimer = 0;
let agentSessionSyncPromise = null;
const agentRestoreInProgress = ref(initialAgentBootLoading);
const agentInsightsBackgroundInProgress = ref(false);
const agentRestoreStepStatus = ref({
  session: "going",
  messages: "wait",
  insights: "wait"
});
let agentInsightsBackgroundRequestSeq = 0;
let dailySuggestionRequestSeq = 0;
let executablePlanRequestSeq = 0;
let lastAgentInsightRefreshAt = 0;
let dailySuggestionInFlight = null;
let executablePlanInFlight = null;
let pendingForcedDailySuggestionRefresh = false;
let pendingForcedExecutablePlanRefresh = false;

const navItems = [
  { key: "home", label: "首页", icon: "home", target: "/home" },
  { key: "practice", label: "练习中心", icon: "list", target: "/home#quick" },
  { key: "agent", label: "AI 私教", icon: "spark", target: "/agent", active: true },
  { key: "plan", label: "学习计划", icon: "square", target: "/home#goal" },
  { key: "report", label: "学习报告", icon: "report", target: "/home#report" },
  { key: "library", label: "题库", icon: "box", target: "/home#quick" },
  { key: "profile", label: "个人中心", icon: "circle", target: "/profile" }
];

const RESTORE_STEP_LABELS = {
  done: "已完成",
  going: "同步中",
  wait: "待处理",
  failed: "失败"
};
const AGENT_INSIGHT_CLIENT_TIMEOUT_MS = 45000;
const AGENT_INSIGHT_REFRESH_DEBOUNCE_MS = 60 * 1000;
const AGENT_INSIGHT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const AGENT_RESTORE_INSIGHT_STEP_MS = 2400;
const AGENT_RESTORE_COMPLETE_STEP_MS = 160;
const AGENT_DAILY_TIMEOUT_MESSAGE = "今日 AI 结论生成超时，请稍后重试。";
const AGENT_PLAN_TIMEOUT_MESSAGE = "今日计划加载超时，请稍后重试。";
const PLAN_NO_PLAN_MESSAGE = "向 AI 说：帮我生成今日计划。";
const AGENT_INSIGHTS_CACHE_PREFIX = "agent-insights-v3";
const AGENT_LEGACY_INSIGHTS_CACHE_PREFIX = "agent-insights-v2";
const AGENT_EMPTY_PRACTICE_SIGNATURE = "no-practice-signature";
const AGENT_INSIGHT_MODULES = {
  daily: "daily_suggestion",
  plan: "executable_plan"
};

const quickActions = [
  {
    id: "weakness",
    label: "分析弱项",
    prompt: "根据我最近的练习记录，帮我分析当前最弱的题型和原因。",
    icon: "trend",
    helper: "定位最该先补的题型"
  },
  {
    id: "today-plan",
    label: "生成今日计划",
    prompt: "根据我最近的练习记录，帮我生成今天的训练计划。",
    icon: "calendar",
    helper: "拆成可执行训练步骤"
  },
  {
    id: "explain-score",
    label: "解释低分",
    prompt: "为什么这次 DI 分低？请结合我最近的记录，直接告诉我主要问题和改进方向。",
    icon: "question",
    helper: "找出扣分原因"
  },
  {
    id: "training",
    label: "安排 40 分钟",
    prompt: "帮我安排今晚 40 分钟训练，按题型和时间拆成可执行步骤。",
    icon: "clock",
    helper: "给出训练节奏"
  },
  {
    id: "encourage",
    label: "给我鼓励",
    prompt: "我有点没信心了，请根据我的备考情况鼓励我一下，并给我一个马上能做的小任务。",
    icon: "heart",
    helper: "调整状态再继续"
  }
];

const capabilityCards = [
  {
    id: "diagnose",
    title: "诊断",
    text: "把近期练习、分数和薄弱题型整理成优先级。",
    icon: "trend"
  },
  {
    id: "plan",
    title: "计划",
    text: "把建议转成今天能执行的题型、次数和训练顺序。",
    icon: "plan"
  },
  {
    id: "coach",
    title: "陪练",
    text: "在聊天中继续追问，直到下一步动作足够清楚。",
    icon: "chat"
  }
];

const restoreChecklist = [
  { id: "session", title: "连接主聊天", copy: "确认你的长期 AI 私教会话" },
  { id: "messages", title: "恢复最近消息", copy: "拉取上次对话与训练上下文" },
  { id: "insights", title: "同步今日洞察", copy: "准备结论、计划和推荐追问" }
];

const agentAccessFeatureItems = [
  "恢复长期 AI 私教主聊天",
  "结合真实练习记录分析弱项",
  "生成并接入今日可执行计划",
  "保留历史对话与训练上下文"
];

const recommendedQuestions = [
  {
    text: "我今天最应该先练哪个题型？",
    prompt: "我今天最应该先练哪个题型？请结合我的练习记录给出理由和训练顺序。"
  },
  {
    text: "DI 如何快速提高信息覆盖率？",
    prompt: "DI 如何快速提高信息覆盖率？请给我一个今天可以执行的练习方法。"
  },
  {
    text: "RTS 复述流畅度怎么练？",
    prompt: "如何提升 RTS 复述流畅度？请给我 3 个可以今天执行的训练动作。"
  },
  {
    text: "WFD 总丢冠词和复数怎么办？",
    prompt: "WFD 总丢冠词和复数怎么办？请按听写、检查、复盘三个阶段说明。"
  }
];

const vipLockFeatures = [
  "恢复长期 AI 私教主聊天",
  "结合真实练习记录分析弱项",
  "生成并接入今日可执行计划",
  "保留历史对话与训练上下文"
];

const PLAN_GENERATION_PROMPT = "帮我生成今日可执行训练计划，并用表格展示。";

const TASK_META = {
  RA: {
    label: "复述题训练",
    route: "/ra",
    color: "#2bbfa4",
    minutes: 10,
    focus: "保持开口稳定，减少长停顿"
  },
  WFD: {
    label: "听写填空训练",
    route: "/wfd",
    color: "#4f7df3",
    minutes: 10,
    focus: "先听主干，再补冠词和复数"
  },
  WE: {
    label: "学术短文写作",
    route: "/we",
    color: "#7b6df2",
    minutes: 8,
    focus: "先列结构，再写正文"
  },
  DI: {
    label: "图表专项练习",
    route: "/di",
    color: "#18a8b6",
    minutes: 15,
    focus: "先说主图信息，再补关键细节"
  },
  RTS: {
    label: "复述句子",
    route: "/rts/practice",
    color: "#d98a1b",
    minutes: 10,
    focus: "抓住场景和任务，再复述动作"
  }
};

watch(
  () => [messages.value.length, aiResponding.value],
  async () => {
    if (!autoScrollEnabled.value) return;
    await nextTick();
    scrollToBottom(aiResponding.value ? "auto" : "smooth");
  }
);

const userDisplayName = computed(() => {
  if (!authStore.isLoggedIn && authStore.loaded) return "未登录";
  return authStore.displayName || "同学";
});
const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const showUserAvatar = computed(() => Boolean(userAvatarUrl.value) && !avatarLoadFailed.value);
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "Y";
});

watch(userAvatarUrl, () => {
  avatarLoadFailed.value = false;
});

watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (!isLoggedIn) {
      clearAgentWorkspaceSessionArtifacts();
    }
  }
);

watch(
  () => agentSessionState.value.reasonCode,
  (reasonCode) => {
    if (isAgentBlockingSessionFailure(reasonCode)) {
      clearAgentWorkspaceSessionArtifacts();
    }
  }
);

const recentTaskSnapshot = computed(() => agentOverview.value?.recentTaskSnapshot || null);
const currentAgentSessionId = computed(() => normalizeText(agentSessionState.value.session?.id));
const isAgentSessionLoading = computed(() => Boolean(agentSessionState.value.loading));
const isAgentRestoring = computed(() => agentRestoreInProgress.value);
const isAgentLocked = computed(() => isAgentAccessFailure(agentSessionState.value.reasonCode));
const isAgentMemoryNotReady = computed(() => normalizeText(agentSessionState.value.reasonCode) === "agent_memory_not_ready");
const canUseAgent = computed(() => (
  authStore.isLoggedIn
  && agentSessionState.value.isVip
  && Boolean(currentAgentSessionId.value)
  && !agentSessionState.value.error
  && !isAgentSessionLoading.value
));
const canLoadAgentInsights = computed(() => (
  authStore.isLoggedIn
  && !isAgentLocked.value
  && !isAgentMemoryNotReady.value
));
const composerDisabled = computed(() => pending.value || agentSessionSwitching.value || Boolean(deletingAgentSessionId.value) || !canUseAgent.value);
const historyBusy = computed(() => agentSessionSwitching.value || Boolean(deletingAgentSessionId.value));
const isConversationEmpty = computed(() => messages.value.length === 0);
const displayAgentSessionHistory = computed(() => (
  Array.isArray(agentSessionHistory.value) ? agentSessionHistory.value : []
)
  .filter((session) => normalizeText(session?.id))
  .slice(0, 10)
  .map((session) => ({
    id: normalizeText(session.id),
    title: normalizeText(session.title) || "未命名对话",
    time: formatHistoryTime(session.last_message_at || session.updated_at || session.created_at),
    active: normalizeText(session.id) === currentAgentSessionId.value,
    messageCount: Number.isFinite(Number(session.message_count)) ? Math.max(0, Math.round(Number(session.message_count))) : 0,
    preview: normalizeText(session.preview)
  })));

const agentWorkspaceState = computed(() => {
  if (isAgentRestoring.value) return "restoring";
  if (!authStore.isLoggedIn) return "unavailable";
  if (isAgentLocked.value) return "locked";
  if (agentSessionState.value.error) return "failed";
  return isConversationEmpty.value ? "empty" : "chat";
});
const agentLoadingNavItems = computed(() => navItems.map((item) => ({
  key: item.key,
  label: item.label,
  icon: item.icon,
  to: item.target,
  active: item.key === "agent",
  // Keep this explicit so future entries without real routes stay disabled
  // instead of pretending to navigate somewhere.
  disabled: !item.target,
  disabledReason: item.target ? "" : "该页面暂未开放"
})));
const agentRestoreSteps = computed(() => restoreChecklist.map((item) => {
  const status = agentRestoreStepStatus.value[item.id] || "wait";
  return {
    name: item.title,
    desc: item.copy,
    status,
    label: item.id === "insights" && status === "done" && agentInsightsBackgroundInProgress.value
      ? "后台继续"
      : RESTORE_STEP_LABELS[status] || RESTORE_STEP_LABELS.wait
  };
}));
const agentFailedSteps = computed(() => restoreChecklist.map((item) => {
  const status = agentRestoreStepStatus.value[item.id] || "wait";
  return {
    name: item.title,
    desc: item.copy,
    status,
    label: RESTORE_STEP_LABELS[status] || RESTORE_STEP_LABELS.wait
  };
}));
const agentRestoreProgressPercent = computed(() => {
  const status = agentRestoreStepStatus.value;
  if (status.insights === "done") return 100;
  if (status.insights === "going") return 72;
  if (status.messages === "done") return 58;
  if (status.messages === "going") return 42;
  if (status.session === "done") return 30;
  return 18;
});
const agentFailedProgressPercent = computed(() => {
  const status = agentRestoreStepStatus.value;
  if (status.insights === "failed") return 72;
  if (status.messages === "failed") return 58;
  if (status.session === "failed") return 24;
  return Math.max(24, Math.min(72, agentRestoreProgressPercent.value));
});
const agentFailedProgressNote = computed(() => (
  agentSessionState.value.error || "恢复中断，请稍后重试。"
));
const isWarmShellState = computed(() => (
  ["restoring", "locked", "unavailable"].includes(agentWorkspaceState.value)
));
const isAgentAccessState = computed(() => (
  agentWorkspaceState.value === "locked" || agentWorkspaceState.value === "unavailable"
));
const agentWarmShellSteps = computed(() => {
  if (agentWorkspaceState.value === "failed") return agentFailedSteps.value;
  if (agentWorkspaceState.value === "restoring") return agentRestoreSteps.value;
  return [];
});
const agentWarmShellFeatures = computed(() => (
  isAgentAccessState.value ? agentAccessFeatureItems : []
));
const agentWarmShellProgressPercent = computed(() => {
  if (agentWorkspaceState.value === "failed") return agentFailedProgressPercent.value;
  if (isAgentAccessState.value) return 36;
  return agentRestoreProgressPercent.value;
});
const agentWarmShellTitle = computed(() => {
  if (isAgentAccessState.value) return "AI 私教为 VIP 专属功能";
  if (agentWorkspaceState.value === "failed") return "暂时没能恢复 AI 私教聊天";
  return "";
});
const agentWarmShellSubtitle = computed(() => {
  if (isAgentAccessState.value) return "当前账号暂时不能使用 AI 私教。升级后可恢复聊天、生成今日计划与专属建议。";
  if (agentWorkspaceState.value === "failed") return "AI 私教暂时不可用，请稍后再试。";
  return "";
});
const agentWarmShellProgressNote = computed(() => {
  if (isAgentAccessState.value) return "当前只保留权益说明和返回入口，不显示生成计划或推荐追问。";
  if (agentWorkspaceState.value === "failed") return agentFailedProgressNote.value;
  return "";
});
const agentWarmPrimaryActionLabel = computed(() => {
  if (isAgentAccessState.value) return "查看 VIP 权益";
  if (agentWorkspaceState.value === "failed") return "重新恢复";
  return "";
});
const agentWarmPrimaryActionLoadingLabel = computed(() => (
  agentWorkspaceState.value === "failed" ? "恢复中..." : ""
));
const agentWarmSecondaryActionLabel = computed(() => {
  if (isAgentAccessState.value) return "返回练习中心";
  if (agentWorkspaceState.value === "failed") return "返回首页";
  return "";
});
const isBlockingWorkspaceState = computed(() => (
  ["restoring", "unavailable", "locked", "failed"].includes(agentWorkspaceState.value)
));
const workspaceStatusLabel = computed(() => {
  if (!agentRestoreInProgress.value && (agentWorkspaceSyncing.value || agentInsightsBackgroundInProgress.value)) {
    return "正在同步";
  }
  const labels = {
    restoring: "正在恢复",
    unavailable: "暂不可用",
    locked: "VIP 专属",
    failed: "恢复失败",
    empty: "可开始新对话",
    chat: "聊天进行中"
  };
  return labels[agentWorkspaceState.value] || "AI 私教";
});
const workspaceStateMeta = computed(() => {
  const states = {
    restoring: {
      icon: "loader",
      eyebrow: "Entering workspace",
      title: "正在进入 AI 私教工作台",
      description: "正在连接主聊天、恢复最近消息，并同步今天的训练洞察。恢复完成后会直接进入可输入、可追问、可接入计划的工作台。",
      primaryLabel: "",
      secondaryLabel: ""
    },
    unavailable: {
      icon: "lock",
      eyebrow: "Account required",
      title: "登录后恢复 AI 私教聊天",
      description: "AI 私教会把长期聊天、今日重点和训练计划绑定到你的账号。",
      primaryLabel: "去登录",
      secondaryLabel: "返回首页"
    },
    locked: {
      icon: "shield",
      eyebrow: "VIP workspace",
      title: "AI 私教为 VIP 专属功能",
      description: "当前账号暂时不能使用 AI 私教。这里不会展示生成计划、追问等不可执行入口，避免和不可用状态冲突。",
      primaryLabel: "查看 VIP 权益",
      secondaryLabel: "返回练习中心"
    },
    failed: {
      icon: "alert",
      eyebrow: isAgentMemoryNotReady.value ? "Setup required" : "Recovery failed",
      title: isAgentMemoryNotReady.value ? "AI 私教记忆表还没有准备好" : "暂时没能恢复 AI 私教聊天",
      description: agentSessionState.value.error || "主聊天或最近消息加载失败。你可以重新恢复，或先回首页继续练习。",
      primaryLabel: isAgentMemoryNotReady.value ? "重新检查" : "重新恢复",
      secondaryLabel: "返回首页"
    }
  };
  return states[agentWorkspaceState.value] || states.restoring;
});

const showInsightPanel = computed(() => ["restoring", "empty", "chat"].includes(agentWorkspaceState.value));
const workbenchTitle = computed(() => {
  if (isBlockingWorkspaceState.value) return workspaceStateMeta.value.title;
  return isConversationEmpty.value ? "开启新的 AI 私教对话" : "继续 AI 私教聊天";
});
const workbenchDescription = computed(() => {
  if (isBlockingWorkspaceState.value) return workspaceStateMeta.value.description;
  if (isConversationEmpty.value) return "输入框是主入口：直接提问，或选择快捷入口，让 AI 把练习记录转成今天的训练动作。";
  return "历史聊天已恢复。你可以继续追问、接入 AI 计划，或围绕右侧简报继续拆解训练动作。";
});
const stateSupportText = computed(() => {
  const state = agentWorkspaceState.value;
  if (state === "restoring") return "恢复中不展示不可执行 CTA，只呈现当前进度。";
  if (state === "unavailable") return "当前只提供登录和返回入口，不展示任何依赖私教能力的操作。";
  if (state === "locked") return "当前只保留权益说明和返回入口，不显示生成计划或推荐追问。";
  if (state === "failed" && isAgentMemoryNotReady.value) return "需要先完成 Supabase 记忆表配置。";
  if (state === "failed") return "重试会重新请求主聊天、最近消息和训练洞察。";
  return "";
});

const overviewStats = computed(() => {
  const snapshot = recentTaskSnapshot.value || {};
  return [
    {
      label: "最近样本",
      value: Number(snapshot.recentAttempts || 0) ? `${snapshot.recentAttempts}` : "待积累",
      helper: "用于判断训练趋势"
    },
    {
      label: "7 天练习",
      value: Number(snapshot.recent7DayAttempts || 0) ? `${snapshot.recent7DayAttempts}` : "0",
      helper: "最近一周完成次数"
    },
    {
      label: "平均表现",
      value: formatOptionalMetric(snapshot.averageScore),
      helper: "折算后的综合表现"
    },
    {
      label: "优先题型",
      value: normalizeReadableText(snapshot.weakTaskTypeLabel) || normalizeReadableText(snapshot.weakTaskType) || "待识别",
      helper: snapshot.sampleInsufficient ? "样本不足时仅作参考" : "按近期最低表现排序"
    }
  ];
});
const practiceOverviewRows = computed(() => {
  const snapshot = recentTaskSnapshot.value || {};
  const recentAttempts = Number(snapshot.recentAttempts || 0);
  const recent7DayAttempts = Number(snapshot.recent7DayAttempts || 0);
  const averageScore = Number(snapshot.averageScore);
  const weakTask = normalizeReadableText(snapshot.weakTaskTypeLabel) || normalizeReadableText(snapshot.weakTaskType) || "待识别";

  return [
    {
      code: "样本",
      label: "最近样本",
      value: recentAttempts ? `${recentAttempts} 次` : "待积累",
      pct: Math.min(100, recentAttempts * 8),
      color: "#5b5cf6"
    },
    {
      code: "7天",
      label: "最近一周",
      value: `${recent7DayAttempts || 0} 次`,
      pct: Math.min(100, recent7DayAttempts * 14),
      color: "#16a6b1"
    },
    {
      code: "均分",
      label: "平均表现",
      value: Number.isFinite(averageScore) ? `${averageScore}` : "待识别",
      pct: Number.isFinite(averageScore) ? Math.max(0, Math.min(100, Math.round((averageScore / 90) * 100))) : 0,
      color: "#d78a1f"
    },
    {
      code: "重点",
      label: "优先题型",
      value: weakTask,
      pct: weakTask === "待识别" ? 0 : 58,
      color: "#7c3aed"
    }
  ];
});

const hasDailyConclusionData = computed(() => {
  const suggestion = dailySuggestionState.value.suggestion;
  if (!suggestion) return false;
  return Boolean(
    normalizeReadableText(suggestion.headline)
    || normalizeReadableText(suggestion.reason)
    || normalizeReadableText(suggestion.advice)
  );
});
const dailyConclusion = computed(() => {
  if (dailySuggestionState.value.loading && !hasDailyConclusionData.value) {
    return {
      label: "正在分析",
      title: "正在读取练习记录",
      summary: "正在整理 practice_logs 和今日训练信号，稍后会生成更具体的结论。",
      cta: ""
    };
  }

  const suggestion = dailySuggestionState.value.suggestion;
  const taskType = normalizeReadableText(suggestion?.main_task_type).toUpperCase();
  const headline = normalizeReadableText(suggestion?.headline);
  const reason = normalizeReadableText(suggestion?.reason);
  const advice = normalizeReadableText(suggestion?.advice);
  const summaryParts = [reason, advice].filter(Boolean);

  if (suggestion && (headline || summaryParts.length)) {
    return {
      label: taskType ? `今日重点 · ${taskType}` : "今日重点",
      title: headline || "已读取今日练习信号",
      summary: summaryParts.join(" ") || "今日建议已经生成，可以继续追问我怎么执行。",
      cta: "展开分析"
    };
  }

  return {
    label: "AI 聚焦",
    title: "今日结论暂不可用",
    summary: dailySuggestionState.value.error || "恢复完成并读取到真实练习记录后，这里会显示今日结论。",
    cta: ""
  };
});

const activePlan = computed(() => planState.value.plan || null);
const isPlanNoPlan = computed(() => normalizeText(planState.value.reasonCode) === "no_plan" && !activePlan.value);
const executablePlanItems = computed(() => (
  Array.isArray(activePlan.value?.items) ? activePlan.value.items : []
));
const suggestionPlanItems = computed(() => {
  const tasks = dailySuggestionState.value.suggestion?.tasks;
  return (Array.isArray(tasks) ? tasks : [])
    .map((item) => {
      const taskType = normalizeText(item?.task_type).toUpperCase();
      const meta = TASK_META[taskType];
      if (!meta) return null;
      const targetCount = Math.max(1, Math.round(Number(item?.count || 1)));
      return {
        task_type: taskType,
        label: meta.label,
        count: targetCount,
        target_count: targetCount,
        completed_count: 0,
        effective_completed_count: 0,
        minutes: meta.minutes,
        remaining_minutes: meta.minutes,
        focus: meta.focus,
        route: meta.route,
        color: meta.color,
        is_complete: false,
        is_draft: true,
        source: "daily-suggestion"
      };
    })
    .filter(Boolean);
});
const draftPlanSuggestion = computed(() => {
  if (!suggestionPlanItems.value.length) return null;
  const suggestion = dailySuggestionState.value.suggestion;
  return {
    title: normalizeReadableText(suggestion?.headline) || "今日 AI 建议计划",
    source: "daily_suggestion",
    variant: normalizeText(dailySuggestionState.value.source),
    items: suggestionPlanItems.value.map((item) => ({
      task_type: item.task_type,
      label: item.label,
      count: item.count,
      minutes: item.minutes,
      focus: item.focus,
      route: item.route,
      color: item.color
    }))
  };
});
const displayPlanItems = computed(() => {
  if (executablePlanItems.value.length) return executablePlanItems.value;
  if (isPlanNoPlan.value) return [];
  return suggestionPlanItems.value;
});
const hasExecutablePlan = computed(() => Boolean(displayPlanItems.value.length));
const hasSavedExecutablePlan = computed(() => Boolean(activePlan.value && executablePlanItems.value.length));
const isPlanComplete = computed(() => Boolean(activePlan.value?.is_complete));
const totalPlanMinutes = computed(() => Math.max(0, Math.round(Number(activePlan.value?.total_minutes || 0))));
const displayPlanTotalMinutes = computed(() => (
  activePlan.value
    ? totalPlanMinutes.value
    : displayPlanItems.value.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.minutes || 0))), 0)
));
const remainingPlanMinutes = computed(() => (
  activePlan.value
    ? Math.max(0, Math.round(Number(activePlan.value?.remaining_minutes || 0)))
    : 0
));
const planProgressPercentage = computed(() => (
  activePlan.value
    ? Math.max(0, Math.min(100, Math.round(Number(activePlan.value?.progress_percentage || 0))))
    : 0
));
const planProgressDisplay = computed(() => (hasSavedExecutablePlan.value ? `${planProgressPercentage.value}%` : "待接入"));
const planProgressAriaLabel = computed(() => (
  hasSavedExecutablePlan.value
    ? `计划完成度 ${planProgressPercentage.value}%`
    : "AI 建议计划待接入"
));
const startTrainingLabel = computed(() => {
  if (planState.value.saving) return "接入中...";
  if (!hasSavedExecutablePlan.value) return "接入计划并开始";
  return isPlanComplete.value ? "今日计划已完成" : "开始训练";
});
const dailyConclusionStatusNote = computed(() => {
  if (!hasDailyConclusionData.value) return "";
  if (dailySuggestionState.value.retrying) return "正在重试...";
  if (dailySuggestionState.value.refreshing) return "同步中";
  return formatInsightUpdatedAt(dailySuggestionState.value.updatedAt);
});
const planStatusMessage = computed(() => {
  if (planState.value.loading) return "正在加载今日计划...";
  if (planState.value.refreshing) return "同步中";
  if (planState.value.error) return planState.value.error;
  if (isPlanNoPlan.value) return formatInsightUpdatedAt(planState.value.updatedAt) || PLAN_NO_PLAN_MESSAGE;
  if (!hasExecutablePlan.value) return "向 AI 说：帮我生成今日计划。";
  if (!hasSavedExecutablePlan.value) return "来自今日 AI 建议，接入后会用练习记录更新进度。";
  return formatInsightUpdatedAt(planState.value.updatedAt);
});

const conclusionPanelState = computed(() => {
  if (agentWorkspaceState.value === "restoring" && !hasDailyConclusionData.value) return "loading";
  if (dailySuggestionState.value.loading && !hasDailyConclusionData.value) return "loading";
  return hasDailyConclusionData.value ? "ready" : "unavailable";
});
const planPanelState = computed(() => {
  if (hasSavedExecutablePlan.value) return "ready";
  if (isPlanNoPlan.value) return "no_plan";
  if (agentWorkspaceState.value === "restoring" && !hasExecutablePlan.value) return "loading";
  if (planState.value.loading && !hasExecutablePlan.value) return "loading";
  return hasExecutablePlan.value ? "ready" : "unavailable";
});
const canUseRecommendedQuestions = computed(() => canUseAgent.value && !isAgentSessionLoading.value);
const questionPanelState = computed(() => (canUseRecommendedQuestions.value ? "ready" : "unavailable"));
const insightStatusText = computed(() => {
  if (agentWorkspaceState.value === "restoring") return "正在同步工作台";
  if (!canUseAgent.value) return "待恢复";
  if (hasSavedExecutablePlan.value) return `计划进度 ${planProgressPercentage.value}%`;
  return isConversationEmpty.value ? "可开始新对话" : "已进入聊天";
});
const conclusionUnavailableMessage = computed(() => {
  if (dailySuggestionState.value.retrying) return "正在重新生成今日 AI 结论...";
  if (dailySuggestionState.value.error) return dailySuggestionState.value.error;
  if (!canUseAgent.value) return "恢复完成后，我会根据你的真实练习记录更新这里。";
  return "暂时没有可展示的今日结论。你可以直接在中间输入框让 AI 分析。";
});
const planUnavailableTitle = computed(() => {
  if (isPlanNoPlan.value) return "还没有可执行计划";
  return planState.value.error ? "计划加载失败" : "暂无可执行计划";
});
const planUnavailableMessage = computed(() => {
  if (planState.value.retrying) return "正在重新读取今日计划...";
  if (planState.value.error) return planState.value.error;
  if (isPlanNoPlan.value) return PLAN_NO_PLAN_MESSAGE;
  if (!canUseAgent.value) return "恢复聊天完成后再生成或接入今日训练计划。";
  return "向 AI 说：帮我生成今日计划。";
});
const questionUnavailableMessage = computed(() => (
  canUseAgent.value
    ? "暂时没有推荐追问，你可以直接输入自己的问题。"
    : "恢复聊天完成后会显示可追问的问题。"
));

function resetAgentRestoreProgress() {
  agentRestoreStepStatus.value = {
    session: "going",
    messages: "wait",
    insights: "wait"
  };
}

function setAgentRestoreStep(id, status) {
  agentRestoreStepStatus.value = {
    ...agentRestoreStepStatus.value,
    [id]: status
  };
}

function hydrateCachedAgentInsights({ preferCurrentSignature = false } = {}) {
  if (typeof window === "undefined") return;
  if (!getAgentInsightUserId()) return;
  const allowLatest = !preferCurrentSignature;
  const dailyCache = readAgentInsightModuleCache(AGENT_INSIGHT_MODULES.daily, {
    allowLatest,
    allowExpired: true
  });
  if (dailyCache) applyCachedDailySuggestion(dailyCache);

  const planCache = readAgentInsightModuleCache(AGENT_INSIGHT_MODULES.plan, {
    allowLatest,
    allowExpired: true
  });
  if (planCache) applyCachedExecutablePlan(planCache);

  if (!preferCurrentSignature && (!dailyCache || !planCache)) {
    hydrateLegacyCachedAgentInsights({
      includeDaily: !dailyCache,
      includePlan: !planCache
    });
  }
}

function hydrateLegacyCachedAgentInsights({ includeDaily = true, includePlan = true } = {}) {
  if (typeof window === "undefined") return;
  const userId = getAgentInsightUserId();
  if (!userId) return;
  const cacheKey = `${AGENT_LEGACY_INSIGHTS_CACHE_PREFIX}:${userId}`;

  try {
    const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
    if (!isPlainObject(cached) || cached.dateKey !== getAgentInsightsCacheDateKey()) return;

    if (includeDaily && isPlainObject(cached.daily) && isPlainObject(cached.daily.suggestion)) {
      const updatedAt = Number(cached.daily.updatedAt || 0) || Date.now();
      applyCachedDailySuggestion({
        module: AGENT_INSIGHT_MODULES.daily,
        practice_signature: normalizePracticeSignature(cached.daily.practiceSignature),
        data: {
          source: normalizeText(cached.daily.source) || "cache",
          suggestion: cached.daily.suggestion,
          reasonCode: normalizeText(cached.daily.reasonCode) || "ok"
        },
        updated_at: updatedAt,
        expires_at: updatedAt + AGENT_INSIGHT_CACHE_TTL_MS
      });
    }

    if (includePlan && isPlainObject(cached.plan) && (isPlainObject(cached.plan.plan) || normalizeText(cached.plan.reasonCode) === "no_plan")) {
      const updatedAt = Number(cached.plan.updatedAt || 0) || Date.now();
      applyCachedExecutablePlan({
        module: AGENT_INSIGHT_MODULES.plan,
        practice_signature: normalizePracticeSignature(cached.plan.practiceSignature),
        data: {
          plan: isPlainObject(cached.plan.plan) ? cached.plan.plan : null,
          reasonCode: normalizeText(cached.plan.reasonCode) || (cached.plan.plan ? "ok" : "no_plan")
        },
        updated_at: updatedAt,
        expires_at: updatedAt + AGENT_INSIGHT_CACHE_TTL_MS
      });
    }
  } catch {
    window.sessionStorage.removeItem(cacheKey);
  }
}

function persistCachedAgentInsights() {
  if (hasDailyConclusionData.value) {
    persistAgentInsightModuleCache(AGENT_INSIGHT_MODULES.daily, {
      source: dailySuggestionState.value.source,
      suggestion: dailySuggestionState.value.suggestion,
      reasonCode: dailySuggestionState.value.reasonCode || "ok"
    }, {
      practiceSignature: dailySuggestionState.value.practiceSignature,
      updatedAt: dailySuggestionState.value.updatedAt || Date.now()
    });
  }

  if (activePlan.value || isPlanNoPlan.value) {
    persistAgentInsightModuleCache(AGENT_INSIGHT_MODULES.plan, {
      plan: activePlan.value,
      reasonCode: isPlanNoPlan.value ? "no_plan" : (planState.value.reasonCode || "ok")
    }, {
      practiceSignature: planState.value.practiceSignature,
      updatedAt: planState.value.updatedAt || Date.now()
    });
  }
}

function persistAgentInsightModuleCache(module, data, { practiceSignature = "", updatedAt = Date.now() } = {}) {
  if (typeof window === "undefined") return null;
  const userId = getAgentInsightUserId();
  const normalizedModule = normalizeText(module);
  const normalizedSignature = normalizePracticeSignature(practiceSignature || getCurrentPracticeSignature());
  if (!userId || !normalizedModule) return null;

  const normalizedUpdatedAt = Number(updatedAt || 0) || Date.now();
  const payload = {
    module: normalizedModule,
    user_id: userId,
    date: getAgentInsightsCacheDateKey(),
    practice_signature: normalizedSignature,
    data,
    updated_at: normalizedUpdatedAt,
    expires_at: normalizedUpdatedAt + AGENT_INSIGHT_CACHE_TTL_MS
  };

  try {
    window.localStorage.setItem(getAgentInsightModuleCacheKey(normalizedModule, normalizedSignature), JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

function readAgentInsightModuleCache(module, { practiceSignature = getCurrentPracticeSignature(), allowLatest = false, allowExpired = false } = {}) {
  if (typeof window === "undefined") return null;
  const normalizedModule = normalizeText(module);
  const normalizedSignature = normalizePracticeSignature(practiceSignature);
  if (!normalizedModule) return null;

  const exactKey = getAgentInsightModuleCacheKey(normalizedModule, normalizedSignature);
  const exactCache = readAgentInsightCacheByKey(exactKey, { allowExpired });
  if (exactCache) return exactCache;
  if (!allowLatest) return null;
  return findLatestAgentInsightModuleCache(normalizedModule, { allowExpired });
}

function readAgentInsightCacheByKey(cacheKey, { allowExpired = false } = {}) {
  if (!cacheKey || typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
    if (!isValidAgentInsightCache(cached, { allowExpired })) return null;
    return cached;
  } catch {
    window.localStorage.removeItem(cacheKey);
    return null;
  }
}

function findLatestAgentInsightModuleCache(module, { allowExpired = false } = {}) {
  if (typeof window === "undefined") return null;
  const userId = getAgentInsightUserId();
  const dateKey = getAgentInsightsCacheDateKey();
  const normalizedModule = normalizeText(module);
  if (!userId || !normalizedModule) return null;

  const prefix = `${AGENT_INSIGHTS_CACHE_PREFIX}:${userId}:${dateKey}:`;
  let latest = null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix) || !key.endsWith(`:${normalizedModule}`)) continue;
      const cached = readAgentInsightCacheByKey(key, { allowExpired });
      if (!cached) continue;
      if (!latest || Number(cached.updated_at || 0) > Number(latest.updated_at || 0)) {
        latest = cached;
      }
    }
  } catch {
    return latest;
  }
  return latest;
}

function getFreshAgentInsightModuleCache(module, practiceSignature = getCurrentPracticeSignature()) {
  return readAgentInsightModuleCache(module, {
    practiceSignature,
    allowLatest: false,
    allowExpired: false
  });
}

function isValidAgentInsightCache(cached, { allowExpired = false } = {}) {
  if (!isPlainObject(cached)) return false;
  if (normalizeText(cached.user_id) !== getAgentInsightUserId()) return false;
  if (normalizeText(cached.date) !== getAgentInsightsCacheDateKey()) return false;
  if (!normalizeText(cached.module)) return false;
  if (!normalizeText(cached.practice_signature)) return false;
  if (!isPlainObject(cached.data)) return false;
  if (!allowExpired && Number(cached.expires_at || 0) <= Date.now()) return false;
  return true;
}

function applyCachedDailySuggestion(cache) {
  const data = cache?.data || {};
  if (!isPlainObject(data.suggestion)) return;
  dailySuggestionState.value = {
    loading: false,
    refreshing: false,
    retrying: false,
    source: normalizeText(data.source) || "cache",
    suggestion: data.suggestion,
    error: "",
    reasonCode: normalizeText(data.reasonCode) || "ok",
    updatedAt: Number(cache.updated_at || 0),
    expiresAt: Number(cache.expires_at || 0),
    practiceSignature: normalizePracticeSignature(cache.practice_signature)
  };
}

function applyCachedExecutablePlan(cache) {
  const data = cache?.data || {};
  const reasonCode = normalizeText(data.reasonCode) || (isPlainObject(data.plan) ? "ok" : "");
  if (!isPlainObject(data.plan) && reasonCode !== "no_plan") return;
  planState.value = {
    loading: false,
    refreshing: false,
    retrying: false,
    saving: false,
    error: "",
    reasonCode,
    plan: isPlainObject(data.plan) ? data.plan : null,
    updatedAt: Number(cache.updated_at || 0),
    expiresAt: Number(cache.expires_at || 0),
    practiceSignature: normalizePracticeSignature(cache.practice_signature)
  };
}

function getAgentInsightModuleCacheKey(module, practiceSignature = getCurrentPracticeSignature()) {
  const userId = getAgentInsightUserId();
  const normalizedModule = normalizeText(module);
  if (!userId || !normalizedModule) return "";
  return [
    AGENT_INSIGHTS_CACHE_PREFIX,
    userId,
    getAgentInsightsCacheDateKey(),
    normalizePracticeSignature(practiceSignature),
    normalizedModule
  ].join(":");
}

function getAgentInsightUserId() {
  return normalizeText(authStore.user?.id);
}

function getCurrentPracticeSignature() {
  return normalizePracticeSignature(buildPracticeSignature());
}

function normalizePracticeSignature(value) {
  return normalizeText(value) || AGENT_EMPTY_PRACTICE_SIGNATURE;
}

function getAgentInsightsCacheDateKey(date = new Date()) {
  const chinaLocalMs = date.getTime() + 8 * 60 * 60 * 1000;
  return new Date(chinaLocalMs).toISOString().slice(0, 10);
}

function shouldShowInitialAgentBootLoading() {
  const userId = getAgentWorkspaceUserId();
  if (!userId) return true;
  if (isHardPageReload()) return true;
  return !(hasAgentWorkspaceBooted(userId) && hasAgentWorkspaceSnapshot(userId));
}

function getAgentWorkspaceUserId() {
  return normalizeText(authStore.user?.id);
}

function getAgentWorkspaceSessionFingerprint() {
  return normalizeText(authStore.session?.user?.last_sign_in_at)
    || normalizeText(authStore.user?.last_sign_in_at)
    || normalizeText(authStore.session?.user?.created_at)
    || getAgentWorkspaceUserId();
}

function getAgentWorkspaceBootKey(userId = getAgentWorkspaceUserId()) {
  const normalizedUserId = normalizeText(userId);
  return normalizedUserId ? `${AGENT_WORKSPACE_BOOT_PREFIX}:${normalizedUserId}` : "";
}

function getAgentWorkspaceSnapshotKey(userId = getAgentWorkspaceUserId()) {
  const normalizedUserId = normalizeText(userId);
  return normalizedUserId ? `${AGENT_WORKSPACE_SNAPSHOT_PREFIX}:${normalizedUserId}` : "";
}

function isHardPageReload() {
  if (typeof window === "undefined" || typeof performance === "undefined") return false;
  const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];
  if (navigationEntry?.type !== "reload") return false;
  if (window.__agentWorkspaceReloadBootConsumed) return false;
  window.__agentWorkspaceReloadBootConsumed = true;
  return true;
}

function hasAgentWorkspaceBooted(userId = getAgentWorkspaceUserId()) {
  const bootKey = getAgentWorkspaceBootKey(userId);
  if (!bootKey || typeof window === "undefined") return false;
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(bootKey) || "null");
    return isPlainObject(cached)
      && cached.booted === true
      && normalizeText(cached.userId) === normalizeText(userId)
      && normalizeText(cached.sessionFingerprint) === getAgentWorkspaceSessionFingerprint();
  } catch {
    window.sessionStorage.removeItem(bootKey);
    return false;
  }
}

function markAgentWorkspaceBooted(userId = getAgentWorkspaceUserId()) {
  const bootKey = getAgentWorkspaceBootKey(userId);
  if (!bootKey || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(bootKey, JSON.stringify({
      booted: true,
      userId: normalizeText(userId),
      sessionFingerprint: getAgentWorkspaceSessionFingerprint(),
      bootedAt: Date.now()
    }));
  } catch {
    // Losing this marker only affects whether the next route return shows the boot screen.
  }
}

function hasAgentWorkspaceSnapshot(userId = getAgentWorkspaceUserId()) {
  return Boolean(getValidAgentWorkspaceSnapshot(userId));
}

function persistAgentWorkspaceSnapshot() {
  const userId = getAgentWorkspaceUserId();
  const snapshotKey = getAgentWorkspaceSnapshotKey(userId);
  if (!snapshotKey || typeof window === "undefined") return;
  if (!agentSessionState.value.isVip || agentSessionState.value.error || !currentAgentSessionId.value) {
    removeAgentWorkspaceSnapshot(userId);
    return;
  }
  try {
    window.sessionStorage.setItem(snapshotKey, JSON.stringify({
      userId,
      sessionFingerprint: getAgentWorkspaceSessionFingerprint(),
      savedAt: Date.now(),
      conversationId: conversationId.value,
      messages: messages.value,
      agentSessionState: agentSessionState.value,
      agentSessionHistory: agentSessionHistory.value,
      agentOverview: agentOverview.value,
      dailySuggestionState: dailySuggestionState.value,
      planState: planState.value,
      planAttachStatus: planAttachStatus.value
    }));
  } catch {
    // Snapshot is an optimization for route-return UX. It is safe to skip.
  }
}

function hydrateAgentWorkspaceSnapshot() {
  const userId = getAgentWorkspaceUserId();
  const snapshot = getValidAgentWorkspaceSnapshot(userId);
  if (!snapshot) return false;

  conversationId.value = normalizeText(snapshot.conversationId) || conversationId.value;
  messages.value = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  agentSessionState.value = {
    loading: false,
    session: isPlainObject(snapshot.agentSessionState?.session) ? snapshot.agentSessionState.session : null,
    error: normalizeText(snapshot.agentSessionState?.error),
    reasonCode: normalizeText(snapshot.agentSessionState?.reasonCode),
    isVip: Boolean(snapshot.agentSessionState?.isVip)
  };
  agentSessionHistory.value = Array.isArray(snapshot.agentSessionHistory) ? snapshot.agentSessionHistory : [];
  agentOverview.value = isPlainObject(snapshot.agentOverview) ? snapshot.agentOverview : null;
  dailySuggestionState.value = {
    ...dailySuggestionState.value,
    ...(isPlainObject(snapshot.dailySuggestionState) ? snapshot.dailySuggestionState : {}),
    loading: false,
    refreshing: false,
    retrying: false
  };
  planState.value = {
    ...planState.value,
    ...(isPlainObject(snapshot.planState) ? snapshot.planState : {}),
    loading: false,
    refreshing: false,
    retrying: false,
    saving: false
  };
  planAttachStatus.value = isPlainObject(snapshot.planAttachStatus) ? snapshot.planAttachStatus : {};
  resetAgentRestoreProgress();
  agentRestoreInProgress.value = false;
  return Boolean(currentAgentSessionId.value || messages.value.length || hasDailyConclusionData.value || hasExecutablePlan.value || isPlanNoPlan.value);
}

function getValidAgentWorkspaceSnapshot(userId = getAgentWorkspaceUserId()) {
  const normalizedUserId = normalizeText(userId);
  const snapshotKey = getAgentWorkspaceSnapshotKey(normalizedUserId);
  if (!snapshotKey || typeof window === "undefined") return null;
  try {
    const snapshot = JSON.parse(window.sessionStorage.getItem(snapshotKey) || "null");
    if (!isPlainObject(snapshot)) return null;
    if (normalizeText(snapshot.userId) !== normalizedUserId) return null;
    if (normalizeText(snapshot.sessionFingerprint) !== getAgentWorkspaceSessionFingerprint()) return null;
    return snapshot;
  } catch {
    removeAgentWorkspaceSnapshot(normalizedUserId);
    return null;
  }
}

function removeAgentWorkspaceSnapshot(userId = getAgentWorkspaceUserId()) {
  const snapshotKey = getAgentWorkspaceSnapshotKey(userId);
  if (!snapshotKey || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(snapshotKey);
  } catch {
    // Storage cleanup is best effort; fall back to a normal boot.
  }
}

function clearAgentWorkspaceSessionArtifacts() {
  if (typeof window === "undefined") return;
  try {
    const prefixes = [`${AGENT_WORKSPACE_BOOT_PREFIX}:`, `${AGENT_WORKSPACE_SNAPSHOT_PREFIX}:`];
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best-effort cleanup only.
  }
}

onMounted(async () => {
  window.addEventListener("focus", handleWindowFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  await authStore.init();
  if (authStore.isLoggedIn && !authStore.loaded) {
    await authStore.loadStatus();
  }
  hydrateCachedAgentInsights();

  const hydratedFromSnapshot = !agentRestoreInProgress.value
    && hasAgentWorkspaceBooted()
    && hasAgentWorkspaceSnapshot()
    && hydrateAgentWorkspaceSnapshot();
  if (hydratedFromSnapshot) {
    void syncAgentWorkspaceInBackground();
    return;
  }

  await restoreAgentWorkspace();
});

onBeforeUnmount(() => {
  persistAgentWorkspaceSnapshot();
  persistCachedAgentInsights();
  window.removeEventListener("focus", handleWindowFocus);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (agentToastTimer) window.clearTimeout(agentToastTimer);
});

async function restoreAgentWorkspace() {
  agentWorkspaceSyncing.value = false;
  agentRestoreInProgress.value = true;
  resetAgentRestoreProgress();

  await loadAgentMemorySession({ blocking: true, clearExisting: true });
  if (!canUseAgent.value) {
    agentRestoreInProgress.value = false;
    return;
  }

  setAgentRestoreStep("insights", "going");
  startAgentInsightsBackgroundRefresh({ reflectRestoreStep: false });
  await waitForRestoreDisplayPace(AGENT_RESTORE_INSIGHT_STEP_MS);
  if (!canUseAgent.value) {
    agentRestoreInProgress.value = false;
    return;
  }
  setAgentRestoreStep("insights", "done");
  await nextTick();
  await waitForRestoreDisplayPace(AGENT_RESTORE_COMPLETE_STEP_MS);
  agentRestoreInProgress.value = false;
  markAgentWorkspaceBooted();
  persistAgentWorkspaceSnapshot();
  await nextTick();
  if (messages.value.length) {
    scrollToBottom("auto");
  }
}

async function syncAgentWorkspaceInBackground() {
  if (agentWorkspaceSyncing.value) return;
  agentWorkspaceSyncing.value = true;
  try {
    await loadAgentMemorySession({ blocking: false, clearExisting: false });
    if (canUseAgent.value) {
      startAgentInsightsBackgroundRefresh({ reflectRestoreStep: false });
      markAgentWorkspaceBooted();
      persistAgentWorkspaceSnapshot();
    }
  } finally {
    agentWorkspaceSyncing.value = false;
  }
}

async function loadAgentMemorySession({ blocking = true, clearExisting = true } = {}) {
  if (clearExisting) {
    messages.value = [];
    planAttachStatus.value = {};
  }

  if (!authStore.isLoggedIn) {
    clearAgentWorkspaceSessionArtifacts();
    agentSessionHistory.value = [];
    agentHistoryError.value = "";
    agentHistoryLoading.value = false;
    agentOverview.value = null;
    agentSessionState.value = {
      loading: false,
      session: null,
      error: "请先登录后再使用 AI 私教。",
      reasonCode: "auth_failed",
      isVip: false
    };
    dailySuggestionState.value = createEmptyDailySuggestionState();
    planState.value = createEmptyPlanState();
    if (blocking) agentRestoreInProgress.value = false;
    return;
  }

  if (blocking) {
    setAgentRestoreStep("session", "going");
    setAgentRestoreStep("messages", "wait");
    setAgentRestoreStep("insights", "wait");
  }
  const previousConversationId = conversationId.value;
  const previousMessages = messages.value;
  const previousSessionHistory = agentSessionHistory.value;
  const previousSessionState = agentSessionState.value;
  agentSessionState.value = {
    loading: blocking,
    session: clearExisting ? null : previousSessionState.session,
    error: "",
    reasonCode: clearExisting ? "" : previousSessionState.reasonCode,
    isVip: clearExisting ? false : previousSessionState.isVip
  };

  let sessionResult;
  try {
    sessionResult = await loadAgentMainSession();
  } catch {
    sessionResult = {
      ok: false,
      message: "AI 私教会话暂时不可用，请稍后再试。",
      reason_code: "session_error"
    };
  }
  if (!sessionResult?.ok || !sessionResult?.session?.id) {
    if (!blocking) {
      if (applyAgentBlockingSessionFailure(sessionResult)) return;
      agentSessionState.value = {
        ...previousSessionState,
        loading: false
      };
      showAgentToast(normalizeText(sessionResult?.message) || "AI 私教会话同步失败，已保留当前页面。");
      return;
    }
    setAgentRestoreStep("session", "failed");
    setAgentRestoreStep("messages", "wait");
    setAgentRestoreStep("insights", "wait");
    agentSessionState.value = {
      loading: false,
      session: null,
      error: normalizeText(sessionResult?.message) || "AI 私教会话暂时不可用，请稍后再试。",
      reasonCode: normalizeText(sessionResult?.reason_code) || "session_error",
      isVip: false
    };
    if (blocking) agentRestoreInProgress.value = false;
    return;
  }

  const session = sessionResult.session;
  const nextSessionHistory = normalizeSessionHistory(sessionResult.sessions);
  if (blocking) {
    conversationId.value = session.id;
    agentSessionHistory.value = nextSessionHistory;
    setAgentRestoreStep("session", "done");
    setAgentRestoreStep("messages", "going");
    agentSessionState.value = {
      loading: true,
      session,
      error: "",
      reasonCode: "ok",
      isVip: true
    };
  }

  let messagesResult;
  try {
    messagesResult = await loadAgentSessionMessages(session.id);
  } catch {
    messagesResult = {
      ok: false,
      message: "AI 私教聊天记录暂时不可用，请稍后再试。",
      reason_code: "messages_error"
    };
  }
  if (!messagesResult?.ok) {
    if (!blocking) {
      if (applyAgentBlockingSessionFailure(messagesResult)) return;
      conversationId.value = previousConversationId;
      messages.value = previousMessages;
      agentSessionHistory.value = previousSessionHistory;
      agentSessionState.value = {
        ...previousSessionState,
        loading: false
      };
      showAgentToast(normalizeText(messagesResult?.message) || "最近消息同步失败，已保留当前聊天。");
      return;
    }
    setAgentRestoreStep("messages", "failed");
    setAgentRestoreStep("insights", "wait");
    agentSessionState.value = {
      loading: false,
      session,
      error: normalizeText(messagesResult?.message) || "AI 私教聊天记录暂时不可用，请稍后再试。",
      reasonCode: normalizeText(messagesResult?.reason_code) || "messages_error",
      isVip: true
    };
    if (blocking) agentRestoreInProgress.value = false;
    return;
  }

  conversationId.value = session.id;
  agentSessionHistory.value = nextSessionHistory;
  messages.value = normalizeStoredMessages(messagesResult.messages);
  if (Array.isArray(messagesResult.sessions) && messagesResult.sessions.length) {
    agentSessionHistory.value = normalizeSessionHistory(messagesResult.sessions);
  }
  await loadAgentHistoryList({ silent: true });
  if (blocking) setAgentRestoreStep("messages", "done");
  agentSessionState.value = {
    loading: false,
    session,
    error: "",
    reasonCode: "ok",
    isVip: true
  };

  if (messages.value.length) {
    await nextTick();
    scrollToBottom("auto");
  }
}

async function loadOverview() {
  try {
    agentOverview.value = await loadAgentOverview(authStore);
  } catch {
    agentOverview.value = null;
  }
}

async function loadAgentHistoryList({ silent = false } = {}) {
  if (!canUseAgent.value && !silent) return;
  if (!silent) {
    agentHistoryLoading.value = true;
    agentHistoryError.value = "";
  }

  try {
    const result = await loadAgentSessionList();
    if (!result?.ok) {
      if (applyAgentAccessFailure(result)) return;
      if (!silent) {
        agentHistoryError.value = normalizeText(result?.message) || "历史对话加载失败，请稍后再试。";
      }
      return;
    }

    agentSessionHistory.value = normalizeSessionHistory(result.sessions);
    agentHistoryError.value = "";
  } catch {
    if (!silent) {
      agentHistoryError.value = "历史对话加载失败，请稍后再试。";
    }
  } finally {
    if (!silent) agentHistoryLoading.value = false;
  }
}

function startAgentInsightsBackgroundRefresh({ reflectRestoreStep = true } = {}) {
  if (!canLoadAgentInsights.value) return;
  const requestSeq = ++agentInsightsBackgroundRequestSeq;
  agentInsightsBackgroundInProgress.value = true;
  if (reflectRestoreStep) {
    setAgentRestoreStep("insights", "going");
  }
  void refreshAgentInsights({ background: true })
    .then(() => {
      if (reflectRestoreStep) {
        setAgentRestoreStep("insights", "done");
      }
    })
    .catch(() => {
      if (reflectRestoreStep) {
        setAgentRestoreStep("insights", "wait");
      }
    })
    .finally(() => {
      if (requestSeq === agentInsightsBackgroundRequestSeq) {
        agentInsightsBackgroundInProgress.value = false;
      }
    });
}

async function loadDailySuggestion({ manual = false, background = false } = {}) {
  const requestPracticeSignature = buildPracticeSignature();
  const practiceSignature = normalizePracticeSignature(requestPracticeSignature);
  const cacheKey = getAgentInsightModuleCacheKey(AGENT_INSIGHT_MODULES.daily, practiceSignature);
  if (dailySuggestionInFlight?.key === cacheKey && (!manual || dailySuggestionInFlight.manual)) {
    return dailySuggestionInFlight.promise;
  }
  if (dailySuggestionInFlight?.key === cacheKey && manual && !dailySuggestionInFlight.manual) {
    pendingForcedDailySuggestionRefresh = true;
    dailySuggestionState.value = {
      ...dailySuggestionState.value,
      refreshing: false,
      retrying: true,
      error: ""
    };
    try {
      await dailySuggestionInFlight.promise;
    } catch {
      // Continue with the explicit forced refresh even if the background attempt failed.
    }
    if (!pendingForcedDailySuggestionRefresh) return;
  }
  const freshCache = getFreshAgentInsightModuleCache(AGENT_INSIGHT_MODULES.daily, practiceSignature);
  if (!manual && freshCache) {
    applyCachedDailySuggestion(freshCache);
    return;
  }
  const requestSeq = ++dailySuggestionRequestSeq;
  const hasExistingSuggestion = hasDailyConclusionData.value;
  const previousState = dailySuggestionState.value;
  const shouldShowLoading = !hasExistingSuggestion && !manual;

  dailySuggestionState.value = {
    ...previousState,
    loading: shouldShowLoading,
    refreshing: !manual && (background || hasExistingSuggestion),
    retrying: manual,
    source: hasExistingSuggestion ? previousState.source : "loading",
    error: manual ? "" : previousState.error,
    reasonCode: manual ? "" : previousState.reasonCode,
    practiceSignature
  };

  const requestPromise = (async () => {
    const result = await withClientTimeout(
      requestDailyAiSuggestion({
        force: manual,
        practiceSignature: requestPracticeSignature
      }),
      AGENT_INSIGHT_CLIENT_TIMEOUT_MS,
      {
        ok: false,
        timed_out: true,
        message: AGENT_DAILY_TIMEOUT_MESSAGE,
        reason_code: "provider_timeout"
      }
    );

    if (requestSeq !== dailySuggestionRequestSeq) return;

    if (result?.ok && result?.suggestion) {
      const updatedAt = Date.now();
      const cachePracticeSignature = normalizePracticeSignature(result.practice_signature || practiceSignature);
      const cachePayload = {
        source: normalizeText(result.source) || "backend",
        suggestion: result.suggestion,
        reasonCode: normalizeText(result.reason_code) || "ok"
      };
      const cache = persistAgentInsightModuleCache(AGENT_INSIGHT_MODULES.daily, cachePayload, {
        practiceSignature: cachePracticeSignature,
        updatedAt
      });
      if (cachePracticeSignature !== practiceSignature) {
        persistAgentInsightModuleCache(AGENT_INSIGHT_MODULES.daily, cachePayload, {
          practiceSignature,
          updatedAt
        });
      }
      dailySuggestionState.value = {
        loading: false,
        refreshing: false,
        retrying: false,
        source: normalizeText(result.source) || "backend",
        suggestion: result.suggestion,
        error: "",
        reasonCode: normalizeText(result.reason_code) || "ok",
        updatedAt,
        expiresAt: Number(cache?.expires_at || 0) || updatedAt + AGENT_INSIGHT_CACHE_TTL_MS,
        practiceSignature: cachePracticeSignature
      };
      return;
    }
    if (!result?.ok && applyAgentAccessFailure(result)) {
      return;
    }

    const errorMessage = resolveAgentReasonMessage(
      normalizeText(result?.reason_code),
      normalizeText(result?.message) || "今日 AI 结论生成失败，请稍后重试。"
    );
    if (hasExistingSuggestion) {
      dailySuggestionState.value = {
        ...previousState,
        loading: false,
        refreshing: false,
        retrying: false,
        error: "",
        reasonCode: normalizeText(result?.reason_code) || previousState.reasonCode,
        practiceSignature: previousState.practiceSignature || practiceSignature
      };
      if (manual) showAgentToast(errorMessage);
      return;
    }

    dailySuggestionState.value = {
      loading: false,
      refreshing: false,
      retrying: false,
      source: result?.timed_out ? "timeout" : normalizeText(result?.reason_code) || "unavailable",
      suggestion: null,
      error: errorMessage,
      reasonCode: normalizeText(result?.reason_code),
      updatedAt: 0,
      expiresAt: 0,
      practiceSignature
    };
  })();

  dailySuggestionInFlight = {
    key: cacheKey,
    manual,
    promise: requestPromise
  };

  try {
    await requestPromise;
  } catch {
    if (requestSeq !== dailySuggestionRequestSeq) return;
    if (hasExistingSuggestion) {
      dailySuggestionState.value = {
        ...previousState,
        loading: false,
        refreshing: false,
        retrying: false,
        error: "",
        practiceSignature: previousState.practiceSignature || practiceSignature
      };
      if (manual) showAgentToast("今日 AI 结论更新失败，请稍后重试。");
      return;
    }
    dailySuggestionState.value = {
      loading: false,
      refreshing: false,
      retrying: false,
      source: "network_error",
      suggestion: null,
      error: resolveAgentReasonMessage("network_error", "网络连接不太稳定，请稍后重试。"),
      reasonCode: "network_error",
      updatedAt: 0,
      expiresAt: 0,
      practiceSignature
    };
  } finally {
    if (dailySuggestionInFlight?.promise === requestPromise) {
      dailySuggestionInFlight = null;
    }
    if (manual) {
      pendingForcedDailySuggestionRefresh = false;
    }
  }
}

async function refreshExecutablePlan({ manual = false, background = false } = {}) {
  const practiceSignature = getCurrentPracticeSignature();
  const cacheKey = getAgentInsightModuleCacheKey(AGENT_INSIGHT_MODULES.plan, practiceSignature);
  if (executablePlanInFlight?.key === cacheKey && (!manual || executablePlanInFlight.manual)) {
    return executablePlanInFlight.promise;
  }
  if (executablePlanInFlight?.key === cacheKey && manual && !executablePlanInFlight.manual) {
    pendingForcedExecutablePlanRefresh = true;
    planState.value = {
      ...planState.value,
      refreshing: false,
      retrying: true,
      error: ""
    };
    try {
      await executablePlanInFlight.promise;
    } catch {
      // Continue with the explicit retry even if the background attempt failed.
    }
    if (!pendingForcedExecutablePlanRefresh) return;
  }
  const freshCache = getFreshAgentInsightModuleCache(AGENT_INSIGHT_MODULES.plan, practiceSignature);
  if (!manual && freshCache) {
    applyCachedExecutablePlan(freshCache);
    return;
  }
  const requestSeq = ++executablePlanRequestSeq;
  const hasStablePlanState = Boolean(activePlan.value || isPlanNoPlan.value);
  const previousState = planState.value;
  const shouldShowLoading = !hasStablePlanState && !hasExecutablePlan.value && !manual;

  planState.value = {
    ...previousState,
    loading: shouldShowLoading,
    refreshing: !manual && (background || hasStablePlanState || hasExecutablePlan.value),
    retrying: manual,
    error: manual ? "" : previousState.error,
    reasonCode: manual && previousState.reasonCode !== "no_plan" ? "" : previousState.reasonCode,
    practiceSignature
  };

  const requestPromise = (async () => {
    const result = await withClientTimeout(
      loadAgentPlan(),
      AGENT_INSIGHT_CLIENT_TIMEOUT_MS,
      {
        ok: false,
        timed_out: true,
        plan: null,
        message: AGENT_PLAN_TIMEOUT_MESSAGE,
        reason_code: "client_timeout"
      }
    );

    if (requestSeq !== executablePlanRequestSeq) return;

    if (!result?.ok && applyAgentAccessFailure(result)) {
      return;
    }

    if (result?.ok) {
      const reasonCode = normalizeText(result?.reason_code) || (result?.plan ? "ok" : "no_plan");
      const updatedAt = Date.now();
      const cache = persistAgentInsightModuleCache(AGENT_INSIGHT_MODULES.plan, {
        plan: isPlainObject(result?.plan) ? result.plan : null,
        reasonCode
      }, {
        practiceSignature,
        updatedAt
      });
      planState.value = {
        loading: false,
        refreshing: false,
        retrying: false,
        saving: false,
        error: "",
        reasonCode,
        plan: isPlainObject(result?.plan) ? result.plan : null,
        updatedAt,
        expiresAt: Number(cache?.expires_at || 0) || updatedAt + AGENT_INSIGHT_CACHE_TTL_MS,
        practiceSignature
      };
      return;
    }

    const reasonCode = result?.timed_out ? "provider_timeout" : normalizeText(result?.reason_code);
    const errorMessage = resolveAgentReasonMessage(
      reasonCode,
      normalizeText(result?.message) || "可执行计划加载失败，请稍后重试。"
    );

    if (hasStablePlanState || hasExecutablePlan.value) {
      planState.value = {
        ...previousState,
        loading: false,
        refreshing: false,
        retrying: false,
        saving: false,
        error: "",
        reasonCode: previousState.reasonCode || reasonCode,
        updatedAt: previousState.updatedAt || 0,
        expiresAt: previousState.expiresAt || 0,
        practiceSignature: previousState.practiceSignature || practiceSignature
      };
      if (manual) showAgentToast(errorMessage);
      return;
    }

    planState.value = {
      loading: false,
      refreshing: false,
      retrying: false,
      saving: false,
      error: errorMessage,
      reasonCode,
      plan: null,
      updatedAt: 0,
      expiresAt: 0,
      practiceSignature
    };
  })();

  executablePlanInFlight = {
    key: cacheKey,
    manual,
    promise: requestPromise
  };

  try {
    await requestPromise;
  } finally {
    if (executablePlanInFlight?.promise === requestPromise) {
      executablePlanInFlight = null;
    }
    if (manual) {
      pendingForcedExecutablePlanRefresh = false;
    }
  }
}

function handleWindowFocus() {
  if (!canLoadAgentInsights.value) return;
  void refreshAgentInsightsFromVisibility();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && canLoadAgentInsights.value) {
    void refreshAgentInsightsFromVisibility();
  }
}

function refreshAgentInsightsFromVisibility() {
  const now = Date.now();
  if (now - lastAgentInsightRefreshAt < AGENT_INSIGHT_REFRESH_DEBOUNCE_MS) return;
  if (isAgentInsightRequestInFlight()) return;
  lastAgentInsightRefreshAt = now;
  void refreshAgentInsights({ background: true });
}

async function refreshAgentInsights({ background = false } = {}) {
  await loadOverview();
  hydrateCachedAgentInsights({ preferCurrentSignature: true });
  await Promise.all([
    loadDailySuggestion({ background }),
    refreshExecutablePlan({ background })
  ]);
}

function isDailySuggestionRequestInFlight() {
  return Boolean(
    dailySuggestionState.value.loading
    || dailySuggestionState.value.refreshing
    || dailySuggestionState.value.retrying
  );
}

function isExecutablePlanRequestInFlight() {
  return Boolean(
    planState.value.loading
    || planState.value.refreshing
    || planState.value.retrying
  );
}

function isAgentInsightRequestInFlight() {
  return Boolean(
    isDailySuggestionRequestInFlight()
    || isExecutablePlanRequestInFlight()
    || dailySuggestionInFlight
    || executablePlanInFlight
  );
}

function resolveAgentReasonMessage(reasonCode, fallback = "") {
  const normalized = normalizeText(reasonCode);
  const messages = {
    auth_failed: "登录状态失效，请重新登录",
    vip_required: "AI 私教为 VIP 专属功能",
    forbidden: "AI 私教为 VIP 专属功能",
    no_plan: "还没有可执行计划",
    plan_storage_not_ready: "可执行计划表还没有准备好，请检查 Supabase SQL",
    agent_memory_not_ready: "Agent 记忆表还没有准备好，请检查 Supabase SQL",
    provider_timeout: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_connect_timeout: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_response_timeout: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_http_5xx: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_empty_content: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_parse_failed: "AI 私教暂时连接不稳定，请稍后重试。",
    timeout: "AI 私教暂时连接不稳定，请稍后重试。",
    client_timeout: "AI 私教暂时连接不稳定，请稍后重试。",
    provider_error: "AI 私教暂时连接不稳定，请稍后重试。",
    daily_suggestion_unavailable: "AI 私教暂时连接不稳定，请稍后重试。",
    database_error: "AI 私教暂时连接不稳定，请稍后重试。",
    plan_storage_error: "AI 私教暂时连接不稳定，请稍后重试。",
    network_error: "AI 私教暂时连接不稳定，请稍后重试。",
    unexpected_error: "AI 私教暂时连接不稳定，请稍后重试。"
  };
  return messages[normalized] || normalizeText(fallback) || "发生未知错误，请稍后重试";
}

async function handleRetryAgentWorkspace() {
  if (pending.value) return;
  pending.value = true;
  try {
    await restoreAgentWorkspace();
  } finally {
    pending.value = false;
  }
}

function withClientTimeout(promise, timeoutMs, timeoutValue) {
  let timeoutId = 0;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      resolve(timeoutValue);
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  });
}

function waitForRestoreDisplayPace(durationMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function isAgentAccessFailure(reasonCode) {
  const normalized = normalizeText(reasonCode);
  return normalized === "vip_required" || normalized === "forbidden";
}

function isAgentBlockingSessionFailure(reasonCode) {
  const normalized = normalizeText(reasonCode);
  return ["auth_failed", "vip_required", "forbidden", "agent_memory_not_ready"].includes(normalized);
}

function createEmptyDailySuggestionState() {
  return {
    loading: false,
    refreshing: false,
    retrying: false,
    source: "idle",
    suggestion: null,
    error: "",
    reasonCode: "",
    updatedAt: 0,
    expiresAt: 0,
    practiceSignature: ""
  };
}

function createEmptyPlanState() {
  return {
    loading: false,
    refreshing: false,
    retrying: false,
    saving: false,
    error: "",
    reasonCode: "",
    plan: null,
    updatedAt: 0,
    expiresAt: 0,
    practiceSignature: ""
  };
}

function applyAgentBlockingSessionFailure(result) {
  const reasonCode = normalizeText(result?.reason_code);
  if (!isAgentBlockingSessionFailure(reasonCode)) return false;

  clearAgentWorkspaceSessionArtifacts();
  agentSessionHistory.value = [];
  agentHistoryError.value = "";
  agentHistoryLoading.value = false;
  agentOverview.value = null;
  agentSessionState.value = {
    loading: false,
    session: null,
    error: resolveAgentReasonMessage(reasonCode, normalizeText(result?.message) || "AI 私教暂时不可用，请稍后再试。"),
    reasonCode,
    isVip: false
  };
  conversationId.value = `agent_${Date.now().toString(36)}`;
  messages.value = [];
  planAttachStatus.value = {};
  dailySuggestionState.value = createEmptyDailySuggestionState();
  planState.value = createEmptyPlanState();
  agentRestoreInProgress.value = false;
  return true;
}

function applyAgentAccessFailure(result) {
  const reasonCode = normalizeText(result?.reason_code);
  if (!isAgentAccessFailure(reasonCode)) return false;
  return applyAgentBlockingSessionFailure(result);
}

function buildPracticeSignature() {
  const snapshot = recentTaskSnapshot.value;
  if (!snapshot) return "";
  return [
    snapshot.latestPracticeId,
    snapshot.latestPracticeAt,
    snapshot.recentAttempts,
    snapshot.recent7DayAttempts,
    snapshot.averageScore,
    snapshot.weakTaskType
  ].map((item) => normalizeText(item)).join(":");
}

function shouldSendAgentSessionId(message) {
  const text = normalizeText(message);
  if (!text) return false;
  if (/^(?:hi|hello|hey|你好|您好|哈喽|嗨|在吗|在嘛|早上好|下午好|晚上好)[!！。？?\s]*$/i.test(text)) return false;
  if (/^(?:谢谢|谢了|感谢|多谢|辛苦了|thank you|thanks|thx)[!！。？?\s]*$/i.test(text)) return false;
  if (/(你是谁|你是什么|你是干嘛的|你叫什么|你是做什么的|你是什么模型|你用的什么模型|你是gpt吗|你是不是大模型|你是谁开发的)/i.test(text)) return false;
  if (/(你能做什么|你有什么功能|你可以帮我什么|你会什么|你能帮我什么)/i.test(text)) return false;
  if (!/(pte|ra|rs|rl|rts|wfd|we|swt|di|口语|写作|听力|阅读|发音|流利度|模板|题型|考试|备考|提分|练习|记录|分数|成绩|薄弱|弱项|复盘|分析|计划|训练|安排|今天练什么|最近表现|继续|按这个来)/i.test(text)) return false;
  return true;
}

async function handleSubmit(rawMessage = draft.value) {
  const message = normalizeText(rawMessage);
  if (!message || pending.value || !canUseAgent.value) return;

  pending.value = true;

  try {
    if (agentSessionSyncPromise) {
      const synced = await waitForAgentSessionSync();
      if (!synced || !canUseAgent.value || isOptimisticAgentSession(agentSessionState.value.session)) {
        showAgentToast("新对话还在同步，请稍后再试。");
        return;
      }
    }

    if (isOptimisticAgentSession(agentSessionState.value.session)) {
      showAgentToast("新对话还在同步，请稍后再试。");
      return;
    }

    autoScrollEnabled.value = true;
    messages.value.push(createMessage("user", message));
    const recentMessages = buildRecentMessagesPayload(messages.value);
    if (normalizeText(draft.value) === message) {
      draft.value = "";
    }

    aiResponding.value = true;
    const result = await sendAgentMessage(message, conversationId.value, recentMessages, {
      sessionId: shouldSendAgentSessionId(message) ? currentAgentSessionId.value : "",
      practiceSignature: buildPracticeSignature()
    });
    if (result.ok) {
      messages.value.push(
        createMessage(
          "assistant",
          normalizeText(result.reply) || "我已经收到你的问题，接下来会给你更具体的训练建议。",
          {
            planSuggestion: result.plan_suggestion
          }
        )
      );
      void loadAgentHistoryList({ silent: true });
      return;
    }

    if (applyAgentAccessFailure(result)) return;

    messages.value.push(
      createMessage("assistant", resolveAgentReasonMessage(
        normalizeText(result?.reason_code),
        normalizeText(result?.message) || "AI 私教暂时连接不稳定，请稍后重试。"
      ), {
        metaLabel: "AI 私教",
        tone: "error"
      })
    );
  } catch {
    messages.value.push(
      createMessage("assistant", "AI 私教暂时连接不稳定，请稍后重试。", {
        metaLabel: "AI 私教",
        tone: "error"
      })
    );
  } finally {
    aiResponding.value = false;
    pending.value = false;
  }
}

function handleQuickAction(action) {
  const prompt = normalizeText(action?.prompt);
  if (!prompt) return;
  void handleSubmit(prompt);
}

function handleRetryDailySuggestion() {
  void loadDailySuggestion({ manual: true });
}

function handleRetryExecutablePlan() {
  void refreshExecutablePlan({ manual: true });
}

function handleGeneratePlanFromPlanCard() {
  void refreshExecutablePlan({ manual: true });
  void handleSubmit(PLAN_GENERATION_PROMPT);
}

function handleCapabilitySelect(item) {
  const id = normalizeText(item?.id);
  const mappedAction = {
    diagnose: "weakness",
    plan: "today-plan"
  }[id];
  if (mappedAction) {
    const action = quickActions.find((candidate) => candidate.id === mappedAction);
    handleQuickAction(action);
    return;
  }

  if (id === "coach") {
    void handleSubmit("陪我把今天的训练动作拆到可执行：先问我一个必要问题，再给出下一步。");
  }
}

function handleWorkspacePrimaryAction() {
  const state = agentWorkspaceState.value;
  if (state === "unavailable") {
    openPath("/auth");
    return;
  }
  if (state === "locked") {
    openPath("/upgrade");
    return;
  }
  if (state === "failed") {
    void handleRetryAgentWorkspace();
  }
}

function handleWorkspaceSecondaryAction() {
  const state = agentWorkspaceState.value;
  if (state === "locked") {
    openPath("/home#quick");
    return;
  }
  openPath("/home");
}

function handleWarmShellPrimaryAction() {
  const state = agentWorkspaceState.value;
  if (state === "failed") {
    void handleRetryAgentWorkspace();
    return;
  }
  if (state === "locked" || state === "unavailable") {
    openPath("/upgrade");
  }
}

function handleWarmShellSecondaryAction() {
  const state = agentWorkspaceState.value;
  if (state === "locked" || state === "unavailable") {
    openPath("/home#quick");
    return;
  }
  openPath("/home");
}

async function handleRestartConversation() {
  if (!canUseAgent.value || pending.value || agentSessionSyncing.value) return;

  aiResponding.value = false;
  pending.value = false;

  const previousSessionSnapshot = {
    conversationId: conversationId.value,
    messages: [...messages.value],
    draft: draft.value,
    planAttachStatus: { ...planAttachStatus.value },
    agentSessionHistory: [...agentSessionHistory.value],
    agentSessionState: {
      ...agentSessionState.value,
      session: agentSessionState.value.session ? { ...agentSessionState.value.session } : null
    }
  };
  const optimisticSession = createOptimisticAgentSession();
  const optimisticSessionId = optimisticSession.id;
  const restorePreviousSession = () => {
    if (currentAgentSessionId.value !== optimisticSessionId) return;
    const currentDraft = draft.value;
    conversationId.value = previousSessionSnapshot.conversationId;
    messages.value = previousSessionSnapshot.messages;
    draft.value = normalizeText(currentDraft) ? currentDraft : previousSessionSnapshot.draft;
    planAttachStatus.value = previousSessionSnapshot.planAttachStatus;
    agentSessionHistory.value = previousSessionSnapshot.agentSessionHistory;
    agentSessionState.value = previousSessionSnapshot.agentSessionState;
    autoScrollEnabled.value = false;
  };
  conversationId.value = optimisticSessionId;
  messages.value = [];
  draft.value = "";
  planAttachStatus.value = {};
  agentSessionState.value = {
    loading: false,
    session: optimisticSession,
    error: "",
    reasonCode: "ok",
    isVip: true
  };
  await nextTick();
  autoScrollEnabled.value = false;

  agentSessionSyncing.value = true;
  const syncPromise = createAgentNewSession()
    .then(async (result) => {
      if (!result?.ok || !result?.session?.id) {
        if (applyAgentAccessFailure(result)) return { ok: false };
        restorePreviousSession();
        const message = normalizeText(result?.message) || "新对话创建失败，请稍后再试。";
        showAgentToast(message);
        return { ok: false };
      }

      const session = result.session;
      agentSessionHistory.value = normalizeSessionHistory(result.sessions);
      if (currentAgentSessionId.value === optimisticSessionId) {
        conversationId.value = session.id;
        planAttachStatus.value = {};
        agentSessionState.value = {
          loading: false,
          session,
          error: "",
          reasonCode: "ok",
          isVip: true
        };
        await nextTick();
        autoScrollEnabled.value = false;
      }
      void loadAgentHistoryList({ silent: true });
      return { ok: true, session };
    })
    .catch(() => {
      restorePreviousSession();
      showAgentToast("新对话创建失败，请稍后再试。");
      return { ok: false };
    })
    .finally(() => {
      if (agentSessionSyncPromise === syncPromise) {
        agentSessionSyncPromise = null;
        agentSessionSyncing.value = false;
      }
    });

  agentSessionSyncPromise = syncPromise;
}

async function handleDeleteHistory() {
  if (!canUseAgent.value || pending.value) return;
  if (typeof window !== "undefined") {
    const confirmed = window.confirm("确定要删除所有 AI 私教聊天记录吗？删除后无法恢复。");
    if (!confirmed) return;
  }

  aiResponding.value = false;
  pending.value = true;
  try {
    const result = await deleteAgentChatHistory();
    if (!result?.ok || !result?.session?.id) {
      if (applyAgentAccessFailure(result)) return;
      const message = normalizeText(result?.message) || "历史对话操作失败，请稍后再试。";
      if (typeof window !== "undefined") window.alert(message);
      return;
    }

    const session = result.session;
    conversationId.value = session.id;
    messages.value = [];
    draft.value = "";
    planAttachStatus.value = {};
    agentSessionHistory.value = [];
    agentHistoryError.value = "";
    agentSessionState.value = {
      loading: false,
      session,
      error: "",
      reasonCode: "ok",
      isVip: true
    };
    await nextTick();
    autoScrollEnabled.value = false;
    showAgentToast("历史已清空");
  } catch {
    if (typeof window !== "undefined") {
      window.alert("历史对话操作失败，请稍后再试。");
    }
  } finally {
    pending.value = false;
  }
}

async function handleSessionHistorySelect(item) {
  const sessionId = normalizeText(item?.id);
  if (!sessionId || sessionId === currentAgentSessionId.value || pending.value || historyBusy.value) return;

  aiResponding.value = false;
  agentSessionSwitching.value = true;
  try {
    const result = await switchAgentSession(sessionId);
    if (!result?.ok || !result?.session?.id) {
      if (applyAgentAccessFailure(result)) return;
      const message = normalizeText(result?.message) || "历史对话操作失败，请稍后再试。";
      if (typeof window !== "undefined") window.alert(message);
      return;
    }

    conversationId.value = result.session.id;
    messages.value = normalizeStoredMessages(result.messages);
    planAttachStatus.value = {};
    agentSessionHistory.value = normalizeSessionHistory(result.sessions);
    agentSessionState.value = {
      loading: false,
      session: result.session,
      error: "",
      reasonCode: "ok",
      isVip: true
    };
    await nextTick();
    scrollToBottom("auto");
  } catch {
    if (typeof window !== "undefined") {
      window.alert("历史对话操作失败，请稍后再试。");
    }
  } finally {
    agentSessionSwitching.value = false;
  }
}

async function handleDeleteSessionHistory(item) {
  const sessionId = normalizeText(item?.id);
  if (!sessionId || pending.value || historyBusy.value) return;

  aiResponding.value = false;
  deletingAgentSessionId.value = sessionId;
  try {
    const result = await deleteAgentSession(sessionId);
    if (!result?.ok) {
      if (applyAgentAccessFailure(result)) return;
      const message = normalizeText(result?.message) || "删除历史对话失败，请稍后再试。";
      showAgentToast(message);
      return;
    }

    const nextHistory = normalizeSessionHistory(result.sessions);
    const nextSession = result.session?.id ? result.session : null;
    agentSessionHistory.value = nextHistory;
    agentHistoryError.value = "";

    if (sessionId === currentAgentSessionId.value) {
      conversationId.value = normalizeText(nextSession?.id) || `agent_${Date.now().toString(36)}`;
      messages.value = normalizeStoredMessages(result.messages);
      draft.value = "";
      planAttachStatus.value = {};
      agentSessionState.value = {
        loading: false,
        session: nextSession,
        error: "",
        reasonCode: "ok",
        isVip: true
      };
      await nextTick();
      autoScrollEnabled.value = false;
    }

    showAgentToast("历史对话已删除");
    void loadAgentHistoryList({ silent: true });
  } catch {
    showAgentToast("删除历史对话失败，请稍后再试。");
  } finally {
    deletingAgentSessionId.value = "";
  }
}

function showAgentToast(message) {
  const normalized = normalizeText(message);
  if (!normalized) return;
  agentToast.value = normalized;

  if (agentToastTimer && typeof window !== "undefined") {
    window.clearTimeout(agentToastTimer);
  }

  if (typeof window !== "undefined") {
    agentToastTimer = window.setTimeout(() => {
      agentToast.value = "";
      agentToastTimer = 0;
    }, 2400);
  }
}

function createOptimisticAgentSession() {
  const now = new Date().toISOString();
  const id = `${OPTIMISTIC_AGENT_SESSION_ID_PREFIX}${Date.now().toString(36)}`;
  return {
    id,
    title: "新对话",
    status: "active",
    created_at: now,
    updated_at: now,
    last_message_at: now,
    message_count: 0,
    preview: "",
    optimistic: true
  };
}

function isOptimisticAgentSession(session) {
  const sessionId = normalizeText(session?.id);
  return Boolean(session?.optimistic || sessionId.startsWith(OPTIMISTIC_AGENT_SESSION_ID_PREFIX));
}

async function waitForAgentSessionSync() {
  if (!agentSessionSyncPromise) return true;
  const result = await agentSessionSyncPromise;
  return Boolean(result?.ok && result?.session?.id);
}

function handleRecommendedQuestion(item) {
  const prompt = normalizeText(item?.prompt || item?.text);
  if (!prompt) return;
  void handleSubmit(prompt);
}

function handleConclusionDetail() {
  if (conclusionPanelState.value !== "ready") return;
  void handleSubmit("请展开说明今天 AI 结论里的问题，并给我一个可以马上执行的提分步骤。");
}

async function saveDraftSuggestionPlan() {
  if (!draftPlanSuggestion.value || planState.value.saving) return null;

  planState.value = {
    ...planState.value,
    saving: true,
    error: ""
  };

  const result = await saveAgentPlan(draftPlanSuggestion.value);
  if (result?.ok && result?.plan) {
    const updatedAt = Date.now();
    planState.value = {
      loading: false,
      refreshing: false,
      retrying: false,
      saving: false,
      error: "",
      reasonCode: normalizeText(result.reason_code),
      plan: result.plan,
      updatedAt,
      expiresAt: updatedAt + AGENT_INSIGHT_CACHE_TTL_MS,
      practiceSignature: getCurrentPracticeSignature()
    };
    persistCachedAgentInsights();
    return result.plan;
  }

  if (!result?.ok && applyAgentAccessFailure(result)) return null;

  planState.value = {
    ...planState.value,
    loading: false,
    refreshing: false,
    retrying: false,
    saving: false,
    error: resolveAgentReasonMessage(normalizeText(result?.reason_code), normalizeText(result?.message) || "保存今日计划失败，请稍后再试。"),
    reasonCode: normalizeText(result?.reason_code),
    plan: null
  };
  return null;
}

async function handleAttachPlan(message) {
  if (!message?.id || !isPlainObject(message.planSuggestion) || planState.value.saving) return;

  planAttachStatus.value = {
    ...planAttachStatus.value,
    [message.id]: {
      state: "saving",
      message: "正在接入今日计划..."
    }
  };
  planState.value = {
    ...planState.value,
    saving: true,
    error: ""
  };

  const result = await saveAgentPlan(message.planSuggestion);
  if (result?.ok && result?.plan) {
    const updatedAt = Date.now();
    planState.value = {
      loading: false,
      refreshing: false,
      retrying: false,
      saving: false,
      error: "",
      reasonCode: normalizeText(result.reason_code),
      plan: result.plan,
      updatedAt,
      expiresAt: updatedAt + AGENT_INSIGHT_CACHE_TTL_MS,
      practiceSignature: getCurrentPracticeSignature()
    };
    persistCachedAgentInsights();
    planAttachStatus.value = {
      ...clearSavedPlanAttachStatuses(),
      [message.id]: {
        state: "saved",
        message: "已接入今日计划"
      }
    };
    return;
  }

  if (applyAgentAccessFailure(result)) {
    return;
  }

  const errorMessage = normalizeText(result?.message) || "接入计划失败，请稍后再试。";
  planState.value = {
    ...planState.value,
    saving: false,
    error: resolveAgentReasonMessage(normalizeText(result?.reason_code), errorMessage),
    reasonCode: normalizeText(result?.reason_code)
  };
  planAttachStatus.value = {
    ...planAttachStatus.value,
    [message.id]: {
      state: "error",
      message: errorMessage
    }
  };
}

function getPlanAttachStatus(message) {
  return planAttachStatus.value?.[message?.id] || { state: "idle", message: "" };
}

function clearSavedPlanAttachStatuses() {
  return Object.fromEntries(
    Object.entries(planAttachStatus.value || {}).map(([messageId, status]) => [
      messageId,
      status?.state === "saved" ? { state: "idle", message: "" } : status
    ])
  );
}

async function handleStartTraining() {
  if (!hasExecutablePlan.value) return;
  if (isPlanComplete.value) return;

  if (!hasSavedExecutablePlan.value) {
    const savedPlan = await saveDraftSuggestionPlan();
    if (!savedPlan) return;
  }

  const nextItem = displayPlanItems.value.find((item) => !item.is_complete) || displayPlanItems.value[0];
  openPath(nextItem?.route || "/ra");
}

async function handlePlanItemClick(item) {
  if (!item || item.is_complete || planState.value.saving) return;

  if (!hasSavedExecutablePlan.value) {
    const savedPlan = await saveDraftSuggestionPlan();
    if (!savedPlan) return;
  }

  openPath(item.route || "/ra");
}

function handleNav(item) {
  if (!item?.target) return;
  openPath(item.target);
}

function openPath(path) {
  const normalized = normalizeText(path);
  if (!normalized) return;

  if (normalized.includes("#")) {
    const [routePath, hash] = normalized.split("#");
    router.push(routePath || "/home").then(() => {
      if (hash) {
        window.setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    });
    return;
  }

  router.push(normalized);
}

function scrollToBottom(behavior = "smooth") {
  const container = messagesBodyRef.value;
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior
  });
}

function createMessage(role, content, options = {}) {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: normalizeText(content),
    time: normalizeText(options.time) || formatCurrentTime(),
    tone: options.tone || "default",
    metaLabel: normalizeText(options.metaLabel || (role === "assistant" ? "AI 私教" : "你")),
    planSuggestion: isPlainObject(options.planSuggestion) ? options.planSuggestion : null
  };
}

function normalizeStoredMessages(sourceMessages) {
  return (Array.isArray(sourceMessages) ? sourceMessages : [])
    .map((item) => {
      const role = normalizeText(item?.role).toLowerCase();
      const content = normalizeText(item?.content);
      if ((role !== "user" && role !== "assistant") || !content) return null;

      return {
        id: normalizeText(item?.id) || `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role,
        content,
        time: formatMessageTime(item?.created_at),
        tone: "default",
        metaLabel: role === "assistant" ? "AI 私教" : "你",
        planSuggestion: isPlainObject(item?.metadata?.plan_suggestion) ? item.metadata.plan_suggestion : null
      };
    })
    .filter(Boolean);
}

function normalizeSessionHistory(sourceSessions) {
  return (Array.isArray(sourceSessions) ? sourceSessions : [])
    .map((session) => ({
      id: normalizeText(session?.id),
      title: normalizeText(session?.title).slice(0, 30) || "未命名对话",
      status: normalizeText(session?.status) || "archived",
      created_at: normalizeText(session?.created_at),
      updated_at: normalizeText(session?.updated_at),
      last_message_at: normalizeText(session?.last_message_at),
      message_count: Number.isFinite(Number(session?.message_count)) ? Math.max(0, Math.round(Number(session.message_count))) : 0,
      preview: normalizeText(session?.preview).slice(0, 80)
    }))
    .filter((session) => session.id)
    .sort((left, right) => {
      const leftTime = Date.parse(left.last_message_at || left.updated_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.last_message_at || right.updated_at || right.created_at || "") || 0;
      return rightTime - leftTime;
    });
}

function buildRecentMessagesPayload(sourceMessages) {
  return (Array.isArray(sourceMessages) ? sourceMessages : [])
    .filter((item) => item?.tone !== "error")
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content),
      plan_suggestion: isPlainObject(item?.planSuggestion) ? item.planSuggestion : null
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-MAX_RECENT_MESSAGES);
}

function formatCurrentTime(date = new Date()) {
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatInsightUpdatedAt(value) {
  const date = new Date(Number(value || 0));
  if (!Number.isFinite(date.getTime())) return "";
  return `上次更新于 ${formatCurrentTime(date)}`;
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return formatCurrentTime();
  return formatCurrentTime(date);
}

function formatHistoryTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "刚刚";

  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs >= 0 && diffMs < minuteMs) return "刚刚";
  if (diffMs >= 0 && diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / minuteMs))} 分钟前`;
  if (diffMs >= 0 && diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))} 小时前`;
  if (diffMs >= 0 && diffMs < 7 * dayMs) return `${Math.max(1, Math.floor(diffMs / dayMs))} 天前`;

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}-${day}`;
}

function renderMessageContent(value) {
  return parseAgentContent(value);
}

function handleComposerKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;

  event.preventDefault();
  if (composerDisabled.value || !draft.value.trim()) return;
  void handleSubmit();
}

function handleAvatarError() {
  avatarLoadFailed.value = true;
}

function normalizeReadableText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/[�]/.test(normalized)) return "";
  if (/(?:绉|璇|寤|浠|鍒|鏃|鐢|缁|浜|鍙|噺|诲|堪|粌|槸)/.test(normalized)) return "";
  return normalized;
}

function formatOptionalMetric(value) {
  if (value === null || value === undefined) return "待识别";
  const normalized = normalizeReadableText(value);
  if (!normalized || normalized.toLowerCase() === "null" || normalized.toLowerCase() === "nan") return "待识别";
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<template>
  <AITutorLoading
    v-if="isWarmShellState"
    :mode="agentWorkspaceState"
    :user-id="userDisplayName"
    :user-initial="userInitial"
    :user-avatar-url="userAvatarUrl"
    :show-user-avatar="showUserAvatar"
    :nav-items="agentLoadingNavItems"
    :steps="agentWarmShellSteps"
    :feature-items="agentWarmShellFeatures"
    :progress-percent="agentWarmShellProgressPercent"
    :title="agentWarmShellTitle"
    :subtitle="agentWarmShellSubtitle"
    :progress-note="agentWarmShellProgressNote"
    :primary-action-label="agentWarmPrimaryActionLabel"
    :primary-action-loading-label="agentWarmPrimaryActionLoadingLabel"
    :primary-action-loading="pending"
    :secondary-action-label="agentWarmSecondaryActionLabel"
    @avatar-error="handleAvatarError"
    @primary-action="handleWarmShellPrimaryAction"
    @secondary-action="handleWarmShellSecondaryAction"
  />
  <AIWorkspace
    v-else-if="!isWarmShellState"
    v-model:draft="draft"
    :nav-items="navItems"
    :user-display-name="userDisplayName"
    :user-initial="userInitial"
    :user-avatar-url="userAvatarUrl"
    :show-user-avatar="showUserAvatar"
    :workspace-state="agentWorkspaceState"
    :workspace-status-label="workspaceStatusLabel"
    :workbench-title="workbenchTitle"
    :workbench-description="workbenchDescription"
    :can-use-agent="canUseAgent"
    :pending="aiResponding"
    :composer-disabled="composerDisabled"
    :messages="messages"
    :session-history="displayAgentSessionHistory"
    :history-loading="agentHistoryLoading"
    :history-error="agentHistoryError"
    :history-switching="historyBusy"
    :deleting-session-id="deletingAgentSessionId"
    :overview-stats="overviewStats"
    :practice-overview-rows="practiceOverviewRows"
    :capability-cards="capabilityCards"
    :quick-actions="quickActions"
    :agent-toast="agentToast"
    :daily-conclusion="dailyConclusion"
    :conclusion-panel-state="conclusionPanelState"
    :conclusion-unavailable-message="conclusionUnavailableMessage"
    :conclusion-refreshing="dailySuggestionState.refreshing"
    :conclusion-retrying="dailySuggestionState.retrying"
    :conclusion-status-note="dailyConclusionStatusNote"
    :display-plan-items="displayPlanItems"
    :display-plan-total-minutes="displayPlanTotalMinutes"
    :has-executable-plan="hasExecutablePlan"
    :has-saved-executable-plan="hasSavedExecutablePlan"
    :is-plan-complete="isPlanComplete"
    :plan-panel-state="planPanelState"
    :plan-progress-percentage="planProgressPercentage"
    :plan-progress-display="planProgressDisplay"
    :plan-progress-aria-label="planProgressAriaLabel"
    :plan-status-message="planStatusMessage"
    :plan-unavailable-title="planUnavailableTitle"
    :plan-unavailable-message="planUnavailableMessage"
    :plan-saving="planState.saving"
    :plan-loading="planState.loading"
    :plan-refreshing="planState.refreshing"
    :plan-retrying="planState.retrying"
    :start-training-label="startTrainingLabel"
    :remaining-plan-minutes="remainingPlanMinutes"
    :recommended-questions="recommendedQuestions"
    :question-panel-state="questionPanelState"
    :question-unavailable-message="questionUnavailableMessage"
    :insight-status-text="insightStatusText"
    :plan-attach-status="planAttachStatus"
    @submit="handleSubmit"
    @quick-action="handleQuickAction"
    @feature-select="handleCapabilitySelect"
    @restart-conversation="handleRestartConversation"
    @delete-history="handleDeleteHistory"
    @session-select="handleSessionHistorySelect"
    @delete-session="handleDeleteSessionHistory"
    @avatar-error="handleAvatarError"
    @conclusion-detail="handleConclusionDetail"
    @retry-conclusion="handleRetryDailySuggestion"
    @retry-plan="handleRetryExecutablePlan"
    @generate-plan="handleGeneratePlanFromPlanCard"
    @start-training="handleStartTraining"
    @plan-item-click="handlePlanItemClick"
    @recommended-question="handleRecommendedQuestion"
    @attach-plan="handleAttachPlan"
  />
  <div v-else class="agent-page">
    <aside class="agent-sidebar">
      <div class="agent-brand" aria-label="开口">
        <span class="agent-brand-mark" aria-hidden="true"></span>
        <strong>开口</strong>
      </div>

      <nav class="agent-nav" aria-label="AI 私教页面导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="agent-nav-item"
          :class="{ 'agent-nav-item--active': item.active }"
          type="button"
          @click="handleNav(item)"
        >
          <span class="agent-nav-icon" aria-hidden="true">
            <AgentIcon :name="item.icon" />
          </span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <section class="agent-resource-card" aria-label="PTE 备考资料包">
        <p class="agent-resource-title">PTE 备考资料包</p>
        <p class="agent-resource-copy">真题 · 高频词汇 · 模板</p>
        <button class="agent-resource-button" type="button">免费领取</button>
      </section>
    </aside>

    <main class="agent-shell">
      <header class="agent-topbar">
        <div class="agent-heading">
          <span class="agent-kicker">AI Tutor Workspace</span>
          <h1>AI 私教工作台</h1>
          <p>围绕你的练习记录，恢复主聊天、生成今日洞察，并把建议变成可执行训练。</p>
        </div>

        <div class="agent-top-actions">
          <span class="agent-status-pill" :class="`agent-status-pill--${agentWorkspaceState}`">
            <span aria-hidden="true"></span>
            {{ workspaceStatusLabel }}
          </span>

          <div class="agent-session-actions" v-if="canUseAgent">
            <button class="agent-soft-button" type="button" :disabled="pending" @click="handleRestartConversation">
              新对话
            </button>
            <button class="agent-soft-button agent-soft-button--danger" type="button" :disabled="pending" @click="handleDeleteHistory">
              清空历史
            </button>
          </div>

          <button class="agent-profile" type="button" @click="openPath('/profile')">
            <span class="agent-profile-avatar">
              <img v-if="showUserAvatar" :src="userAvatarUrl" alt="" @error="handleAvatarError" />
              <b v-else>{{ userInitial }}</b>
            </span>
            <strong>{{ userDisplayName }}</strong>
          </button>
        </div>
      </header>

      <section class="agent-workspace-grid" :class="{ 'agent-workspace-grid--single': !showInsightPanel }">
        <section class="agent-chat-workbench" :class="{ 'agent-chat-workbench--focus': !showInsightPanel }" aria-label="AI 私教聊天工作区">
          <p v-if="agentToast" class="agent-toast" role="status">{{ agentToast }}</p>

          <div class="agent-workbench-head">
            <div>
              <span class="agent-section-kicker">Main chat</span>
              <h2>{{ workbenchTitle }}</h2>
              <p>{{ workbenchDescription }}</p>
            </div>
            <div v-if="!isBlockingWorkspaceState" class="agent-workbench-meta" aria-label="聊天状态">
              <span>{{ isConversationEmpty ? "New thread" : `${messages.length} 条消息` }}</span>
              <strong>{{ currentAgentSessionId ? "Session ready" : "Local mode" }}</strong>
            </div>
          </div>

          <div v-if="isBlockingWorkspaceState" class="agent-state-screen" :class="`agent-state-screen--${agentWorkspaceState}`">
            <div class="agent-state-card">
              <div class="agent-state-hero">
                <span class="agent-state-icon" :class="{ 'agent-state-icon--loading': agentWorkspaceState === 'restoring' }" aria-hidden="true">
                  <AgentIcon :name="workspaceStateMeta.icon" />
                </span>
                <span class="agent-section-kicker">{{ workspaceStateMeta.eyebrow }}</span>
                <h2>{{ workspaceStateMeta.title }}</h2>
                <p>{{ workspaceStateMeta.description }}</p>
              </div>

              <div v-if="agentWorkspaceState === 'restoring'" class="agent-restore-grid" aria-label="恢复进度">
                <article v-for="(item, index) in restoreChecklist" :key="item.id" class="agent-restore-step">
                  <span :class="{ 'agent-restore-step-dot--active': index < 2 }" class="agent-restore-step-dot" aria-hidden="true">
                    <AgentIcon :name="index < 1 ? 'check' : 'loader'" />
                  </span>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.copy }}</p>
                </article>
              </div>

              <ul v-else-if="agentWorkspaceState === 'locked'" class="agent-lock-list">
                <li v-for="feature in vipLockFeatures" :key="feature">
                  <AgentIcon name="check" />
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <p v-if="stateSupportText" class="agent-state-note">{{ stateSupportText }}</p>

              <div v-if="workspaceStateMeta.primaryLabel || workspaceStateMeta.secondaryLabel" class="agent-state-actions">
                <button
                  v-if="workspaceStateMeta.primaryLabel"
                  class="agent-primary-button"
                  type="button"
                  :disabled="pending"
                  @click="handleWorkspacePrimaryAction"
                >
                  {{ pending && agentWorkspaceState === 'failed' ? "检查中..." : workspaceStateMeta.primaryLabel }}
                </button>
                <button
                  v-if="workspaceStateMeta.secondaryLabel"
                  class="agent-secondary-button"
                  type="button"
                  :disabled="pending && agentWorkspaceState !== 'locked'"
                  @click="handleWorkspaceSecondaryAction"
                >
                  {{ workspaceStateMeta.secondaryLabel }}
                </button>
              </div>
            </div>
          </div>

          <template v-else>
            <div v-if="isConversationEmpty" class="agent-empty-workspace">
              <section class="agent-empty-intro" aria-label="AI 私教空状态欢迎">
                <div class="agent-empty-copy">
                  <span class="agent-empty-badge">
                    <AgentIcon name="spark" />
                    准备就绪
                  </span>
                  <h2>从一个真实问题开始，AI 会把它变成下一步训练。</h2>
                  <p>这里是主入口。你可以直接输入，也可以先让 AI 读取近期练习，生成今日优先级和训练动作。</p>
                  <p class="agent-empty-entry-note">下方输入框会保留上下文；快捷入口只是帮你更快开始。</p>
                </div>
                <div class="agent-empty-visual" aria-hidden="true">
                  <img src="/agent/hero-workstation.png" alt="" />
                  <div class="agent-empty-orbit agent-empty-orbit--one">Practice logs</div>
                  <div class="agent-empty-orbit agent-empty-orbit--two">AI plan</div>
                </div>
              </section>

              <section class="agent-stats-row" aria-label="训练概览">
                <article v-for="stat in overviewStats" :key="stat.label" class="agent-stat-item">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                  <p>{{ stat.helper }}</p>
                </article>
              </section>

              <section class="agent-capability-grid" aria-label="AI 私教能力">
                <article v-for="item in capabilityCards" :key="item.id" class="agent-capability-item">
                  <span aria-hidden="true"><AgentIcon :name="item.icon" /></span>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.text }}</p>
                </article>
              </section>
            </div>

            <div v-else ref="messagesBodyRef" class="agent-message-list">
              <div
                v-for="message in messages"
                :key="message.id"
                class="agent-message"
                :class="message.role === 'user' ? 'agent-message--user' : 'agent-message--assistant'"
              >
                <img
                  v-if="message.role === 'assistant'"
                  class="agent-message-avatar agent-message-avatar--assistant"
                  src="/agent/assistant-avatar.png"
                  alt="AI 私教头像"
                />

                <div class="agent-message-stack">
                  <label v-if="message.role === 'assistant'" class="agent-message-label">{{ message.metaLabel }}</label>
                  <div class="agent-bubble" :class="{ 'agent-bubble--error': message.tone === 'error' }">
                    <div class="agent-bubble-content">
                      <template v-for="(block, blockIndex) in renderMessageContent(message.content)" :key="`${message.id}-${blockIndex}`">
                        <p v-if="block.type === 'paragraph'" class="agent-bubble-paragraph">
                          {{ block.text }}
                        </p>

                        <div v-else-if="block.type === 'table'" class="agent-table-wrap">
                          <table class="agent-table">
                            <thead>
                              <tr>
                                <th
                                  v-for="(header, headerIndex) in block.headers"
                                  :key="`${message.id}-${blockIndex}-header-${headerIndex}`"
                                >
                                  {{ header }}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="(row, rowIndex) in block.rows"
                                :key="`${message.id}-${blockIndex}-row-${rowIndex}`"
                              >
                                <td
                                  v-for="(cell, cellIndex) in row"
                                  :key="`${message.id}-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`"
                                >
                                  {{ cell }}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </template>
                    </div>
                    <time>{{ message.time }}</time>
                  </div>

                  <div v-if="message.role === 'assistant' && message.planSuggestion" class="agent-plan-suggestion-actions">
                    <button
                      type="button"
                      class="agent-plan-suggestion-button"
                      :class="{ 'agent-plan-suggestion-button--saved': getPlanAttachStatus(message).state === 'saved' }"
                      :disabled="planState.saving || getPlanAttachStatus(message).state === 'saved'"
                      @click="handleAttachPlan(message)"
                    >
                      {{
                        getPlanAttachStatus(message).state === 'saving'
                          ? '正在接入...'
                          : getPlanAttachStatus(message).state === 'saved'
                            ? '已接入今日计划'
                            : '一键接入可执行计划'
                      }}
                    </button>
                    <p
                      v-if="getPlanAttachStatus(message).message && getPlanAttachStatus(message).state === 'error'"
                      class="agent-plan-suggestion-error"
                    >
                      {{ getPlanAttachStatus(message).message }}
                    </p>
                  </div>
                </div>

                <span v-if="message.role === 'user'" class="agent-message-avatar agent-message-avatar--user" aria-hidden="true">
                  {{ userInitial }}
                </span>
              </div>

              <div v-if="aiResponding" class="agent-message agent-message--assistant agent-message--thinking" aria-live="polite" aria-label="AI 私教思考中">
                <img class="agent-message-avatar agent-message-avatar--assistant" src="/agent/assistant-avatar.png" alt="AI 私教头像" />
                <div class="agent-message-stack">
                  <label class="agent-message-label">AI 私教</label>
                  <div class="agent-bubble agent-bubble--pending">
                    <div class="agent-typing-indicator">
                      <span class="agent-typing-label">思考中</span>
                      <span class="agent-typing-dots" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer class="agent-composer-zone">
              <div class="agent-quick-actions" aria-label="快捷操作">
                <button
                  v-for="action in quickActions"
                  :key="action.id"
                  class="agent-quick-button"
                  type="button"
                  :disabled="composerDisabled"
                  @click="handleQuickAction(action)"
                >
                  <AgentIcon :name="action.icon" />
                  <span>{{ action.label }}</span>
                </button>
              </div>

              <form class="agent-composer" @submit.prevent="handleSubmit()">
                <textarea
                  v-model="draft"
                  rows="1"
                  class="agent-composer-input"
                  :placeholder="canUseAgent ? '问 AI：我今天该先练什么？或选择上方快捷操作...' : '恢复聊天完成后可输入问题'"
                  :disabled="composerDisabled"
                  @keydown="handleComposerKeydown"
                ></textarea>
                <button class="agent-composer-send" type="submit" :disabled="composerDisabled || !draft.trim()" aria-label="发送">
                  <AgentIcon name="send" />
                </button>
              </form>

              <p class="agent-disclaimer">AI 内容仅供参考，请结合个人实际情况判断。</p>
            </footer>
          </template>
        </section>

        <aside v-if="showInsightPanel" class="agent-insight-panel" aria-label="AI 私教简报">
          <div class="agent-insight-head">
            <div>
              <span class="agent-section-kicker">Insight system</span>
              <h2>AI 私教简报</h2>
            </div>
            <span class="agent-insight-status">{{ insightStatusText }}</span>
          </div>

          <section class="agent-insight-section">
            <div class="agent-side-title">
              <span aria-hidden="true"><AgentIcon name="spark" /></span>
              <div>
                <h3>今日 AI 结论</h3>
                <p>{{ dailyConclusion.label }}</p>
              </div>
            </div>

            <div v-if="conclusionPanelState === 'loading'" class="agent-skeleton-stack" aria-label="今日结论加载中">
              <span></span>
              <span></span>
              <span></span>
              <p class="agent-skeleton-note">正在生成今日洞察...</p>
            </div>
            <div v-else-if="conclusionPanelState === 'ready'" class="agent-conclusion-copy">
              <strong>{{ dailyConclusion.title }}</strong>
              <p>{{ dailyConclusion.summary }}</p>
              <button type="button" class="agent-inline-action" :disabled="pending" @click="handleConclusionDetail">
                {{ dailyConclusion.cta }}
                <AgentIcon name="chevron-right" />
              </button>
            </div>
            <div v-else class="agent-unavailable-box">
              <strong>暂不可用</strong>
              <p>{{ conclusionUnavailableMessage }}</p>
              <button
                v-if="dailySuggestionState.error && canUseAgent"
                type="button"
                class="agent-inline-action agent-inline-action--compact"
                :disabled="dailySuggestionState.loading"
                @click="handleRetryDailySuggestion"
              >
                重试今日洞察
              </button>
            </div>
          </section>

          <section class="agent-insight-section">
            <div class="agent-side-title">
              <span aria-hidden="true"><AgentIcon name="plan" /></span>
              <div>
                <h3>AI 可执行计划</h3>
                <p>{{ hasSavedExecutablePlan ? `剩余 ${remainingPlanMinutes} 分钟` : "训练动作与进度" }}</p>
              </div>
              <div class="agent-progress-ring" :style="{ '--agent-plan-progress': `${planProgressPercentage * 3.6}deg` }" :aria-label="planProgressAriaLabel">
                {{ planProgressDisplay }}
              </div>
            </div>

            <div v-if="planPanelState === 'loading'" class="agent-skeleton-stack" aria-label="计划加载中">
              <span></span>
              <span></span>
              <span></span>
              <p class="agent-skeleton-note">正在同步今日计划...</p>
            </div>
            <div v-else-if="planPanelState === 'ready'" class="agent-plan-block">
              <div class="agent-plan-summary">
                <span>{{ hasSavedExecutablePlan ? "今日计划" : "AI 建议草案" }}</span>
                <strong>{{ displayPlanTotalMinutes || "--" }} 分钟</strong>
              </div>
              <div class="agent-plan-list">
                <button
                  v-for="(item, index) in displayPlanItems"
                  :key="`${item.task_type}-${item.label}-${index}`"
                  type="button"
                  class="agent-plan-row"
                  :disabled="item.is_complete || planState.saving"
                  @click="handlePlanItemClick(item)"
                >
                  <span class="agent-plan-check" :class="{ 'agent-plan-check--done': item.is_complete }" aria-hidden="true">
                    <AgentIcon v-if="item.is_complete" name="check" />
                  </span>
                  <span class="agent-plan-tag" :style="{ backgroundColor: item.color }">{{ item.task_type }}</span>
                  <span class="agent-plan-main">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.focus }}</small>
                  </span>
                  <span class="agent-plan-count">
                    <template v-if="hasSavedExecutablePlan">{{ item.effective_completed_count || 0 }}/{{ item.target_count || item.count }}</template>
                    <template v-else>{{ item.count }} 次</template>
                  </span>
                </button>
              </div>
              <p v-if="planStatusMessage" class="agent-plan-source">{{ planStatusMessage }}</p>
              <button
                class="agent-primary-button agent-primary-button--wide"
                type="button"
                :disabled="planState.loading || planState.saving || isPlanComplete"
                @click="handleStartTraining"
              >
                {{ startTrainingLabel }}
              </button>
            </div>
            <div v-else class="agent-unavailable-box">
              <strong>暂无可执行计划</strong>
              <p>{{ planUnavailableMessage }}</p>
              <button
                v-if="planState.error && canUseAgent"
                type="button"
                class="agent-inline-action agent-inline-action--compact"
                :disabled="planState.loading"
                @click="handleRetryExecutablePlan"
              >
                重试今日计划
              </button>
            </div>
          </section>

          <section class="agent-insight-section agent-insight-section--last">
            <div class="agent-side-title">
              <span aria-hidden="true"><AgentIcon name="chat" /></span>
              <div>
                <h3>推荐追问</h3>
                <p>继续把建议问到可执行</p>
              </div>
            </div>

            <div v-if="questionPanelState === 'ready'" class="agent-question-list">
              <button
                v-for="item in recommendedQuestions"
                :key="item.text"
                type="button"
                class="agent-question-item"
                :disabled="pending"
                @click="handleRecommendedQuestion(item)"
              >
                <span>{{ item.text }}</span>
                <AgentIcon name="chevron-right" />
              </button>
            </div>
            <div v-else class="agent-unavailable-box">
              <strong>追问暂不可用</strong>
              <p>{{ questionUnavailableMessage }}</p>
            </div>
          </section>
        </aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.agent-page {
  --agent-bg: #f7f5ff;
  --agent-bg-soft: #edf8fb;
  --agent-surface: rgba(255, 255, 255, 0.82);
  --agent-surface-strong: rgba(255, 255, 255, 0.94);
  --agent-border: rgba(193, 201, 233, 0.74);
  --agent-border-soft: rgba(216, 224, 244, 0.72);
  --agent-text: #0e1934;
  --agent-muted: #687795;
  --agent-faint: #8a98b4;
  --agent-primary: #5b5cf6;
  --agent-primary-strong: #3840d2;
  --agent-secondary: #13a7a8;
  --agent-violet: #7c3aed;
  --agent-teal: #16a6b1;
  --agent-amber: #d78a1f;
  --agent-danger: #ba4a4a;
  --agent-shadow: 0 24px 70px rgba(36, 55, 105, 0.13);
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: hidden;
  color: var(--agent-text);
  background:
    linear-gradient(135deg, rgba(242, 247, 255, 0.96) 0%, rgba(250, 253, 255, 0.92) 42%, rgba(247, 243, 255, 0.9) 72%, rgba(239, 250, 250, 0.86) 100%),
    linear-gradient(180deg, #fbfdff 0%, var(--agent-bg) 100%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
}

.agent-page::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(75, 104, 170, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(75, 104, 170, 0.05) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.58), transparent 76%);
}

.agent-sidebar,
.agent-shell {
  position: relative;
  z-index: 1;
}

.agent-page * {
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 137, 180, 0.34) transparent;
}

.agent-page *::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.agent-page *::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(120, 137, 180, 0.34);
  background-clip: padding-box;
}

.agent-page *::-webkit-scrollbar-track {
  background: transparent;
}

.agent-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  height: 100vh;
  padding: 28px 18px;
  border-right: 1px solid rgba(212, 224, 245, 0.82);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
}

.agent-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px 22px;
}

.agent-brand strong {
  color: #10172e;
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
}

.agent-brand-mark {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--agent-primary), var(--agent-violet));
  box-shadow: 0 16px 32px rgba(55, 88, 246, 0.24);
}

.agent-brand-mark::before {
  content: "";
  position: absolute;
  left: 13px;
  top: 11px;
  width: 16px;
  height: 21px;
  border: 8px solid #fff;
  border-right: 0;
  border-radius: 12px 0 0 12px;
}

.agent-brand-mark::after {
  content: "";
  position: absolute;
  right: 9px;
  bottom: 9px;
  width: 15px;
  height: 15px;
  border-radius: 5px;
  background: #fff;
}

.agent-nav {
  display: grid;
  gap: 8px;
}

.agent-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 0 14px;
  background: transparent;
  color: #60708f;
  font: inherit;
  font-size: 15px;
  font-weight: 760;
  text-align: left;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.agent-nav-item:hover {
  transform: translateY(-1px);
  border-color: rgba(203, 216, 244, 0.86);
  background: rgba(255, 255, 255, 0.78);
  color: #26375e;
}

.agent-nav-item--active {
  border-color: rgba(70, 101, 245, 0.26);
  background: linear-gradient(135deg, rgba(238, 243, 255, 0.96), rgba(245, 241, 255, 0.88));
  color: var(--agent-primary-strong);
  box-shadow: 0 14px 26px rgba(54, 84, 190, 0.08);
}

.agent-nav-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 20px;
  color: currentColor;
}

.agent-resource-card {
  margin-top: auto;
  overflow: hidden;
  border: 1px solid rgba(196, 212, 244, 0.84);
  border-radius: 18px;
  padding: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(241, 249, 250, 0.86)),
    linear-gradient(90deg, rgba(91, 92, 246, 0.09), rgba(215, 138, 31, 0.08));
  box-shadow: 0 16px 34px rgba(42, 64, 120, 0.08);
}

.agent-resource-title,
.agent-resource-copy {
  margin: 0;
}

.agent-resource-title {
  font-size: 16px;
  font-weight: 850;
}

.agent-resource-copy {
  margin-top: 8px;
  color: var(--agent-muted);
  font-size: 12px;
  font-weight: 680;
}

.agent-resource-button {
  min-height: 38px;
  margin-top: 16px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: linear-gradient(135deg, var(--agent-primary), var(--agent-violet));
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 780;
  cursor: pointer;
  box-shadow: 0 14px 24px rgba(55, 88, 246, 0.22);
}

.agent-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100vh;
  overflow: hidden;
  padding: 18px clamp(18px, 2.2vw, 42px) 18px;
}

.agent-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  max-width: 2360px;
  width: 100%;
  flex: 0 0 auto;
  margin: 0 auto 16px;
}

.agent-heading {
  min-width: 0;
}

.agent-kicker,
.agent-section-kicker {
  display: inline-flex;
  align-items: center;
  color: var(--agent-primary);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.agent-heading h1,
.agent-workbench-head h2,
.agent-insight-head h2,
.agent-state-hero h2,
.agent-empty-intro h2 {
  margin: 0;
  letter-spacing: 0;
}

.agent-heading h1 {
  margin-top: 5px;
  font-size: 34px;
  font-weight: 900;
  line-height: 1.15;
}

.agent-heading p {
  max-width: 760px;
  margin: 9px 0 0;
  color: #61708e;
  font-size: 14px;
  font-weight: 660;
  line-height: 1.65;
}

.agent-top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: max-content;
}

.agent-session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-status-pill,
.agent-insight-status {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  border: 1px solid rgba(199, 212, 242, 0.8);
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(255, 255, 255, 0.72);
  color: #40517a;
  font-size: 12px;
  font-weight: 820;
  white-space: nowrap;
}

.agent-status-pill span {
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 999px;
  background: #9aa9c5;
}

.agent-status-pill--restoring span {
  background: var(--agent-primary);
  animation: agentPulse 1.1s ease-in-out infinite;
}

.agent-status-pill--empty span,
.agent-status-pill--chat span {
  background: #22aa82;
}

.agent-status-pill--locked span,
.agent-status-pill--failed span,
.agent-status-pill--unavailable span {
  background: var(--agent-amber);
}

.agent-soft-button,
.agent-profile {
  min-height: 38px;
  border: 1px solid rgba(199, 212, 242, 0.82);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  color: #40517a;
  font: inherit;
  font-size: 12px;
  font-weight: 820;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.agent-soft-button {
  padding: 0 13px;
}

.agent-soft-button:hover,
.agent-profile:hover {
  transform: translateY(-1px);
  border-color: rgba(82, 111, 246, 0.32);
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 12px 26px rgba(47, 69, 132, 0.08);
}

.agent-soft-button:disabled,
.agent-primary-button:disabled,
.agent-secondary-button:disabled,
.agent-inline-action:disabled,
.agent-quick-button:disabled,
.agent-plan-row:disabled,
.agent-question-item:disabled,
.agent-composer-send:disabled {
  cursor: not-allowed;
  opacity: 0.56;
  transform: none;
}

.agent-soft-button--danger {
  color: var(--agent-danger);
  border-color: rgba(217, 162, 162, 0.8);
}

.agent-profile {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px 0 6px;
}

.agent-profile-avatar,
.agent-message-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  flex: 0 0 auto;
}

.agent-profile-avatar {
  width: 30px;
  height: 30px;
  background: linear-gradient(135deg, #edf3ff, #e7e4ff);
  color: var(--agent-primary);
  font-size: 13px;
  font-weight: 900;
}

.agent-profile-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-profile strong {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 22px;
  align-items: stretch;
  width: 100%;
  max-width: 2360px;
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 auto;
}

.agent-workspace-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.agent-chat-workbench,
.agent-insight-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--agent-border);
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(250, 253, 255, 0.76)),
    linear-gradient(135deg, rgba(91, 92, 246, 0.05), rgba(19, 167, 168, 0.04));
  box-shadow: var(--agent-shadow);
  backdrop-filter: blur(20px);
}

.agent-chat-workbench {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.agent-chat-workbench--focus {
  max-width: 1180px;
  width: 100%;
  justify-self: center;
}

.agent-workbench-head,
.agent-insight-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(207, 219, 242, 0.76);
  flex: 0 0 auto;
  padding: 18px 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(248, 251, 255, 0.48));
}

.agent-workbench-head h2,
.agent-insight-head h2 {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.22;
}

.agent-workbench-head > div:first-child p {
  max-width: 680px;
  margin: 4px 0 0;
  color: var(--agent-muted);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.55;
  text-align: left;
}

.agent-workbench-meta {
  display: grid;
  gap: 4px;
  min-width: 146px;
  border: 1px solid rgba(205, 216, 242, 0.78);
  border-radius: 16px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.68);
  text-align: right;
}

.agent-workbench-meta span {
  color: var(--agent-faint);
  font-size: 11px;
  font-weight: 760;
}

.agent-workbench-meta strong {
  color: #263757;
  font-size: 12px;
  font-weight: 900;
}

.agent-toast {
  position: absolute;
  top: 18px;
  left: 50%;
  z-index: 10;
  margin: 0;
  transform: translateX(-50%);
  border: 1px solid rgba(73, 190, 160, 0.28);
  border-radius: 999px;
  padding: 9px 14px;
  background: rgba(240, 255, 250, 0.96);
  color: #13795d;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 14px 28px rgba(23, 121, 93, 0.1);
}

.agent-state-screen {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 28px;
  background:
    linear-gradient(135deg, rgba(239, 246, 255, 0.72), rgba(249, 246, 255, 0.72)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.76));
}

.agent-state-card {
  width: min(940px, 100%);
  border: 1px solid rgba(199, 211, 241, 0.82);
  border-radius: 30px;
  padding: clamp(22px, 2.5vw, 34px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(246, 251, 255, 0.7)),
    linear-gradient(135deg, rgba(91, 92, 246, 0.08), rgba(19, 167, 168, 0.06));
  box-shadow: 0 24px 56px rgba(42, 60, 115, 0.1);
}

.agent-state-hero {
  width: min(720px, 100%);
  text-align: center;
}

.agent-state-icon {
  display: inline-grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
  border: 1px solid rgba(106, 130, 242, 0.2);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(234, 243, 255, 0.9));
  color: var(--agent-primary);
  font-size: 34px;
  box-shadow: 0 20px 44px rgba(70, 94, 170, 0.13);
}

.agent-state-icon--loading {
  animation: agentSpin 1.5s linear infinite;
}

.agent-state-hero h2 {
  margin-top: 10px;
  font-size: 32px;
  font-weight: 930;
  line-height: 1.15;
}

.agent-state-hero p {
  max-width: 680px;
  margin: 10px auto 0;
  color: #5f6f90;
  font-size: 15px;
  font-weight: 620;
  line-height: 1.8;
}

.agent-restore-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: min(820px, 100%);
  gap: 12px;
  margin-top: 26px;
}

.agent-restore-step {
  border: 1px solid rgba(204, 216, 242, 0.86);
  border-radius: 20px;
  padding: 17px;
  background: rgba(255, 255, 255, 0.74);
  text-align: left;
  box-shadow: 0 14px 32px rgba(45, 66, 125, 0.06);
}

.agent-restore-step-dot {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  margin-bottom: 12px;
  background: rgba(236, 241, 252, 0.9);
  color: #7a8aa8;
}

.agent-restore-step-dot--active {
  background: rgba(228, 238, 255, 0.96);
  color: var(--agent-primary);
}

.agent-restore-step strong,
.agent-lock-list span,
.agent-stat-item strong,
.agent-capability-item strong,
.agent-conclusion-copy strong,
.agent-unavailable-box strong {
  display: block;
}

.agent-restore-step strong {
  font-size: 14px;
  font-weight: 850;
}

.agent-restore-step p {
  margin: 6px 0 0;
  color: var(--agent-muted);
  font-size: 12px;
  font-weight: 620;
  line-height: 1.55;
}

.agent-lock-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: min(640px, 100%);
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.agent-lock-list li {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  border: 1px solid rgba(209, 220, 243, 0.78);
  border-radius: 14px;
  padding: 0 13px;
  background: rgba(255, 255, 255, 0.72);
  color: #40517a;
  font-size: 13px;
  font-weight: 760;
}

.agent-lock-list svg {
  color: #18a67d;
  font-size: 16px;
}

.agent-state-note {
  width: min(640px, 100%);
  margin: 16px auto 0;
  border: 1px solid rgba(203, 216, 244, 0.78);
  border-radius: 16px;
  padding: 11px 14px;
  background: rgba(255, 255, 255, 0.66);
  color: #61708e;
  font-size: 12px;
  font-weight: 720;
  line-height: 1.55;
  text-align: center;
}

.agent-state-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;
}

.agent-primary-button,
.agent-secondary-button,
.agent-inline-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font: inherit;
  font-weight: 860;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
}

.agent-primary-button {
  min-height: 44px;
  border: 0;
  padding: 0 20px;
  background: linear-gradient(135deg, var(--agent-primary), var(--agent-violet));
  color: #fff;
  box-shadow: 0 16px 28px rgba(54, 88, 246, 0.22);
}

.agent-primary-button:hover:not(:disabled),
.agent-secondary-button:hover:not(:disabled),
.agent-inline-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.agent-primary-button--wide {
  width: 100%;
}

.agent-secondary-button {
  min-height: 44px;
  border: 1px solid rgba(199, 212, 242, 0.9);
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.74);
  color: #41527b;
}

.agent-empty-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 18px;
  min-height: 0;
  padding: 18px;
  overflow: auto;
}

.agent-empty-intro {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 22px;
  align-items: center;
  min-height: 220px;
  border: 1px solid rgba(203, 216, 244, 0.82);
  border-radius: 24px;
  padding: 22px;
  background:
    linear-gradient(135deg, rgba(238, 245, 255, 0.9), rgba(248, 245, 255, 0.72) 55%, rgba(237, 250, 250, 0.72)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.48));
}

.agent-empty-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.agent-empty-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border: 1px solid rgba(66, 96, 245, 0.18);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.66);
  color: var(--agent-primary);
  font-size: 12px;
  font-weight: 850;
}

.agent-empty-badge svg {
  font-size: 16px;
}

.agent-empty-intro h2 {
  max-width: 780px;
  margin-top: 14px;
  font-size: 30px;
  font-weight: 930;
  line-height: 1.18;
}

.agent-empty-intro p {
  max-width: 660px;
  margin: 12px 0 0;
  color: #60708f;
  font-size: 15px;
  font-weight: 630;
  line-height: 1.75;
}

.agent-empty-entry-note {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  margin-top: 14px !important;
  border: 1px solid rgba(203, 216, 244, 0.82);
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.62);
  color: #50607f !important;
  font-size: 12px !important;
  font-weight: 760 !important;
  line-height: 1.35 !important;
}

.agent-empty-visual {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  height: 190px;
  border: 1px solid rgba(197, 212, 243, 0.72);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(230, 243, 246, 0.78));
}

.agent-empty-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-empty-visual::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 52%, rgba(15, 23, 42, 0.16));
  pointer-events: none;
}

.agent-empty-orbit {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.74);
  color: #394967;
  font-size: 11px;
  font-weight: 850;
  box-shadow: 0 12px 22px rgba(32, 53, 102, 0.1);
  backdrop-filter: blur(12px);
}

.agent-empty-orbit--one {
  left: 12px;
  top: 14px;
}

.agent-empty-orbit--two {
  right: 12px;
  bottom: 14px;
  color: var(--agent-primary-strong);
}

.agent-stats-row,
.agent-capability-grid {
  display: grid;
  gap: 12px;
}

.agent-stats-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.agent-stat-item,
.agent-capability-item {
  border: 1px solid rgba(207, 219, 242, 0.8);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 14px 30px rgba(45, 66, 125, 0.06);
}

.agent-stat-item {
  padding: 16px;
}

.agent-stat-item span {
  color: var(--agent-faint);
  font-size: 12px;
  font-weight: 760;
}

.agent-stat-item strong {
  margin-top: 7px;
  font-size: 23px;
  font-weight: 920;
}

.agent-stat-item p,
.agent-capability-item p {
  margin: 6px 0 0;
  color: var(--agent-muted);
  font-size: 12px;
  font-weight: 620;
  line-height: 1.55;
}

.agent-capability-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.agent-capability-item {
  padding: 17px;
}

.agent-capability-item > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: rgba(231, 238, 255, 0.88);
  color: var(--agent-primary);
  font-size: 20px;
}

.agent-capability-item strong {
  font-size: 15px;
  font-weight: 850;
}

.agent-message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px;
  scroll-behavior: smooth;
}

.agent-message {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}

.agent-message--user {
  justify-content: flex-end;
}

.agent-message-avatar {
  width: 36px;
  height: 36px;
}

.agent-message-avatar--assistant {
  background: #eef4ff;
  border: 1px solid #d9e6ff;
}

.agent-message-avatar--user {
  background: linear-gradient(135deg, var(--agent-primary), var(--agent-secondary));
  color: #fff;
  font-size: 13px;
  font-weight: 900;
}

.agent-message-stack {
  display: grid;
  max-width: min(760px, 78%);
  min-width: 0;
  gap: 6px;
}

.agent-message-label {
  color: #75839e;
  font-size: 12px;
  font-weight: 780;
}

.agent-bubble {
  border: 1px solid rgba(203, 216, 244, 0.86);
  border-radius: 22px;
  padding: 15px 17px 12px;
  background: rgba(255, 255, 255, 0.78);
  color: #243351;
  box-shadow: 0 14px 32px rgba(48, 68, 123, 0.07);
}

.agent-message--user .agent-bubble {
  border-color: rgba(54, 88, 246, 0.28);
  background: linear-gradient(135deg, #4358f5, #7c3aed);
  color: #fff;
}

.agent-bubble--error {
  border-color: rgba(214, 128, 110, 0.48);
  background: rgba(255, 245, 242, 0.92);
  color: #884530;
}

.agent-bubble--pending {
  min-width: 96px;
  max-width: max-content;
  padding: 11px 14px;
  border-color: rgba(124, 92, 62, 0.18);
  background: rgba(245, 239, 228, 0.96);
}

.agent-typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #7c5c3e;
  font-size: 12px;
  font-weight: 650;
}

.agent-typing-label {
  line-height: 1;
}

.agent-typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}

.agent-typing-dots span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgba(124, 92, 62, 0.72);
  transform-origin: center bottom;
  animation: agentFallbackTypingDot 0.9s cubic-bezier(0.42, 0, 0.2, 1) infinite;
  will-change: transform, opacity;
}

.agent-typing-dots span:nth-child(2) { animation-delay: 0.14s; }
.agent-typing-dots span:nth-child(3) { animation-delay: 0.28s; }

@keyframes agentFallbackTypingDot {
  0%, 72%, 100% { transform: translateY(0) scale(0.72); opacity: 0.34; }
  28% { transform: translateY(-6px) scale(1.18); opacity: 1; }
  44% { transform: translateY(1px) scale(0.92); opacity: 0.62; }
}

@media (prefers-reduced-motion: reduce) {
  .agent-typing-dots span {
    animation: none;
    opacity: 0.72;
  }
}

.agent-bubble-paragraph {
  margin: 0;
  white-space: pre-wrap;
  font-size: 15px;
  font-weight: 550;
  line-height: 1.78;
}

.agent-bubble time {
  display: block;
  margin-top: 10px;
  color: currentColor;
  font-size: 11px;
  opacity: 0.58;
}

.agent-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(207, 219, 242, 0.9);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
}

.agent-table {
  min-width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.agent-table th,
.agent-table td {
  border-bottom: 1px solid rgba(220, 228, 244, 0.9);
  padding: 10px 12px;
  color: #263451;
  white-space: nowrap;
}

.agent-table th {
  background: #eef4ff;
  font-weight: 850;
}

.agent-plan-suggestion-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.agent-plan-suggestion-button {
  min-height: 34px;
  border: 1px solid rgba(52, 88, 246, 0.25);
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(239, 244, 255, 0.9);
  color: var(--agent-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}

.agent-plan-suggestion-button--saved {
  border-color: rgba(34, 170, 130, 0.32);
  background: rgba(239, 255, 249, 0.9);
  color: #158466;
}

.agent-plan-suggestion-error {
  margin: 0;
  color: var(--agent-danger);
  font-size: 12px;
  font-weight: 680;
}

.agent-composer-zone {
  border-top: 1px solid rgba(207, 219, 242, 0.76);
  padding: 14px 18px 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(248, 251, 255, 0.88)),
    linear-gradient(90deg, rgba(91, 92, 246, 0.04), rgba(19, 167, 168, 0.04));
}

.agent-quick-actions {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.agent-quick-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  border: 1px solid rgba(202, 215, 242, 0.88);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.74);
  color: #41527b;
  font: inherit;
  font-size: 12px;
  font-weight: 820;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}

.agent-quick-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(52, 88, 246, 0.3);
  background: rgba(245, 248, 255, 0.96);
}

.agent-quick-button svg {
  font-size: 15px;
}

.agent-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  align-items: end;
  gap: 10px;
  border: 1px solid rgba(177, 194, 235, 0.95);
  border-radius: 24px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72), 0 18px 38px rgba(47, 69, 132, 0.1);
}

.agent-composer:focus-within {
  border-color: rgba(52, 88, 246, 0.42);
  box-shadow: 0 0 0 4px rgba(52, 88, 246, 0.1), 0 14px 30px rgba(47, 69, 132, 0.08);
}

.agent-composer-input {
  width: 100%;
  min-height: 48px;
  max-height: 138px;
  resize: vertical;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--agent-text);
  font: inherit;
  font-size: 15px;
  font-weight: 560;
  line-height: 1.55;
}

.agent-composer-input::placeholder {
  color: #91a0bc;
}

.agent-composer-send {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--agent-primary), var(--agent-violet));
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 14px 24px rgba(54, 88, 246, 0.24);
}

.agent-disclaimer {
  margin: 10px 2px 0;
  color: #8a98b3;
  font-size: 11px;
  font-weight: 660;
}

.agent-insight-panel {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

.agent-insight-head {
  align-items: center;
}

.agent-insight-head h2 {
  font-size: 21px;
}

.agent-insight-section {
  position: relative;
  padding: 18px;
  border-bottom: 1px solid rgba(207, 219, 242, 0.72);
}

.agent-insight-section::before {
  content: "";
  position: absolute;
  left: 0;
  top: 18px;
  bottom: 18px;
  width: 3px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(91, 92, 246, 0.72), rgba(19, 167, 168, 0.62));
  opacity: 0.55;
}

.agent-insight-section--last {
  border-bottom: 0;
}

.agent-side-title {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
}

.agent-side-title > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(232, 238, 255, 0.96), rgba(235, 250, 250, 0.9));
  color: var(--agent-primary);
  font-size: 19px;
}

.agent-side-title h3,
.agent-side-title p {
  margin: 0;
}

.agent-side-title h3 {
  font-size: 15px;
  font-weight: 900;
}

.agent-side-title p {
  margin-top: 4px;
  color: var(--agent-faint);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.agent-skeleton-stack {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.agent-skeleton-stack span {
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(232, 240, 255, 0.82), rgba(248, 251, 255, 0.9), rgba(232, 240, 255, 0.82));
  background-size: 220% 100%;
  animation: agentShimmer 1.4s ease-in-out infinite;
}

.agent-skeleton-note {
  margin: 2px 0 0;
  color: #73819e;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.agent-conclusion-copy,
.agent-unavailable-box,
.agent-plan-block {
  margin-top: 14px;
}

.agent-conclusion-copy {
  border: 1px solid rgba(203, 216, 244, 0.82);
  border-radius: 20px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.72);
}

.agent-conclusion-copy strong {
  color: #172341;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.35;
}

.agent-conclusion-copy p {
  margin: 9px 0 0;
  color: #5f6e8e;
  font-size: 13px;
  font-weight: 620;
  line-height: 1.65;
}

.agent-inline-action {
  gap: 6px;
  min-height: 34px;
  margin-top: 13px;
  border: 1px solid rgba(52, 88, 246, 0.2);
  padding: 0 12px;
  background: rgba(239, 244, 255, 0.92);
  color: var(--agent-primary);
  font-size: 12px;
}

.agent-inline-action--compact {
  min-height: 32px;
  margin-top: 10px;
  padding: 0 11px;
}

.agent-unavailable-box {
  border: 1px dashed rgba(194, 208, 237, 0.95);
  border-radius: 18px;
  padding: 14px;
  background: rgba(248, 251, 255, 0.7);
}

.agent-unavailable-box strong {
  color: #445477;
  font-size: 14px;
  font-weight: 880;
}

.agent-unavailable-box p {
  margin: 7px 0 0;
  color: #73819e;
  font-size: 12px;
  font-weight: 620;
  line-height: 1.6;
}

.agent-progress-ring {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 999px;
  background:
    conic-gradient(var(--agent-primary) var(--agent-plan-progress), rgba(223, 231, 247, 0.95) 0),
    #fff;
  color: #344567;
  font-size: 12px;
  font-weight: 900;
  box-shadow: inset 0 0 0 7px rgba(255, 255, 255, 0.95);
}

.agent-plan-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(203, 216, 244, 0.82);
  border-radius: 18px;
  padding: 12px 14px;
  background: linear-gradient(135deg, rgba(239, 245, 255, 0.92), rgba(250, 248, 255, 0.86));
}

.agent-plan-summary span {
  color: #6d7c98;
  font-size: 12px;
  font-weight: 780;
}

.agent-plan-summary strong {
  font-size: 18px;
  font-weight: 930;
}

.agent-plan-list {
  display: grid;
  gap: 8px;
  margin-top: 11px;
}

.agent-plan-row,
.agent-question-item {
  border: 1px solid rgba(204, 217, 244, 0.86);
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}

.agent-plan-row {
  display: grid;
  grid-template-columns: 22px 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 58px;
  border-radius: 16px;
  padding: 9px;
  text-align: left;
}

.agent-plan-row:hover:not(:disabled),
.agent-question-item:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(52, 88, 246, 0.28);
  background: rgba(247, 250, 255, 0.96);
}

.agent-plan-check {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(183, 197, 229, 0.9);
  border-radius: 999px;
  color: #fff;
}

.agent-plan-check--done {
  border-color: #22aa82;
  background: #22aa82;
}

.agent-plan-tag {
  display: grid;
  place-items: center;
  min-width: 38px;
  min-height: 24px;
  border-radius: 999px;
  color: #fff;
  font-size: 10px;
  font-weight: 900;
}

.agent-plan-main {
  min-width: 0;
}

.agent-plan-main strong,
.agent-plan-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-plan-main strong {
  color: #21304f;
  font-size: 13px;
  font-weight: 860;
}

.agent-plan-main small {
  margin-top: 3px;
  color: #7b89a4;
  font-size: 11px;
  font-weight: 620;
}

.agent-plan-count {
  color: #4c5d80;
  font-size: 12px;
  font-weight: 860;
  white-space: nowrap;
}

.agent-plan-source {
  margin: 10px 2px 12px;
  color: #75839d;
  font-size: 12px;
  font-weight: 640;
  line-height: 1.55;
}

.agent-question-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.agent-question-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  border-radius: 15px;
  padding: 0 12px;
  color: #314263;
  font-size: 12px;
  font-weight: 760;
  text-align: left;
}

.agent-question-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes agentPulse {
  0%, 100% {
    opacity: 0.45;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes agentSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes agentShimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}

@media (min-width: 1600px) {
  .agent-page {
    grid-template-columns: 276px minmax(0, 1fr);
  }

  .agent-workspace-grid {
    grid-template-columns: minmax(0, 1fr) 410px;
  }

  .agent-heading h1 {
    font-size: 38px;
  }

  .agent-state-hero h2 {
    font-size: 42px;
  }
}

@media (min-width: 2400px) {
  .agent-workspace-grid,
  .agent-topbar {
    max-width: 2480px;
  }

  .agent-workspace-grid {
    grid-template-columns: minmax(0, 1fr) 430px;
  }
}

@media (min-width: 3000px) {
  .agent-workspace-grid,
  .agent-topbar {
    max-width: 2360px;
  }
}

@media (max-width: 1500px) {
  .agent-page {
    grid-template-columns: 224px minmax(0, 1fr);
  }

  .agent-shell {
    padding: 18px 18px 20px;
  }

  .agent-workspace-grid {
    grid-template-columns: minmax(0, 1fr) 332px;
    gap: 16px;
    min-height: 0;
  }

  .agent-heading h1 {
    font-size: 28px;
  }

  .agent-heading p {
    font-size: 13px;
  }

  .agent-top-actions {
    gap: 8px;
  }

  .agent-session-actions {
    display: none;
  }

  .agent-workbench-head,
  .agent-insight-head {
    padding: 16px 18px;
  }

  .agent-empty-workspace,
  .agent-message-list {
    padding: 18px;
  }

  .agent-empty-intro {
    grid-template-columns: minmax(0, 1fr) 220px;
    min-height: 214px;
    padding: 20px;
  }

  .agent-empty-intro h2 {
    font-size: 28px;
  }

  .agent-empty-visual {
    height: 168px;
  }

  .agent-stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .agent-state-screen {
    min-height: 0;
  }

  .agent-state-hero h2 {
    font-size: 30px;
  }

  .agent-insight-section {
    padding: 15px;
  }

  .agent-plan-row {
    grid-template-columns: 18px 38px minmax(0, 1fr) auto;
    min-height: 52px;
    gap: 7px;
  }
}

@media (max-width: 1180px) {
  .agent-page {
    height: auto;
    overflow-y: auto;
  }

  .agent-page {
    grid-template-columns: 1fr;
  }

  .agent-sidebar {
    position: sticky;
    top: 0;
    z-index: 5;
    min-height: auto;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-right: 0;
    border-bottom: 1px solid rgba(212, 224, 245, 0.82);
  }

  .agent-brand {
    padding: 0;
    flex: 0 0 auto;
  }

  .agent-brand strong {
    font-size: 24px;
  }

  .agent-brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }

  .agent-brand-mark::before {
    left: 10px;
    top: 9px;
    width: 13px;
    height: 17px;
    border-width: 7px;
  }

  .agent-brand-mark::after {
    right: 7px;
    bottom: 7px;
    width: 12px;
    height: 12px;
  }

  .agent-nav {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    flex: 1 1 auto;
  }

  .agent-nav-item {
    min-height: 40px;
    flex: 0 0 auto;
    padding: 0 12px;
  }

  .agent-resource-card {
    display: none;
  }

  .agent-workspace-grid,
  .agent-workspace-grid--single {
    grid-template-columns: 1fr;
  }

  .agent-shell {
    height: auto;
    min-height: calc(100vh - 65px);
    overflow: visible;
  }

  .agent-workspace-grid {
    min-height: auto;
  }

  .agent-insight-panel {
    overflow: visible;
  }

  .agent-insight-panel {
    order: 2;
  }
}

@media (max-width: 760px) {
  .agent-shell {
    padding: 14px 12px 18px;
  }

  .agent-topbar {
    display: grid;
    gap: 14px;
  }

  .agent-top-actions {
    justify-content: space-between;
    min-width: 0;
  }

  .agent-profile strong {
    max-width: 96px;
  }

  .agent-heading h1 {
    font-size: 25px;
  }

  .agent-heading p {
    font-size: 13px;
  }

  .agent-workbench-head {
    display: grid;
  }

  .agent-workbench-head p {
    max-width: none;
    text-align: left;
  }

  .agent-state-screen {
    min-height: 520px;
    padding: 30px 18px;
  }

  .agent-state-hero h2 {
    font-size: 28px;
  }

  .agent-state-hero p {
    font-size: 14px;
  }

  .agent-restore-grid,
  .agent-lock-list {
    grid-template-columns: 1fr;
  }

  .agent-empty-intro,
  .agent-stats-row,
  .agent-capability-grid {
    grid-template-columns: 1fr;
  }

  .agent-empty-visual {
    display: none;
  }

  .agent-empty-intro h2 {
    font-size: 27px;
  }

  .agent-message-stack {
    max-width: min(100%, 680px);
  }

  .agent-message--user .agent-message-stack {
    max-width: calc(100% - 48px);
  }

  .agent-composer {
    grid-template-columns: minmax(0, 1fr) 42px;
  }

  .agent-composer-send {
    width: 42px;
    height: 42px;
    border-radius: 14px;
  }

  .agent-side-title {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .agent-progress-ring {
    grid-column: 1 / -1;
    justify-self: start;
    margin-top: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
