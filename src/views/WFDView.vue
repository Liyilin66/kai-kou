<template>
  <div class="shell">
    <header class="topbar">
      <button class="tb-back" type="button" @click="goHome">
        <span class="tb-arr">‹</span>
        <span>练习中心</span>
      </button>
      <div class="tb-title">WFD · 听写练习</div>
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
          <div class="pc-header">我的 WFD 数据</div>
          <div class="pc-body">
            <div class="stat-grid">
              <div v-for="item in summaryTiles" :key="item.label" class="sg-item">
                <div class="sg-val" :class="item.className">
                  {{ item.value }}<span v-if="item.unit" class="sg-unit">{{ item.unit }}</span>
                </div>
                <div class="sg-lbl">{{ item.label }}</div>
              </div>
            </div>

            <div class="dim-bars">
              <div v-for="bar in metricBars" :key="bar.label" class="dim-row">
                <span class="dim-name">{{ bar.label }}</span>
                <div class="dim-bg">
                  <div class="dim-fill" :style="{ width: `${bar.percent}%` }"></div>
                </div>
                <span class="dim-val">{{ bar.value }}/30</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header">训练建议</div>
          <div class="pc-body">
            <div class="ai-tip-banner">
              <span>{{ coachAdvice }}</span>
            </div>
            <div class="ai-actions-list">
              <button class="aal-item" type="button" @click="openTutor('分析我的 WFD 弱项')">分析我的 WFD 弱项</button>
              <button class="aal-item" type="button" @click="openTutor('生成本周 WFD 计划')">生成本周 WFD 计划</button>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header">最近练习记录</div>
          <div class="pc-body pc-body--tight">
            <div v-if="recentRecords.length" class="history-list">
              <button
                v-for="record in recentRecords"
                :key="record.id"
                class="hist-item"
                type="button"
                @click="practiceQuestion(record.question)"
              >
                <div class="hi-left">
                  <div class="hi-code">{{ record.code }}</div>
                  <div>
                    <div class="hi-title">{{ record.title }}</div>
                    <div class="hi-date">{{ record.time }}</div>
                  </div>
                </div>
                <div class="hi-score">{{ record.score }}</div>
              </button>
            </div>
            <div v-else class="empty-state">暂无 WFD 练习记录</div>
          </div>
        </section>
      </aside>

      <main class="main-area">
        <section class="hero-banner">
          <div class="hb-text">
            <div class="hb-kicker">WRITE FROM DICTATION · WFD · 听写题</div>
            <h1 class="hb-title">WFD 听写练习</h1>
            <p class="hb-sub">通过听写训练提升拼写准确度与语法运用能力</p>
            <div class="hb-tags">
              <span class="hb-tag">听写训练</span>
              <span class="hb-tag">AI 反馈</span>
              <span class="hb-tag">即时评分</span>
            </div>
          </div>
        </section>

        <section class="entry-cards entry-cards--wfd" aria-label="WFD 练习模式">
          <button
            v-for="mode in primaryPracticeModes"
            :key="mode.title"
            :class="['entry-card', mode.entryClass]"
            type="button"
            @click="mode.action"
          >
            <div>
              <div class="ec-title">{{ mode.title }}</div>
              <div class="ec-sub">{{ mode.description }}</div>
            </div>
            <div class="ec-count">{{ mode.meta }}</div>
          </button>
        </section>

        <section class="diff-grid">
          <article v-for="difficulty in difficultyCards" :key="difficulty.id" class="diff-card">
            <div class="dc-head">
              <span class="dc-name">{{ difficulty.title }}</span>
              <span class="dc-count">{{ difficulty.count }} 题</span>
            </div>
            <div class="dc-desc">{{ difficulty.description }}</div>
            <div class="dc-avg">
              近期均分 <b class="kk-num">{{ difficulty.average }}</b>
            </div>
            <button
              class="dc-btn"
              type="button"
              @click="practiceDifficulty(difficulty.id)"
            >
              练这个难度
            </button>
          </article>
        </section>

        <section class="today-rec">
          <div class="tr-header">
            <span class="tr-title">今日推荐</span>
            <span class="tr-sub">
              基于题库与练习记录推荐
              <button class="tr-refresh" type="button" @click="changeRecommendationBatch">换一批</button>
            </span>
          </div>
          <div v-if="recommendedItems.length" class="tr-list">
            <button
              v-for="item in recommendedItems"
              :key="item.id"
              class="tr-item"
              type="button"
              @click="practiceQuestion(item.question)"
            >
              <div class="tri-left">
                <span class="tri-code">{{ item.id }}</span>
                <div>
                  <div class="tri-text">{{ item.title }}</div>
                  <div class="tri-meta">{{ item.words }} 词 · 约 {{ item.seconds }} 秒 · {{ item.scene }}</div>
                </div>
              </div>
              <div class="tri-right">
                <span class="tri-diff" :class="item.difficultyClass">{{ item.difficultyLabel }}</span>
                <span class="tri-go">练习 →</span>
              </div>
            </button>
          </div>
          <p v-else class="tr-empty">题库正在加载，稍后会显示推荐题目。</p>
        </section>
      </main>

      <aside class="right-panel">
        <section class="panel-card">
          <div class="pc-header">评分维度</div>
          <div class="pc-body">
            <div v-for="item in scoringDimensions" :key="item.title" class="score-item">
              <div class="si-hd">
                <span class="si-name">{{ item.title }}</span>
                <span class="si-weight">{{ item.scoreLabel }}</span>
              </div>
              <div class="si-desc">{{ item.description }}</div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header">听写技巧</div>
          <div class="pc-body">
            <button class="listen-entry" type="button" @click="router.push('/wfd/listen')">
              <span>
                <strong>磨耳朵模式</strong>
                <small>只听音频不拼写，提升语感与抓词能力</small>
              </span>
              <em>{{ questions.length || 0 }} 音频</em>
            </button>
            <div v-for="tip in writingTips" :key="tip" class="tip-item">
              <div class="tip-dot"></div>
              <span class="tip-text">{{ tip }}</span>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header">高频错误点</div>
          <div class="pc-body">
            <div class="misread-head">
              <div class="mh-count">{{ mistakeItems.length }}</div>
              <div class="mh-sub">{{ mistakeItems.length ? "基于最近 WFD" : "完成练习后生成" }}</div>
            </div>

            <div v-if="mistakeItems.length" class="misread-list">
              <button
                v-for="item in mistakeItems"
                :key="item.label"
                class="misread-item"
                type="button"
                @click="practiceQuestion(item.question)"
              >
                <div class="mi-main">
                  <span class="mi-word">{{ item.label }}</span>
                  <span class="mi-meta">{{ item.countText }}</span>
                </div>
                <span class="mi-action">复练</span>
              </button>
            </div>
            <div v-else class="misread-empty">暂无明显错误点，完成几次 WFD 后自动生成。</div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

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

const questions = ref([]);
const practiceLogs = ref([]);
const recommendationBatch = ref(0);
const RECENT_HISTORY_DISPLAY_LIMIT = 10;
const TODAY_RECOMMENDATION_LIMIT = 10;

const writingTips = [
  "听到什么写什么，不要把原句改写成自己的表达",
  "每个正确且拼写正确的词都有分，小词也要补全",
  "不确定的词先按发音落字，再检查拼写和词形",
  "提交前重点扫漏词、多词和明显拼写错误",
  "复练时盯自己的高频错词，而不是只背整句"
];

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  await Promise.allSettled([loadQuestions(), loadPracticeLogs()]);
});

async function loadQuestions() {
  questions.value = await fetchQuestions("WFD");
}

async function loadPracticeLogs() {
  const userId = authStore.user?.id || authStore.session?.user?.id;
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, question_id, transcript, score_json, feedback, created_at")
      .eq("user_id", userId)
      .eq("task_type", "WFD")
      .order("created_at", { ascending: false })
      .limit(80);

    if (!error && Array.isArray(data)) {
      practiceLogs.value = data;
    }
  } catch {
    practiceLogs.value = [];
  }
}

const membership = computed(() => {
  if (!authStore.loaded) return { kind: "loading", label: "同步中" };
  if (authStore.isPremium) return { kind: "vip", label: "VIP · 无限练习" };
  if (authStore.isInTrial) return { kind: "trial", label: `试用 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天` };
  const label = (authStore.statusText || "VIP · 无限练习").replace(/^✅\s*/, "");
  return { kind: label.includes("VIP") ? "vip" : "locked", label };
});

const questionMap = computed(() => {
  return new Map(questions.value.map((item) => [`${item.id}`, item]));
});

const normalizedLogs = computed(() => {
  return practiceLogs.value.map((log) => {
    const question = questionMap.value.get(`${log.question_id || ""}`) || null;
    const scoreJson = parseScoreJson(log.score_json);
    const scorePercent = clampScore(scoreJson.score ?? scoreJson.percent ?? 0);
    const correct = Number(scoreJson.correct ?? 0);
    const total = Number(scoreJson.total ?? 0);

    return {
      ...log,
      question,
      scorePercent,
      correct: Number.isFinite(correct) ? correct : 0,
      total: Number.isFinite(total) ? total : 0,
      scoreJson,
      correctAnswer: normalizeText(scoreJson.correctAnswer || scoreJson.correct_answer) || getQuestionAnswer(question),
      transcript: `${log.transcript || ""}`,
      createdAt: parseDate(log.created_at)
    };
  });
});

const wordErrorStats = computed(() => {
  const stats = {
    expected: 0,
    correct: 0,
    missing: 0,
    extra: 0,
    changed: 0
  };

  normalizedLogs.value.forEach((log) => {
    const expectedText = log.correctAnswer || getQuestionAnswer(log.question);
    if (!expectedText || !log.transcript) return;
    const expected = tokenizeWfdWords(expectedText);
    const actual = tokenizeWfdWords(log.transcript);
    if (!expected.length) return;

    stats.expected += expected.length;
    alignWfdWords(expected, actual).forEach((operation) => {
      if (operation.type === "correct") stats.correct += 1;
      else if (operation.type === "missing") stats.missing += 1;
      else if (operation.type === "extra") stats.extra += 1;
      else if (operation.type === "replace") stats.changed += 1;
    });
  });

  return stats;
});

const recentAveragePercent = computed(() => {
  return average(normalizedLogs.value.slice(0, 20).map((item) => item.scorePercent));
});

const recentAverage90 = computed(() => {
  if (!normalizedLogs.value.length) return "--";
  return formatDecimal(recentAveragePercent.value * 0.9, 1);
});

const currentWeekLogs = computed(() => {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return normalizedLogs.value.filter((item) => item.createdAt && now - item.createdAt.getTime() <= weekMs);
});

const previousWeekLogs = computed(() => {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return normalizedLogs.value.filter((item) => {
    if (!item.createdAt) return false;
    const age = now - item.createdAt.getTime();
    return age > weekMs && age <= weekMs * 2;
  });
});

const weeklyDelta = computed(() => {
  const current = average(currentWeekLogs.value.map((item) => item.scorePercent));
  const previous = average(previousWeekLogs.value.map((item) => item.scorePercent));
  if (!current && !previous) return 0;
  return (current - previous) * 0.9;
});

const summaryTiles = computed(() => [
  { value: recentAverage90.value, unit: normalizedLogs.value.length ? "/90" : "", label: "近期均分" },
  { value: formatInteger(currentWeekLogs.value.length || 0), unit: "", label: "本周练习" },
  {
    value: `${weeklyDelta.value >= 0 ? "↑" : "↓"} ${formatDecimal(Math.abs(weeklyDelta.value), 1)}`,
    unit: "",
    label: "较上周",
    className: weeklyDelta.value > 0 ? "sg-val--up" : weeklyDelta.value < 0 ? "sg-val--down" : ""
  },
  { value: `${Math.round(recentAveragePercent.value || 0)}%`, unit: "", label: "连续正确率" }
]);

const spellingMetric = computed(() => {
  if (wordErrorStats.value.expected > 0) {
    return Math.round((wordErrorStats.value.correct / wordErrorStats.value.expected) * 30);
  }
  const totals = normalizedLogs.value.filter((item) => item.total > 0);
  if (!totals.length) return 0;
  const correct = totals.reduce((sum, item) => sum + item.correct, 0);
  const total = totals.reduce((sum, item) => sum + item.total, 0);
  if (!total) return 0;
  return Math.round((correct / total) * 30);
});

const metricBars = computed(() => {
  const expected = wordErrorStats.value.expected;
  const spelling = spellingMetric.value || Math.round((recentAveragePercent.value || 0) * 0.3);
  const completeness = expected
    ? Math.round(((expected - wordErrorStats.value.missing) / expected) * 30)
    : Math.max(0, Math.min(30, Math.round(spelling * 0.9)));
  const cleanInput = expected
    ? Math.round(((expected - Math.min(expected, wordErrorStats.value.extra + wordErrorStats.value.changed)) / expected) * 30)
    : Math.max(0, Math.min(30, Math.round(spelling * 0.85)));
  return [
    { label: "逐词正确", value: spelling, percent: toMetricPercent(spelling), color: "#5A9E6A" },
    { label: "漏词控制", value: Math.max(0, Math.min(30, completeness)), percent: toMetricPercent(completeness), color: "#C07840" },
    { label: "错词控制", value: Math.max(0, Math.min(30, cleanInput)), percent: toMetricPercent(cleanInput), color: "#7C5C3E" }
  ];
});

const coachAdvice = computed(() => {
  if (!normalizedLogs.value.length) {
    return "先完成一组随机听写，系统会根据你的练习记录更新复练建议。";
  }

  if ((metricBars.value[0]?.value || 0) < 18) {
    return "拼写准确率还有提升空间，建议先用简单题稳定词形和大小写。";
  }

  if ((metricBars.value[1]?.value || 0) < 18) {
    return "最近漏词偏多，建议复听句尾、小词和名词短语。";
  }

  return "近期表现稳定，可以加入中等和困难题，训练长句记忆与语法一致性。";
});

const difficultyBuckets = computed(() => {
  const buckets = {
    easy: [],
    medium: [],
    hard: []
  };

  questions.value.forEach((question) => {
    buckets[resolveDifficulty(question)].push(question);
  });

  return buckets;
});

const difficultyCards = computed(() => [
  buildDifficultyCard("easy", "⭐", "简单", "词数 30-50，句子结构简单清晰", {
    color: "#5A9E6A",
    bgBtn: "#DFF0E4",
    border: "#A8D4B4"
  }),
  buildDifficultyCard("medium", "⭐⭐", "中等", "词数 51-75，含从句和较复杂结构", {
    color: "#C07840",
    bgBtn: "#F2E4D0",
    border: "#D4B090"
  }),
  buildDifficultyCard("hard", "⭐⭐⭐", "困难", "词数 76+，长句多，逻辑复杂", {
    color: "#B84040",
    bgBtn: "#F5E0DC",
    border: "#D4A8A0"
  })
]);

const practiceModes = computed(() => [
  {
    icon: "🔀",
    title: "随机练习",
    description: "系统智能推荐题目，全面提升听写能力",
    meta: `共 ${questions.value.length || 0} 题`,
    entryClass: "entry-random",
    action: startRandomPractice
  },
  {
    icon: "📚",
    title: "题库练习",
    description: "从题库自由选择题目进行练习",
    meta: `共 ${questions.value.length || 0} 题`,
    entryClass: "entry-select",
    action: () => router.push("/wfd/list")
  },
  {
    icon: "🎵",
    title: "磨耳朵模式",
    description: "只听音频不拼写，提升语感与抓词能力",
    meta: `${questions.value.length || 0} 音频`,
    entryClass: "entry-select",
    action: () => router.push("/wfd/listen")
  }
]);

const primaryPracticeModes = computed(() => practiceModes.value.slice(0, 2));

const rankedQuestions = computed(() => {
  const practicedIds = new Set(normalizedLogs.value.map((item) => `${item.question_id || ""}`));
  const lowScoreById = new Map();

  normalizedLogs.value.forEach((item) => {
    const id = `${item.question_id || ""}`;
    if (!id) return;
    const existing = lowScoreById.get(id);
    if (!existing || item.scorePercent < existing) {
      lowScoreById.set(id, item.scorePercent);
    }
  });

  return [...questions.value].sort((a, b) => {
    const aId = `${a.id}`;
    const bId = `${b.id}`;
    const aPracticed = practicedIds.has(aId) ? 1 : 0;
    const bPracticed = practicedIds.has(bId) ? 1 : 0;
    if (aPracticed !== bPracticed) return aPracticed - bPracticed;
    const aScore = lowScoreById.get(aId) ?? 101;
    const bScore = lowScoreById.get(bId) ?? 101;
    if (aScore !== bScore) return aScore - bScore;
    return getWordCount(a) - getWordCount(b);
  });
});

const recommendedItems = computed(() => {
  const list = rankedQuestions.value;
  if (!list.length) return [];

  const pageSize = TODAY_RECOMMENDATION_LIMIT;
  const start = (recommendationBatch.value * pageSize) % list.length;
  const page = [...list.slice(start, start + pageSize), ...list.slice(0, Math.max(0, start + pageSize - list.length))];

  return page.slice(0, pageSize).map((question) => {
    const difficulty = resolveDifficulty(question);
    return {
      id: `${question.id}`,
      title: question.content || question.audio_script || "WFD 听写题目",
      words: getWordCount(question),
      seconds: estimateSeconds(question),
      scene: resolveScene(question),
      difficultyLabel: difficultyLabel(difficulty),
      difficultyClass: difficulty,
      question
    };
  });
});

const recentRecords = computed(() => {
  return normalizedLogs.value.slice(0, RECENT_HISTORY_DISPLAY_LIMIT).map((log, index) => {
    const question = log.question || questionMap.value.get(`${log.question_id || ""}`) || null;
    return {
      id: `${log.id || log.question_id || index}`,
      question,
      code: `${log.question_id || question?.id || "WFD"}`,
      title: truncate(question?.content || question?.audio_script || "WFD 听写练习", 46),
      time: formatPracticeDate(log.createdAt),
      words: getWordCount(question),
      seconds: estimateSeconds(question),
      scoreValue: log.scorePercent / 10,
      score: formatDecimal(log.scorePercent / 10, 1)
    };
  });
});

const scoringDimensions = computed(() => {
  return [
    {
      title: "逐词得分",
      description: "WFD 按词给分：每个听对、写对并拼写正确的词计 1 分。",
      scoreLabel: "1分/词"
    },
    {
      title: "拼写准确",
      description: "拼错、词形写错或把词听成别的词，该词通常不得分。",
      scoreLabel: "0分/错词"
    },
    {
      title: "完整复现",
      description: "漏写、多写或顺序明显错乱会拉低逐词匹配，冠词、介词、复数 s 都要保留。",
      scoreLabel: "看词数"
    },
    {
      title: "影响分项",
      description: "WFD 同时贡献 Listening 和 Writing，没有单独的流利度、语法维度。",
      scoreLabel: "L + W"
    }
  ];
});

const realMistakeItems = computed(() => collectMistakes());

const mistakeItems = computed(() => {
  return realMistakeItems.value;
});

function buildDifficultyCard(id, icon, title, description, tone) {
  const pool = difficultyBuckets.value[id] || [];
  const ids = new Set(pool.map((item) => `${item.id}`));
  const relatedLogs = normalizedLogs.value.filter((log) => ids.has(`${log.question_id || ""}`));
  const avg = average(relatedLogs.map((item) => item.scorePercent));

  return {
    id,
    icon,
    title,
    description,
    count: pool.length,
    average: relatedLogs.length ? formatDecimal(avg * 0.9, 1) : "--",
    ...tone
  };
}

function startRandomPractice() {
  practiceQuestion(pickRandomQuestion(questions.value));
}

function practiceDifficulty(difficulty) {
  const pool = difficultyBuckets.value[difficulty] || [];
  practiceQuestion(pickRandomQuestion(pool.length ? pool : questions.value));
}

function practiceQuestion(question) {
  if (question) {
    practiceStore.setSelectedQuestion(question);
  }
  router.push("/wfd/practice");
}

function changeRecommendationBatch() {
  recommendationBatch.value += 1;
}

function openTutor(prompt) {
  router.push({ path: "/agent", query: { q: prompt } });
}

function goHome() {
  router.push("/home");
}

function pickRandomQuestion(pool) {
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function collectMistakes() {
  const counts = new Map();

  normalizedLogs.value.slice(0, 80).forEach((log) => {
    const question = log.question;
    const expectedText = log.correctAnswer || getQuestionAnswer(question);
    if (!expectedText || !log.transcript) return;

    const expected = tokenizeWfdWords(expectedText);
    const actual = tokenizeWfdWords(log.transcript);
    if (!expected.length) return;

    alignWfdWords(expected, actual).forEach((mistake) => {
      if (mistake.type === "correct") return;
      const display = buildMistakeDisplay(mistake);
      if (!display) return;
      const key = `${display.type}:${display.label}:${display.variant || ""}`;
      const existing = counts.get(key) || {
        ...display,
        count: 0,
        question
      };
      existing.count += 1;
      counts.set(key, existing);
    });
  });

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((item) => ({
      label: item.label,
      countText: formatMistakeCountText(item),
      question: item.question
    }));
}

function buildMistakeDisplay(mistake) {
  const expected = normalizeText(mistake.expected?.display);
  const actual = normalizeText(mistake.actual?.display);

  if (mistake.type === "missing" && expected) {
    return {
      type: "missing",
      label: expected,
      variant: ""
    };
  }

  if (mistake.type === "extra" && actual) {
    return {
      type: "extra",
      label: actual,
      variant: ""
    };
  }

  if (mistake.type === "replace" && expected) {
    return {
      type: isLikelySpellingMiss(expected, actual) ? "spelling" : "replace",
      label: expected,
      variant: actual
    };
  }

  return null;
}

function formatMistakeCountText(item) {
  const countText = `${item.count} 次`;
  if (item.type === "missing") return `漏写 ${countText}`;
  if (item.type === "extra") return `多写 ${countText}`;
  if (item.type === "spelling") return item.variant ? `常写成 ${item.variant} · ${countText}` : `拼写错 ${countText}`;
  if (item.variant) return `听成 ${item.variant} · ${countText}`;
  return `写错 ${countText}`;
}

function alignWfdWords(expected, actual) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) dp[i][0] = i;
  for (let j = 1; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const replaceCost = expected[i - 1].normalized === actual[j - 1].normalized ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + replaceCost,
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1
      );
    }
  }

  const operations = [];
  let i = expected.length;
  let j = actual.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const replaceCost = expected[i - 1].normalized === actual[j - 1].normalized ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + replaceCost) {
        operations.push({
          type: replaceCost === 0 ? "correct" : "replace",
          expected: expected[i - 1],
          actual: actual[j - 1]
        });
        i -= 1;
        j -= 1;
        continue;
      }
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      operations.push({
        type: "missing",
        expected: expected[i - 1],
        actual: null
      });
      i -= 1;
      continue;
    }

    operations.push({
      type: "extra",
      expected: null,
      actual: actual[j - 1]
    });
    j -= 1;
  }

  return operations.reverse();
}

function tokenizeWfdWords(text) {
  return `${text || ""}`
    .split(/\s+/)
    .map((word) => {
      const display = normalizeText(word.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, ""));
      const normalized = normalizeWfdWord(display);
      return normalized ? { display, normalized } : null;
    })
    .filter(Boolean);
}

function normalizeWfdWord(word) {
  return `${word || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "")
    .trim();
}

function isLikelySpellingMiss(expected, actual) {
  const expectedWord = normalizeWfdWord(expected);
  const actualWord = normalizeWfdWord(actual);
  if (!expectedWord || !actualWord) return false;
  if (expectedWord[0] !== actualWord[0]) return false;
  return levenshteinDistance(expectedWord, actualWord) <= Math.max(1, Math.ceil(expectedWord.length * 0.34));
}

function levenshteinDistance(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 1; i < rows; i += 1) dp[i][0] = i;
  for (let j = 1; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
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

function resolveDifficulty(question) {
  const numeric = Number(question?.difficulty ?? question?.level ?? 0);
  if (numeric === 1) return "easy";
  if (numeric === 2) return "medium";
  if (numeric === 3) return "hard";

  const raw = `${question?.difficulty || question?.level || ""}`.trim().toLowerCase();
  if (/easy|simple|beginner|简单/.test(raw)) return "easy";
  if (/hard|difficult|advanced|困难/.test(raw)) return "hard";
  if (/medium|normal|中等/.test(raw)) return "medium";

  const words = getWordCount(question);
  if (words <= 50) return "easy";
  if (words >= 76) return "hard";
  return "medium";
}

function difficultyLabel(value) {
  if (value === "easy") return "简单";
  if (value === "hard") return "困难";
  return "中等";
}

function resolveScene(question) {
  const candidates = [
    question?.topic,
    question?.category,
    question?.source_number_label,
    question?.source_ref_id,
    question?.primary_topic
  ];
  const value = candidates.find((item) => `${item || ""}`.trim());
  return value ? `${value}`.trim() : "学术场景";
}

function getWordCount(question) {
  const explicit = Number(question?.word_count ?? question?.wordCount ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const content = getQuestionAnswer(question);
  if (!content) return 0;
  return content.split(/\s+/).filter(Boolean).length;
}

function getQuestionAnswer(question) {
  return normalizeText(question?.content || question?.audio_script);
}

function estimateSeconds(question) {
  const explicit = Number(question?.duration ?? question?.duration_sec ?? question?.durationSec ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return Math.max(12, Math.round(getWordCount(question) / 2.7));
}

function truncate(value, maxLength) {
  const text = `${value || ""}`.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatPracticeDate(date) {
  if (!date) return "--";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
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

function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function toMetricPercent(value) {
  return Math.max(0, Math.min(100, Math.round((Number(value) || 0) / 30 * 100)));
}

function formatDecimal(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.0";
  return number.toFixed(digits);
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return `${Math.round(number)}`;
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<style scoped>
/* Visual rules: docs/ui-guidelines.md. Tokens (--kk-*) live in src/assets/styles/main.css. */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.shell{display:flex;flex-direction:column;min-height:100vh;background:var(--kk-bg);color:var(--kk-ink);font-family:var(--kk-font);font-size:15px;line-height:1.55;}
button{font:inherit;cursor:pointer;}

/* Top bar */
.topbar{position:relative;min-height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 6px 4px;background:var(--kk-surface);border-bottom:1px solid var(--kk-line);}
.tb-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px;border:0;background:transparent;color:var(--kk-ink);font-size:15px;font-weight:500;}
.tb-back:hover{color:var(--kk-action-text);}
.tb-arr{font-size:20px;line-height:1;}
.tb-title{font-size:16px;font-weight:600;white-space:nowrap;}
.tb-right{display:flex;align-items:center;gap:8px;}
.vip-pill{display:none;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:13px;font-weight:600;white-space:nowrap;}
.vip-pill--vip{background:var(--kk-notice-bg);color:var(--kk-notice);}
.vip-dot{display:none;}
.exit-btn{min-height:36px;padding:0 14px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink-2);font-size:13px;font-weight:600;}

/* Layout: main content first on phones, three columns on desktop */
.page-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;width:100%;max-width:1360px;margin:0 auto;padding:16px 16px 40px;}
.main-area{order:1;display:flex;flex-direction:column;gap:16px;min-width:0;}
.left-panel{order:2;}
.right-panel{order:3;}
.left-panel,.right-panel{display:flex;flex-direction:column;gap:16px;min-width:0;}

/* Cards */
.panel-card,.today-rec,.diff-card{min-width:0;background:var(--kk-surface);border:1px solid var(--kk-line);border-radius:20px;box-shadow:var(--kk-shadow);}
.pc-header{padding:18px 20px 0;font-size:17px;font-weight:600;}
.pc-body{display:flex;flex-direction:column;gap:12px;padding:14px 20px 20px;}
.pc-body--tight{padding-top:6px;}

.stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
.sg-item{padding:12px;border-radius:16px;background:var(--kk-surface-2);}
.sg-val{font-family:var(--kk-font-num);font-size:24px;font-weight:800;line-height:1.15;white-space:nowrap;font-variant-numeric:tabular-nums;}
.sg-val--up{color:var(--kk-success);}
.sg-val--down{color:var(--kk-notice);}
.sg-unit{font-family:var(--kk-font);font-size:13px;font-weight:500;color:var(--kk-ink-3);}
.sg-lbl{margin-top:2px;font-size:13px;color:var(--kk-ink-2);}
.dim-bars{display:flex;flex-direction:column;gap:10px;}
.dim-row{display:grid;grid-template-columns:64px minmax(0,1fr) 44px;align-items:center;gap:10px;}
.dim-name{font-size:13px;color:var(--kk-ink-2);}
.dim-bg{height:6px;border-radius:99px;background:var(--kk-surface-2);overflow:hidden;}
.dim-fill{height:100%;border-radius:99px;background:var(--kk-ink);transition:width .4s;}
.dim-val{font-family:var(--kk-font-num);font-size:13px;color:var(--kk-ink-3);text-align:right;}

.ai-tip-banner{padding:12px 14px;border-radius:12px;background:var(--kk-surface-2);font-size:14px;line-height:1.6;}
.ai-actions-list{display:flex;flex-direction:column;gap:8px;}
.aal-item{min-height:44px;padding:0 16px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font-size:14px;font-weight:600;text-align:center;}
.aal-item:hover{background:var(--kk-surface-2);}

.history-list{display:flex;flex-direction:column;}
.hist-item{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;padding:8px 0;border:0;border-top:1px solid var(--kk-line);background:transparent;text-align:left;}
.hist-item:first-child{border-top:0;}
.hi-left{display:flex;align-items:center;gap:10px;min-width:0;}
.hi-left > div{min-width:0;}
.hi-code{flex-shrink:0;padding:4px 8px;border-radius:8px;background:var(--kk-surface-2);font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.hi-title{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}
.hi-date{font-size:12px;color:var(--kk-ink-3);}
.hi-score{flex-shrink:0;font-family:var(--kk-font-num);font-size:17px;font-weight:800;}
.hi-score--good{color:var(--kk-success);}
.empty-state,.misread-empty,.tr-empty{padding:16px;border:1px dashed var(--kk-line);border-radius:12px;font-size:14px;color:var(--kk-ink-3);text-align:center;line-height:1.6;}
.tr-empty{margin:0 20px 20px;}

/* Hero: the one dark card on the page */
.hero-banner{padding:22px 20px;border-radius:20px;background:var(--kk-ink);color:var(--kk-ink-inverse);}
.hb-text{min-width:0;}
.hb-kicker{font-size:12px;font-weight:600;letter-spacing:.08em;color:rgba(251,247,241,.72);overflow-wrap:anywhere;}
.hb-title{margin:4px 0;font-size:24px;font-weight:700;line-height:1.3;}
.hb-sub{font-size:14px;color:rgba(251,247,241,.78);}
.hb-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.hb-tag{padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.1);font-size:13px;color:rgba(251,247,241,.88);}

/* Practice entries: random practice is the page's main action */
.entry-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;}
.entry-card{display:flex;align-items:center;gap:12px;min-height:76px;padding:16px 20px;border:1px solid var(--kk-line);border-radius:20px;background:var(--kk-surface);box-shadow:var(--kk-shadow);text-align:left;color:var(--kk-ink);transition:background .15s;}
.entry-card:hover{background:var(--kk-surface-2);}
.entry-random{border-color:var(--kk-action);background:var(--kk-action);color:var(--kk-on-action);}
.entry-random:hover{background:var(--kk-action-hover);}
.ec-title{font-size:17px;font-weight:700;}
.ec-sub{font-size:13px;color:var(--kk-ink-3);}
.entry-random .ec-sub,.entry-random .ec-count{color:rgba(255,255,255,.88);}
.ec-count{margin-left:auto;flex-shrink:0;font-size:13px;font-weight:600;color:var(--kk-ink-2);}

.diff-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;}
.diff-card{display:flex;flex-direction:column;gap:6px;padding:18px 20px;}
.dc-head{display:flex;align-items:baseline;gap:8px;}
.dc-name{flex:1;font-size:17px;font-weight:700;}
.dc-count{font-size:13px;color:var(--kk-ink-3);}
.dc-desc{font-size:14px;color:var(--kk-ink-2);line-height:1.6;}
.dc-avg{font-size:13px;color:var(--kk-ink-3);}
.dc-avg b{font-size:15px;color:var(--kk-ink);}
.dc-btn{margin-top:6px;min-height:44px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font-size:14px;font-weight:600;}
.dc-btn:hover{background:var(--kk-surface-2);}

.today-rec{display:flex;flex-direction:column;}
.tr-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px;padding:18px 20px 8px;}
.tr-title{font-size:17px;font-weight:600;}
.tr-sub{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--kk-ink-3);}
.tr-refresh{min-height:36px;padding:0 4px;border:0;background:transparent;color:var(--kk-action-text);font-size:14px;font-weight:600;}
.tr-list{display:flex;flex-direction:column;padding:0 20px 12px;}
.tr-item{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;padding:10px 0;border:0;border-top:1px solid var(--kk-line);background:transparent;text-align:left;color:var(--kk-ink);}
.tr-item:first-child{border-top:0;}
.tr-item:hover .tri-text{color:var(--kk-action-text);}
.tri-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.tri-code{flex-shrink:0;padding:4px 8px;border-radius:8px;background:var(--kk-surface-2);font-family:var(--kk-font-num);font-size:12px;font-weight:700;}
.tri-left > div{min-width:0;}
.tri-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--kk-font-text);font-size:15px;}
.tri-meta{font-size:12px;color:var(--kk-ink-3);}
.tri-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.tri-diff{padding:2px 10px;border-radius:999px;background:var(--kk-surface-2);color:var(--kk-ink-2);font-size:12px;font-weight:600;}
.tri-go{display:none;font-size:13px;font-weight:600;color:var(--kk-action-text);}

.score-item{padding-top:12px;border-top:1px solid var(--kk-line);}
.score-item:first-child{padding-top:0;border-top:0;}
.si-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;}
.si-name{font-size:15px;font-weight:600;}
.si-weight{padding:2px 10px;border-radius:999px;background:var(--kk-surface-2);font-size:12px;color:var(--kk-ink-2);white-space:nowrap;}
.si-desc{font-size:13px;color:var(--kk-ink-3);line-height:1.6;}
.listen-entry{display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 14px;border:0;border-radius:16px;background:var(--kk-surface-2);text-align:left;color:var(--kk-ink);}
.listen-entry:hover{background:var(--kk-line);}
.listen-entry span{display:flex;flex-direction:column;min-width:0;}
.listen-entry strong{font-size:15px;}
.listen-entry small{font-size:13px;color:var(--kk-ink-3);line-height:1.5;}
.listen-entry em{margin-left:auto;flex-shrink:0;font-style:normal;font-size:13px;font-weight:600;color:var(--kk-ink-2);}
.tip-item{display:flex;align-items:flex-start;gap:10px;}
.tip-dot{flex-shrink:0;width:5px;height:5px;margin-top:9px;border-radius:50%;background:var(--kk-ink-2);}
.tip-text{font-size:14px;color:var(--kk-ink-2);line-height:1.6;}
.misread-head{display:flex;align-items:baseline;gap:8px;}
.mh-count{font-family:var(--kk-font-num);font-size:32px;font-weight:800;line-height:1;}
.mh-sub{font-size:13px;color:var(--kk-ink-3);}
.misread-list{display:flex;flex-direction:column;}
.misread-item{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;padding:8px 0;border:0;border-top:1px solid var(--kk-line);background:transparent;text-align:left;color:var(--kk-ink);}
.misread-item:first-child{border-top:0;}
.mi-main{display:flex;flex-direction:column;min-width:0;}
.mi-word{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--kk-font-text);font-size:15px;font-weight:600;}
.mi-meta{font-size:12px;color:var(--kk-ink-3);}
.mi-action{flex-shrink:0;font-size:14px;font-weight:600;color:var(--kk-action-text);}

@media (min-width:600px){
  .entry-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
  .diff-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
  .tri-go{display:inline;}
}

/* Tablet: main content full width, the two side panels side by side below it */
@media (min-width:768px){
  .topbar{min-height:64px;padding:8px 24px 8px 16px;}
  .tb-title{position:absolute;left:50%;transform:translateX(-50%);}
  .vip-pill{display:inline-flex;}
  .page-body{grid-template-columns:repeat(2,minmax(0,1fr));padding:24px 24px 48px;}
  .main-area{grid-column:1 / -1;}
  .hero-banner{padding:26px 28px;}
  .hb-title{font-size:28px;}
}

/* Desktop: left panel, main, right panel */
@media (min-width:1200px){
  .page-body{grid-template-columns:280px minmax(0,1fr) 280px;gap:24px;padding:28px 40px 56px;align-items:start;}
  .left-panel{order:1;}
  .main-area{order:2;grid-column:auto;}
  .right-panel{order:3;}
}
</style>
