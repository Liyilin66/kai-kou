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
          <div class="pc-header"><span class="pc-star">◇</span> 我的 WFD 数据</div>
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
                  <div class="dim-fill" :style="{ width: `${bar.percent}%`, background: bar.color }"></div>
                </div>
                <span class="dim-val">{{ bar.value }}/30</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">✦</span> 训练建议</div>
          <div class="pc-body">
            <div class="ai-tip-banner">
              <span class="ai-tip-ico">💡</span>
              <span>{{ coachAdvice }}</span>
            </div>
            <div class="ai-actions-list">
              <button class="aal-item" type="button" @click="openTutor('分析我的 WFD 弱项')">📊 分析我的 WFD 弱项</button>
              <button class="aal-item" type="button" @click="openTutor('生成本周 WFD 计划')">📋 生成本周 WFD 计划</button>
            </div>
          </div>
        </section>

        <section class="panel-card">
          <div class="pc-header"><span class="pc-star">◇</span> 最近练习记录</div>
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
          <div class="hb-deco" aria-hidden="true">
            <div class="hb-circle hb-c1"></div>
            <div class="hb-circle hb-c2"></div>
            <div class="hb-icon">🎧</div>
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
            <div class="ec-icon">{{ mode.icon }}</div>
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
              <span class="dc-icon">{{ difficulty.icon }}</span>
              <span class="dc-name" :style="{ color: difficulty.color }">{{ difficulty.title }}</span>
              <span class="dc-count">{{ difficulty.count }} 题</span>
            </div>
            <div class="dc-desc">{{ difficulty.description }}</div>
            <div class="dc-avg">
              近期均分 <b :style="{ color: difficulty.color }">{{ difficulty.average }}</b>
            </div>
            <button
              class="dc-btn"
              type="button"
              :style="{ background: difficulty.bgBtn, color: difficulty.color, borderColor: difficulty.border }"
              @click="practiceDifficulty(difficulty.id)"
            >
              练这个难度
            </button>
          </article>
        </section>

        <section class="today-rec">
          <div class="tr-header">
            <span class="tr-title">✦ 今日推荐</span>
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
          <div class="pc-header"><span class="pc-star">◇</span> 评分维度</div>
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
          <div class="pc-header"><span class="pc-star">✦</span> 听写技巧</div>
          <div class="pc-body">
            <button class="listen-entry" type="button" @click="router.push('/wfd/listen')">
              <span class="listen-icon">🎵</span>
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
          <div class="pc-header"><span class="pc-star">◎</span> 高频错误点</div>
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
.vip-pill--loading{background:#F2EBE0;border-color:#D4C8B4;color:#7C5C3E;}
.entry-cards--wfd{grid-template-columns:1fr 1fr;}
.entry-cards--wfd .entry-card{min-height:74px;}
.listen-entry{display:flex;align-items:center;gap:9px;border:1px solid var(--bdr);border-radius:8px;background:var(--card2);padding:8px 9px;cursor:pointer;text-align:left;font-family:inherit;}
.listen-entry:hover{border-color:var(--bdr2);}
.listen-icon{font-size:22px;flex-shrink:0;}
.listen-entry span:last-of-type{min-width:0;display:flex;flex-direction:column;gap:2px;}
.listen-entry strong{font-size:12px;color:var(--c0);line-height:1.2;}
.listen-entry small{font-size:9.5px;color:var(--mute);line-height:1.45;}
.listen-entry em{margin-left:auto;font-size:9.5px;color:var(--c2);font-style:normal;font-weight:700;white-space:nowrap;}
.hi-title{max-width:108px;}
.tr-refresh{border:0;background:transparent;color:var(--c2);cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;margin-left:14px;padding:0;}
.tr-empty{margin:12px 16px;border:1px dashed var(--bdr);border-radius:8px;background:var(--card2);padding:18px 12px;color:var(--mute);font-size:11px;text-align:center;}
@media (max-width:1280px){.entry-cards--wfd{gap:10px}.entry-cards--wfd .entry-card{padding:14px 16px;gap:10px}.entry-cards--wfd .ec-sub{font-size:11.5px}}
</style>
