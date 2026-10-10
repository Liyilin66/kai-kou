<script setup>
import RADiagnosisResult from "@/components/ra/RADiagnosisResult.vue";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchRAHistoryByQuestion } from "@/lib/ra-history";
import { legacySpeakingDisplayOverall, PRONUNCIATION_NOT_ASSESSED_LABEL, PRONUNCIATION_NOT_ASSESSED_REASON } from "@/lib/ra-diagnosis-score.js";
import { fetchQuestions, getRandomQuestion } from "@/lib/questions";
import { supabase } from "@/lib/supabase";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const practiceStore = usePracticeStore();

const steps = ["准备阅读", "开始录音", "提交评测", "查看结果"];
const questionHistory = ref([]);
const questionBank = ref([]);
const todayLogs = ref([]);
const yesterdayLogs = ref([]);
const recordingDurationSec = ref(0);
const historyLoading = ref(false);
const statsLoading = ref(false);
const loadNotice = ref("");

const dimensionConfig = [
  {
    key: "pronunciation",
    label: "Pronunciation 发音",
    shortLabel: "发音",
    en: "Pronunciation",
    color: "var(--kk-ink-2)",
    desc: "发音清晰度与准确性",
    high: "发音整体清楚，重音和收尾比较稳定。",
    mid: "发音基本可懂，个别元音、辅音或词尾需要再收准。",
    low: "发音识别稳定性偏弱，建议先慢读并强化单词重音。"
  },
  {
    key: "fluency",
    label: "Fluency 流利度",
    shortLabel: "流利度",
    en: "Fluency",
    color: "var(--kk-ink-2)",
    desc: "语速节奏与停顿自然度",
    high: "节奏比较自然，停顿没有明显打断句意。",
    mid: "整体能连贯读完，但长句或标点处仍有节奏波动。",
    low: "流利度是本次主要失分点，建议按意群提前规划停顿。"
  },
  {
    key: "content",
    label: "Content 内容",
    shortLabel: "内容",
    en: "Content",
    color: "var(--kk-ink-2)",
    desc: "关键词覆盖与句意完整",
    high: "原文关键词覆盖较完整，内容稳定。",
    mid: "多数关键词已读到，仍有少量漏读或替换。",
    low: "识别文本与原文差距较大，建议先确保完整读完原句。"
  }
];

const scoreResult = computed(() => practiceStore.result || null);
const showDiagnosis = computed(() => import.meta.env.VITE_RA_DIAGNOSIS === "on" && scoreResult.value?.kind === "ra_diagnosis");
const resultSource = computed(() => {
  const errorCode = normalizeText(scoreResult.value?.meta?.scoreErrorCode);
  if (errorCode) {
    return {
      key: "fallback",
      label: "客户端兜底估分",
      detail: `评分服务返回 ${errorCode}，本页已按兜底结果展示。`
    };
  }

  const status = Number(scoreResult.value?.meta?.status || 0);
  if (status >= 200 && status < 300) {
    return {
      key: "backend",
      label: "后端 AI 评分",
      detail: "总分与三项分来自现有 /api/score 结果。"
    };
  }

  return {
    key: "runtime",
    label: "本次练习结果",
    detail: "来自当前练习流程内存状态，历史写入会继续异步同步。"
  };
});
const currentQuestion = computed(() => practiceStore.currentQuestion || practiceStore.selectedQuestion || null);
const questionId = computed(() => normalizeText(currentQuestion.value?.id || "unknown"));
const questionContent = computed(() =>
  normalizeText(currentQuestion.value?.content || practiceStore.questionContent || "")
);
const transcript = computed(() => normalizeText(practiceStore.transcript || ""));
const wordCount = computed(() => getQuestionWordCount(currentQuestion.value, questionContent.value));
const estimatedDurationSec = computed(() => clamp(Math.round(wordCount.value / 2.6), 18, 45));
const questionIndex = computed(() => {
  const index = questionBank.value.findIndex((item) => normalizeText(item?.id) === questionId.value);
  return index >= 0 ? index + 1 : 1;
});
const difficultyLevel = computed(() => getDifficultyLevel(currentQuestion.value));
const difficultyLabel = computed(() => {
  if (difficultyLevel.value <= 1) return "简单";
  if (difficultyLevel.value >= 3) return "困难";
  return "中等";
});
const difficultyClass = computed(() => {
  if (difficultyLevel.value <= 1) return "easy";
  if (difficultyLevel.value >= 3) return "hard";
  return "medium";
});

// docs/ra-scoring-rules.md: the shown overall uses content and fluency only; pronunciation is not assessed.
const overallScore = computed(() => {
  const legacyOverall = legacySpeakingDisplayOverall(scoreResult.value);
  if (legacyOverall !== null) return legacyOverall;
  const explicit = normalizeScore(scoreResult.value?.overall, Number.NaN);
  if (Number.isFinite(explicit)) return explicit;
  return Math.round((rawDimensionScore("content") + rawDimensionScore("fluency")) / 2);
});

const dimensionItems = computed(() =>
  dimensionConfig.map((item) => {
    if (item.key === "pronunciation") {
      return { ...item, notAssessed: true, rawScore: null, score: PRONUNCIATION_NOT_ASSESSED_LABEL, max: 90, pct: 0, desc: PRONUNCIATION_NOT_ASSESSED_REASON, feedback: PRONUNCIATION_NOT_ASSESSED_REASON, tips: [] };
    }
    const rawScore = rawDimensionScore(item.key);
    return {
      ...item,
      rawScore,
      score: rawScore,
      max: 90,
      pct: Math.round((rawScore / 90) * 100),
      feedback: getDimensionFeedback(item, rawScore),
      tips: getDimensionTips(item.key, rawScore)
    };
  })
);

const weakestDimension = computed(() => {
  const assessed = dimensionItems.value.filter((item) => !item.notAssessed);
  return [...assessed].sort((left, right) => left.rawScore - right.rawScore)[0] || assessed[0];
});

const resultHeadline = computed(() => {
  if (overallScore.value >= 78) return "很棒的练习，继续保持稳定输出！";
  if (overallScore.value >= 65) return "不错的练习，继续提升流利度！";
  if (overallScore.value >= 50) return "已经完成一轮有效训练，下一题稳住节奏。";
  return "这次先打基础，下一轮从完整读完开始。";
});

const resultSubline = computed(() => {
  const weak = weakestDimension.value?.shortLabel || "流利度";
  if (overallScore.value >= 72) return `整体表现不错，${weak}还有继续提升空间。`;
  return `${weak}是本次重点，建议下一题放慢一点并按意群停顿。`;
});

const resultKicker = computed(() => {
  if (overallScore.value >= 78) return "GREAT WORK";
  if (overallScore.value >= 65) return "KEEP GOING";
  return "BUILDING UP";
});

const currentAttempt = computed(() => ({
  id: "current-result",
  questionId: questionId.value,
  questionContent: questionContent.value,
  transcript: transcript.value,
  createdAt: normalizeText(scoreResult.value?.reviewed_at || new Date().toISOString()),
  scores: {
    pronunciation: null,
    fluency: rawDimensionScore("fluency"),
    content: rawDimensionScore("content")
  },
  overall: overallScore.value,
  feedback: normalizeText(scoreResult.value?.feedback),
  source: resultSource.value.key,
  persisted: false
}));

const persistedHistoryRows = computed(() =>
  questionHistory.value.filter((item) => normalizeScore(item?.overall, 0) > 0)
);

const trendRows = computed(() =>
  persistedHistoryRows.value
    .slice(0, 4)
    .reverse()
    .map((item) => ({
      date: formatMonthDay(item.createdAt),
      score: normalizeScore(item.overall, 0)
    }))
);

const deltaFromPrevious = computed(() => {
  const previous = persistedHistoryRows.value[0];
  if (!previous) return null;
  return overallScore.value - normalizeScore(previous.overall, overallScore.value);
});

const isImproving = computed(() => {
  if (trendRows.value.length < 3) return false;
  return trendRows.value.every((item, index, rows) => index === 0 || item.score >= rows[index - 1].score);
});

const suggestions = computed(() => {
  const weak = weakestDimension.value;
  const items = [];
  if (weak?.key === "fluency") {
    items.push({ text: "流利度是本次扣分重点，下一轮先按逗号和从句切分节奏。", color: "var(--kk-notice)" });
    items.push({ text: "长词提前在脑中分节，宁愿略慢，也不要突然停顿。", color: "var(--kk-notice)" });
  } else if (weak?.key === "pronunciation") {
    items.push({ text: "发音清晰度还有提升空间，重点收好词尾辅音。", color: "var(--kk-notice)" });
    items.push({ text: "读前先扫一遍专有名词和长词，避免临场卡顿。", color: "var(--kk-notice)" });
  } else {
    items.push({ text: "内容覆盖偏弱，先确保每个关键词都完整读到。", color: "var(--kk-notice)" });
    items.push({ text: "遇到长句不要跳词，按意群慢一点读完。", color: "var(--kk-notice)" });
  }

  if (overallScore.value >= 65) {
    items.push({ text: "发音和内容已具备基础稳定性，继续保持每日短练。", color: "var(--kk-success)" });
  } else {
    items.push({ text: "先把完整度拉上来，再追求更快语速。", color: "var(--kk-success)" });
  }
  return items;
});

const transcriptWords = computed(() => buildTranscriptAlignment(questionContent.value, transcript.value));
const transcriptSourceLabel = computed(() =>
  transcript.value ? "本地算法：把识别转录和原文做近似对齐，不代表后端逐词评分。" : "本次没有识别转录，先展示原文，不标记对错。"
);

const analysisSourceLabel = computed(() => {
  const backendFeedback = normalizeText(scoreResult.value?.feedback);
  if (backendFeedback) return "评分反馈来自后端；建议和转录对齐说明由本地规则辅助生成。";
  return "建议和转录对齐说明由本地规则辅助生成。";
});

const coachFeedback = computed(() => {
  const backendFeedback = normalizeText(scoreResult.value?.feedback);
  if (backendFeedback) return backendFeedback;
  return `${weakestDimension.value?.shortLabel || "流利度"}是本次主要提升点。下一轮先保持稳定语速，再处理长词和标点停顿。`;
});

const aiMessages = computed(() => [
  {
    id: "summary",
    text: `${weakestDimension.value?.shortLabel || "流利度"}是本次扣分重点，建议下一题先用更稳的语速读完。`,
    time: "Coach Feedback"
  },
  {
    id: "next-step",
    text: `本题 ${wordCount.value} 词，建议准备时先找从句和专有名词，再开始录音。`,
    time: "Coach Feedback"
  }
]);

const todayStats = computed(() => {
  const rows = Array.isArray(todayLogs.value) ? todayLogs.value : [];
  const yesterdayAverage = average(yesterdayLogs.value.map((item) => item.overall));
  const todayAverage = average(rows.map((item) => item.overall));
  const delta = todayAverage === null || yesterdayAverage === null ? null : Math.round(todayAverage - yesterdayAverage);
  const practicedQuestionIds = new Set(rows.map((item) => normalizeText(item.questionId)).filter(Boolean));
  const remaining = questionBank.value.length ? Math.max(0, questionBank.value.length - practicedQuestionIds.size) : "--";

  return [
    { val: rows.length || 0, label: "今日练习", color: "var(--c0)" },
    { val: todayAverage === null ? "--" : Math.round(todayAverage), label: "今日均分", color: "var(--c2)" },
    { val: delta === null ? "--" : `${delta >= 0 ? "+" : ""}${delta}`, label: "较昨日", color: delta === null || delta >= 0 ? "var(--kk-success)" : "var(--kk-notice)" },
    { val: remaining, label: "剩余题数", color: "var(--kk-ink)" }
  ];
});

const todayStatsSourceLabel = computed(() => {
  return "来自今日 practice_logs；本次结果若尚未写入日志，不计入统计。";
});

const chartRows = computed(() => {
  return [...persistedHistoryRows.value].reverse().slice(-6);
});

const chartDates = computed(() => chartRows.value.map((item) => formatShortDate(item.createdAt)));
const chartPoints = computed(() => {
  const width = 220;
  const height = 60;
  const pad = 8;
  const rows = chartRows.value;
  const count = Math.max(1, rows.length - 1);
  return rows.map((item, index) => {
    const score = normalizeScore(item.overall, overallScore.value);
    return {
      x: pad + (index / count) * (width - pad * 2),
      y: height - pad - ((score - 10) / 80) * (height - pad * 2)
    };
  });
});
const chartLinePath = computed(() => {
  if (!chartPoints.value.length) return "";
  return chartPoints.value.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
});
const chartAreaPath = computed(() => {
  const points = chartPoints.value;
  if (!points.length) return "";
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  return `${line} L${points[points.length - 1].x},60 L${points[0].x},60 Z`;
});

onMounted(async () => {
  if (!scoreResult.value) {
    router.replace("/ra/practice");
    return;
  }

  if (showDiagnosis.value) return;
  await Promise.allSettled([
    loadQuestionBank(),
    loadQuestionHistory(),
    loadTodayStats(),
    loadRecordingDuration()
  ]);
});

async function loadQuestionBank() {
  const rows = await fetchQuestions("RA");
  questionBank.value = Array.isArray(rows) ? rows : [];
}

async function loadQuestionHistory() {
  const id = questionId.value;
  if (!id || id === "unknown") return;
  historyLoading.value = true;
  try {
    questionHistory.value = await fetchRAHistoryByQuestion(id);
  } catch (error) {
    console.warn("RA result history load failed:", error);
    loadNotice.value = "本题历史暂时无法同步，已先展示本次结果。";
    questionHistory.value = [];
  } finally {
    historyLoading.value = false;
  }
}

async function loadTodayStats() {
  statsLoading.value = true;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      todayLogs.value = [];
      yesterdayLogs.value = [];
      return;
    }

    const todayStart = startOfLocalDay(new Date());
    const tomorrowStart = addDays(todayStart, 1);
    const yesterdayStart = addDays(todayStart, -1);

    const [todayResult, yesterdayResult] = await Promise.all([
      fetchRALogRange(userId, todayStart, tomorrowStart),
      fetchRALogRange(userId, yesterdayStart, todayStart)
    ]);

    todayLogs.value = todayResult;
    yesterdayLogs.value = yesterdayResult;
  } catch (error) {
    console.warn("RA result today stats load failed:", error);
    todayLogs.value = [];
    yesterdayLogs.value = [];
  } finally {
    statsLoading.value = false;
  }
}

async function fetchRALogRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, question_id, score_json, transcript, feedback, created_at")
    .eq("task_type", "RA")
    .eq("user_id", userId)
    .gte("created_at", startDate.toISOString())
    .lt("created_at", endDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => normalizeStatsLog(row));
}

async function loadRecordingDuration() {
  const blob = practiceStore.audioBlob;
  if (!blob || typeof URL === "undefined" || typeof Audio === "undefined") return;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const duration = await new Promise((resolve) => {
      const audio = new Audio();
      const finish = (value) => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        resolve(value);
      };
      audio.onloadedmetadata = () => {
        const value = Number(audio.duration || 0);
        finish(Number.isFinite(value) ? Math.round(value) : 0);
      };
      audio.onerror = () => finish(0);
      audio.src = objectUrl;
    });
    recordingDurationSec.value = Math.max(0, Number(duration || 0));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function goNextQuestion() {
  const next = await resolveNextQuestion();
  if (next) {
    practiceStore.setSelectedQuestion(next);
    router.push({ path: "/ra/practice", query: { questionId: next.id } });
    return;
  }
  const nextId = inferNextQuestionId(questionId.value);
  if (nextId) {
    router.push({ path: "/ra/practice", query: { questionId: nextId } });
    return;
  }
  router.push({ path: "/ra/practice", query: { mode: "random" } });
}

function retryQuestion() {
  const question = currentQuestion.value;
  if (question) practiceStore.setSelectedQuestion(question);
  router.push({
    path: "/ra/practice",
    query: questionId.value && questionId.value !== "unknown" ? { questionId: questionId.value } : {}
  });
}

async function goRandomQuestion() {
  const picked = await getRandomQuestion("RA");
  if (picked) practiceStore.setSelectedQuestion(picked);
  router.push({
    path: "/ra/practice",
    query: picked?.id ? { questionId: picked.id, mode: "random" } : { mode: "random" }
  });
}

function goRAHome() {
  router.push("/ra");
}

function goAgent() {
  router.push("/agent");
}

async function resolveNextQuestion() {
  if (!questionBank.value.length) await loadQuestionBank();
  const list = questionBank.value;
  if (!list.length) return null;
  const index = list.findIndex((item) => normalizeText(item?.id) === questionId.value);
  if (index >= 0 && index < list.length - 1) return list[index + 1];
  return list[0] || null;
}

function rawDimensionScore(key) {
  const value = normalizeScore(scoreResult.value?.scores?.[key], Number.NaN);
  return Number.isFinite(value) ? value : 10;
}

function getDimensionFeedback(config, rawScore) {
  if (rawScore >= 76) return config.high;
  if (rawScore >= 58) return config.mid;
  return config.low;
}

function getDimensionTips(key, rawScore) {
  const tips = {
    pronunciation: ["注意词尾辅音不要吞掉", "专有名词先默读一遍再录音"],
    fluency: ["按标点切分意群", "长词提前分节，避免中途停住"],
    content: ["完整读到关键词", "遇到长句先稳住顺序"]
  };
  if (rawScore >= 76) return ["保持现在的节奏和清晰度"];
  return tips[key] || [];
}

function buildTranscriptAlignment(referenceText, recognizedText) {
  const referenceWords = splitDisplayWords(referenceText);
  if (!referenceWords.length) {
    return splitDisplayWords(recognizedText).map((word, index) => ({
      id: `transcript-${index}`,
      word,
      status: "ok",
      note: "识别转录"
    }));
  }

  if (!normalizeText(recognizedText)) {
    return referenceWords.map((word, index) => ({
      id: `source-${index}`,
      word,
      status: "plain",
      note: "无识别转录，未做对错标注"
    }));
  }

  const recognizedTokens = tokenizeWords(recognizedText);
  const tokenCounts = new Map();
  recognizedTokens.forEach((token) => {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  });

  return referenceWords.map((word, index) => {
    const token = normalizeToken(word);
    if (!token) {
      return { id: `word-${index}`, word, status: "good", note: "" };
    }

    if ((tokenCounts.get(token) || 0) > 0) {
      tokenCounts.set(token, tokenCounts.get(token) - 1);
      return { id: `word-${index}`, word, status: "good", note: "识别命中" };
    }

    const nearToken = findNearToken(token, tokenCounts);
    if (nearToken) {
      tokenCounts.set(nearToken, tokenCounts.get(nearToken) - 1);
      return { id: `word-${index}`, word, status: "ok", note: `可能识别为 ${nearToken}` };
    }

    return { id: `word-${index}`, word, status: "miss", note: "本地对齐未命中" };
  });
}

function findNearToken(token, tokenCounts) {
  if (token.length < 5) return "";
  for (const [candidate, count] of tokenCounts.entries()) {
    if (count <= 0) continue;
    if (candidate.length < 5) continue;
    if (candidate.startsWith(token.slice(0, 5)) || token.startsWith(candidate.slice(0, 5))) return candidate;
    if (levenshteinDistance(token, candidate) <= 1) return candidate;
  }
  return "";
}

function levenshteinDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => []);
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[left.length][right.length];
}

function normalizeStatsLog(row) {
  const scoreJson = toObject(row?.score_json) || {};
  const scores = toObject(scoreJson?.scores) || scoreJson;
  return {
    id: normalizeText(row?.id),
    questionId: normalizeText(row?.question_id),
    transcript: normalizeText(row?.transcript),
    createdAt: normalizeText(row?.created_at),
    overall: legacySpeakingDisplayOverall(scoreJson) ?? normalizeScore(scores?.overall ?? scoreJson?.overall, 0),
    scores: {
      pronunciation: null,
      fluency: normalizeScore(scores?.fluency, 0),
      content: normalizeScore(scores?.content, 0)
    }
  };
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("RA result session read failed:", error);
    return "";
  }
  return normalizeText(data?.session?.user?.id);
}

function getQuestionWordCount(question, content) {
  const explicit = Number(question?.wordCount ?? question?.word_count);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return tokenizeWords(content).length;
}

function getDifficultyLevel(question) {
  const level = Number(question?.difficulty || 2);
  if (!Number.isFinite(level)) return 2;
  if (level <= 1) return 1;
  if (level >= 3) return 3;
  return 2;
}

function scoreColor(score) {
  const value = normalizeScore(score, 0);
  if (value >= 75) return "var(--kk-success)";
  if (value >= 58) return "var(--kk-ink)";
  return "var(--kk-notice)";
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds || 0)));
  if (!value) return "读取中";
  return `${value} 秒`;
}

function formatMonthDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isToday(date) {
  const today = startOfLocalDay(new Date());
  const value = startOfLocalDay(date);
  return today.getTime() === value.getTime();
}

function average(values) {
  const valid = values.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (!valid.length) return null;
  return valid.reduce((sum, item) => sum + item, 0) / valid.length;
}

function splitDisplayWords(text) {
  return normalizeText(text).match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?[.,;:!?"]?/g) || [];
}

function tokenizeWords(text) {
  return splitDisplayWords(text).map((word) => normalizeToken(word)).filter(Boolean);
}

function normalizeToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "")
    .trim();
}

function normalizeText(value) {
  return `${value || ""}`.trim();
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

function normalizeScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(Math.round(number), 0, 90);
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function inferNextQuestionId(id) {
  const normalized = normalizeText(id);
  const match = normalized.match(/^(.*?)(\d+)$/);
  if (!match) return "";
  const [, prefix, numericPart] = match;
  const nextNumber = Number(numericPart) + 1;
  if (!Number.isFinite(nextNumber)) return "";
  return `${prefix}${String(nextNumber).padStart(numericPart.length, "0")}`;
}
</script>

<template>
  <RADiagnosisResult v-if="showDiagnosis" :result="scoreResult" />
  <div v-else class="ra-result-shell" data-testid="ra-result-page">
    <header class="topbar">
      <button class="tb-back" type="button" data-testid="ra-result-back" @click="goRAHome">
        <span class="tb-arr">‹</span>
        <span>朗读题 · RA</span>
      </button>
      <div class="tb-title">RA 评测结果</div>
      <div class="tb-right">
        <div class="vip-pill"><span class="vip-dot"></span>VIP · 无限练习</div>
        <button class="exit-btn" type="button" @click="goRAHome">退出</button>
      </div>
    </header>

    <section class="step-bar" data-testid="ra-result-stepper">
      <div v-for="(step, index) in steps" :key="step" class="step-wrap">
        <div class="step-item">
          <div class="step-num" :class="index === 3 ? 'act' : 'done'">{{ index < 3 ? "✓" : 4 }}</div>
          <span class="step-label" :class="index === 3 ? 'act' : 'done'">{{ step }}</span>
        </div>
        <div v-if="index < steps.length - 1" class="step-sep"></div>
      </div>
      <div class="step-q-info">第 {{ questionIndex }} 题 已完成</div>
    </section>

    <div class="page-body">
      <aside class="left-col">
        <section class="lc-card">
          <div class="lc-hd">本题信息</div>
          <div class="lc-body">
            <div class="info-rows">
              <div class="ir"><span class="ir-k">题号</span><span class="ir-v">{{ questionId }}</span></div>
              <div class="ir">
                <span class="ir-k">难度</span>
                <span class="diff-badge" :class="difficultyClass">{{ difficultyLabel }}</span>
              </div>
              <div class="ir"><span class="ir-k">词数</span><span class="ir-v">{{ wordCount }} 词</span></div>
              <div class="ir"><span class="ir-k">录音时长</span><span class="ir-v ok-text">{{ formatDuration(recordingDurationSec) }}</span></div>
              <div class="ir"><span class="ir-k">本次得分</span><span class="ir-v score-highlight">{{ overallScore }} / 90</span></div>
              <div class="ir">
                <span class="ir-k">较上次</span>
                <span class="ir-v" :class="deltaFromPrevious === null || deltaFromPrevious >= 0 ? 'delta-up' : 'delta-down'">
                  {{ deltaFromPrevious === null ? "首次" : `${deltaFromPrevious >= 0 ? "+" : ""}${deltaFromPrevious} 分` }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="lc-card">
          <div class="lc-hd">本题历史趋势</div>
          <div class="lc-body">
            <div v-if="historyLoading" class="muted-line">正在同步本题历史...</div>
            <div v-else-if="trendRows.length" class="trend-list">
              <div v-for="history in trendRows" :key="`${history.date}-${history.score}`" class="tl-row">
                <span class="tl-date">{{ history.date }}</span>
                <div class="tl-bar-bg">
                  <div
                    class="tl-bar-fill"
                    :style="{ width: `${Math.max(8, (history.score / 90) * 100)}%`, background: scoreColor(history.score) }"
                  ></div>
                </div>
                <span class="tl-val" :style="{ color: scoreColor(history.score) }">{{ history.score }}</span>
              </div>
            </div>
            <div v-else class="empty-trend">
              暂无本题历史记录，完成更多练习后这里会显示分数趋势。
            </div>
            <div v-if="isImproving" class="trend-note">连续提升，保持节奏。</div>
            <div v-else-if="loadNotice" class="trend-note muted">{{ loadNotice }}</div>
          </div>
        </section>

        <section class="lc-card">
          <div class="lc-hd">改进建议</div>
          <div class="lc-body">
            <div v-for="item in suggestions" :key="item.text" class="suggestion-item">
              <div class="sug-dot" :style="{ background: item.color }"></div>
              <span class="sug-text">{{ item.text }}</span>
            </div>
          </div>
        </section>
      </aside>

      <main class="main-col">
        <section class="result-banner">
          <div class="rb-top">
            <div class="rb-left">
              <div class="rb-kicker">{{ resultKicker }} · RA RESULT</div>
              <h1 class="rb-title">{{ resultHeadline }}</h1>
              <p class="rb-sub">{{ resultSubline }}</p>
              <div class="source-pill" :class="resultSource.key" :title="resultSource.detail">{{ resultSource.label }}</div>
            </div>
            <div class="rb-score-wrap">
              <div class="rb-score">{{ overallScore }}</div>
              <div class="rb-score-label">Overall Score / 90</div>
            </div>
          </div>
          <div class="rb-dims">
            <article v-for="dimension in dimensionItems" :key="dimension.key" class="dim-item">
              <div class="di-name">{{ dimension.label }}</div>
              <div class="di-val-row">
                <span class="di-val" :class="{ 'di-val--na': dimension.notAssessed }">{{ dimension.score }}</span>
                <span v-if="!dimension.notAssessed" class="di-max">/{{ dimension.max }}</span>
              </div>
              <div class="di-bar-bg">
                <div class="di-bar-fill" :style="{ width: `${dimension.pct}%`, background: dimension.color }"></div>
              </div>
              <div class="di-desc">{{ dimension.desc }}</div>
            </article>
          </div>
        </section>

        <section class="transcript-card" data-testid="ra-result-transcript">
          <div class="tc-header">
            <div>
              <div class="tc-title">本地转录对齐参考</div>
              <div class="tc-source">{{ transcriptSourceLabel }}</div>
            </div>
            <div class="tc-legend">
              <span class="tcl-item good-dot">识别命中</span>
              <span class="tcl-item ok-dot">近似匹配</span>
              <span class="tcl-item miss-dot">未命中</span>
            </div>
          </div>
          <p class="tc-text">
            <span
              v-for="word in transcriptWords"
              :key="word.id"
              class="tc-word"
              :class="word.status"
              :title="word.note"
            >{{ word.word }} </span>
          </p>
          <div class="source-text">
            <div class="source-title">
              <span>READ ALOUD 原题</span>
              <span>{{ wordCount }} 词 · 约 {{ estimatedDurationSec }} 秒</span>
            </div>
            <p>{{ questionContent || "当前题目内容暂不可用。" }}</p>
          </div>
        </section>

        <section class="bottom-actions" data-testid="ra-result-actions">
          <button class="ba-primary" type="button" data-testid="ra-result-next" @click="goNextQuestion">继续练习下一题 →</button>
          <button class="ba-ghost" type="button" data-testid="ra-result-retry" @click="retryQuestion">再练一次这题</button>
          <button class="ba-ghost warm" type="button" data-testid="ra-result-random" @click="goRandomQuestion">随机换一题</button>
          <button class="ba-ghost" type="button" data-testid="ra-result-home" @click="goRAHome">← 返回首页</button>
        </section>
      </main>

      <aside class="right-col">
        <section class="ai-card">
          <div class="ai-hd">
            <div class="ai-hd-title">AI 私教评分反馈</div>
            <button class="ai-hd-link" type="button" data-testid="ra-result-agent-link" @click="goAgent">进入私教 →</button>
          </div>
          <div class="ai-suggest">
            <span class="ai-sug-ico">▣</span>
            <span>{{ weakestDimension.shortLabel }}是本次重点，下次练习先处理这一项。</span>
          </div>
          <div class="ai-msgs">
            <div v-for="message in aiMessages" :key="message.id" class="ai-msg">
              <div class="ai-av">AI</div>
              <div class="ai-bubble">
                <div class="ai-bubble-text">{{ message.text }}</div>
                <div class="ai-bubble-time">{{ message.time }}</div>
              </div>
            </div>
          </div>
          <div class="coach-feedback">
            {{ coachFeedback }}
          </div>
          <div class="ai-source-line">{{ analysisSourceLabel }}</div>
          <div class="ai-q-list">
            <button class="ai-q-item" type="button" @click="goAgent"><span>如何提高{{ weakestDimension.shortLabel }}？</span><span>›</span></button>
            <button class="ai-q-item" type="button" @click="goAgent"><span>生成下一步练习计划</span><span>›</span></button>
          </div>
        </section>

        <section class="lc-card">
          <div class="lc-hd">综合表现</div>
          <div class="lc-body">
            <div v-for="dimension in dimensionItems" :key="`${dimension.key}-right`" class="rdim-row">
              <span class="rdim-name">{{ dimension.shortLabel }}</span>
              <div class="rdim-bar-bg">
                <div class="rdim-bar-fill" :style="{ width: `${dimension.pct}%`, background: dimension.color }"></div>
              </div>
              <span class="rdim-val" :class="{ 'rdim-val--na': dimension.notAssessed }" :style="{ color: dimension.color }">{{ dimension.score }}</span>
            </div>
            <div class="rdim-total">
              <span>总分</span>
              <span class="rdim-total-val">{{ overallScore }}<span class="rdim-total-max">/90</span></span>
            </div>
          </div>
        </section>

        <section class="lc-card">
          <div class="lc-hd">本题近期趋势</div>
          <div class="lc-body">
            <svg v-if="chartRows.length > 1" class="mini-chart" width="100%" height="60" viewBox="0 0 220 60" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="raResultChartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="currentColor" stop-opacity=".16" />
                  <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path :d="chartAreaPath" fill="url(#raResultChartGrad)" />
              <path :d="chartLinePath" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <circle
                v-for="(point, index) in chartPoints"
                :key="index"
                :cx="point.x"
                :cy="point.y"
                r="3"
                fill="currentColor"
                stroke="var(--kk-surface)"
                stroke-width="1.5"
              />
            </svg>
            <div v-else class="single-score-trend">
              <span>{{ overallScore }}</span>
              <small>本次结果，暂无更多历史点</small>
            </div>
            <div v-if="chartRows.length > 1" class="chart-labels">
              <span v-for="date in chartDates" :key="date">{{ date }}</span>
            </div>
          </div>
        </section>

        <section class="lc-card">
          <div class="lc-hd">今日 RA 统计</div>
          <div class="lc-body">
            <div v-if="statsLoading" class="muted-line">正在同步今日统计...</div>
            <div class="today-stat-grid">
              <div v-for="stat in todayStats" :key="stat.label" class="tsg-item">
                <div class="tsg-val" :style="{ color: stat.color }">{{ stat.val }}</div>
                <div class="tsg-lbl">{{ stat.label }}</div>
              </div>
            </div>
            <div class="stats-source">{{ todayStatsSourceLabel }}</div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
*, *::before, *::after {
  box-sizing: border-box;
}

.ra-result-shell {
  --c0: var(--kk-ink);
  --c1: var(--kk-ink);
  --c2: var(--kk-ink);
  --c3: var(--kk-ink-2);
  --bg1: var(--kk-bg);
  --bg2: var(--kk-surface);
  --card: var(--kk-surface);
  --card2: var(--kk-surface-2);
  --bdr: var(--kk-line);
  --bdr2: var(--kk-line);
  --grn: var(--kk-success);
  --grn2: var(--kk-success-bg);
  --grn3: var(--kk-success-line);
  --org: var(--kk-notice);
  --org2: var(--kk-notice-bg);
  --org3: var(--kk-notice-line);
  --red: var(--kk-error);
  --red2: var(--kk-error-bg);
  --red3: var(--kk-error-line);
  --mute: var(--kk-ink-3);
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg1);
  color: var(--c0);
  font-family: var(--kk-font);
}

.topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: var(--c2);
}

.tb-back,
.exit-btn,
.ai-hd-link {
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

.tb-back {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(250, 246, 239, .72);
  font-size: 15px;
}

.tb-arr {
  font-size: 17px;
}

.tb-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  color: var(--kk-ink-inverse);
  font-size: 15px;
  font-weight: 800;
}

.tb-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.vip-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border: 1px solid var(--kk-success-line);
  border-radius: 999px;
  background: var(--kk-success-bg);
  color: var(--kk-success);
  font-size: 13px;
  font-weight: 700;
}

.vip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--kk-success);
}

.exit-btn {
  color: rgba(250, 246, 239, .66);
  font-size: 13px;
}

.step-bar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 28px;
  border-bottom: 1px solid var(--bdr);
  background: var(--bg2);
}

.step-wrap,
.step-item {
  display: flex;
  align-items: center;
}

.step-item {
  gap: 7px;
  padding: 0 8px;
}

.step-num {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 800;
}

.step-num.done {
  background: var(--grn);
  color: #fff;
}

.step-num.act {
  background: var(--c2);
  color: var(--kk-ink-inverse);
}

.step-label {
  font-size: 13px;
  font-weight: 600;
}

.step-label.done {
  color: var(--grn);
}

.step-label.act {
  color: var(--c2);
}

.step-sep {
  width: 20px;
  height: 1px;
  background: var(--bdr);
}

.step-q-info {
  margin-left: auto;
  color: var(--mute);
  font-size: 13px;
}

.page-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr) 252px;
  overflow: hidden;
}

.left-col,
.right-col {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  overflow-y: auto;
  padding: 14px 13px;
  background: var(--bg2);
}

.left-col {
  border-right: 1px solid var(--bdr);
}

.right-col {
  border-left: 1px solid var(--bdr);
}

.left-col > *,
.right-col > * {
  flex: 0 0 auto;
}

.left-col::-webkit-scrollbar,
.right-col::-webkit-scrollbar,
.main-col::-webkit-scrollbar {
  width: 4px;
}

.left-col::-webkit-scrollbar-thumb,
.right-col::-webkit-scrollbar-thumb,
.main-col::-webkit-scrollbar-thumb {
  border-radius: 99px;
  background: var(--bdr);
}

.lc-card,
.result-banner,
.transcript-card,
.question-card,
.ai-card {
  border: 1px solid var(--bdr);
  border-radius: 13px;
  background: var(--card);
  overflow: hidden;
}

.lc-hd {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 13px 9px;
  border-bottom: 1px solid var(--bdr);
  color: var(--c0);
  font-size: 13px;
  font-weight: 800;
}

.lc-star {
  color: var(--c2);
}

.lc-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 13px;
}

.info-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ir {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ir-k {
  color: var(--mute);
  font-size: 12px;
}

.ir-v {
  color: var(--c0);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.score-highlight {
  color: var(--c2);
  font-size: 15px;
  font-weight: 900;
}

.ok-text,
.delta-up {
  color: var(--grn);
}

.delta-down {
  color: var(--red);
}

.diff-badge {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
}

.diff-badge.hard {
  border: 1px solid var(--red3);
  background: var(--red2);
  color: var(--red);
}

.diff-badge.medium {
  border: 1px solid var(--org3);
  background: var(--org2);
  color: var(--org);
}

.diff-badge.easy {
  border: 1px solid var(--grn3);
  background: var(--grn2);
  color: var(--grn);
}

.trend-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-trend {
  padding: 9px 10px;
  border: 1px solid var(--bdr);
  border-radius: 8px;
  background: var(--card2);
  color: var(--mute);
  font-size: 13px;
  line-height: 1.55;
}

.tl-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 7px;
}

.tl-date {
  color: var(--mute);
  font-size: 12px;
}

.tl-bar-bg {
  height: 14px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--bdr);
}

.tl-bar-fill {
  height: 100%;
  min-width: 8px;
  border-radius: 4px;
}

.tl-val {
  font-size: 12px;
  font-weight: 800;
  text-align: right;
}

.trend-note {
  padding: 7px 10px;
  border: 1px solid var(--grn3);
  border-radius: 7px;
  background: var(--grn2);
  color: var(--kk-success);
  font-size: 13px;
  font-weight: 600;
}

.trend-note.muted,
.muted-line {
  color: var(--mute);
  font-size: 13px;
  font-weight: 500;
}

.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.sug-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  margin-top: 7px;
  border-radius: 50%;
}

.sug-text {
  color: var(--c1);
  font-size: 13px;
  line-height: 1.65;
}

.main-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px 22px;
}

.result-banner {
  border-radius: 16px;
}

.rb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 16px 24px;
  background: linear-gradient(135deg, var(--c2) 0%, var(--c3) 58%, var(--kk-ink-2) 100%);
}

.rb-kicker {
  margin-bottom: 5px;
  color: rgba(250, 246, 239, .62);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .14em;
}

.rb-title {
  margin: 0 0 3px;
  color: var(--kk-ink-inverse);
  font-size: 20px;
  font-weight: 900;
}

.rb-sub {
  margin: 0;
  color: rgba(250, 246, 239, .7);
  font-size: 13px;
}

.source-pill {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 3px 8px;
  border: 1px solid rgba(250, 246, 239, .32);
  border-radius: 999px;
  background: rgba(250, 246, 239, .12);
  color: rgba(250, 246, 239, .82);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .02em;
}

.source-pill.fallback {
  border-color: rgba(245, 224, 220, .68);
  background: rgba(245, 224, 220, .18);
}

.source-pill.backend {
  border-color: rgba(223, 240, 228, .62);
  background: rgba(223, 240, 228, .14);
}

.rb-score-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.rb-score {
  color: var(--kk-ink-inverse);
  font-size: 52px;
  font-weight: 900;
  line-height: 1;
}

.rb-score-label {
  margin-top: 2px;
  color: rgba(250, 246, 239, .62);
  font-size: 13px;
  font-weight: 700;
}

.rb-dims {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--bdr);
  background: var(--card);
}

.dim-item {
  padding: 11px 16px;
  border-right: 1px solid var(--bdr);
}

.dim-item:last-child {
  border-right: 0;
}

.di-name {
  margin-bottom: 4px;
  color: var(--mute);
  font-size: 13px;
  font-weight: 700;
}

.di-val-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin-bottom: 7px;
}

.di-val {
  color: var(--c0);
  font-size: 24px;
  font-weight: 900;
}

.di-max {
  color: var(--mute);
  font-size: 13px;
}

.di-bar-bg,
.rdim-bar-bg {
  overflow: hidden;
  border-radius: 99px;
  background: var(--bdr);
}

.di-bar-bg {
  height: 5px;
}

.di-bar-fill,
.rdim-bar-fill {
  height: 100%;
  border-radius: 99px;
}

.di-desc {
  margin-top: 5px;
  color: var(--mute);
  font-size: 12px;
}

.transcript-card {
  padding: 14px 20px;
}

.tc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
}

.tc-title {
  color: var(--c0);
  font-size: 15px;
  font-weight: 800;
}

.tc-source {
  margin-top: 3px;
  color: var(--mute);
  font-size: 12px;
}

.tc-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.tcl-item {
  font-size: 12px;
  font-weight: 700;
}

.good-dot {
  color: var(--grn);
}

.ok-dot {
  color: var(--org);
}

.miss-dot {
  color: var(--red);
}

.tc-text {
  margin: 0;
  color: var(--c1);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 15px;
  line-height: 1.9;
}

.tc-word {
  display: inline-block;
  margin-right: .22em;
}

.tc-word.good {
  color: var(--grn);
}

.tc-word.ok {
  color: var(--org);
}

.tc-word.miss {
  color: var(--red);
  text-decoration: underline;
  text-decoration-color: var(--red);
  text-underline-offset: 3px;
}

.tc-word.plain {
  color: var(--c1);
  text-decoration: none;
}

.source-text {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px solid var(--bdr);
}

.source-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--mute);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .08em;
}

.source-text p {
  margin: 0;
  color: var(--c1);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 15px;
  line-height: 1.75;
}

.bottom-actions {
  display: grid;
  grid-template-columns: 1.16fr 1fr 1fr 1fr;
  gap: 10px;
}

.ba-primary,
.ba-ghost {
  min-height: 42px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.ba-primary {
  border: 0;
  background: var(--c2);
  color: var(--kk-ink-inverse);
}

.ba-primary:hover {
  background: var(--kk-action-hover);
}

.ba-ghost {
  border: 1px solid var(--bdr2);
  background: var(--card2);
  color: var(--c1);
}

.ba-ghost.warm {
  border-color: var(--org3);
  background: var(--org2);
  color: var(--org);
}

.ba-ghost:hover {
  background: var(--bg1);
}

.ai-card {
  border-radius: 13px;
}

.ai-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 13px 9px;
  background: var(--c2);
}

.ai-hd-title {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--kk-ink-inverse);
  font-size: 13px;
  font-weight: 800;
}

.ai-hd-link {
  color: rgba(250, 246, 239, .72);
  font-size: 12px;
  text-decoration: underline;
}

.ai-suggest {
  display: flex;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--org3);
  background: var(--org2);
  color: var(--org);
  font-size: 13px;
  line-height: 1.5;
}

.ai-msgs {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
}

.ai-msg {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.ai-av {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--c2);
  color: var(--kk-ink-inverse);
  font-size: 12px;
  font-weight: 800;
}

.ai-bubble {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--bdr);
  border-radius: 0 7px 7px 7px;
  background: var(--card2);
}

.ai-bubble-text,
.coach-feedback {
  color: var(--c1);
  font-size: 13px;
  line-height: 1.6;
}

.ai-bubble-time {
  margin-top: 2px;
  color: var(--mute);
  font-size: 12px;
}

.coach-feedback {
  margin: 0 12px 10px;
  padding: 9px 10px;
  border: 1px solid var(--bdr);
  border-radius: 8px;
  background: var(--card2);
}

.ai-source-line,
.stats-source {
  color: var(--mute);
  font-size: 12px;
  line-height: 1.5;
}

.ai-source-line {
  margin: -4px 12px 8px;
}

.ai-q-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 12px 12px;
  border-top: 1px solid var(--bdr);
}

.ai-q-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border: 1px solid var(--bdr);
  border-radius: 7px;
  background: var(--card2);
  color: var(--c1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.rdim-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
}

.rdim-name {
  color: var(--mute);
  font-size: 12px;
}

.rdim-bar-bg {
  height: 5px;
}

.rdim-val {
  font-size: 13px;
  font-weight: 800;
  text-align: right;
}

.rdim-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--bdr);
  color: var(--mute);
  font-size: 13px;
}

.rdim-total-val {
  color: var(--c2);
  font-size: 22px;
  font-weight: 900;
}

.rdim-total-max {
  color: var(--mute);
  font-size: 13px;
  font-weight: 500;
}

.mini-chart {
  display: block;
}

.single-score-trend {
  min-height: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--bdr);
  border-radius: 9px;
  background: var(--card2);
}

.single-score-trend span {
  color: var(--c2);
  font-size: 24px;
  font-weight: 900;
}

.single-score-trend small {
  color: var(--mute);
  font-size: 12px;
}

.chart-labels {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-top: 4px;
}

.chart-labels span {
  color: var(--mute);
  font-size: 12px;
}

.today-stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.tsg-item {
  padding: 9px 6px;
  border: 1px solid var(--bdr);
  border-radius: 9px;
  background: var(--card2);
  text-align: center;
}

.tsg-val {
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.tsg-lbl {
  margin-top: 3px;
  color: var(--mute);
  font-size: 12px;
}

.stats-source {
  margin-top: 2px;
}

@media (max-width: 1320px) {
  .page-body {
    grid-template-columns: 232px minmax(0, 1fr) 232px;
  }

  .left-col,
  .right-col {
    padding: 12px 10px;
  }

  .main-col {
    padding: 16px 18px;
  }

  .rb-title {
    font-size: 18px;
  }

  .bottom-actions {
    gap: 8px;
  }

  .ba-primary,
  .ba-ghost {
    font-size: 13px;
  }
}

@media (min-width: 1600px) {
  .page-body {
    grid-template-columns: 300px minmax(0, 1fr) 300px;
  }

  .main-col {
    padding: 18px 32px;
  }
}
@media (max-width: 767px) {
  .ra-result-shell { width: 100%; height: auto; min-height: 100dvh; overflow: visible; }
  .topbar { height: auto; min-height: 52px; padding: 6px 12px; gap: 8px; flex-wrap: wrap; }
  .tb-title { position: static; transform: none; font-size: 15px; }
  .tb-right { gap: 6px; }
  .vip-pill { padding: 4px 7px; }
  .tb-back, .exit-btn { min-height: 44px; }
  .exit-btn { min-width: 44px; }
  .step-bar { height: auto; min-height: 40px; padding: 8px 12px; flex-wrap: wrap; gap: 8px; }
  .step-wrap { flex-wrap: wrap; gap: 4px; }
  .step-item { padding: 0 3px; gap: 4px; }
  .step-sep { width: 8px; }
  .step-q-info { width: 100%; margin-left: 0; overflow-wrap: anywhere; }
  .page-body { flex: none; display: flex; flex-direction: column; overflow: visible; }
  .main-col { order: 0; overflow: visible; padding: 12px; }
  .left-col, .right-col { min-width: 0; overflow: visible; padding: 12px; border: 0; }
  .left-col { order: 1; }
  .right-col { order: 2; }
  .rb-top { padding: 16px; gap: 12px; flex-wrap: wrap; }
  .rb-top > div { min-width: 0; }
  .rb-sub, .source-pill, .ir-v, .sug-text, .ai-bubble-text, .coach-feedback { overflow-wrap: anywhere; }
  .rb-score { font-size: 42px; }
  .dim-item { padding: 10px 8px; }
  .transcript-card { padding: 12px; }
  .tc-header { flex-direction: column; gap: 8px; }
  .tc-legend { justify-content: flex-start; }
  .tc-word, .source-text { overflow-wrap: anywhere; max-width: 100%; }
  .bottom-actions { grid-template-columns: minmax(0, 1fr); }
  .ba-primary, .ba-ghost, .ai-hd-link, .ai-q-item { min-height: 44px; }
  .ai-hd { flex-wrap: wrap; gap: 8px; }
}

/* docs/ui-guidelines.md: light chrome, the score banner is the one dark card, "继续练习" is the primary action. */
.topbar { background: var(--kk-surface); border-bottom: 1px solid var(--kk-line); }
.tb-back { color: var(--kk-ink); min-height: 44px; }
.tb-back:hover { color: var(--kk-action-text); }
.tb-title { color: var(--kk-ink); font-weight: 600; }
.vip-pill { background: var(--kk-surface-2); border-color: transparent; color: var(--kk-ink-2); }
.vip-dot { display: none; }
.exit-btn { min-height: 36px; padding: 0 14px; border: 1px solid var(--kk-line); border-radius: 999px; background: var(--kk-surface); color: var(--kk-ink-2); }
.step-bar { background: var(--kk-surface); }
.step-num.act { background: var(--kk-action); color: var(--kk-on-action); }
.step-num.done { background: var(--kk-ink); color: var(--kk-ink-inverse); }
.step-label.act { color: var(--kk-action-text); }
.step-label.done { color: var(--kk-ink); }
.rb-top { background: var(--kk-ink); }
.rb-score { font-family: var(--kk-font-num); }
.ba-primary { background: var(--kk-action); color: var(--kk-on-action); border-color: var(--kk-action); border-radius: 999px; }
.ba-primary:hover { background: var(--kk-action-hover); }
.ba-ghost { border-radius: 999px; }
.ai-hd { background: var(--kk-surface); border-bottom: 1px solid var(--kk-line); }
.ai-hd-title { color: var(--kk-ink); }
.ai-hd-link { color: var(--kk-action-text); text-decoration: none; font-weight: 600; }
.ai-av { background: var(--kk-ink); color: var(--kk-ink-inverse); }
.mini-chart { color: var(--kk-ink); }
.diff-badge, .diff-badge.hard, .diff-badge.medium, .diff-badge.easy { background: var(--kk-surface-2); border-color: transparent; color: var(--kk-ink-2); border-radius: 999px; }
.ba-ghost.warm { background: var(--kk-surface); border-color: var(--kk-line); color: var(--kk-ink); }
.ai-suggest { background: var(--kk-surface-2); border-color: transparent; color: var(--kk-ink); }
@media (max-width: 767px) { .vip-pill { display: none; } }
.di-val.di-val--na, .rdim-val.rdim-val--na { font-family: var(--kk-font); font-size: 15px; font-weight: 600; color: var(--kk-ink-2) !important; }
</style>
