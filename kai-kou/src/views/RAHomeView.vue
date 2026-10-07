<template>
  <div class="shell">
    <header class="topbar">
      <button class="tb-back" type="button" @click="goHome">
        <span class="tb-arr">‹</span>
        <span>练习中心</span>
      </button>
      <div class="tb-title">RA · 朗读练习</div>
      <div class="tb-right">
        <div class="vip-pill" :class="`vip-pill--${membership.kind}`">
          <span class="vip-dot"></span>{{ membership.label }}
        </div>
        <button class="exit-btn" type="button" @click="goHome">退出</button>
      </div>
    </header>

    <div class="page-body">
      <aside class="left-panel">
        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">◈</span> 我的 RA 数据</div>
          <div class="pc-body">
            <div class="stat-grid">
              <div v-for="item in personalStats" :key="item.label" class="sg-item">
                <div class="sg-val" :class="item.className">
                  {{ item.value }}<span v-if="item.unit" class="sg-unit">{{ item.unit }}</span>
                </div>
                <div class="sg-lbl">{{ item.label }}</div>
              </div>
            </div>

            <div class="dim-bars">
              <div v-for="d in dimensionBars" :key="d.key" class="dim-row">
                <span class="dim-name">{{ d.name }}</span>
                <div class="dim-bg">
                  <div class="dim-fill" :style="{ width: `${d.pct}%`, background: d.color }"></div>
                </div>
                <span class="dim-val">{{ d.label }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">✦</span> AI 私教建议</div>
          <div class="pc-body">
            <div class="ai-tip-banner">
              <span class="ai-tip-ico">💡</span>
              <span>{{ aiTipText }}</span>
            </div>
            <div class="ai-actions-list">
              <button class="aal-item" type="button" @click="goAgent">📊 分析我的 RA 弱项</button>
              <button class="aal-item" type="button" @click="goAgent">📋 生成本周 RA 计划</button>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">◈</span> 最近练习记录</div>
          <div class="pc-body pc-body--tight">
            <div v-if="recentHistory.length" class="history-list">
              <button
                v-for="r in recentHistory"
                :key="r.id"
                class="hist-item"
                type="button"
                @click="startQuestionPractice(r.question)"
              >
                <div class="hi-left">
                  <div class="hi-code">{{ r.code }}</div>
                  <div>
                    <div class="hi-title">{{ r.title }}</div>
                    <div class="hi-date">{{ r.date }}</div>
                  </div>
                </div>
                <div class="hi-score" :class="{ 'hi-score--good': r.score >= 70 }">{{ r.scoreLabel }}</div>
              </button>
            </div>
            <div v-else class="empty-state">暂无 RA 练习记录</div>
          </div>
        </section>
      </aside>

      <main class="main-area">
        <section class="hero-banner">
          <div class="hb-text">
            <div class="hb-kicker">READ ALOUD · RA · 朗读题</div>
            <h1 class="hb-title">RA 朗读练习</h1>
            <p class="hb-sub">节奏与流利度 · 发音清晰度 · 内容覆盖率</p>
            <div class="hb-tags">
              <span class="hb-tag">口语</span>
              <span class="hb-tag">40 秒准备</span>
              <span class="hb-tag">40 秒录音</span>
              <span class="hb-tag">系统自动评分</span>
            </div>
          </div>
          <div class="hb-deco" aria-hidden="true">
            <div class="hb-circle hb-c1"></div>
            <div class="hb-circle hb-c2"></div>
            <div class="hb-icon">🎙</div>
          </div>
        </section>

        <section class="entry-cards">
          <button class="entry-card entry-random" type="button" data-testid="ra-random-practice" @click="startRandomPractice">
            <div class="ec-icon">🔀</div>
            <div>
              <div class="ec-title">随机练习</div>
              <div class="ec-sub">系统智能推题，覆盖各难度</div>
            </div>
            <div class="ec-count">共 {{ questionTotalLabel }} 题</div>
          </button>

          <button class="entry-card entry-select" type="button" data-testid="ra-select-practice" @click="goBank">
            <div class="ec-icon">📚</div>
            <div>
              <div class="ec-title">选题练习</div>
              <div class="ec-sub">从题库自由选择目标题目</div>
            </div>
            <div class="ec-count">浏览题库</div>
          </button>
        </section>

        <section class="diff-grid">
          <article v-for="d in difficultyCards" :key="d.level" class="diff-card">
            <div class="dc-head">
              <span class="dc-icon">{{ d.icon }}</span>
              <span class="dc-name" :style="{ color: d.color }">{{ d.name }}</span>
              <span class="dc-count">{{ d.count }} 题</span>
            </div>
            <div class="dc-desc">{{ d.desc }}</div>
            <div class="dc-avg">近期均分 <b :style="{ color: d.color }">{{ d.avg }}</b></div>
            <button
              class="dc-btn"
              type="button"
              :data-testid="`ra-difficulty-${d.level}`"
              :style="{ background: d.bgBtn, color: d.color, borderColor: d.border }"
              @click="startDifficultyPractice(d.level)"
            >
              练这个难度
            </button>
          </article>
        </section>

        <section class="today-rec">
          <div class="tr-header">
            <span class="tr-title">✦ 今日 AI 推荐</span>
            <span class="tr-sub">{{ recommendationCaption }}</span>
          </div>
          <div class="tr-list">
            <button
              v-for="q in todayRecommendations"
              :key="q.id"
              class="tr-item"
              type="button"
              data-testid="ra-recommendation-practice"
              @click="startQuestionPractice(q.question)"
            >
              <div class="tri-left">
                <span class="tri-code">{{ q.id }}</span>
                <div>
                  <div class="tri-text">{{ q.text }}</div>
                  <div class="tri-meta">{{ q.words }} 词 · {{ q.sec }} 秒 · {{ q.reason }}</div>
                </div>
              </div>
              <div class="tri-right">
                <span class="tri-diff" :class="q.level">{{ q.diff }}</span>
                <span class="tri-go">练习 →</span>
              </div>
            </button>
          </div>
        </section>
      </main>

      <aside class="right-panel">
        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">◈</span> 评分维度</div>
          <div class="pc-body">
            <div v-for="s in scoreItems" :key="s.name" class="score-item">
              <div class="si-hd">
                <span class="si-name">{{ s.name }}</span>
                <span class="si-weight">{{ s.weight }}</span>
              </div>
              <div class="si-desc">{{ s.desc }}</div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">✦</span> 朗读技巧</div>
          <div class="pc-body">
            <div v-for="t in tips" :key="t" class="tip-item">
              <div class="tip-dot"></div>
              <span class="tip-text">{{ t }}</span>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">◎</span> 错读词篮子</div>
          <div class="pc-body">
            <div class="misread-head">
              <div class="mh-count">{{ misreadBasket.length }}</div>
              <div class="mh-sub">{{ misreadBasketSourceLabel }}</div>
            </div>

            <div v-if="misreadBasket.length" class="misread-list">
              <button
                v-for="item in misreadBasket"
                :key="item.word"
                class="misread-item"
                type="button"
                @click="startQuestionPractice(item.question)"
              >
                <div class="mi-main">
                  <span class="mi-word">{{ item.word }}</span>
                  <span class="mi-meta">疑似漏读 {{ item.count }} 次 · {{ item.questionId }}</span>
                </div>
                <span class="mi-action">复练</span>
              </button>
            </div>

            <div v-else class="misread-empty">暂无真实错读词，完成几次 RA 后自动生成。</div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { requestDailyAiSuggestion } from "@/lib/agent";
import { fetchQuestions } from "@/lib/questions";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";

const PRACTICE_ROUTE = "/ra/practice";
const WEEKLY_RA_TARGET = 15;
const RECENT_LOG_LIMIT = 80;
const RECENT_HISTORY_DISPLAY_LIMIT = 10;
const TODAY_RECOMMENDATION_LIMIT = 10;
const RECENT_SCORE_SAMPLE_SIZE = 10;
const MISREAD_BASKET_LIMIT = 5;
const MISREAD_LOG_SAMPLE_SIZE = 20;
const RA_MISREAD_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "although",
  "among",
  "and",
  "are",
  "because",
  "been",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "does",
  "during",
  "each",
  "from",
  "had",
  "has",
  "have",
  "her",
  "him",
  "his",
  "how",
  "into",
  "its",
  "may",
  "more",
  "most",
  "not",
  "often",
  "our",
  "out",
  "over",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "was",
  "were",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your"
]);

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();

const questions = ref([]);
const raLogs = ref([]);
const dailySuggestion = ref(null);
const dailySuggestionSource = ref("static");
const questionSource = ref("static");

const fallbackRecommendations = [
  {
    id: "RA_004",
    content: "The core of the problem was the immense disparity between the expectations of the community and the resources available.",
    difficulty: 3
  },
  {
    id: "RA_009",
    content: "Scientists have discovered that the human brain continues to form new connections throughout adult life.",
    difficulty: 2
  },
  {
    id: "RA_015",
    content: "Every morning, no matter how late he had been up, the researcher recorded his observations in a notebook.",
    difficulty: 1
  },
  {
    id: "RA_002",
    content: "When countries assess their annual carbon emissions, they count the fuel burned by cars, factories, and power plants.",
    difficulty: 2
  },
  {
    id: "RA_001",
    content: "While blue is one of the most popular colors, it is one of the rarest colors found naturally in food.",
    difficulty: 1
  },
  {
    id: "RA_006",
    content: "Although it comes from a remote region, the plant has become a valuable resource for modern medical researchers.",
    difficulty: 2
  },
  {
    id: "RA_008",
    content: "At the beginning of each semester, students are encouraged to review the course outline and plan their study schedule.",
    difficulty: 1
  },
  {
    id: "RA_011",
    content: "Economic historians often compare trade records with climate data to understand why some cities expanded more rapidly than others.",
    difficulty: 3
  },
  {
    id: "RA_018",
    content: "The museum's new exhibition explores how digital archives have changed the way communities preserve local memories.",
    difficulty: 2
  },
  {
    id: "RA_023",
    content: "Recent advances in battery technology have made it possible to store renewable energy more efficiently during periods of low demand.",
    difficulty: 3
  }
];

const difficultyConfigs = [
  {
    name: "简单",
    level: "easy",
    numeric: 1,
    icon: "⭐",
    desc: "词数 40–55，节奏均匀，适合热身",
    color: "#5A9E6A",
    bgBtn: "#DFF0E4",
    border: "#A8D4B4"
  },
  {
    name: "中等",
    level: "medium",
    numeric: 2,
    icon: "⭐⭐",
    desc: "词数 55–70，有从句和停顿挑战",
    color: "#C07840",
    bgBtn: "#F2E4D0",
    border: "#D4B090"
  },
  {
    name: "困难",
    level: "hard",
    numeric: 3,
    icon: "⭐⭐⭐",
    desc: "词数 70+，专业术语多，节奏复杂",
    color: "#B84040",
    bgBtn: "#F5E0DC",
    border: "#D4A8A0"
  }
];

const scoreItems = [
  { name: "Fluency 流利度", weight: "约45%", desc: "看语速是否稳定、停顿是否自然、整段有没有明显卡顿。" },
  { name: "Pronunciation 发音", weight: "约35%", desc: "看单词发音清不清楚，元音、辅音和重音是否大致到位。" },
  { name: "Content 内容", weight: "约20%", desc: "看识别文本和原文是否匹配，读到较多关键词会有基础保障。" }
];

const tips = [
  "准备时默读一遍，感受整段节奏",
  "逗号处短暂停顿，句号处停顿更长",
  "专有名词适当放慢，确保清晰",
  "语速保持均匀，不因紧张加快",
  "用气息支撑声音，避免气短"
];

const membership = computed(() => {
  if (!authStore.loaded) return { kind: "loading", label: "同步中" };
  if (authStore.isPremium) return { kind: "vip", label: "VIP · 无限练习" };
  if (authStore.isInTrial) return { kind: "trial", label: `试用 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天` };
  return { kind: "locked", label: "未开通" };
});

const questionById = computed(() => {
  const map = new Map();
  questions.value.forEach((question) => {
    const id = normalizeText(question?.id);
    if (id) map.set(id, question);
  });
  return map;
});

const scoredLogs = computed(() => raLogs.value.filter((log) => Number.isFinite(Number(log.overall))));
const recentScoredLogs = computed(() => scoredLogs.value.slice(0, RECENT_SCORE_SAMPLE_SIZE));
const recentAverageScore = computed(() => average(recentScoredLogs.value.map((log) => log.overall)));
const weeklyLogs = computed(() => raLogs.value.filter((log) => isInCurrentWeek(log.createdAt)));
const weeklyDone = computed(() => weeklyLogs.value.length);
const weeklyTotal = computed(() => WEEKLY_RA_TARGET);
const weekScoreDelta = computed(() => {
  const currentAverage = average(scoredLogs.value.filter((log) => isInCurrentWeek(log.createdAt)).map((log) => log.overall));
  const previousAverage = average(scoredLogs.value.filter((log) => isInPreviousWeek(log.createdAt)).map((log) => log.overall));
  if (currentAverage === null || previousAverage === null) return null;
  return Number((currentAverage - previousAverage).toFixed(1));
});
const streakDays = computed(() => calculateStreakDays(raLogs.value.map((log) => log.createdAt)));
const misreadBasket = computed(() => buildMisreadBasket());
const misreadBasketSourceLabel = computed(() => {
  if (misreadBasket.value.length) return `基于最近 ${Math.min(raLogs.value.length, MISREAD_LOG_SAMPLE_SIZE)} 次 RA`;
  if (raLogs.value.length) return "暂无明显漏读词";
  return "等待真实练习记录";
});

const personalStats = computed(() => [
  {
    label: "近期均分",
    value: recentAverageScore.value === null ? "--" : formatScore(recentAverageScore.value),
    unit: recentAverageScore.value === null ? "" : "/90"
  },
  { label: "本周练习", value: formatInteger(weeklyDone.value), unit: "" },
  {
    label: "较上周",
    value: formatDelta(weekScoreDelta.value),
    unit: "",
    className: weekScoreDelta.value > 0 ? "sg-val--up" : weekScoreDelta.value < 0 ? "sg-val--down" : ""
  },
  { label: "连续天数", value: formatInteger(streakDays.value), unit: "" }
]);

const dimensionBars = computed(() => {
  const rows = recentScoredLogs.value;
  return [
    { key: "pronunciation", name: "发音", color: "#5A9E6A" },
    { key: "fluency", name: "流利度", color: "#C07840" },
    { key: "content", name: "内容", color: "#7C5C3E" }
  ].map((item) => {
    const rawAverage = average(rows.map((log) => log.scores[item.key]));
    const value30 = rawAverage === null ? null : Math.round(rawAverage / 3);
    const bounded = value30 === null ? 0 : clamp(value30, 0, 30);
    return {
      ...item,
      pct: Math.round((bounded / 30) * 100),
      label: value30 === null ? "--/30" : `${bounded}/30`
    };
  });
});

const weakestDimension = computed(() => {
  const values = dimensionBars.value
    .map((item) => ({ ...item, score: Number(item.label.split("/")[0]) }))
    .filter((item) => Number.isFinite(item.score));
  return values.sort((left, right) => left.score - right.score)[0] || null;
});

const aiTipText = computed(() => {
  const agentAdvice = normalizeText(dailySuggestion.value?.advice || dailySuggestion.value?.reason);
  if (agentAdvice) return truncateText(agentAdvice, 42);

  const weakest = weakestDimension.value;
  if (weakest?.name) {
    return `${weakest.name}是你的主要弱项，建议优先练习中等难度题`;
  }

  return "流利度是你的主要弱项，建议优先练习中等难度题";
});

const recentHistory = computed(() =>
  raLogs.value.slice(0, RECENT_HISTORY_DISPLAY_LIMIT).map((log) => {
    const question = resolveQuestionForLog(log);
    const title = question?.content || log.questionContent || log.transcript || "RA 朗读练习";
    return {
      id: log.id,
      code: log.questionId || "RA",
      question,
      title: truncateText(title, 26),
      date: formatMonthDayTime(log.createdAt),
      score: Number(log.overall || 0),
      scoreLabel: Number.isFinite(Number(log.overall)) ? Math.round(log.overall) : "--"
    };
  })
);

const difficultyCards = computed(() =>
  difficultyConfigs.map((config) => {
    const list = questions.value.filter((question) => difficultyLevel(question) === config.numeric);
    const scores = scoredLogs.value
      .filter((log) => difficultyLevel(resolveQuestionForLog(log)) === config.numeric)
      .map((log) => log.overall);
    const scoreAverage = average(scores);

    return {
      ...config,
      count: list.length,
      avg: scoreAverage === null ? "--" : formatScore(scoreAverage)
    };
  })
);

const questionTotalLabel = computed(() => (questions.value.length ? formatInteger(questions.value.length) : "--"));
const recommendationProfile = computed(() => buildRecommendationProfile());
const recommendationCaption = computed(() => {
  if (scoredLogs.value.length) return "实时画像：基于最近得分、弱项与练习记录";
  if (raLogs.value.length) return "实时画像：基于练习记录与 RA 题库";
  if (questionSource.value === "question_bank") return "新用户画像：RA 题库难度均衡推荐";
  return "新用户画像：使用示例题难度均衡推荐";
});

const todayRecommendations = computed(() => {
  const source = buildRecommendationSource();
  const profile = recommendationProfile.value;
  const ranked = source
    .map((question, index) => ({
      question,
      index,
      score: scoreQuestionForProfile(question, index, profile)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = selectRankedRecommendations(ranked, profile);

  return selected.map(({ question }) => {
    const level = difficultyLevel(question);
    const config = difficultyConfigs.find((item) => item.numeric === level) || difficultyConfigs[1];
    const content = normalizeText(question?.content) || "Please read the passage aloud.";
    const words = getWordCount(question);
    return {
      id: normalizeText(question?.id) || "RA",
      text: truncateText(content, 64),
      words,
      sec: Math.max(18, Math.round(words / 2.5)),
      diff: config.name,
      level: config.level,
      reason: recommendationReason(question, profile),
      question
    };
  });
});

function buildRecommendationSource() {
  if (!questions.value.length) return fallbackRecommendations;

  const realKeys = new Set(questions.value.map((question) => recommendationKey(question)).filter(Boolean));
  const fallbackFillers = fallbackRecommendations.filter((question) => !realKeys.has(recommendationKey(question)));
  return [...questions.value, ...fallbackFillers];
}

function recommendationKey(question) {
  return normalizeText(question?.id) || normalizeText(question?.content);
}

function selectRankedRecommendations(ranked, profile) {
  const quotas = getRecommendationDifficultyQuotas(profile);
  const selected = [];
  const used = new Set();
  const addItem = (item) => {
    const key = recommendationKey(item?.question);
    if (!item || !key || used.has(key) || selected.length >= TODAY_RECOMMENDATION_LIMIT) return false;
    selected.push(item);
    used.add(key);
    return true;
  };

  profile.preferredDifficulties.forEach((level) => {
    const quota = quotas[level] || 0;
    ranked.filter((item) => difficultyLevel(item.question) === level).some((item) => {
      const count = selected.filter((picked) => difficultyLevel(picked.question) === level).length;
      if (count >= quota) return true;
      addItem(item);
      return false;
    });
  });

  ranked.forEach(addItem);
  return selected.slice(0, TODAY_RECOMMENDATION_LIMIT);
}

function getRecommendationDifficultyQuotas(profile) {
  const averageScore = recentAverageScore.value;
  if (!profile.hasScores || averageScore === null || averageScore < 55) {
    return { 1: 5, 2: 4, 3: 1 };
  }
  if (averageScore < 72) {
    return { 1: 3, 2: 5, 3: 2 };
  }
  return { 1: 2, 2: 4, 3: 4 };
}

function buildMisreadBasket() {
  const wordMap = new Map();
  const rows = raLogs.value.slice(0, MISREAD_LOG_SAMPLE_SIZE);

  rows.forEach((log) => {
    const question = resolveQuestionForLog(log);
    const expectedWords = extractComparableWords(question?.content || log.questionContent);
    const spokenWords = new Set(extractComparableWords(log.transcript).map((item) => item.normalized));
    if (!expectedWords.length || !spokenWords.size) return;

    expectedWords.forEach(({ display, normalized }) => {
      if (!normalized || normalized.length < 4 || spokenWords.has(normalized) || RA_MISREAD_STOP_WORDS.has(normalized)) return;

      const existing = wordMap.get(normalized) || {
        word: display,
        count: 0,
        question,
        questionId: normalizeText(question?.id || log.questionId || "RA"),
        lastSeenAt: log.createdAt || ""
      };
      existing.count += 1;
      wordMap.set(normalized, existing);
    });
  });

  return Array.from(wordMap.values())
    .sort((left, right) => right.count - left.count || new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())
    .slice(0, MISREAD_BASKET_LIMIT);
}

function extractComparableWords(text) {
  return normalizeText(text)
    .match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g)?.map((word) => ({
      display: word,
      normalized: normalizeComparableWord(word)
    })).filter((item) => item.normalized) || [];
}

function normalizeComparableWord(word) {
  const normalized = normalizeText(word)
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/'s$/, "")
    .replace(/s'$/, "s");
  return normalized;
}

function buildRecommendationProfile() {
  const questionCounts = new Map();
  const latestScoreByQuestion = new Map();
  const difficultyCounts = new Map([
    [1, 0],
    [2, 0],
    [3, 0]
  ]);
  const todayQuestionKeys = new Set();
  const recentQuestionKeys = new Set();

  raLogs.value.forEach((log, index) => {
    const question = resolveQuestionForLog(log);
    const key = recommendationKey(question) || normalizeText(log?.questionId);
    if (!key) return;

    questionCounts.set(key, (questionCounts.get(key) || 0) + 1);
    if (index < 8) recentQuestionKeys.add(key);
    if (isToday(log.createdAt)) todayQuestionKeys.add(key);

    if (!latestScoreByQuestion.has(key) && Number.isFinite(Number(log.overall))) {
      latestScoreByQuestion.set(key, Number(log.overall));
    }

    const level = difficultyLevel(question);
    difficultyCounts.set(level, (difficultyCounts.get(level) || 0) + 1);
  });

  const weakestKey = findWeakestScoreKey(recentScoredLogs.value);
  const preferredDifficulties = getPreferredDifficultyOrder({
    averageScore: recentAverageScore.value,
    weakestKey,
    weeklyDone: weeklyDone.value,
    weeklyTotal: weeklyTotal.value
  });
  const difficultyRank = new Map(preferredDifficulties.map((level, index) => [level, index]));

  return {
    hasLogs: raLogs.value.length > 0,
    hasScores: scoredLogs.value.length > 0,
    weakestKey,
    preferredDifficulty: preferredDifficulties[0],
    preferredDifficulties,
    difficultyRank,
    questionCounts,
    latestScoreByQuestion,
    difficultyCounts,
    recentQuestionKeys,
    todayQuestionKeys
  };
}

function scoreQuestionForProfile(question, index, profile) {
  const key = recommendationKey(question);
  const level = difficultyLevel(question);
  const words = getWordCount(question);
  const practicedCount = profile.questionCounts.get(key) || 0;
  const recentScore = profile.latestScoreByQuestion.get(key);
  const difficultyRank = profile.difficultyRank.get(level) ?? 2;
  const difficultyPracticeCount = profile.difficultyCounts.get(level) || 0;
  let score = 100 - index * 0.02;

  score += difficultyRank === 0 ? 42 : difficultyRank === 1 ? 24 : 10;
  score += Math.max(0, 14 - difficultyPracticeCount * 2);

  if (!practicedCount) score += 34;
  if (practicedCount) score -= Math.min(28, practicedCount * 7);
  if (profile.recentQuestionKeys.has(key)) score -= 34;
  if (profile.todayQuestionKeys.has(key)) score -= 80;

  if (Number.isFinite(Number(recentScore)) && recentScore < 65 && !profile.todayQuestionKeys.has(key)) {
    score += recentScore < 50 ? 34 : 22;
  }

  if (profile.weakestKey === "fluency") {
    if (words > 0 && words <= 62) score += 18;
    if (words > 75) score -= 12;
    if (level <= 2) score += 8;
  } else if (profile.weakestKey === "pronunciation") {
    if (!practicedCount) score += 10;
    if (level <= 2) score += 12;
  } else if (profile.weakestKey === "content") {
    if (words > 0 && words <= 68) score += 16;
    if (level === 1 || level === 2) score += 10;
  }

  if (!profile.hasLogs && level === 2) score += 8;

  return score;
}

function recommendationReason(question, profile) {
  const key = recommendationKey(question);
  const practicedCount = profile.questionCounts.get(key) || 0;
  const recentScore = profile.latestScoreByQuestion.get(key);

  if (!profile.hasLogs) return "新用户热身";
  if (Number.isFinite(Number(recentScore)) && recentScore < 65) return "低分复练";
  if (!practicedCount) return "未练新题";
  if (difficultyLevel(question) === profile.preferredDifficulty) return "匹配当前难度";
  if (profile.weakestKey) return `${scoreKeyLabel(profile.weakestKey)}弱项训练`;
  return "练习间隔补充";
}

function findWeakestScoreKey(logs) {
  const averages = ["pronunciation", "fluency", "content"]
    .map((key) => ({ key, value: average(logs.map((log) => log.scores[key])) }))
    .filter((item) => item.value !== null);
  return averages.sort((left, right) => left.value - right.value)[0]?.key || "";
}

function getPreferredDifficultyOrder({ averageScore, weakestKey, weeklyDone, weeklyTotal }) {
  let order;
  if (averageScore === null) {
    order = [1, 2, 3];
  } else if (averageScore < 55) {
    order = [1, 2, 3];
  } else if (averageScore < 72) {
    order = [2, 1, 3];
  } else {
    order = [3, 2, 1];
  }

  if (["pronunciation", "fluency", "content"].includes(weakestKey) && Number(averageScore) < 68) {
    order = [1, 2, 3];
  }

  if (weeklyTotal > 0 && weeklyDone / weeklyTotal < 0.35 && order[0] === 3) {
    order = [2, 3, 1];
  }

  return order;
}

function scoreKeyLabel(key) {
  if (key === "pronunciation") return "发音";
  if (key === "fluency") return "流利度";
  if (key === "content") return "内容";
  return "能力";
}

onMounted(() => {
  void loadInitialData();
});

async function loadInitialData() {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  const [questionResult, logResult] = await Promise.allSettled([loadQuestions(), loadRALogs()]);
  if (questionResult.status === "rejected") {
    console.warn("RA questions load failed:", questionResult.reason);
  }
  if (logResult.status === "rejected") {
    console.warn("RA home logs load failed:", logResult.reason);
  }

  void loadDailySuggestion();
}

async function loadQuestions() {
  const list = await fetchQuestions("RA");
  questions.value = Array.isArray(list) ? list : [];
  questionSource.value = questions.value.length ? "question_bank" : "static";
}

async function loadRALogs() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    raLogs.value = [];
    return;
  }

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, question_id, transcript, score_json, feedback, created_at")
    .eq("task_type", "RA")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(RECENT_LOG_LIMIT);

  if (error) throw error;
  raLogs.value = (Array.isArray(data) ? data : []).map((row) => normalizeRALog(row));
}

async function loadDailySuggestion() {
  try {
    const signature = `${scoredLogs.value.length}:${weeklyDone.value}:${recentAverageScore.value || 0}`;
    const result = await requestDailyAiSuggestion({ practiceSignature: `ra-home:${signature}` });
    if (result?.ok && result?.suggestion) {
      dailySuggestion.value = result.suggestion;
      dailySuggestionSource.value = "agent";
      return;
    }
  } catch (error) {
    console.warn("RA home daily AI suggestion fallback:", error);
  }

  dailySuggestion.value = null;
  dailySuggestionSource.value = "static";
}

function goHome() {
  router.push("/home");
}

function goAgent() {
  router.push("/agent");
}

function goBank(difficulty = "") {
  const normalized = normalizeDifficultyKey(difficulty);
  router.push({
    path: "/ra/list",
    query: normalized ? { difficulty: normalized } : {}
  });
}

async function startRandomPractice() {
  const question = await pickQuestion();
  if (question) practiceStore.setSelectedQuestion(question);
  router.push({ path: PRACTICE_ROUTE, query: { mode: "random" } });
}

async function startDifficultyPractice(level) {
  const normalized = normalizeDifficultyKey(level);
  const question = await pickQuestion(normalized);
  if (question) practiceStore.setSelectedQuestion(question);
  router.push({
    path: PRACTICE_ROUTE,
    query: normalized ? { difficulty: normalized } : {}
  });
}

async function startQuestionPractice(question) {
  const normalizedQuestion = question || null;
  if (normalizedQuestion) {
    practiceStore.setSelectedQuestion(normalizedQuestion);
  }

  router.push({
    path: PRACTICE_ROUTE,
    query: normalizedQuestion?.id ? { questionId: normalizedQuestion.id } : {}
  });
}

async function pickQuestion(difficulty = "") {
  if (!questions.value.length) {
    await loadQuestions();
  }

  const numericDifficulty = difficultyKeyToNumber(difficulty);
  const pool = numericDifficulty
    ? questions.value.filter((question) => difficultyLevel(question) === numericDifficulty)
    : questions.value;

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function normalizeRALog(row) {
  const score = toObject(row?.score_json) || {};
  const scores = toObject(score?.scores) || {};
  const questionSnapshot = toObject(score?.questionSnapshot);
  return {
    id: normalizeText(row?.id),
    questionId: normalizeText(row?.question_id),
    transcript: normalizeText(row?.transcript),
    questionContent: normalizeText(questionSnapshot?.content),
    createdAt: normalizeText(row?.created_at),
    overall: normalizeScore(scores?.overall ?? score?.overall),
    scores: {
      pronunciation: normalizeScore(scores?.pronunciation ?? score?.pronunciation),
      fluency: normalizeScore(scores?.fluency ?? score?.fluency),
      content: normalizeScore(scores?.content ?? score?.content)
    }
  };
}

function resolveQuestionForLog(log) {
  const id = normalizeText(log?.questionId);
  if (!id) return null;
  return questionById.value.get(id) || {
    id,
    content: normalizeText(log?.questionContent),
    difficulty: 2
  };
}

async function resolveCurrentUserId() {
  const authUserId = normalizeText(authStore.user?.id);
  if (authUserId) return authUserId;

  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

function toObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp(number, 0, 90);
}

function average(values) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numericValues.length) return null;
  return Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(1));
}

function difficultyLevel(question) {
  const raw = Number(question?.difficulty ?? question?.level ?? 2);
  if (!Number.isFinite(raw)) return 2;
  if (raw <= 1) return 1;
  if (raw >= 3) return 3;
  return 2;
}

function normalizeDifficultyKey(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["1", "easy", "简单"].includes(normalized)) return "easy";
  if (["2", "medium", "中等"].includes(normalized)) return "medium";
  if (["3", "hard", "困难"].includes(normalized)) return "hard";
  return "";
}

function difficultyKeyToNumber(value) {
  const normalized = normalizeDifficultyKey(value);
  if (normalized === "easy") return 1;
  if (normalized === "hard") return 3;
  if (normalized === "medium") return 2;
  return 0;
}

function getWordCount(question) {
  const existing = Number(question?.word_count ?? question?.wordCount);
  if (Number.isFinite(existing) && existing > 0) return Math.round(existing);
  const words = normalizeText(question?.content).match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g);
  return words?.length || 0;
}

function truncateText(text, maxLength) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(number);
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(number)));
}

function formatDelta(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (Math.abs(number) < 0.05) return "→ 0";
  return `${number > 0 ? "↑" : "↓"} ${formatScore(Math.abs(number))}`;
}

function formatMonthDayTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function isInCurrentWeek(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const { start, end } = getWeekRange(new Date());
  return date >= start && date < end;
}

function isToday(value) {
  return toDateKey(value) === toDateKey(new Date());
}

function isInPreviousWeek(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const { start } = getWeekRange(new Date());
  const previousStart = addDays(start, -7);
  return date >= previousStart && date < start;
}

function getWeekRange(today) {
  const start = startOfDay(today);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  const end = addDays(start, 7);
  return { start, end };
}

function calculateStreakDays(values) {
  const dateKeys = new Set(values.map((value) => toDateKey(value)).filter(Boolean));
  let streak = 0;
  let cursor = startOfDay(new Date());

  while (dateKeys.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function toDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
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

<style scoped>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.shell{
  --c0:#1E1208;--c1:#3A2510;--c2:#7C5C3E;--c3:#A07850;--c4:#C4A878;
  --bg0:#F5EFE4;--bg1:#EDE8DC;--bg2:#E4DDD0;--bg3:#D8D0C0;
  --card:#FAF6EF;--card2:#F2EBE0;--bdr:#D4C8B4;--bdr2:#C4B49C;
  --grn:#5A9E6A;--grn2:#DFF0E4;--grn3:#A8D4B4;
  --org:#C07840;--org2:#F2E4D0;--org3:#D4B090;
  --red:#B84040;--red2:#F5E0DC;--red3:#D4A8A0;
  --mute:#A89070;
  display:flex;flex-direction:column;
  width:100vw;height:100vh;
  background:var(--bg1);
  font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;
  color:var(--c0);overflow:hidden;
}
.topbar{height:52px;flex-shrink:0;background:var(--c2);display:flex;align-items:center;justify-content:space-between;padding:0 28px;}
.tb-back{display:flex;align-items:center;gap:6px;color:rgba(250,246,239,.7);font-size:13px;cursor:pointer;background:transparent;border:0;font-family:inherit;}
.tb-arr{font-size:18px;line-height:1;}
.tb-title{font-size:15px;font-weight:700;color:#FAF6EF;}
.tb-right{display:flex;align-items:center;gap:10px;}
.vip-pill{display:flex;align-items:center;gap:5px;background:#DFF0E4;border:1px solid #A8D4B4;border-radius:99px;padding:4px 11px;font-size:11px;color:#2D6A3A;font-weight:600;}
.vip-pill--locked{background:#F2EBE0;border-color:#D4C8B4;color:#7C5C3E;}
.vip-pill--trial{background:#F2E4D0;border-color:#D4B090;color:#9A5B25;}
.vip-dot{width:5px;height:5px;border-radius:50%;background:#5A9E6A;}
.exit-btn{font-size:12.5px;color:rgba(250,246,239,.65);cursor:pointer;background:transparent;border:0;font-family:inherit;}
.page-body{flex:1;display:flex;min-height:0;overflow:hidden;}
.left-panel,.right-panel{width:268px;flex-shrink:0;background:var(--bg2);overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:12px;}
.left-panel{border-right:1px solid var(--bdr);}
.right-panel{border-left:1px solid var(--bdr);}
.left-panel::-webkit-scrollbar,.right-panel::-webkit-scrollbar{width:3px;}
.left-panel::-webkit-scrollbar-thumb,.right-panel::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.panel-card{background:var(--card);border:1px solid var(--bdr);border-radius:13px;overflow:hidden;flex-shrink:0;}
.pc-header{padding:11px 14px 10px;border-bottom:1px solid var(--bdr);font-size:12px;font-weight:700;color:var(--c0);display:flex;align-items:center;gap:5px;}
.pc-star{color:var(--c2);}
.pc-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.pc-body--tight{padding-top:0;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:4px;}
.sg-item{background:var(--card2);border:1px solid var(--bdr);border-radius:9px;padding:9px 10px;text-align:center;}
.sg-val{font-size:18px;font-weight:800;color:var(--c0);line-height:1;white-space:nowrap;}
.sg-val--up{color:var(--grn);}
.sg-val--down{color:var(--red);}
.sg-unit{font-size:10px;font-weight:400;color:var(--mute);}
.sg-lbl{font-size:9.5px;color:var(--mute);margin-top:2px;}
.dim-bars{display:flex;flex-direction:column;gap:7px;}
.dim-row{display:flex;align-items:center;gap:7px;}
.dim-name{width:38px;font-size:10.5px;color:var(--mute);flex-shrink:0;}
.dim-bg{flex:1;height:5px;background:var(--bdr);border-radius:99px;overflow:hidden;}
.dim-fill{height:100%;border-radius:99px;transition:width .4s;}
.dim-val{font-size:10.5px;color:var(--c1);width:34px;text-align:right;flex-shrink:0;}
.ai-tip-banner{background:var(--org2);border:1px solid var(--org3);border-radius:8px;padding:9px 11px;font-size:11.5px;color:var(--org);display:flex;gap:6px;line-height:1.55;}
.ai-tip-ico{flex-shrink:0;}
.ai-actions-list{display:flex;flex-direction:column;gap:5px;}
.aal-item{background:var(--card2);border:1px solid var(--bdr);border-radius:7px;padding:7px 9px;font-size:11.5px;color:var(--c1);cursor:pointer;text-align:left;font-family:inherit;}
.history-list{display:flex;flex-direction:column;gap:0;}
.hist-item{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--bdr);background:transparent;border-left:0;border-right:0;border-top:0;cursor:pointer;font-family:inherit;width:100%;text-align:left;}
.hist-item:last-child{border-bottom:none;}
.hi-left{display:flex;align-items:center;gap:7px;min-width:0;}
.hi-code{background:var(--card2);border:1px solid var(--bdr);padding:2px 5px;border-radius:5px;font-size:9px;font-weight:700;color:var(--c2);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.hi-title{font-size:11px;color:var(--c0);margin-bottom:1px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hi-date{font-size:9.5px;color:var(--mute);}
.hi-score{font-size:15px;font-weight:800;color:var(--org);}
.hi-score--good{color:var(--grn);}
.empty-state{min-height:72px;display:flex;align-items:center;justify-content:center;text-align:center;border:1px dashed var(--bdr);border-radius:8px;background:var(--card2);font-size:11px;color:var(--mute);}
.main-area{flex:1;min-width:0;min-height:0;overflow:hidden;padding:20px 24px;display:flex;flex-direction:column;gap:12px;}
.main-area::-webkit-scrollbar{width:4px;}
.main-area::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.hero-banner{background:linear-gradient(135deg,var(--c2) 0%,var(--c3) 55%,#C4A070 100%);border-radius:16px;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;overflow:hidden;position:relative;flex-shrink:0;}
.hb-kicker{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:rgba(250,246,239,.55);margin-bottom:6px;}
.hb-title{font-size:26px;font-weight:700;color:#FAF6EF;margin-bottom:5px;letter-spacing:0;}
.hb-sub{font-size:13px;color:rgba(250,246,239,.7);margin-bottom:12px;}
.hb-tags{display:flex;gap:7px;flex-wrap:wrap;}
.hb-tag{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);border-radius:99px;padding:3px 10px;font-size:11px;color:rgba(250,246,239,.85);}
.hb-deco{position:relative;width:86px;height:86px;flex-shrink:0;}
.hb-circle{position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.12);}
.hb-c1{width:68px;height:68px;top:9px;left:9px;}
.hb-c2{width:94px;height:94px;top:-4px;left:-4px;}
.hb-icon{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:32px;}
.entry-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex-shrink:0;}
.entry-card{background:var(--card);border:1.5px solid var(--bdr);border-radius:14px;padding:14px 20px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:transform .13s,box-shadow .13s;font-family:inherit;text-align:left;}
.entry-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(44,21,8,.1);}
.entry-random{border-color:var(--c2);background:linear-gradient(135deg,var(--card) 0%,#F0E8DC 100%);}
.entry-select{border-color:var(--bdr2);}
.ec-icon{font-size:28px;flex-shrink:0;}
.ec-title{font-size:15px;font-weight:700;color:var(--c0);margin-bottom:3px;}
.ec-sub{font-size:12px;color:var(--mute);}
.ec-count{margin-left:auto;font-size:11.5px;color:var(--c2);font-weight:600;flex-shrink:0;}
.diff-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;flex-shrink:0;}
.diff-card{background:var(--card);border:1px solid var(--bdr);border-radius:13px;padding:12px 16px;display:flex;flex-direction:column;gap:5px;}
.dc-head{display:flex;align-items:center;gap:7px;}
.dc-icon{font-size:13px;}
.dc-name{font-size:13px;font-weight:700;flex:1;}
.dc-count{font-size:10.5px;color:var(--mute);}
.dc-desc{font-size:11.5px;color:var(--mute);line-height:1.55;}
.dc-avg{font-size:11px;color:var(--mute);}
.dc-avg b{font-size:13px;}
.dc-btn{background:transparent;border:1px solid;border-radius:8px;padding:6px 0;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;width:100%;transition:opacity .12s;}
.dc-btn:hover{opacity:.8;}
.today-rec{background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;flex:1 1 auto;min-height:190px;display:flex;flex-direction:column;}
.tr-header{padding:11px 16px 9px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;}
.tr-title{font-size:13px;font-weight:700;color:var(--c0);}
.tr-sub{font-size:11px;color:var(--mute);}
.tr-list{display:flex;flex-direction:column;min-height:0;overflow-y:auto;}
.tr-list::-webkit-scrollbar{width:4px;}
.tr-list::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.tr-item{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;border-bottom:1px solid var(--bdr);cursor:pointer;transition:background .12s;gap:12px;background:transparent;font-family:inherit;text-align:left;}
.tr-item:last-child{border-bottom:none;}
.tr-item:hover{background:var(--card2);}
.tri-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.tri-code{font-size:10px;font-weight:700;color:var(--c2);background:var(--card2);border:1px solid var(--bdr);border-radius:5px;padding:2px 7px;flex-shrink:0;}
.tri-text{font-size:12.5px;color:var(--c0);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tri-meta{font-size:10.5px;color:var(--mute);}
.tri-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.tri-diff{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;}
.tri-diff.hard{background:var(--red2);color:var(--red);border:1px solid var(--red3);}
.tri-diff.medium{background:var(--org2);color:var(--org);border:1px solid var(--org3);}
.tri-diff.easy{background:var(--grn2);color:var(--grn);border:1px solid var(--grn3);}
.tri-go{font-size:12px;color:var(--c2);font-weight:600;}
.score-item{padding-bottom:9px;border-bottom:1px solid var(--bdr);}
.score-item:last-child{border-bottom:none;padding-bottom:0;}
.si-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}
.si-name{font-size:12px;font-weight:600;color:var(--c0);}
.si-weight{font-size:10px;background:var(--card2);border:1px solid var(--bdr);border-radius:4px;padding:1px 6px;color:var(--mute);}
.si-desc{font-size:11px;color:var(--mute);line-height:1.5;}
.tip-item{display:flex;gap:7px;align-items:flex-start;}
.tip-dot{width:5px;height:5px;border-radius:50%;background:var(--c2);flex-shrink:0;margin-top:4px;}
.tip-text{font-size:11.5px;color:var(--c1);line-height:1.6;}
.misread-head{display:flex;align-items:baseline;gap:8px;}
.mh-count{font-size:28px;font-weight:800;color:var(--c0);line-height:1;}
.mh-sub{font-size:11px;color:var(--mute);}
.misread-list{display:flex;flex-direction:column;gap:6px;}
.misread-item{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:7px 8px;cursor:pointer;text-align:left;font-family:inherit;}
.misread-item:hover{border-color:var(--bdr2);}
.mi-main{min-width:0;display:flex;flex-direction:column;gap:2px;}
.mi-word{font-size:12px;font-weight:700;color:var(--c0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mi-meta{font-size:9.5px;color:var(--mute);}
.mi-action{font-size:10.5px;color:var(--c2);font-weight:700;flex-shrink:0;}
.misread-empty{border:1px dashed var(--bdr);border-radius:8px;background:var(--card2);padding:12px 10px;font-size:11px;color:var(--mute);line-height:1.6;text-align:center;}
</style>
