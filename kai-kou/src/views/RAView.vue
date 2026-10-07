<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import RecordingWave from "@/components/RecordingWave.vue";
import { fetchQuestions, getQuestionById, getRandomQuestion } from "@/lib/questions";
import {
  fetchRAHistoryByQuestion,
  fetchRAQuestionPerformance,
  getRAPlaybackUrl,
  hasRAAudio
} from "@/lib/ra-history";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "RA_FALLBACK",
  content: "Please read the passage aloud.",
  difficulty: 2
};

const router = useRouter();
const route = useRoute();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useTimer();

const RA_PREP_SECONDS = 40;
const RA_RECORDING_MAX_SECONDS = 40;

const questionIndex = ref(1);
const phase = computed(() => practiceStore.phase);
const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });
const questionList = ref([]);

const wordCount = computed(() => getQuestionWordCountValue(question.value));
const estimatedDurationSeconds = computed(() => clampNumber(Math.round(wordCount.value / 2.6), 18, 45));
const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "简单";
  if (difficulty >= 3) return "困难";
  return "中等";
});
const difficultyLevelClass = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "easy";
  if (difficulty >= 3) return "hard";
  return "medium";
});
const readingRhythmHint = computed(() => {
  if (wordCount.value <= 25) return "句子较短，开口果断，结尾稍收稳。";
  if (wordCount.value <= 45) return "中等长度，按意群停顿，保持稳定语速。";
  return "句子偏长，前半句放慢，逗号处短停后再推进。";
});
const steps = [
  { label: "准备阅读" },
  { label: "开始录音" },
  { label: "提交评测" },
  { label: "查看结果" }
];
const currentStep = computed(() => {
  if (phase.value === "done") return 3;
  if (phase.value === "processing") return 2;
  if (phase.value === "recording" && hasFinalizedRecording.value) return 2;
  if (phase.value === "recording") return 1;
  return 0;
});
const questionTotal = computed(() => Math.max(questionList.value.length || 0, questionIndex.value, 1));
const currentQuestionBankIndex = computed(() => {
  const currentId = `${question.value?.id || ""}`.trim();
  if (!currentId) return -1;
  return questionList.value.findIndex((item) => `${item?.id || ""}`.trim() === currentId);
});
const currentQuestionNumber = computed(() => (
  currentQuestionBankIndex.value >= 0 ? currentQuestionBankIndex.value + 1 : questionIndex.value
));
const completedQuestionCount = computed(() => Math.max(0, Math.min(currentQuestionNumber.value - 1, questionTotal.value)));
const sessionProgressPercent = computed(() => (
  questionTotal.value ? Math.round((completedQuestionCount.value / questionTotal.value) * 100) : 0
));
const stepProgressPercent = computed(() => Math.round(((currentStep.value + 1) / steps.length) * 100));
const timerRemainingSeconds = computed(() => {
  if (phase.value === "recording" && !hasFinalizedRecording.value) return timer.remaining.value;
  if (phase.value === "preparing") return timer.remaining.value;
  return 0;
});
const timerProgressValue = computed(() => {
  if (phase.value === "recording" && !hasFinalizedRecording.value) {
    return 100 - timer.progress.value;
  }
  return timer.progress.value;
});
const statusBanner = computed(() => {
  if (phase.value === "processing" || phase.value === "done") {
    return {
      kind: "done",
      title: "正在提交 AI 评测，稍后进入结果页",
      subtitle: "评分链路保持原有 RA 后端逻辑，完成后自动跳转。",
      seconds: "AI"
    };
  }
  if (phase.value === "recording" && hasFinalizedRecording.value) {
    return {
      kind: "done",
      title: "录音已完成，可以试听后提交评测",
      subtitle: "如果声音不清楚，可以重新录音；确认后提交 AI 评分。",
      seconds: "OK"
    };
  }
  if (phase.value === "recording") {
    return {
      kind: "rec",
      title: "正在录音中，请完整朗读屏幕中的文字",
      subtitle: "保持稳定语速，最长 40 秒，时间到会自动进入提交准备。",
      seconds: timerRemainingSeconds.value
    };
  }
  return {
    kind: "prep",
    title: "请先准备，倒计时结束后自动开始录音",
    subtitle: "在准备时间内先完整阅读题目，感受整段节奏",
    seconds: timerRemainingSeconds.value
  };
});
const primaryActionLabel = computed(() => {
  if (phase.value === "preparing") return isStartingRecording.value ? "麦克风准备中..." : "立即开始录音";
  if (phase.value === "recording" && hasFinalizedRecording.value) return isSubmitting.value ? "提交中..." : "提交评测";
  if (phase.value === "recording") return canFinishRecording.value ? "结束录音" : "录音中...";
  if (phase.value === "processing" || phase.value === "done") return "评测处理中...";
  return "重新开始";
});
const primaryActionDisabled = computed(() => {
  if (questionLoading.value || isStartingRecording.value) return true;
  if (phase.value === "preparing") return false;
  if (phase.value === "recording" && hasFinalizedRecording.value) return !canSubmitEvaluation.value;
  if (phase.value === "recording") return !canFinishRecording.value;
  return phase.value === "processing" || phase.value === "done";
});
const activeTimerLabel = computed(() => {
  if (phase.value === "recording") return hasFinalizedRecording.value ? "录音状态" : "录音时间";
  if (phase.value === "processing" || phase.value === "done") return "评测状态";
  return "准备时间";
});
const currentAiTip = computed(() => {
  if (phase.value === "recording" && hasFinalizedRecording.value) return "录音完成后先试听，确认没有明显断句或空白，再提交评测。";
  if (phase.value === "recording") return "录音中优先保持稳定节奏，遇到长句用短停顿切开，不要突然加速。";
  if (phase.value === "processing" || phase.value === "done") return "本次录音已进入 AI 评分，结果页会展示发音、流利度和内容覆盖。";
  return `这题是${difficultyLabel.value}难度，${readingRhythmHint.value}`;
});
const aiCoachMessages = computed(() => [
  {
    text: `准备时先默读一遍，重点找逗号、从句和专有名词。${wordCount.value >= 55 ? "这题偏长，建议前半句放慢。" : ""}`,
    time: "实时建议"
  },
  {
    text: difficultyLevelClass.value === "hard"
      ? "困难题更看重稳定性，宁愿略慢，也不要因为抢时间而吞音。"
      : "当前题目适合练清晰度，读准元音和句尾收音更重要。",
    time: "实时建议"
  }
]);
const historyBadgeLabel = computed(() => questionPerformance.value?.hasHistory ? questionPerformance.value.levelTag : "首练");
const historyBadgeClass = computed(() => questionPerformance.value?.hasHistory ? "good" : "first");
const historyStats = computed(() => {
  if (!questionPerformance.value?.hasHistory) return [];
  return [
    { val: questionPerformance.value.bestScore, label: "最高分", tone: "brown" },
    { val: questionPerformance.value.totalAttempts, label: "练习次数", tone: "dark" },
    { val: lastScoreText.value, label: "最近一次", tone: "green" }
  ];
});
const historyMiniRecords = computed(() => (
  Array.isArray(questionHistoryRecords.value)
    ? questionHistoryRecords.value.slice(0, 4)
    : []
));

const recordingSeconds = ref(0);
const prepareStartedAtMs = ref(0);
const prepareElapsedSec = ref(0);
const hasFinalizedRecording = ref(false);
const finalizedStopResult = ref(null);
const finalizedTranscript = ref("");
const previewAudioUrl = ref("");
const previewAudioRef = ref(null);
const canFinishRecording = computed(() => (
  phase.value === "recording"
  && !hasFinalizedRecording.value
  && recordingSeconds.value >= 3
  && !recorder.isStopping.value
));
const startMeta = computed(() => getStartMeta());
const stopMeta = computed(() => recorder.lastStopMeta.value || null);
const currentRecorderAttemptId = computed(() => getCurrentRecorderAttemptId());
const currentStopMeta = computed(() => {
  const attemptId = currentRecorderAttemptId.value;
  if (isStopResultForAttempt(finalizedStopResult.value, attemptId)) return finalizedStopResult.value;
  if (isStopResultForAttempt(stopMeta.value, attemptId)) return stopMeta.value;
  return null;
});
const hasUsableStoppedAudio = computed(() => hasUsableAudioBlob(currentStopMeta.value));
const showAudioPreview = computed(() => (
  hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && Boolean(previewAudioUrl.value)
));
const showTranscriptWeakHint = computed(() => (
  hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && !canScoreWithTranscript(finalizedTranscript.value)
));
const speechOptionalNotice = computed(() => getSpeechOptionalNotice(startMeta.value));
const idleFallbackText = computed(() => startFailureMessage.value || "录音启动失败，请重试；如仍失败，请更换浏览器或设备。");
const showFatalRecorderError = computed(() => {
  if (!recorder.error.value) return false;
  if (phase.value === "processing" || phase.value === "done") return false;
  if (speechOptionalNotice.value && shouldTreatSpeechAsOptional(startMeta.value)) return false;
  return true;
});
const showStartMetaDebug = computed(() => {
  if (!import.meta.env.DEV) return false;
  return Boolean(
    startMeta.value?.startErrorCode ||
    startMeta.value?.speechReason ||
    startMeta.value?.recorderEngine ||
    startMeta.value?.webAudioFallbackTried
  );
});

const tips = [
  "句子较长时在逗号处自然停顿。",
  "专有名词建议适当放慢，确保清晰。",
  "保持稳定语速，不要因为紧张突然加快。"
];

let unmounted = false;
const isSubmitting = ref(false);
const isStartingRecording = ref(false);
let recordingTicker = null;
let submitCallCount = 0;
let lastSpeechNoticeCode = "";
let lastEngineNoticeCode = "";
const MIN_TRANSCRIPT_WORDS_FOR_SCORE = 5;
const MIN_TRANSCRIPT_CHARS_FOR_SCORE = 15;
const canSubmitEvaluation = computed(() => (
  phase.value === "recording"
  && hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && !isSubmitting.value
));
const startFailureMessage = ref("");
const showQuestionHistoryPanel = ref(false);
const questionHistoryLoading = ref(false);
const questionHistoryError = ref("");
const questionHistoryRecords = ref([]);
const questionPerformanceLoading = ref(false);
const questionPerformanceError = ref("");
const questionPerformance = ref(createEmptyQuestionPerformance());
const historyPlaybackByRecordId = reactive({});
let questionPerformanceRequestSeq = 0;
let questionHistoryRequestSeq = 0;

const practiceRecommendation = computed(() => getPracticeRecommendationCopy(questionPerformance.value));
const lastScoreText = computed(() => {
  if (!questionPerformance.value?.hasHistory) return "暂无";
  return `${Number(questionPerformance.value?.lastScore || 0)} 分`;
});
const ERROR_TEXT = {
  SPEECH_RECOGNITION_DISABLED_HUAWEI: "检测到华为设备，已自动切换到兼容录音模式；实时字幕可能不可用，但可正常录音和提交评测。",
  MIC_PERMISSION_DENIED: "麦克风权限未开启，请允许浏览器使用麦克风后重试。",
  MEDIA_UNSUPPORTED: "当前浏览器不支持录音功能，请改用 Chrome、Edge 或 Safari。",
  MEDIARECORDER_START_FAILED: "录音启动失败，请重试；如仍失败，请改用 Chrome 浏览器。",
  MEDIARECORDER_START_TIMEOUT: "当前浏览器响应录音过慢，请改用 Chrome 浏览器再试。",
  SPEECH_RECOGNITION_UNSUPPORTED: "当前浏览器不支持实时语音识别，但仍可继续录音。",
  COMPAT_RECORDING_MODE_ENABLED: "当前浏览器已自动切换到兼容录音模式。",
  RECORDER_ALL_ENGINES_FAILED: "录音启动失败，请重试；如仍失败，请更换浏览器或设备。",
  PROCESS_TIMEOUT: "录音处理超时，请重试一次。",
  INSECURE_CONTEXT: "当前页面未处于安全环境，无法使用录音功能，请使用 HTTPS 链接访问。",
  GENERIC_START_FAILED: "录音启动失败，请重试；如仍失败，请更换浏览器或设备。"
};

const SPEECH_OPTIONAL_CODES = new Set([
  "SPEECH_RECOGNITION_DISABLED_HUAWEI",
  "SPEECH_RECOGNITION_UNSUPPORTED",
  "SPEECH_RECOGNITION_INIT_FAILED",
  "SPEECH_RECOGNITION_START_FAILED",
  "SPEECH_RECOGNITION_PERMISSION_DENIED",
  "SPEECH_RECOGNITION_AUDIO_CAPTURE_FAILED",
  "SPEECH_RECOGNITION_NETWORK_ERROR",
  "SPEECH_RECOGNITION_RUNTIME_ERROR"
]);

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getElapsedMs(startAt) {
  return Math.max(0, Math.round(getNowMs() - startAt));
}

function getTranscriptWordCount(text) {
  return `${text || ""}`.trim().split(/\s+/).filter(Boolean).length;
}

function canScoreWithTranscript(text) {
  const normalized = `${text || ""}`.trim();
  return getTranscriptWordCount(normalized) >= MIN_TRANSCRIPT_WORDS_FOR_SCORE && normalized.length >= MIN_TRANSCRIPT_CHARS_FOR_SCORE;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function getQuestionWordCountValue(currentQuestion) {
  const fromQuestion = Number(currentQuestion?.word_count ?? currentQuestion?.wordCount);
  if (Number.isFinite(fromQuestion) && fromQuestion > 0) return Math.round(fromQuestion);
  return `${currentQuestion?.content || ""}`.split(/\s+/).filter(Boolean).length;
}

function createEmptyQuestionPerformance() {
  return {
    hasHistory: false,
    bestScore: 0,
    lastScore: null,
    totalAttempts: 0,
    levelTag: "待提升"
  };
}

function normalizeQuestionPerformance(payload) {
  const next = payload && typeof payload === "object" ? payload : {};
  const hasHistory = Boolean(next.hasHistory);
  const bestScore = Number.isFinite(Number(next.bestScore))
    ? clampNumber(Math.round(Number(next.bestScore)), 0, 100)
    : 0;
  const lastScore = Number.isFinite(Number(next.lastScore))
    ? clampNumber(Math.round(Number(next.lastScore)), 0, 100)
    : null;
  const totalAttempts = Number.isFinite(Number(next.totalAttempts))
    ? Math.max(0, Math.floor(Number(next.totalAttempts)))
    : 0;

  let levelTag = `${next.levelTag || ""}`.trim();
  if (!levelTag) {
    if (bestScore >= 75) levelTag = "优秀";
    else if (bestScore >= 60) levelTag = "良好";
    else levelTag = "待提升";
  }

  return {
    hasHistory,
    bestScore,
    lastScore,
    totalAttempts,
    levelTag
  };
}

function getPracticeRecommendationCopy(stats) {
  const hasHistory = Boolean(stats?.hasHistory);
  const bestScore = Number(stats?.bestScore || 0);
  const lastScore = Number(stats?.lastScore || 0);
  const totalAttempts = Number(stats?.totalAttempts || 0);

  if (!hasHistory) return "首次练习，先打基准分。";
  if (totalAttempts < 3) return "建议再刷 1-2 次看稳定性。";
  if (bestScore < 60) return "建议继续刷本题。";
  if (bestScore < 75) return "建议冲到 75+。";
  if (lastScore >= 75) return "可换新题。";
  return "建议再刷 1 次巩固。";
}

function normalizeHistoryRecordId(value) {
  const id = `${value || ""}`.trim();
  return id || "unknown";
}

function getHistoryPlaybackState(recordId) {
  const id = normalizeHistoryRecordId(recordId);
  if (!historyPlaybackByRecordId[id]) {
    historyPlaybackByRecordId[id] = {
      url: "",
      loading: false,
      error: ""
    };
  }
  return historyPlaybackByRecordId[id];
}

function clearHistoryPlaybackState() {
  for (const key of Object.keys(historyPlaybackByRecordId)) {
    delete historyPlaybackByRecordId[key];
  }
}

function resetQuestionHistoryState() {
  questionHistoryRequestSeq += 1;
  showQuestionHistoryPanel.value = false;
  questionHistoryLoading.value = false;
  questionHistoryError.value = "";
  questionHistoryRecords.value = [];
  clearHistoryPlaybackState();
}

function resetQuestionPerformanceState() {
  questionPerformanceRequestSeq += 1;
  questionPerformanceLoading.value = false;
  questionPerformanceError.value = "";
  questionPerformance.value = createEmptyQuestionPerformance();
}

function formatHistoryDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatHistoryShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

function getHistoryQuestionText(record) {
  const fromRecord = `${record?.questionContent || ""}`.trim();
  if (fromRecord) return fromRecord;
  return `${question.value?.content || ""}`.trim();
}

async function loadCurrentQuestionPerformance() {
  const currentQuestionId = `${question.value?.id || ""}`.trim();
  const requestId = ++questionPerformanceRequestSeq;
  questionPerformanceLoading.value = true;
  questionPerformanceError.value = "";
  questionPerformance.value = createEmptyQuestionPerformance();

  if (!currentQuestionId) {
    if (requestId === questionPerformanceRequestSeq) {
      questionPerformanceLoading.value = false;
    }
    return;
  }

  try {
    const payload = await fetchRAQuestionPerformance(currentQuestionId);
    if (requestId !== questionPerformanceRequestSeq) return;
    if (`${question.value?.id || ""}`.trim() !== currentQuestionId) return;
    questionPerformance.value = normalizeQuestionPerformance(payload);
    if (questionPerformance.value.hasHistory && !showQuestionHistoryPanel.value) {
      void loadCurrentQuestionHistory();
    }
  } catch (error) {
    if (requestId !== questionPerformanceRequestSeq) return;
    if (`${question.value?.id || ""}`.trim() !== currentQuestionId) return;
    console.warn("RA per-question performance load failed:", error, {
      questionId: currentQuestionId
    });
    questionPerformanceError.value = "战绩加载失败，已展示默认状态。";
    questionPerformance.value = createEmptyQuestionPerformance();
  } finally {
    if (requestId === questionPerformanceRequestSeq) {
      questionPerformanceLoading.value = false;
    }
  }
}

async function loadCurrentQuestionHistory() {
  const currentQuestionId = `${question.value?.id || ""}`.trim();
  const requestId = ++questionHistoryRequestSeq;
  if (!currentQuestionId) {
    if (requestId === questionHistoryRequestSeq) {
      questionHistoryRecords.value = [];
      questionHistoryError.value = "当前题目尚未准备好。";
      questionHistoryLoading.value = false;
    }
    return;
  }

  questionHistoryLoading.value = true;
  questionHistoryError.value = "";
  clearHistoryPlaybackState();

  try {
    const records = await fetchRAHistoryByQuestion(currentQuestionId);
    if (requestId !== questionHistoryRequestSeq) return;
    if (`${question.value?.id || ""}`.trim() !== currentQuestionId) return;
    questionHistoryRecords.value = records;
  } catch (error) {
    if (requestId !== questionHistoryRequestSeq) return;
    if (`${question.value?.id || ""}`.trim() !== currentQuestionId) return;
    console.warn("RA per-question history load failed:", error, {
      questionId: currentQuestionId
    });
    questionHistoryRecords.value = [];
    questionHistoryError.value = "历史记录加载失败，请稍后重试。";
  } finally {
    if (requestId === questionHistoryRequestSeq) {
      questionHistoryLoading.value = false;
    }
  }
}

async function toggleQuestionHistoryPanel() {
  showQuestionHistoryPanel.value = !showQuestionHistoryPanel.value;
  if (!showQuestionHistoryPanel.value) return;
  await loadCurrentQuestionHistory();
}

async function refreshQuestionHistory() {
  if (!showQuestionHistoryPanel.value) {
    showQuestionHistoryPanel.value = true;
  }
  await loadCurrentQuestionHistory();
}

async function loadHistoryPlayback(record) {
  if (!hasRAAudio(record)) return;

  const state = getHistoryPlaybackState(record?.id);
  if (state.loading) return;
  state.loading = true;
  state.error = "";
  const signedUrl = await getRAPlaybackUrl(record, 60 * 20);

  if (!signedUrl) {
    state.loading = false;
    state.error = "Failed to get recording link. Please retry.";
    return;
  }

  state.url = signedUrl;
  state.loading = false;
}

function normalizeAttemptId(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function getCurrentRecorderAttemptId() {
  return normalizeAttemptId(startMeta.value?.attemptId || recorder.currentAttemptId?.value || 0);
}

function getStopResultAttemptId(stopResult) {
  return normalizeAttemptId(stopResult?.attemptId || 0);
}

function isStopResultForAttempt(stopResult, attemptId = getCurrentRecorderAttemptId()) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  const targetAttemptId = normalizeAttemptId(attemptId);
  const resultAttemptId = getStopResultAttemptId(stopResult);
  if (!targetAttemptId || !resultAttemptId) return false;
  return targetAttemptId === resultAttemptId;
}

const INVALID_AUDIO_BLOB_ISSUES = new Set([
  "AUDIO_BLOB_EMPTY",
  "AUDIO_BLOB_TOO_SMALL",
  "AUDIO_MIME_UNSUPPORTED",
  "AUDIO_BLOB_NOT_PLAYABLE"
]);
const PLAYABLE_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg"
];

function normalizeMimeType(mimeType) {
  return `${mimeType || ""}`.trim().toLowerCase();
}

function normalizeMimeTypeBase(mimeType) {
  return normalizeMimeType(mimeType).split(";")[0].trim();
}

function isKnownPlayableMimeType(mimeType) {
  const normalizedBase = normalizeMimeTypeBase(mimeType);
  if (!normalizedBase) return false;
  return PLAYABLE_AUDIO_MIME_PREFIXES.some((prefix) => normalizedBase.startsWith(prefix));
}

function isMimeTypePlayable(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return false;

  if (typeof document !== "undefined") {
    try {
      const probe = document.createElement("audio");
      const direct = `${probe.canPlayType(normalized) || ""}`.toLowerCase();
      if (direct === "probably" || direct === "maybe") return true;

      const base = normalizeMimeTypeBase(normalized);
      const fallback = `${probe.canPlayType(base) || ""}`.toLowerCase();
      if (fallback === "probably" || fallback === "maybe") return true;
    } catch {
      // no-op
    }
  }

  return isKnownPlayableMimeType(normalized);
}

function hasUsableAudioBlob(stopResult) {
  if (!stopResult) return false;
  if (stopResult?.staleAttempt) return false;

  const blob = stopResult.blob || recorder.audioBlob.value;
  const blobSize = Number(stopResult.blobSize ?? blob?.size ?? 0);
  const hasAudio = typeof stopResult.hasAudio === "boolean" ? stopResult.hasAudio : blobSize > 0;
  const blobIssueCode = `${stopResult.blobIssueCode || ""}`;
  const mimeType = `${stopResult.mimeType || blob?.type || ""}`;
  const mimeTypePlayable = typeof stopResult.mimeTypePlayable === "boolean"
    ? stopResult.mimeTypePlayable
    : isMimeTypePlayable(mimeType);
  const previewPlayable = typeof stopResult.previewPlayable === "boolean"
    ? stopResult.previewPlayable
    : null;
  const explicitUsable = typeof stopResult.hasUsableAudio === "boolean" ? stopResult.hasUsableAudio : null;

  if (explicitUsable !== null) {
    return Boolean(explicitUsable && blob && blobSize > 0);
  }

  return Boolean(
    blob
    && hasAudio
    && blobSize > 0
    && !INVALID_AUDIO_BLOB_ISSUES.has(blobIssueCode)
    && mimeTypePlayable
    && (previewPlayable === null || previewPlayable)
  );
}

function isNotPlayableAudioBlob(stopResult) {
  if (!stopResult) return false;
  const blob = stopResult.blob || recorder.audioBlob.value;
  const blobSize = Number(stopResult.blobSize ?? blob?.size ?? 0);
  if (blobSize <= 0) return false;
  if (`${stopResult.blobIssueCode || ""}` === "AUDIO_BLOB_NOT_PLAYABLE") return true;
  if (typeof stopResult.previewPlayable === "boolean") return !stopResult.previewPlayable;
  return false;
}

function getInvalidAudioMessage(stopResult) {
  if (isNotPlayableAudioBlob(stopResult)) {
    return "当前录音文件不可播放，请重试一次；如仍失败，请更换浏览器或设备。";
  }
  if (stopResult?.blobTooLarge || `${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_TOO_LARGE") {
    return "录音时长过长，请缩短后重试。";
  }
  if (`${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_EMPTY" || `${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_TOO_SMALL") {
    return "未检测到有效录音，请重试一次。";
  }
  return "录音文件生成失败，请重试一次。";
}

function pausePreviewAudio() {
  if (!previewAudioRef.value) return;
  try {
    previewAudioRef.value.pause();
    previewAudioRef.value.currentTime = 0;
  } catch {
    // no-op
  }
}

function revokePreviewAudioUrl() {
  if (!previewAudioUrl.value) return;
  try {
    URL.revokeObjectURL(previewAudioUrl.value);
  } catch {
    // no-op
  }
  previewAudioUrl.value = "";
}

function clearFinalizedRecordingState() {
  hasFinalizedRecording.value = false;
  finalizedStopResult.value = null;
  finalizedTranscript.value = "";
  pausePreviewAudio();
  revokePreviewAudioUrl();
}

function clearAttemptScopedUIState() {
  clearFinalizedRecordingState();
  prepareStartedAtMs.value = 0;
  prepareElapsedSec.value = 0;
  startFailureMessage.value = "";
  if (recorder?.error?.value) {
    recorder.error.value = null;
  }
  uiStore.clearToast();
}

watch(
  () => finalizedStopResult.value,
  async (nextStopResult) => {
    pausePreviewAudio();
    revokePreviewAudioUrl();

    const expectedAttemptId = currentRecorderAttemptId.value;
    if (!isStopResultForAttempt(nextStopResult, expectedAttemptId)) return;
    if (!hasUsableAudioBlob(nextStopResult)) return;
    const blob = nextStopResult?.blob || recorder.audioBlob.value;
    if (!blob || blob.size <= 0) return;

    const objectUrl = URL.createObjectURL(blob);
    previewAudioUrl.value = objectUrl;

    await nextTick();
    if (previewAudioUrl.value !== objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // no-op
      }
      return;
    }

    if (!isStopResultForAttempt(finalizedStopResult.value, expectedAttemptId)) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // no-op
      }
      previewAudioUrl.value = "";
      return;
    }

    const previewAudio = previewAudioRef.value;
    if (!previewAudio) return;

    try {
      previewAudio.src = objectUrl;
      previewAudio.load();
    } catch {
      // no-op
    }
  }
);

watch(
  () => `${question.value?.id || ""}`.trim(),
  (nextQuestionId, prevQuestionId) => {
    if (nextQuestionId === prevQuestionId) return;
    const reopenPanel = showQuestionHistoryPanel.value;
    resetQuestionHistoryState();
    resetQuestionPerformanceState();
    void loadCurrentQuestionPerformance();
    if (reopenPanel) {
      showQuestionHistoryPanel.value = true;
      void loadCurrentQuestionHistory();
    }
  }
);

function getStartMeta() {
  return recorder.lastStartMeta.value || null;
}

function getStartFailureText(meta) {
  if (!meta) return recorder.error.value || ERROR_TEXT.GENERIC_START_FAILED;

  if (meta.startErrorCode === "INSECURE_CONTEXT") {
    return ERROR_TEXT.INSECURE_CONTEXT;
  }

  if (meta.startErrorCode === "MIC_PERMISSION_DENIED") {
    return ERROR_TEXT.MIC_PERMISSION_DENIED;
  }

  if (meta.startErrorCode === "MIC_NOT_FOUND") {
    return "未检测到可用麦克风，请连接麦克风后重试。";
  }

  if (meta.startErrorCode === "MEDIA_UNSUPPORTED") {
    return ERROR_TEXT.MEDIA_UNSUPPORTED;
  }

  if (meta.startErrorCode === "MEDIARECORDER_START_FAILED") {
    return ERROR_TEXT.MEDIARECORDER_START_FAILED;
  }

  if (meta.startErrorCode === "MEDIARECORDER_START_TIMEOUT") {
    return ERROR_TEXT.MEDIARECORDER_START_TIMEOUT;
  }

  if (meta.startErrorCode === "MEDIA_INIT_FAILED") {
    return ERROR_TEXT.MEDIARECORDER_START_FAILED;
  }

  if (meta.startErrorCode === "RECORDER_ALL_ENGINES_FAILED") {
    return ERROR_TEXT.RECORDER_ALL_ENGINES_FAILED;
  }

  if (meta.secureContext === false) {
    return ERROR_TEXT.INSECURE_CONTEXT;
  }

  return recorder.error.value || ERROR_TEXT.GENERIC_START_FAILED;
}

function getSpeechOptionalNotice(meta) {
  if (!meta) return "";
  const speechCode = `${meta.speechReason || ""}`;
  if (!SPEECH_OPTIONAL_CODES.has(speechCode)) return "";

  if (speechCode === "SPEECH_RECOGNITION_DISABLED_HUAWEI") {
    return ERROR_TEXT.SPEECH_RECOGNITION_DISABLED_HUAWEI;
  }

  if (speechCode === "SPEECH_RECOGNITION_UNSUPPORTED") {
    return ERROR_TEXT.SPEECH_RECOGNITION_UNSUPPORTED;
  }

  if (speechCode === "SPEECH_RECOGNITION_PERMISSION_DENIED") {
    return "实时语音识别权限未开启，但仍可继续录音。";
  }

  if (speechCode === "SPEECH_RECOGNITION_NETWORK_ERROR") {
    return "实时语音识别网络不稳定，但仍可继续录音。";
  }

  return "当前浏览器不支持实时语音识别，但仍可继续录音。";
}

function shouldTreatSpeechAsOptional(meta) {
  if (!meta) return false;
  const speechCode = `${meta.speechReason || ""}`;
  if (speechCode === "SPEECH_RECOGNITION_DISABLED_HUAWEI") return true;
  if (SPEECH_OPTIONAL_CODES.has(speechCode)) return true;
  return !meta.speechEnabled && !meta.startErrorCode;
}

function startRecordingTicker() {
  stopRecordingTicker();
  recordingSeconds.value = 0;
  recordingTicker = setInterval(() => {
    recordingSeconds.value += 1;
  }, 1000);
}

function stopRecordingTicker() {
  clearInterval(recordingTicker);
  recordingTicker = null;
  recordingSeconds.value = 0;
}

function resetToRetryableState(message) {
  timer.stop();
  stopRecordingTicker();
  lastSpeechNoticeCode = "";
  lastEngineNoticeCode = "";
  clearAttemptScopedUIState();
  startFailureMessage.value = message || ERROR_TEXT.GENERIC_START_FAILED;
  practiceStore.setPhase("idle");
}

function syncQuestionToStore() {
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || defaultQuestion.id,
    taskType: "RA",
    content: question.value?.content || defaultQuestion.content
  });
}

function stepClass(index) {
  if (index < currentStep.value) return "done";
  if (index === currentStep.value) return "act";
  return "wait";
}

function goBackToRAHome() {
  router.push("/ra");
}

function goAgent() {
  router.push("/agent");
}

function goQuestionBank() {
  router.push("/ra/list");
}

function showHistoryFromCard() {
  if (showQuestionHistoryPanel.value) return;
  void toggleQuestionHistoryPanel();
}

async function handlePrimaryAction() {
  if (phase.value === "preparing") {
    await startRecordingNow();
    return;
  }

  if (phase.value === "recording") {
    await handleSubmit();
    return;
  }

  if (phase.value === "idle") {
    startPreparing();
  }
}

async function switchQuestionByOffset(offset) {
  if (questionLoading.value || phase.value === "processing") return;

  const list = await ensureQuestionList();
  if (!Array.isArray(list) || !list.length) {
    await skipQuestion();
    return;
  }

  const currentIndex = getQuestionListIndex();
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (baseIndex + offset + list.length) % list.length;
  await switchToQuestion(list[nextIndex] || null, nextIndex + 1);
}

async function randomQuestion() {
  if (questionLoading.value || phase.value === "processing") return;
  await ensureQuestionList();
  const picked = await getRandomQuestion("RA");
  const nextIndex = picked?.id
    ? questionList.value.findIndex((item) => `${item?.id || ""}`.trim() === `${picked.id || ""}`.trim())
    : -1;
  await switchToQuestion(picked, nextIndex >= 0 ? nextIndex + 1 : questionIndex.value + 1);
}

async function switchToQuestion(nextQuestion, nextIndex = questionIndex.value + 1) {
  if (!nextQuestion) {
    await skipQuestion();
    return;
  }

  timer.stop();
  stopRecordingTicker();
  if (recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value) {
    const stopAttemptId = currentRecorderAttemptId.value;
    await recorder.stopRecorderAndGetBlob({
      reason: "switch_question",
      attemptId: stopAttemptId
    });
  }
  clearAttemptScopedUIState();

  question.value = nextQuestion;
  questionIndex.value = Math.max(1, Number(nextIndex || 1));
  syncQuestionToStore();
  startPreparing();
}

async function loadQuestion({ incrementIndex = false, respectRouteQuery = true } = {}) {
  questionLoading.value = true;

  try {
    await ensureQuestionList();
    const picked = (respectRouteQuery ? await resolveQuestionFromRouteQuery() : null)
      || await getRandomQuestion("RA");
    question.value = picked || { ...defaultQuestion };
    syncQuestionToStore();

    if (incrementIndex) {
      questionIndex.value += 1;
    }
  } finally {
    questionLoading.value = false;
  }
}

async function ensureQuestionList() {
  if (questionList.value.length) return questionList.value;
  const list = await fetchQuestions("RA");
  questionList.value = Array.isArray(list) ? list : [];
  return questionList.value;
}

function getQuestionListIndex() {
  const currentId = `${question.value?.id || ""}`.trim();
  const list = questionList.value;
  if (!currentId || !Array.isArray(list) || !list.length) return -1;
  return list.findIndex((item) => `${item?.id || ""}`.trim() === currentId);
}

async function resolveQuestionFromRouteQuery() {
  const questionId = normalizeRouteQueryValue(route.query.questionId);
  if (questionId) {
    const picked = await getQuestionById("RA", questionId);
    if (picked) return picked;
  }

  const difficulty = normalizeDifficultyQuery(route.query.difficulty);
  if (!difficulty) return null;

  const questions = await fetchQuestions("RA");
  const pool = (Array.isArray(questions) ? questions : [])
    .filter((item) => getQuestionDifficultyLevel(item) === difficulty);

  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function normalizeRouteQueryValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return `${raw || ""}`.trim();
}

function normalizeDifficultyQuery(value) {
  const normalized = normalizeRouteQueryValue(value).toLowerCase();
  if (normalized === "easy" || normalized === "1") return 1;
  if (normalized === "medium" || normalized === "2") return 2;
  if (normalized === "hard" || normalized === "3") return 3;
  return 0;
}

function getQuestionDifficultyLevel(item) {
  const level = Number(item?.difficulty || 2);
  if (!Number.isFinite(level)) return 2;
  if (level <= 1) return 1;
  if (level >= 3) return 3;
  return 2;
}

function startPreparing() {
  isSubmitting.value = false;
  clearAttemptScopedUIState();
  prepareStartedAtMs.value = getNowMs();
  practiceStore.setPhase("preparing");
  timer.start(RA_PREP_SECONDS, startRecording);
}

async function startRecording() {
  if (isStartingRecording.value || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording.value = true;

  try {
    if (phase.value === "preparing") {
      const elapsedPrepareMs = prepareStartedAtMs.value
        ? Math.max(0, getNowMs() - Number(prepareStartedAtMs.value || 0))
        : 0;
      prepareElapsedSec.value = Math.min(RA_PREP_SECONDS, Math.max(0, Math.round(elapsedPrepareMs / 1000)));
    }
    if (phase.value === "preparing") {
      timer.stop();
    }
    clearAttemptScopedUIState();
    practiceStore.setPhase("recording");
    const started = await recorder.startRecording({
      allowWithoutSpeechRecognition: true
    });
    const currentStartMeta = getStartMeta();

    if (!started) {
      const fatalMessage = getStartFailureText(currentStartMeta);
      resetToRetryableState(fatalMessage);
      logRAChain("start_failed", {
        startErrorCode: currentStartMeta?.startErrorCode || "",
        platformStrategy: currentStartMeta?.platformStrategy || "",
        isAndroidLike: Boolean(currentStartMeta?.isAndroidLike),
        isIOSSafari: Boolean(currentStartMeta?.isIOSSafari),
        recorderEngine: currentStartMeta?.recorderEngine || "",
        webAudioFallbackTried: Boolean(currentStartMeta?.webAudioFallbackTried),
        webAudioFallbackOk: Boolean(currentStartMeta?.webAudioFallbackOk),
        speechReason: currentStartMeta?.speechReason || "",
        hasMediaRecorder: Boolean(currentStartMeta?.hasMediaRecorder),
        hasGetUserMedia: Boolean(currentStartMeta?.hasGetUserMedia),
        secureContext: currentStartMeta?.secureContext !== false
      });
      uiStore.showToast(fatalMessage, "warning");
      return;
    }

    const speechNotice = getSpeechOptionalNotice(currentStartMeta);
    if (speechNotice) {
      const noticeCode = `${currentStartMeta?.speechReason || ""}`;
      if (noticeCode && noticeCode !== lastSpeechNoticeCode) {
        uiStore.showToast(speechNotice, "info", 3600);
        lastSpeechNoticeCode = noticeCode;
      }
      logRAChain("start_degraded", {
        speechReason: noticeCode,
        selectedMimeType: currentStartMeta?.selectedMimeType || ""
      });
    } else {
      lastSpeechNoticeCode = "";
      logRAChain("start_ok", {
        platformStrategy: currentStartMeta?.platformStrategy || "",
        selectedMimeType: currentStartMeta?.selectedMimeType || "",
        recorderEngine: currentStartMeta?.recorderEngine || ""
      });
    }

    const compatibilityNotice = Boolean(currentStartMeta?.isAndroidLike)
      && currentStartMeta?.recorderEngine === "web_audio_wav"
      && currentStartMeta?.webAudioFallbackOk
      ? ERROR_TEXT.COMPAT_RECORDING_MODE_ENABLED
      : "";
    if (compatibilityNotice) {
      const engineNoticeCode = `${currentStartMeta?.recorderEngine || ""}_${currentStartMeta?.webAudioFallbackOk ? "ok" : "no"}`;
      if (engineNoticeCode && engineNoticeCode !== lastEngineNoticeCode) {
        uiStore.showToast(compatibilityNotice, "info", 3600);
        lastEngineNoticeCode = engineNoticeCode;
      }
      logRAChain("start_engine_fallback_ok", {
        recorderEngine: currentStartMeta?.recorderEngine || "",
        webAudioFallbackTried: Boolean(currentStartMeta?.webAudioFallbackTried),
        webAudioFallbackOk: Boolean(currentStartMeta?.webAudioFallbackOk)
      });
    } else {
      lastEngineNoticeCode = "";
    }

    hasFinalizedRecording.value = false;
    finalizedStopResult.value = null;
    finalizedTranscript.value = "";
    submitCallCount = 0;
    startRecordingTicker();
    timer.start(RA_RECORDING_MAX_SECONDS, handleSubmit);
  } catch (err) {
    const fallbackMessage = ERROR_TEXT.GENERIC_START_FAILED;
    resetToRetryableState(fallbackMessage);
    logRAChain("start_exception", {
      error: err?.message || "start_exception"
    });
    uiStore.showToast(fallbackMessage, "warning");
  } finally {
    isStartingRecording.value = false;
  }
}

async function finalizeRecordingForReview(options = {}) {
  if (questionLoading.value) return false;
  if (isSubmitting.value || hasFinalizedRecording.value || phase.value !== "recording") return false;
  isSubmitting.value = true;
  submitCallCount += 1;

  try {
    stopRecordingTicker();
    timer.stop();
    const stopStartedAt = getNowMs();
    const stopAttemptId = currentRecorderAttemptId.value;
    const stopResult = await recorder.stopRecorderAndGetBlob({
      reason: options.reason || "submit",
      attemptId: stopAttemptId
    });
    if (!isStopResultForAttempt(stopResult, stopAttemptId)) {
      logRAChain("stop_stale_ignored", {
        expectedAttemptId: stopAttemptId,
        resultAttemptId: getStopResultAttemptId(stopResult),
        stopErrorCode: `${stopResult?.stopErrorCode || ""}`
      });
      return false;
    }
    const stopRecorderMs = Number(stopResult?.stopRecorderMs ?? getElapsedMs(stopStartedAt));
    const recognitionStopMs = Number(stopResult?.recognitionStopMs || 0);
    const mediaStopMs = Number(stopResult?.mediaStopMs || 0);
    const blobSize = Number(stopResult?.blobSize || 0);
    const mimeType = `${stopResult?.mimeType || ""}`;
    const blobIssueCode = `${stopResult?.blobIssueCode || ""}`;
    debugSubmit("stop_result", stopResult);
    logRAChain("stop_done", {
      stopRecorderMs,
      recognitionStopMs,
      mediaStopMs,
      blobSize,
      mimeType,
      blobIssueCode
    });

    const transcript = `${stopResult?.transcript || recorder.transcript.value || ""}`.trim();
    const stopDecision = shouldRetryWithToast(stopResult, transcript, stopAttemptId);
    if (stopDecision.shouldRetry) {
      logRAChain("stop_retry", {
        stopErrorCode: stopDecision.errorCode || getStopErrorCode(stopResult)
      });
      clearAttemptScopedUIState();
      practiceStore.setPhase("idle");
      if (!unmounted) {
        await restartRecording();
      }
      return false;
    }

    if (stopDecision.warningCode) {
      logRAChain("stop_continue_with_warning", {
        warningCode: stopDecision.warningCode
      });
    }

    finalizedStopResult.value = stopResult;
    finalizedTranscript.value = transcript;
    hasFinalizedRecording.value = true;
    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(stopResult?.blob || recorder.audioBlob.value || null);
    return true;
  } finally {
    isSubmitting.value = false;
  }
}

async function submitEvaluation() {
  if (questionLoading.value) return;
  if (phase.value !== "recording" || !hasFinalizedRecording.value || isSubmitting.value) return;
  if (!hasUsableAudioBlob(finalizedStopResult.value)) {
    uiStore.showToast(getInvalidAudioMessage(finalizedStopResult.value), "warning");
    if (!unmounted) {
      await restartRecording();
    }
    return;
  }

  isSubmitting.value = true;
  const submitStartedAt = getNowMs();

  try {
    practiceStore.setPhase("processing");
    const transcript = `${finalizedTranscript.value || recorder.transcript.value || ""}`.trim();
    const finalBlob = finalizedStopResult.value?.blob || recorder.audioBlob.value || null;
    const recordFromPlayable = Number(finalizedStopResult.value?.playableDurationSec || 0);
    const recordFromDurationMs = Number(finalizedStopResult.value?.durationMs || 0);
    const recordSec = Number.isFinite(recordFromPlayable) && recordFromPlayable > 0
      ? Math.max(0, Math.round(recordFromPlayable))
      : Number.isFinite(recordFromDurationMs) && recordFromDurationMs > 0
        ? Math.max(0, Math.round(recordFromDurationMs / 1000))
        : Math.max(0, Math.round(Number(recordingSeconds.value || 0)));
    const analyticsSource = (
      (Number.isFinite(recordFromPlayable) && recordFromPlayable > 0)
      || (Number.isFinite(recordFromDurationMs) && recordFromDurationMs > 0)
    )
      ? "computed_client_flow"
      : "fallback_existing_duration";
    const normalizedPrepareSec = Math.max(0, Math.round(Number(prepareElapsedSec.value || 0)));
    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(finalBlob);

    const scoreStartedAt = getNowMs();
    const scoreResult = await practiceStore.submitScore(
      "RA",
      transcript,
      question.value?.content || "",
      question.value?.id || "unknown",
      {
        logAnalytics: {
          source: analyticsSource,
          totalActiveSec: normalizedPrepareSec + recordSec,
          breakdown: {
            prepare_sec: normalizedPrepareSec,
            record_sec: recordSec,
            speech_sec: recordSec,
            total_sec: normalizedPrepareSec + recordSec
          }
        }
      }
    );
    const scoreApiMs = Number(scoreResult?.meta?.scoreApiMs ?? getElapsedMs(scoreStartedAt));
    const scoreErrorCode = `${scoreResult?.meta?.scoreErrorCode || ""}`;
    logRAChain("score_done", {
      scoreApiMs,
      scoreErrorCode,
      submitTotalMs: getElapsedMs(submitStartedAt)
    });

    if (scoreResult?.error) {
      uiStore.showToast("评分服务暂时不可用，请稍后重试。", "warning");
      practiceStore.setPhase("idle");
      return;
    }

    if (scoreErrorCode === "SCORE_API_TIMEOUT") {
      uiStore.showToast("评分服务超时，请稍后重试。", "warning");
    }

    if (!unmounted && practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
      router.push("/ra/result");
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSubmit() {
  if (questionLoading.value || phase.value !== "recording") return;
  if (hasFinalizedRecording.value) {
    await submitEvaluation();
    return;
  }

  await finalizeRecordingForReview({ reason: "submit" });
}

async function skipQuestion() {
  if (questionLoading.value || phase.value === "processing") return;

  timer.stop();
  stopRecordingTicker();
  if (recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value) {
    const stopAttemptId = currentRecorderAttemptId.value;
    await recorder.stopRecorderAndGetBlob({
      reason: "skip",
      attemptId: stopAttemptId
    });
  }
  clearAttemptScopedUIState();

  await loadQuestion({ incrementIndex: true, respectRouteQuery: false });
  startPreparing();
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }

  if (practiceStore.selectedQuestion) {
    question.value = {
      ...defaultQuestion,
      ...(practiceStore.selectedQuestion || {})
    };
    syncQuestionToStore();
    practiceStore.clearSelectedQuestion();
    questionLoading.value = false;
  } else {
    await loadQuestion();
  }

  startPreparing();
});

onUnmounted(() => {
  unmounted = true;
  stopRecordingTicker();
  timer.stop();
  clearFinalizedRecordingState();
  recorder.stopRecording();
});

function debugSubmit(event, payload) {
  if (!import.meta.env.DEV) return;
  console.info(`[ra-submit:${submitCallCount}] ${event}`, payload);
}

function logRAChain(event, payload = {}) {
  console.info(`[ra-chain:${submitCallCount}] ${event}`, payload);
}

function getStopErrorCode(stopResult) {
  if (stopResult?.blobTooLarge) return "AUDIO_BLOB_TOO_LARGE";
  if (stopResult?.recorderStopTimedOut) return "RECORDER_STOP_TIMEOUT";
  if (stopResult?.recognitionStopTimedOut) return "RECOGNITION_STOP_TIMEOUT";
  if (stopResult?.blobIssueCode) return stopResult.blobIssueCode;
  if (!stopResult?.hasAudio) return "AUDIO_BLOB_EMPTY";
  return "";
}

function shouldRetryWithToast(stopResult, transcript, expectedAttemptId = getCurrentRecorderAttemptId()) {
  if (!isStopResultForAttempt(stopResult, expectedAttemptId)) {
    return { shouldRetry: false, errorCode: "ATTEMPT_STALE_IGNORED", warningCode: "" };
  }
  const hasUsableAudio = hasUsableAudioBlob(stopResult);

  if (stopResult?.blobTooLarge) {
    uiStore.showToast("录音时长过长，请缩短后重试。", "warning");
    return { shouldRetry: true, errorCode: "AUDIO_BLOB_TOO_LARGE", warningCode: "" };
  }

  if (stopResult?.recorderStopTimedOut) {
    if (hasUsableAudio) {
      return { shouldRetry: false, errorCode: "", warningCode: "RECORDER_STOP_TIMEOUT" };
    }
    uiStore.showToast(ERROR_TEXT.PROCESS_TIMEOUT, "warning");
    return { shouldRetry: true, errorCode: "RECORDER_STOP_TIMEOUT", warningCode: "" };
  }

  if (stopResult?.recognitionStopTimedOut) {
    if (hasUsableAudio) {
      return { shouldRetry: false, errorCode: "", warningCode: "RECOGNITION_STOP_TIMEOUT" };
    }
    uiStore.showToast(ERROR_TEXT.PROCESS_TIMEOUT, "warning");
    return { shouldRetry: true, errorCode: "RECOGNITION_STOP_TIMEOUT", warningCode: "" };
  }

  if (!hasUsableAudio) {
    uiStore.showToast(getInvalidAudioMessage(stopResult), "warning");
    return { shouldRetry: true, errorCode: "AUDIO_BLOB_INVALID", warningCode: "" };
  }

  if (!transcript || transcript.length < 3) {
    uiStore.showToast("已检测到有效录音，将继续提交评测。", "info", 2800);
    return { shouldRetry: false, errorCode: "", warningCode: "TRANSCRIPT_TOO_SHORT_WITH_AUDIO" };
  }

  if (stopResult?.blobIssueCode === "AUDIO_MIME_UNSUPPORTED") {
    return { shouldRetry: false, errorCode: "", warningCode: "AUDIO_MIME_UNSUPPORTED" };
  }

  return { shouldRetry: false, errorCode: "", warningCode: "" };
}

async function restartRecording() {
  if (questionLoading.value || isStartingRecording.value || phase.value === "processing") return;
  stopRecordingTicker();
  timer.stop();
  clearAttemptScopedUIState();
  if (recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value) {
    const stopAttemptId = currentRecorderAttemptId.value;
    await recorder.stopRecorderAndGetBlob({
      reason: "restart",
      attemptId: stopAttemptId
    });
  }
  clearAttemptScopedUIState();
  practiceStore.setPhase("idle");
  await startRecording();
}

function playPreviewAudio() {
  if (!showAudioPreview.value || !previewAudioRef.value) return;

  try {
    previewAudioRef.value.currentTime = 0;
    const playback = previewAudioRef.value.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        // no-op
      });
    }
  } catch {
    // no-op
  }
}

async function startRecordingNow() {
  if (questionLoading.value || phase.value !== "preparing") return;
  await startRecording();
}
</script>

<template>
  <div class="ra-practice-shell" data-testid="ra-practice-page">
    <header class="ra-topbar">
      <button class="tb-back" type="button" data-testid="ra-back" @click="goBackToRAHome">
        <span class="tb-arr">‹</span>
        <span>朗读题 · RA</span>
      </button>
      <div class="tb-title">RA 朗读练习</div>
      <div class="tb-right">
        <div class="vip-pill"><span class="vip-dot"></span> VIP · 无限练习</div>
        <button class="exit-btn" type="button" @click="goBackToRAHome">退出</button>
      </div>
    </header>

    <div class="step-bar" data-testid="ra-stepper">
      <div v-for="(step, i) in steps" :key="step.label" class="step-wrap">
        <div class="step-item">
          <div class="step-num" :class="stepClass(i)">
            <span v-if="currentStep > i">✓</span>
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="step-label" :class="stepClass(i)">{{ step.label }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="step-sep"></div>
      </div>
      <div class="step-q-info">第 {{ currentQuestionNumber }} 题 / 共 {{ questionTotal }} 题</div>
    </div>

    <div class="practice-body">
      <aside class="left-col">
        <section class="side-card">
          <div class="card-hd"><span class="card-mark">◈</span> 题目信息</div>
          <div class="card-body info-body">
            <div class="info-row"><span>题号</span><strong>{{ question.id || "RA" }}</strong></div>
            <div class="info-row">
              <span>难度</span>
              <span class="diff-badge" :class="difficultyLevelClass">{{ difficultyLabel }}</span>
            </div>
            <div class="info-row"><span>词数</span><strong>{{ wordCount }} 词</strong></div>
            <div class="info-row"><span>预计用时</span><strong>约 {{ estimatedDurationSeconds }} 秒</strong></div>
            <div class="info-row"><span>准备时间</span><strong>{{ RA_PREP_SECONDS }} 秒</strong></div>
            <div class="info-row"><span>录音时长</span><strong>最长 {{ RA_RECORDING_MAX_SECONDS }} 秒</strong></div>
            <div class="rhythm-note">📖 阅读节奏：{{ readingRhythmHint }}</div>
          </div>
        </section>

        <section class="side-card">
          <div class="card-hd"><span class="card-mark">✦</span> 朗读提示</div>
          <div class="card-body tip-list">
            <div v-for="tip in tips" :key="tip" class="tip-item">
              <span class="tip-dot"></span>
              <span>{{ tip }}</span>
            </div>
          </div>
        </section>

        <section class="side-card">
          <div class="card-hd">
            <span class="card-mark">◎</span> 我的战绩
            <span class="hist-badge" :class="historyBadgeClass">{{ historyBadgeLabel }}</span>
          </div>
          <div class="card-body">
            <div v-if="questionPerformanceLoading" class="mini-loading">战绩加载中...</div>
            <template v-else-if="questionPerformance.hasHistory">
              <div class="hist-stat-row">
                <div v-for="item in historyStats" :key="item.label" class="hist-stat">
                  <div class="hist-val" :class="`tone-${item.tone}`">{{ item.val }}</div>
                  <div class="hist-label">{{ item.label }}</div>
                </div>
              </div>
              <div class="hist-mini">
                <div v-for="record in historyMiniRecords" :key="record.id" class="hist-mini-row">
                  <span>{{ formatHistoryShortDate(record.createdAt) }}</span>
                  <div class="hist-bar"><i :style="{ width: `${Math.max(8, Math.min(100, Number(record.overall || 0) / 90 * 100))}%` }"></i></div>
                  <strong>{{ Number(record.overall || 0) }}</strong>
                </div>
              </div>
              <button class="inline-history-btn" type="button" data-testid="ra-history-button" @click="showHistoryFromCard">查看本题历史</button>
            </template>
            <template v-else>
              <div class="hist-empty">暂无历史战绩<br>首次练习，先打基准分。</div>
              <div class="ai-rec-note">AI 建议：{{ practiceRecommendation }}</div>
            </template>
            <p v-if="questionPerformanceError" class="small-warning">{{ questionPerformanceError }}</p>
          </div>
        </section>
      </aside>

      <main class="main-col">
        <div v-if="questionLoading" class="loading-card">
          <div class="loading-dot"></div>
          <p>题目加载中...</p>
        </div>

        <template v-else>
          <section class="status-banner" :class="`status-banner--${statusBanner.kind}`" data-testid="ra-status-banner">
            <div class="sb-text">
              <div class="sb-title">{{ statusBanner.title }}</div>
              <div class="sb-sub">{{ statusBanner.subtitle }}</div>
            </div>
            <div class="countdown-wrap">
              <div class="countdown-num">{{ statusBanner.seconds }}</div>
              <div class="countdown-lbl">{{ statusBanner.kind === "done" ? "STATUS" : "SECONDS" }}</div>
            </div>
          </section>

          <section class="timer-card">
            <div class="timer-row">
              <span class="timer-label">{{ activeTimerLabel }}</span>
              <div class="timer-track">
                <div class="timer-fill" :class="`timer-fill--${statusBanner.kind}`" :style="{ width: `${Math.max(0, Math.min(100, timerProgressValue))}%` }"></div>
              </div>
              <span class="timer-val">{{ phase === "recording" && hasFinalizedRecording ? "完成" : `${timerRemainingSeconds}s` }}</span>
              <button class="timer-skip" type="button" data-testid="ra-skip" @click="skipQuestion">跳过这题 →</button>
            </div>

            <button
              class="primary-action"
              type="button"
              data-testid="ra-primary-action"
              :disabled="primaryActionDisabled"
              @click="handlePrimaryAction"
            >
              🎙 {{ primaryActionLabel }}
            </button>
          </section>

          <section v-if="phase === 'recording'" class="recording-card" data-testid="ra-recording-card">
            <div class="record-state">
              <span v-if="hasFinalizedRecording && hasUsableStoppedAudio" class="state-dot state-dot--done"></span>
              <span v-else-if="hasFinalizedRecording" class="state-dot state-dot--warn"></span>
              <span v-else class="state-dot state-dot--recording"></span>
              <strong>{{ hasFinalizedRecording ? (hasUsableStoppedAudio ? "录音已完成" : "录音需要重试") : (recorder.isReady.value ? "请开始朗读" : "麦克风准备中...") }}</strong>
            </div>
            <RecordingWave v-if="!hasFinalizedRecording" :is-recording="Boolean(recorder.isRecording.value)" />
            <div v-if="showAudioPreview" class="audio-preview">
              <button class="play-preview" type="button" data-testid="ra-preview" @click="playPreviewAudio">▶</button>
              <audio ref="previewAudioRef" :src="previewAudioUrl" controls preload="metadata" />
            </div>
            <p v-if="showTranscriptWeakHint" class="rec-valid-note">已检测到有效录音，将继续提交评测。</p>
            <p v-if="hasFinalizedRecording && !hasUsableStoppedAudio" class="small-warning">当前录音文件不可播放，请重试一次；如仍失败，请更换浏览器或设备。</p>
            <div class="record-actions">
              <button class="ghost-action" type="button" data-testid="ra-restart" @click="restartRecording">重新录音</button>
              <button
                class="submit-action"
                type="button"
                data-testid="ra-submit"
                :disabled="hasFinalizedRecording ? !canSubmitEvaluation : !canFinishRecording"
                @click="handleSubmit"
              >
                {{ hasFinalizedRecording ? (isSubmitting ? "提交中..." : "提交评测") : (canFinishRecording ? "结束录音" : "录音中...") }}
              </button>
            </div>
          </section>

          <section v-else-if="phase === 'processing' || phase === 'done'" class="processing-card">
            <div class="loading-dot"></div>
            <p>{{ phase === "done" ? "评测完成，正在进入结果页..." : "正在提交 AI 评测，请稍候..." }}</p>
          </section>

          <section class="article-card" data-testid="ra-question-card">
            <div class="article-meta">
              <span>READ ALOUD</span>
              <span>{{ wordCount }} 词 · 约 {{ estimatedDurationSeconds }} 秒</span>
            </div>
            <p class="article-text">{{ question.content }}</p>
          </section>

          <section class="history-card" :class="{ 'history-card--open': showQuestionHistoryPanel }">
            <div class="history-head">
              <div class="history-title">📋 本题历史练习记录</div>
              <button class="history-toggle" type="button" data-testid="ra-history-toggle" @click="toggleQuestionHistoryPanel">
                {{ showQuestionHistoryPanel ? "收起历史" : "查看历史" }}
              </button>
            </div>

            <div v-if="showQuestionHistoryPanel" class="history-panel">
              <div class="history-tools">
                <span>最近最多 10 条真实 practice_logs</span>
                <button type="button" @click="refreshQuestionHistory">刷新</button>
              </div>
              <p v-if="questionHistoryLoading" class="muted-line">历史记录加载中...</p>
              <p v-else-if="questionHistoryError" class="small-warning">{{ questionHistoryError }}</p>
              <p v-else-if="!questionHistoryRecords.length" class="muted-line">这道题暂无历史记录。</p>
              <div v-else class="history-list">
                <article v-for="record in questionHistoryRecords" :key="record.id" class="history-log">
                  <div>
                    <div class="history-log-top">
                      <strong>{{ formatHistoryDateTime(record.createdAt) }}</strong>
                      <span>Overall {{ Number(record.overall || 0) }}</span>
                    </div>
                    <p>{{ getHistoryQuestionText(record) || "暂无题目快照" }}</p>
                    <div class="score-mini">
                      <span>P {{ Number(record.scores?.pronunciation || 0) }}</span>
                      <span>F {{ Number(record.scores?.fluency || 0) }}</span>
                      <span>C {{ Number(record.scores?.content || 0) }}</span>
                    </div>
                    <audio v-if="getHistoryPlaybackState(record.id).url" :src="getHistoryPlaybackState(record.id).url" controls preload="metadata"></audio>
                  </div>
                  <button
                    v-if="hasRAAudio(record)"
                    type="button"
                    :disabled="getHistoryPlaybackState(record.id).loading"
                    @click="loadHistoryPlayback(record)"
                  >
                    {{ getHistoryPlaybackState(record.id).url ? "刷新录音" : "加载录音" }}
                  </button>
                </article>
              </div>
            </div>
          </section>

          <section v-if="showFatalRecorderError" class="error-card">
            {{ recorder.error }}
          </section>

          <section
            v-if="showStartMetaDebug && phase !== 'processing' && phase !== 'done'"
            class="debug-card"
          >
            <p>DEV: platformStrategy={{ startMeta?.platformStrategy || "none" }}</p>
            <p>DEV: engine={{ startMeta?.recorderEngine || "none" }}, speechReason={{ startMeta?.speechReason || "none" }}</p>
            <p>DEV: startErrorCode={{ startMeta?.startErrorCode || "none" }}, stopErrorCode={{ currentStopMeta?.stopErrorCode || "none" }}</p>
            <p>DEV: stopBlobSize={{ Number(currentStopMeta?.blobSize || 0) }}, stopMimeType={{ currentStopMeta?.mimeType || "none" }}</p>
          </section>
        </template>
      </main>

      <aside class="right-col">
        <section class="ai-card">
          <div class="ai-hd">
            <div class="ai-hd-title">✦ AI 私教实时指导</div>
            <button class="ai-hd-link" type="button" data-testid="ra-agent" @click="goAgent">进入私教 →</button>
          </div>
          <div class="ai-suggest"><span class="ai-suggest-icon">💡</span><span>{{ currentAiTip }}</span></div>
          <div class="ai-msgs">
            <div v-for="msg in aiCoachMessages" :key="msg.text" class="ai-msg">
              <div class="ai-avatar">AI</div>
              <div class="ai-bubble">
                <p>{{ msg.text }}</p>
                <span>{{ msg.time }}</span>
              </div>
            </div>
          </div>
          <div class="ai-actions">
            <button type="button" @click="goAgent"><span>🎯</span><span>节奏分析</span></button>
            <button type="button" @click="showHistoryFromCard"><span>📊</span><span>RA 趋势</span></button>
          </div>
        </section>

        <section class="side-card progress-card">
          <div class="card-hd"><span class="card-mark">◈</span> 本次练习进度</div>
          <div class="card-body">
            <div class="progress-nums">
              <div><strong>{{ currentQuestionNumber }}</strong><span>当前题</span></div>
              <i></i>
              <div><strong>{{ questionTotal }}</strong><span>总题数</span></div>
              <i></i>
              <div><strong>{{ completedQuestionCount }}</strong><span>已完成</span></div>
            </div>
            <div class="progress-track"><span :style="{ width: `${sessionProgressPercent}%` }"></span></div>
            <div class="progress-copy">{{ sessionProgressPercent }}% 完成 · 当前步骤 {{ stepProgressPercent }}%</div>
          </div>
        </section>

        <section class="side-card quick-card">
          <div class="card-hd"><span class="card-mark">◈</span> 快捷操作</div>
          <div class="card-body quick-actions">
            <div class="quick-row">
              <button type="button" data-testid="ra-prev" @click="switchQuestionByOffset(-1)">← 上一题</button>
              <button type="button" data-testid="ra-next" @click="switchQuestionByOffset(1)">下一题 →</button>
            </div>
            <button class="random-btn" type="button" data-testid="ra-random" @click="randomQuestion">🔀 随机换题</button>
            <button class="bank-btn" type="button" data-testid="ra-bank" @click="goQuestionBank">📚 回到题库</button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
*,*::before,*::after{box-sizing:border-box;}
.ra-practice-shell{--c0:#1e1208;--c1:#3a2510;--c2:#7c5c3e;--c3:#a07850;--bg1:#ede8dc;--bg2:#e4ddd0;--card:#faf6ef;--card2:#f2ebe0;--bdr:#d4c8b4;--bdr2:#c4b49c;--muted:#a89070;--green:#5a9e6a;--green2:#dff0e4;--green3:#a8d4b4;--orange:#c07840;--orange2:#f2e4d0;--orange3:#d4b090;--red:#b84040;--red2:#f5e0dc;--red3:#d4a8a0;width:100vw;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg1);color:var(--c0);font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;}
.ra-topbar{height:52px;flex:0 0 52px;background:var(--c2);display:flex;align-items:center;justify-content:space-between;padding:0 28px;}
.tb-back,.exit-btn,.ai-hd-link{border:0;background:transparent;font:inherit;cursor:pointer;}
.tb-back{display:flex;align-items:center;gap:6px;color:rgba(250,246,239,.72);font-size:13px;}
.tb-arr{font-size:18px;line-height:1;}
.tb-title{position:absolute;left:50%;transform:translateX(-50%);font-size:15px;font-weight:800;color:#faf6ef;}
.tb-right{display:flex;align-items:center;gap:10px;}
.vip-pill{display:flex;align-items:center;gap:6px;background:#dff0e4;border:1px solid #a8d4b4;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:700;color:#2d6a3a;}
.vip-dot{width:5px;height:5px;border-radius:50%;background:#5a9e6a;}
.exit-btn{font-size:12px;color:rgba(250,246,239,.66);}
.step-bar{height:44px;flex:0 0 44px;background:var(--bg2);border-bottom:1px solid var(--bdr);display:flex;align-items:center;padding:0 28px;}
.step-wrap{display:flex;align-items:center;}
.step-item{display:flex;align-items:center;gap:8px;padding:0 8px;}
.step-num{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;}
.step-num.act{background:var(--c2);color:#faf6ef;}
.step-num.done{background:var(--green);color:#fff;}
.step-num.wait{background:var(--bdr);color:var(--muted);}
.step-label{font-size:11.5px;font-weight:600;}
.step-label.act{color:var(--c2);}.step-label.done{color:var(--green);}.step-label.wait{color:var(--muted);}
.step-sep{width:22px;height:1px;background:var(--bdr);}
.step-q-info{margin-left:auto;font-size:11px;color:var(--muted);}
.practice-body{flex:1;min-height:0;display:grid;grid-template-columns:276px minmax(620px,1fr) 292px;overflow:hidden;}
.left-col,.right-col{min-height:0;overflow-y:auto;background:var(--bg2);display:flex;flex-direction:column;gap:14px;scrollbar-width:thin;}
.left-col{border-right:1px solid var(--bdr);padding:18px 14px;}
.right-col{border-left:1px solid var(--bdr);padding:16px 14px 24px;}
.left-col::-webkit-scrollbar,.right-col::-webkit-scrollbar,.main-col::-webkit-scrollbar{width:4px;}.left-col::-webkit-scrollbar-thumb,.right-col::-webkit-scrollbar-thumb,.main-col::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:99px;}
.side-card,.ai-card,.timer-card,.article-card,.history-card,.recording-card,.processing-card,.loading-card,.error-card,.debug-card{background:var(--card);border:1px solid var(--bdr);border-radius:13px;}
.side-card{overflow:hidden;}.ai-card{overflow:visible;}
.card-hd{min-height:44px;padding:11px 14px 10px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:var(--c0);}
.card-mark{color:var(--c2);font-size:12px;}.card-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.info-body{gap:9px;}.info-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:var(--muted);}.info-row strong{font-size:11.5px;color:var(--c0);}
.diff-badge{font-size:10px;font-weight:800;border-radius:5px;padding:2px 7px;}.diff-badge.easy{background:var(--green2);border:1px solid var(--green3);color:var(--green);}.diff-badge.medium{background:var(--orange2);border:1px solid var(--orange3);color:var(--orange);}.diff-badge.hard{background:var(--red2);border:1px solid var(--red3);color:var(--red);}
.rhythm-note,.ai-rec-note{background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:9px 11px;font-size:11px;color:var(--c1);line-height:1.65;}
.tip-list{gap:8px;}.tip-item{display:flex;align-items:flex-start;gap:7px;font-size:11.5px;line-height:1.55;color:var(--c1);}.tip-dot{width:5px;height:5px;border-radius:50%;background:var(--c2);margin-top:6px;flex:0 0 auto;}
.hist-badge{margin-left:auto;font-size:9.5px;padding:2px 7px;border-radius:5px;}.hist-badge.first{background:var(--bg1);border:1px solid var(--bdr2);color:var(--muted);}.hist-badge.good{background:var(--green2);border:1px solid var(--green3);color:var(--green);font-weight:800;}
.hist-stat-row{display:flex;gap:6px;}.hist-stat{flex:1;text-align:center;background:var(--card2);border:1px solid var(--bdr);border-radius:8px;padding:8px 4px;}.hist-val{font-size:15px;font-weight:900;line-height:1.1;}.tone-brown{color:var(--c2);}.tone-dark{color:var(--c0);}.tone-green{color:var(--green);}.hist-label{margin-top:3px;font-size:9.5px;color:var(--muted);}
.hist-mini{display:flex;flex-direction:column;gap:6px;}.hist-mini-row{display:flex;align-items:center;gap:7px;font-size:9.5px;color:var(--muted);}.hist-mini-row span{width:34px;}.hist-mini-row strong{width:24px;text-align:right;font-size:10.5px;color:var(--c2);}.hist-bar{flex:1;height:5px;background:var(--bdr);border-radius:99px;overflow:hidden;}.hist-bar i{display:block;height:100%;background:var(--c2);border-radius:99px;}
.hist-empty{font-size:11.5px;color:var(--muted);text-align:center;line-height:1.7;padding:4px 0;}.inline-history-btn{border:1px solid var(--bdr2);background:var(--card2);color:var(--c1);border-radius:8px;padding:7px 10px;font-size:11px;cursor:pointer;}.mini-loading,.muted-line{font-size:11.5px;color:var(--muted);}.small-warning{font-size:11px;color:#9f5d24;line-height:1.55;}
.main-col{min-width:0;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:14px;}
.main-col > *{width:100%;max-width:1180px;margin-left:auto;margin-right:auto;}
.status-banner{min-height:104px;border-radius:14px;padding:20px 26px;display:flex;align-items:center;justify-content:space-between;gap:20px;}.status-banner--prep{background:linear-gradient(135deg,var(--c2),var(--c3));}.status-banner--rec{background:linear-gradient(135deg,#b84040,#c06050);}.status-banner--done{background:linear-gradient(135deg,var(--green),#80b980);}
.sb-title{font-size:17px;font-weight:900;color:#faf6ef;}.sb-sub{margin-top:5px;font-size:12px;color:rgba(250,246,239,.7);}.countdown-wrap{text-align:center;min-width:76px;}.countdown-num{font-size:48px;line-height:1;font-weight:900;color:#faf6ef;}.countdown-lbl{margin-top:3px;font-size:9px;font-weight:800;letter-spacing:.08em;color:rgba(250,246,239,.55);}
.timer-card{padding:14px 18px;display:flex;flex-direction:column;gap:11px;}.timer-row{display:flex;align-items:center;gap:10px;}.timer-label{font-size:11px;color:var(--muted);white-space:nowrap;}.timer-track{flex:1;height:8px;border-radius:999px;background:var(--bdr);overflow:hidden;}.timer-fill{height:100%;border-radius:999px;transition:width .25s ease;}.timer-fill--prep{background:linear-gradient(90deg,var(--c2),var(--c3));}.timer-fill--rec{background:linear-gradient(90deg,var(--red),#e06040);}.timer-fill--done{background:linear-gradient(90deg,var(--green),#80c080);}.timer-val{width:42px;text-align:right;font-size:12px;font-weight:900;color:var(--c2);}.timer-skip{border:0;background:transparent;color:var(--muted);text-decoration:underline;text-underline-offset:2px;font-size:11.5px;white-space:nowrap;cursor:pointer;}
.primary-action{width:100%;border:1.5px solid var(--c2);background:transparent;border-radius:10px;padding:11px;color:var(--c2);font:inherit;font-size:14px;font-weight:800;cursor:pointer;}.primary-action:hover:not(:disabled){background:var(--card2);}.primary-action:disabled{opacity:.55;cursor:not-allowed;}
.recording-card{padding:15px 18px;display:flex;flex-direction:column;gap:11px;}.record-state{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--c0);}.state-dot{width:10px;height:10px;border-radius:50%;}.state-dot--recording{background:var(--red);animation:pulse 1s infinite;}.state-dot--done{background:var(--green);}.state-dot--warn{background:#d18b35;}@keyframes pulse{50%{opacity:.45;transform:scale(1.25);}}
.audio-preview{display:flex;align-items:center;gap:10px;background:var(--card2);border:1px solid var(--bdr);border-radius:10px;padding:10px 12px;}.audio-preview audio{width:100%;height:34px;}.play-preview{width:30px;height:30px;border:0;border-radius:50%;background:var(--c2);color:#fff;cursor:pointer;}.record-actions{display:flex;gap:10px;}.ghost-action,.submit-action{flex:1;border-radius:10px;padding:11px;border:1px solid var(--bdr2);font:inherit;font-size:13px;font-weight:800;cursor:pointer;}.ghost-action{background:var(--card2);color:var(--c1);}.submit-action{border-color:var(--c2);background:var(--c2);color:#faf6ef;}.submit-action:disabled{background:#d8d1c5;border-color:#d8d1c5;color:#948674;cursor:not-allowed;}.rec-valid-note{font-size:11.5px;color:var(--green);}
.article-card{padding:22px 26px;}.article-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.08em;}.article-text{font-family:'Noto Serif SC','Georgia',serif;font-size:16px;line-height:2;color:#463829;letter-spacing:0;}
.history-card{padding:0;overflow:hidden;}.history-head{min-height:56px;padding:13px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;}.history-title{font-size:12.5px;font-weight:800;color:var(--c0);}.history-toggle{border:1px solid var(--bdr2);background:var(--card2);border-radius:8px;padding:7px 14px;font:inherit;font-size:11.5px;color:var(--c1);cursor:pointer;}.history-panel{border-top:1px solid var(--bdr);padding:12px 16px;display:flex;flex-direction:column;gap:10px;}.history-tools{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);}.history-tools button,.history-log button{border:1px solid var(--bdr2);background:var(--card2);border-radius:7px;padding:5px 9px;font:inherit;font-size:11px;color:var(--c1);cursor:pointer;}.history-list{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;padding-right:4px;}.history-log{border:1px solid var(--bdr);background:#fffaf3;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;}.history-log-top{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:var(--c0);}.history-log p{margin:5px 0 7px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.score-mini{display:flex;gap:6px;font-size:10.5px;color:var(--c2);}.history-log audio{display:block;width:100%;height:30px;margin-top:8px;}
.loading-card,.processing-card,.error-card,.debug-card{padding:18px;text-align:center;color:var(--muted);font-size:13px;}.loading-dot{width:26px;height:26px;margin:0 auto 8px;border:3px solid var(--orange);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}.error-card{border-color:#e3b0a8;background:#fff0ee;color:var(--red);}.debug-card{text-align:left;font-size:10px;line-height:1.5;}
.ai-hd{padding:10px 13px 9px;background:var(--c2);border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px;}.ai-hd-title{font-size:12px;font-weight:900;color:#faf6ef;white-space:nowrap;}.ai-hd-link{font-size:10.5px;color:rgba(250,246,239,.72);text-decoration:underline;text-underline-offset:2px;white-space:nowrap;}.ai-suggest{padding:10px 12px;background:var(--orange2);border-bottom:1px solid var(--orange3);display:flex;align-items:flex-start;gap:7px;font-size:11.5px;line-height:1.5;color:var(--orange);}.ai-suggest-icon{flex:0 0 auto;}.ai-suggest span:last-child{min-width:0;}.ai-msgs{padding:9px 10px;display:flex;flex-direction:column;gap:7px;}.ai-msg{display:flex;gap:7px;align-items:flex-start;}.ai-avatar{width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--c2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;flex:0 0 auto;}.ai-bubble{min-width:0;flex:1;background:var(--card2);border:1px solid var(--bdr);border-radius:0 8px 8px 8px;padding:7px 9px;}.ai-bubble p{margin:0 0 3px;font-size:10.8px;line-height:1.48;color:var(--c1);}.ai-bubble span{font-size:9px;color:var(--muted);}.ai-actions{padding:9px 10px 10px;border-top:1px solid var(--bdr);display:grid;grid-template-columns:1fr 1fr;gap:7px;}.ai-actions button{min-width:0;min-height:34px;border:1px solid var(--bdr);background:var(--card2);border-radius:8px;padding:7px 6px;display:flex;align-items:center;justify-content:center;gap:4px;text-align:center;font:inherit;font-size:11px;font-weight:700;line-height:1.2;color:var(--c1);cursor:pointer;}
.progress-nums{display:grid;grid-template-columns:1fr 1px 1fr 1px 1fr;gap:8px;align-items:stretch;text-align:center;}.progress-nums i{background:var(--bdr);}.progress-nums strong{display:block;font-size:17px;color:var(--c0);}.progress-nums span{display:block;margin-top:2px;font-size:9.5px;color:var(--muted);}.progress-track{height:6px;background:var(--bdr);border-radius:999px;overflow:hidden;}.progress-track span{display:block;height:100%;background:var(--c2);border-radius:999px;}.progress-copy{text-align:right;font-size:10px;color:var(--muted);}.quick-actions{gap:8px;}.quick-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.quick-actions button{border:1px solid var(--bdr);background:var(--card2);border-radius:8px;padding:8px 9px;font:inherit;font-size:11.5px;color:var(--c1);cursor:pointer;}.quick-actions .random-btn{width:100%;border-color:var(--orange3);background:var(--orange2);color:var(--orange);font-weight:800;}.quick-actions .bank-btn{width:100%;}
@media (min-width:1600px){.practice-body{grid-template-columns:300px minmax(760px,1fr) 320px;}.main-col{padding:26px 30px;}.article-text{font-size:17px;}.status-banner{min-height:116px;}}
@media (max-width:1320px){.practice-body{grid-template-columns:250px minmax(540px,1fr) 272px;}.main-col{padding:18px 20px;}.article-text{font-size:15px;line-height:1.9;}.ra-topbar{padding:0 24px;}.step-bar{padding:0 24px;}.step-sep{width:16px;}}
</style>
