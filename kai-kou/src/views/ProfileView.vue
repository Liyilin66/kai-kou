<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { BILLING_PAUSED, BILLING_PAUSED_MESSAGE } from "@/lib/billing";
import { classifyDeviceFamily, getDeviceIconSource } from "@/lib/device-icons";
import {
  createEmptyHomeAnalytics,
  formatInteger,
  loadHomeAnalyticsSnapshotForAuth
} from "@/lib/home-analytics";
import {
  createEmptyLoginEventsSnapshot,
  formatLoginEventMeta,
  loadLoginEventsForAuth,
  parseCurrentDevice
} from "@/lib/login-events";
import {
  createEmptyProfileProgress,
  loadProfileProgressSnapshotForAuth
} from "@/lib/profile-progress";
import { supabase } from "@/lib/supabase";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUIStore();

const selectedPlanKey = ref("month");
const homeAnalytics = ref(createEmptyHomeAnalytics());
const favoritesSnapshot = ref(createEmptyFavoritesSnapshot());
const planSnapshot = ref(createEmptyPlanSnapshot());
const loginEventsSnapshot = ref(createEmptyLoginEventsSnapshot());
const profileProgress = ref(createEmptyProfileProgress());
const avatarInputRef = ref(null);
const avatarUploading = ref(false);
const avatarUploadError = ref("");
const profileModalOpen = ref(false);
const profileSaving = ref(false);
const profileSaveError = ref("");
const profileDraft = ref(createProfileDraft());
const profileDraftOriginal = ref(createProfileDraft());
const avatarDraftDataUrl = ref("");
const avatarDraftName = ref("");
const loggingOut = ref(false);
let profileRefreshPromise = null;
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_AVATAR_ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const stageOptions = ["基础巩固", "稳步提分", "冲刺提升"];
const profileInfoIconMap = {
  target:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.6"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
  stage:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18.5h16"/><path d="M7 15.5l4-4 3 3 5-6"/><path d="M15.5 8.5H19v3.5"/></svg>',
  mail:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M5 8l6.1 4.4a1.6 1.6 0 0 0 1.8 0L19 8"/></svg>'
};

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

const plans = [
  {
    key: "week",
    name: "周卡",
    price: "6.9",
    duration: "7 天",
    tags: ["无限练习", "AI 私教", "专属分析"]
  },
  {
    key: "month",
    name: "月卡",
    price: "19.9",
    duration: "30 天",
    badge: "推荐",
    recommended: true,
    tags: ["无限练习", "AI 私教", "专属分析"]
  },
  {
    key: "lifetime",
    name: "永久卡",
    price: "49.9",
    duration: "永久",
    badge: "超值",
    value: true,
    tags: ["无限练习", "AI 私教", "专属分析"]
  }
];

const accountStatusIconMap = {
  summary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h7"/><path d="M9 12h7"/><path d="M9 19h5"/><path d="M5 5h.01"/><path d="M5 12h.01"/><path d="M5 19h.01"/></svg>',
  login:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v4l3 2"/><path d="M3.05 11a9 9 0 1 1 2.64 6.36"/><path d="M3 17h3v-3"/></svg>',
  status:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  time:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12"/><path d="M6 21h12"/><path d="M7 3c0 4 5 5 5 9s-5 5-5 9"/><path d="M17 3c0 4-5 5-5 9s5 5 5 9"/></svg>',
  memory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6a3 3 0 0 1 5.4-1.8A3.7 3.7 0 0 1 19 7.4a3.2 3.2 0 0 1-.7 5.8A3.7 3.7 0 0 1 15 20a3 3 0 0 1-3-2 3 3 0 0 1-3 2 3.7 3.7 0 0 1-3.3-6.8A3.2 3.2 0 0 1 5 7.4 3.7 3.7 0 0 1 8 6Z"/><path d="M12 6v12"/><path d="M8.5 10H12"/><path d="M12 14h3.5"/></svg>',
  plan:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="m4 6 1 1 2-2"/><path d="m4 12 1 1 2-2"/><path d="m4 18 1 1 2-2"/></svg>'
};

const identityIconMap = {
  summary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 7l8 4 8-4-8-4Z"/><path d="m4 11 8 4 8-4"/><path d="m4 15 8 4 8-4"/></svg>',
  score:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 0-9-9"/><path d="M12 17a5 5 0 1 0-5-5"/><path d="M12 13a1 1 0 1 0-1-1"/><path d="m15 9 5-5"/><path d="M16 4h4v4"/></svg>',
  modules:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
  duration:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
  window:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  ai:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m18.4 5.6-2.1 2.1"/><path d="m7.7 16.3-2.1 2.1"/><path d="M9.5 12a2.5 2.5 0 0 1 5 0c0 1.4-1.2 2.2-2.5 3-1.3-.8-2.5-1.6-2.5-3Z"/></svg>'
};

const favoriteIconMap = {
  ra:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></svg>',
  rs:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h8a4 4 0 0 1 0 8H9"/><path d="m11 12-4 4 4 4"/><path d="M5 8h2"/><path d="M3 5h4"/></svg>',
  rl:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19h16"/><path d="M7 19V9a5 5 0 0 1 10 0v10"/><path d="M9 10h6"/><path d="M12 3v3"/></svg>',
  wfd:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M5 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"/><path d="M19 13h-3v6h3a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/></svg>',
  we:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4-10 10H6v-4L16 4Z"/><path d="m14 6 4 4"/><path d="M4 20h16"/></svg>',
  di:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L7 18"/></svg>',
  rts:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 18.5 4 21v-5.5A7.5 7.5 0 0 1 11.5 8h1A7.5 7.5 0 0 1 20 15.5 7.5 7.5 0 0 1 12.5 23h-1a7.4 7.4 0 0 1-4-1.2"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>'
};

const displayNavItems = computed(() =>
  navItems.map((item) => ({
    ...item,
    icon: navIconMap[item.icon] || navIconMap.circle
  }))
);

const profile = computed(() => authStore.profile || {});
const userDisplayName = computed(() => authStore.displayName || "同学");
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});
const userEmail = computed(() =>
  normalizeText(authStore.user?.email || profile.value?.email)
);
const userAvatarUrl = computed(() => normalizeText(authStore.avatarUrl));
const modalAvatarPreview = computed(() => avatarDraftDataUrl.value || userAvatarUrl.value);
const todayDateKey = computed(() => getLocalDateKey());
const emailVerified = computed(() =>
  Boolean(authStore.user?.email_confirmed_at || authStore.user?.confirmed_at)
);

const targetScore = computed(() =>
  formatTargetScore(
    pickText(
      profile.value?.target_score,
      profile.value?.targetScore,
      profile.value?.goal_score,
      profile.value?.goalScore,
      profile.value?.pte_target_score,
      authStore.user?.user_metadata?.target_score
    ) || "79+"
  )
);

const examDate = computed(() =>
  formatDateValue(
    pickText(
      profile.value?.exam_date,
      profile.value?.examDate,
      profile.value?.test_date,
      profile.value?.testDate,
      profile.value?.target_exam_date,
      authStore.user?.user_metadata?.exam_date
    ),
    "2026-08-18"
  )
);

const currentStage = computed(() =>
  pickText(
    profile.value?.current_stage,
    profile.value?.currentStage,
    profile.value?.stage,
    profile.value?.learning_stage,
    authStore.user?.user_metadata?.current_stage
  ) || inferStageFromScore() || "冲刺提升"
);

const membershipPill = computed(() => {
  if (!authStore.loaded) {
    return { kind: "loading", icon: "⌛", label: "状态同步中" };
  }
  if (authStore.isPremium) {
    return { kind: "vip", icon: "♛", label: "VIP 无限练习" };
  }
  if (authStore.isInTrial) {
    return { kind: "trial", icon: "✦", label: `试用 ${formatInteger(authStore.trialDaysLeft)} 天` };
  }
  return { kind: "locked", icon: "◇", label: "未开通" };
});

const currentPlanLabel = computed(() => {
  if (!authStore.loaded) return "同步中";
  if (authStore.isPremium) {
    const plan = normalizeText(profile.value?.vip_plan);
    if (plan === "week") return "VIP 周卡";
    if (plan === "month") return "VIP 月卡";
    return "VIP 无限练习";
  }
  if (authStore.isInTrial) return `试用中 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天`;
  return "暂未开通";
});

const membershipSummary = computed(() => {
  if (!authStore.loaded) return "当前套餐：正在同步会员状态";
  if (authStore.isPremium) {
    const expiresAt = formatDateValue(profile.value?.vip_expires_at, "");
    const suffix = expiresAt ? `有效期至 ${expiresAt}` : "长期有效";
    return `当前套餐：${currentPlanLabel.value}（${suffix}）`;
  }
  if (authStore.isInTrial) return `当前套餐：试用权益（剩余 ${formatInteger(authStore.trialDaysLeft)} 天）`;
  return "当前套餐：未开通";
});

const profileInfoRows = computed(() => [
  { icon: "target", label: "目标分数", value: targetScore.value, strong: true },
  { icon: "calendar", label: "考试日期", value: examDate.value, strong: true },
  { icon: "stage", label: "当前阶段", value: currentStage.value, strong: true },
  {
    icon: "mail",
    label: "邮箱",
    value: userEmail.value || "邮箱未绑定",
    badge: emailVerified.value ? "已验证" : "未验证",
    badgeTone: emailVerified.value ? "ok" : "warn"
  }
]);

const latestLoginEvent = computed(() => {
  const rows = Array.isArray(loginEventsSnapshot.value.rows) ? loginEventsSnapshot.value.rows : [];
  return rows[0] || null;
});

const accountStatusRows = computed(() => [
  {
    label: "最近一次登录",
    value: formatLatestLoginText(),
    icon: "login",
    color: "purple"
  },
  {
    label: "考员状态",
    value: buildVipStatusText(),
    icon: "status",
    color: "gold"
  },
  {
    label: "做题时长/天数",
    value: buildPracticeTimeText(),
    icon: "time",
    color: "green"
  },
  {
    label: "AI 私教记忆",
    value: buildAgentMemoryText(),
    icon: "memory",
    color: "blue"
  },
  {
    label: "今日计划状态",
    value: buildPlanStatusText(),
    icon: "plan",
    color: "teal"
  }
]);

const identityTargetScore = computed(() => {
  const configuredTarget = pickText(
    profile.value?.target_score,
    profile.value?.targetScore,
    profile.value?.goal_score,
    profile.value?.goalScore,
    profile.value?.pte_target_score
  );
  return configuredTarget ? formatTargetScore(configuredTarget) : "未设置";
});

const identityConfig = computed(() => [
  { label: "目标分数", value: identityTargetScore.value, icon: "score", color: "blue" },
  { label: "重点模块", value: focusModules.value, icon: "modules", color: "purple" },
  { label: "每日学习时长", value: dailyStudyTime.value, icon: "duration", color: "cyan" },
  { label: "最佳时段", value: bestStudyWindow.value, icon: "window", color: "gold" },
  { label: "AI 建议强度", value: aiIntensity.value, icon: "ai", color: "red" }
]);

const focusModules = computed(() => {
  const explicit = normalizeListValue(
    profile.value?.focus_modules ||
    profile.value?.focusModules ||
    profile.value?.priority_modules ||
    authStore.user?.user_metadata?.focus_modules
  );
  if (explicit.length) return explicit.slice(0, 4).join(" / ");

  const completedCounts = profileProgress.value?.completedCounts || {};
  const ranked = ["RA", "DI", "WFD", "RTS", "WE", "RS"]
    .map((taskType) => ({
      taskType,
      count: Number(completedCounts[taskType] || 0)
    }))
    .sort((left, right) => left.count - right.count)
    .map((item) => item.taskType);

  return ranked.slice(0, 3).join(" / ") || "RA / DI / WFD";
});

const dailyStudyTime = computed(() => {
  const explicit = pickText(
    profile.value?.daily_study_time,
    profile.value?.dailyStudyTime,
    profile.value?.daily_minutes,
    profile.value?.dailyStudyMinutes
  );
  if (explicit) return /\d/.test(explicit) && !explicit.includes("分钟") ? `${explicit} 分钟` : explicit;
  if (planSnapshot.value.plan?.total_minutes) {
    return `${formatInteger(planSnapshot.value.plan.total_minutes)} 分钟`;
  }
  return "60-90 分钟";
});

const bestStudyWindow = computed(() =>
  pickText(
    profile.value?.best_study_time,
    profile.value?.bestStudyTime,
    profile.value?.preferred_study_time,
    profile.value?.study_window
  ) || "晚上 19:00-22:00"
);

const aiIntensity = computed(() =>
  pickText(
    profile.value?.ai_intensity,
    profile.value?.aiIntensity,
    profile.value?.coach_intensity,
    authStore.user?.user_metadata?.ai_intensity
  ) || "标准"
);

const favorites = computed(() => {
  const summary = favoritesSnapshot.value;
  const counts = summary.countsByTask || {};

  return favoriteTaskTypes.map((item) => ({
    ...item,
    count: Number(counts[item.type] || 0)
  }));
});

const favoriteTotalCount = computed(() => Number(favoritesSnapshot.value.totalCount || 0));

const favoriteSummaryText = computed(() => {
  if (favoritesSnapshot.value.loading) return "正在同步你的重点题目。";
  if (favoritesSnapshot.value.source === "error") return "收藏暂时同步失败，可以先进入题库继续练习。";
  if (favoriteTotalCount.value > 0) {
    return `已整理 ${formatInteger(favoriteTotalCount.value)} 个重点内容，适合考前集中复习。`;
  }
  return "把高频题、易错题和需要回看的题收藏起来，这里会成为你的复习清单。";
});

const favoriteTaskTypes = [
  { type: "RA", label: "RA 朗读", hint: "朗读题", icon: "ra", color: "blue" },
  { type: "RS", label: "RS 复述", hint: "复述句子", icon: "rs", color: "purple" },
  { type: "RL", label: "RL 讲座", hint: "复述讲座", icon: "rl", color: "green" },
  { type: "WFD", label: "WFD 听写", hint: "听写句子", icon: "wfd", color: "cyan" },
  { type: "WE", label: "WE 作文", hint: "写作题", icon: "we", color: "gold" },
  { type: "DI", label: "DI 图片", hint: "图片描述", icon: "di", color: "indigo" },
  { type: "RTS", label: "RTS 情景", hint: "情景回应", icon: "rts", color: "orange" }
];

const devices = computed(() => {
  const current = detectCurrentDevice();
  return [
    {
      icon: getDeviceIconSource(current),
      name: current.name,
      meta: current.meta,
      time: "正在使用",
      status: "当前设备",
      current: true
    }
  ];
});

const loginRecords = computed(() => {
  const rows = Array.isArray(loginEventsSnapshot.value.rows) ? loginEventsSnapshot.value.rows : [];
  const current = detectCurrentDevice();
  const currentRecordIndex = rows.findIndex((row) => doesLoginRecordMatchCurrentDevice(row, current));

  return rows.slice(0, 5).map((row, index) => ({
    icon: getDeviceIconSource(row),
    device: row.device_label || "设备未记录",
    meta: formatLoginEventMeta(row),
    time: formatRelativeDateTime(row.created_at || row.logged_in_at) || "时间未记录",
    current: index === currentRecordIndex,
    status: index === currentRecordIndex ? "当前设备" : ""
  }));
});

function isNavActive(item) {
  if (item.key === "profile") return route.path === "/profile";
  if (item.key === "home") return route.path === "/home" || route.path === "/";
  return route.path === item.to || route.fullPath === item.to;
}

function goTo(path) {
  const normalized = normalizeText(path);
  if (!normalized) return;
  if (normalized === route.fullPath) return;
  router.push(normalized);
}

function selectPlan(planKey) {
  selectedPlanKey.value = planKey;
}

function openUpgrade() {
  if (BILLING_PAUSED) {
    uiStore.showToast(BILLING_PAUSED_MESSAGE, "info", 3600);
  }
  router.push({
    path: "/upgrade",
    query: {
      plan: selectedPlanKey.value
    }
  });
}

function handleEditProfile() {
  const draft = createProfileDraft({
    displayName: userDisplayName.value,
    targetScore: targetScore.value,
    examDate: examDate.value,
    currentStage: currentStage.value
  });
  profileDraft.value = draft;
  profileDraftOriginal.value = { ...draft };
  avatarDraftDataUrl.value = "";
  avatarDraftName.value = "";
  avatarUploadError.value = "";
  profileSaveError.value = "";
  profileModalOpen.value = true;
}

function openFavorites() {
  router.push("/rts/favorites");
}

async function handleLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await authStore.logout();
    router.replace("/auth");
  } catch (error) {
    console.error("Logout failed:", error);
    uiStore.showToast("退出登录失败，请稍后重试", "warning");
  } finally {
    loggingOut.value = false;
  }
}

function showLoginRecordsNotice() {
  if (loginEventsSnapshot.value.source === "missing_table") {
    uiStore.showToast("登录记录表尚未创建，请先执行 user_login_events SQL。", "warning");
    return;
  }
  if (loginEventsSnapshot.value.source === "error") {
    uiStore.showToast("登录记录同步失败，请稍后重试。", "warning");
    return;
  }
  uiStore.showToast("当前仅保留最近 5 条真实登录记录。", "info");
}

function triggerAvatarPicker() {
  if (avatarUploading.value || profileSaving.value) return;
  avatarInputRef.value?.click?.();
}

async function handleAvatarFileChange(event) {
  const input = event?.target;
  const file = input?.files?.[0] || null;
  if (input) {
    input.value = "";
  }
  if (!file) return;

  avatarUploadError.value = "";

  if (!PROFILE_AVATAR_ACCEPTED_TYPES.has(String(file.type || "").toLowerCase())) {
    avatarUploadError.value = "请选择 JPG、PNG 或 WebP 图片";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  if (Number(file.size || 0) > PROFILE_AVATAR_MAX_BYTES) {
    avatarUploadError.value = "图片不能超过 2MB";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  avatarUploading.value = true;
  try {
    const avatarDataUrl = await createAvatarDataUrl(file);
    avatarDraftDataUrl.value = avatarDataUrl;
    avatarDraftName.value = normalizeText(file.name);
  } catch (error) {
    console.error("Avatar upload failed:", error);
    avatarUploadError.value = "头像处理失败，请稍后重试";
    uiStore.showToast(avatarUploadError.value, "warning");
  } finally {
    avatarUploading.value = false;
  }
}

function closeProfileModal() {
  if (profileSaving.value) return;
  profileModalOpen.value = false;
  profileSaveError.value = "";
  avatarUploadError.value = "";
}

function handleProfileOverlayClick(event) {
  if (event.target !== event.currentTarget) return;
  closeProfileModal();
}

async function saveProfileDraft() {
  if (profileSaving.value) return;

  const validationError = validateProfileDraft(profileDraft.value, profileDraftOriginal.value);
  if (validationError) {
    profileSaveError.value = validationError;
    return;
  }

  profileSaving.value = true;
  profileSaveError.value = "";
  try {
    const updatePayload = {
      displayName: profileDraft.value.displayName,
      avatarDataUrl: avatarDraftDataUrl.value
    };

    if (profileDraft.value.targetScore !== profileDraftOriginal.value.targetScore) {
      updatePayload.targetScore = profileDraft.value.targetScore;
    }
    if (profileDraft.value.examDate !== profileDraftOriginal.value.examDate) {
      updatePayload.examDate = profileDraft.value.examDate;
    }
    if (profileDraft.value.currentStage !== profileDraftOriginal.value.currentStage) {
      updatePayload.currentStage = profileDraft.value.currentStage;
    }

    await authStore.updateProfileDetails(updatePayload);
    profileModalOpen.value = false;
    avatarDraftDataUrl.value = "";
    avatarDraftName.value = "";
    uiStore.showToast("个人资料已更新", "success");
  } catch (error) {
    console.error("Profile update failed:", error);
    profileSaveError.value = toFriendlyProfileError(error);
  } finally {
    profileSaving.value = false;
  }
}

async function loadProfileSnapshots({ reset = false } = {}) {
  if (profileRefreshPromise) {
    return profileRefreshPromise;
  }

  if (reset) {
    homeAnalytics.value = createEmptyHomeAnalytics();
    favoritesSnapshot.value = createEmptyFavoritesSnapshot();
    planSnapshot.value = createEmptyPlanSnapshot();
    loginEventsSnapshot.value = createEmptyLoginEventsSnapshot();
    profileProgress.value = createEmptyProfileProgress();
  }

  profileRefreshPromise = (async () => {
    await authStore.init();
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const [
      analyticsSnapshot,
      favoriteSummary,
      todayPlan,
      loginEventsSummary,
      progressSnapshot
    ] = await Promise.all([
      loadHomeAnalyticsSnapshotForAuth(authStore),
      loadFavoritesSnapshotForAuth(),
      loadTodayPlanSnapshotForAuth(),
      loadLoginEventsForAuth(authStore),
      loadProfileProgressSnapshotForAuth(authStore)
    ]);

    homeAnalytics.value = analyticsSnapshot;
    favoritesSnapshot.value = favoriteSummary;
    planSnapshot.value = todayPlan;
    loginEventsSnapshot.value = loginEventsSummary;
    profileProgress.value = progressSnapshot;
  })();

  try {
    await profileRefreshPromise;
  } finally {
    profileRefreshPromise = null;
  }
}

function handleProfileFocusRefresh() {
  void loadProfileSnapshots({ reset: false });
}

function handleProfileVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  void loadProfileSnapshots({ reset: false });
}

onMounted(async () => {
  await loadProfileSnapshots({ reset: true });

  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleProfileFocusRefresh);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleProfileVisibilityChange);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("focus", handleProfileFocusRefresh);
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleProfileVisibilityChange);
  }
});

function buildVipStatusText() {
  if (!authStore.loaded) return "会员状态同步中";
  if (authStore.isPremium) {
    const expiresAt = formatDateValue(profile.value?.vip_expires_at, "");
    return expiresAt ? `${currentPlanLabel.value} · 有效期至 ${expiresAt}` : `${currentPlanLabel.value} · 长期有效`;
  }
  if (authStore.isInTrial) return `试用中 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天`;
  return "未开通 VIP";
}

function buildPracticeTimeText() {
  if (homeAnalytics.value.loading) return "练习记录同步中";
  const weekMinutes = Number(homeAnalytics.value.weekMinutes || 0);
  const activeDays = Number(homeAnalytics.value.activeDaysCount || 0);
  if (weekMinutes > 0) return `本周 ${formatInteger(weekMinutes)} 分钟 · 累计 ${formatInteger(activeDays)} 天`;
  return `累计 ${formatInteger(activeDays)} 天 · 做题时长待同步`;
}

function buildAgentMemoryText() {
  if (!authStore.loaded || planSnapshot.value.loading) return "同步中";
  if (!authStore.isPremium && !authStore.isInTrial) return "未启用 · VIP 专属";
  if (planSnapshot.value.reasonCode === "table_missing") return "待配置 · 计划表未创建";
  if (planSnapshot.value.reasonCode === "progress_error") return "已启用 · 进度同步失败";
  if (planSnapshot.value.reasonCode === "error") return "同步失败";
  if (planSnapshot.value.plan) {
    const updatedAt = formatShortTime(planSnapshot.value.plan.updated_at || planSnapshot.value.plan.created_at);
    return updatedAt ? `已启用 · 计划更新于 ${updatedAt}` : "已启用 · 今日计划已同步";
  }
  return "已启用 · 今日暂无计划";
}

function buildPlanStatusText() {
  if (planSnapshot.value.loading) return "计划同步中";
  if (planSnapshot.value.reasonCode === "progress_error") return "计划进度同步失败";
  if (planSnapshot.value.reasonCode === "error") return "AI 计划同步失败";
  const progress = planSnapshot.value.progress;
  if (progress?.targetCount > 0) {
    if (progress.isComplete) {
      return `已完成 · ${formatInteger(progress.completedCount)} / ${formatInteger(progress.targetCount)} 项`;
    }
    return `进行中 · 已完成 ${formatInteger(progress.completedCount)} / ${formatInteger(progress.targetCount)} 项`;
  }
  if (homeAnalytics.value.todayCount > 0) {
    return `暂无 AI 计划 · 今日已练 ${formatInteger(homeAnalytics.value.todayCount)} 题`;
  }
  return "暂无计划 · 可在 AI 私教生成";
}

function inferStageFromScore() {
  const average = Number(homeAnalytics.value.averageScore);
  if (!Number.isFinite(average) || average <= 0) return "";
  if (average >= 75) return "冲刺提升";
  if (average >= 58) return "稳步提分";
  return "基础巩固";
}

async function loadFavoritesSnapshotForAuth() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    return {
      ...createEmptyFavoritesSnapshot(),
      loading: false,
      source: "auth_missing"
    };
  }

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("task_type, question_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      if (isMissingTableError(error, "favorites")) {
        const localCounts = readLocalFavoriteCounts(userId);
        return buildFavoritesSnapshotFromCounts(localCounts, "local_missing_table");
      }
      throw error;
    }

    const countsByTask = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      const taskType = normalizeTaskType(row?.task_type) || "OTHER";
      countsByTask[taskType] = (countsByTask[taskType] || 0) + 1;
    });

    return buildFavoritesSnapshotFromCounts(countsByTask, "remote");
  } catch (error) {
    console.warn("Favorites summary load failed:", error);
    return {
      ...createEmptyFavoritesSnapshot(),
      loading: false,
      source: "error"
    };
  }
}

async function loadTodayPlanSnapshotForAuth() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    return {
      ...createEmptyPlanSnapshot(),
      loading: false,
      reasonCode: "auth_missing"
    };
  }

  const dateKey = getLocalDateKey();

  try {
    const { data, error } = await supabase
      .from("agent_daily_plans")
      .select("id, user_id, plan_date, title, source, plan_json, created_at, updated_at")
      .eq("user_id", userId)
      .eq("plan_date", dateKey)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error, "agent_daily_plans")) {
        return {
          ...createEmptyPlanSnapshot(),
          loading: false,
          reasonCode: "table_missing"
        };
      }
      throw error;
    }

    if (!data) {
      return {
        ...createEmptyPlanSnapshot(),
        loading: false,
        reasonCode: "no_plan"
      };
    }

    const plan = normalizePlanRow(data);
    const progress = await loadPlanProgress({ userId, plan, dateKey });

    return {
      loading: false,
      reasonCode: "ok",
      plan,
      progress
    };
  } catch (error) {
    console.warn("Agent plan summary load failed:", error);
    if (error?.profileViewReasonCode === "progress_error") {
      return {
        ...createEmptyPlanSnapshot(),
        loading: false,
        reasonCode: "progress_error"
      };
    }
    return {
      ...createEmptyPlanSnapshot(),
      loading: false,
      reasonCode: "error"
    };
  }
}

async function loadPlanProgress({ userId, plan, dateKey }) {
  const { startIso, endIso } = getLocalDayRange(dateKey);
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    const progressError = new Error(error.message || "Plan progress load failed");
    progressError.profileViewReasonCode = "progress_error";
    progressError.cause = error;
    throw progressError;
  }

  const counts = {};
  if (Array.isArray(data)) {
    data.forEach((row) => {
      const taskType = normalizeTaskType(row?.task_type);
      if (!taskType) return;
      counts[taskType] = (counts[taskType] || 0) + 1;
    });
  }

  let completedCount = 0;
  let targetCount = 0;
  (Array.isArray(plan.items) ? plan.items : []).forEach((item) => {
    const taskType = normalizeTaskType(item?.task_type);
    const target = Math.max(1, Math.round(Number(item?.target_count || item?.count || 1)));
    const completed = Math.min(Math.max(0, Number(counts[taskType] || 0)), target);
    targetCount += target;
    completedCount += completed;
  });

  return {
    completedCount,
    targetCount,
    isComplete: targetCount > 0 && completedCount >= targetCount
  };
}

function normalizePlanRow(row) {
  const rawPlan = isPlainObject(row?.plan_json) ? row.plan_json : {};
  const rawItems = Array.isArray(rawPlan?.items) ? rawPlan.items : [];
  const items = rawItems.map((item) => ({
    task_type: normalizeTaskType(item?.task_type || item?.type),
    label: normalizeText(item?.label),
    count: Math.max(1, Math.round(Number(item?.count || item?.target_count || 1))),
    minutes: Math.max(0, Math.round(Number(item?.minutes || 0)))
  })).filter((item) => item.task_type);

  return {
    id: normalizeText(row?.id),
    plan_date: normalizeText(row?.plan_date),
    title: normalizeText(row?.title || rawPlan?.title) || "今日 AI 训练计划",
    source: normalizeText(row?.source || rawPlan?.source),
    total_minutes: Math.max(0, Math.round(Number(rawPlan?.total_minutes || sumBy(items, "minutes") || 0))),
    created_at: normalizeText(row?.created_at),
    updated_at: normalizeText(row?.updated_at),
    items
  };
}

function createEmptyFavoritesSnapshot() {
  return {
    loading: true,
    source: "loading",
    totalCount: 0,
    countsByTask: {}
  };
}

function createEmptyPlanSnapshot() {
  return {
    loading: true,
    reasonCode: "loading",
    plan: null,
    progress: null
  };
}

function createProfileDraft(seed = {}) {
  return {
    displayName: normalizeText(seed.displayName),
    targetScore: normalizeTargetScoreInput(seed.targetScore),
    examDate: normalizeDateInput(seed.examDate),
    currentStage: normalizeText(seed.currentStage)
  };
}

function buildFavoritesSnapshotFromCounts(countsByTask, source) {
  const safeCounts = isPlainObject(countsByTask) ? countsByTask : {};
  return {
    loading: false,
    source,
    totalCount: Object.values(safeCounts).reduce((sum, value) => sum + Number(value || 0), 0),
    countsByTask: safeCounts
  };
}

function readLocalFavoriteCounts(userId) {
  const taskTypes = ["RA", "RTS", "DI"];
  return taskTypes.reduce((counts, taskType) => {
    const key = `kai_kou_${taskType.toLowerCase()}_favorites_${userId}`;
    counts[taskType] = readJsonArrayLengthFromLocalStorage(key);
    return counts;
  }, {});
}

function readJsonArrayLengthFromLocalStorage(key, userId = "") {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;

    if (!userId) return parsed.length;

    return parsed.filter((item) => {
      const itemUserId = normalizeText(item?.user_id || item?.userId || item?.owner_id);
      return itemUserId === userId;
    }).length;
  } catch {
    return 0;
  }
}

function formatFavoriteCount(count) {
  if (favoritesSnapshot.value.loading || favoritesSnapshot.value.source === "error") return "--";
  return formatInteger(count);
}

async function resolveCurrentUserId() {
  const authUserId = normalizeText(authStore.user?.id);
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

async function createAvatarDataUrl(file) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持头像处理");

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.max(0, (sourceWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (sourceHeight - sourceSize) / 2);

  context.clearRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
  return blobToDataUrl(blob);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败，请重新选择"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("头像处理失败，请重试"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("头像编码失败，请重试"));
    reader.readAsDataURL(blob);
  });
}

function detectCurrentDevice() {
  const device = parseCurrentDevice();

  return {
    device_label: device.device_label,
    browser: device.browser,
    os: device.os,
    name: device.device_label || "当前浏览器设备",
    meta: [device.os, device.browser].filter(Boolean).join(" · ") || "设备信息未记录"
  };
}

function doesLoginRecordMatchCurrentDevice(row, currentDevice) {
  if (!row || !currentDevice) return false;
  const sameFamily = classifyDeviceFamily(row) === classifyDeviceFamily(currentDevice);
  const recordBrowser = normalizeText(row.browser).toLowerCase();
  const currentBrowser = normalizeText(currentDevice.browser).toLowerCase();
  return sameFamily && (!recordBrowser || !currentBrowser || recordBrowser === currentBrowser);
}

function formatLatestLoginText() {
  const event = latestLoginEvent.value;
  if (event) {
    const formatted = formatRelativeDateTime(event.created_at || event.logged_in_at) || "时间未记录";
    return `${formatted} · ${event.device_label || "设备未记录"}`;
  }

  const fallback = formatRelativeDateTime(authStore.user?.last_sign_in_at);
  return fallback ? `${fallback} · 设备未记录` : "暂无登录记录";
}

function formatRelativeDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  if (sameDay) return `今天 ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }) + ` ${time}`;
}

function formatShortTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return sameDay ? `今日 ${time}` : formatDateValue(value, "");
}

function formatDateValue(value, fallback) {
  const text = normalizeText(value);
  if (!text) return fallback;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTargetScore(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "79+";
  if (normalized.endsWith("+")) return normalized;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return `${Math.round(numeric)}+`;
  return normalized;
}

function normalizeTargetScoreInput(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `${Math.max(10, Math.min(90, Math.round(numeric)))}`;
}

function normalizeDateInput(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateProfileDraft(draft, original = {}) {
  if (!normalizeText(draft?.displayName)) return "请输入昵称/用户名";

  const targetText = normalizeText(draft?.targetScore);
  const target = Number(targetText);
  if (!targetText && normalizeText(original?.targetScore)) {
    return "目标分数不能为空";
  }
  if (targetText && (!Number.isFinite(target) || target < 10 || target > 90)) {
    return "目标分数请输入 10 到 90 之间的数字";
  }

  if (normalizeText(draft?.examDate)) {
    const date = new Date(`${draft.examDate}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return "请选择有效的考试日期";
    if (draft.examDate < getLocalDateKey()) return "考试日期不能早于今天";
  }

  return "";
}

function toFriendlyProfileError(error) {
  const message = normalizeText(error?.message);
  if (/schema cache|column .* does not exist|could not find .* column/i.test(message)) {
    return "当前资料字段还未在数据库启用，已保留其它可保存内容。";
  }
  if (/permission|policy|rls|row-level|not authorized|401|403/i.test(message)) {
    return "当前账号暂时没有更新权限，请重新登录后再试。";
  }
  if (/jwt|token|session|auth/i.test(message)) {
    return "登录状态已过期，请重新登录后再试。";
  }
  return "保存失败，请稍后重试。";
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDayRange(dateKey) {
  const [year, month, day] = `${dateKey || getLocalDateKey()}`.split("-").map((value) => Number(value));
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function isMissingTableError(error, tableName) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return message.includes("relation") && message.includes(tableName);
}

function normalizeTaskType(value) {
  const taskType = normalizeText(value).toUpperCase();
  return ["RA", "RS", "RL", "WE", "WFD", "DI", "RTS"].includes(taskType) ? taskType : "";
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(/[,/、，\s]+/).map((item) => normalizeText(item)).filter(Boolean);
}

function pickText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sumBy(items, key) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
}
</script>

<template>
  <div class="personal-center-page">
    <aside class="profile-sidebar">
      <RouterLink class="profile-logo" to="/home" aria-label="返回首页">
        <div class="profile-logo-icon" aria-hidden="true">
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95" />
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75" />
          </svg>
        </div>
        <span class="profile-logo-name">开口 PTE</span>
      </RouterLink>

      <nav class="profile-nav" aria-label="个人中心导航">
        <RouterLink
          v-for="item in displayNavItems"
          :key="item.key"
          class="profile-nav-item"
          :class="{ 'profile-nav-item--active': isNavActive(item) }"
          :to="item.to"
          :aria-current="isNavActive(item) ? 'page' : undefined"
        >
          <span class="profile-nav-icon" aria-hidden="true" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="profile-sidebar-footer">
        <div class="profile-promo">
          <div class="profile-promo-title">PTE 备考资料包</div>
          <div class="profile-promo-sub">真题 · 高频词汇 · 模板</div>
          <button class="profile-promo-button" type="button" @click="goTo('/we/templates')">免费领取</button>
        </div>
      </div>
    </aside>

    <section class="profile-shell">
      <header class="profile-topbar">
        <div>
          <div class="hello">你好，{{ userDisplayName }} 👋</div>
          <div class="hello-sub">坚持每天进步一点，PTE 梦想更近一步！</div>
        </div>

        <div class="topbar-actions">
          <div class="vip-pill" :class="`vip-pill--${membershipPill.kind}`">
            <span>{{ membershipPill.icon }}</span>
            <span>{{ membershipPill.label }}</span>
          </div>
          <div class="user-mini">
            <span class="mini-avatar">
              <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
              <span v-else>{{ userInitial }}</span>
            </span>
            <span>{{ userDisplayName }}</span>
          </div>
          <button class="logout-btn" type="button" :disabled="loggingOut" @click="handleLogout">
            {{ loggingOut ? "退出中..." : "退出登录" }}
          </button>
        </div>
      </header>

      <main class="profile-main">
        <section class="page-heading">
          <h1>个人中心</h1>
          <span>PERSONAL CENTER</span>
          <p>管理您的账号信息、学习身份配置、会员权益与设备安全</p>
        </section>

        <section class="dashboard-grid">
          <div class="dashboard-column">
            <article class="pc-card profile-card">
              <div class="card-title">
                <span class="title-icon">♟</span>
                <span>个人资料与账号中心</span>
              </div>

              <div class="profile-body">
                <div class="profile-left">
                  <button
                    type="button"
                    class="avatar-large"
                    :disabled="avatarUploading || profileSaving"
                    aria-label="更换头像"
                    @click="handleEditProfile"
                  >
                    <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
                    <span v-else>{{ userInitial }}</span>
                  </button>
                  <input
                    ref="avatarInputRef"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    class="avatar-input"
                    @change="handleAvatarFileChange"
                  />
                  <div class="profile-name">
                    {{ userDisplayName }}
                    <button type="button" class="icon-edit" aria-label="编辑个人资料" @click="handleEditProfile">✎</button>
                  </div>
                  <div class="profile-vip">♛ {{ membershipPill.label }}</div>
                  <div v-if="avatarUploadError" class="avatar-error">{{ avatarUploadError }}</div>
                </div>

                <div class="profile-info">
                  <div v-for="row in profileInfoRows" :key="row.label" class="info-row">
                    <span class="row-label">
                      <i class="row-icon" v-html="profileInfoIconMap[row.icon]"></i>
                      {{ row.label }}
                    </span>
                    <strong v-if="row.strong">{{ row.value }}</strong>
                    <span v-else class="email-value">{{ row.value }}</span>
                    <span v-if="row.badge" class="verified" :class="`verified--${row.badgeTone}`">{{ row.badge }}</span>
                  </div>

                  <button class="primary-btn profile-btn" type="button" @click="handleEditProfile">编辑个人资料</button>
                </div>
              </div>
            </article>

            <article class="pc-card membership-card">
              <div class="card-title with-note">
                <span>
                  <span class="title-icon crown">♛</span>
                  会员充值与权益
                </span>
                <em>{{ membershipSummary }}</em>
              </div>

              <div class="plans">
                <button
                  v-for="plan in plans"
                  :key="plan.key"
                  type="button"
                  class="plan-card"
                  :class="{
                    recommended: plan.recommended,
                    value: plan.value,
                    selected: selectedPlanKey === plan.key
                  }"
                  @click="selectPlan(plan.key)"
                >
                  <span v-if="plan.badge" class="plan-badge">{{ plan.badge }}</span>
                  <div class="plan-name">{{ plan.name }}</div>
                  <div class="plan-price">
                    ¥{{ plan.price }}
                    <small>/ {{ plan.duration }}</small>
                  </div>
                  <div class="plan-tags">
                    <span v-for="tag in plan.tags" :key="tag">{{ tag }}</span>
                  </div>
                </button>
              </div>

              <div class="membership-footer">
                <button class="primary-btn charge-btn" type="button" @click="openUpgrade">立即充值</button>
                <div class="safe-text">⊙ 安全支付 · 随时可取消 · 专属客服支持</div>
              </div>
            </article>
          </div>

          <div class="dashboard-column">
            <article class="pc-card status-card">
              <div class="card-title">
                <span class="title-icon title-icon-svg" aria-hidden="true" v-html="accountStatusIconMap.summary"></span>
                <span>账号状态摘要</span>
              </div>

              <div class="status-list">
                <div v-for="item in accountStatusRows" :key="item.label" class="status-row">
                  <span class="soft-icon status-icon" :class="item.color" aria-hidden="true" v-html="accountStatusIconMap[item.icon]"></span>
                  <span class="status-label">{{ item.label }}</span>
                  <span class="status-value">{{ item.value }}</span>
                </div>
              </div>
            </article>

            <article class="pc-card identity-card">
              <div class="card-title">
                <span class="title-icon title-icon-svg" aria-hidden="true" v-html="identityIconMap.summary"></span>
                <span>学习身份配置</span>
              </div>

              <div class="config-list">
                <div v-for="item in identityConfig" :key="item.label" class="config-row">
                  <span class="soft-icon config-icon" :class="item.color" aria-hidden="true" v-html="identityIconMap[item.icon]"></span>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </article>

          </div>

          <article class="pc-card favorites-card">
            <div class="favorite-hero">
              <div class="favorite-heading">
                <span class="favorite-eyebrow">全题型收藏概览</span>
                <h2>我的收藏</h2>
                <p>{{ favoriteSummaryText }}</p>
              </div>
              <div class="favorite-total-pill">
                <strong>{{ formatFavoriteCount(favoriteTotalCount) }}</strong>
                <span>已收藏</span>
              </div>
            </div>

            <div class="favorites-content">
              <div class="favorite-tiles" aria-label="收藏分类">
                <div
                  v-for="item in favorites"
                  :key="item.label"
                  class="favorite-tile"
                  role="button"
                  tabindex="0"
                  @click="openFavorites"
                  @keydown.enter.prevent="openFavorites"
                  @keydown.space.prevent="openFavorites"
                >
                  <span class="tile-icon favorite-icon" :class="item.color" aria-hidden="true" v-html="favoriteIconMap[item.icon]"></span>
                  <span class="favorite-tile-copy">
                    <strong>{{ item.label }}</strong>
                    <em>{{ item.hint }}</em>
                  </span>
                  <b>{{ formatFavoriteCount(item.count) }}</b>
                </div>
              </div>
            </div>
          </article>

          <article class="pc-card device-card">
            <div class="card-title">
              <span class="title-icon">▰</span>
              <span>设备与登录记录</span>
            </div>

            <div class="device-layout">
              <div class="device-panel">
                <div class="section-mini-title">当前设备</div>
                <div v-for="item in devices" :key="item.name" class="device-row device-record">
                  <span class="device-image-wrap">
                    <img :src="item.icon" :alt="`${item.name} 设备图标`" class="device-image" />
                  </span>
                  <div class="device-copy">
                    <strong>{{ item.name }}</strong>
                    <p>{{ item.meta }}</p>
                  </div>
                  <div class="device-side">
                    <span class="device-time">{{ item.time }}</span>
                    <span class="current-device">{{ item.status }}</span>
                  </div>
                </div>
              </div>

              <div class="device-panel login-panel">
                <div class="section-mini-title">近期登录记录</div>
                <div v-if="loginEventsSnapshot.loading" class="login-empty">正在同步登录记录...</div>
                <div v-else-if="loginEventsSnapshot.source === 'missing_table'" class="login-empty">登录记录表未配置，暂无真实记录</div>
                <div v-else-if="loginEventsSnapshot.source === 'error'" class="login-empty login-empty--error">登录记录同步失败，请稍后重试</div>
                <div v-else-if="!loginRecords.length" class="login-empty">暂无登录记录</div>
                <template v-else>
                  <div v-for="item in loginRecords" :key="`${item.device}-${item.time}`" class="login-row device-record">
                    <span class="device-image-wrap small">
                      <img :src="item.icon" :alt="`${item.device} 设备图标`" class="device-image" />
                    </span>
                    <div class="device-copy">
                      <strong>{{ item.device }}</strong>
                      <p>{{ item.meta }}</p>
                    </div>
                    <div class="device-side">
                      <em>{{ item.time }}</em>
                      <span v-if="item.current" class="current-device compact">{{ item.status }}</span>
                    </div>
                  </div>
                </template>
                <button class="link-btn" type="button" @click="showLoginRecordsNotice">仅显示最近 5 条登录记录</button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </section>

    <Teleport to="body">
      <div
        v-if="profileModalOpen"
        class="profile-modal-overlay"
        role="presentation"
        @click="handleProfileOverlayClick"
      >
        <section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
          <header class="profile-modal-head">
            <div>
              <p>PERSONAL PROFILE</p>
              <h2 id="profile-edit-title">编辑个人资料</h2>
            </div>
            <button type="button" class="profile-modal-close" aria-label="关闭编辑个人资料" @click="closeProfileModal">
              ×
            </button>
          </header>

          <div class="profile-modal-body">
            <div class="profile-edit-avatar">
              <button
                type="button"
                class="profile-edit-avatar-btn"
                :disabled="avatarUploading || profileSaving"
                @click="triggerAvatarPicker"
              >
                <img v-if="modalAvatarPreview" :src="modalAvatarPreview" alt="头像预览" />
                <span v-else>{{ userInitial }}</span>
              </button>
              <div>
                <button
                  type="button"
                  class="profile-edit-upload"
                  :disabled="avatarUploading || profileSaving"
                  @click="triggerAvatarPicker"
                >
                  {{ avatarUploading ? "处理中..." : "更换头像" }}
                </button>
                <p>{{ avatarDraftName || "JPG / PNG / WebP，2MB 以内" }}</p>
                <p v-if="avatarUploadError" class="profile-modal-error">{{ avatarUploadError }}</p>
              </div>
            </div>

            <label class="profile-edit-field">
              <span>昵称/用户名</span>
              <input
                v-model.trim="profileDraft.displayName"
                type="text"
                maxlength="32"
                autocomplete="nickname"
                :disabled="profileSaving"
              />
            </label>

            <div class="profile-edit-grid">
              <label class="profile-edit-field">
                <span>目标分数</span>
                <input
                  v-model="profileDraft.targetScore"
                  type="number"
                  min="10"
                  max="90"
                  step="1"
                  :disabled="profileSaving"
                />
              </label>

              <label class="profile-edit-field">
                <span>考试日期</span>
                <input v-model="profileDraft.examDate" type="date" :min="todayDateKey" :disabled="profileSaving" />
              </label>
            </div>

            <label class="profile-edit-field">
              <span>当前阶段</span>
              <select v-model="profileDraft.currentStage" :disabled="profileSaving">
                <option v-for="stage in stageOptions" :key="stage" :value="stage">{{ stage }}</option>
              </select>
            </label>

            <div class="profile-locked-fields" aria-label="不可修改资料">
              <label class="profile-edit-field profile-edit-field--locked">
                <span>邮箱</span>
                <input :value="userEmail || '邮箱未绑定'" type="text" disabled />
              </label>
              <label class="profile-edit-field profile-edit-field--locked">
                <span>VIP 权限/套餐状态</span>
                <input :value="membershipPill.label" type="text" disabled />
              </label>
            </div>

            <p v-if="profileSaveError" class="profile-modal-error" role="alert">{{ profileSaveError }}</p>
          </div>

          <footer class="profile-modal-actions">
            <button type="button" class="profile-modal-secondary" :disabled="profileSaving" @click="closeProfileModal">
              取消
            </button>
            <button type="button" class="profile-modal-primary" :disabled="profileSaving" @click="saveProfileDraft">
              {{ profileSaving ? "保存中..." : "保存" }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
*,*::before,*::after {
  box-sizing: border-box;
}

button {
  font: inherit;
}

.personal-center-page {
  --c0: #1e1208;
  --c1: #3a2510;
  --c2: #7c5c3e;
  --c3: #a07850;
  --bg0: #f5efe4;
  --bg1: #ede8dc;
  --bg2: #e5dfd4;
  --bg3: #d9cfbd;
  --card: #faf6ef;
  --card2: #f2ebe0;
  --bdr: #d4c8b4;
  --bdr2: #c4b49c;
  --mute: #8f8477;
  --soft: #9a8f80;
  --content-max: 1320px;
  --layout-gap: 16px;
  --card-radius: 14px;
  min-height: 100vh;
  display: flex;
  overflow: hidden;
  background:
    radial-gradient(circle at 82% 10%, rgba(255, 249, 238, 0.86), transparent 32%),
    var(--bg1);
  color: var(--c0);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.profile-sidebar {
  display: flex;
  flex: 0 0 200px;
  width: 200px;
  flex-direction: column;
  background: #e5dfd4;
  border-right: 0.5px solid #d4cdbf;
}

.profile-logo {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 64px;
  flex: 0 0 64px;
  padding: 0 18px;
  text-decoration: none;
  border-bottom: 0.5px solid #d4cdbf;
}

.profile-logo-icon {
  display: flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #7c5c3e;
  flex-shrink: 0;
}

.profile-logo-name {
  color: #2c1f0e;
  font-size: 17px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.profile-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 22px 12px 24px;
}

.profile-nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  padding: 0 12px;
  border: 0.5px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #9a8f80;
  cursor: pointer;
  font-family: inherit;
  font-size: 13.8px;
  line-height: 1.3;
  text-align: left;
  text-decoration: none;
  transition: background 0.13s, border-color 0.13s, color 0.13s;
}

.profile-nav-item:hover {
  background: #ede8df;
  color: #6b5a44;
}

.profile-nav-item--active {
  border-color: #cabdaa;
  background: #d9cfbd;
  color: #7c5c3e;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(245, 239, 228, 0.5);
}

.profile-nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}

.profile-nav-icon svg {
  width: 15px;
  height: 15px;
}

.profile-sidebar-footer {
  padding: 16px 12px 18px;
  border-top: 0.5px solid #d4cdbf;
}

.profile-promo {
  padding: 12px;
  border: 0.5px solid #c4baa8;
  border-radius: 10px;
  background: #d8cebc;
}

.profile-promo-title {
  margin-bottom: 2px;
  color: #7c5c3e;
  font-size: 11.5px;
  font-weight: 500;
}

.profile-promo-sub {
  margin-bottom: 9px;
  color: #9a8f80;
  font-size: 10.5px;
}

.profile-promo-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: #7c5c3e;
  color: #f5efe4;
  font-family: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 6px 13px;
  cursor: pointer;
}

.profile-shell {
  flex: 1;
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.profile-topbar {
  height: 64px;
  flex: 0 0 64px;
  background: var(--bg2);
  border-bottom: 0.5px solid #d7cfc0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
}

.hello {
  font-size: 15px;
  font-weight: 800;
}

.hello-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--soft);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vip-pill {
  height: 28px;
  padding: 0 13px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #d5ad55;
  background: #fff1c9;
  color: var(--c2);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.vip-pill--trial {
  background: #fff7dd;
}

.vip-pill--locked {
  background: var(--card2);
  border-color: var(--bdr);
}

.user-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--c2);
  font-size: 13px;
  font-weight: 600;
}

.logout-btn {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(246, 241, 232, 0.82);
  color: #76563a;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.logout-btn:hover:not(:disabled) {
  border-color: #b99f80;
  color: #5f3f27;
}

.logout-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c2);
  color: #fff8ee;
  display: grid;
  place-items: center;
  font-weight: 800;
}

.mini-avatar img,
.avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px 28px 24px;
}

.profile-main::-webkit-scrollbar {
  width: 4px;
}

.profile-main::-webkit-scrollbar-thumb {
  background: var(--bdr);
  border-radius: 99px;
}

.page-heading {
  width: min(100%, var(--content-max));
  margin: 0 auto var(--layout-gap);
}

.page-heading h1 {
  display: inline-block;
  margin: 0;
  font-size: 26px;
  line-height: 1.1;
  letter-spacing: 0.01em;
}

.page-heading span {
  margin-left: 14px;
  color: var(--soft);
  font-size: 14px;
  letter-spacing: 0.08em;
}

.page-heading p {
  margin: 7px 0 0;
  color: #8b8073;
  font-size: 14px;
}

.dashboard-grid {
  width: min(100%, var(--content-max));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.9fr);
  gap: var(--layout-gap);
  align-items: stretch;
}

.dashboard-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--layout-gap);
  height: 100%;
}

.dashboard-column:first-child .profile-card {
  flex: 0 0 auto;
}

.dashboard-column:first-child .membership-card {
  flex: 1 1 auto;
}

.pc-card {
  min-width: 0;
  background: rgba(250, 246, 238, 0.82);
  border: 1px solid #d8d0c3;
  border-radius: var(--card-radius);
  box-shadow:
    0 10px 24px rgba(124, 92, 62, 0.035),
    inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 900;
  padding: 12px 16px 0;
}

.card-title.with-note {
  gap: 10px;
  flex-wrap: wrap;
}

.card-title.with-note > span {
  font-weight: 900;
}

.card-title.with-note em {
  font-style: normal;
  color: var(--mute);
  font-size: 13px;
  font-weight: 500;
}

.title-icon {
  color: var(--c2);
  font-size: 14px;
}

.title-icon-svg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.title-icon-svg :deep(svg) {
  width: 15px;
  height: 15px;
  stroke-width: 2.1;
}

.profile-card {
  min-height: 275px;
  display: flex;
  flex-direction: column;
}

.profile-body {
  display: grid;
  grid-template-columns: 34% 1fr;
  min-height: 228px;
  flex: 1;
  padding: 12px 28px 18px;
}

.profile-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #dfd6c9;
  min-width: 0;
}

.avatar-large {
  width: 86px;
  height: 86px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(circle at 35% 30%, #9b734c, #6d4d30);
  color: #fff8ee;
  cursor: pointer;
  font-size: 32px;
  font-weight: 900;
  box-shadow: 0 8px 18px rgba(109, 77, 48, 0.16);
}

.avatar-large:disabled {
  cursor: progress;
  opacity: 0.82;
}

.avatar-input {
  display: none;
}

.profile-name {
  margin-top: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 21px;
  font-weight: 900;
}

.icon-edit {
  border: 0;
  background: transparent;
  color: var(--c2);
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
}

.profile-vip {
  margin-top: 13px;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  border: 1px solid #d5ad55;
  background: #fff1c9;
  color: var(--c2);
  font-size: 12px;
  font-weight: 800;
}

.avatar-error {
  margin-top: 8px;
  max-width: 170px;
  color: #b42318;
  font-size: 11px;
  text-align: center;
}

.profile-info {
  padding-left: 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.info-row {
  min-height: 41px;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #dfd6c9;
  font-size: 14px;
}

.info-row:last-of-type {
  border-bottom: 0;
}

.row-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #5a5046;
  font-weight: 700;
}

.row-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(154, 113, 73, 0.24);
  border-radius: 8px;
  background: rgba(154, 113, 73, 0.08);
  color: #8a6744;
}

.row-icon :deep(svg) {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.info-row strong {
  color: #121212;
  font-size: 15px;
}

.email-value {
  color: #2f2720;
  font-size: 13px;
  min-width: 0;
}

.verified {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.verified--ok {
  background: #dff0e4;
  color: #4c9862;
}

.verified--warn {
  background: #fff2cf;
  color: #9b6b16;
}

.primary-btn,
.ghost-btn {
  border-radius: 8px;
  min-height: 31px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 800;
}

.primary-btn {
  background: linear-gradient(180deg, #8a6744 0%, #755335 100%);
  color: #fff8ee;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.primary-btn:hover {
  filter: brightness(1.04);
}

.ghost-btn {
  background: rgba(246, 241, 232, 0.78);
  border-color: #d9cdbb;
  color: var(--c2);
}

.ghost-btn:hover {
  border-color: #b99f80;
  color: #65472f;
}

.profile-btn {
  margin-top: 10px;
  width: min(226px, 100%);
  align-self: start;
}

.profile-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(40, 29, 18, 0.38);
  backdrop-filter: blur(9px);
}

.profile-modal {
  width: min(560px, calc(100vw - 36px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid rgba(199, 180, 153, 0.9);
  border-radius: 18px;
  background: rgba(250, 246, 239, 0.94);
  box-shadow: 0 24px 70px rgba(53, 35, 18, 0.28);
  color: #2b2119;
}

.profile-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px 14px;
  border-bottom: 1px solid rgba(216, 204, 187, 0.8);
}

.profile-modal-head p {
  margin: 0 0 5px;
  color: #9a8f80;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.profile-modal-head h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.profile-modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid #d9cdbb;
  border-radius: 10px;
  background: rgba(246, 241, 232, 0.78);
  color: #7c5c3e;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.profile-modal-body {
  padding: 18px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-edit-avatar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  padding: 14px;
  border: 1px solid rgba(216, 204, 187, 0.8);
  border-radius: 14px;
  background: rgba(255, 252, 247, 0.54);
}

.profile-edit-avatar-btn {
  width: 72px;
  height: 72px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 50%;
  background: #9a7149;
  color: #fff8ee;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(120, 82, 45, 0.24);
}

.profile-edit-avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-edit-avatar-btn:disabled,
.profile-edit-upload:disabled,
.profile-modal-primary:disabled,
.profile-modal-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.profile-edit-upload {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #cbbba2;
  border-radius: 9px;
  background: rgba(246, 241, 232, 0.86);
  color: #6f4d30;
  cursor: pointer;
  font-weight: 800;
}

.profile-edit-avatar p {
  margin: 7px 0 0;
  color: #8f8477;
  font-size: 12px;
}

.profile-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.profile-edit-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.profile-edit-field span {
  color: #6e5840;
  font-size: 12px;
  font-weight: 900;
}

.profile-edit-field input,
.profile-edit-field select {
  width: 100%;
  min-height: 40px;
  border: 1px solid #d2c4ae;
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.82);
  color: #2b2119;
  font: 700 14px/1.2 inherit;
  outline: none;
  padding: 0 12px;
}

.profile-edit-field input:focus,
.profile-edit-field select:focus {
  border-color: #8a6744;
  box-shadow: 0 0 0 3px rgba(124, 92, 62, 0.12);
}

.profile-edit-field--locked input {
  background: rgba(234, 226, 215, 0.58);
  color: #7d7268;
  cursor: not-allowed;
}

.profile-locked-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px solid rgba(216, 204, 187, 0.82);
}

.profile-modal-error {
  margin: 0;
  color: #b42318;
  font-size: 12px;
  font-weight: 800;
}

.profile-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
}

.profile-modal-primary,
.profile-modal-secondary {
  min-width: 112px;
  min-height: 39px;
  border-radius: 10px;
  cursor: pointer;
  font: 900 14px/1 inherit;
}

.profile-modal-primary {
  border: 0;
  background: linear-gradient(180deg, #8a6744 0%, #755335 100%);
  color: #fff8ee;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.profile-modal-secondary {
  border: 1px solid #d9cdbb;
  background: rgba(246, 241, 232, 0.82);
  color: #6f4d30;
}

.status-card {
  min-height: 154px;
  display: flex;
  flex-direction: column;
}

.status-list {
  padding: 8px 18px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.status-row,
.config-row {
  display: grid;
  grid-template-columns: 21px minmax(86px, 0.66fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 21px;
  font-size: 12px;
}

.status-label,
.config-row > span:nth-child(2) {
  color: #4f463f;
  font-weight: 700;
}

.status-value,
.config-row strong {
  color: #6b6258;
  font-weight: 500;
  text-align: left;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.soft-icon,
.tile-icon {
  width: 20px;
  height: 20px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
}

.status-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.52);
}

.status-icon :deep(svg) {
  width: 13px;
  height: 13px;
  stroke-width: 2.15;
}

.soft-icon.purple { background: #efe8ff; color: #7c4dff; }
.soft-icon.gold { background: #fff0cf; color: #da8b18; }
.soft-icon.green { background: #dff0e4; color: #4c9862; }
.soft-icon.blue { background: #e6efff; color: #3f74d9; }
.soft-icon.teal { background: #dff5ef; color: #18a679; }
.soft-icon.cyan { background: #e4f6ff; color: #3a93c7; }
.soft-icon.red { background: #ffe7ec; color: #db4a63; }

.membership-card {
  min-height: 236px;
  display: flex;
  flex-direction: column;
}

.plans {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
  padding: 12px 14px 0;
}

.plan-card {
  min-height: 126px;
  height: auto;
  padding: 13px 12px 11px;
  position: relative;
  border: 1px solid #d9cdbb;
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.58);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--c0);
}

.plan-card.selected,
.plan-card.recommended {
  border-color: #f28a43;
  box-shadow: 0 0 0 1px rgba(242, 138, 67, 0.2);
}

.plan-card.value {
  overflow: hidden;
}

.plan-badge {
  position: absolute;
  top: -1px;
  right: -1px;
  min-width: 47px;
  height: 22px;
  border-radius: 0 10px 0 10px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  background: linear-gradient(135deg, #ff8a3d, #f06d2f);
}

.plan-card.value .plan-badge {
  background: linear-gradient(135deg, #a679ff, #8d5ee9);
}

.plan-name {
  font-size: 18px;
  font-weight: 900;
}

.plan-price {
  margin-top: 8px;
  font-size: 27px;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.plan-price small {
  font-size: 14px;
  font-weight: 500;
  color: #5f574e;
}

.plan-tags {
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.plan-tags span {
  border: 1px solid #d9cdbb;
  border-radius: 999px;
  background: rgba(246, 241, 232, 0.78);
  color: #5c5146;
  font-size: 11px;
  padding: 4px 8px;
  line-height: 1;
  white-space: nowrap;
}

.mini-chip {
  border: 1px solid #d9cdbb;
  border-radius: 999px;
  background: rgba(246, 241, 232, 0.78);
  color: #5c5146;
  font-size: 10px;
  padding: 4px 7px;
  line-height: 1;
  white-space: nowrap;
}

.membership-footer {
  margin-top: 0;
  padding: 10px 14px 13px;
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
  gap: 9px;
}

.charge-btn {
  width: 100%;
  min-height: 40px;
}

.safe-text {
  color: var(--mute);
  font-size: 12px;
  text-align: center;
}

.identity-card {
  min-height: auto;
  display: flex;
  flex-direction: column;
}

.config-list {
  padding: 12px 14px 15px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.identity-card .config-row {
  min-height: 56px;
  padding: 8px;
  border: 1px solid rgba(217, 205, 187, 0.76);
  border-radius: 8px;
  grid-template-columns: 28px minmax(0, 1fr);
  grid-template-rows: auto auto;
  background: rgba(255, 252, 247, 0.55);
}

.identity-card .soft-icon {
  grid-row: 1 / 3;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 13px;
}

.identity-card .config-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.identity-card .config-icon :deep(svg) {
  width: 16px;
  height: 16px;
  stroke-width: 2.05;
}

.identity-card .config-row > span:nth-child(2) {
  color: #5c5146;
  font-size: 11px;
  line-height: 1.15;
}

.identity-card .config-row strong {
  color: #2f2720;
  font-size: 13px;
  line-height: 1.18;
}

.favorites-card {
  grid-column: 1 / -1;
  min-height: 188px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.favorite-hero {
  padding: 15px 20px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(217, 205, 187, 0.78);
  background:
    linear-gradient(135deg, rgba(255, 244, 219, 0.72), rgba(246, 251, 247, 0.58) 52%, rgba(232, 240, 255, 0.48));
}

.favorite-heading {
  min-width: 0;
}

.favorite-eyebrow {
  height: 22px;
  padding: 0 9px;
  border: 1px solid rgba(196, 180, 156, 0.82);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 252, 247, 0.78);
  color: #7a5b3b;
  font-size: 11px;
  font-weight: 900;
}

.favorite-heading h2 {
  margin: 7px 0 4px;
  color: #241a12;
  font-size: 24px;
  line-height: 1.08;
}

.favorite-heading p {
  margin: 0;
  color: #6f655a;
  font-size: 13px;
}

.favorite-total-pill {
  width: 96px;
  min-height: 62px;
  border: 1px solid rgba(185, 159, 128, 0.72);
  border-radius: 8px;
  display: grid;
  place-items: center;
  align-content: center;
  background: rgba(255, 252, 247, 0.72);
  color: #7a5b3b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.favorite-total-pill strong {
  color: #241a12;
  font-size: 25px;
  line-height: 1;
}

.favorite-total-pill span {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 900;
}

.favorites-content {
  padding: 14px 16px 16px;
}

.device-panel {
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.45);
  padding: 6px 8px;
}

.section-mini-title {
  font-size: 12px;
  color: #6e5840;
  font-weight: 900;
}

.favorite-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  align-items: start;
  gap: 10px;
}

.favorite-tile {
  position: relative;
  min-height: 92px;
  padding: 12px;
  border: 1px solid rgba(217, 205, 187, 0.9);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  background: rgba(255, 252, 247, 0.62);
  color: #2f2720;
  text-align: left;
  cursor: pointer;
}

.favorite-tile:focus-visible {
  outline: 2px solid rgba(124, 92, 62, 0.35);
  outline-offset: 2px;
}

.favorite-tile .tile-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 15px;
}

.favorite-tile .favorite-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.52);
}

.favorite-tile .favorite-icon :deep(svg) {
  width: 17px;
  height: 17px;
  stroke-width: 2.05;
}

.favorite-tile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.favorite-tile-copy strong {
  color: #2b2118;
  font-size: 14px;
}

.favorite-tile-copy em {
  color: #81776b;
  font-size: 11px;
  font-style: normal;
  line-height: 1.25;
}

.favorite-tile b {
  position: absolute;
  top: 12px;
  right: 12px;
  color: #6e5840;
  font-size: 21px;
  line-height: 1;
}

.tile-icon.gold { background: #fff0cf; color: #f5a623; }
.tile-icon.orange { background: #ffe8d6; color: #d06f2a; }
.tile-icon.green { background: #dff0e4; color: #50b86a; }
.tile-icon.blue { background: #e6efff; color: #4f7bee; }
.tile-icon.purple { background: #efe8ff; color: #7c4dff; }
.tile-icon.cyan { background: #e5f7ff; color: #2b9fd8; }
.tile-icon.indigo { background: #e6efff; color: #4f7bee; }

.device-card {
  grid-column: 1 / -1;
  min-height: 180px;
}

.device-layout {
  padding: 10px 14px 15px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--layout-gap);
}

.device-panel {
  min-height: 126px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-record {
  min-height: 58px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 9px 0;
  border-bottom: 1px solid #e4dacd;
}

.device-record:last-child {
  border-bottom: 0;
}

.device-image-wrap {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(196, 180, 156, 0.72);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(250, 246, 239, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.device-image-wrap.small {
  width: 32px;
  height: 32px;
}

.device-image {
  width: 26px;
  height: 26px;
  display: block;
  object-fit: contain;
}

.device-image-wrap.small .device-image {
  width: 24px;
  height: 24px;
}

.device-copy {
  min-width: 0;
}

.device-copy strong,
.login-row strong {
  display: block;
  color: #2f2720;
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-copy p {
  margin: 3px 0 0;
  color: #8a8075;
  font-size: 12px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-side {
  min-width: 72px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.current-device {
  padding: 5px 9px;
  border-radius: 7px;
  background: #dff0e4;
  color: #4c9862;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.current-device.compact {
  padding: 4px 8px;
}

.device-time {
  color: #7f756a;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.login-row {
  font-size: 12px;
  color: #7a7066;
}

.login-row em {
  font-style: normal;
  color: #7a7066;
  text-align: right;
  white-space: nowrap;
}

.login-empty {
  display: flex;
  min-height: 42px;
  align-items: center;
  color: #8a8075;
  font-size: 12px;
  font-weight: 700;
}

.login-empty--error {
  color: #b86045;
}

.link-btn {
  display: block;
  margin: 12px 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--c2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 1320px) {
  .profile-sidebar {
    width: 200px;
    flex-basis: 200px;
  }

  .profile-main {
    padding-left: 20px;
    padding-right: 20px;
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(350px, 0.9fr);
  }

  .profile-body {
    padding-left: 20px;
    padding-right: 20px;
  }

  .profile-info {
    padding-left: 22px;
  }
}

@media (max-width: 1180px) {
  .personal-center-page {
    overflow-x: auto;
  }

  .profile-shell {
    min-width: 1000px;
  }
}

@media (max-width: 640px) {
  .profile-modal-overlay {
    padding: 16px;
    align-items: center;
  }

  .profile-modal {
    width: calc(100vw - 28px);
  }

  .profile-modal-head,
  .profile-modal-body,
  .profile-modal-actions {
    padding-left: 18px;
    padding-right: 18px;
  }

  .profile-edit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
