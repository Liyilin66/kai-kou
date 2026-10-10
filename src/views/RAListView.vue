<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchQuestions } from "@/lib/questions";
import { normalizeRALog } from "@/lib/ra-history";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();

const allQuestions = ref([]);
const loading = ref(true);
const historyLoading = ref(true);
const favoriteLoading = ref(true);
const favoriteSource = ref("remote");
const searchQ = ref("");
const selectedDiff = ref(normalizeDifficultyQuery(route.query.difficulty));
const selectedStatus = ref("all");
const practiceMode = ref("rand");
const raLogs = ref([]);
const favoriteIds = ref(new Set());
const favoriteBusyIds = ref(new Set());

const RECENT_LOG_LIMIT = 600;
const SCORE_WEAK_THRESHOLD = 60;

const questionHistoryById = computed(() => {
  const grouped = new Map();
  for (const log of raLogs.value) {
    const questionId = normalizeText(log?.questionId);
    if (!questionId) continue;
    const list = grouped.get(questionId) || [];
    list.push(log);
    grouped.set(questionId, list);
  }
  return grouped;
});

const questionCards = computed(() =>
  allQuestions.value.map((question, index) => {
    const id = normalizeText(question?.id) || `RA_${String(index + 1).padStart(3, "0")}`;
    const text = normalizeText(question?.content) || "Please read the passage aloud.";
    const words = getQuestionWordCount(question, text);
    const difficulty = normalizeDifficultyNumber(question?.difficulty);
    const level = difficultyNumberToKey(difficulty);
    const history = questionHistoryById.value.get(id) || [];
    const scores = history.map((item) => normalizeScore(item?.overall)).filter((score) => score > 0);
    const lastScore = scores.length ? scores[0] : null;
    const bestScore = scores.length ? Math.max(...scores) : null;

    return {
      id,
      source: {
        ...(question || {}),
        id,
        taskType: "RA",
        task_type: "RA",
        content: text,
        difficulty,
        word_count: words,
        wordCount: words
      },
      text,
      summaryText: summarizeQuestionText(text),
      words,
      sec: getEstimatedSeconds(words),
      level,
      diff: difficultyLabel(difficulty),
      myScore: lastScore,
      diagnosisLabel: history[0]?.diagnosisLabel || "",
      bestScore,
      hasHistory: history.length > 0,
      isWeak: bestScore !== null && bestScore < SCORE_WEAK_THRESHOLD,
      isFavorite: favoriteIds.value.has(id),
      history: history.slice(0, 3).map((log) => ({
        date: formatShortDate(log?.createdAt),
        score: normalizeScore(log?.overall),
        label: log?.diagnosisLabel || (log?.overall ?? "--")
      }))
    };
  })
);

const diffCounts = computed(() => {
  const counts = { all: questionCards.value.length, easy: 0, medium: 0, hard: 0 };
  for (const question of questionCards.value) {
    counts[question.level] += 1;
  }
  return counts;
});

const diffOpts = computed(() => [
  { val: "all", label: "全部难度", icon: "📚", count: diffCounts.value.all },
  { val: "easy", label: "简单", icon: "⭐", count: diffCounts.value.easy },
  { val: "medium", label: "中等", icon: "⭐⭐", count: diffCounts.value.medium },
  { val: "hard", label: "困难", icon: "⭐⭐⭐", count: diffCounts.value.hard }
]);

const statusCounts = computed(() => {
  let done = 0;
  let weak = 0;
  let favorite = 0;

  for (const question of questionCards.value) {
    if (question.hasHistory) done += 1;
    if (question.isWeak) weak += 1;
    if (question.isFavorite) favorite += 1;
  }

  const total = questionCards.value.length;
  return {
    all: total,
    new: Math.max(0, total - done),
    done,
    weak,
    favorite
  };
});

const statusOpts = computed(() => [
  { val: "all", label: "所有状态", icon: "📋", count: statusCounts.value.all },
  { val: "new", label: "未练习", icon: "🔵", count: statusCounts.value.new },
  { val: "done", label: "已练习", icon: "✅", count: statusCounts.value.done },
  { val: "weak", label: "需加强", icon: "⚠️", count: statusCounts.value.weak },
  { val: "favorite", label: "已收藏", icon: "★", count: statusCounts.value.favorite }
]);

const diffLabel = computed(() => diffOpts.value.find((item) => item.val === selectedDiff.value)?.label || "全部难度");
const statusLabel = computed(() => statusOpts.value.find((item) => item.val === selectedStatus.value)?.label || "所有状态");

const filteredList = computed(() => {
  let list = questionCards.value;

  if (selectedDiff.value !== "all") {
    list = list.filter((question) => question.level === selectedDiff.value);
  }

  if (selectedStatus.value === "new") {
    list = list.filter((question) => !question.hasHistory);
  } else if (selectedStatus.value === "done") {
    list = list.filter((question) => question.hasHistory);
  } else if (selectedStatus.value === "weak") {
    list = list.filter((question) => question.isWeak);
  } else if (selectedStatus.value === "favorite") {
    list = list.filter((question) => question.isFavorite);
  }

  const keyword = searchQ.value.trim().toLowerCase();
  if (keyword) {
    list = list.filter(
      (question) =>
        question.text.toLowerCase().includes(keyword) ||
        question.id.toLowerCase().includes(keyword)
    );
  }

  return list;
});

const aiRec = computed(() => {
  const weakItems = questionCards.value
    .filter((question) => question.isWeak)
    .sort((left, right) => Number(left.bestScore || 0) - Number(right.bestScore || 0));
  const hardNewItems = questionCards.value
    .filter((question) => question.level === "hard" && !question.hasHistory);
  const mediumItems = questionCards.value
    .filter((question) => question.level === "medium" && !question.hasHistory);
  return uniqueQuestionCards([...weakItems, ...hardNewItems, ...mediumItems, ...questionCards.value]).slice(0, 3);
});

const myStats = computed(() => {
  const scoredLogs = raLogs.value
    .map((log) => normalizeScore(log?.overall))
    .filter((score) => score > 0);
  const practicedQuestionIds = new Set(raLogs.value.map((log) => normalizeText(log?.questionId)).filter(Boolean));
  const average = scoredLogs.length
    ? (scoredLogs.reduce((total, score) => total + score, 0) / scoredLogs.length).toFixed(1)
    : "-";
  const done = practicedQuestionIds.size;
  const remaining = Math.max(0, questionCards.value.length - done);
  return [
    { val: average, label: "近期均分", color: "var(--c2)" },
    { val: done, label: "已练题数", color: "var(--c0)" },
    { val: remaining, label: "未练题数", color: "var(--mute)" }
  ];
});

const diffDist = computed(() => {
  const total = Math.max(1, diffCounts.value.all);
  return [
    { label: "简单", count: diffCounts.value.easy, pct: Math.round((diffCounts.value.easy / total) * 100), color: "#5A9E6A" },
    { label: "中等", count: diffCounts.value.medium, pct: Math.round((diffCounts.value.medium / total) * 100), color: "#C07840" },
    { label: "困难", count: diffCounts.value.hard, pct: Math.round((diffCounts.value.hard / total) * 100), color: "#B84040" }
  ];
});

const loadingCopy = computed(() => {
  if (loading.value) return "加载题库中...";
  if (historyLoading.value) return "同步练习记录...";
  if (favoriteLoading.value) return "同步收藏状态...";
  return "";
});

watch([searchQ, selectedDiff, selectedStatus], () => {
  const diff = selectedDiff.value === "all" ? "" : selectedDiff.value;
  router.replace({
    path: "/ra/list",
    query: diff ? { difficulty: diff } : {}
  }).catch(() => {});
});

onMounted(async () => {
  await loadInitialData();
});

async function loadInitialData() {
  loading.value = true;
  historyLoading.value = true;
  favoriteLoading.value = true;

  try {
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const questionResult = await fetchQuestions("RA");
    allQuestions.value = Array.isArray(questionResult) ? questionResult : [];

    await Promise.allSettled([loadRAHistory(), loadFavorites()]);
  } finally {
    loading.value = false;
    historyLoading.value = false;
    favoriteLoading.value = false;
  }
}

async function loadRAHistory() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    raLogs.value = [];
    return;
  }

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, user_id, task_type, question_id, transcript, score_json, feedback, created_at")
      .eq("task_type", "RA")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(RECENT_LOG_LIMIT);

    if (error) throw error;
    raLogs.value = (Array.isArray(data) ? data : []).map((row) => normalizeRALog(row));
  } catch (error) {
    console.warn("RA question bank history fallback:", error);
    raLogs.value = [];
  }
}

async function loadFavorites() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    favoriteIds.value = new Set();
    favoriteSource.value = "local";
    return;
  }

  const localFavorites = readLocalFavorites(userId);
  favoriteIds.value = new Set(localFavorites);

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("question_id")
      .eq("task_type", "RA")
      .eq("user_id", userId);

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        favoriteSource.value = "local";
        return;
      }
      throw error;
    }

    favoriteSource.value = "remote";
    const remoteFavorites = new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => normalizeText(row?.question_id))
        .filter(Boolean)
    );
    const mergedFavorites = new Set([...localFavorites, ...remoteFavorites]);
    favoriteIds.value = mergedFavorites;
    writeLocalFavorites(userId, mergedFavorites);
  } catch (error) {
    console.warn("RA question bank favorites fallback to local:", error);
    favoriteSource.value = "local";
  }
}

async function toggleFavorite(question) {
  const id = normalizeText(question?.id);
  if (!id || favoriteBusyIds.value.has(id)) return;

  const userId = await resolveCurrentUserId();
  if (!userId) return;

  setFavoriteBusy(id, true);
  const nextFavorites = new Set(favoriteIds.value);
  const nextState = !nextFavorites.has(id);
  if (nextState) nextFavorites.add(id);
  else nextFavorites.delete(id);
  favoriteIds.value = nextFavorites;
  writeLocalFavorites(userId, nextFavorites);

  if (favoriteSource.value !== "local") {
    try {
      if (nextState) {
        const { error } = await supabase.from("favorites").insert({
          user_id: userId,
          task_type: "RA",
          question_id: id
        });
        if (error && !isDuplicateFavoriteError(error)) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("task_type", "RA")
          .eq("question_id", id);
        if (error) throw error;
      }
    } catch (error) {
      if (isMissingFavoritesTableError(error)) {
        favoriteSource.value = "local";
      } else {
        console.warn("RA favorite toggle remote sync failed:", error);
      }
    }
  }

  setFavoriteBusy(id, false);
}

function goHomeRA() {
  router.push("/ra");
}

function goPractice(questionOrMode) {
  if (questionOrMode === "random") {
    router.push({ path: "/ra/practice", query: { mode: "random" } });
    return;
  }

  const question = typeof questionOrMode === "string"
    ? questionCards.value.find((item) => item.id === questionOrMode)
    : questionOrMode;
  const questionId = normalizeText(question?.id);
  if (question?.source) {
    practiceStore.setSelectedQuestion(question.source);
  }

  router.push({
    path: "/ra/practice",
    query: questionId ? { questionId } : {}
  });
}

function startFilteredPractice() {
  if (practiceMode.value === "rand") {
    goPractice("random");
    return;
  }

  const firstQuestion = filteredList.value[0] || questionCards.value[0] || null;
  goPractice(firstQuestion || "random");
}

function normalizeDifficultyQuery(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = `${raw || ""}`.trim().toLowerCase();
  if (normalized === "easy" || normalized === "1") return "easy";
  if (normalized === "medium" || normalized === "2") return "medium";
  if (normalized === "hard" || normalized === "3") return "hard";
  return "all";
}

function normalizeDifficultyNumber(value) {
  const number = Number(value || 2);
  if (!Number.isFinite(number)) return 2;
  if (number <= 1) return 1;
  if (number >= 3) return 3;
  return 2;
}

function difficultyNumberToKey(value) {
  const difficulty = normalizeDifficultyNumber(value);
  if (difficulty <= 1) return "easy";
  if (difficulty >= 3) return "hard";
  return "medium";
}

function difficultyLabel(value) {
  const difficulty = normalizeDifficultyNumber(value);
  if (difficulty <= 1) return "简单";
  if (difficulty >= 3) return "困难";
  return "中等";
}

function getQuestionWordCount(question, text) {
  const explicitCount = Number(question?.word_count ?? question?.wordCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return Math.round(explicitCount);
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function getEstimatedSeconds(wordCount) {
  return Math.max(18, Math.min(45, Math.round(Number(wordCount || 0) / 2.6)));
}

function summarizeQuestionText(text) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  const maxLength = 190;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}…`;
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(90, Math.round(parsed)));
}

function formatShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).replace(/\//g, "-");
}

function uniqueQuestionCards(list) {
  const seen = new Set();
  const result = [];
  for (const question of Array.isArray(list) ? list : []) {
    if (!question?.id || seen.has(question.id)) continue;
    seen.add(question.id);
    result.push(question);
  }
  return result;
}

function favoriteStorageKey(userId) {
  return `kai_kou_ra_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(favoriteStorageKey(userId));
    const parsed = JSON.parse(raw || "[]");
    return new Set((Array.isArray(parsed) ? parsed : []).map(normalizeText).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFavorites(userId, favoriteSet) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(favoriteStorageKey(userId), JSON.stringify([...favoriteSet]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`;
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

function isDuplicateFavoriteError(error) {
  const code = `${error?.code || ""}`;
  const message = `${error?.message || ""}`.toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

function setFavoriteBusy(id, busy) {
  const next = new Set(favoriteBusyIds.value);
  if (busy) next.add(id);
  else next.delete(id);
  favoriteBusyIds.value = next;
}

async function resolveCurrentUserId() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return "";
    return normalizeText(data?.session?.user?.id);
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}
</script>

<template>
  <div class="shell" data-testid="ra-list-page">
    <header class="topbar">
      <button class="tb-back" type="button" data-testid="ra-list-back" @click="goHomeRA">
        <span class="tb-arr">‹</span>RA 练习中心
      </button>
      <div class="tb-title">Read Aloud 题库</div>
      <div class="tb-right">
        <div class="vip-pill"><span class="vip-dot"></span>VIP · 无限练习</div>
        <button class="exit-btn" type="button" @click="goHomeRA">退出</button>
      </div>
    </header>

    <div class="page-body">
      <aside class="filter-col">
        <div class="fc-section">
          <div class="fc-title">练习状态</div>
          <div class="fc-opts">
            <button
              v-for="s in statusOpts"
              :key="s.val"
              class="fc-opt"
              :class="{ active: selectedStatus === s.val }"
              type="button"
              :data-testid="`ra-status-${s.val}`"
              @click="selectedStatus = s.val"
            >
              <span class="fo-label">{{ s.label }}</span>
              <span class="fo-count">{{ s.count }}</span>
            </button>
          </div>
        </div>

        <div class="fc-section">
          <div class="fc-title">AI 推荐</div>
          <div class="ai-rec-card">
            <div class="arc-banner">
              <span>根据弱项，优先练流利度挑战题</span>
            </div>
            <div class="arc-list">
              <button
                v-for="r in aiRec"
                :key="r.id"
                class="arc-item"
                type="button"
                @click="goPractice(r)"
              >
                <div class="arc-code">{{ r.id }}</div>
                <div class="arc-meta">{{ r.diff }} · {{ r.words }}词</div>
                <div class="arc-go">练 →</div>
              </button>
            </div>
          </div>
        </div>

        <div class="fc-section">
          <div class="fc-title">我的 RA 数据</div>
          <div class="my-stats">
            <div v-for="s in myStats" :key="s.label" class="ms-item">
              <div class="ms-val">{{ s.val }}</div>
              <div class="ms-lbl">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="main-area">
        <div class="search-bar">
          <div class="sb-input-wrap">
            <svg class="sb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input
              v-model="searchQ"
              class="sb-input"
              data-testid="ra-search"
              placeholder="搜索题目内容…"
            />
            <button v-if="searchQ" class="sb-clear" type="button" @click="searchQ = ''">✕</button>
          </div>
          <div class="sb-stats">
            共 <b data-testid="ra-result-count">{{ filteredList.length }}</b> 道题
            <span v-if="selectedDiff !== 'all'">· {{ diffLabel }}</span>
            <span v-if="selectedStatus !== 'all'">· {{ statusLabel }}</span>
          </div>
        </div>

        <div class="diff-tabs" aria-label="难度筛选">
          <button
            v-for="d in diffOpts"
            :key="d.val"
            class="dt-item"
            :class="{ active: selectedDiff === d.val }"
            type="button"
            :data-testid="`ra-diff-${d.val}`"
            @click="selectedDiff = d.val"
          >
            <span class="dt-label">{{ d.label }}</span>
            <span class="dt-count">{{ d.count }}</span>
          </button>
        </div>

        <div v-if="loading || historyLoading || favoriteLoading" class="state-card">
          <div class="loading-dot"></div>
          <p>{{ loadingCopy }}</p>
        </div>

        <div v-else-if="filteredList.length" class="q-list" data-testid="ra-question-list">
          <article
            v-for="q in filteredList"
            :key="q.id"
            class="q-card"
            :class="{ 'q-card--active': q.isWeak }"
            data-testid="ra-question-card"
          >
            <div class="qc-top">
              <div class="qc-meta">
                <span class="qc-id">{{ q.id }}</span>
                <span class="qc-diff" :class="q.level">{{ q.diff }}</span>
                <span class="qc-words">{{ q.words }} 词</span>
                <span class="qc-sec">约 {{ q.sec }} 秒</span>
              </div>
              <div class="qc-right">
                <button
                  class="qc-fav"
                  :class="{ active: q.isFavorite }"
                  type="button"
                  :disabled="favoriteBusyIds.has(q.id)"
                  :aria-label="q.isFavorite ? '取消收藏' : '收藏'"
                  @click.stop="toggleFavorite(q)"
                >
                  {{ q.isFavorite ? "★" : "☆" }}
                </button>
                <span
                  v-if="q.diagnosisLabel || q.myScore !== null"
                  class="qc-score"
                  :class="{ 'qc-score--good': q.myScore >= 70 }"
                >
                  {{ q.diagnosisLabel || `我的：${q.myScore}` }}
                </span>
                <button
                  class="qc-go"
                  type="button"
                  data-testid="ra-practice-question"
                  @click="goPractice(q)"
                >
                  练习
                </button>
              </div>
            </div>
            <div class="qc-text">{{ q.summaryText }}</div>
            <div v-if="q.history.length" class="qc-hist">
              <div v-for="h in q.history" :key="`${q.id}-${h.date}-${h.score}`" class="qch-item">
                <span class="qch-date">{{ h.date }}</span>
                <div v-if="h.score !== null" class="qch-bar-bg"><div class="qch-bar-fill" :style="{ width: `${Math.max(0, Math.min(100, (h.score / 90) * 100))}%` }"></div></div>
                <span class="qch-val">{{ h.label }}</span>
              </div>
            </div>
          </article>
        </div>

        <div v-else class="state-card">
          <strong>没有找到匹配的题目</strong>
          <p>试试其他关键词或筛选条件</p>
        </div>
      </main>

      <aside class="guide-col">
        <div class="gc-card">
          <div class="gc-hd">选题建议</div>
          <div class="gc-body">
            <div class="gc-tip-item">
              <div class="gc-tip-dot"></div>
              <div>
                <div class="gc-tip-title">新手阶段</div>
                <div class="gc-tip-desc">从简单题开始，建立基础语感和节奏感</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot"></div>
              <div>
                <div class="gc-tip-title">提升阶段</div>
                <div class="gc-tip-desc">主攻中等题，集中突破流利度和逗号停顿</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot"></div>
              <div>
                <div class="gc-tip-title">冲刺阶段</div>
                <div class="gc-tip-desc">攻克困难题，应对专业术语和长句挑战</div>
              </div>
            </div>
          </div>
        </div>

        <div class="gc-card">
          <div class="gc-hd">本次练习设置</div>
          <div class="gc-body">
            <div class="setting-row">
              <span class="sr-label">出题方式</span>
              <div class="sr-opts">
                <button class="sr-opt" :class="{ act: practiceMode === 'seq' }" type="button" @click="practiceMode = 'seq'">顺序</button>
                <button class="sr-opt" :class="{ act: practiceMode === 'rand' }" type="button" @click="practiceMode = 'rand'">随机</button>
              </div>
            </div>
            <div class="setting-row">
              <span class="sr-label">准备时间</span>
              <span class="sr-fixed">40 秒准备</span>
            </div>
            <button class="start-all-btn" type="button" data-testid="ra-random-practice" @click="startFilteredPractice">
              开始练习全部筛选题
            </button>
          </div>
        </div>

        <div class="gc-card">
          <div class="gc-hd">难度分布</div>
          <div class="gc-body">
            <div v-for="d in diffDist" :key="d.label" class="dd-row">
              <span class="dd-lbl">{{ d.label }}</span>
              <div class="dd-bar-bg"><div class="dd-bar-fill" :style="{ width: `${d.pct}%` }"></div></div>
              <span class="dd-cnt">{{ d.count }}</span>
            </div>
          </div>
        </div>

      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Same structure as WFDListView.vue. Visual rules: docs/ui-guidelines.md. Tokens (--kk-*) live in src/assets/styles/main.css. */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
button,input{font:inherit;}
button{border:0;background:transparent;cursor:pointer;color:inherit;}
button:disabled{cursor:not-allowed;opacity:.45;}
.shell{display:flex;flex-direction:column;min-height:100vh;background:var(--kk-bg);color:var(--kk-ink);font-family:var(--kk-font);font-size:15px;line-height:1.55;}

.topbar{position:relative;min-height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 6px 4px;background:var(--kk-surface);border-bottom:1px solid var(--kk-line);}
.tb-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px;font-size:15px;font-weight:500;}
.tb-back:hover{color:var(--kk-action-text);}
.tb-arr{font-size:20px;line-height:1;}
.tb-title{font-size:16px;font-weight:600;white-space:nowrap;}
.tb-right{display:flex;align-items:center;gap:8px;}
.vip-pill{display:none;align-items:center;height:30px;padding:0 12px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:13px;font-weight:600;white-space:nowrap;}
.vip-dot{display:none;}
.exit-btn{min-height:36px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink-2);font-size:13px;font-weight:600;}

.page-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;width:100%;max-width:1360px;margin:0 auto;padding:16px 16px 40px;}
.filter-col,.main-area,.guide-col{display:flex;flex-direction:column;gap:16px;min-width:0;}

/* Filters */
.fc-section{min-width:0;padding:18px 20px;border:1px solid var(--kk-line);border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow);}
.fc-title{margin-bottom:10px;font-size:15px;font-weight:600;}
.fc-opts{display:flex;gap:8px;overflow-x:auto;margin:0 -4px;padding:0 4px 2px;}
.fc-opt{display:inline-flex;flex-shrink:0;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);font-size:14px;color:var(--kk-ink-2);white-space:nowrap;}
.fc-opt:hover{background:var(--kk-surface-2);}
.fc-opt.active{border-color:var(--kk-ink);background:var(--kk-ink);color:var(--kk-ink-inverse);font-weight:600;}
.fo-count{font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.ai-rec-card{display:flex;flex-direction:column;gap:8px;}
.arc-banner{padding:12px 14px;border-radius:12px;background:var(--kk-surface-2);font-size:14px;line-height:1.6;}
.arc-list{display:flex;flex-direction:column;}
.arc-item{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;border-top:1px solid var(--kk-line);text-align:left;}
.arc-item:first-child{border-top:0;}
.arc-code{padding:2px 8px;border-radius:8px;background:var(--kk-surface-2);font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.arc-meta{flex:1;min-width:0;font-size:13px;color:var(--kk-ink-3);}
.arc-go{font-size:14px;font-weight:600;color:var(--kk-action-text);}
.my-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.ms-item{padding:12px 8px;border-radius:16px;background:var(--kk-surface-2);text-align:center;}
.ms-val{font-family:var(--kk-font-num);font-size:22px;font-weight:800;line-height:1.15;}
.ms-lbl{margin-top:2px;font-size:12px;color:var(--kk-ink-3);}

/* Search, tabs, list */
.search-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;}
.sb-input-wrap{display:flex;flex:1 1 240px;align-items:center;gap:8px;min-width:0;min-height:48px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);}
.sb-input-wrap:focus-within{border-color:var(--kk-ink);}
.sb-ico{width:18px;height:18px;flex-shrink:0;fill:none;stroke:var(--kk-ink-3);stroke-width:1.8;stroke-linecap:round;}
.sb-input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px;color:var(--kk-ink);}
.sb-input::placeholder{color:var(--kk-ink-3);}
.sb-clear{width:32px;height:32px;border-radius:50%;color:var(--kk-ink-3);}
.sb-stats{font-size:13px;color:var(--kk-ink-3);}
.sb-stats b{font-family:var(--kk-font-num);color:var(--kk-ink);}
.diff-tabs{display:flex;flex-wrap:wrap;gap:8px;}
.dt-item{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);font-size:14px;color:var(--kk-ink-2);}
.dt-item:hover{background:var(--kk-surface-2);}
.dt-item.active{border-color:var(--kk-ink);background:var(--kk-ink);color:var(--kk-ink-inverse);font-weight:600;}
.dt-count{font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.q-list{display:flex;flex-direction:column;gap:12px;}
.q-card{min-width:0;padding:16px 18px;border:1px solid var(--kk-line);border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow);}
.q-card--active{border-color:var(--kk-notice-line);}
.qc-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;margin-bottom:8px;}
.qc-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0;}
.qc-id{padding:2px 8px;border-radius:8px;background:var(--kk-surface-2);font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.qc-diff{padding:2px 10px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:12px;font-weight:600;}
.qc-words,.qc-sec{font-size:13px;color:var(--kk-ink-3);}
.qc-right{display:flex;align-items:center;gap:8px;margin-left:auto;}
.qc-fav{width:40px;height:40px;border:1px solid var(--kk-line);border-radius:50%;background:var(--kk-surface);color:var(--kk-ink-3);font-size:16px;line-height:1;}
.qc-fav.active{border-color:var(--kk-notice-line);background:var(--kk-notice-bg);color:var(--kk-notice);}
.qc-score{font-size:13px;font-weight:600;color:var(--kk-ink-2);}
.qc-score--good{color:var(--kk-success);}
.qc-go{min-height:40px;padding:0 18px;border-radius:999px;background:var(--kk-action);color:var(--kk-on-action);font-size:14px;font-weight:700;}
.qc-go:hover{background:var(--kk-action-hover);}
.qc-text{margin-bottom:4px;font-family:var(--kk-font-text);font-size:16px;line-height:1.7;}
.qc-hist{display:flex;flex-direction:column;gap:6px;margin-top:8px;padding-top:10px;border-top:1px solid var(--kk-line);}
.qch-item{display:grid;grid-template-columns:44px minmax(0,1fr) 28px;align-items:center;gap:8px;}
.qch-date{font-size:12px;color:var(--kk-ink-3);}
.qch-bar-bg{height:6px;border-radius:99px;background:var(--kk-surface-2);overflow:hidden;}
.qch-bar-fill{height:100%;border-radius:99px;background:var(--kk-ink-2);}
.qch-val{font-family:var(--kk-font-num);font-size:12px;font-weight:700;text-align:right;}
.state-card{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:200px;padding:20px;border:1px dashed var(--kk-line);border-radius:20px;color:var(--kk-ink-3);font-size:14px;text-align:center;}
.state-card strong{font-size:17px;color:var(--kk-ink);}
.loading-dot{width:28px;height:28px;border:3px solid var(--kk-line);border-top-color:var(--kk-ink);border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* Guide column */
.gc-card{min-width:0;border:1px solid var(--kk-line);border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow);}
.gc-hd{padding:18px 20px 0;font-size:17px;font-weight:600;}
.gc-body{display:flex;flex-direction:column;gap:12px;padding:14px 20px 20px;}
.gc-tip-item{display:flex;align-items:flex-start;gap:10px;}
.gc-tip-dot{flex-shrink:0;width:6px;height:6px;margin-top:9px;border-radius:50%;background:var(--kk-ink-2);}
.gc-tip-title{font-size:15px;font-weight:600;}
.gc-tip-desc{font-size:13px;color:var(--kk-ink-3);line-height:1.6;}
.setting-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.sr-label{font-size:14px;color:var(--kk-ink-2);}
.sr-opts{display:flex;gap:6px;}
.sr-opt{min-height:36px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;font-size:13px;color:var(--kk-ink-2);}
.sr-opt.act{border-color:var(--kk-ink);background:var(--kk-ink);color:var(--kk-ink-inverse);font-weight:600;}
.sr-fixed{padding:4px 12px;border-radius:999px;background:var(--kk-surface-2);font-size:13px;color:var(--kk-ink-2);white-space:nowrap;}
.start-all-btn{width:100%;min-height:48px;margin-top:4px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);font-size:15px;font-weight:600;}
.start-all-btn:hover{background:var(--kk-surface-2);}
.dd-row{display:grid;grid-template-columns:40px minmax(0,1fr) 28px;align-items:center;gap:8px;}
.dd-lbl{font-size:13px;font-weight:600;}
.dd-bar-bg{height:6px;border-radius:99px;background:var(--kk-surface-2);overflow:hidden;}
.dd-bar-fill{height:100%;border-radius:99px;background:var(--kk-ink-2);}
.dd-cnt{font-family:var(--kk-font-num);font-size:12px;color:var(--kk-ink-3);text-align:right;}

@media (min-width:768px){
  .topbar{min-height:64px;padding:8px 24px 8px 16px;}
  .tb-title{position:absolute;left:50%;transform:translateX(-50%);}
  .vip-pill{display:inline-flex;}
  .page-body{padding:24px 24px 48px;}
  .guide-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;}
}

@media (min-width:1200px){
  .page-body{grid-template-columns:260px minmax(0,1fr) 280px;gap:24px;padding:28px 40px 56px;align-items:start;}
  .fc-opts{flex-direction:column;overflow:visible;margin:0;padding:0;gap:4px;}
  .fc-opt{justify-content:space-between;border:0;border-radius:12px;}
  .fc-opt.active{background:var(--kk-action-soft);color:var(--kk-action-text);}
  .guide-col{display:flex;}
}
</style>
