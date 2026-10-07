<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchQuestions } from "@/lib/questions";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();

const allQuestions = ref([]);
const practiceLogs = ref([]);
const practiceLogsError = ref("");
const loading = ref(true);
const historyLoading = ref(false);
const favoriteLoading = ref(false);
const searchQ = ref("");
const selectedDiff = ref("all");
const selectedStatus = ref("all");
const favoriteIds = ref(new Set());
const favoriteBusyIds = ref(new Set());
const practiceMode = ref("rand");

const preferredRecommendationIds = ["WFD_020", "WFD_054", "WFD_061"];

onMounted(async () => {
  loading.value = true;

  try {
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    loadFavorites();
    await Promise.allSettled([loadQuestions(), loadPracticeLogs()]);
  } finally {
    loading.value = false;
  }
});

async function loadQuestions() {
  allQuestions.value = await fetchQuestions("WFD");
}

async function loadPracticeLogs() {
  const userId = authStore.user?.id || authStore.session?.user?.id;
  if (!userId) {
    practiceLogs.value = [];
    practiceLogsError.value = "";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, question_id, transcript, score_json, feedback, created_at")
      .eq("user_id", userId)
      .eq("task_type", "WFD")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      practiceLogs.value = [];
      practiceLogsError.value = error.message || "practice_logs unavailable";
      console.warn("WFD practice_logs read error:", error);
      return;
    }

    practiceLogs.value = Array.isArray(data) ? data : [];
    practiceLogsError.value = "";
  } catch (error) {
    practiceLogs.value = [];
    practiceLogsError.value = error?.message || "practice_logs unavailable";
    console.warn("WFD practice_logs read failed:", error);
  }
}

const normalizedQuestions = computed(() => {
  return allQuestions.value.map((question, index) => {
    const id = normalizeText(question?.id) || `WFD_${String(index + 1).padStart(3, "0")}`;
    const content = getQuestionText(question);
    const wordCount = getWordCount(question);
    const difficulty = resolveDifficulty(question, wordCount);

    return {
      ...(question || {}),
      id,
      content,
      wordCount,
      estimatedSeconds: estimateSeconds(question, wordCount),
      difficulty,
      difficultyLabel: getDifficultyLabel(difficulty),
      difficultyClass: getDifficultyClass(difficulty),
      sortIndex: index,
      updatedAtMs: getQuestionUpdatedAtMs(question)
    };
  });
});

const questionMap = computed(() => {
  return new Map(normalizedQuestions.value.map((item) => [item.id, item]));
});

const normalizedLogs = computed(() => {
  return practiceLogs.value
    .map((log) => {
      const questionId = normalizeText(log?.question_id);
      const scoreJson = parseScoreJson(log?.score_json);
      const scorePercent = resolveWfdScorePercent(scoreJson);
      const createdAt = parseDate(log?.created_at);

      return {
        ...(log || {}),
        questionId,
        question: questionMap.value.get(questionId) || null,
        scoreJson,
        scorePercent,
        createdAt,
        createdAtMs: createdAt?.getTime() || 0
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
});

const logsByQuestionId = computed(() => {
  const groups = new Map();

  normalizedLogs.value.forEach((log) => {
    if (!log.questionId) return;
    const group = groups.get(log.questionId) || [];
    group.push(log);
    groups.set(log.questionId, group);
  });

  return groups;
});

const practicedIds = computed(() => new Set([...logsByQuestionId.value.keys()]));

const latestLogByQuestionId = computed(() => {
  const map = new Map();

  logsByQuestionId.value.forEach((logs, id) => {
    if (logs.length) map.set(id, logs[0]);
  });

  return map;
});

const difficultyCounts = computed(() => {
  return normalizedQuestions.value.reduce(
    (counts, question) => {
      counts.all += 1;
      counts[question.difficulty] += 1;
      return counts;
    },
    { all: 0, easy: 0, medium: 0, hard: 0 }
  );
});

const statusCounts = computed(() => {
  const total = normalizedQuestions.value.length;
  const practiced = practicedIds.value.size;
  const unpracticed = Math.max(0, total - practiced);
  const needImprove = normalizedQuestions.value.filter((question) => isNeedImprove(question.id)).length;

  return {
    all: total,
    new: unpracticed,
    done: practiced,
    weak: needImprove,
    favorite: favoriteIds.value.size
  };
});

const hasRealLogs = computed(() => normalizedLogs.value.length > 0);

const myStats = computed(() => {
  const recentAverage = hasRealLogs.value
    ? formatScore90(average(normalizedLogs.value.map((item) => item.scorePercent)))
    : "--";
  const practiced = statusCounts.value.done;
  const unpracticed = statusCounts.value.new;

  return [
    { label: "近期均分", val: recentAverage, color: "var(--c0)" },
    { label: "已练题数", val: formatInteger(practiced), color: "var(--c2)" },
    { label: "未练题数", val: formatInteger(unpracticed), color: "var(--mute)" }
  ];
});

const statusOpts = computed(() => [
  { val: "all", label: "所有状态", count: statusCounts.value.all, icon: "📋" },
  { val: "new", label: "未练习", count: statusCounts.value.new, icon: "🔵" },
  { val: "done", label: "已练习", count: statusCounts.value.done, icon: "✅" },
  { val: "weak", label: "需加强", count: statusCounts.value.weak, icon: "⚠️" },
  { val: "favorite", label: "已收藏", count: statusCounts.value.favorite, icon: "★" }
]);

const diffOpts = computed(() => [
  { val: "all", label: "全部难度", icon: "📚", count: difficultyCounts.value.all },
  { val: "easy", label: "简单", icon: "⭐", count: difficultyCounts.value.easy },
  { val: "medium", label: "中等", icon: "⭐⭐", count: difficultyCounts.value.medium },
  { val: "hard", label: "困难", icon: "⭐⭐⭐", count: difficultyCounts.value.hard }
]);

const diffLabel = computed(() => diffOpts.value.find((item) => item.val === selectedDiff.value)?.label || "全部难度");
const statusLabel = computed(() => statusOpts.value.find((item) => item.val === selectedStatus.value)?.label || "所有状态");

const filteredQuestions = computed(() => {
  const keyword = searchQ.value.trim().toLowerCase();

  let list = normalizedQuestions.value.filter((question) => {
    if (selectedDiff.value !== "all" && question.difficulty !== selectedDiff.value) return false;

    if (selectedStatus.value === "new" && practicedIds.value.has(question.id)) return false;
    if (selectedStatus.value === "done" && !practicedIds.value.has(question.id)) return false;
    if (selectedStatus.value === "weak" && !isNeedImprove(question.id)) return false;
    if (selectedStatus.value === "favorite" && !favoriteIds.value.has(question.id)) return false;

    if (!keyword) return true;

    return [
      question.id,
      question.content,
      question.topic,
      question.category,
      question.source_number_label,
      question.source_ref_id,
      Array.isArray(question.key_points) ? question.key_points.join(" ") : ""
    ]
      .filter(Boolean)
      .some((item) => normalizeText(item).toLowerCase().includes(keyword));
  });

  list = [...list].sort(compareQuestionsByRecentUpdate);
  return list;
});

const filteredList = computed(() => filteredQuestions.value.map((question) => buildQuestionCard(question)));

const recommendedQuestions = computed(() => {
  const byPreferredId = preferredRecommendationIds
    .map((id) => questionMap.value.get(id))
    .filter(Boolean);

  const alreadyPicked = new Set(byPreferredId.map((item) => item.id));
  const ruleRanked = [...normalizedQuestions.value]
    .filter((question) => !alreadyPicked.has(question.id))
    .sort(compareQuestionsForRecommendation);

  return [...byPreferredId, ...ruleRanked].slice(0, 3);
});

const aiRec = computed(() => {
  return recommendedQuestions.value.map((question) => ({
    id: question.id,
    diff: question.difficultyLabel,
    words: question.wordCount,
    question
  }));
});

const diffDist = computed(() => {
  const total = Math.max(1, difficultyCounts.value.all);
  return [
    { label: "简单", count: difficultyCounts.value.easy, pct: Math.round((difficultyCounts.value.easy / total) * 100), color: "var(--grn)" },
    { label: "中等", count: difficultyCounts.value.medium, pct: Math.round((difficultyCounts.value.medium / total) * 100), color: "var(--org)" },
    { label: "困难", count: difficultyCounts.value.hard, pct: Math.round((difficultyCounts.value.hard / total) * 100), color: "var(--red)" }
  ];
});

const loadingCopy = computed(() => {
  if (loading.value) return "正在加载 WFD 题库...";
  return "正在整理练习记录...";
});

function buildQuestionCard(question) {
  const logs = logsByQuestionId.value.get(question.id) || [];
  const latestLog = logs[0] || null;
  const myScore = latestLog ? formatScore10(latestLog.scorePercent) : null;

  return {
    id: question.id,
    source: {
      ...(question || {}),
      id: question.id,
      taskType: "WFD",
      task_type: "WFD",
      content: question.content,
      audio_script: question.audio_script || question.audioScript || question.content,
      word_count: question.wordCount,
      wordCount: question.wordCount
    },
    summaryText: summarizeQuestionText(question.content || "WFD 听写题目"),
    words: question.wordCount,
    sec: question.estimatedSeconds,
    level: question.difficulty,
    diff: question.difficultyLabel,
    myScore,
    isWeak: isNeedImprove(question.id),
    history: logs.length ? logs.slice(0, 3).map(formatHistoryLog) : [],
    isFavorite: favoriteIds.value.has(question.id)
  };
}

function compareQuestionsByRecentUpdate(a, b) {
  if (a.updatedAtMs || b.updatedAtMs) {
    if (a.updatedAtMs !== b.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
  }

  const idOrder = getIdSortValue(a.id) - getIdSortValue(b.id);
  return idOrder || a.sortIndex - b.sortIndex;
}

function compareQuestionsForRecommendation(a, b) {
  const aPracticed = practicedIds.value.has(a.id) ? 1 : 0;
  const bPracticed = practicedIds.value.has(b.id) ? 1 : 0;
  if (aPracticed !== bPracticed) return aPracticed - bPracticed;

  const aNeedImprove = isNeedImprove(a.id) ? 0 : 1;
  const bNeedImprove = isNeedImprove(b.id) ? 0 : 1;
  if (aNeedImprove !== bNeedImprove) return aNeedImprove - bNeedImprove;

  const difficultyOrder = { medium: 0, easy: 1, hard: 2 };
  if (difficultyOrder[a.difficulty] !== difficultyOrder[b.difficulty]) {
    return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
  }

  return a.wordCount - b.wordCount || a.sortIndex - b.sortIndex;
}

function isNeedImprove(questionId) {
  const latest = latestLogByQuestionId.value.get(questionId);
  return Boolean(latest && latest.scorePercent > 0 && latest.scorePercent < 80);
}

function startPractice(question) {
  const target = question?.source || question?.question || question;
  if (target) {
    practiceStore.setSelectedQuestion({
      ...(target || {}),
      taskType: "WFD",
      task_type: "WFD"
    });
  }

  router.push("/wfd/practice");
}

function startFilteredPractice() {
  const pool = filteredQuestions.value.length ? filteredQuestions.value : normalizedQuestions.value;
  const question = practiceMode.value === "rand" ? pickRandom(pool) : pool[0];
  startPractice(question || null);
}

function toggleFavorite(questionOrId) {
  const questionId = normalizeText(questionOrId?.id || questionOrId);
  if (!questionId) return;

  const next = new Set(favoriteIds.value);
  if (next.has(questionId)) {
    next.delete(questionId);
  } else {
    next.add(questionId);
  }

  favoriteIds.value = next;
  saveFavorites();
}

function goWfdCenter() {
  router.push("/wfd");
}

function goPractice(questionOrMode) {
  startPractice(questionOrMode);
}

function loadFavorites() {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(getFavoriteStorageKey());
    const ids = JSON.parse(raw || "[]");
    favoriteIds.value = new Set(Array.isArray(ids) ? ids.map(normalizeText).filter(Boolean) : []);
  } catch {
    favoriteIds.value = new Set();
  }
}

function saveFavorites() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getFavoriteStorageKey(), JSON.stringify([...favoriteIds.value]));
  } catch {
    // Favorites are local UI state; storage failures should not block practice.
  }
}

function getFavoriteStorageKey() {
  const userId = normalizeText(authStore.user?.id || authStore.session?.user?.id || "local");
  return `kai-kou:wfd-list:favorites:${userId}`;
}

function getQuestionText(question) {
  return normalizeText(question?.content || question?.audio_script || question?.audioScript || question?.prompt || "");
}

function getWordCount(question) {
  const explicit = Number(question?.word_count ?? question?.wordCount ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const content = getQuestionText(question);
  return content ? content.split(/\s+/).filter(Boolean).length : 0;
}

function summarizeQuestionText(text) {
  const normalized = normalizeText(text);
  const maxLength = 185;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function estimateSeconds(question, wordCount = getWordCount(question)) {
  const explicit = Number(question?.duration ?? question?.duration_sec ?? question?.durationSec ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return Math.max(12, Math.round((wordCount || 0) / 2.7));
}

function resolveDifficulty(question, wordCount = getWordCount(question)) {
  const raw = question?.difficulty ?? question?.level ?? "";
  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric <= 1) return "easy";
    if (numeric >= 3) return "hard";
    return "medium";
  }

  const text = normalizeText(raw).toLowerCase();
  if (/easy|simple|beginner|简单/.test(text)) return "easy";
  if (/hard|difficult|advanced|困难/.test(text)) return "hard";
  if (/medium|normal|中等/.test(text)) return "medium";

  if (wordCount <= 50) return "easy";
  if (wordCount >= 76) return "hard";
  return "medium";
}

function getDifficultyLabel(value) {
  if (value === "easy") return "简单";
  if (value === "hard") return "困难";
  return "中等";
}

function getDifficultyClass(value) {
  if (value === "easy") return "easy";
  if (value === "hard") return "hard";
  return "medium";
}

function parseScoreJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function resolveWfdScorePercent(scoreJson) {
  const score = pickNumber([
    scoreJson?.score,
    scoreJson?.percent,
    scoreJson?.accuracy,
    scoreJson?.wfd_accuracy,
    scoreJson?.wfdAccuracy,
    scoreJson?.scores?.score,
    scoreJson?.scores?.overall
  ]);

  if (score !== null) {
    return clamp(score <= 10 ? score * 10 : score, 0, 100);
  }

  const correct = Number(scoreJson?.correct);
  const total = Number(scoreJson?.total);
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
    return clamp((correct / total) * 100, 0, 100);
  }

  return 0;
}

function pickNumber(values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getQuestionUpdatedAtMs(question) {
  const date = parseDate(question?.updated_at || question?.updatedAt || question?.created_at || question?.createdAt);
  return date?.getTime() || 0;
}

function getIdSortValue(id) {
  const matched = normalizeText(id).match(/(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

function formatHistoryLog(log) {
  return {
    date: formatShortDate(log.createdAt),
    score: formatScore10(log.scorePercent),
    percent: Math.round(clamp(log.scorePercent, 0, 100)),
    color: getHistoryColor(log.scorePercent)
  };
}

function getHistoryColor(scorePercent) {
  if (scorePercent >= 90) return "green";
  if (scorePercent < 80) return "red";
  return "orange";
}

function formatScore10(scorePercent) {
  return (clamp(scorePercent, 0, 100) / 10).toFixed(1);
}

function formatScore90(scorePercent) {
  return (clamp(scorePercent, 0, 100) * 0.9).toFixed(1);
}

function formatShortDate(date) {
  if (!date) return "--";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function average(values) {
  const safe = values.map(Number).filter((item) => Number.isFinite(item) && item >= 0);
  if (!safe.length) return 0;
  return safe.reduce((sum, item) => sum + item, 0) / safe.length;
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return `${Math.round(number)}`;
}

function pickRandom(pool) {
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<template>
  <div class="shell" data-testid="wfd-list-page">
    <header class="topbar">
      <button class="tb-back" type="button" data-testid="wfd-list-back" @click="goWfdCenter">
        <span class="tb-arr">‹</span>WFD 练习中心
      </button>
      <div class="tb-title">WFD 题库</div>
      <div class="tb-right">
        <div class="vip-pill"><span class="vip-dot"></span>VIP · 无限练习</div>
        <button class="exit-btn" type="button" @click="goWfdCenter">退出</button>
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
              :data-testid="`wfd-status-${s.val}`"
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
              <span>根据错词和练习记录，优先练中等难度听写题</span>
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
          <div class="fc-title">我的 WFD 数据</div>
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
              data-testid="wfd-search"
              placeholder="搜索题目内容…"
            />
            <button v-if="searchQ" class="sb-clear" type="button" @click="searchQ = ''">✕</button>
          </div>
          <div class="sb-stats">
            共 <b data-testid="wfd-result-count">{{ filteredList.length }}</b> 道题
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
            :data-testid="`wfd-diff-${d.val}`"
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

        <div v-else-if="filteredList.length" class="q-list" data-testid="wfd-question-list">
          <article
            v-for="q in filteredList"
            :key="q.id"
            class="q-card"
            :class="{ 'q-card--active': q.isWeak }"
            data-testid="wfd-question-card"
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
                  :style="{ color: Number(q.myScore) >= 8 ? 'var(--grn)' : 'var(--org)' }"
                >
                  我的：{{ q.myScore }}
                </span>
                <button
                  class="qc-go"
                  type="button"
                  data-testid="wfd-card-practice"
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
                <div class="qch-bar-bg"><div class="qch-bar-fill" :style="{ width: `${h.percent}%` }"></div></div>
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
                <div class="gc-tip-desc">从简单听写开始，稳定拼写和短句记忆</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot" style="background:var(--org)"></div>
              <div>
                <div class="gc-tip-title">提升阶段</div>
                <div class="gc-tip-desc">主攻中等题，集中突破单复数和冠词细节</div>
              </div>
            </div>
            <div class="gc-tip-item">
              <div class="gc-tip-dot" style="background:var(--red)"></div>
              <div>
                <div class="gc-tip-title">冲刺阶段</div>
                <div class="gc-tip-desc">攻克困难题，应对长句记忆和复杂语法</div>
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
              <span class="sr-label">播放次数</span>
              <span class="sr-fixed">单次播放</span>
            </div>
            <button class="start-all-btn" type="button" data-testid="wfd-start-filtered" @click="startFilteredPractice">
              🎧 开始练习全部筛选题
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
