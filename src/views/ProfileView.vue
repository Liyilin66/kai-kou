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
const avatarDraftBlob = ref(null);
const avatarDraftPreviewUrl = ref("");
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
const modalAvatarPreview = computed(() => avatarDraftPreviewUrl.value || userAvatarUrl.value);
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
  clearAvatarDraft();
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
    const avatarBlob = await createAvatarBlob(file);
    setAvatarDraftBlob(avatarBlob);
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
  clearAvatarDraft();
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
      avatarBlob: avatarDraftBlob.value
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
    clearAvatarDraft();
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
  clearAvatarDraft();
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

async function createAvatarBlob(file) {
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
  if (blob.size > 1024 * 1024) {
    throw new Error("头像处理失败，请换一张图片重试");
  }
  return blob;
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

function setAvatarDraftBlob(blob) {
  clearAvatarDraft();
  avatarDraftBlob.value = blob;
  avatarDraftPreviewUrl.value = URL.createObjectURL(blob);
}

function clearAvatarDraft() {
  avatarDraftBlob.value = null;
  if (avatarDraftPreviewUrl.value) {
    URL.revokeObjectURL(avatarDraftPreviewUrl.value);
    avatarDraftPreviewUrl.value = "";
  }
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
          <div class="profile-promo-title">WE 模板库</div>
          <div class="profile-promo-sub">写作结构 · 模板参考</div>
          <button class="profile-promo-button" type="button" @click="goTo('/we/templates')">查看模板</button>
        </div>
      </div>
    </aside>

    <section class="profile-shell">
      <header class="profile-topbar">
        <div>
          <div class="hello">你好，{{ userDisplayName }}</div>
          <div class="hello-sub">坚持每天进步一点，PTE 梦想更近一步！</div>
        </div>

        <div class="topbar-actions">
          <div class="vip-pill" :class="`vip-pill--${membershipPill.kind}`">
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
                  <div class="profile-vip">{{ membershipPill.label }}</div>
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
                <div class="safe-text">安全支付 · 随时可取消 · 专属客服支持</div>
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
                <strong class="kk-num">{{ formatFavoriteCount(favoriteTotalCount) }}</strong>
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
                  <b class="kk-num">{{ formatFavoriteCount(item.count) }}</b>
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
/* Visual rules: docs/ui-guidelines.md. Tokens (--kk-*) live in src/assets/styles/main.css. */
*,*::before,*::after{box-sizing:border-box;}
.personal-center-page{display:flex;width:100%;height:100vh;overflow:hidden;background:var(--kk-bg);color:var(--kk-ink);font-family:var(--kk-font);font-size:15px;line-height:1.55;}
button,input,select{font:inherit;}

/* Sidebar (desktop only), same as home */
.profile-sidebar{display:none;flex:0 0 232px;width:232px;flex-direction:column;background:var(--kk-surface);border-right:1px solid var(--kk-line);}
.profile-logo{display:flex;align-items:center;gap:10px;height:72px;flex:0 0 72px;padding:0 24px;text-decoration:none;}
.profile-logo-icon{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:var(--kk-action);flex-shrink:0;}
.profile-logo-name{color:var(--kk-ink);font-size:18px;font-weight:700;}
.profile-nav{display:flex;flex:1;flex-direction:column;gap:4px;padding:8px 16px 24px;}
.profile-nav-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 14px;border-radius:12px;color:var(--kk-ink-2);font-size:15px;text-decoration:none;transition:background .15s,color .15s;}
.profile-nav-item:hover{background:var(--kk-surface-2);color:var(--kk-ink);}
.profile-nav-item--active,.profile-nav-item--active:hover{background:var(--kk-action-soft);color:var(--kk-action-text);font-weight:600;}
.profile-nav-icon{display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;}
.profile-nav-icon :deep(svg){width:18px;height:18px;}
.profile-sidebar-footer{padding:16px;}
.profile-promo{padding:16px;border-radius:16px;background:var(--kk-surface-2);}
.profile-promo-title{margin-bottom:2px;color:var(--kk-ink);font-size:15px;font-weight:600;}
.profile-promo-sub{margin-bottom:12px;color:var(--kk-ink-3);font-size:13px;}
.profile-promo-button{display:inline-flex;align-items:center;min-height:36px;padding:0 16px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font-size:13px;font-weight:600;cursor:pointer;}

/* Shell and top bar */
.profile-shell{flex:1;min-width:0;display:flex;flex-direction:column;height:100vh;}
.profile-topbar{min-height:64px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:var(--kk-surface);border-bottom:1px solid var(--kk-line);}
.profile-topbar > div:first-child{min-width:0;}
.hello{font-size:18px;font-weight:700;line-height:1.3;overflow-wrap:anywhere;}
.hello-sub{display:none;font-size:13px;color:var(--kk-ink-3);}
.topbar-actions{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.vip-pill{display:none;align-items:center;height:30px;padding:0 12px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:13px;font-weight:600;white-space:nowrap;}
.vip-pill--vip{background:var(--kk-notice-bg);color:var(--kk-notice);}
.user-mini{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;}
.user-mini > span:last-child{display:none;}
.mini-avatar{width:36px;height:36px;border-radius:50%;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;}
.mini-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.logout-btn{min-height:36px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink-2);font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;}
.logout-btn:hover{color:var(--kk-error);}
.logout-btn:disabled{opacity:.45;cursor:not-allowed;}

/* Main */
.profile-main{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 16px 40px;}
.profile-main::-webkit-scrollbar{width:6px;}
.profile-main::-webkit-scrollbar-thumb{background:var(--kk-line);border-radius:99px;}
.page-heading{max-width:1160px;margin:0 auto 16px;display:flex;flex-wrap:wrap;align-items:baseline;column-gap:12px;}
.page-heading h1{margin:0;font-size:24px;font-weight:700;line-height:1.3;}
.page-heading span{font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--kk-ink-3);}
.page-heading p{flex-basis:100%;margin:4px 0 0;font-size:14px;color:var(--kk-ink-2);}
.dashboard-grid{max-width:1160px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:16px;}
.dashboard-column{display:flex;flex-direction:column;gap:16px;min-width:0;}

.pc-card{min-width:0;padding:20px;border:1px solid var(--kk-line);border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow);}
.card-title{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:17px;font-weight:600;line-height:1.4;}
.card-title.with-note{flex-wrap:wrap;justify-content:space-between;}
.card-title em{font-style:normal;font-size:13px;font-weight:500;color:var(--kk-ink-3);}
.title-icon{display:none;}

/* Profile card */
.profile-body{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;}
.profile-left{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;}
.avatar-large{width:96px;height:96px;padding:0;border:0;border-radius:50%;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:36px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;}
.avatar-large img{width:100%;height:100%;object-fit:cover;display:block;}
.avatar-large:disabled{opacity:.6;cursor:wait;}
.avatar-input{display:none;}
.profile-name{display:flex;align-items:center;justify-content:center;gap:4px;font-size:20px;font-weight:700;overflow-wrap:anywhere;}
.icon-edit{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:var(--kk-ink-2);font-size:16px;cursor:pointer;}
.icon-edit:hover{background:var(--kk-surface-2);}
.profile-vip{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:13px;font-weight:600;}
.avatar-error{font-size:13px;color:var(--kk-error);}
.profile-info{display:flex;flex-direction:column;min-width:0;}
.info-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:52px;padding:8px 0;border-top:1px solid var(--kk-line);}
.info-row:first-child{border-top:0;}
.row-label{display:inline-flex;align-items:center;gap:8px;flex:0 0 96px;font-size:14px;color:var(--kk-ink-2);}
.row-icon{display:inline-flex;width:16px;height:16px;color:var(--kk-ink-3);font-style:normal;}
.row-icon :deep(svg){width:16px;height:16px;}
.info-row strong{font-size:15px;font-weight:600;}
.email-value{min-width:0;font-size:15px;overflow-wrap:anywhere;}
.verified{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;}
.verified--ok{background:var(--kk-success-bg);color:var(--kk-success);}
.verified--warn{background:var(--kk-notice-bg);color:var(--kk-notice);}
.primary-btn{min-height:48px;padding:0 24px;border:0;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;transition:background .15s;}
.profile-btn{margin-top:12px;align-self:flex-start;border:1px solid var(--kk-line);background:var(--kk-surface);color:var(--kk-ink);font-weight:600;}
.profile-btn:hover{background:var(--kk-surface-2);}
.charge-btn{background:var(--kk-action);color:var(--kk-on-action);}
.charge-btn:hover{background:var(--kk-action-hover);}
.charge-btn:active{background:var(--kk-action-press);}

/* Membership */
.plans{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;}
.plan-card{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:16px;border:1px solid var(--kk-line);border-radius:16px;background:var(--kk-surface);color:var(--kk-ink);text-align:left;cursor:pointer;transition:border-color .15s,background .15s;}
.plan-card:hover{background:var(--kk-surface-2);}
.plan-card.selected{border-color:var(--kk-ink);box-shadow:inset 0 0 0 1px var(--kk-ink);}
.plan-badge{position:absolute;top:-10px;right:12px;display:inline-flex;align-items:center;height:22px;padding:0 10px;border-radius:999px;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:12px;font-weight:600;}
.plan-name{font-size:15px;font-weight:600;}
.plan-price{font-family:var(--kk-font-num);font-size:28px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;}
.plan-price small{font-family:var(--kk-font);font-size:13px;font-weight:500;color:var(--kk-ink-3);}
.plan-tags{display:flex;flex-wrap:wrap;gap:6px;}
.plan-tags span{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:12px;}
.membership-footer{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:16px;}
.membership-footer .charge-btn{flex:1 1 200px;}
.safe-text{font-size:13px;color:var(--kk-ink-3);}

/* Status and identity rows */
.status-list,.config-list{display:flex;flex-direction:column;}
.status-row,.config-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:56px;padding:8px 0;border-top:1px solid var(--kk-line);}
.status-row:first-child,.config-row:first-child{border-top:0;}
.soft-icon{width:36px;height:36px;border-radius:50%;background:var(--kk-surface-2);color:var(--kk-ink-2);display:flex;align-items:center;justify-content:center;}
.soft-icon :deep(svg){width:18px;height:18px;}
.status-label,.config-row > span:nth-child(2){font-size:14px;color:var(--kk-ink-2);}
.status-value,.config-row strong{font-size:15px;font-weight:600;color:var(--kk-ink);text-align:right;overflow-wrap:anywhere;}

/* Favorites */
.favorite-hero{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;}
.favorite-heading{min-width:0;}
.favorite-eyebrow{font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--kk-ink-3);}
.favorite-heading h2{margin:2px 0 0;font-size:20px;font-weight:700;}
.favorite-heading p{margin:4px 0 0;font-size:14px;color:var(--kk-ink-2);}
.favorite-total-pill{display:flex;align-items:baseline;gap:6px;}
.favorite-total-pill strong{font-size:32px;font-weight:800;line-height:1;}
.favorite-total-pill span{font-size:13px;color:var(--kk-ink-3);}
.favorite-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
.favorite-tile{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:72px;padding:14px;border-radius:16px;background:var(--kk-surface-2);cursor:pointer;transition:background .15s;}
.favorite-tile:hover{background:var(--kk-line);}
.tile-icon{width:36px;height:36px;border-radius:50%;background:var(--kk-surface);color:var(--kk-ink-2);display:flex;align-items:center;justify-content:center;}
.tile-icon :deep(svg){width:18px;height:18px;}
.favorite-tile-copy{display:flex;flex-direction:column;min-width:0;}
.favorite-tile-copy strong{font-size:15px;font-weight:600;}
.favorite-tile-copy em{font-style:normal;font-size:13px;color:var(--kk-ink-3);}
.favorite-tile b{font-size:22px;font-weight:800;}

/* Devices and login records */
.device-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;}
.device-panel{display:flex;flex-direction:column;min-width:0;}
.section-mini-title{margin-bottom:6px;font-size:13px;font-weight:600;color:var(--kk-ink-3);}
.device-record{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:64px;padding:10px 0;border-top:1px solid var(--kk-line);}
.section-mini-title + .device-record{border-top:0;}
.device-image-wrap{width:44px;height:44px;border-radius:50%;background:var(--kk-surface-2);display:flex;align-items:center;justify-content:center;}
.device-image-wrap.small{width:36px;height:36px;}
.device-image{width:24px;height:24px;object-fit:contain;}
.device-copy{min-width:0;}
.device-copy strong{font-size:15px;font-weight:600;}
.device-copy p{margin:0;font-size:13px;color:var(--kk-ink-3);overflow-wrap:anywhere;}
.device-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;text-align:right;}
.device-time,.device-side em{font-style:normal;font-size:12px;color:var(--kk-ink-3);white-space:nowrap;}
.current-device{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--kk-success-bg);color:var(--kk-success);font-size:12px;font-weight:600;white-space:nowrap;}
.current-device.compact{height:22px;padding:0 8px;}
.login-empty{padding:14px;border:1px dashed var(--kk-line);border-radius:12px;font-size:14px;color:var(--kk-ink-3);text-align:center;}
.login-empty--error{border-color:var(--kk-error-line);background:var(--kk-error-bg);color:var(--kk-error);}
.link-btn{align-self:flex-start;min-height:44px;margin-top:4px;padding:0;border:0;background:none;color:var(--kk-action-text);font-size:14px;font-weight:600;cursor:pointer;}

/* Edit-profile modal */
.profile-modal-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(30,27,24,.32);font-family:var(--kk-font);color:var(--kk-ink);}
.profile-modal{width:min(480px,100%);max-height:calc(100vh - 32px);overflow-y:auto;border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow-pop);}
.profile-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 24px 8px;}
.profile-modal-head p{margin:0;font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--kk-ink-3);}
.profile-modal-head h2{margin:2px 0 0;font-size:22px;font-weight:700;}
.profile-modal-close{width:44px;height:44px;flex-shrink:0;border:1px solid var(--kk-line);border-radius:50%;background:var(--kk-surface);color:var(--kk-ink);font-size:22px;line-height:1;cursor:pointer;}
.profile-modal-body{display:flex;flex-direction:column;gap:14px;padding:12px 24px 8px;}
.profile-edit-avatar{display:flex;align-items:center;gap:16px;}
.profile-edit-avatar p{margin:4px 0 0;font-size:13px;color:var(--kk-ink-3);overflow-wrap:anywhere;}
.profile-edit-avatar-btn{width:72px;height:72px;flex-shrink:0;padding:0;border:0;border-radius:50%;background:var(--kk-ink);color:var(--kk-ink-inverse);font-size:28px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;}
.profile-edit-avatar-btn img{width:100%;height:100%;object-fit:cover;}
.profile-edit-upload{min-height:40px;padding:0 16px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font-size:14px;font-weight:600;cursor:pointer;}
.profile-edit-field{display:flex;flex-direction:column;gap:6px;min-width:0;}
.profile-edit-field span{font-size:13px;font-weight:600;color:var(--kk-ink-2);}
.profile-edit-field input,.profile-edit-field select{width:100%;min-height:48px;padding:0 14px;border:1px solid var(--kk-line);border-radius:12px;background:var(--kk-surface-2);color:var(--kk-ink);font-size:15px;outline:none;}
.profile-edit-field input:focus,.profile-edit-field select:focus{border-color:var(--kk-ink);background:var(--kk-surface);}
.profile-edit-field--locked input{color:var(--kk-ink-3);}
.profile-edit-grid,.profile-locked-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;}
.profile-modal-error{margin:0;font-size:13px;color:var(--kk-error);}
.profile-modal-actions{display:flex;gap:10px;padding:16px 24px 24px;}
.profile-modal-secondary,.profile-modal-primary{flex:1;min-height:48px;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;}
.profile-modal-secondary{border:1px solid var(--kk-line);background:var(--kk-surface);color:var(--kk-ink);}
.profile-modal-primary{border:0;background:var(--kk-action);color:var(--kk-on-action);}
.profile-modal-primary:hover{background:var(--kk-action-hover);}
.profile-modal-secondary:disabled,.profile-modal-primary:disabled{opacity:.45;cursor:not-allowed;}

@media (min-width:480px){
  .profile-edit-grid,.profile-locked-fields{grid-template-columns:repeat(2,minmax(0,1fr));}
}

@media (min-width:600px){
  .profile-body{grid-template-columns:200px minmax(0,1fr);align-items:start;}
  .plans{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}
}

/* Tablet 768–1023 */
@media (min-width:768px){
  .profile-topbar{padding:12px 24px;}
  .hello{font-size:22px;}
  .hello-sub{display:block;}
  .vip-pill{display:inline-flex;}
  .profile-main{padding:24px 24px 48px;}
  .page-heading h1{font-size:28px;}
  .pc-card{padding:24px;}
  .device-layout{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px;}
}

/* Desktop ≥1024: sidebar appears; two-column dashboard */
@media (min-width:1024px){
  .profile-sidebar{display:flex;}
  .user-mini > span:last-child{display:inline;}
  .profile-topbar{min-height:72px;padding:12px 40px;}
  .hello{font-size:26px;}
  .profile-main{padding:28px 40px 56px;}
  .page-heading{margin-bottom:20px;}
  .dashboard-grid{gap:20px;}
  .dashboard-column{gap:20px;}
}

@media (min-width:1200px){
  .dashboard-grid{grid-template-columns:minmax(0,3fr) minmax(0,2fr);}
  .favorites-card,.device-card{grid-column:1 / -1;}
}
</style>
