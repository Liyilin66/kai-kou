<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { supabase } from "@/lib/supabase";
import {
  getLastRTSRecentAudioHistoryDebug,
  getRTSPlaybackUrl,
  isValidRTSRemoteHistoryRecord,
  RTS_TOPIC_META,
  useRTSData
} from "@/composables/useRTSData";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const {
  loadQuestions,
  getTopicStats,
  getUserRTSStats,
  getRTSRecentAudioHistory
} = useRTSData();
const RTS_HOME_DEBUG_ENABLED = Boolean(import.meta.env.DEV);

const loading = ref(true);
const topicCards = ref([]);
const stats = ref({
  todayPracticed: 0,
  totalQuestions: 0,
  averageRating: 0
});
const currentPractice = ref(null);
const recentAudioHistory = ref([]);
const currentPracticePlayback = ref({
  url: "",
  loading: false,
  error: ""
});
const historyPlaybackById = reactive({});
const visibleHistoryItems = computed(() => {
  const rows = Array.isArray(recentAudioHistory.value) ? recentAudioHistory.value : [];
  return rows.filter((item) => isValidRTSRemoteHistoryRecord(item)).slice(0, 20);
});
const hasLoadedOnce = ref(false);
const dashboardRefreshPending = ref(false);
const DASHBOARD_REFRESH_DEBOUNCE_MS = 120;
const DASHBOARD_PRACTICE_RETURN_RETRY_MS = 680;
const RTS_HOME_REFRESH_HINT_KEY = "RTS_HOME_REFRESH_HINT_V1";
const hintedQuestionId = ref("");
let dashboardRefreshTimer = null;
let practiceReturnRetryTimer = null;
let dashboardRequestSeq = 0;
let latestMissingCurrentPracticeRetryKey = "";

function clearDashboardRefreshTimer() {
  if (!dashboardRefreshTimer) return;
  clearTimeout(dashboardRefreshTimer);
  dashboardRefreshTimer = null;
}

function clearPracticeReturnRetryTimer() {
  if (!practiceReturnRetryTimer) return;
  clearTimeout(practiceReturnRetryTimer);
  practiceReturnRetryTimer = null;
}

function goHome() {
  router.push("/home");
}

function goList() {
  router.push("/rts/list");
}

function startRandomPractice() {
  router.push("/rts/practice");
}

function goCategory(topic) {
  const normalized = `${topic || ""}`.trim();
  if (!normalized) return;
  router.push({
    path: "/rts/list",
    query: { category: normalized }
  });
}

function replayQuestion(questionId) {
  const normalized = `${questionId || ""}`.trim();
  if (!normalized) return;
  router.push({
    path: "/rts/practice",
    query: { id: normalized }
  });
}

function renderStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return "★".repeat(rating).padEnd(5, "☆");
}

function formatDuration(seconds) {
  const normalized = Math.max(0, Math.round(Number(seconds || 0)));
  if (!normalized) return "0:00";
  const m = Math.floor(normalized / 60);
  const s = `${normalized % 60}`.padStart(2, "0");
  return `${m}:${s}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function topicLabel(topic) {
  return RTS_TOPIC_META[`${topic || ""}`.trim()]?.label || "日常生活";
}

function normalizeHistoryRecordId(value) {
  const id = `${value || ""}`.trim();
  return id || "unknown";
}

function clearHistoryPlaybackState() {
  Object.keys(historyPlaybackById).forEach((key) => {
    delete historyPlaybackById[key];
  });
}

function resetCurrentPracticePlayback() {
  currentPracticePlayback.value = {
    url: "",
    loading: false,
    error: ""
  };
}

function getHistoryPlaybackState(recordId) {
  const id = normalizeHistoryRecordId(recordId);
  if (!historyPlaybackById[id]) {
    historyPlaybackById[id] = {
      url: "",
      loading: false,
      error: ""
    };
  }
  return historyPlaybackById[id];
}

async function loadCurrentPracticePlayback({ force = false } = {}) {
  if (!currentPractice.value?.hasAudio) return "";
  if (!force && currentPracticePlayback.value.url) return currentPracticePlayback.value.url;
  if (currentPracticePlayback.value.loading) return "";

  currentPracticePlayback.value = {
    ...currentPracticePlayback.value,
    loading: true,
    error: ""
  };

  const signedUrl = await getRTSPlaybackUrl(currentPractice.value.audioMeta, 60 * 20);
  if (!signedUrl) {
    currentPracticePlayback.value = {
      ...currentPracticePlayback.value,
      loading: false,
      error: "回放链接获取失败，请重试。"
    };
    return "";
  }

  currentPracticePlayback.value = {
    url: signedUrl,
    loading: false,
    error: ""
  };
  return signedUrl;
}

async function loadHistoryPlayback(item, { force = false } = {}) {
  if (!isValidRTSRemoteHistoryRecord(item)) return "";
  const state = getHistoryPlaybackState(item.id);
  if (!force && state.url) return state.url;
  if (state.loading) return "";

  state.loading = true;
  state.error = "";
  const signedUrl = await getRTSPlaybackUrl(item.audioMeta, 60 * 20);
  if (!signedUrl) {
    state.loading = false;
    state.error = "回放链接获取失败，请重试。";
    return "";
  }

  state.url = signedUrl;
  state.loading = false;
  state.error = "";
  return signedUrl;
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

function consumeRTSHomeRefreshHint() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  const raw = `${window.sessionStorage.getItem(RTS_HOME_REFRESH_HINT_KEY) || ""}`.trim();
  if (!raw) return null;
  window.sessionStorage.removeItem(RTS_HOME_REFRESH_HINT_KEY);

  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return null;
    const questionId = `${payload.questionId || ""}`.trim();
    const at = Number(payload.at || 0);
    if (!questionId || !Number.isFinite(at)) return null;
    return {
      questionId,
      at
    };
  } catch {
    return null;
  }
}

function resolveDashboardQuestionId() {
  const sessionQuestionId = `${practiceStore.rtsSession?.questionId || ""}`.trim();
  if (sessionQuestionId) {
    if (hintedQuestionId.value === sessionQuestionId) {
      hintedQuestionId.value = "";
    }
    return sessionQuestionId;
  }
  return `${hintedQuestionId.value || ""}`.trim();
}

function scheduleDashboardReload(reason = "", { immediate = false } = {}) {
  clearDashboardRefreshTimer();
  if (immediate) {
    void loadDashboard({ reason });
    return;
  }
  dashboardRefreshTimer = setTimeout(() => {
    dashboardRefreshTimer = null;
    void loadDashboard({ reason });
  }, DASHBOARD_REFRESH_DEBOUNCE_MS);
}

function triggerEntryReload(reason = "entry_reload") {
  const refreshHint = consumeRTSHomeRefreshHint();
  if (refreshHint?.questionId) {
    hintedQuestionId.value = refreshHint.questionId;
  }

  scheduleDashboardReload(reason, { immediate: true });

  if (!refreshHint?.questionId) return;
  clearPracticeReturnRetryTimer();
  practiceReturnRetryTimer = setTimeout(() => {
    practiceReturnRetryTimer = null;
    void loadDashboard({ reason: `${reason}_practice_retry` });
  }, DASHBOARD_PRACTICE_RETURN_RETRY_MS);
}

async function loadDashboard({ reason = "" } = {}) {
  const requestSeq = ++dashboardRequestSeq;
  if (!hasLoadedOnce.value) {
    loading.value = true;
  } else {
    dashboardRefreshPending.value = true;
  }

  try {
    const questions = await loadQuestions();
    if (requestSeq !== dashboardRequestSeq) return;
    topicCards.value = getTopicStats(questions);

    const userId = await resolveCurrentUserId();
    if (requestSeq !== dashboardRequestSeq) return;
    if (!userId) {
      stats.value = {
        todayPracticed: 0,
        totalQuestions: questions.length,
        averageRating: 0
      };
      currentPractice.value = null;
      recentAudioHistory.value = [];
      resetCurrentPracticePlayback();
      clearHistoryPlaybackState();
      return;
    }

    const currentQuestionId = resolveDashboardQuestionId();
    const [userStats, recentHistory] = await Promise.all([
      getUserRTSStats(userId, {
        logsLimit: 400,
        currentQuestionId
      }),
      getRTSRecentAudioHistory(userId, {
        limit: 20,
        includePlaybackUrls: false
      })
    ]);
    if (requestSeq !== dashboardRequestSeq) return;

    stats.value = {
      todayPracticed: userStats.todayPracticed,
      totalQuestions: userStats.totalQuestions,
      averageRating: userStats.averageRating
    };
    const nextCurrentPractice = userStats.currentQuestionLatestLog || null;
    const missingCurrentPracticeRetryKey = (
      currentQuestionId && !nextCurrentPractice
    ) ? `${userId}|${currentQuestionId}` : "";
    if (missingCurrentPracticeRetryKey) {
      if (latestMissingCurrentPracticeRetryKey !== missingCurrentPracticeRetryKey) {
        latestMissingCurrentPracticeRetryKey = missingCurrentPracticeRetryKey;
        scheduleDashboardReload("current_question_retry");
      }
    } else {
      latestMissingCurrentPracticeRetryKey = "";
    }

    currentPractice.value = nextCurrentPractice;
    recentAudioHistory.value = Array.isArray(recentHistory) ? recentHistory : [];
    resetCurrentPracticePlayback();
    clearHistoryPlaybackState();
    if (RTS_HOME_DEBUG_ENABLED) {
      const historyDebug = getLastRTSRecentAudioHistoryDebug();
      console.info("[rts-home:history-load]", {
        fetchedCount: Number(historyDebug.fetchedCount || 0),
        validRemoteAudioCount: Number(historyDebug.validRemoteAudioCount || 0),
        topAudioMeta: Array.isArray(historyDebug.topAudioMeta) ? historyDebug.topAudioMeta.slice(0, 3) : []
      });
    }
  } finally {
    if (requestSeq === dashboardRequestSeq) {
      hasLoadedOnce.value = true;
      loading.value = false;
      dashboardRefreshPending.value = false;
    }
  }
}

onMounted(() => {
  triggerEntryReload("mounted");
});

onActivated(() => {
  triggerEntryReload("activated");
});

watch(
  () => route.fullPath,
  (nextPath, prevPath) => {
    if (nextPath === prevPath) return;
    if (`${nextPath || ""}`.trim().startsWith("/rts")) {
      scheduleDashboardReload("route_change", { immediate: true });
    }
  }
);

watch(
  () => `${authStore.loaded ? "ready" : "pending"}|${authStore.user?.id || ""}`,
  (nextValue, prevValue) => {
    if (nextValue === prevValue) return;
    scheduleDashboardReload("auth_change");
  }
);

watch(
  () => `${practiceStore.rtsSession?.questionId || ""}`.trim(),
  (nextQuestionId, prevQuestionId) => {
    if (nextQuestionId === prevQuestionId) return;
    if (nextQuestionId) {
      hintedQuestionId.value = "";
    }
    scheduleDashboardReload("question_change", {
      immediate: Boolean(nextQuestionId)
    });
  }
);

onBeforeUnmount(() => {
  clearDashboardRefreshTimer();
  clearPracticeReturnRetryTimer();
});
</script>

<template>
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goHome">← 返回</button>
        <p class="text-base font-semibold">RTS 情景回应</p>
        <button
          type="button"
          class="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          @click="goList"
        >
          题库
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <section class="rounded-[14px] bg-[#1B3A6B] p-5 text-white">
        <p class="text-xs uppercase tracking-[0.15em] text-white/75">Respond to a situation</p>
        <h1 class="mt-2 text-3xl font-bold">听懂场景，开口回应</h1>
        <p class="mt-3 text-sm leading-relaxed text-white/90">
          系统播放场景和文字，你需要代入角色给出得体口语回应，重点训练语气与场景匹配。
        </p>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.todayPracticed }}</p>
            <p class="mt-1 text-xs text-white/80">今日已练</p>
          </article>
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.totalQuestions }}</p>
            <p class="mt-1 text-xs text-white/80">题库总量</p>
          </article>
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.averageRating || "0.0" }}</p>
            <p class="mt-1 text-xs text-white/80">平均评分</p>
          </article>
        </div>
      </section>

      <section class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-[14px] bg-[#E8845A] p-5 text-left text-white transition-transform hover:-translate-y-0.5"
          @click="startRandomPractice"
        >
          <p class="text-sm font-semibold">随机练习</p>
          <p class="mt-2 text-xs text-white/90">从题库随机抽题</p>
        </button>
        <button
          type="button"
          class="rounded-[14px] border border-[#E8EDF5] bg-white p-5 text-left text-[#1B3A6B] transition-colors hover:bg-[#F8FAFD]"
          @click="goList"
        >
          <p class="text-sm font-semibold">选题练习</p>
          <p class="mt-2 text-xs text-[#8CA0C0]">按场景和难度筛选</p>
        </button>
      </section>

      <section class="mt-5">
        <p class="mb-2 text-sm font-semibold text-[#1B3A6B]">按场景分类练习</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            v-for="topic in topicCards"
            :key="topic.key"
            type="button"
            class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-left transition-colors hover:bg-[#F8FAFD]"
            @click="goCategory(topic.key)"
          >
            <p class="text-xl">{{ topic.emoji }}</p>
            <p class="mt-1 text-base font-semibold text-[#1E293B]">{{ topic.label }}</p>
            <p class="mt-1 text-xs text-[#8CA0C0]">{{ topic.count }} 题</p>
            <span class="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs" :class="topic.badgeClass">{{ topic.tag }}</span>
          </button>
        </div>
      </section>

      <section class="mt-5">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-[#1B3A6B]">最近练习（当前题）</p>
          <button type="button" class="text-xs text-[#8CA0C0] hover:text-[#1B3A6B]" @click="goList">查看全部题库</button>
        </div>

        <div v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          正在读取练习记录...
        </div>
        <div v-else-if="!currentPractice" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          当前题目还没有练习记录，先完成一题再回来查看。
        </div>

        <div v-else class="space-y-2">
          <article class="w-full rounded-[14px] border border-[#E8EDF5] bg-white px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <p class="line-clamp-1 text-sm font-medium text-[#1E293B]">{{ currentPractice.summary }}</p>
              <p class="text-sm text-[#1B3A6B]">[{{ renderStars(currentPractice.rating) }}]</p>
            </div>
            <p class="mt-1 text-xs text-[#8CA0C0]">
              {{ topicLabel(currentPractice.topic) }} · {{ formatDuration(currentPractice.durationSec) }}
            </p>

            <div v-if="currentPractice.hasAudio" class="mt-2 space-y-2">
              <audio
                v-if="currentPracticePlayback.url"
                class="w-full"
                :src="currentPracticePlayback.url"
                controls
                preload="none"
              />
              <button
                type="button"
                class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
                :disabled="currentPracticePlayback.loading"
                @click="loadCurrentPracticePlayback()"
              >
                {{
                  currentPracticePlayback.loading
                    ? "加载中..."
                    : currentPracticePlayback.url
                      ? "刷新回放链接"
                      : "加载并播放录音"
                }}
              </button>
              <p v-if="currentPracticePlayback.error" class="text-xs text-[#D92D20]">{{ currentPracticePlayback.error }}</p>
            </div>

            <button
              type="button"
              class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
              @click="replayQuestion(currentPractice.questionId)"
            >
              进入题目重练
            </button>
          </article>
        </div>
      </section>

      <section class="mt-5">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-[#1B3A6B]">历史录音（最近20条）</p>
          <button type="button" class="text-xs text-[#8CA0C0] hover:text-[#1B3A6B]" @click="loadDashboard">刷新列表</button>
        </div>

        <div v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          正在加载历史录音...
        </div>
        <div v-else-if="!visibleHistoryItems.length" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          还没有可回放的历史录音。
        </div>

        <div v-else class="space-y-2">
          <article
            v-for="item in visibleHistoryItems"
            :key="item.id"
            class="rounded-[14px] border border-[#E8EDF5] bg-white px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="line-clamp-1 text-sm font-medium text-[#1E293B]">{{ item.summary }}</p>
              <p class="text-sm text-[#1B3A6B]">[{{ renderStars(item.rating) }}]</p>
            </div>
            <p class="mt-1 text-xs text-[#8CA0C0]">
              {{ formatDateTime(item.createdAt) }} · {{ formatDuration(item.durationSec) }}
            </p>

            <div v-if="isValidRTSRemoteHistoryRecord(item)" class="mt-2 space-y-2">
              <audio
                v-if="getHistoryPlaybackState(item.id).url"
                class="w-full"
                :src="getHistoryPlaybackState(item.id).url"
                controls
                preload="none"
              />
              <button
                type="button"
                class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
                :disabled="getHistoryPlaybackState(item.id).loading"
                @click="loadHistoryPlayback(item)"
              >
                {{
                  getHistoryPlaybackState(item.id).loading
                    ? "加载中..."
                    : getHistoryPlaybackState(item.id).url
                      ? "刷新回放链接"
                      : "加载并播放录音"
                }}
              </button>
              <p v-if="getHistoryPlaybackState(item.id).error" class="text-xs text-[#D92D20]">
                {{ getHistoryPlaybackState(item.id).error }}
              </p>
            </div>

            <button
              type="button"
              class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
              @click="replayQuestion(item.questionId)"
            >
              进入题目重练
            </button>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
