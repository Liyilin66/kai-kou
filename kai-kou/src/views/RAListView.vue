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
      bestScore,
      hasHistory: history.length > 0,
      isWeak: Boolean(history.length && Number(bestScore || 0) < SCORE_WEAK_THRESHOLD),
      isFavorite: favoriteIds.value.has(id),
      history: history.slice(0, 3).map((log) => ({
        date: formatShortDate(log?.createdAt),
        score: normalizeScore(log?.overall)
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
              <span class="fo-icon">{{ s.icon }}</span>
              <span class="fo-label">{{ s.label }}</span>
              <span class="fo-count">{{ s.count }}</span>
            </button>
          </div>
        </div>

        <div class="fc-section">
          <div class="fc-title">AI 推荐</div>
          <div class="ai-rec-card">
            <div class="arc-banner">
              <span class="arc-ico">💡</span>
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
              <div class="ms-val" :style="{ color: s.color }">{{ s.val }}</div>
              <div class="ms-lbl">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="main-area">
        <div class="search-bar">
          <div class="sb-input-wrap">
            <span class="sb-ico">🔍</span>
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
            <span class="dt-icon">{{ d.icon }}</span>
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
                  v-if="q.myScore"
                  class="qc-score"
                  :style="{ color: q.myScore >= 70 ? 'var(--grn)' : 'var(--org)' }"
                >
                  我的：{{ q.myScore }}
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
                <div class="qch-bar-bg"><div class="qch-bar-fill" :style="{ width: `${Math.max(0, Math.min(100, (h.score / 90) * 100))}%` }"></div></div>
                <span class="qch-val">{{ h.score }}</span>
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
          <div class="gc-hd">✦ 选题建议</div>
          <div class="gc-body">
            <div class="gc-tip-item">
              <div class="gc-tip-dot" style="background:var(--grn)"></div>
              <div>
                <div class="gc-tip-title">新手阶段</div>
                <div class="gc-tip-desc">从简单题开始，建立基础语感和节奏感</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot" style="background:var(--org)"></div>
              <div>
                <div class="gc-tip-title">提升阶段</div>
                <div class="gc-tip-desc">主攻中等题，集中突破流利度和逗号停顿</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot" style="background:var(--red)"></div>
              <div>
                <div class="gc-tip-title">冲刺阶段</div>
                <div class="gc-tip-desc">攻克困难题，应对专业术语和长句挑战</div>
              </div>
            </div>
          </div>
        </div>

        <div class="gc-card">
          <div class="gc-hd">◈ 本次练习设置</div>
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
              🎙 开始练习全部筛选题
            </button>
          </div>
        </div>

        <div class="gc-card">
          <div class="gc-hd">◎ 难度分布</div>
          <div class="gc-body">
            <div v-for="d in diffDist" :key="d.label" class="dd-row">
              <span class="dd-lbl" :style="{ color: d.color }">{{ d.label }}</span>
              <div class="dd-bar-bg"><div class="dd-bar-fill" :style="{ width: `${d.pct}%`, background: d.color }"></div></div>
              <span class="dd-cnt">{{ d.count }}</span>
            </div>
          </div>
        </div>

      </aside>
    </div>
  </div>
</template>

<style scoped>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
button,input{font:inherit;}
button{border:0;background:transparent;cursor:pointer;}
button:disabled{cursor:not-allowed;opacity:.58;}
.shell{
  --c0:#1E1208;--c1:#3A2510;--c2:#7C5C3E;--c3:#A07850;
  --bg0:#F5EFE4;--bg1:#EDE8DC;--bg2:#E4DDD0;--bg3:#D8D0C0;
  --card:#FAF6EF;--card2:#F2EBE0;--bdr:#D4C8B4;--bdr2:#C4B49C;
  --grn:#5A9E6A;--grn2:#DFF0E4;--grn3:#A8D4B4;
  --org:#C07840;--org2:#F2E4D0;--org3:#D4B090;
  --red:#B84040;--red2:#F5E0DC;--red3:#D4A8A0;
  --mute:#A89070;
  display:flex;flex-direction:column;width:100vw;height:100vh;
  background:var(--bg1);
  font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;
  color:var(--c0);overflow:hidden;
}
.topbar{height:52px;flex-shrink:0;background:var(--c2);display:flex;align-items:center;justify-content:space-between;padding:0 28px;}
.tb-back{display:flex;align-items:center;gap:6px;color:rgba(250,246,239,.7);font-size:13px;}
.tb-arr{font-size:16px;}
.tb-title{font-size:15px;font-weight:700;color:#FAF6EF;}
.tb-right{display:flex;align-items:center;gap:10px;}
.vip-pill{display:flex;align-items:center;gap:5px;background:#DFF0E4;border:1px solid #A8D4B4;border-radius:99px;padding:4px 11px;font-size:11px;color:#2D6A3A;font-weight:600;}
.vip-dot{width:5px;height:5px;border-radius:50%;background:#5A9E6A;}
.exit-btn{font-size:12.5px;color:rgba(250,246,239,.65);}
.page-body{flex:1;display:flex;min-height:0;overflow:hidden;}
.filter-col{width:220px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--bdr);overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:14px;}
.filter-col::-webkit-scrollbar,.main-area::-webkit-scrollbar,.guide-col::-webkit-scrollbar{width:3px;}
.filter-col::-webkit-scrollbar-thumb,.main-area::-webkit-scrollbar-thumb,.guide-col::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.fc-title{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);margin-bottom:8px;}
.fc-opts{display:flex;flex-direction:column;gap:3px;}
.fc-opt{width:100%;display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:8px;font-size:12.5px;color:var(--mute);transition:background .12s;text-align:left;}
.fc-opt:hover{background:var(--card);}
.fc-opt.active{background:var(--card);color:var(--c2);font-weight:600;}
.fo-icon{font-size:12px;}
.fo-label{flex:1;}
.fo-count{font-size:10px;background:var(--bdr);border-radius:4px;padding:1px 5px;color:var(--c1);}
.ai-rec-card{background:var(--card);border:1px solid var(--bdr);border-radius:10px;overflow:hidden;}
.arc-banner{padding:8px 10px;background:var(--org2);border-bottom:1px solid var(--org3);font-size:11px;color:var(--org);display:flex;gap:5px;line-height:1.5;}
.arc-ico{flex-shrink:0;}
.arc-list{padding:6px 8px;display:flex;flex-direction:column;gap:3px;}
.arc-item{width:100%;display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:6px;transition:background .12s;text-align:left;}
.arc-item:hover{background:var(--card2);}
.arc-code{font-size:10px;font-weight:700;color:var(--c2);background:var(--card2);border:1px solid var(--bdr);border-radius:4px;padding:1px 5px;}
.arc-meta{flex:1;font-size:10.5px;color:var(--mute);}
.arc-go{font-size:11px;color:var(--c2);font-weight:600;}
.my-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.ms-item{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:8px 4px;text-align:center;}
.ms-val{font-size:15px;font-weight:800;line-height:1;}
.ms-lbl{font-size:9px;color:var(--mute);margin-top:2px;}
.main-area{flex:1;min-width:0;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:12px;}
.search-bar{display:flex;align-items:center;gap:14px;}
.sb-input-wrap{flex:1;display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--bdr2);border-radius:10px;padding:9px 13px;transition:border-color .13s;}
.sb-input-wrap:focus-within{border-color:var(--c2);}
.sb-ico{font-size:14px;color:var(--mute);}
.sb-input{flex:1;border:none;background:transparent;font-size:13.5px;color:var(--c0);outline:none;font-family:inherit;}
.sb-input::placeholder{color:var(--mute);}
.sb-clear{color:var(--mute);font-size:12px;}
.sb-stats{font-size:12px;color:var(--mute);white-space:nowrap;}
.sb-stats b{color:var(--c0);}
.diff-tabs{display:flex;gap:7px;flex-wrap:wrap;}
.dt-item{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:5px 10px;border-radius:99px;font-size:12.5px;color:var(--mute);background:var(--card2);border:1px solid var(--bdr);transition:background .12s,color .12s,border-color .12s;}
.dt-item.active{background:var(--c2);color:#FAF6EF;border-color:var(--c2);font-weight:600;}
.dt-icon{font-size:11.5px;line-height:1;}
.dt-count{min-width:20px;height:18px;padding:0 6px;border-radius:99px;background:rgba(126,94,58,.12);color:var(--c1);font-size:10.5px;font-weight:700;line-height:18px;text-align:center;}
.dt-item.active .dt-count{background:rgba(250,246,239,.18);color:#FAF6EF;}
.q-list{display:flex;flex-direction:column;gap:10px;}
.q-card{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:14px 16px;transition:box-shadow .13s;}
.q-card:hover{box-shadow:0 3px 12px rgba(44,21,8,.07);}
.q-card--active{border-color:var(--c2);background:linear-gradient(135deg,var(--card) 0%,#F0E8DC 100%);}
.qc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px;}
.qc-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
.qc-id{font-size:11px;font-weight:700;color:var(--c2);background:var(--card2);border:1px solid var(--bdr);border-radius:5px;padding:2px 7px;}
.qc-diff{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:600;}
.qc-diff.hard{background:var(--red2);color:var(--red);border:1px solid var(--red3);}
.qc-diff.medium{background:var(--org2);color:var(--org);border:1px solid var(--org3);}
.qc-diff.easy{background:var(--grn2);color:var(--grn);border:1px solid var(--grn3);}
.qc-words,.qc-sec{font-size:10.5px;color:var(--mute);}
.qc-right{display:flex;align-items:center;gap:9px;flex-shrink:0;}
.qc-fav{width:27px;height:27px;border:1px solid var(--bdr);border-radius:8px;background:var(--card2);color:var(--mute);font-size:14px;line-height:1;}
.qc-fav.active{background:#FFF3CC;border-color:#E7C871;color:#A97800;}
.qc-score{font-size:12.5px;font-weight:700;}
.qc-go{background:var(--c2);color:#FAF6EF;border:none;border-radius:8px;padding:6px 14px;font-size:12.5px;font-weight:600;font-family:inherit;transition:background .12s;}
.qc-go:hover{background:#6A4D32;}
.qc-text{font-size:13px;color:var(--c1);line-height:1.75;margin-bottom:8px;}
.qc-hist{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--bdr);padding-top:9px;}
.qch-item{display:flex;align-items:center;gap:8px;}
.qch-date{font-size:9.5px;color:var(--mute);width:36px;flex-shrink:0;}
.qch-bar-bg{flex:1;height:5px;background:var(--bdr);border-radius:99px;overflow:hidden;}
.qch-bar-fill{height:100%;background:var(--c2);border-radius:99px;}
.qch-val{font-size:10.5px;font-weight:700;color:var(--c2);width:22px;text-align:right;flex-shrink:0;}
.state-card{min-height:220px;background:var(--card);border:1px solid var(--bdr);border-radius:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:var(--mute);font-size:13px;text-align:center;}
.state-card strong{font-size:16px;color:var(--c0);}
.loading-dot{width:28px;height:28px;border:3px solid var(--org);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
.guide-col{width:232px;flex-shrink:0;background:var(--bg2);border-left:1px solid var(--bdr);overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:12px;}
.gc-card{background:var(--card);border:1px solid var(--bdr);border-radius:12px;overflow:hidden;}
.gc-hd{padding:10px 13px 9px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--c0);}
.gc-body{padding:11px 13px;display:flex;flex-direction:column;gap:9px;}
.gc-tip-item{display:flex;gap:9px;align-items:flex-start;}
.gc-tip-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-top:4px;}
.gc-tip-title{font-size:12px;font-weight:600;color:var(--c0);margin-bottom:2px;}
.gc-tip-desc{font-size:11px;color:var(--mute);line-height:1.5;}
.setting-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.sr-label{font-size:11.5px;color:var(--c1);}
.sr-opts{display:flex;gap:4px;}
.sr-opt{font-size:11px;padding:3px 10px;border-radius:6px;background:var(--card2);border:1px solid var(--bdr);color:var(--mute);}
.sr-opt.act{background:var(--c2);color:#FAF6EF;border-color:var(--c2);}
.sr-fixed{font-size:11px;font-weight:600;color:var(--c2);background:var(--card2);border:1px solid var(--bdr);border-radius:6px;padding:3px 10px;white-space:nowrap;}
.start-all-btn{width:100%;background:var(--c2);color:#FAF6EF;border:none;border-radius:9px;padding:10px 0;font-size:12.5px;font-weight:600;font-family:inherit;margin-top:4px;}
.dd-row{display:flex;align-items:center;gap:7px;}
.dd-lbl{font-size:10.5px;font-weight:600;width:26px;flex-shrink:0;}
.dd-bar-bg{flex:1;height:5px;background:var(--bdr);border-radius:99px;overflow:hidden;}
.dd-bar-fill{height:100%;border-radius:99px;}
.dd-cnt{font-size:10.5px;color:var(--mute);width:18px;text-align:right;flex-shrink:0;}
@media (max-width:1366px){
  .filter-col{width:210px;padding:13px 10px;}
  .guide-col{width:224px;padding:13px 10px;}
  .main-area{padding:16px 18px;}
  .qc-text{line-height:1.68;}
}
@media (max-width:1280px){
  .topbar{padding:0 22px;}
  .filter-col{width:204px;}
  .guide-col{width:214px;}
  .main-area{padding:15px 16px;}
  .search-bar{gap:10px;}
  .qc-right{gap:7px;}
}
</style>
