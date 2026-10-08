<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import RecordingWave from "@/components/RecordingWave.vue";
import { buildPracticeAnalytics } from "@/lib/practice-analytics";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";
import {
  buildRTSAudioSignalsPayload,
  buildRTSQuestionMetaPayload,
  createPendingRTSAiReviewJob
} from "@/lib/rts-ai-review";
import { supabase } from "@/lib/supabase";
import { useRecorder } from "@/composables/useRecorder";
import {
  applyRTSAudioRetentionForUser,
  getRTSPlaybackUrl,
  isValidRTSRemoteHistoryRecord,
  RTS_TOPIC_META,
  uploadRTSAudio,
  useRTSData
} from "@/composables/useRTSData";
import { getRTSFixedTemplateByQuestionIndex } from "@/data/rtsFixedPracticeTemplates";
import { useRTSTimer } from "@/composables/useRTSTimer";

const PHASE = {
  LISTENING: "listening",
  PREPARING: "preparing",
  RECORDING: "recording",
  PLAYBACK: "playback"
};

const PLACE_HINTS = ["office", "restaurant", "meeting", "sydney", "melbourne", "brisbane", "city", "station", "airport", "home"];
const ACTION_HINTS = ["help", "fix", "replace", "check", "suggest", "complain", "support", "advise", "request", "apologize"];
const RTS_AUTO_PLAY_COUNTDOWN_SECONDS = 3;
const SCENE_READY_EVENT_TIMEOUT_MS = 12000;
const RTS_SCENE_TO_RECORDING_STABILIZE_MS = 400;
const RTS_STOP_READY_DELAY_MS = 650;
const RTS_SCENE_AUDIO_PREPARE_MODE = "direct_src_with_blob_fallback";
const RTS_RECORDER_PLAYBACK_PROBE_TIMEOUT_MS = 4500;
const RTS_NEXT_SCENE_AUDIO_RECOVER_MS = 120;
const RTS_PREVIEW_RECORDER_RELEASE_WAIT_MS = 520;
const RTS_PREVIEW_RECORDER_RELEASE_POLL_MS = 32;
const RTS_PREVIEW_AUDIO_ROUTE_SWITCH_DELAY_IOS_WEBKIT_MS = 240;
const RTS_PREPARE_SECONDS = 10;
const RTS_SILENT_FALLBACK_MIN_SEC = 1;
const RTS_SILENT_WAV_SAMPLE_RATE = 16000;
const RTS_RECORDER_STATS_STORAGE_KEY = "RTS_RECORDER_STATS_V1";
const RTS_RECORDER_STATS_MAX_RECENT = 30;
const RTS_HISTORY_LIMIT = 20;
const RTS_HOME_REFRESH_HINT_KEY = "RTS_HOME_REFRESH_HINT_V1";
const RTS_PRACTICE_DEBUG_ENABLED = Boolean(import.meta.env.DEV);
const RTS_SCORE_API_TIMEOUT_MS = 15000;
const RTS_SCORE_STATUS_SCORED = "scored";
const RTS_SCORE_STATUS_RULE_GATED = "rule_gated";
const RTS_SCORE_STATUS_DEGRADED = "ai_review_degraded";
const RTS_DISPLAY_MIN_SCORE = 10;
const RTS_DISPLAY_MAX_SCORE = 90;
const RTS_CONTENT_RAW_MAX = 3;
const RTS_PRONUNCIATION_RAW_MAX = 5;
const RTS_FLUENCY_RAW_MAX = 5;
const RTS_SCORE_REASON_MESSAGE_MAP = {
  appropriacy_zero_off_topic: "回应内容与场景不匹配。",
  appropriacy_zero_goal_not_met: "回应没有完成情境目标。",
  appropriacy_zero_template_like: "表达过于模板化，缺少情境针对性。",
  appropriacy_zero_context_incoherent: "语境信息不连贯，影响理解。",
  appropriacy_zero_register_mismatch: "语气或语域与场景不匹配。",
  appropriacy_zero_too_short: "回应过短，无法完成任务。",
  transcript_empty: "未识别到有效转写文本。",
  audio_not_usable: "录音可用性不足，无法稳定评阅。",
  ai_review_unavailable: "AI评阅服务暂时不可用。"
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useRTSTimer();
const {
  loadQuestions,
  getQuestionById,
  getRandomQuestion,
  getUserRTSStats,
  getRTSRecentAudioHistory
} = useRTSData();

const loading = ref(true);
const questionPool = ref([]);
const currentQuestion = ref(null);
const activeTab = ref("mind");
const showFullTemplate = ref(false);
const recordingStopResult = ref(null);
const recorderLastDiag = ref(null);
const recorderDebugLockedByQuery = ref(false);
const playbackUrl = ref("");
const playbackAudioRef = ref(null);
const playbackDurationSec = ref(0);
const nextQuestionBusy = ref(false);
const isAdvancingQuestion = ref(false);
const submitPending = ref(false);
const recordingFinalizePending = ref(false);
const todayStats = ref({ practicedCount: 0, practiceMinutes: 0 });
const remoteRecentHistory = ref([]);
const historyPlaybackStateMap = ref({});
const lastPersistedPracticeKey = ref("");
const lastPersistedPracticeMeta = ref({
  key: "",
  userId: "",
  logId: "",
  transcript: "",
  scoreJson: null
});
const submittedPracticeKey = ref("");
const submitFeedbackState = ref({
  key: "",
  status: "idle",
  uploadOk: false,
  insertOk: false,
  hasRemoteAudioMeta: false
});
const latestRTSAiReview = ref(null);
const latestRTSAiReviewLoading = ref(false);
const latestRTSAiReviewError = ref("");
const isFavorite = ref(false);
const favoriteBusy = ref(false);
const favoriteSource = ref("remote");
const sceneAudioError = ref("");
const audioPreparing = ref(false);
const audioReady = ref(false);
const sceneAudioManualResumeRequired = ref(false);
const sceneAudioPaused = ref(false);
const autoPlayCountdown = ref(false);
const autoPlayCountdownRemaining = ref(0);
const recorderStartAtMs = ref(0);
const sceneAudioEndedAtMs = ref(0);
const recordingStartPending = ref(false);
const recordingStopReady = ref(false);
const previewPlaybackDiag = ref({
  audioCreated: false,
  readyState: 0,
  paused: true,
  ended: false,
  muted: false,
  volume: 1,
  currentTime: 0,
  currentTimeAdvancing: false,
  lastEvent: "",
  lastReason: ""
});

let autoPlayTimer = null;
let autoPlayTickTimer = null;
let autoPlayCountdownCancel = null;
let sceneAudioPlayer = null;
let scenePlaybackToken = 0;
let sceneAudioFetchController = null;
let sceneAudioObjectUrl = "";
let recordingFinalizeToken = 0;
let lastUnavailableDebugKey = "";
let recordingStopReadyTimer = null;
let playbackTimeupdateLogKey = "";
let previewPlaybackLastCurrentTime = 0;

const currentPhase = computed(() => `${practiceStore.rtsSession?.phase || PHASE.LISTENING}`.trim() || PHASE.LISTENING);
const questionIndex = computed(() => Math.max(1, Number(practiceStore.rtsSession?.questionIndex || 1)));
const totalQuestions = computed(() => Math.max(0, Number(practiceStore.rtsSession?.totalQuestions || questionPool.value.length || 0)));
const prepareRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.prepareRemaining || 0)));
const prepareTotal = computed(() => Math.max(1, Number(practiceStore.rtsSession?.prepareTotal || RTS_PREPARE_SECONDS)));
const recordRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.recordRemaining || 0)));
const recordTotal = computed(() => Math.max(1, Number(practiceStore.rtsSession?.recordTotal || 40)));
const listeningProgress = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningProgress || 0)));
const listeningRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningRemaining || 0)));
const listeningTotal = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningTotal || 0)));
const listeningStatus = computed(() => `${practiceStore.rtsSession?.listeningStatus || "idle"}`.trim() || "idle");
const listeningLabel = computed(() => `${practiceStore.rtsSession?.listeningLabel || "点击播放场景"}`.trim() || "点击播放场景");
const listeningActionLabel = computed(() => {
  if (listeningStatus.value === "playing") return "正在播放场景...";
  if (listeningStatus.value === "paused") return "重新播放场景";
  if (audioPreparing.value || autoPlayCountdown.value || listeningStatus.value.startsWith("autoplay_") || listeningStatus.value === "loading") {
    return "正在准备播放...";
  }
  if (sceneAudioManualResumeRequired.value) return "点击播放场景音频";
  if (listeningStatus.value === "error") return "播放失败，点击重试";
  return "点击播放场景";
});
const sceneAudioPauseToggleVisible = computed(() => (
  currentPhase.value === PHASE.LISTENING
  && (listeningStatus.value === "playing" || listeningStatus.value === "paused")
));
const sceneAudioSkipVisible = computed(() => (
  currentPhase.value === PHASE.LISTENING
  && (
    audioPreparing.value
    || listeningStatus.value === "loading"
    || listeningStatus.value === "playing"
    || listeningStatus.value === "paused"
    || listeningStatus.value.startsWith("autoplay_")
  )
));
const sceneAudioPauseToggleLabel = computed(() => (
  sceneAudioPaused.value || listeningStatus.value === "paused" ? "▶ 继续播放" : "⏸ 暂停播放"
));
const sceneAudioInlineCalloutVisible = computed(() => (
  currentPhase.value !== PHASE.RECORDING
  && currentPhase.value !== PHASE.PLAYBACK
  && (sceneAudioManualResumeRequired.value || Boolean(sceneAudioError.value))
));
const sceneAudioInlineCalloutTitle = computed(() => {
  if (sceneAudioManualResumeRequired.value) return "浏览器拦截了自动播放";
  if (sceneAudioError.value) return "场景音频暂未就绪";
  return "请手动恢复场景音频";
});
const sceneAudioInlineCalloutMessage = computed(() => {
  if (sceneAudioManualResumeRequired.value) {
    return "这次需要你手动点一次“播放场景音频”，浏览器才会真正出声。";
  }
  return `${sceneAudioError.value || "请点击下方按钮手动恢复场景音频。"}`
    .trim();
});
const autoPlayHint = computed(() => {
  if (autoPlayCountdown.value) return `音频播放前（阅读与缓冲时间）${autoPlayCountdownRemaining.value}s`;
  if (listeningStatus.value === "autoplay_waiting_ready") return "阅读与缓冲结束，正在等待音频就绪...";
  return "";
});
const usedPhraseIds = computed(() => new Set(practiceStore.rtsSession?.usedPhraseIds || []));
const hasUsableAudio = computed(() => isUsableAudioRecord(recordingStopResult.value));
const hasPlaybackUsableAudio = computed(() => isPlaybackUsableRecord(recordingStopResult.value));
const currentPracticeSubmitKey = computed(() => buildPracticeSubmitKey(
  resolveCurrentQuestionId(),
  resolveAttemptId(recordingStopResult.value)
));
const isCurrentPracticeSubmitted = computed(() => (
  Boolean(currentPracticeSubmitKey.value)
  && currentPracticeSubmitKey.value === submittedPracticeKey.value
));
const showSubmitButton = computed(() => (
  currentPhase.value === PHASE.PLAYBACK
  && hasPlaybackUsableAudio.value
  && Boolean(`${playbackUrl.value || ""}`.trim())
));
const submitButtonDisabled = computed(() => (
  !showSubmitButton.value
  || submitPending.value
  || nextQuestionBusy.value
  || isAdvancingQuestion.value
  || recordingFinalizePending.value
  || isCurrentPracticeSubmitted.value
));
const submitButtonLabel = computed(() => {
  if (submitPending.value) return "提交中...";
  if (isCurrentPracticeSubmitted.value) return "已提交";
  return "提交";
});
const submitStatusMessage = computed(() => {
  const feedback = submitFeedbackState.value;
  if (!feedback || feedback.key !== currentPracticeSubmitKey.value) return "";
  if (submitPending.value) return "提交中，请稍候...";
  if (feedback.status === "success") return "提交成功，正在跳转结果页...";
  if (feedback.status === "failed") return "提交失败，请重试。";
  return "";
});
const hasSilenceWarningFlag = computed(() => hasSilenceWarning(recordingStopResult.value));
const recorderFailure = computed(() => resolveRecorderFailureWithPlayback({
  stopResult: recordingStopResult.value,
  playbackUrlReady: Boolean(playbackUrl.value)
}));
const recorderDebugPanelVisible = computed(() => {
  if (nextQuestionBusy.value || isAdvancingQuestion.value) return false;
  if (currentPhase.value !== PHASE.PLAYBACK) return false;
  if (isRecorderDebugEnabled()) return true;
  if (!recordingStopResult.value || recordingStopResult.value?.staleAttempt) return false;
  return recorderFailure.value.type !== "NONE" || Boolean(recordingStopResult.value?.rtsProbeRejected);
});
const recorderDiagDisplay = computed(() => {
  if (recorderLastDiag.value && typeof recorderLastDiag.value === "object") return recorderLastDiag.value;
  const stopResult = recordingStopResult.value;
  if (!stopResult || stopResult.staleAttempt) return null;
  return buildRecorderDiagPayload({
    stopResult,
    failure: recorderFailure.value,
    reason: `${stopResult.stopReason || ""}`.trim(),
    playbackUrlCreated: Boolean(playbackUrl.value)
  });
});
const recorderDiagProbeJson = computed(() => {
  if (!recorderDiagDisplay.value?.probeResult) return "{}";
  try {
    return JSON.stringify(recorderDiagDisplay.value.probeResult, null, 2);
  } catch {
    return "{}";
  }
});
const canStopRecording = computed(
  () => currentPhase.value === PHASE.RECORDING
    && Boolean(recorder.isRecording.value)
    && !recordingStartPending.value
    && recordingStopReady.value
    && !recorder.isStopping.value
);
const recordingStopButtonLabel = computed(() => (canStopRecording.value ? "正在录音 · 点击结束" : "录音启动中，请稍候"));
const recordingStatusHint = computed(() => {
  if (currentPhase.value !== PHASE.RECORDING) return "";
  if (recordingStartPending.value || !recorder.isRecording.value) return "录音启动中，请稍候…";
  if (!recordingStopReady.value) return "录音刚开始，请稍候再结束。";
  return "";
});
const toneLabel = computed(() => `${currentQuestion.value?.key_points?.toneLabel || "半正式语气"}`);
const topicMeta = computed(() => RTS_TOPIC_META[currentQuestion.value?.topic] || RTS_TOPIC_META.daily);
const behaviorLabel = computed(() => `${currentQuestion.value?.key_points?.directions?.[0]?.head || "情境回应"}`.trim());
const directions = computed(() => currentQuestion.value?.key_points?.directions || []);
const tips = computed(() => currentQuestion.value?.key_points?.tips || []);
const currentTemplateMappingIndex = computed(() => {
  const currentId = `${currentQuestion.value?.id || ""}`.trim();
  if (!currentId) return -1;
  return questionPool.value.findIndex((item) => `${item?.id || ""}`.trim() === currentId);
});
const currentFixedTemplate = computed(() => getRTSFixedTemplateByQuestionIndex(currentTemplateMappingIndex.value));
const templateOpenerSegments = computed(() => splitTemplateSegments(currentFixedTemplate.value?.opener || ""));
const templateFullText = computed(() => currentFixedTemplate.value?.full || "暂无固定示例（RTS答案映射缺失）。");
const phraseGroups = computed(() => {
  const source = currentQuestion.value?.key_points?.phrases || {};
  return [
    { key: "opening", label: "开场", items: source.opening || [] },
    { key: "request", label: "说明请求", items: source.request || [] },
    { key: "closing", label: "收尾", items: source.closing || [] }
  ];
});
const highlightedScenarioHtml = computed(() => highlightScenarioContent(currentQuestion.value?.content || ""));
const stageList = computed(() => {
  const order = [PHASE.LISTENING, PHASE.PREPARING, PHASE.RECORDING, PHASE.PLAYBACK];
  const currentOrder = order.indexOf(currentPhase.value);
  return [
    { key: PHASE.LISTENING, label: "听场景" },
    { key: PHASE.PREPARING, label: "准备" },
    { key: PHASE.RECORDING, label: "开口回应" },
    { key: PHASE.PLAYBACK, label: "听回放" }
  ].map((stage) => ({
    ...stage,
    isActive: currentPhase.value === stage.key,
    isDone: currentOrder > order.indexOf(stage.key)
  }));
});
const progressDots = computed(() => {
  const total = Math.max(1, Math.min(12, Number(totalQuestions.value || 1)));
  const active = Math.max(1, Math.min(total, Number(questionIndex.value || 1)));
  return Array.from({ length: total }, (_, index) => ({ index: index + 1, active: index + 1 === active }));
});
const timerInfo = computed(() => {
  if (currentPhase.value === PHASE.LISTENING) {
    const total = Math.max(1, listeningTotal.value || 1);
    return {
      label: "听场景倒计时",
      remaining: Math.max(0, listeningRemaining.value),
      progress: Math.max(0, Math.min(100, listeningProgress.value || (total ? ((total - listeningRemaining.value) / total) * 100 : 0)))
    };
  }
  if (currentPhase.value === PHASE.PREPARING) {
    const total = Math.max(1, prepareTotal.value);
    const remaining = Math.max(0, prepareRemaining.value);
    return {
      label: "准备倒计时",
      remaining,
      progress: Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
    };
  }
  if (currentPhase.value === PHASE.RECORDING) {
    const total = Math.max(1, recordTotal.value);
    const remaining = Math.max(0, recordRemaining.value);
    return {
      label: "回应倒计时",
      remaining,
      progress: Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
    };
  }
  return {
    label: "回放阶段",
    remaining: Math.max(0, Number(playbackDurationSec.value || 0)),
    progress: 100
  };
});
const historyItems = computed(() => {
  return (Array.isArray(remoteRecentHistory.value) ? remoteRecentHistory.value : [])
    .map((item) => {
    const state = getHistoryPlaybackState(item?.id);
    return {
      id: `${item?.id || ""}`.trim(),
      taskType: `${item?.taskType || item?.task_type || "RTS"}`.trim() || "RTS",
      questionId: `${item?.questionId || ""}`.trim(),
      durationSec: Number(item?.durationSec || 0),
      createdAt: `${item?.createdAt || ""}`.trim(),
      playbackUrl: resolveHistoryPlaybackUrl(item),
      blobUrl: "",
      audioMeta: item?.audioMeta || null,
      summary: `${item?.summary || ""}`.trim(),
      source: "remote",
      hasAudio: isValidRTSRemoteHistoryRecord(item),
      playbackError: `${state?.error || ""}`.trim(),
      playbackLoading: Boolean(state?.loading)
    };
    })
    .filter((item) => isValidRTSRemoteHistoryRecord(item))
    .slice(0, RTS_HISTORY_LIMIT);
});

function markRTSHomeRefreshHint() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  const questionId = `${currentQuestion.value?.id || practiceStore.rtsSession?.questionId || ""}`.trim();
  if (!questionId) return;

  try {
    window.sessionStorage.setItem(
      RTS_HOME_REFRESH_HINT_KEY,
      JSON.stringify({
        questionId,
        at: Date.now()
      })
    );
  } catch {
    // ignore sessionStorage write failures
  }
}

function goHome() {
  if (submitPending.value) return;
  markRTSHomeRefreshHint();
  router.push("/rts");
}

function goList() {
  router.push("/rts/list");
}

function formatDuration(seconds) {
  const normalized = Math.max(0, Math.round(Number(seconds || 0)));
  const m = Math.floor(normalized / 60);
  const s = `${normalized % 60}`.padStart(2, "0");
  return `${m}:${s}`;
}

function createSilentWavBlob(durationSec = 1, sampleRate = RTS_SILENT_WAV_SAMPLE_RATE) {
  const safeDurationSec = Math.max(RTS_SILENT_FALLBACK_MIN_SEC, Math.round(Number(durationSec || 0)));
  const safeSampleRate = Math.max(8000, Math.round(Number(sampleRate || RTS_SILENT_WAV_SAMPLE_RATE)));
  const frameCount = Math.max(1, safeDurationSec * safeSampleRate);
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = frameCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // PCM payload remains zero-filled by default, which represents silence.
  return new Blob([buffer], { type: "audio/wav" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function getHistoryPlaybackState(id) {
  const normalizedId = `${id || ""}`.trim();
  if (!normalizedId) return { url: "", loading: false, error: "" };
  return historyPlaybackStateMap.value[normalizedId] || { url: "", loading: false, error: "" };
}

function updateHistoryPlaybackState(id, patch = {}) {
  const normalizedId = `${id || ""}`.trim();
  if (!normalizedId) return;
  const prev = getHistoryPlaybackState(normalizedId);
  historyPlaybackStateMap.value = {
    ...historyPlaybackStateMap.value,
    [normalizedId]: {
      ...prev,
      ...(patch || {})
    }
  };
}

function resolveHistoryPlaybackUrl(item) {
  const state = getHistoryPlaybackState(item?.id);
  return `${state?.url || item?.playbackUrl || ""}`.trim();
}

async function ensureHistoryPlayback(item, { force = false } = {}) {
  if (!isValidRTSRemoteHistoryRecord(item)) return "";
  const state = getHistoryPlaybackState(item?.id);
  if (!force && `${state?.url || item?.playbackUrl || ""}`.trim()) {
    return `${state?.url || item?.playbackUrl || ""}`.trim();
  }
  if (state.loading) return "";

  updateHistoryPlaybackState(item.id, { loading: true, error: "" });
  const signedUrl = await getRTSPlaybackUrl(item.audioMeta, 60 * 20);
  if (!signedUrl) {
    updateHistoryPlaybackState(item.id, {
      loading: false,
      error: "回放链接获取失败，请重试。"
    });
    return "";
  }

  updateHistoryPlaybackState(item.id, {
    url: signedUrl,
    loading: false,
    error: ""
  });
  return signedUrl;
}

function phraseId(group, index, text) {
  return `${group}:${index}:${text}`.trim();
}

function isPhraseUsed(group, index, text) {
  return usedPhraseIds.value.has(phraseId(group, index, text));
}

function togglePhrase(group, index, text) {
  practiceStore.toggleRTSUsedPhrase(phraseId(group, index, text));
}

function splitTemplateSegments(text) {
  const source = `${text || ""}`.trim();
  if (!source) return [];
  return source.split(/(\[[^\]]+\])/g).filter(Boolean).map((segment) => ({
    text: segment,
    isSlot: /^\[[^\]]+\]$/.test(segment)
  }));
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return `${value || ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectHighlightTerms(text) {
  const source = `${text || ""}`;
  const terms = new Set();
  const names = source.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  names.forEach((name) => {
    if (["You", "Your", "Call", "Speak", "Give"].includes(name)) return;
    terms.add(name);
  });

  const lower = source.toLowerCase();
  PLACE_HINTS.forEach((word) => {
    if (lower.includes(word)) terms.add(word);
  });
  ACTION_HINTS.forEach((word) => {
    if (lower.includes(word)) terms.add(word);
  });

  return [...terms]
    .map((item) => `${item}`.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
}

function highlightScenarioContent(text) {
  const source = `${text || ""}`.trim();
  if (!source) return "";

  const terms = collectHighlightTerms(source);
  const escaped = escapeHtml(source);
  if (!terms.length) return escaped;

  let output = escaped;
  terms.forEach((term) => {
    const safe = escapeRegExp(escapeHtml(term));
    const regex = new RegExp(`\\b${safe}\\b`, "gi");
    output = output.replace(regex, (matched) => `<span class=\"rounded bg-[#FFF4CC] px-1\">${matched}</span>`);
  });
  return output;
}

function isUsableAudioRecord(stopResult) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  const blob = stopResult?.blob;
  const blobSize = Number(stopResult?.blobSize ?? blob?.size ?? 0);
  if (!blob || blobSize <= 0) return false;
  if (stopResult?.rtsSilentFallback) return false;
  if (`${stopResult?.blobIssueCode || ""}` === "RTS_SILENT_FALLBACK") return false;
  if (typeof stopResult?.finalUsableDecision === "boolean") {
    return Boolean(stopResult.finalUsableDecision);
  }
  if (stopResult?.rtsSharedLayerUsable) return true;
  if (Boolean(stopResult?.previewPlayable)) return true;
  const playbackProbe = stopResult?.rtsPlaybackProbe;
  if (playbackProbe && typeof playbackProbe === "object") {
    return Boolean(playbackProbe.playable);
  }
  if (typeof stopResult?.hasUsableAudio === "boolean") {
    return Boolean(stopResult.hasUsableAudio);
  }
  return true;
}

function isPlaybackUsableRecord(stopResult) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  const blob = stopResult?.blob;
  const blobSize = Number(stopResult?.blobSize ?? blob?.size ?? 0);
  if (!blob || blobSize <= 0) return false;
  if (typeof stopResult?.finalPlaybackUsable === "boolean" && stopResult.finalPlaybackUsable) {
    return true;
  }
  if (typeof stopResult?.finalBlobPlayable === "boolean") {
    return Boolean(stopResult.finalBlobPlayable);
  }
  const probePlayable = Boolean(stopResult?.rtsPlaybackProbe?.playable);
  if (probePlayable) return true;
  if (Boolean(stopResult?.previewPlayable)) return true;
  if (typeof stopResult?.finalUsableDecision === "boolean") {
    return Boolean(stopResult.finalUsableDecision);
  }
  return Boolean(stopResult?.hasUsableAudio);
}

function hasSilenceWarning(stopResult) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  if (typeof stopResult?.finalSilenceWarning === "boolean") {
    return Boolean(stopResult.finalSilenceWarning);
  }
  if (typeof stopResult?.silenceWarning === "boolean") {
    return Boolean(stopResult.silenceWarning);
  }
  if (stopResult?.rtsSilentFallback) return true;
  if (`${stopResult?.blobIssueCode || ""}` === "RTS_SILENT_FALLBACK") return true;
  return `${stopResult?.finalUsableReason || ""}` === "RTS_SILENT_FALLBACK";
}

function isRecorderDebugEnabledByQuery() {
  return isTruthyRecorderDebugFlag(route.query?.debugRecorder);
}

function isTruthyRecorderDebugFlag(raw) {
  if (Array.isArray(raw)) return raw.some((item) => isTruthyRecorderDebugFlag(item));
  const normalized = `${raw ?? ""}`.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function isRecorderDebugEnabledByLocation() {
  if (typeof window === "undefined" || typeof URLSearchParams === "undefined") return false;
  try {
    const searchParams = new URLSearchParams(window.location.search || "");
    const searchValues = searchParams.getAll("debugRecorder");
    if (searchValues.some((item) => isTruthyRecorderDebugFlag(item))) return true;

    const hashRaw = `${window.location.hash || ""}`.trim();
    const queryIndex = hashRaw.indexOf("?");
    if (queryIndex < 0) return false;
    const hashQuery = hashRaw.slice(queryIndex + 1);
    if (!hashQuery) return false;
    const hashParams = new URLSearchParams(hashQuery);
    const hashValues = hashParams.getAll("debugRecorder");
    return hashValues.some((item) => isTruthyRecorderDebugFlag(item));
  } catch {
    return false;
  }
}

function isRecorderDebugEnabledByStorage() {
  if (typeof window === "undefined") return false;
  try {
    return isTruthyRecorderDebugFlag(window.localStorage?.getItem("RTS_RECORDER_DEBUG"));
  } catch {
    return false;
  }
}

function persistRecorderDebugFlag() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage?.getItem("RTS_RECORDER_DEBUG") !== "1") {
      window.localStorage?.setItem("RTS_RECORDER_DEBUG", "1");
    }
  } catch {
    // ignore storage write failures
  }
}

function refreshRecorderDebugLock() {
  const enabledByQuery = isRecorderDebugEnabledByQuery();
  const enabledByLocation = isRecorderDebugEnabledByLocation();
  const enabledByStorage = isRecorderDebugEnabledByStorage();
  if (enabledByQuery || enabledByLocation || enabledByStorage) {
    recorderDebugLockedByQuery.value = true;
  }
  if (enabledByQuery || enabledByLocation) {
    persistRecorderDebugFlag();
  }
}

function isRecorderDebugEnabled() {
  return recorderDebugLockedByQuery.value
    || isRecorderDebugEnabledByQuery()
    || isRecorderDebugEnabledByLocation()
    || isRecorderDebugEnabledByStorage();
}

function buildPracticeRouteQuery(questionId = "") {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  const query = {};
  if (normalizedQuestionId) query.id = normalizedQuestionId;
  if (isRecorderDebugEnabled()) {
    query.debugRecorder = "1";
  }
  return query;
}

function buildResultRouteQuery({ logId = "", questionId = "" } = {}) {
  const query = {};
  const normalizedLogId = `${logId || ""}`.trim();
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (normalizedLogId) query.logId = normalizedLogId;
  if (normalizedQuestionId) query.id = normalizedQuestionId;
  return query;
}

function getRTSAnalyzingStartedAtStorageKey(logId = "") {
  const normalizedLogId = `${logId || ""}`.trim();
  return normalizedLogId ? `kai_kou_rts_analyzing_started_at_${normalizedLogId}` : "";
}

function getSafeLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function bumpCounter(map, key) {
  if (!map || typeof map !== "object") return;
  const safeKey = `${key || "unknown"}`.trim() || "unknown";
  map[safeKey] = Number(map[safeKey] || 0) + 1;
}

function resolveChunkBucket(chunkCount = 0) {
  const safeCount = Math.max(0, Number(chunkCount || 0));
  if (safeCount <= 0) return "0";
  if (safeCount <= 2) return "1-2";
  if (safeCount <= 5) return "3-5";
  if (safeCount <= 10) return "6-10";
  return "11+";
}

function classifyStopOutcome(stopResult) {
  const source = stopResult && typeof stopResult === "object" ? stopResult : {};
  if (!source || source.staleAttempt) return "stale_attempt";
  if (source.rtsSilentFallback) return "silent_fallback";
  const blobSize = Number(source.blobSize ?? source.blob?.size ?? 0);
  if (blobSize <= 0) return "empty_blob";
  if (!isUsableAudioRecord(source)) return "nonplayable_blob";
  return "usable_blob";
}

function readRecorderStats() {
  const storage = getSafeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(RTS_RECORDER_STATS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRecorderStats(stats) {
  const storage = getSafeLocalStorage();
  if (!storage || !stats || typeof stats !== "object") return;
  try {
    storage.setItem(RTS_RECORDER_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore quota errors
  }
}

function recordRecorderStopStats({ stopResult, phase = "final", reason = "", usedSilentFallback = false } = {}) {
  const source = stopResult && typeof stopResult === "object" ? stopResult : {};
  if (!source || !Object.keys(source).length) return;

  const outcome = classifyStopOutcome(source);
  const stopSummary = summarizeStopResult(source);
  const stats = readRecorderStats() || {
    version: 1,
    total: 0,
    fallbackHits: 0,
    byOutcome: {},
    byPhase: {},
    byPlatform: {},
    byMimeType: {},
    byChunkBucket: {},
    recent: []
  };

  stats.total = Number(stats.total || 0) + 1;
  if (usedSilentFallback || source.rtsSilentFallback) {
    stats.fallbackHits = Number(stats.fallbackHits || 0) + 1;
  }

  const platformKey = `${source.platformStrategy || recorder.lastStartMeta.value?.platformStrategy || "unknown"}`.trim() || "unknown";
  const mimeTypeKey = `${source.mimeType || source.blob?.type || "unknown"}`.trim() || "unknown";
  const chunkBucketKey = resolveChunkBucket(source.chunkCount);
  const phaseKey = `${phase || "final"}`.trim() || "final";

  bumpCounter(stats.byOutcome, outcome);
  bumpCounter(stats.byPhase, phaseKey);
  bumpCounter(stats.byPlatform, platformKey);
  bumpCounter(stats.byMimeType, mimeTypeKey);
  bumpCounter(stats.byChunkBucket, chunkBucketKey);

  const recentEntry = {
    at: new Date().toISOString(),
    questionId: resolveCurrentQuestionId(),
    reason: `${reason || ""}`.trim(),
    phase: phaseKey,
    outcome,
    usedSilentFallback: Boolean(usedSilentFallback || source.rtsSilentFallback),
    platformStrategy: platformKey,
    mimeType: mimeTypeKey,
    chunkCount: Number(source.chunkCount || 0),
    blobSize: Number(source.blobSize || 0),
    stopErrorCode: `${source.stopErrorCode || ""}`,
    blobIssueCode: `${source.blobIssueCode || ""}`,
    hasUsableAudio: Boolean(isUsableAudioRecord(source)),
    stopNoAudioRetryAttempted: Boolean(source.stopNoAudioRetryAttempted),
    stopNoAudioRetryRecovered: Boolean(source.stopNoAudioRetryRecovered),
    summary: stopSummary
  };
  const recent = Array.isArray(stats.recent) ? stats.recent : [];
  stats.recent = [recentEntry, ...recent].slice(0, RTS_RECORDER_STATS_MAX_RECENT);
  writeRecorderStats(stats);
}

function resolvePlaybackSrcKind() {
  if (!playbackUrl.value) return "empty";
  if (playbackUrl.value.startsWith("blob:")) return "blob";
  return "non_blob";
}

function resolveRecorderPlaybackToken() {
  return Number(recordingFinalizeToken || 0);
}

function collectAudioLifecycleSnapshot() {
  const scene = sceneAudioPlayer;
  const playback = playbackAudioRef.value;
  const previewDiag = previewPlaybackDiag.value || {};
  return {
    scenePlaybackToken: Number(scenePlaybackToken || 0),
    recorderPlaybackToken: resolveRecorderPlaybackToken(),
    sceneAudioAlive: Boolean(scene),
    sceneAudioSrcKind: scene ? `${scene.currentSrc || scene.src || ""}`.startsWith("blob:") ? "blob" : "url_or_empty" : "none",
    sceneAudioReadyState: Number(scene?.readyState || 0),
    sceneAudioNetworkState: Number(scene?.networkState || 0),
    sceneAudioPaused: scene ? Boolean(scene.paused) : true,
    sceneAudioCurrentTime: Number(scene?.currentTime || 0),
    recorderPlaybackElementAlive: Boolean(playback),
    recorderPlaybackElementReadyState: Number(playback?.readyState || 0),
    recorderPlaybackElementNetworkState: Number(playback?.networkState || 0),
    recorderPlaybackElementPaused: playback ? Boolean(playback.paused) : true,
    recorderPlaybackElementCurrentTime: Number(playback?.currentTime || 0),
    recorderPlaybackSrcKind: resolvePlaybackSrcKind(),
    recorderPlaybackUrlLength: Number(`${playbackUrl.value || ""}`.length || 0),
    previewAudioCreated: Boolean(previewDiag.audioCreated),
    previewAudioReadyState: Number(previewDiag.readyState || 0),
    previewAudioPaused: Boolean(previewDiag.paused),
    previewAudioEnded: Boolean(previewDiag.ended),
    previewAudioMuted: Boolean(previewDiag.muted),
    previewAudioVolume: Number(previewDiag.volume ?? 1),
    previewAudioCurrentTime: Number(previewDiag.currentTime || 0),
    previewAudioCurrentTimeAdvancing: Boolean(previewDiag.currentTimeAdvancing),
    recorderState: {
      isRecording: Boolean(recorder.isRecording.value),
      isReady: Boolean(recorder.isReady.value),
      isStopping: Boolean(recorder.isStopping.value),
      attemptId: Number(recorder.currentAttemptId.value || 0)
    }
  };
}

function summarizePlaybackProbe(probe = recordingStopResult.value?.rtsPlaybackProbe || null) {
  const source = probe && typeof probe === "object" ? probe : {};
  return {
    playable: Boolean(source.playable),
    reason: `${source.reason || ""}`.trim(),
    errorCode: `${source.errorCode || ""}`.trim(),
    blobSize: Number(source.blobSize || 0),
    blobType: `${source.blobType || ""}`.trim(),
    durationSec: Number(source.durationSec || 0),
    objectUrlCreated: Boolean(source.objectUrlCreated),
    playInvoked: Boolean(source.playInvoked),
    playResolved: Boolean(source.playResolved),
    playRejectedName: `${source.playRejectedName || ""}`.trim(),
    playRejectedMessage: `${source.playRejectedMessage || ""}`.trim(),
    readyState: Number(source.readyState || 0),
    networkState: Number(source.networkState || 0),
    audioErrorCode: Number(source.audioErrorCode || 0),
    events: Array.isArray(source.events) ? source.events : []
  };
}

function resolveRecorderDeviceInfo() {
  if (typeof navigator === "undefined") {
    return {
      ua: "",
      platform: "",
      maxTouchPoints: 0
    };
  }
  return {
    ua: `${navigator.userAgent || ""}`,
    platform: `${navigator.platform || ""}`,
    maxTouchPoints: Number(navigator.maxTouchPoints || 0)
  };
}

function summarizeStartMeta(meta = recorder.lastStartMeta.value || null) {
  const source = meta && typeof meta === "object" ? meta : {};
  const attempts = Array.isArray(source.startAttempts) ? source.startAttempts : [];
  const lastAttempt = attempts[attempts.length - 1] || {};
  return {
    attemptId: Number(source.attemptId || recorder.currentAttemptId.value || 0),
    platformStrategy: `${source.platformStrategy || ""}`,
    secureContext: source.secureContext !== false,
    hasGetUserMedia: Boolean(source.hasGetUserMedia),
    hasMediaRecorder: Boolean(source.hasMediaRecorder),
    selectedMimeType: `${source.selectedMimeType || ""}`,
    recorderEngine: `${source.recorderEngine || ""}`,
    startErrorCode: `${source.startErrorCode || ""}`,
    startErrorMessage: `${source.startErrorMessage || ""}`,
    speechReason: `${source.speechReason || ""}`,
    speechEnabled: Boolean(source.speechEnabled),
    webAudioFallbackTried: Boolean(source.webAudioFallbackTried),
    webAudioFallbackOk: Boolean(source.webAudioFallbackOk),
    mediaRecorderStartWatchdogMs: Number(source.mediaRecorderStartWatchdogMs || 0),
    startAttemptsCount: attempts.length,
    lastMediaRecorderAttemptErrorCode: `${lastAttempt.errorCode || ""}`,
    lastMediaRecorderAttemptMimeType: `${lastAttempt.mimeType || ""}`
  };
}

function summarizeStopResult(stopResult = recordingStopResult.value || null) {
  const source = stopResult && typeof stopResult === "object" ? stopResult : {};
  return {
    attemptId: Number(source.attemptId || recorder.currentAttemptId.value || 0),
    staleAttempt: Boolean(source.staleAttempt),
    stopReason: `${source.stopReason || ""}`,
    stopErrorCode: `${source.stopErrorCode || ""}`,
    stopErrorMessage: `${source.stopErrorMessage || source.stopError || ""}`,
    blobIssueCode: `${source.blobIssueCode || ""}`,
    hasAudio: Boolean(source.hasAudio),
    hasUsableAudio: Boolean(source.hasUsableAudio),
    chunkCount: Number(source.chunkCount || 0),
    blobSize: Number(source.blobSize || 0),
    blobType: `${source.blob?.type || source.mimeType || ""}`,
    mimeType: `${source.mimeType || ""}`,
    mediaRecorderMimeType: `${source.mediaRecorderMimeType || ""}`,
    chunkMimeType: `${source.chunkMimeType || ""}`,
    selectedMimeType: `${source.selectedMimeType || ""}`,
    mimeTypePlayable: Boolean(source.mimeTypePlayable),
    previewPlayable: Boolean(source.previewPlayable),
    playableValidationMethod: `${source.playableValidationMethod || ""}`,
    playableValidationErrorCode: `${source.playableValidationErrorCode || ""}`,
    playableDurationSec: Number(source.playableDurationSec || 0),
    recorderEngineAtStart: `${source.recorderEngineAtStart || ""}`,
    recorderEngineAtStop: `${source.recorderEngineAtStop || source.recorderEngine || ""}`,
    recorderEngine: `${source.recorderEngine || ""}`,
    finalRecorderEngine: `${source.finalRecorderEngine || source.recorderEngine || ""}`,
    recorderStopTimedOut: Boolean(source.recorderStopTimedOut),
    recognitionStopTimedOut: Boolean(source.recognitionStopTimedOut),
    fallbackProducedBlob: Boolean(source.fallbackProducedBlob),
    fallbackBlobSize: Number(source.fallbackBlobSize || 0),
    finalUsableDecision: typeof source.finalUsableDecision === "boolean"
      ? source.finalUsableDecision
      : Boolean(source.hasUsableAudio),
    finalUsableReason: `${source.finalUsableReason || ""}`,
    finalPlaybackUsable: typeof source.finalPlaybackUsable === "boolean"
      ? source.finalPlaybackUsable
      : Boolean(source.finalBlobPlayable || source.previewPlayable || source.rtsPlaybackProbe?.playable),
    finalPlaybackReason: `${source.finalPlaybackReason || ""}`,
    finalBlobPlayable: typeof source.finalBlobPlayable === "boolean"
      ? source.finalBlobPlayable
      : Boolean(source.previewPlayable || source.rtsPlaybackProbe?.playable),
    finalBlobOrigin: `${source.finalBlobOrigin || (source.rtsSilentFallback ? "synthetic_silent_fallback" : "captured_blob")}`,
    fallbackInjectedForPreview: Boolean(source.fallbackInjectedForPreview),
    preFallbackBlobSize: Number(source.preFallbackBlobSize || 0),
    preFallbackProbePlayable: Boolean(source.preFallbackProbePlayable),
    finalSilenceWarning: typeof source.finalSilenceWarning === "boolean"
      ? source.finalSilenceWarning
      : hasSilenceWarning(source),
    playbackUrlCreated: Boolean(source.playbackUrlCreated),
    stopRecorderMs: Number(source.stopRecorderMs || 0),
    recognitionStopMs: Number(source.recognitionStopMs || 0),
    mediaStopMs: Number(source.mediaStopMs || 0),
    stopNoAudioRetryAttempted: Boolean(source.stopNoAudioRetryAttempted),
    stopNoAudioRetryRecovered: Boolean(source.stopNoAudioRetryRecovered),
    stopNoAudioRetryDelayMs: Number(source.stopNoAudioRetryDelayMs || 0),
    rawChunkCount: Number(source.rawChunkCount ?? source.chunkCount ?? 0),
    rawChunkBytes: Number(source.rawChunkBytes ?? source.chunkTotalBytes ?? 0),
    lastChunkMimeType: `${source.lastChunkMimeType || source.chunkMimeType || ""}`,
    dataEventCount: Number(source.dataEventCount || 0),
    nonEmptyDataEventCount: Number(source.nonEmptyDataEventCount || 0),
    chunkSizeList: Array.isArray(source.chunkSizeList) ? source.chunkSizeList : [],
    chunkMimeTypeList: Array.isArray(source.chunkMimeTypeList) ? source.chunkMimeTypeList : [],
    chunkTotalBytes: Number(source.chunkTotalBytes || 0),
    lastDataAvailableAtMs: Number(source.lastDataAvailableAtMs || 0),
    peakAmplitude: Number(source.peakAmplitude || 0),
    rmsAmplitude: Number(source.rmsAmplitude || 0),
    meanAbsAmplitude: Number(source.meanAbsAmplitude || 0),
    nonSilentFrameRatio: Number(source.nonSilentFrameRatio || 0),
    sampleRate: Number(source.sampleRate || 0),
    channelCount: Number(source.channelCount || 0),
    durationMs: Number(source.durationMs || 0),
    stopWaitMs: Number(source.stopWaitMs || source.mediaStopMs || 0),
    finalDrainWaitMs: Number(source.finalDrainWaitMs || 0),
    finalDrainWindowMs: Number(source.finalDrainWindowMs || 0),
    mediaRecorderStateAtStopRequest: `${source.mediaRecorderStateAtStopRequest || ""}`,
    mediaRecorderStateAfterStop: `${source.mediaRecorderStateAfterStop || ""}`,
    streamActiveAtStop: typeof source.streamActiveAtStop === "boolean"
      ? source.streamActiveAtStop
      : null,
    trackReadyStateAtStop: `${source.trackReadyStateAtStop || ""}`,
    trackEnabledAtStop: typeof source.trackEnabledAtStop === "boolean"
      ? source.trackEnabledAtStop
      : null,
    trackMutedAtStop: typeof source.trackMutedAtStop === "boolean"
      ? source.trackMutedAtStop
      : null,
    webAudioTotalSampleCount: Number(source.webAudioTotalSampleCount || source.totalSampleCount || 0),
    wavEncodeInputSampleCount: Number(source.wavEncodeInputSampleCount || 0),
    rtsForcedPlayableByProbe: Boolean(source.rtsForcedPlayableByProbe),
    rtsProbeRejected: Boolean(source.rtsProbeRejected),
    rtsProbeErrorCode: `${source.rtsProbeErrorCode || ""}`,
    rtsSilentFallback: Boolean(source.rtsSilentFallback),
    rtsAudioInvalidReason: `${source.rtsAudioInvalidReason || ""}`,
    rtsFailureType: `${source.rtsFailureType || ""}`,
    rtsFailureStage: `${source.rtsFailureStage || ""}`,
    rtsExpectedDurationSec: Number(source.rtsExpectedDurationSec || 0),
    rtsOriginalStopErrorCode: `${source.rtsOriginalStopErrorCode || ""}`,
    rtsOriginalBlobIssueCode: `${source.rtsOriginalBlobIssueCode || ""}`
  };
}

function resolveRTSInvalidFailure(stopResult = recordingStopResult.value || null) {
  const source = stopResult && typeof stopResult === "object" ? stopResult : null;
  if (!source) {
    return {
      type: "NO_STOP_RESULT",
      stage: "unknown",
      message: "录音生成失败，请重新录制。"
    };
  }

  const stopErrorCode = `${source.stopErrorCode || ""}`.trim();
  const blobIssueCode = `${source.blobIssueCode || ""}`.trim();
  const playbackErrorCode = `${source.playableValidationErrorCode || ""}`.trim();
  const probeErrorCode = `${source.rtsProbeErrorCode || ""}`.trim();
  const blobSize = Number(source.blobSize ?? source.blob?.size ?? 0);
  const hasAudio = blobSize > 0;
  const usable = isUsableAudioRecord(source);
  const playbackUsable = isPlaybackUsableRecord(source);
  const silenceWarning = hasSilenceWarning(source);
  const finalUsableDecision = typeof source.finalUsableDecision === "boolean"
    ? source.finalUsableDecision
    : usable;
  const sharedLayerUsable = Boolean(source.rtsSharedLayerUsable);

  if (source.staleAttempt || stopErrorCode.startsWith("ATTEMPT_STALE")) {
    return {
      type: "ATTEMPT_STALE",
      stage: "lifecycle",
      message: "录音尚未真正开始，请重试。"
    };
  }
  if (playbackUsable && hasAudio && silenceWarning) {
    return {
      type: "SILENCE_WARNING",
      stage: "warning",
      message: "录音可回放，但疑似静音或有效声音较弱，建议重录。"
    };
  }
  if (playbackUsable && hasAudio) {
    return {
      type: source.rtsProbeRejected ? "RTS_PROBE_WARNING" : "NONE",
      stage: source.rtsProbeRejected ? "probe" : "success",
      message: source.rtsProbeRejected
        ? "RTS 二次 probe 未通过，但共享层已返回可播录音。"
        : "录音已生成，可直接回放。"
    };
  }
  if (source.rtsSilentFallback || blobIssueCode === "RTS_SILENT_FALLBACK" || silenceWarning) {
    return {
      type: "RTS_SILENT_FALLBACK",
      stage: "fallback",
      message: "录音疑似静音或有效声音较弱，请重录。"
    };
  }
  if (["RECORDER_STOP_EXCEPTION", "RECORDER_STOP_TIMEOUT", "RECOGNITION_STOP_TIMEOUT", "WEBAUDIO_STOP_FAILED"].includes(stopErrorCode)) {
    return {
      type: stopErrorCode || "RECORDER_STOP_FAILED",
      stage: "stop",
      message: "录音生成失败，请重新录制。"
    };
  }
  if (blobIssueCode === "AUDIO_BLOB_EMPTY") {
    return {
      type: "AUDIO_BLOB_EMPTY",
      stage: "recording",
      message: "录音无效，请重录（未采集到有效声音）。"
    };
  }
  if (blobIssueCode === "AUDIO_BLOB_TOO_SMALL") {
    return {
      type: "AUDIO_BLOB_TOO_SMALL",
      stage: "recording",
      message: "录音片段过短或采集不完整，请重录。"
    };
  }
  if (blobIssueCode === "AUDIO_MIME_UNSUPPORTED") {
    return {
      type: "AUDIO_MIME_UNSUPPORTED",
      stage: "codec",
      message: "录音格式兼容性异常，请重录。"
    };
  }
  if (source.rtsProbeRejected && sharedLayerUsable) {
    return {
      type: "RTS_PROBE_WARNING",
      stage: "probe",
      message: "RTS 二次 probe 未通过，但共享层已返回可播录音。"
    };
  }
  if (source.rtsProbeRejected || blobIssueCode === "AUDIO_BLOB_NOT_PLAYABLE") {
    return {
      type: source.rtsProbeRejected ? "RTS_PROBE_REJECTED" : "AUDIO_BLOB_NOT_PLAYABLE",
      stage: source.rtsProbeRejected ? "probe" : "playable_validation",
      message: "录音无效，请重录（音频不可播放）。"
    };
  }
  if (!usable && (playbackErrorCode || probeErrorCode)) {
    return {
      type: playbackErrorCode || probeErrorCode || "PLAYABLE_VALIDATION_FAILED",
      stage: playbackErrorCode ? "playable_validation" : "probe",
      message: hasAudio ? "录音数据已生成，但校验失败，请重录。" : "未采集到有效声音，请重录。"
    };
  }
  if (!hasAudio) {
    return {
      type: "NO_AUDIO_DATA",
      stage: "recording",
      message: "未检测到录音数据，请重试。"
    };
  }
  if (usable) {
    return {
      type: "NONE",
      stage: "success",
      message: "录音已生成，可直接回放。"
    };
  }
  return {
    type: source.rtsAudioInvalidReason || "UNKNOWN_INVALID",
    stage: source.rtsFailureStage || "validation",
    message: "录音无效，请重录。"
  };
}

function resolveRecorderFailureWithPlayback({
  stopResult = recordingStopResult.value || null,
  playbackUrlReady = Boolean(playbackUrl.value)
} = {}) {
  const baseFailure = resolveRTSInvalidFailure(stopResult);
  if (!stopResult) return baseFailure;
  const hasStopAudio = isPlaybackUsableRecord(stopResult);
  if (hasStopAudio && !playbackUrlReady) {
    return {
      type: "PLAYBACK_URL_CREATE_FAILED",
      stage: "playback_url",
      message: "录音已生成，但回放地址创建失败，请重录。"
    };
  }
  return baseFailure;
}

function formatRecorderFailureMessage(message = "", failureType = "") {
  const baseMessage = `${message || "录音无效，请重录。"}`
    .trim();
  const safeFailureType = `${failureType || ""}`.trim();
  if (!safeFailureType || !isRecorderDebugEnabled()) return baseMessage;
  if (baseMessage.includes(`（${safeFailureType}）`) || baseMessage.includes(`(${safeFailureType})`)) {
    return baseMessage;
  }
  return `${baseMessage}（${safeFailureType}）`;
}

function formatRecorderDiagValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "[]";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  }
  return `${value}`;
}

function buildRecorderDiagPayload({
  stopResult = recordingStopResult.value || null,
  failure = resolveRecorderFailureWithPlayback({ stopResult }),
  reason = "",
  stopRequestedAt = 0,
  stopCompletedAt = Date.now(),
  playbackUrlCreated = Boolean(playbackUrl.value)
} = {}) {
  const stopSummary = summarizeStopResult(stopResult);
  const probeResult = summarizePlaybackProbe(stopResult?.rtsPlaybackProbe);
  const deviceInfo = resolveRecorderDeviceInfo();
  const failureType = `${failure?.type || stopSummary.rtsFailureType || stopSummary.rtsAudioInvalidReason || ""}`.trim() || "NONE";
  const failureStage = `${failure?.stage || stopSummary.rtsFailureStage || ""}`.trim() || (failureType === "NONE" ? "success" : "unknown");
  const stopErrorMessage = `${stopSummary.stopErrorMessage || stopResult?.stopError || ""}`.trim()
    || `${probeResult.errorCode || stopSummary.playableValidationErrorCode || stopSummary.rtsProbeErrorCode || ""}`.trim();
  const durationMs = Number(stopSummary.playableDurationSec || 0) > 0
    ? Math.round(Number(stopSummary.playableDurationSec || 0) * 1000)
    : (recorderStartAtMs.value
      ? Math.max(0, Number(stopCompletedAt || Date.now()) - Number(recorderStartAtMs.value || 0))
      : 0);
  const previewState = previewPlaybackDiag.value || {};

  return {
    questionId: resolveCurrentQuestionId(),
    phase: currentPhase.value,
    ua: `${deviceInfo.ua || ""}`,
    timestamp: new Date(stopCompletedAt || Date.now()).toISOString(),
    failureType,
    failureStage,
    stopErrorCode: `${stopSummary.stopErrorCode || ""}`,
    stopErrorMessage,
    blobSize: Number(stopSummary.blobSize || 0),
    blobType: `${stopSummary.blobType || ""}`,
    durationMs: Number(durationMs || 0),
    hasUsableAudio: Boolean(stopSummary.hasUsableAudio) && !Boolean(stopSummary.rtsSilentFallback),
    finalPlaybackUsable: Boolean(stopSummary.finalPlaybackUsable),
    finalPlaybackReason: `${stopSummary.finalPlaybackReason || ""}`,
    finalBlobPlayable: Boolean(stopSummary.finalBlobPlayable),
    finalBlobOrigin: `${stopSummary.finalBlobOrigin || ""}`,
    fallbackInjectedForPreview: Boolean(stopSummary.fallbackInjectedForPreview),
    preFallbackBlobSize: Number(stopSummary.preFallbackBlobSize || 0),
    preFallbackProbePlayable: Boolean(stopSummary.preFallbackProbePlayable),
    silenceWarning: Boolean(stopSummary.finalSilenceWarning),
    finalSilenceWarning: Boolean(stopSummary.finalSilenceWarning),
    playbackUrlCreated: Boolean(playbackUrlCreated),
    dataEventCount: Number(stopSummary.dataEventCount || 0),
    chunkTotalBytes: Number(stopSummary.chunkTotalBytes || 0),
    chunkSizeList: Array.isArray(stopSummary.chunkSizeList) ? stopSummary.chunkSizeList : [],
    chunkMimeTypeList: Array.isArray(stopSummary.chunkMimeTypeList) ? stopSummary.chunkMimeTypeList : [],
    peakAmplitude: Number(stopSummary.peakAmplitude || 0),
    rmsAmplitude: Number(stopSummary.rmsAmplitude || 0),
    meanAbsAmplitude: Number(stopSummary.meanAbsAmplitude || 0),
    nonSilentFrameRatio: Number(stopSummary.nonSilentFrameRatio || 0),
    sampleRate: Number(stopSummary.sampleRate || 0),
    channelCount: Number(stopSummary.channelCount || 0),
    durationMs: Number(stopSummary.durationMs || 0),
    selectedMimeType: `${stopSummary.selectedMimeType || ""}`,
    mediaRecorderMimeType: `${stopSummary.mediaRecorderMimeType || ""}`,
    chunkMimeType: `${stopSummary.chunkMimeType || ""}`,
    lastChunkMimeType: `${stopSummary.lastChunkMimeType || ""}`,
    mimeTypePlayable: Boolean(stopSummary.mimeTypePlayable),
    sharedLayerUsable: Boolean(stopResult?.rtsSharedLayerUsable),
    recorderEngineAtStart: `${stopSummary.recorderEngineAtStart || ""}`,
    recorderEngineAtStop: `${stopSummary.recorderEngineAtStop || stopSummary.recorderEngine || ""}`,
    finalRecorderEngine: `${stopSummary.finalRecorderEngine || stopSummary.recorderEngine || ""}`,
    finalUsableDecision: typeof stopSummary.finalUsableDecision === "boolean"
      ? stopSummary.finalUsableDecision
      : Boolean(stopSummary.hasUsableAudio),
    finalUsableReason: `${stopSummary.finalUsableReason || ""}`,
    fallbackProducedBlob: Boolean(stopSummary.fallbackProducedBlob),
    fallbackBlobSize: Number(stopSummary.fallbackBlobSize || 0),
    rawChunkCount: Number(stopSummary.rawChunkCount || 0),
    rawChunkBytes: Number(stopSummary.rawChunkBytes || 0),
    mediaRecorderStateAtStopRequest: `${stopSummary.mediaRecorderStateAtStopRequest || ""}`,
    mediaRecorderStateAfterStop: `${stopSummary.mediaRecorderStateAfterStop || ""}`,
    stopWaitMs: Number(stopSummary.stopWaitMs || stopSummary.mediaStopMs || 0),
    finalDrainWaitMs: Number(stopSummary.finalDrainWaitMs || 0),
    finalDrainWindowMs: Number(stopSummary.finalDrainWindowMs || 0),
    streamActiveAtStop: stopSummary.streamActiveAtStop,
    trackReadyStateAtStop: `${stopSummary.trackReadyStateAtStop || ""}`,
    trackEnabledAtStop: stopSummary.trackEnabledAtStop,
    trackMutedAtStop: stopSummary.trackMutedAtStop,
    webAudioTotalSampleCount: Number(stopSummary.webAudioTotalSampleCount || 0),
    wavEncodeInputSampleCount: Number(stopSummary.wavEncodeInputSampleCount || 0),
    rtsProbeRejected: Boolean(stopSummary.rtsProbeRejected),
    rtsProbeWarningOnly: Boolean(stopResult?.rtsProbeRejected && stopResult?.rtsSharedLayerUsable),
    probeResult,
    previewAudioCreated: Boolean(previewState.audioCreated),
    previewAudioReadyState: Number(previewState.readyState || 0),
    previewAudioPaused: Boolean(previewState.paused),
    previewAudioEnded: Boolean(previewState.ended),
    previewAudioMuted: Boolean(previewState.muted),
    previewAudioVolume: Number(previewState.volume ?? 1),
    previewAudioCurrentTime: Number(previewState.currentTime || 0),
    previewAudioCurrentTimeAdvancing: Boolean(previewState.currentTimeAdvancing),
    usedSilentFallback: Boolean(stopSummary.rtsSilentFallback),
    stopReason: `${reason || stopSummary.stopReason || ""}`,
    stopRequestedAt: Number(stopRequestedAt || 0),
    stopCompletedAt: Number(stopCompletedAt || 0)
  };
}

function commitRecorderDiagPayload(payload = null) {
  recorderLastDiag.value = payload && typeof payload === "object" ? payload : null;
  if (typeof window !== "undefined") {
    window.__RTS_LAST_RECORDER_DIAG__ = recorderLastDiag.value;
  }
}

function resolveRecordingUnavailableMessage(stopResult = recordingStopResult.value || null) {
  const failure = resolveRecorderFailureWithPlayback({
    stopResult,
    playbackUrlReady: Boolean(playbackUrl.value)
  });
  return formatRecorderFailureMessage(failure.message, failure.type);
}

function resolveExpectedRecordingDurationSec(stopRequestedAt = Date.now()) {
  const elapsedByTimer = Math.max(0, Number(recordTotal.value || 0) - Number(recordRemaining.value || 0));
  const elapsedByClock = recorderStartAtMs.value
    ? Math.max(0, Math.round((Math.max(0, Number(stopRequestedAt || Date.now()) - Number(recorderStartAtMs.value || 0))) / 1000))
    : 0;
  return Math.max(RTS_SILENT_FALLBACK_MIN_SEC, elapsedByTimer, elapsedByClock);
}

const recordingUnavailableMessage = computed(() => resolveRecordingUnavailableMessage(recordingStopResult.value));

function logRecorderDebug(event, payload = {}) {
  if (!isRecorderDebugEnabled()) return;
  const questionId = resolveCurrentQuestionId();
  console.info("[rts-recorder]", event, {
    timestamp: Date.now(),
    questionId,
    phase: currentPhase.value,
    recorderPlaybackToken: resolveRecorderPlaybackToken(),
    scenePlaybackToken: Number(scenePlaybackToken || 0),
    ...payload
  });
}

function logUnavailableIfNeeded(trigger) {
  if (currentPhase.value !== PHASE.PLAYBACK) return;
  if (recordingFinalizePending.value) return;
  const usable = Boolean(hasPlaybackUsableAudio.value);
  const hasPlayback = Boolean(playbackUrl.value);
  if (usable && hasPlayback) return;
  const stopSummary = summarizeStopResult(recordingStopResult.value);
  const failure = resolveRecorderFailureWithPlayback({
    stopResult: recordingStopResult.value,
    playbackUrlReady: hasPlayback
  });
  const uniqueKey = [
    trigger,
    resolveCurrentQuestionId(),
    Number(stopSummary.attemptId || 0),
    `${stopSummary.stopErrorCode || ""}`,
    `${stopSummary.blobIssueCode || ""}`,
    `${failure.type || ""}`,
    usable ? "usable" : "not_usable",
    hasPlayback ? "has_playback" : "no_playback"
  ].join("|");
  if (uniqueKey === lastUnavailableDebugKey) return;
  lastUnavailableDebugKey = uniqueKey;
  logRecorderDebug("recording_unavailable", {
    trigger,
    hasUsableAudio: usable,
    hasPlaybackUrl: hasPlayback,
    unavailableMessage: recordingUnavailableMessage.value,
    failureType: `${failure.type || ""}`,
    failureStage: `${failure.stage || ""}`,
    playbackSrcKind: resolvePlaybackSrcKind(),
    recorderState: {
      isRecording: Boolean(recorder.isRecording.value),
      isReady: Boolean(recorder.isReady.value),
      isStopping: Boolean(recorder.isStopping.value),
      recordingStartPending: recordingStartPending.value,
      recordingStopReady: recordingStopReady.value
    },
    startMeta: summarizeStartMeta(),
    stopMeta: stopSummary,
    playbackProbe: summarizePlaybackProbe(),
    audioState: collectAudioLifecycleSnapshot()
  });
}

function clearAutoPlayTimer({ resolvePending = true, reason = "cleared" } = {}) {
  if (resolvePending && typeof autoPlayCountdownCancel === "function") {
    const cancel = autoPlayCountdownCancel;
    autoPlayCountdownCancel = null;
    cancel(reason);
  }
  clearTimeout(autoPlayTimer);
  autoPlayTimer = null;
  clearInterval(autoPlayTickTimer);
  autoPlayTickTimer = null;
  autoPlayCountdown.value = false;
  autoPlayCountdownRemaining.value = 0;
}

function waitForMs(ms) {
  const safeMs = Math.max(0, Number(ms || 0));
  if (!safeMs) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, safeMs);
  });
}

function isLikelyIOSWebKitRuntime() {
  if (typeof navigator === "undefined") return false;
  const ua = `${navigator.userAgent || ""}`;
  const platform = `${navigator.platform || ""}`;
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const isIOSDevice = /iP(ad|hone|od)/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  const hasAppleWebKit = /AppleWebKit/i.test(ua);
  return Boolean(isIOSDevice && hasAppleWebKit);
}

function shouldApplyPreviewRouteSwitchDelay() {
  return isLikelyIOSWebKitRuntime();
}

function refreshPreviewPlaybackDiag(audio = playbackAudioRef.value, { event = "", reason = "" } = {}) {
  const target = audio || null;
  const currentTime = Number(target?.currentTime || 0);
  const previousTime = Number(previewPlaybackLastCurrentTime || 0);
  const advanced = currentTime > previousTime + 0.015;
  previewPlaybackLastCurrentTime = currentTime;
  const nextDiag = {
    ...previewPlaybackDiag.value,
    audioCreated: Boolean(target),
    readyState: Number(target?.readyState || 0),
    paused: target ? Boolean(target.paused) : true,
    ended: target ? Boolean(target.ended) : false,
    muted: target ? Boolean(target.muted) : false,
    volume: target ? Number(target.volume ?? 1) : 1,
    currentTime,
    currentTimeAdvancing: Boolean(previewPlaybackDiag.value.currentTimeAdvancing || advanced),
    lastEvent: `${event || ""}`.trim(),
    lastReason: `${reason || ""}`.trim()
  };
  previewPlaybackDiag.value = nextDiag;
  if (recorderLastDiag.value && typeof recorderLastDiag.value === "object") {
    Object.assign(recorderLastDiag.value, {
      previewAudioCreated: Boolean(nextDiag.audioCreated),
      previewAudioReadyState: Number(nextDiag.readyState || 0),
      previewAudioPaused: Boolean(nextDiag.paused),
      previewAudioEnded: Boolean(nextDiag.ended),
      previewAudioMuted: Boolean(nextDiag.muted),
      previewAudioVolume: Number(nextDiag.volume ?? 1),
      previewAudioCurrentTime: Number(nextDiag.currentTime || 0),
      previewAudioCurrentTimeAdvancing: Boolean(nextDiag.currentTimeAdvancing)
    });
  }
}

function resetPreviewPlaybackDiag(reason = "manual_reset") {
  previewPlaybackLastCurrentTime = 0;
  const nextDiag = {
    audioCreated: false,
    readyState: 0,
    paused: true,
    ended: false,
    muted: false,
    volume: 1,
    currentTime: 0,
    currentTimeAdvancing: false,
    lastEvent: "",
    lastReason: `${reason || ""}`.trim()
  };
  previewPlaybackDiag.value = nextDiag;
  if (recorderLastDiag.value && typeof recorderLastDiag.value === "object") {
    Object.assign(recorderLastDiag.value, {
      previewAudioCreated: false,
      previewAudioReadyState: 0,
      previewAudioPaused: true,
      previewAudioEnded: false,
      previewAudioMuted: false,
      previewAudioVolume: 1,
      previewAudioCurrentTime: 0,
      previewAudioCurrentTimeAdvancing: false
    });
  }
}

async function waitForRecorderReleaseBeforePreview(reason = "preview_prepare") {
  const startedAt = Date.now();
  while (Date.now() - startedAt < RTS_PREVIEW_RECORDER_RELEASE_WAIT_MS) {
    const released = !recorder.isRecording.value && !recorder.isStopping.value && !recorder.isReady.value;
    if (released) break;
    await waitForMs(RTS_PREVIEW_RECORDER_RELEASE_POLL_MS);
  }
  const waitedMs = Math.max(0, Date.now() - startedAt);
  return {
    waitedMs,
    released: !recorder.isRecording.value && !recorder.isStopping.value && !recorder.isReady.value,
    reason: `${reason || ""}`.trim()
  };
}

async function preparePreviewPlaybackBeforeUrlCreate(reason = "preview_prepare") {
  const releaseMeta = await waitForRecorderReleaseBeforePreview(reason);
  const routeSwitchDelayMs = shouldApplyPreviewRouteSwitchDelay()
    ? RTS_PREVIEW_AUDIO_ROUTE_SWITCH_DELAY_IOS_WEBKIT_MS
    : 0;
  if (routeSwitchDelayMs > 0) {
    await waitForMs(routeSwitchDelayMs);
  }
  logRecorderDebug("preview_prepare_before_url_create", {
    reason,
    releaseMeta,
    routeSwitchDelayMs,
    audioState: collectAudioLifecycleSnapshot()
  });
}

function clearRecordingStopReadyTimer() {
  if (!recordingStopReadyTimer) return;
  clearTimeout(recordingStopReadyTimer);
  recordingStopReadyTimer = null;
}

function armRecordingStopReadiness({ attemptId, questionId, delayMs = RTS_STOP_READY_DELAY_MS } = {}) {
  clearRecordingStopReadyTimer();
  recordingStopReady.value = false;
  const safeDelayMs = Math.max(0, Number(delayMs || 0));
  if (!safeDelayMs) {
    recordingStopReady.value = true;
    return;
  }
  recordingStopReadyTimer = setTimeout(() => {
    const sameQuestion = `${currentQuestion.value?.id || ""}`.trim() === `${questionId || ""}`.trim();
    const currentAttemptId = Number(recorder.currentAttemptId.value || 0);
    if (currentPhase.value !== PHASE.RECORDING || !sameQuestion || currentAttemptId !== Number(attemptId || 0)) {
      return;
    }
    if (!recorder.isRecording.value || recorder.isStopping.value) {
      return;
    }
    recordingStopReady.value = true;
    logRecorderDebug("stop_ready", {
      attemptId: currentAttemptId,
      delayMs: safeDelayMs
    });
  }, safeDelayMs);
}

function isSceneAudioDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("RTS_AUDIO_DEBUG") === "1";
  } catch {
    return false;
  }
}

function logSceneAudio(event, payload = {}) {
  if (!isSceneAudioDebugEnabled()) return;
  console.info("[rts-audio]", event, {
    timestamp: Date.now(),
    questionId: resolveCurrentQuestionId(),
    phase: currentPhase.value,
    scenePlaybackToken: Number(scenePlaybackToken || 0),
    recorderPlaybackToken: resolveRecorderPlaybackToken(),
    ...payload
  });
}

function handleRTSPlaybackEvent(type, domEvent) {
  const target = domEvent?.target;
  const playbackKey = `${resolveCurrentQuestionId()}|${playbackUrl.value || ""}`;
  refreshPreviewPlaybackDiag(target || playbackAudioRef.value, {
    event: `playback_${type}`,
    reason: "dom_event"
  });
  if (type === "play" || type === "loadedmetadata" || type === "canplay") {
    playbackTimeupdateLogKey = "";
  }
  if (type === "timeupdate") {
    if (playbackTimeupdateLogKey === playbackKey) return;
    playbackTimeupdateLogKey = playbackKey;
  }
  logRecorderDebug(`playback_${type}`, {
    playbackSrcKind: resolvePlaybackSrcKind(),
    playbackUrlLength: Number(`${playbackUrl.value || ""}`.length || 0),
    currentTime: Number(target?.currentTime || 0),
    duration: Number(target?.duration || 0),
    readyState: Number(target?.readyState || 0),
    networkState: Number(target?.networkState || 0),
    errorCode: Number(target?.error?.code || 0),
    stopMeta: summarizeStopResult(recordingStopResult.value),
    playbackProbe: summarizePlaybackProbe()
  });
}

function ensureSceneAudioPlayer() {
  if (sceneAudioPlayer) return sceneAudioPlayer;
  const player = new Audio();
  player.preload = "auto";
  player.crossOrigin = "anonymous";
  sceneAudioPlayer = player;
  return player;
}

function resetSceneAudioHandlers(audio) {
  if (!audio) return;
  audio.onloadedmetadata = null;
  audio.oncanplay = null;
  audio.onplay = null;
  audio.onplaying = null;
  audio.onpause = null;
  audio.ontimeupdate = null;
  audio.onended = null;
  audio.onerror = null;
}

function resolveCurrentQuestionId() {
  return `${currentQuestion.value?.id || ""}`.trim();
}

function resolveAttemptId(stopResult = recordingStopResult.value) {
  return Math.max(0, Number(stopResult?.attemptId || 0));
}

function buildPracticeSubmitKey(questionId, attemptId) {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (!normalizedQuestionId) return "";
  return `${normalizedQuestionId}|${Math.max(0, Number(attemptId || 0))}`;
}

function resetCurrentPracticeSubmitState() {
  submitPending.value = false;
  submittedPracticeKey.value = "";
  lastPersistedPracticeKey.value = "";
  latestRTSAiReview.value = null;
  latestRTSAiReviewLoading.value = false;
  latestRTSAiReviewError.value = "";
  submitFeedbackState.value = {
    key: "",
    status: "idle",
    uploadOk: false,
    insertOk: false,
    hasRemoteAudioMeta: false
  };
  lastPersistedPracticeMeta.value = {
    key: "",
    userId: "",
    logId: "",
    transcript: "",
    scoreJson: null
  };
}

function updateSubmitFeedbackState({
  key = "",
  status = "idle",
  uploadOk = false,
  insertOk = false,
  hasRemoteAudioMeta = false
} = {}) {
  submitFeedbackState.value = {
    key: `${key || ""}`.trim(),
    status: `${status || "idle"}`.trim() || "idle",
    uploadOk: Boolean(uploadOk),
    insertOk: Boolean(insertOk),
    hasRemoteAudioMeta: Boolean(hasRemoteAudioMeta)
  };
}

function isPlaybackTokenActive(token, questionId = resolveCurrentQuestionId()) {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (!normalizedQuestionId) return false;
  return token === scenePlaybackToken && normalizedQuestionId === resolveCurrentQuestionId();
}

function revokeSceneAudioObjectUrl() {
  if (!sceneAudioObjectUrl || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  const target = sceneAudioObjectUrl;
  sceneAudioObjectUrl = "";
  try {
    URL.revokeObjectURL(target);
  } catch {
    // no-op
  }
}

function stopSceneAudioPlayback({
  resetStatus = false,
  invalidateToken = true,
  reason = "scene_stop"
} = {}) {
  const snapshotBefore = collectAudioLifecycleSnapshot();
  const previousToken = Number(scenePlaybackToken || 0);
  if (invalidateToken) {
    scenePlaybackToken += 1;
  }
  clearAutoPlayTimer();

  if (sceneAudioFetchController) {
    sceneAudioFetchController.abort();
    sceneAudioFetchController = null;
  }

  if (sceneAudioPlayer) {
    resetSceneAudioHandlers(sceneAudioPlayer);
    sceneAudioPlayer.pause();
    try {
      sceneAudioPlayer.currentTime = 0;
    } catch {
      // ignore
    }
    try {
      sceneAudioPlayer.src = "";
      sceneAudioPlayer.load();
    } catch {
      // ignore
    }
  }
  revokeSceneAudioObjectUrl();

  audioPreparing.value = false;
  audioReady.value = false;
  sceneAudioPaused.value = false;

  if (resetStatus) {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "idle",
      label: "点击播放场景",
      remaining: 0,
      total: 0
    });
  }
  logSceneAudio("scene_reset", {
    reason,
    invalidateToken: Boolean(invalidateToken),
    tokenBefore: previousToken,
    tokenAfter: Number(scenePlaybackToken || 0),
    snapshotBefore,
    snapshotAfter: collectAudioLifecycleSnapshot()
  });
}

function destroySceneAudioPlayer() {
  stopSceneAudioPlayback({ invalidateToken: true, reason: "destroy_scene_audio_player" });
  if (!sceneAudioPlayer) return;
  sceneAudioPlayer = null;
  logSceneAudio("scene_player_destroyed", collectAudioLifecycleSnapshot());
}

function resetRecorderPlaybackElement({ reason = "manual_reset", clearSource = false } = {}) {
  const playbackAudio = playbackAudioRef.value;
  if (!playbackAudio) {
    refreshPreviewPlaybackDiag(null, { event: "reset_without_element", reason });
    return;
  }
  try {
    playbackAudio.pause();
  } catch {
    // no-op
  }
  try {
    playbackAudio.currentTime = 0;
  } catch {
    // no-op
  }
  if (clearSource) {
    try {
      playbackAudio.removeAttribute("src");
      playbackAudio.src = "";
      playbackAudio.load();
    } catch {
      // no-op
    }
  }
  logRecorderDebug("playback_element_reset", {
    reason,
    clearSource,
    playbackElementState: {
      readyState: Number(playbackAudio.readyState || 0),
      networkState: Number(playbackAudio.networkState || 0),
      currentTime: Number(playbackAudio.currentTime || 0),
      duration: Number(playbackAudio.duration || 0),
      paused: Boolean(playbackAudio.paused)
    }
  });
  refreshPreviewPlaybackDiag(playbackAudio, { event: "reset", reason });
}

function revokePlaybackUrl({ reason = "manual_revoke" } = {}) {
  if (!playbackUrl.value || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  const target = playbackUrl.value;
  try {
    URL.revokeObjectURL(target);
  } catch {
    // no-op
  }
  playbackUrl.value = "";
  playbackTimeupdateLogKey = "";
  resetPreviewPlaybackDiag(`revoke:${reason}`);
  logRecorderDebug("playback_url_revoked", {
    reason,
    revokedUrlKind: target.startsWith("blob:") ? "blob" : "non_blob"
  });
}

async function setPlaybackUrlFromBlob(blob, { reason = "set_from_blob" } = {}) {
  resetRecorderPlaybackElement({ reason: `${reason}_before_set`, clearSource: true });
  revokePlaybackUrl({ reason: `${reason}_replace` });
  if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    refreshPreviewPlaybackDiag(null, { event: "url_create_skipped", reason });
    return false;
  }
  try {
    playbackUrl.value = URL.createObjectURL(blob);
    await nextTick();
    const playbackAudio = playbackAudioRef.value;
    if (playbackAudio) {
      playbackAudio.preload = "auto";
      playbackAudio.playsInline = true;
      playbackAudio.muted = false;
      playbackAudio.volume = 1;
      try {
        playbackAudio.currentTime = 0;
      } catch {
        // no-op
      }
      try {
        playbackAudio.load();
      } catch {
        // no-op
      }
      refreshPreviewPlaybackDiag(playbackAudio, { event: "url_created", reason });
    } else {
      refreshPreviewPlaybackDiag(null, { event: "url_created_missing_element", reason });
    }
    logRecorderDebug("playback_url_created", {
      reason,
      blobSize: Number(blob.size || 0),
      blobType: `${blob.type || ""}`.trim(),
      playbackSrcKind: resolvePlaybackSrcKind(),
      playbackUrlLength: Number(`${playbackUrl.value || ""}`.length || 0)
    });
    return Boolean(playbackUrl.value);
  } catch {
    playbackUrl.value = "";
    refreshPreviewPlaybackDiag(null, { event: "url_create_failed", reason });
    logRecorderDebug("playback_url_create_failed", {
      reason,
      blobSize: Number(blob.size || 0),
      blobType: `${blob.type || ""}`.trim()
    });
    return false;
  }
}

async function probeRecorderPlaybackBlob(blob, { questionId = "", attemptId = 0, reason = "stop" } = {}) {
  const probe = {
    reason,
    questionId: `${questionId || ""}`.trim(),
    attemptId: Number(attemptId || 0),
    blobSize: Number(blob?.size || 0),
    blobType: `${blob?.type || ""}`.trim(),
    objectUrlCreated: false,
    playInvoked: false,
    playResolved: false,
    playRejectedName: "",
    playRejectedMessage: "",
    playable: false,
    durationSec: 0,
    errorCode: "",
    readyState: 0,
    networkState: 0,
    audioErrorCode: 0,
    events: []
  };

  if (!blob || Number(blob.size || 0) <= 0) {
    probe.errorCode = "PLAYBACK_BLOB_EMPTY";
    return probe;
  }
  if (
    typeof document === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) {
    probe.errorCode = "PLAYBACK_PROBE_UNAVAILABLE";
    return probe;
  }

  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    let timer = null;
    let settled = false;
    let objectUrl = "";

    const pushEvent = (eventName) => {
      probe.events.push({
        event: `${eventName || ""}`,
        at: Date.now(),
        currentTime: Number(audio.currentTime || 0),
        duration: Number(audio.duration || 0),
        readyState: Number(audio.readyState || 0),
        networkState: Number(audio.networkState || 0),
        errorCode: Number(audio.error?.code || 0)
      });
    };

    const finish = (playable, errorCode = "", extra = {}) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      timer = null;

      probe.playable = Boolean(playable);
      probe.errorCode = `${errorCode || ""}`.trim();
      probe.durationSec = Number(extra.durationSec || probe.durationSec || 0);
      probe.readyState = Number(audio.readyState || 0);
      probe.networkState = Number(audio.networkState || 0);
      probe.audioErrorCode = Number(audio.error?.code || 0);

      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("error", onError);

      try {
        audio.pause();
      } catch {
        // no-op
      }
      try {
        audio.removeAttribute("src");
        audio.src = "";
        audio.load();
      } catch {
        // no-op
      }
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // no-op
        }
      }
      resolve(probe);
    };

    const markPlayableIfDetected = () => {
      const durationSec = Number(audio.duration || 0);
      if (Number.isFinite(durationSec) && durationSec > 0) {
        finish(true, "", { durationSec });
        return true;
      }
      const currentTime = Number(audio.currentTime || 0);
      if (currentTime > 0) {
        finish(true, "", { durationSec: currentTime });
        return true;
      }
      return false;
    };

    const onLoadedMetadata = () => {
      pushEvent("loadedmetadata");
      markPlayableIfDetected();
    };
    const onCanPlay = () => {
      pushEvent("canplay");
      if (markPlayableIfDetected()) return;
      if (Number(audio.readyState || 0) >= 3) {
        finish(true, "PLAYBACK_CANPLAY_READY", { durationSec: Number(audio.duration || 0) });
      }
    };
    const onPlaying = () => {
      pushEvent("playing");
      if (markPlayableIfDetected()) return;
      finish(true, "PLAYBACK_PLAYING_WITHOUT_DURATION", {
        durationSec: Number(audio.currentTime || 0)
      });
    };
    const onTimeUpdate = () => {
      pushEvent("timeupdate");
      if (markPlayableIfDetected()) return;
      finish(true, "PLAYBACK_TIMEUPDATE_WITHOUT_DURATION", {
        durationSec: Number(audio.currentTime || 0)
      });
    };
    const onError = () => {
      pushEvent("error");
      finish(false, "PLAYBACK_AUDIO_ERROR");
    };

    audio.preload = "metadata";
    audio.muted = true;
    audio.playsInline = true;
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("error", onError);

    timer = setTimeout(() => {
      pushEvent("timeout");
      finish(false, "PLAYBACK_PROBE_TIMEOUT");
    }, RTS_RECORDER_PLAYBACK_PROBE_TIMEOUT_MS);

    try {
      objectUrl = URL.createObjectURL(blob);
      probe.objectUrlCreated = true;
      pushEvent("object_url_created");
      audio.src = objectUrl;
      audio.load();
    } catch {
      finish(false, "PLAYBACK_PROBE_LOAD_FAILED");
      return;
    }

    try {
      const maybePlayPromise = audio.play?.();
      probe.playInvoked = true;
      if (maybePlayPromise && typeof maybePlayPromise.then === "function") {
        maybePlayPromise
          .then(() => {
            probe.playResolved = true;
            pushEvent("play_resolved");
            if (markPlayableIfDetected()) return;
            if (Number(audio.readyState || 0) >= 3) {
              finish(true, "PLAYBACK_READYSTATE_ONLY", { durationSec: Number(audio.duration || 0) });
            }
          })
          .catch((error) => {
            probe.playRejectedName = `${error?.name || ""}`.trim();
            probe.playRejectedMessage = `${error?.message || error || ""}`.trim();
            pushEvent("play_rejected");
            if (Number(audio.readyState || 0) >= 3) {
              finish(true, "PLAYBACK_READYSTATE_AFTER_REJECT", { durationSec: Number(audio.duration || 0) });
              return;
            }
            if (!markPlayableIfDetected()) {
              finish(false, "PLAYBACK_PLAY_REJECTED");
            }
          });
      }
    } catch (error) {
      probe.playRejectedName = `${error?.name || ""}`.trim();
      probe.playRejectedMessage = `${error?.message || error || ""}`.trim();
      pushEvent("play_exception");
      if (Number(audio.readyState || 0) >= 3) {
        finish(true, "PLAYBACK_READYSTATE_AFTER_EXCEPTION", { durationSec: Number(audio.duration || 0) });
        return;
      }
      if (!markPlayableIfDetected()) {
        finish(false, "PLAYBACK_PLAY_EXCEPTION");
      }
    }
  });
}

async function normalizeRTSStopResult(
  stopResult,
  {
    blob,
    reason = "stop_recording_phase",
    allowProbePromote = true,
    enforceProbeGate = true
  } = {}
) {
  const baseStopResult = stopResult && typeof stopResult === "object" ? { ...stopResult } : {};
  const candidateBlob = blob || baseStopResult.blob || null;
  if (!candidateBlob || Number(candidateBlob.size || 0) <= 0) {
    return baseStopResult;
  }

  const playbackProbe = await probeRecorderPlaybackBlob(candidateBlob, {
    questionId: resolveCurrentQuestionId(),
    attemptId: Number(baseStopResult?.attemptId || recorder.currentAttemptId.value || 0),
    reason
  });
  const normalizedBlobSize = Number(baseStopResult?.blobSize || candidateBlob.size || 0);
  const baseFinalUsable = typeof baseStopResult?.finalUsableDecision === "boolean"
    ? baseStopResult.finalUsableDecision
    : Boolean(baseStopResult?.hasUsableAudio);
  const baseBlobPlayable = typeof baseStopResult?.finalBlobPlayable === "boolean"
    ? baseStopResult.finalBlobPlayable
    : Boolean(baseStopResult?.previewPlayable || baseStopResult?.rtsPlaybackProbe?.playable);
  const basePlaybackUsable = typeof baseStopResult?.finalPlaybackUsable === "boolean"
    ? baseStopResult.finalPlaybackUsable
    : Boolean(baseBlobPlayable || baseFinalUsable);
  const baseSilenceWarning = typeof baseStopResult?.finalSilenceWarning === "boolean"
    ? baseStopResult.finalSilenceWarning
    : hasSilenceWarning(baseStopResult);
  const normalized = {
    ...baseStopResult,
    blob: candidateBlob,
    blobSize: normalizedBlobSize,
    hasAudio: normalizedBlobSize > 0,
    rtsSharedLayerUsable: baseFinalUsable,
    finalUsableDecision: baseFinalUsable,
    finalUsableReason: `${baseStopResult?.finalUsableReason || ""}`,
    finalPlaybackUsable: basePlaybackUsable,
    finalPlaybackReason: `${baseStopResult?.finalPlaybackReason || ""}`,
    finalBlobPlayable: baseBlobPlayable,
    finalSilenceWarning: baseSilenceWarning,
    rtsProbeRejected: false,
    rtsProbeWarningOnly: false,
    rtsProbeErrorCode: "",
    rtsPlaybackProbe: playbackProbe
  };

  const coreUsable = baseFinalUsable;
  const shouldAllowProbePromote = Boolean(allowProbePromote) && !normalized.rtsSilentFallback;
  if (!coreUsable && playbackProbe.playable && shouldAllowProbePromote) {
    normalized.hasUsableAudio = true;
    normalized.previewPlayable = true;
    normalized.finalUsableDecision = true;
    normalized.finalUsableReason = "RTS_PROBE_PLAYABLE";
    normalized.finalBlobPlayable = true;
    normalized.finalPlaybackUsable = true;
    normalized.finalPlaybackReason = "RTS_PROBE_PLAYABLE";
    normalized.rtsForcedPlayableByProbe = true;
    normalized.rtsProbeRejected = false;
    normalized.rtsProbeErrorCode = "";
    if (`${normalized.blobIssueCode || ""}` === "AUDIO_BLOB_NOT_PLAYABLE") {
      normalized.blobIssueCode = "";
    }
    if (!Number(normalized.playableDurationSec || 0) && Number(playbackProbe.durationSec || 0) > 0) {
      normalized.playableDurationSec = Number(playbackProbe.durationSec || 0);
    }
    const method = `${normalized.playableValidationMethod || ""}`.trim();
    normalized.playableValidationMethod = method ? `${method}+rts_probe` : "rts_probe";
    logRecorderDebug("stop_result_promoted_by_probe", {
      reason,
      rawStopMeta: summarizeStopResult(baseStopResult),
      playbackProbe: summarizePlaybackProbe(playbackProbe)
    });
  } else if (coreUsable && !playbackProbe.playable) {
    normalized.hasUsableAudio = true;
    normalized.previewPlayable = Boolean(baseStopResult?.previewPlayable);
    normalized.finalUsableDecision = true;
    normalized.finalUsableReason = `${normalized.finalUsableReason || "SHARED_LAYER_USABLE_PROBE_WARNING"}`;
    normalized.finalBlobPlayable = Boolean(baseStopResult?.previewPlayable);
    normalized.finalPlaybackUsable = Boolean(normalized.finalBlobPlayable || normalized.finalUsableDecision);
    normalized.finalPlaybackReason = `${normalized.finalPlaybackReason || "SHARED_LAYER_USABLE_PROBE_WARNING"}`;
    normalized.rtsForcedPlayableByProbe = false;
    normalized.rtsProbeRejected = true;
    normalized.rtsProbeWarningOnly = true;
    normalized.rtsProbeErrorCode = `${playbackProbe.errorCode || "PLAYBACK_PROBE_FAILED"}`;
    logRecorderDebug("stop_result_probe_warning", {
      reason,
      rawStopMeta: summarizeStopResult(baseStopResult),
      playbackProbe: summarizePlaybackProbe(playbackProbe)
    });
  } else {
    normalized.finalBlobPlayable = Boolean(normalized.finalBlobPlayable || playbackProbe.playable);
    normalized.finalPlaybackUsable = Boolean(
      normalized.finalPlaybackUsable
      || (normalized.blob && Number(normalized.blobSize || 0) > 0 && normalized.finalBlobPlayable)
    );
    if (!normalized.finalPlaybackReason && normalized.finalPlaybackUsable) {
      normalized.finalPlaybackReason = "FINAL_BLOB_PLAYABLE";
    }
  }
  normalized.finalSilenceWarning = hasSilenceWarning(normalized);
  if (normalized.finalUsableDecision) {
    normalized.rtsSharedLayerUsable = true;
    if (["AUDIO_BLOB_EMPTY", "AUDIO_BLOB_TOO_SMALL", "AUDIO_MIME_UNSUPPORTED", "AUDIO_BLOB_NOT_PLAYABLE"].includes(`${normalized.blobIssueCode || ""}`)) {
      normalized.blobIssueCode = "";
    }
    if (["AUDIO_BLOB_EMPTY", "AUDIO_BLOB_TOO_SMALL", "AUDIO_MIME_UNSUPPORTED", "AUDIO_BLOB_NOT_PLAYABLE"].includes(`${normalized.stopErrorCode || ""}`)) {
      normalized.stopErrorCode = "";
      normalized.stopErrorMessage = "";
    }
  }
  if (
    normalized.finalPlaybackUsable
    && (!normalized.finalPlaybackReason || normalized.finalPlaybackReason === "RTS_SILENT_FALLBACK")
  ) {
    normalized.finalPlaybackReason = "FINAL_BLOB_PLAYABLE";
  } else if (!normalized.finalPlaybackReason) {
    normalized.finalPlaybackReason = "FINAL_BLOB_NOT_PLAYABLE";
  }
  return normalized;
}

function resolveSceneAudioDurationSec(audio) {
  const raw = Number(audio?.duration || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(1, Math.ceil(raw));
}

function updateSceneAudioProgressTick() {
  if (!sceneAudioPlayer) return;
  const total = resolveSceneAudioDurationSec(sceneAudioPlayer);
  if (!total) return;

  const elapsed = Math.max(0, Number(sceneAudioPlayer.currentTime || 0));
  const progress = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  const remaining = Math.max(0, Math.ceil(total - elapsed));
  sceneAudioPaused.value = false;
  practiceStore.setRTSListeningStatus({
    progress,
    status: "playing",
    label: "播放中...",
    remaining,
    total
  });
}

function syncSceneAudioPausedStatus(audio = sceneAudioPlayer) {
  if (!audio) return;
  const total = resolveSceneAudioDurationSec(audio);
  const elapsed = Math.max(0, Number(audio.currentTime || 0));
  const progress = total > 0
    ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)))
    : 0;
  const remaining = total > 0
    ? Math.max(0, Math.ceil(total - elapsed))
    : 0;
  sceneAudioPaused.value = true;
  practiceStore.setRTSListeningStatus({
    progress,
    status: "paused",
    label: "已暂停，点击继续",
    remaining,
    total
  });
}

function setSceneAudioError(message) {
  sceneAudioError.value = `${message || ""}`.trim();
}

function reportSceneAudioFailure(message) {
  const fallbackMessage = `${message || "场景音频播放失败，请重试。"}`
    .trim();
  logSceneAudio("playback_failed", { message: fallbackMessage });
  setSceneAudioError(fallbackMessage);
  practiceStore.setRTSListeningStatus({
    progress: 0,
    status: "error",
    label: "播放失败，请重试",
    remaining: 0,
    total: 0
  });
  uiStore.showToast(fallbackMessage, "warning");
}

function scheduleSceneAutoPlay() {
  const questionId = resolveCurrentQuestionId();
  if (!questionId) return;
  logSceneAudio("auto_play_scheduled", {
    questionId,
    countdownSec: RTS_AUTO_PLAY_COUNTDOWN_SECONDS
  });
  void playSceneAudio({ reason: "auto", requireCountdown: true });
}

function resolveSceneAudioUrl() {
  return `${currentQuestion.value?.audio_url || ""}`.trim();
}

function resolveSceneAudioStoragePath(sceneAudioUrl) {
  const source = `${sceneAudioUrl || ""}`.trim();
  if (!source) return "";
  try {
    const parsed = new URL(source);
    return `${parsed.pathname || ""}`.trim();
  } catch {
    return "";
  }
}

function isAbortError(error) {
  return `${error?.name || ""}` === "AbortError";
}

function isAutoplayBlockedError(error) {
  const name = `${error?.name || ""}`.trim();
  const message = `${error?.message || ""}`.toLowerCase();
  if (name === "NotAllowedError") return true;
  return message.includes("user gesture") || message.includes("not allowed");
}

async function probeSceneAudioHeadersForDebug({ token, questionId, mode, sceneAudioUrl }) {
  if (!isSceneAudioDebugEnabled()) return;
  const source = `${sceneAudioUrl || ""}`.trim();
  if (!source) return;

  let timer = null;
  const controller = new AbortController();
  timer = setTimeout(() => {
    controller.abort();
  }, 3500);

  try {
    logSceneAudio("head_start", { token, questionId, mode, url: source });
    const response = await fetch(source, {
      method: "HEAD",
      signal: controller.signal,
      cache: "force-cache"
    });
    const rawLength = `${response?.headers?.get?.("content-length") || ""}`.trim();
    const parsedLength = Number(rawLength);
    logSceneAudio("head_done", {
      token,
      questionId,
      mode,
      status: Number(response?.status || 0),
      contentLength: Number.isFinite(parsedLength) && parsedLength > 0 ? parsedLength : 0,
      contentType: `${response?.headers?.get?.("content-type") || ""}`.trim()
    });
  } catch (error) {
    if (isAbortError(error)) {
      logSceneAudio("head_timeout", { token, questionId, mode });
      return;
    }
    logSceneAudio("head_failed", {
      token,
      questionId,
      mode,
      error: `${error?.message || error || ""}`.trim()
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createPlaybackSessionToken({ mode, questionId }) {
  stopSceneAudioPlayback({ invalidateToken: true, reason: `create_scene_token:${mode || "unknown"}` });
  const token = scenePlaybackToken;
  logSceneAudio("playback_token", { token, mode, questionId });
  return token;
}

function updateAutoPlayCountdownStatus(remaining) {
  const total = RTS_AUTO_PLAY_COUNTDOWN_SECONDS;
  const safeRemaining = Math.max(0, Math.round(Number(remaining || 0)));
  const progress = Math.max(0, Math.min(100, Math.round(((total - safeRemaining) / total) * 100)));
  practiceStore.setRTSListeningStatus({
    progress,
    status: "autoplay_countdown",
    label: `音频播放前（阅读与缓冲时间）${safeRemaining}s`,
    remaining: safeRemaining,
    total
  });
}

function runAutoPlayCountdown(token, questionId) {
  clearAutoPlayTimer();
  autoPlayCountdown.value = true;
  autoPlayCountdownRemaining.value = RTS_AUTO_PLAY_COUNTDOWN_SECONDS;
  updateAutoPlayCountdownStatus(autoPlayCountdownRemaining.value);
  logSceneAudio("auto_play_countdown_start", { token, questionId, remaining: autoPlayCountdownRemaining.value });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      autoPlayCountdownCancel = null;
      clearAutoPlayTimer({ resolvePending: false });
      if (ok) {
        logSceneAudio("auto_play_countdown_done", { token, questionId });
        if (isPlaybackTokenActive(token, questionId) && !audioReady.value) {
          practiceStore.setRTSListeningStatus({
            progress: 0,
            status: "autoplay_waiting_ready",
            label: "阅读与缓冲结束，正在等待音频就绪...",
            remaining: 0,
            total: 0
          });
        }
      } else if (reason) {
        logSceneAudio("auto_play_countdown_cancelled", { token, questionId, reason });
      }
      resolve(ok);
    };

    autoPlayCountdownCancel = (cancelReason) => {
      finish(false, cancelReason || "cancelled");
    };

    autoPlayTickTimer = setInterval(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      autoPlayCountdownRemaining.value = Math.max(0, autoPlayCountdownRemaining.value - 1);
      updateAutoPlayCountdownStatus(autoPlayCountdownRemaining.value);
    }, 1000);

    autoPlayTimer = setTimeout(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      finish(true, "done");
    }, RTS_AUTO_PLAY_COUNTDOWN_SECONDS * 1000);
  });
}

function waitForAudioEvent(audio, { token, questionId, eventName, readyStateMin }) {
  if (!isPlaybackTokenActive(token, questionId)) return Promise.resolve(false);

  if (Number(audio.readyState || 0) >= readyStateMin) {
    logSceneAudio(eventName, { token, questionId, readyState: Number(audio.readyState || 0) });
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      audio.removeEventListener(eventName, onEvent);
      audio.removeEventListener("error", onError);
      if (!ok && reason) {
        logSceneAudio(`${eventName}_wait_failed`, { token, questionId, reason, readyState: Number(audio.readyState || 0) });
      }
      resolve(ok);
    };

    const onEvent = () => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      logSceneAudio(eventName, { token, questionId, readyState: Number(audio.readyState || 0) });
      finish(true);
    };

    const onError = () => {
      finish(false, "audio_error");
    };

    timeoutId = setTimeout(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      if (Number(audio.readyState || 0) >= readyStateMin) {
        onEvent();
        return;
      }
      finish(false, "timeout");
    }, SCENE_READY_EVENT_TIMEOUT_MS);

    audio.addEventListener(eventName, onEvent, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

function handleActiveSceneAudioFailure({ token, questionId, mode, message, error }) {
  if (!isPlaybackTokenActive(token, questionId)) return;
  stopSceneAudioPlayback({ invalidateToken: false, reason: `scene_audio_failure:${mode || "unknown"}` });
  logSceneAudio("error", {
    token,
    questionId,
    mode,
    message,
    error: `${error?.message || error || ""}`.trim()
  });
  reportSceneAudioFailure(message);
}

async function prepareSceneAudioWithDirectUrl({ token, questionId, mode, sceneAudioUrl }) {
  if (!isPlaybackTokenActive(token, questionId)) return false;
  const audio = ensureSceneAudioPlayer();
  resetSceneAudioHandlers(audio);
  revokeSceneAudioObjectUrl();
  sceneAudioFetchController = null;

  try {
    audio.preload = "auto";
    audio.muted = false;
    audio.volume = 1;
    audio.playbackRate = 1;
    audio.src = sceneAudioUrl;
    logSceneAudio("audio_src_assigned", {
      token,
      questionId,
      mode,
      sourceMode: "direct_url",
      url: sceneAudioUrl
    });
    audio.load();
  } catch (error) {
    logSceneAudio("audio_src_assign_failed", {
      token,
      questionId,
      mode,
      sourceMode: "direct_url",
      error: `${error?.message || error || ""}`.trim()
    });
    return false;
  }

  const metadataReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "loadedmetadata",
    readyStateMin: 1
  });
  if (!metadataReady) return false;

  const canPlayReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "canplay",
    readyStateMin: 3
  });
  if (!canPlayReady) return false;
  if (!isPlaybackTokenActive(token, questionId)) return false;

  try {
    audio.currentTime = 0;
  } catch {
    // ignore
  }

  audioPreparing.value = false;
  audioReady.value = true;
  logSceneAudio("audio_ready", {
    token,
    questionId,
    mode,
    sourceMode: "direct_url",
    duration: Number(audio.duration || 0),
    readyState: Number(audio.readyState || 0)
  });
  return true;
}

async function prepareSceneAudioWithFetchBlob({ token, questionId, mode, sceneAudioUrl }) {
  if (!isPlaybackTokenActive(token, questionId)) return false;
  const controller = new AbortController();
  sceneAudioFetchController = controller;
  logSceneAudio("fetch_start", { token, questionId, mode, url: sceneAudioUrl });

  let response = null;
  try {
    response = await fetch(sceneAudioUrl, { signal: controller.signal });
  } catch (error) {
    if (sceneAudioFetchController === controller) {
      sceneAudioFetchController = null;
    }
    if (!isPlaybackTokenActive(token, questionId)) return false;
    if (isAbortError(error)) {
      logSceneAudio("fetch_aborted", { token, questionId, mode });
      return false;
    }
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频加载失败，请重试。", error });
    return false;
  }

  if (sceneAudioFetchController === controller) {
    sceneAudioFetchController = null;
  }
  if (!isPlaybackTokenActive(token, questionId)) return false;

  const rawContentLength = `${response?.headers?.get?.("content-length") || ""}`.trim();
  const parsedContentLength = Number(rawContentLength);
  logSceneAudio("fetch_done", {
    token,
    questionId,
    mode,
    status: Number(response?.status || 0),
    contentLength: Number.isFinite(parsedContentLength) && parsedContentLength > 0 ? parsedContentLength : 0
  });

  if (!response?.ok) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频加载失败，请重试。",
      error: new Error(`http_${response?.status || "unknown"}`)
    });
    return false;
  }

  let blob = null;
  try {
    blob = await response.blob();
  } catch (error) {
    if (!isPlaybackTokenActive(token, questionId)) return false;
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频解析失败，请重试。", error });
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) return false;
  logSceneAudio("blob_ready", {
    token,
    questionId,
    mode,
    sourceMode: "blob_object_url",
    size: Number(blob?.size || 0),
    type: `${blob?.type || ""}`.trim()
  });

  if (!blob || Number(blob.size || 0) <= 0) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频文件为空，请重试。",
      error: new Error("empty_audio_blob")
    });
    return false;
  }

  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(blob);
  } catch (error) {
    if (!isPlaybackTokenActive(token, questionId)) return false;
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频初始化失败，请重试。", error });
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // no-op
    }
    return false;
  }

  revokeSceneAudioObjectUrl();
  sceneAudioObjectUrl = objectUrl;
  logSceneAudio("object_url_created", { token, questionId, mode, sourceMode: "blob_object_url" });

  const audio = ensureSceneAudioPlayer();
  resetSceneAudioHandlers(audio);
  audio.preload = "auto";
  audio.muted = false;
  audio.volume = 1;
  audio.playbackRate = 1;
  audio.src = objectUrl;
  logSceneAudio("audio_src_assigned", { token, questionId, mode, sourceMode: "blob_object_url" });
  audio.load();

  const metadataReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "loadedmetadata",
    readyStateMin: 1
  });
  if (!metadataReady) {
    if (isPlaybackTokenActive(token, questionId)) {
      handleActiveSceneAudioFailure({
        token,
        questionId,
        mode,
        message: "场景音频元数据加载失败，请重试。",
        error: new Error("loadedmetadata_timeout")
      });
    }
    return false;
  }

  const canPlayReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "canplay",
    readyStateMin: 3
  });
  if (!canPlayReady) {
    if (isPlaybackTokenActive(token, questionId)) {
      handleActiveSceneAudioFailure({
        token,
        questionId,
        mode,
        message: "场景音频加载失败，请重试。",
        error: new Error("canplay_timeout")
      });
    }
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) return false;
  try {
    audio.currentTime = 0;
  } catch {
    // ignore
  }

  audioPreparing.value = false;
  audioReady.value = true;
  logSceneAudio("audio_ready", {
    token,
    questionId,
    mode,
    sourceMode: "blob_object_url",
    duration: Number(audio.duration || 0),
    readyState: Number(audio.readyState || 0)
  });
  return true;
}

async function prepareSceneAudio({ token, questionId, mode, sceneAudioUrl }) {
  if (!isPlaybackTokenActive(token, questionId)) return false;

  const storagePath = resolveSceneAudioStoragePath(sceneAudioUrl);
  audioPreparing.value = true;
  audioReady.value = false;

  logSceneAudio("prepare_start", {
    token,
    questionId,
    mode,
    strategy: RTS_SCENE_AUDIO_PREPARE_MODE,
    url: sceneAudioUrl,
    storagePath
  });
  void probeSceneAudioHeadersForDebug({ token, questionId, mode, sceneAudioUrl });

  if (mode === "manual") {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "loading",
      label: "加载场景音频...",
      remaining: 0,
      total: 0
    });
  }

  const directReady = await prepareSceneAudioWithDirectUrl({ token, questionId, mode, sceneAudioUrl });
  if (directReady) return true;
  if (!isPlaybackTokenActive(token, questionId)) return false;

  logSceneAudio("prepare_direct_failed", {
    token,
    questionId,
    mode,
    fallback: "blob_object_url"
  });
  return prepareSceneAudioWithFetchBlob({ token, questionId, mode, sceneAudioUrl });
}

async function playSceneAudio({ reason = "manual", requireCountdown = false } = {}) {
  if (!currentQuestion.value) return;
  if (currentPhase.value === PHASE.RECORDING || currentPhase.value === PHASE.PLAYBACK) {
    uiStore.showToast("请在听场景或准备阶段播放场景音频。", "warning");
    return;
  }

  const sceneAudioUrl = resolveSceneAudioUrl();
  if (!sceneAudioUrl) {
    reportSceneAudioFailure("该题场景音频缺失，请重试。");
    return;
  }
  const questionId = resolveCurrentQuestionId();
  const mode = reason === "auto" ? "auto" : "manual";
  if (mode !== "auto") {
    sceneAudioManualResumeRequired.value = false;
  }

  if (currentPhase.value === PHASE.PREPARING) {
    timer.stopPrepareCountdown();
  }

  if (currentPhase.value !== PHASE.LISTENING) {
    practiceStore.setRTSPhase(PHASE.LISTENING);
  }

  setSceneAudioError("");
  sceneAudioPaused.value = false;
  const token = createPlaybackSessionToken({ mode, questionId });
  const shouldRunCountdown = mode === "auto" && Boolean(requireCountdown);
  if (shouldRunCountdown) {
    logSceneAudio("auto_play_scheduled", {
      token,
      questionId,
      mode,
      countdownSec: RTS_AUTO_PLAY_COUNTDOWN_SECONDS
    });
  } else {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "loading",
      label: "加载场景音频...",
      remaining: 0,
      total: 0
    });
  }

  const toPrepareIfNeeded = () => {
    if (currentPhase.value === PHASE.LISTENING) {
      startPreparePhase();
    }
  };

  const [prepared, countdownDone] = await Promise.all([
    prepareSceneAudio({ token, questionId, mode, sceneAudioUrl }),
    shouldRunCountdown ? runAutoPlayCountdown(token, questionId) : Promise.resolve(true)
  ]);

  if (!prepared || !countdownDone || !isPlaybackTokenActive(token, questionId)) {
    return;
  }

  const audio = ensureSceneAudioPlayer();
  let firstTimeupdateFired = false;

  resetSceneAudioHandlers(audio);
  audio.onplay = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    sceneAudioManualResumeRequired.value = false;
    sceneAudioPaused.value = false;
    logSceneAudio("play_event", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  };
  audio.onplaying = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    sceneAudioManualResumeRequired.value = false;
    sceneAudioPaused.value = false;
    const total = resolveSceneAudioDurationSec(audio);
    const elapsed = Math.max(0, Number(audio.currentTime || 0));
    const progress = total > 0
      ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)))
      : 0;
    const remaining = total > 0
      ? Math.max(0, Math.ceil(total - elapsed))
      : 0;
    practiceStore.setRTSListeningStatus({
      progress,
      status: "playing",
      label: "播放中...",
      remaining,
      total
    });
    logSceneAudio("playing_event", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  };
  audio.onpause = () => {
    if (!isPlaybackTokenActive(token, questionId) || audio.ended) return;
    syncSceneAudioPausedStatus(audio);
    logSceneAudio("paused_event", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  };
  audio.ontimeupdate = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    updateSceneAudioProgressTick();
    if (firstTimeupdateFired) return;
    firstTimeupdateFired = true;
    logSceneAudio("first_timeupdate", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0)
    });
  };

  audio.onended = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    sceneAudioPaused.value = false;
    sceneAudioEndedAtMs.value = Date.now();
    const total = resolveSceneAudioDurationSec(audio);
    resetSceneAudioHandlers(audio);
    practiceStore.setRTSListeningStatus({
      progress: 100,
      status: "ended",
      label: "再次播放",
      remaining: 0,
      total
    });
    toPrepareIfNeeded();
    logSceneAudio("ended", {
      token,
      questionId,
      mode,
      duration: Number(audio.duration || 0)
    });
  };

  audio.onerror = () => {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频播放失败，请重试。",
      error: new Error("audio_onerror")
    });
  };

  try {
    audio.currentTime = 0;
    logSceneAudio("play_called", { token, questionId, mode, reason, url: sceneAudioUrl });
    await audio.play();
    logSceneAudio("play_resolved", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      readyState: Number(audio.readyState || 0)
    });
  } catch (error) {
    logSceneAudio("play_rejected", {
      token,
      questionId,
      mode,
      errorName: `${error?.name || ""}`.trim(),
      errorMessage: `${error?.message || error || ""}`.trim()
    });
    if (mode === "auto" && isAutoplayBlockedError(error)) {
      if (!isPlaybackTokenActive(token, questionId)) return;
      stopSceneAudioPlayback({ invalidateToken: false, reason: "auto_play_blocked" });
      sceneAudioManualResumeRequired.value = true;
      setSceneAudioError("自动播放被浏览器拦截，请点击下方按钮播放场景音频。");
      practiceStore.setRTSListeningStatus({
        progress: 0,
        status: "idle",
        label: "点击播放场景音频",
        remaining: 0,
        total: 0
      });
      return;
    }
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频播放失败，请重试。",
      error
    });
  }
}

async function toggleSceneAudioPause() {
  if (currentPhase.value !== PHASE.LISTENING) return;
  const questionId = resolveCurrentQuestionId();
  const audio = sceneAudioPlayer;
  if (!questionId || !audio || !audio.src) return;
  const token = scenePlaybackToken;
  if (!isPlaybackTokenActive(token, questionId)) return;

  if (!audio.paused && !audio.ended) {
    audio.pause();
    return;
  }

  if (audio.ended) {
    await playSceneAudio({ reason: "manual_resume" });
    return;
  }

  setSceneAudioError("");
  sceneAudioManualResumeRequired.value = false;
  try {
    await audio.play();
    sceneAudioPaused.value = false;
    logSceneAudio("resume_called", {
      token,
      questionId,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  } catch (error) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode: "manual",
      message: "场景音频恢复失败，请重试。",
      error
    });
  }
}

function skipSceneAudio() {
  if (currentPhase.value !== PHASE.LISTENING) return;
  const questionId = resolveCurrentQuestionId();
  if (!questionId) return;

  stopSceneAudioPlayback({ invalidateToken: true, reason: "manual_skip_audio" });
  sceneAudioManualResumeRequired.value = false;
  sceneAudioPaused.value = false;
  setSceneAudioError("");
  startPreparePhase();

  if (RTS_PRACTICE_DEBUG_ENABLED) {
    console.info("[rts-listening:skip-audio]", {
      questionId,
      listeningStatus: listeningStatus.value,
      audioPreparing: Boolean(audioPreparing.value)
    });
  }
}

function startPreparePhase() {
  clearRecordingStopReadyTimer();
  recordingStartPending.value = false;
  recordingStopReady.value = false;
  recorderStartAtMs.value = 0;
  practiceStore.setRTSPhase(PHASE.PREPARING);
  timer.startPrepareCountdown(RTS_PREPARE_SECONDS, () => {
    void startRecordingPhase();
  });
}

async function startRecordingPhase() {
  if (!currentQuestion.value || currentPhase.value === PHASE.RECORDING || recordingStartPending.value) return;
  const questionId = resolveCurrentQuestionId();
  if (!questionId) return;

  timer.stopPrepareCountdown();
  recordingStartPending.value = true;
  recordingStopReady.value = false;
  clearRecordingStopReadyTimer();

  const beginStartAt = Date.now();
  const elapsedSinceSceneEndedMs = sceneAudioEndedAtMs.value
    ? Math.max(0, beginStartAt - Number(sceneAudioEndedAtMs.value || 0))
    : 0;
  const settleDelayMs = sceneAudioEndedAtMs.value
    ? Math.max(0, RTS_SCENE_TO_RECORDING_STABILIZE_MS - elapsedSinceSceneEndedMs)
    : 0;
  if (settleDelayMs > 0) {
    logRecorderDebug("start_waiting_audio_settle", {
      questionId,
      settleDelayMs,
      elapsedSinceSceneEndedMs
    });
    await waitForMs(settleDelayMs);
  }

  const sameQuestionBeforeStart = resolveCurrentQuestionId() === questionId;
  const allowedPhase = currentPhase.value === PHASE.PREPARING || currentPhase.value === PHASE.LISTENING;
  if (!sameQuestionBeforeStart || !allowedPhase) {
    recordingStartPending.value = false;
    return;
  }

  stopSceneAudioPlayback({ reason: "start_recording_phase" });
  practiceStore.setRTSPhase(PHASE.RECORDING);

  const startRequestedAt = Date.now();
  recorderStartAtMs.value = startRequestedAt;
  lastUnavailableDebugKey = "";
  logRecorderDebug("start_requested", {
    startRequestedAt,
    device: resolveRecorderDeviceInfo(),
    startMeta: summarizeStartMeta()
  });

  let started = false;
  try {
    started = await recorder.startRecording({ allowWithoutSpeechRecognition: true });
  } catch (error) {
    started = false;
    logRecorderDebug("start_exception", {
      error: `${error?.message || error || ""}`.trim(),
      startMeta: summarizeStartMeta()
    });
  }
  if (!started) {
    recordingStartPending.value = false;
    recordingStopReady.value = false;
    clearRecordingStopReadyTimer();
    logRecorderDebug("start_failed", {
      startRequestedAt,
      startFailedAt: Date.now(),
      startLatencyMs: Math.max(0, Date.now() - startRequestedAt),
      recorderError: `${recorder.error.value || ""}`,
      startMeta: summarizeStartMeta()
    });
    practiceStore.setRTSPhase(PHASE.PREPARING);
    timer.startPrepareCountdown(RTS_PREPARE_SECONDS, () => {
      void startRecordingPhase();
    });
    return;
  }

  const sameQuestionAfterStart = resolveCurrentQuestionId() === questionId;
  if (!sameQuestionAfterStart || currentPhase.value !== PHASE.RECORDING) {
    recordingStartPending.value = false;
    return;
  }

  const startConfirmedAt = Date.now();
  recorderStartAtMs.value = startConfirmedAt;
  recordingStartPending.value = false;
  const attemptId = Number(recorder.currentAttemptId.value || 0);
  armRecordingStopReadiness({
    attemptId,
    questionId,
    delayMs: RTS_STOP_READY_DELAY_MS
  });
  logRecorderDebug("start_success", {
    startRequestedAt,
    startConfirmedAt,
    startLatencyMs: Math.max(0, startConfirmedAt - startRequestedAt),
    stopReadyDelayMs: RTS_STOP_READY_DELAY_MS,
    attemptId,
    selectedMimeType: `${recorder.lastStartMeta.value?.selectedMimeType || ""}`,
    startMeta: summarizeStartMeta()
  });

  timer.startRecordCountdown(40, () => {
    void stopRecordingPhase("timeout");
  });
}

function resolvePlaybackDuration(stopResult) {
  const direct = Number(stopResult?.playableDurationSec || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const elapsed = Math.max(0, recordTotal.value - recordRemaining.value);
  return elapsed;
}

async function stopRecordingPhase(reason = "manual") {
  if (currentPhase.value !== PHASE.RECORDING) return;
  if (reason === "manual" && !canStopRecording.value) {
    logRecorderDebug("stop_blocked_not_ready", {
      reason,
      attemptId: Number(recorder.currentAttemptId.value || 0),
      recorderState: {
        isRecording: Boolean(recorder.isRecording.value),
        isReady: Boolean(recorder.isReady.value),
        isStopping: Boolean(recorder.isStopping.value)
      },
      recordingStartPending: recordingStartPending.value,
      recordingStopReady: recordingStopReady.value
    });
    uiStore.showToast("录音启动中，请稍候。", "warning");
    return;
  }

  recordingStartPending.value = false;
  recordingStopReady.value = false;
  clearRecordingStopReadyTimer();
  timer.stopRecordCountdown();
  timer.stopPrepareCountdown();
  const stopRequestedAt = Date.now();
  const finalizeToken = recordingFinalizeToken + 1;
  recordingFinalizeToken = finalizeToken;
  const questionIdAtStop = `${currentQuestion.value?.id || ""}`.trim();
  recordingFinalizePending.value = true;
  practiceStore.setRTSPhase(PHASE.PLAYBACK);
  const activeAttemptId = Number(recorder.currentAttemptId.value || 0);
  logRecorderDebug("stop_requested", {
    reason,
    stopRequestedAt,
    attemptId: activeAttemptId,
    elapsedSinceStartMs: recorderStartAtMs.value ? Math.max(0, stopRequestedAt - Number(recorderStartAtMs.value || 0)) : 0,
    recorderState: {
      isRecording: Boolean(recorder.isRecording.value),
      isReady: Boolean(recorder.isReady.value),
      isStopping: Boolean(recorder.isStopping.value)
    }
  });
  try {
    const attemptId = Number(recorder.currentAttemptId.value || 0);
    const rawStopResult = await recorder.stopRecorderAndGetBlob({
      reason: `rts_${reason}`,
      attemptId: attemptId || undefined,
      skipPlayableValidation: false,
      retryNoAudioOnce: true
    });

    const stillCurrentQuestion = `${currentQuestion.value?.id || ""}`.trim() === questionIdAtStop;
    if (finalizeToken !== recordingFinalizeToken || !stillCurrentQuestion) {
      return;
    }

    const blob = rawStopResult?.blob || recorder.audioBlob.value || null;
    let stopResult = await normalizeRTSStopResult(rawStopResult, {
      blob,
      reason: `stop:${reason}`
    });
    recordRecorderStopStats({
      stopResult,
      phase: "raw",
      reason,
      usedSilentFallback: false
    });
    const stillCurrentQuestionAfterProbe = `${currentQuestion.value?.id || ""}`.trim() === questionIdAtStop;
    if (finalizeToken !== recordingFinalizeToken || !stillCurrentQuestionAfterProbe) {
      return;
    }
    let playbackBlob = stopResult?.blob || blob || null;
    let hasPlayableStopAudio = isUsableAudioRecord(stopResult);
    let hasPlayablePreviewAudio = isPlaybackUsableRecord(stopResult);
    const preFallbackBlob = playbackBlob;
    const preFallbackBlobSize = Number(preFallbackBlob?.size || 0);
    let preFallbackProbePlayable = Boolean(stopResult?.rtsPlaybackProbe?.playable);
    let preFallbackProbe = null;
    if (!hasPlayablePreviewAudio && preFallbackBlob && preFallbackBlobSize > 0 && !preFallbackProbePlayable) {
      preFallbackProbe = await probeRecorderPlaybackBlob(preFallbackBlob, {
        questionId: resolveCurrentQuestionId(),
        attemptId: Number(stopResult?.attemptId || recorder.currentAttemptId.value || 0),
        reason: `stop:${reason}:pre_fallback_probe`
      });
      preFallbackProbePlayable = Boolean(preFallbackProbe?.playable);
    }
    const shouldInjectSilentFallback = !hasPlayablePreviewAudio
      && !(preFallbackBlob && preFallbackBlobSize > 0 && preFallbackProbePlayable);
    if (!hasPlayablePreviewAudio && !shouldInjectSilentFallback && preFallbackBlob && preFallbackBlobSize > 0) {
      const promotedResult = {
        ...(stopResult && typeof stopResult === "object" ? stopResult : {}),
        blob: preFallbackBlob,
        blobSize: preFallbackBlobSize,
        hasAudio: true,
        previewPlayable: true,
        finalPlaybackUsable: true,
        finalPlaybackReason: `${stopResult?.finalPlaybackReason || "PREFALLBACK_CAPTURED_BLOB_PLAYABLE"}`,
        finalBlobPlayable: true,
        finalBlobOrigin: "captured_blob",
        fallbackInjectedForPreview: false,
        preFallbackBlobSize,
        preFallbackProbePlayable: true,
        finalSilenceWarning: hasSilenceWarning(stopResult)
      };
      if (preFallbackProbe) {
        promotedResult.rtsPlaybackProbe = preFallbackProbe;
      }
      stopResult = await normalizeRTSStopResult(promotedResult, {
        blob: preFallbackBlob,
        reason: `stop:${reason}:pre_fallback_promote`,
        allowProbePromote: true,
        enforceProbeGate: true
      });
      playbackBlob = stopResult?.blob || preFallbackBlob;
      hasPlayableStopAudio = isUsableAudioRecord(stopResult);
      hasPlayablePreviewAudio = isPlaybackUsableRecord(stopResult);
    }
    if (shouldInjectSilentFallback) {
      const expectedDurationSec = resolveExpectedRecordingDurationSec(stopRequestedAt);
      const silentFallbackBlob = createSilentWavBlob(expectedDurationSec);
      const fallbackBaseResult = {
        ...(stopResult && typeof stopResult === "object" ? stopResult : {}),
        blob: silentFallbackBlob,
        blobSize: Number(silentFallbackBlob.size || 0),
        hasAudio: true,
        hasUsableAudio: false,
        finalUsableDecision: false,
        finalUsableReason: "RTS_SILENT_FALLBACK",
        finalPlaybackUsable: false,
        finalPlaybackReason: "RTS_SILENT_FALLBACK",
        finalBlobPlayable: false,
        finalSilenceWarning: true,
        finalBlobOrigin: "synthetic_silent_fallback",
        fallbackInjectedForPreview: true,
        preFallbackBlobSize,
        preFallbackProbePlayable: Boolean(preFallbackProbePlayable),
        previewPlayable: false,
        blobIssueCode: "RTS_SILENT_FALLBACK",
        playableDurationSec: Math.max(
          Number(stopResult?.playableDurationSec || 0),
          Number(expectedDurationSec || 0)
        ),
        rtsSilentFallback: true,
        rtsAudioInvalidReason: "SILENT_FALLBACK_USED",
        rtsExpectedDurationSec: Number(expectedDurationSec || 0),
        rtsOriginalStopErrorCode: `${stopResult?.stopErrorCode || ""}`,
        rtsOriginalBlobIssueCode: `${stopResult?.blobIssueCode || ""}`
      };
      stopResult = await normalizeRTSStopResult(fallbackBaseResult, {
        blob: silentFallbackBlob,
        reason: `stop:${reason}:silent_fallback`,
        allowProbePromote: false,
        enforceProbeGate: true
      });
      playbackBlob = stopResult?.blob || null;
      hasPlayableStopAudio = isUsableAudioRecord(stopResult);
      hasPlayablePreviewAudio = isPlaybackUsableRecord(stopResult);
      logRecorderDebug("stop_result_silent_fallback", {
        reason,
        expectedDurationSec,
        rawStopMeta: summarizeStopResult(rawStopResult),
        stopMeta: summarizeStopResult(stopResult),
        playbackProbe: summarizePlaybackProbe(stopResult?.rtsPlaybackProbe)
      });
    } else {
      stopResult = {
        ...(stopResult && typeof stopResult === "object" ? stopResult : {}),
        finalBlobOrigin: `${stopResult?.finalBlobOrigin || "captured_blob"}`,
        fallbackInjectedForPreview: false,
        preFallbackBlobSize: Number(preFallbackBlobSize || 0),
        preFallbackProbePlayable: Boolean(preFallbackProbePlayable),
        finalPlaybackUsable: Boolean(stopResult?.finalPlaybackUsable || hasPlayablePreviewAudio),
        finalBlobPlayable: Boolean(
          stopResult?.finalBlobPlayable
          || preFallbackProbePlayable
          || stopResult?.rtsPlaybackProbe?.playable
          || hasPlayablePreviewAudio
        )
      };
    }
    playbackDurationSec.value = resolvePlaybackDuration(stopResult);
    practiceStore.setAudioBlob(hasPlayablePreviewAudio ? playbackBlob : null);
    recordRecorderStopStats({
      stopResult,
      phase: stopResult?.rtsSilentFallback ? "fallback" : "final",
      reason,
      usedSilentFallback: Boolean(stopResult?.rtsSilentFallback)
    });
    let playbackUrlReady = false;
    if (hasPlayablePreviewAudio) {
      await preparePreviewPlaybackBeforeUrlCreate(`stop_result:${reason}`);
      playbackUrlReady = await setPlaybackUrlFromBlob(playbackBlob, { reason: `stop_result:${reason}` });
    } else {
      resetRecorderPlaybackElement({ reason: `stop_result_unusable:${reason}`, clearSource: true });
      revokePlaybackUrl({ reason: `stop_result_unusable:${reason}` });
      resetPreviewPlaybackDiag(`stop_result_unusable:${reason}`);
      playbackUrlReady = false;
    }
    stopResult = {
      ...(stopResult && typeof stopResult === "object" ? stopResult : {}),
      finalUsableDecision: typeof stopResult?.finalUsableDecision === "boolean"
        ? stopResult.finalUsableDecision
        : Boolean(hasPlayableStopAudio),
      finalUsableReason: `${stopResult?.finalUsableReason || (hasPlayableStopAudio ? "RTS_FINAL_PLAYABLE" : "RTS_FINAL_UNUSABLE")}`,
      rtsSharedLayerUsable: Boolean(
        typeof stopResult?.finalUsableDecision === "boolean"
          ? stopResult.finalUsableDecision
          : hasPlayableStopAudio
      ),
      finalPlaybackUsable: Boolean(stopResult?.finalPlaybackUsable || hasPlayablePreviewAudio),
      finalPlaybackReason: (() => {
        const rawReason = `${stopResult?.finalPlaybackReason || ""}`.trim();
        if (hasPlayablePreviewAudio) {
          if (!rawReason || rawReason === "RTS_SILENT_FALLBACK") return "RTS_PREVIEW_PLAYABLE";
          return rawReason;
        }
        return rawReason || "RTS_PREVIEW_UNUSABLE";
      })(),
      finalBlobPlayable: Boolean(
        stopResult?.finalBlobPlayable
        || stopResult?.rtsPlaybackProbe?.playable
        || stopResult?.previewPlayable
        || hasPlayablePreviewAudio
      ),
      finalBlobOrigin: `${stopResult?.finalBlobOrigin || (stopResult?.fallbackInjectedForPreview ? "synthetic_silent_fallback" : "captured_blob")}`,
      fallbackInjectedForPreview: Boolean(stopResult?.fallbackInjectedForPreview),
      preFallbackBlobSize: Number(stopResult?.preFallbackBlobSize || preFallbackBlobSize || 0),
      preFallbackProbePlayable: Boolean(stopResult?.preFallbackProbePlayable || preFallbackProbePlayable),
      finalSilenceWarning: hasSilenceWarning(stopResult),
      playbackUrlCreated: Boolean(playbackUrlReady)
    };
    const resolvedFailure = resolveRecorderFailureWithPlayback({
      stopResult,
      playbackUrlReady
    });
    const shouldMarkFailure = !hasPlayablePreviewAudio || !playbackUrlReady;
    stopResult = {
      ...(stopResult && typeof stopResult === "object" ? stopResult : {}),
      rtsFailureType: shouldMarkFailure ? `${resolvedFailure.type || "UNKNOWN_INVALID"}` : "",
      rtsFailureStage: shouldMarkFailure ? `${resolvedFailure.stage || "validation"}` : "",
      rtsAudioInvalidReason: shouldMarkFailure
        ? `${stopResult?.rtsAudioInvalidReason || resolvedFailure.type || "UNKNOWN_INVALID"}`
        : ""
    };
    recordingStopResult.value = stopResult;
    await nextTick();
    refreshPreviewPlaybackDiag(playbackAudioRef.value, {
      event: "stop_result_committed",
      reason: `stop:${reason}`
    });
    if (shouldMarkFailure) {
      uiStore.showToast(
        formatRecorderFailureMessage(
          resolvedFailure.message || "录音无效，请重录。",
          resolvedFailure.type
        ),
        "warning"
      );
    }
    const stopCompletedAt = Date.now();
    commitRecorderDiagPayload(
      buildRecorderDiagPayload({
        stopResult,
        failure: resolvedFailure,
        reason,
        stopRequestedAt,
        stopCompletedAt,
        playbackUrlCreated: playbackUrlReady
      })
    );
    logRecorderDebug("stop_result", {
      reason,
      stopRequestedAt,
      stopCompletedAt,
      stopLatencyMs: Math.max(0, stopCompletedAt - stopRequestedAt),
      elapsedSinceStartMs: recorderStartAtMs.value ? Math.max(0, stopCompletedAt - Number(recorderStartAtMs.value || 0)) : 0,
      playbackSrcKind: resolvePlaybackSrcKind(),
      playbackUrlReady,
      startMeta: summarizeStartMeta(),
      hasPlayableStopAudio,
      hasPlayablePreviewAudio,
      failureType: shouldMarkFailure ? `${resolvedFailure.type || ""}` : "",
      failureStage: shouldMarkFailure ? `${resolvedFailure.stage || ""}` : "",
      failureMessage: shouldMarkFailure ? `${resolvedFailure.message || ""}` : "",
      unavailableMessage: shouldMarkFailure ? resolveRecordingUnavailableMessage(stopResult) : "",
      rawStopMeta: summarizeStopResult(rawStopResult),
      stopMeta: summarizeStopResult(stopResult),
      playbackProbe: summarizePlaybackProbe(stopResult?.rtsPlaybackProbe),
      audioState: collectAudioLifecycleSnapshot()
    });
    logUnavailableIfNeeded("after_stop");
  } finally {
    if (finalizeToken === recordingFinalizeToken) {
      recordingFinalizePending.value = false;
    }
  }
}

async function stopRecorderSafely({ reason = "rts_switch" } = {}) {
  const attemptId = Number(recorder.currentAttemptId.value || 0);
  const shouldStop = Boolean(recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value);
  if (!shouldStop || !attemptId) {
    logRecorderDebug("stop_recorder_safely_skipped", {
      reason,
      shouldStop,
      attemptId
    });
    return;
  }
  logRecorderDebug("stop_recorder_safely_start", {
    reason,
    attemptId
  });
  try {
    await recorder.stopRecorderAndGetBlob({
      reason,
      attemptId,
      skipPlayableValidation: true
    });
    logRecorderDebug("stop_recorder_safely_done", {
      reason,
      attemptId
    });
  } catch {
    logRecorderDebug("stop_recorder_safely_failed", {
      reason,
      attemptId
    });
  }
}

function favoriteStorageKey(userId) {
  return `kai_kou_rts_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  const key = favoriteStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((item) => `${item || ""}`.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFavorites(userId, favoriteSet) {
  const key = favoriteStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify([...favoriteSet]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

function isDuplicateInsertError(error) {
  return `${error?.code || ""}` === "23505";
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadFavoriteState() {
  const userId = await resolveCurrentUserId();
  const questionId = `${currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) {
    isFavorite.value = false;
    return;
  }

  const localFavorites = readLocalFavorites(userId);
  isFavorite.value = localFavorites.has(questionId);

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("task_type", "RTS")
      .eq("question_id", questionId)
      .limit(1);

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        favoriteSource.value = "local";
        return;
      }
      throw error;
    }

    favoriteSource.value = "remote";
    isFavorite.value = Array.isArray(data) && data.length > 0;
    if (isFavorite.value) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
  } catch (error) {
    console.warn("RTS favorite load fallback to local:", error);
    favoriteSource.value = "local";
  }
}

async function toggleFavorite() {
  if (favoriteBusy.value) return;
  const userId = await resolveCurrentUserId();
  const questionId = `${currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) return;

  favoriteBusy.value = true;
  try {
    const next = !isFavorite.value;
    const localFavorites = readLocalFavorites(userId);
    if (next) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
    isFavorite.value = next;

    if (favoriteSource.value !== "local") {
      if (next) {
        const { error } = await supabase.from("favorites").insert({ user_id: userId, task_type: "RTS", question_id: questionId });
        if (error && !isDuplicateInsertError(error)) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("task_type", "RTS")
          .eq("question_id", questionId);
        if (error) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      }
    }
  } catch (error) {
    console.warn("RTS favorite toggle failed:", error);
  } finally {
    favoriteBusy.value = false;
  }
}

async function loadTodayStatsPanel() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    todayStats.value = { practicedCount: 0, practiceMinutes: 0 };
    remoteRecentHistory.value = [];
    historyPlaybackStateMap.value = {};
    return;
  }

  const stats = await getUserRTSStats(userId, {
    logsLimit: 400,
    currentQuestionId: resolveCurrentQuestionId()
  });
  const recentAudioHistory = await getRTSRecentAudioHistory(userId, {
    limit: RTS_HISTORY_LIMIT,
    includePlaybackUrls: false
  });
  todayStats.value = {
    practicedCount: Number(stats.todayPracticed || 0),
    practiceMinutes: Number(stats.todayMinutes || 0)
  };
  remoteRecentHistory.value = Array.isArray(recentAudioHistory) ? recentAudioHistory : [];
  historyPlaybackStateMap.value = {};
  if (RTS_PRACTICE_DEBUG_ENABLED) {
    console.info("[rts-practice:history-load]", {
      remoteRecentHistoryLength: Number(remoteRecentHistory.value.length || 0),
      hasLocalFallback: false,
      localRecentRecordingCount: Number(practiceStore.rtsRecentRecordings?.length || 0)
    });
  }
}

function createPersistOutcome(overrides = {}) {
  return {
    attemptId: 0,
    userId: "",
    uploadOk: false,
    insertOk: false,
    hasRemoteAudioMeta: false,
    savedLogId: "",
    transcript: "",
    scoreJson: null,
    feedback: "",
    audioBucket: "",
    audioPath: "",
    ...overrides
  };
}

async function persistCurrentPractice({
  stopResult: stopResultOverride = null,
  question: questionOverride = null,
  durationSec: durationSecOverride = null
} = {}) {
  const effectiveStopResult = stopResultOverride || recordingStopResult.value || null;
  const attemptId = Math.max(0, Number(effectiveStopResult?.attemptId || 0));
  const userId = await resolveCurrentUserId();
  const effectiveQuestion = questionOverride || currentQuestion.value || null;
  if (!userId || !effectiveQuestion) {
    const missingContextOutcome = createPersistOutcome({ attemptId });
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-practice:persist]", missingContextOutcome);
    }
    return missingContextOutcome;
  }

  const effectiveDurationSec = durationSecOverride == null ? Number(playbackDurationSec.value || 0) : Number(durationSecOverride || 0);
  const persistKey = `${effectiveQuestion.id || ""}|${attemptId}|${effectiveDurationSec}`;
  if (persistKey === lastPersistedPracticeKey.value) {
    const persistedMeta = lastPersistedPracticeMeta.value || {};
    const skippedOutcome = createPersistOutcome({
      attemptId,
      userId: `${persistedMeta.userId || userId}`.trim(),
      uploadOk: true,
      insertOk: true,
      hasRemoteAudioMeta: true,
      savedLogId: `${persistedMeta.logId || ""}`.trim(),
      transcript: `${persistedMeta.transcript || ""}`.trim(),
      scoreJson: toObjectValue(persistedMeta.scoreJson),
      feedback: ""
    });
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-practice:persist]", skippedOutcome);
    }
    return skippedOutcome;
  }

  const stopBlob = effectiveStopResult?.blob || null;
  const stopBlobSize = Number(effectiveStopResult?.blobSize ?? stopBlob?.size ?? 0);
  const stopBlobIssueCode = `${effectiveStopResult?.blobIssueCode || ""}`.trim();
  const stopSilentFallback = Boolean(effectiveStopResult?.rtsSilentFallback) || stopBlobIssueCode === "RTS_SILENT_FALLBACK";

  let playbackBlob = null;
  if (!stopSilentFallback && stopBlob && stopBlobSize > 0) {
    playbackBlob = stopBlob;
  } else if (practiceStore.audioBlob && Number(practiceStore.audioBlob?.size || 0) > 0) {
    playbackBlob = practiceStore.audioBlob;
  }

  const audioMeta = await uploadRTSAudio({
    userId,
    questionId: effectiveQuestion.id,
    attemptId,
    blob: playbackBlob
  });
  const uploadOk = Boolean(audioMeta?.bucket && audioMeta?.path);
  if (!uploadOk) {
    const failedUploadOutcome = createPersistOutcome({
      attemptId,
      userId,
      uploadOk: false,
      insertOk: false,
      hasRemoteAudioMeta: false,
      savedLogId: "",
      audioBucket: "",
      audioPath: ""
    });
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-practice:persist]", failedUploadOutcome);
    }
    return failedUploadOutcome;
  }
  const normalizedAttemptId = Math.max(0, Number(attemptId || 0));
  const transcriptText = `${effectiveStopResult?.transcript || recorder.transcript.value || ""}`.trim();
  const promptPlaySec = Math.max(0, Math.round(Number(listeningTotal.value || 0)));
  const recordSec = Math.max(0, Math.round(Number(effectiveDurationSec || 0)));
  const analyticsSource = promptPlaySec > 0 && recordSec > 0
    ? "computed_client_flow"
    : "fallback_existing_duration";
  const analytics = buildPracticeAnalytics({
    source: analyticsSource,
    totalActiveSec: promptPlaySec + recordSec,
    breakdown: {
      prompt_play_sec: promptPlaySec,
      record_sec: recordSec,
      speech_sec: recordSec
    }
  });
  const audioPayload = {
    ...audioMeta,
    attemptId: normalizedAttemptId,
    status: "ready"
  };

  const payload = {
    user_id: userId,
    task_type: "RTS",
    question_id: effectiveQuestion.id,
    transcript: transcriptText,
    score_json: {
      duration_sec: effectiveDurationSec,
      topic: effectiveQuestion.topic,
      tone: effectiveQuestion?.key_points?.tone || "",
      question_content: `${effectiveQuestion?.content || ""}`.trim(),
      question_meta: buildRTSQuestionMetaPayload(effectiveQuestion),
      analytics,
      audio_signals: buildRTSAudioSignalsPayload(effectiveStopResult, effectiveDurationSec),
      ai_review_job: createPendingRTSAiReviewJob(),
      audio: audioPayload
    },
    feedback: "",
    created_at: new Date().toISOString()
  };

  const { data: insertedRow, error } = await supabase
    .from("practice_logs")
    .insert(payload)
    .select("id, task_type, score_json, transcript, feedback")
    .single();
  if (error) {
    if (audioMeta?.bucket && audioMeta?.path) {
      try {
        const { error: removeError } = await supabase.storage
          .from(audioMeta.bucket)
          .remove([audioMeta.path]);
        if (removeError) {
          console.warn("RTS uploaded audio compensation remove failed:", removeError, {
            questionId: effectiveQuestion.id,
            path: audioMeta.path
          });
        }
      } catch (removeException) {
        console.warn("RTS uploaded audio compensation remove failed:", removeException, {
          questionId: effectiveQuestion.id,
          path: audioMeta.path
        });
      }
    }
    console.warn("RTS practice_logs insert failed:", error, { questionId: currentQuestion.value.id });
    lastPersistedPracticeMeta.value = {
      key: "",
      userId: "",
      logId: "",
      transcript: "",
      scoreJson: null
    };
    const failedOutcome = createPersistOutcome({
      attemptId,
      userId,
      uploadOk,
      insertOk: false,
      hasRemoteAudioMeta: false,
      savedLogId: "",
      audioBucket: `${audioMeta?.bucket || ""}`.trim(),
      audioPath: `${audioMeta?.path || ""}`.trim()
    });
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-practice:persist]", failedOutcome);
    }
    return failedOutcome;
  }

  const savedLogId = `${insertedRow?.id || ""}`.trim();
  const insertedScoreJson = toObjectValue(insertedRow?.score_json) || toObjectValue(payload.score_json);
  const insertedTranscript = `${insertedRow?.transcript || payload.transcript || ""}`.trim();
  const insertedFeedback = `${insertedRow?.feedback || payload.feedback || ""}`.trim();
  const remoteAudioMetaReady = Boolean(
    uploadOk
    && isValidRTSRemoteHistoryRecord({
      task_type: `${insertedRow?.task_type || "RTS"}`.trim(),
      score_json: insertedScoreJson || payload.score_json
    })
  );
  lastPersistedPracticeMeta.value = {
    key: persistKey,
    userId,
    logId: savedLogId,
    transcript: insertedTranscript,
    scoreJson: insertedScoreJson || null
  };
  if (remoteAudioMetaReady) {
    try {
      await applyRTSAudioRetentionForUser(userId, {
        keepCount: RTS_HISTORY_LIMIT
      });
    } catch (retentionError) {
      console.warn("RTS retention run failed:", retentionError, {
        userId,
        logId: savedLogId,
        keepCount: RTS_HISTORY_LIMIT
      });
    }
    lastPersistedPracticeKey.value = persistKey;
  }
  const successOutcome = createPersistOutcome({
    attemptId,
    userId,
    uploadOk,
    insertOk: true,
    hasRemoteAudioMeta: remoteAudioMetaReady,
    savedLogId,
    transcript: insertedTranscript,
    scoreJson: insertedScoreJson || null,
    feedback: insertedFeedback,
    audioBucket: `${audioMeta?.bucket || ""}`.trim(),
    audioPath: `${audioMeta?.path || ""}`.trim()
  });
  if (RTS_PRACTICE_DEBUG_ENABLED) {
    console.info("[rts-practice:persist]", successOutcome);
  }
  return successOutcome;
}

function toObjectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeTextValue(value) {
  return `${value || ""}`.trim();
}

function normalizeTraitScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function mapRTSRawToDisplay(rawScore, rawMax) {
  const boundedRaw = normalizeTraitScore(rawScore, 0, rawMax);
  if (rawMax <= 0) return RTS_DISPLAY_MIN_SCORE;
  return normalizeTraitScore(
    Math.round(RTS_DISPLAY_MIN_SCORE + (boundedRaw / rawMax) * (RTS_DISPLAY_MAX_SCORE - RTS_DISPLAY_MIN_SCORE)),
    RTS_DISPLAY_MIN_SCORE,
    RTS_DISPLAY_MAX_SCORE
  );
}

function composeRTSDisplayOverall(content, pronunciation, fluency) {
  return normalizeTraitScore(
    Math.round(
      Number(content || 0) * 0.5
      + Number(pronunciation || 0) * 0.25
      + Number(fluency || 0) * 0.25
    ),
    RTS_DISPLAY_MIN_SCORE,
    RTS_DISPLAY_MAX_SCORE
  );
}

function buildRTSDisplayScoresFromRaw({
  contentRaw = 0,
  pronunciationRaw = 0,
  fluencyRaw = 0,
  gateTriggered = false
} = {}) {
  if (gateTriggered) {
    return {
      content: RTS_DISPLAY_MIN_SCORE,
      pronunciation: RTS_DISPLAY_MIN_SCORE,
      fluency: RTS_DISPLAY_MIN_SCORE,
      overall: RTS_DISPLAY_MIN_SCORE
    };
  }

  const content = mapRTSRawToDisplay(contentRaw, RTS_CONTENT_RAW_MAX);
  const pronunciation = mapRTSRawToDisplay(pronunciationRaw, RTS_PRONUNCIATION_RAW_MAX);
  const fluency = mapRTSRawToDisplay(fluencyRaw, RTS_FLUENCY_RAW_MAX);
  return {
    content,
    pronunciation,
    fluency,
    overall: composeRTSDisplayOverall(content, pronunciation, fluency)
  };
}

async function applyQuestion(nextQuestion, { syncRoute = true, autoPlay = true } = {}) {
  if (!nextQuestion) return;
  const fromQuestionId = resolveCurrentQuestionId();
  const toQuestionId = `${nextQuestion.id || ""}`.trim();
  const shouldRecoverSceneAudioFocus = Boolean(
    currentPhase.value === PHASE.PLAYBACK
    || recordingFinalizePending.value
    || recordingStopResult.value
    || recorder.isRecording.value
    || recorder.isStopping.value
    || recorder.isReady.value
  );
  logSceneAudio("next_question_apply_start", {
    fromQuestionId,
    toQuestionId,
    syncRoute: Boolean(syncRoute),
    autoPlay: Boolean(autoPlay),
    shouldRecoverSceneAudioFocus,
    audioState: collectAudioLifecycleSnapshot()
  });

  recordingFinalizeToken += 1;
  recordingFinalizePending.value = false;
  recordingStartPending.value = false;
  recordingStopReady.value = false;
  clearRecordingStopReadyTimer();
  recorderStartAtMs.value = 0;
  sceneAudioEndedAtMs.value = 0;
  lastUnavailableDebugKey = "";
  timer.stopAllCountdowns();
  resetRecorderPlaybackElement({ reason: "next_question_apply_start", clearSource: true });
  resetPreviewPlaybackDiag("next_question_apply_start");
  stopSceneAudioPlayback({ invalidateToken: true, reason: "next_question_apply_start" });
  await stopRecorderSafely({ reason: "next_question_cleanup" });
  if (shouldRecoverSceneAudioFocus && RTS_NEXT_SCENE_AUDIO_RECOVER_MS > 0) {
    logSceneAudio("next_question_audio_focus_wait_start", {
      waitMs: RTS_NEXT_SCENE_AUDIO_RECOVER_MS
    });
    await waitForMs(RTS_NEXT_SCENE_AUDIO_RECOVER_MS);
    logSceneAudio("next_question_audio_focus_wait_done", {
      waitMs: RTS_NEXT_SCENE_AUDIO_RECOVER_MS
    });
  }

  currentQuestion.value = nextQuestion;
  activeTab.value = "mind";
  showFullTemplate.value = false;
  sceneAudioManualResumeRequired.value = false;
  setSceneAudioError("");
  recordingStopResult.value = null;
  resetCurrentPracticeSubmitState();
  playbackDurationSec.value = 0;
  revokePlaybackUrl({ reason: "next_question_apply" });

  const index = Math.max(0, questionPool.value.findIndex((item) => item.id === nextQuestion.id));
  const initialListeningStatus = autoPlay ? "autoplay_countdown" : "idle";
  const initialListeningLabel = autoPlay
    ? `音频播放前（阅读与缓冲时间）${RTS_AUTO_PLAY_COUNTDOWN_SECONDS}s`
    : "点击播放场景";
  const initialListeningRemaining = autoPlay ? RTS_AUTO_PLAY_COUNTDOWN_SECONDS : 0;
  const initialListeningTotal = autoPlay ? RTS_AUTO_PLAY_COUNTDOWN_SECONDS : 0;
  practiceStore.initRTSSession({
    phase: PHASE.LISTENING,
    questionId: nextQuestion.id,
    questionIndex: index + 1,
    totalQuestions: questionPool.value.length,
    prepareRemaining: RTS_PREPARE_SECONDS,
    prepareTotal: RTS_PREPARE_SECONDS,
    recordRemaining: 40,
    recordTotal: 40,
    listeningProgress: 0,
    listeningStatus: initialListeningStatus,
    listeningLabel: initialListeningLabel,
    listeningRemaining: initialListeningRemaining,
    listeningTotal: initialListeningTotal,
    usedPhraseIds: []
  });

  if (syncRoute) {
    router.replace({ path: "/rts/practice", query: buildPracticeRouteQuery(nextQuestion.id) });
  }

  if (autoPlay) scheduleSceneAutoPlay();
  await loadFavoriteState();
  logSceneAudio("next_question_apply_done", {
    fromQuestionId,
    toQuestionId,
    syncRoute: Boolean(syncRoute),
    autoPlay: Boolean(autoPlay),
    audioState: collectAudioLifecycleSnapshot()
  });
}

async function resolveQuestionByRoute() {
  const routeQuestionId = `${route.query?.id || ""}`.trim();
  logSceneAudio("resolve_question_by_route_start", {
    routeQuestionId
  });
  let targetQuestion = null;

  if (routeQuestionId) {
    targetQuestion = await getQuestionById(routeQuestionId);
  }
  if (!targetQuestion) {
    targetQuestion = await getRandomQuestion(currentQuestion.value?.id || "");
  }
  if (!targetQuestion) return null;

  if (`${currentQuestion.value?.id || ""}`.trim() === `${targetQuestion.id || ""}`.trim()) return targetQuestion;

  await applyQuestion(targetQuestion, { syncRoute: true, autoPlay: true });
  logSceneAudio("resolve_question_by_route_applied", {
    routeQuestionId,
    targetQuestionId: `${targetQuestion.id || ""}`.trim()
  });
  return targetQuestion;
}

function beginQuestionAdvanceTransition({ keepPlaybackUrl = true } = {}) {
  submitPending.value = false;
  recordingFinalizePending.value = false;
  recordingStartPending.value = false;
  recordingStopReady.value = false;
  clearRecordingStopReadyTimer();
  resetRecorderPlaybackElement({ reason: "next_question_transition_start", clearSource: true });
  resetPreviewPlaybackDiag("next_question_transition_start");
  if (keepPlaybackUrl) {
    playbackUrl.value = "";
    playbackTimeupdateLogKey = "";
  } else {
    revokePlaybackUrl({ reason: "next_question_transition_start" });
  }
  recordingStopResult.value = null;
  commitRecorderDiagPayload(null);
  lastUnavailableDebugKey = "";
}

async function handleSubmitPractice() {
  if (submitPending.value || nextQuestionBusy.value || isAdvancingQuestion.value || !currentQuestion.value) return;
  const questionId = resolveCurrentQuestionId();
  const attemptId = resolveAttemptId(recordingStopResult.value);
  const hasPlayableAudio = Boolean(hasPlaybackUsableAudio.value && `${playbackUrl.value || ""}`.trim());
  const submitKey = buildPracticeSubmitKey(questionId, attemptId);
  if (!submitKey || !hasPlayableAudio || isCurrentPracticeSubmitted.value) return;

  updateSubmitFeedbackState({
    key: submitKey,
    status: "submitting",
    uploadOk: false,
    insertOk: false,
    hasRemoteAudioMeta: false
  });
  latestRTSAiReviewError.value = "";
  latestRTSAiReview.value = null;
  submitPending.value = true;
  const analyzeStartedAtMs = Date.now();
  const analyzingPendingQuery = {
    ...buildResultRouteQuery({
      questionId
    }),
    startedAt: String(analyzeStartedAtMs),
    pendingSubmit: "1"
  };
  void router.push({
    path: "/rts/analyzing",
    query: analyzingPendingQuery
  }).catch(() => {});
  if (RTS_PRACTICE_DEBUG_ENABLED) {
    console.info("[rts-submit:start]", {
      questionId,
      attemptId,
      hasPlaybackUsableAudio: hasPlayableAudio,
      uploadOk: false,
      insertOk: false,
      hasRemoteAudioMeta: false
    });
  }

  try {
    const persistOutcome = await persistCurrentPractice({
      stopResult: recordingStopResult.value,
      question: currentQuestion.value,
      durationSec: Number(playbackDurationSec.value || 0)
    });
    const uploadOk = Boolean(persistOutcome?.uploadOk);
    const insertOk = Boolean(persistOutcome?.insertOk);
    const hasRemoteAudioMeta = Boolean(persistOutcome?.hasRemoteAudioMeta);
    const submitSucceeded = Boolean(
      insertOk
      && hasRemoteAudioMeta
      && normalizeTextValue(persistOutcome?.savedLogId)
      && normalizeTextValue(persistOutcome?.userId)
    );

    if (!submitSucceeded) {
      updateSubmitFeedbackState({
        key: submitKey,
        status: "failed",
        uploadOk,
        insertOk,
        hasRemoteAudioMeta
      });
      if (RTS_PRACTICE_DEBUG_ENABLED) {
        console.warn("[rts-submit:failed]", {
          questionId,
          attemptId,
          hasPlaybackUsableAudio: hasPlayableAudio,
          uploadOk,
          insertOk,
          hasRemoteAudioMeta
        });
      }
      void router.replace({
        path: "/rts/analyzing",
        query: {
          ...buildResultRouteQuery({
            questionId
          }),
          startedAt: String(analyzeStartedAtMs),
          submitFailed: "1"
        }
      }).catch(() => {});
      return;
    }

    updateSubmitFeedbackState({
      key: submitKey,
      status: "success",
      uploadOk,
      insertOk,
      hasRemoteAudioMeta
    });
    submittedPracticeKey.value = submitKey;
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-submit:success]", {
        questionId,
        attemptId,
        hasPlaybackUsableAudio: hasPlayableAudio,
        uploadOk,
        insertOk,
        hasRemoteAudioMeta,
        reviewStatus: "pending"
      });
    }
    const resultLogId = normalizeTextValue(persistOutcome?.savedLogId);
    if (resultLogId) {
      if (typeof sessionStorage !== "undefined") {
        try {
          const storageKey = getRTSAnalyzingStartedAtStorageKey(resultLogId);
          if (storageKey) {
            sessionStorage.setItem(storageKey, String(analyzeStartedAtMs));
          }
        } catch {
          // no-op
        }
      }
      void router.replace({
        path: "/rts/analyzing",
        query: buildResultRouteQuery({
          logId: resultLogId,
          questionId,
          startedAt: String(analyzeStartedAtMs)
        })
      }).catch(() => {});
      return;
    }
    await loadTodayStatsPanel();
  } catch (error) {
    updateSubmitFeedbackState({
      key: submitKey,
      status: "failed",
      uploadOk: false,
      insertOk: false,
      hasRemoteAudioMeta: false
    });
    if (RTS_PRACTICE_DEBUG_ENABLED) {
      console.warn("[rts-submit:failed]", {
        questionId,
        attemptId,
        hasPlaybackUsableAudio: hasPlayableAudio,
        uploadOk: false,
        insertOk: false,
        hasRemoteAudioMeta: false,
        error
      });
    }
    void router.replace({
      path: "/rts/analyzing",
      query: {
        ...buildResultRouteQuery({
          questionId
        }),
        startedAt: String(analyzeStartedAtMs),
        submitFailed: "1"
      }
    }).catch(() => {});
  } finally {
    submitPending.value = false;
  }
}

async function handleNextQuestion() {
  if (submitPending.value || nextQuestionBusy.value || isAdvancingQuestion.value || !currentQuestion.value) return;
  const fromQuestionId = resolveCurrentQuestionId();
  const sourceStopResult = recordingStopResult.value;
  const attemptId = resolveAttemptId(sourceStopResult);
  const hasPlaybackUsableAudio = Boolean(isPlaybackUsableRecord(sourceStopResult) && `${playbackUrl.value || ""}`.trim());
  const submitted = isCurrentPracticeSubmitted.value;
  logSceneAudio("next_question_clicked", {
    fromQuestionId,
    phase: currentPhase.value,
    hasUsableAudio: Boolean(hasUsableAudio.value),
    hasPlaybackUsableAudio,
    playbackUrlReady: Boolean(`${playbackUrl.value || ""}`.trim()),
    submitted,
    audioState: collectAudioLifecycleSnapshot()
  });
  isAdvancingQuestion.value = true;
  nextQuestionBusy.value = true;
  try {
    if (currentPhase.value === PHASE.PLAYBACK && !submitted && RTS_PRACTICE_DEBUG_ENABLED) {
      console.info("[rts-next:skip-persist]", {
        questionId: fromQuestionId,
        attemptId,
        hasPlaybackUsableAudio,
        uploadOk: false,
        insertOk: false,
        hasRemoteAudioMeta: false
      });
      updateSubmitFeedbackState({
        key: buildPracticeSubmitKey(fromQuestionId, attemptId),
        status: "idle",
        uploadOk: false,
        insertOk: false,
        hasRemoteAudioMeta: false
      });
    }

    beginQuestionAdvanceTransition({ keepPlaybackUrl: true });
    const candidates = questionPool.value.filter((item) => item.id !== currentQuestion.value.id);
    const nextQuestion = (candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : currentQuestion.value) || null;
    if (!nextQuestion) return;

    logSceneAudio("next_question_apply_direct", {
      fromQuestionId,
      toQuestionId: `${nextQuestion.id || ""}`.trim()
    });
    await applyQuestion(nextQuestion, { syncRoute: true, autoPlay: true });
  } finally {
    nextQuestionBusy.value = false;
    isAdvancingQuestion.value = false;
  }
}

async function replayHistory(item) {
  if (!item) return;
  if (item?.hasAudio) {
    const url = await ensureHistoryPlayback(item);
    if (url) return;
  }
  if (!item?.questionId) return;
  router.push({ path: "/rts/practice", query: buildPracticeRouteQuery(item.questionId) });
}

async function bootstrap() {
  loading.value = true;
  try {
    questionPool.value = await loadQuestions();
    if (!questionPool.value.length) return;
    await resolveQuestionByRoute();
  } finally {
    loading.value = false;
  }
  void loadTodayStatsPanel();
}

watch(
  () => route.fullPath,
  () => {
    refreshRecorderDebugLock();
  },
  { immediate: true }
);

watch(
  () => route.query.id,
  async (next, prev) => {
    if (loading.value) return;
    if (`${next || ""}`.trim() === `${prev || ""}`.trim()) return;
    logSceneAudio("route_query_changed", {
      fromQuestionId: `${prev || ""}`.trim(),
      toQuestionId: `${next || ""}`.trim()
    });
    await resolveQuestionByRoute();
  }
);

watch(
  () => [
    currentPhase.value,
    recordingFinalizePending.value,
    hasPlaybackUsableAudio.value,
    Boolean(playbackUrl.value),
    `${currentQuestion.value?.id || ""}`,
    Number(recordingStopResult.value?.attemptId || 0),
    `${recordingStopResult.value?.stopErrorCode || ""}`,
    `${recordingStopResult.value?.blobIssueCode || ""}`
  ],
  () => {
    logUnavailableIfNeeded("phase_watch");
  }
);

onMounted(() => {
  resetPreviewPlaybackDiag("mounted");
  commitRecorderDiagPayload(recorderLastDiag.value);
  void bootstrap();
});

onUnmounted(() => {
  recordingFinalizeToken += 1;
  recordingFinalizePending.value = false;
  recordingStartPending.value = false;
  recordingStopReady.value = false;
  clearRecordingStopReadyTimer();
  timer.stopAllCountdowns();
  destroySceneAudioPlayer();
  resetRecorderPlaybackElement({ reason: "rts_unmount", clearSource: true });
  resetPreviewPlaybackDiag("rts_unmount");
  void stopRecorderSafely({ reason: "rts_unmount" });
  revokePlaybackUrl({ reason: "rts_unmount" });
});
</script>
<template>
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goHome">← 首页</button>
        <p class="text-base font-semibold">RTS 情景回应</p>
        <p class="text-xs text-white/80">第{{ questionIndex }}题/共{{ totalQuestions }}</p>
      </div>
      <div class="mx-auto flex max-w-6xl items-center justify-between border-t border-white/15 px-4 py-2">
        <div class="flex items-center gap-1">
          <span
            v-for="dot in progressDots"
            :key="dot.index"
            class="h-1.5 w-4 rounded-full transition-colors"
            :class="dot.active ? 'bg-[#E8845A]' : 'bg-white/25'"
          />
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-full border px-2.5 py-1 text-xs transition-colors"
            :class="isFavorite ? 'border-[#E8845A] bg-[#E8845A] text-white' : 'border-white/25 text-white hover:bg-white/10'"
            :disabled="favoriteBusy"
            @click="toggleFavorite"
          >
            {{ isFavorite ? "★ 已收藏" : "☆ 收藏" }}
          </button>
          <button
            type="button"
            class="rounded-full border border-white/25 px-2.5 py-1 text-xs text-white transition-colors hover:bg-white/10"
            @click="goList"
          >
            选题
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <section v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-5 text-sm text-[#8CA0C0]">
        练习页加载中...
      </section>

      <template v-else-if="currentQuestion">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section class="space-y-4 rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-[#EDF2FB] px-2.5 py-1 text-xs font-semibold text-[#1B3A6B]">{{ currentQuestion.id }}</span>
              <span class="rounded-full px-2.5 py-1 text-xs" :class="topicMeta.badgeClass">{{ topicMeta.label }}</span>
              <span class="rounded-full bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">{{ toneLabel }}</span>
            </div>

            <div class="rounded-[14px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
              <p class="text-xs font-semibold text-[#8CA0C0]">情景描述</p>
              <div class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="rounded-[11px] bg-[#1B3A6B] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    @click="playSceneAudio"
                  >
                    ▶ 播放
                  </button>
                  <p class="text-xs text-[#8CA0C0]">{{ listeningLabel }}</p>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EDF5]">
                  <div class="h-full bg-[#1B3A6B] transition-all" :style="{ width: `${listeningProgress}%` }" />
                </div>
                <p v-if="autoPlayHint" class="mt-2 text-xs text-[#1B3A6B]">
                  {{ autoPlayHint }}
                </p>
                <p v-if="sceneAudioError" class="mt-2 text-xs text-[#E8845A]">
                  {{ sceneAudioError }}
                </p>
              </div>

              <p class="mt-3 text-sm leading-relaxed text-[#1E293B]" v-html="highlightedScenarioHtml" />

              <div class="mt-3 rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFF8F4] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">你的角色</p>
                <p class="mt-1 text-sm text-[#1E293B]">{{ currentQuestion.key_points?.role || "请根据场景代入角色回应。" }}</p>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-2">
              <article
                v-for="stage in stageList"
                :key="stage.key"
                class="rounded-[11px] border px-2 py-2 text-center text-xs"
                :class="stage.isActive
                  ? 'border-[#1B3A6B] bg-[#EDF2FB] text-[#1B3A6B]'
                  : stage.isDone
                    ? 'border-[#E8845A] bg-[#FFF3EC] text-[#E8845A]'
                    : 'border-[#E8EDF5] bg-white text-[#8CA0C0]'"
              >
                {{ stage.label }}
              </article>
            </div>

            <div class="rounded-[11px] border border-[#E8EDF5] bg-white p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs text-[#8CA0C0]">{{ timerInfo.label }}</p>
                <div class="flex items-center gap-2">
                  <button
                    v-if="sceneAudioSkipVisible"
                    type="button"
                    class="rounded-full border border-[#E8EDF5] bg-[#F8FAFD] px-2.5 py-1 text-[11px] font-semibold text-[#1B3A6B] transition-colors hover:bg-white"
                    @click="skipSceneAudio"
                  >
                    跳过音频
                  </button>
                  <p class="text-xs font-semibold text-[#1B3A6B]">{{ timerInfo.remaining }}s</p>
                </div>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-[#E8EDF5]">
                <div class="h-full bg-[#E8845A] transition-all" :style="{ width: `${timerInfo.progress}%` }" />
              </div>
            </div>

            <div class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
              <div v-if="sceneAudioInlineCalloutVisible" class="mb-3 rounded-[11px] border-2 border-[#E8845A] bg-[#FFF3EC] p-3">
                <p class="text-sm font-semibold text-[#7A4312]">{{ sceneAudioInlineCalloutTitle }}</p>
                <p class="mt-1 text-xs leading-relaxed text-[#8C5A32]">{{ sceneAudioInlineCalloutMessage }}</p>
                <button
                  type="button"
                  class="mt-3 w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  @click="playSceneAudio({ reason: 'manual_resume' })"
                >
                  点击播放场景音频
                </button>
              </div>

              <template v-if="currentPhase === PHASE.LISTENING">
                <div class="space-y-2">
                  <button
                    type="button"
                    class="w-full rounded-[11px] bg-[#52C41A] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                    @click="playSceneAudio"
                  >
                    {{ listeningActionLabel }}
                  </button>
                  <button
                    v-if="sceneAudioPauseToggleVisible"
                    type="button"
                    class="w-full rounded-[11px] border border-[#1B3A6B] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B] hover:bg-[#F8FAFD]"
                    @click="toggleSceneAudioPause"
                  >
                    {{ sceneAudioPauseToggleLabel }}
                  </button>
                </div>
              </template>

              <template v-else-if="currentPhase === PHASE.PREPARING">
                <div class="space-y-2">
                  <p class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    准备阶段会在 {{ prepareRemaining }} 秒后自动进入录音。
                  </p>
                  <button
                    type="button"
                    class="w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                    @click="startRecordingPhase"
                  >
                    开始回应
                  </button>
                </div>
              </template>

              <template v-else-if="currentPhase === PHASE.RECORDING">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!canStopRecording"
                  @click="stopRecordingPhase('manual')"
                >
                  {{ recordingStopButtonLabel }}
                </button>
                <div class="mt-2 rounded-[11px] bg-white px-3 py-2">
                  <RecordingWave :is-recording="Boolean(recorder.isRecording.value)" />
                </div>
                <p v-if="recordingStatusHint" class="mt-2 text-xs text-[#8CA0C0]">
                  {{ recordingStatusHint }}
                </p>
              </template>
              <template v-else>
                <div class="space-y-3">
                  <section v-if="recorderDebugPanelVisible" class="rounded-[11px] border-2 border-[#E8845A] bg-[#FFF3EC] p-3 text-xs text-[#5B3A1D]">
                    <p class="text-sm font-semibold text-[#7A4312]">录音诊断（最近一次 stop）</p>
                    <p class="mt-1 text-[11px] leading-relaxed text-[#8C5A32]">
                      <template v-if="isRecorderDebugEnabled()">已开启调试显示；未开启时，录音失败或 RTS 二次 probe 警告也会自动显示在这里。</template>
                      <template v-else>本次录音存在失败或兼容性警告，已强制显示关键诊断信息。</template>
                    </p>
                    <div v-if="!recorderDiagDisplay" class="mt-2 rounded border border-[#F5D0A9] bg-white/80 px-2 py-2 text-[11px] text-[#8C5A32]">
                      暂无 stop 结果，完成一次录音后会显示最近一次诊断。
                    </div>
                    <div v-else class="mt-2 space-y-2">
                      <div class="rounded border border-[#F5D0A9] bg-white/80 px-2 py-2">
                        <p class="font-semibold text-[#7A4312]">核心状态</p>
                        <p class="mt-1">failureType: {{ formatRecorderDiagValue(recorderDiagDisplay.failureType) }}</p>
                        <p>failureStage: {{ formatRecorderDiagValue(recorderDiagDisplay.failureStage) }}</p>
                        <p>sharedLayerUsable: {{ formatRecorderDiagValue(recorderDiagDisplay.sharedLayerUsable) }}</p>
                        <p>rtsProbeRejected: {{ formatRecorderDiagValue(recorderDiagDisplay.rtsProbeRejected) }}</p>
                        <p>rtsProbeWarningOnly: {{ formatRecorderDiagValue(recorderDiagDisplay.rtsProbeWarningOnly) }}</p>
                        <p>finalUsableDecision: {{ formatRecorderDiagValue(recorderDiagDisplay.finalUsableDecision) }}</p>
                        <p>finalUsableReason: {{ formatRecorderDiagValue(recorderDiagDisplay.finalUsableReason) }}</p>
                        <p>finalPlaybackUsable: {{ formatRecorderDiagValue(recorderDiagDisplay.finalPlaybackUsable) }}</p>
                        <p>finalPlaybackReason: {{ formatRecorderDiagValue(recorderDiagDisplay.finalPlaybackReason) }}</p>
                        <p>finalBlobPlayable: {{ formatRecorderDiagValue(recorderDiagDisplay.finalBlobPlayable) }}</p>
                        <p>silenceWarning: {{ formatRecorderDiagValue(recorderDiagDisplay.silenceWarning) }}</p>
                        <p>finalBlobOrigin: {{ formatRecorderDiagValue(recorderDiagDisplay.finalBlobOrigin) }}</p>
                        <p>fallbackInjectedForPreview: {{ formatRecorderDiagValue(recorderDiagDisplay.fallbackInjectedForPreview) }}</p>
                        <p>preFallbackBlobSize: {{ formatRecorderDiagValue(recorderDiagDisplay.preFallbackBlobSize) }}</p>
                        <p>preFallbackProbePlayable: {{ formatRecorderDiagValue(recorderDiagDisplay.preFallbackProbePlayable) }}</p>
                        <p>stopErrorCode: {{ formatRecorderDiagValue(recorderDiagDisplay.stopErrorCode) }}</p>
                        <p>stopErrorMessage: {{ formatRecorderDiagValue(recorderDiagDisplay.stopErrorMessage) }}</p>
                      </div>

                      <div class="rounded border border-[#F5D0A9] bg-white/80 px-2 py-2">
                        <p class="font-semibold text-[#7A4312]">blob / MIME</p>
                        <p class="mt-1">blobSize: {{ formatRecorderDiagValue(recorderDiagDisplay.blobSize) }}</p>
                        <p>blobType: {{ formatRecorderDiagValue(recorderDiagDisplay.blobType) }}</p>
                        <p class="mt-1">selectedMimeType: {{ formatRecorderDiagValue(recorderDiagDisplay.selectedMimeType) }}</p>
                        <p>mediaRecorderMimeType: {{ formatRecorderDiagValue(recorderDiagDisplay.mediaRecorderMimeType) }}</p>
                        <p>chunkMimeType: {{ formatRecorderDiagValue(recorderDiagDisplay.chunkMimeType) }}</p>
                        <p>mimeTypePlayable: {{ formatRecorderDiagValue(recorderDiagDisplay.mimeTypePlayable) }}</p>
                        <p>playbackUrlCreated: {{ formatRecorderDiagValue(recorderDiagDisplay.playbackUrlCreated) }}</p>
                      </div>

                      <div class="rounded border border-[#F5D0A9] bg-white/80 px-2 py-2">
                        <p class="font-semibold text-[#7A4312]">probe 结果</p>
                        <p class="mt-1">hasUsableAudio: {{ formatRecorderDiagValue(recorderDiagDisplay.hasUsableAudio) }}</p>
                        <p>probePlayable: {{ formatRecorderDiagValue(recorderDiagDisplay.probeResult?.playable) }}</p>
                        <p>probeErrorCode: {{ formatRecorderDiagValue(recorderDiagDisplay.probeResult?.errorCode) }}</p>
                        <p>probeRejectedName: {{ formatRecorderDiagValue(recorderDiagDisplay.probeResult?.playRejectedName) }}</p>
                        <pre v-if="isRecorderDebugEnabled()" class="mt-1 max-h-40 overflow-auto rounded border border-[#F5D0A9] bg-[#FFFDF8] p-2 text-[10px] leading-tight text-[#5B3A1D]">{{ recorderDiagProbeJson }}</pre>
                      </div>

                      <div v-if="isRecorderDebugEnabled()" class="rounded border border-[#F5D0A9] bg-white/80 px-2 py-2">
                        <p class="font-semibold text-[#7A4312]">fallback</p>
                        <p class="mt-1">recorderEngineAtStart: {{ formatRecorderDiagValue(recorderDiagDisplay.recorderEngineAtStart) }}</p>
                        <p>recorderEngineAtStop: {{ formatRecorderDiagValue(recorderDiagDisplay.recorderEngineAtStop) }}</p>
                        <p class="mt-1">finalRecorderEngine: {{ formatRecorderDiagValue(recorderDiagDisplay.finalRecorderEngine) }}</p>
                        <p>fallbackProducedBlob: {{ formatRecorderDiagValue(recorderDiagDisplay.fallbackProducedBlob) }}</p>
                        <p>fallbackBlobSize: {{ formatRecorderDiagValue(recorderDiagDisplay.fallbackBlobSize) }}</p>
                        <p>rawChunkCount: {{ formatRecorderDiagValue(recorderDiagDisplay.rawChunkCount) }}</p>
                        <p>rawChunkBytes: {{ formatRecorderDiagValue(recorderDiagDisplay.rawChunkBytes) }}</p>
                        <p class="mt-1">usedSilentFallback: {{ formatRecorderDiagValue(recorderDiagDisplay.usedSilentFallback) }}</p>
                        <p>dataEventCount: {{ formatRecorderDiagValue(recorderDiagDisplay.dataEventCount) }}</p>
                        <p>chunkSizeList: {{ formatRecorderDiagValue(recorderDiagDisplay.chunkSizeList) }}</p>
                        <p>lastChunkMimeType: {{ formatRecorderDiagValue(recorderDiagDisplay.lastChunkMimeType) }}</p>
                        <p>chunkTotalBytes: {{ formatRecorderDiagValue(recorderDiagDisplay.chunkTotalBytes) }}</p>
                        <p>mediaRecorderStateAtStopRequest: {{ formatRecorderDiagValue(recorderDiagDisplay.mediaRecorderStateAtStopRequest) }}</p>
                        <p>mediaRecorderStateAfterStop: {{ formatRecorderDiagValue(recorderDiagDisplay.mediaRecorderStateAfterStop) }}</p>
                        <p>stopWaitMs: {{ formatRecorderDiagValue(recorderDiagDisplay.stopWaitMs) }}</p>
                        <p>finalDrainWaitMs: {{ formatRecorderDiagValue(recorderDiagDisplay.finalDrainWaitMs) }}</p>
                        <p>streamActiveAtStop: {{ formatRecorderDiagValue(recorderDiagDisplay.streamActiveAtStop) }}</p>
                        <p>trackReadyStateAtStop: {{ formatRecorderDiagValue(recorderDiagDisplay.trackReadyStateAtStop) }}</p>
                        <p>trackEnabledAtStop: {{ formatRecorderDiagValue(recorderDiagDisplay.trackEnabledAtStop) }}</p>
                        <p>trackMutedAtStop: {{ formatRecorderDiagValue(recorderDiagDisplay.trackMutedAtStop) }}</p>
                        <p>webAudioTotalSampleCount: {{ formatRecorderDiagValue(recorderDiagDisplay.webAudioTotalSampleCount) }}</p>
                        <p>wavEncodeInputSampleCount: {{ formatRecorderDiagValue(recorderDiagDisplay.wavEncodeInputSampleCount) }}</p>
                        <p class="mt-1">peakAmplitude: {{ formatRecorderDiagValue(recorderDiagDisplay.peakAmplitude) }}</p>
                        <p>rmsAmplitude: {{ formatRecorderDiagValue(recorderDiagDisplay.rmsAmplitude) }}</p>
                        <p>meanAbsAmplitude: {{ formatRecorderDiagValue(recorderDiagDisplay.meanAbsAmplitude) }}</p>
                        <p>nonSilentFrameRatio: {{ formatRecorderDiagValue(recorderDiagDisplay.nonSilentFrameRatio) }}</p>
                        <p>sampleRate: {{ formatRecorderDiagValue(recorderDiagDisplay.sampleRate) }}</p>
                        <p>channelCount: {{ formatRecorderDiagValue(recorderDiagDisplay.channelCount) }}</p>
                        <p>durationMs: {{ formatRecorderDiagValue(recorderDiagDisplay.durationMs) }}</p>
                      </div>

                      <div class="rounded border border-[#F5D0A9] bg-white/80 px-2 py-2">
                        <p class="font-semibold text-[#7A4312]">预览回放</p>
                        <p class="mt-1">previewAudioCreated: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioCreated) }}</p>
                        <p>readyState: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioReadyState) }}</p>
                        <p>paused: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioPaused) }}</p>
                        <p>ended: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioEnded) }}</p>
                        <p>muted: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioMuted) }}</p>
                        <p>volume: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioVolume) }}</p>
                        <p>currentTime: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioCurrentTime) }}</p>
                        <p>currentTimeAdvancing: {{ formatRecorderDiagValue(recorderDiagDisplay.previewAudioCurrentTimeAdvancing) }}</p>
                      </div>
                    </div>
                  </section>

                  <p v-if="submitPending" class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    提交中，请稍候...
                  </p>
                  <p v-else-if="nextQuestionBusy || isAdvancingQuestion" class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    正在进入下一题...
                  </p>
                  <p v-else-if="recordingFinalizePending" class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    正在生成录音回放，请稍候...
                  </p>
                  <div v-else-if="hasPlaybackUsableAudio && playbackUrl" class="rounded-[11px] border border-[#E8EDF5] bg-white p-3">
                    <audio
                      :key="`${recordingStopResult?.attemptId || 0}-${playbackUrl}`"
                      ref="playbackAudioRef"
                      class="w-full"
                      :src="playbackUrl"
                      controls
                      preload="metadata"
                      @loadedmetadata="handleRTSPlaybackEvent('loadedmetadata', $event)"
                      @canplay="handleRTSPlaybackEvent('canplay', $event)"
                      @play="handleRTSPlaybackEvent('play', $event)"
                      @playing="handleRTSPlaybackEvent('playing', $event)"
                      @timeupdate="handleRTSPlaybackEvent('timeupdate', $event)"
                      @pause="handleRTSPlaybackEvent('pause', $event)"
                      @error="handleRTSPlaybackEvent('error', $event)"
                      @ended="handleRTSPlaybackEvent('ended', $event)"
                    />
                    <p class="mt-1 text-xs text-[#8CA0C0]">时长 {{ formatDuration(playbackDurationSec) }}</p>
                    <p v-if="recordingStopResult?.rtsProbeRejected" class="mt-1 text-xs text-[#E8845A]">
                      RTS 二次 probe 未通过，但共享层已返回可播录音，当前仍允许直接回放。
                    </p>
                    <p v-if="hasSilenceWarningFlag" class="mt-1 text-xs text-[#E8845A]">
                      疑似静音或有效声音较弱，建议重录；当前回放仅用于预览排查。
                    </p>
                  </div>
                  <p v-else class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    {{ recordingUnavailableMessage }}
                  </p>

                </div>
              </template>

              <button
                v-if="showSubmitButton"
                type="button"
                class="mt-3 w-full rounded-[11px] border border-[#1B3A6B] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B] transition-colors hover:bg-[#F8FAFD] disabled:cursor-not-allowed disabled:border-[#E8EDF5] disabled:bg-[#F8FAFD] disabled:text-[#8CA0C0]"
                :disabled="submitButtonDisabled"
                @click="handleSubmitPractice"
              >
                {{ submitButtonLabel }}
              </button>
              <p
                v-if="submitStatusMessage"
                class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]"
              >
                {{ submitStatusMessage }}
              </p>
              <p
                v-if="latestRTSAiReviewLoading"
                class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]"
              >
                AI评分处理中，完成后将跳转结果页...
              </p>
              <p
                v-else-if="latestRTSAiReviewError"
                class="mt-2 rounded-[11px] border border-[#F2D6D3] bg-[#FFF7F6] px-3 py-2 text-xs text-[#D92D20]"
              >
                {{ latestRTSAiReviewError }}
              </p>
              <button
                type="button"
                class="mt-3 w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="submitPending || nextQuestionBusy || isAdvancingQuestion"
                @click="handleNextQuestion"
              >
                {{ (submitPending || nextQuestionBusy || isAdvancingQuestion) ? "处理中..." : "下一题 →" }}
              </button>
            </div>
          </section>

          <section class="space-y-3 rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-[#1B3A6B]">回应辅助</h2>
              <div class="flex gap-1">
                <button
                  v-for="item in [
                    { key: 'mind', label: '思路' },
                    { key: 'template', label: '模板' },
                    { key: 'phrases', label: '句型' },
                    { key: 'tips', label: '要点' }
                  ]"
                  :key="item.key"
                  type="button"
                  class="rounded-[20px] px-2.5 py-1 text-xs transition-colors"
                  :class="activeTab === item.key ? 'bg-[#1B3A6B] text-white' : 'bg-[#F8FAFD] text-[#8CA0C0] hover:text-[#1B3A6B]'"
                  @click="activeTab = item.key"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div v-if="activeTab === 'mind'" class="space-y-2">
              <div class="flex flex-wrap gap-2">
                <span class="rounded-[20px] bg-[#EDF2FB] px-2.5 py-1 text-xs text-[#1B3A6B]">{{ toneLabel }}</span>
                <span class="rounded-[20px] px-2.5 py-1 text-xs" :class="topicMeta.badgeClass">{{ topicMeta.label }}</span>
                <span class="rounded-[20px] bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">{{ behaviorLabel }}</span>
              </div>

              <article
                v-for="(item, idx) in directions"
                :key="`${item.head}-${idx}`"
                class="rounded-[11px] border bg-[#F8FAFD] p-3"
                :class="idx === 0 ? 'border-l-4 border-l-[#1B3A6B]' : idx === 1 ? 'border-l-4 border-l-[#52C41A]' : 'border-l-4 border-l-[#E8845A]'"
              >
                <p class="text-sm font-semibold text-[#1E293B]">{{ item.head }}</p>
                <p class="mt-1 text-xs leading-relaxed text-[#8CA0C0]">{{ item.body }}</p>
                <p class="mt-2 text-xs italic text-[#1B3A6B]">{{ item.eg }}</p>
              </article>
            </div>

            <div v-else-if="activeTab === 'template'" class="space-y-3">
              <div class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-sm leading-relaxed text-[#1E293B]">
                <template v-for="(segment, idx) in templateOpenerSegments" :key="`${segment.text}-${idx}`">
                  <span v-if="segment.isSlot" class="rounded bg-[#FFE6D9] px-1.5 py-0.5 text-[#E8845A]">{{ segment.text }}</span>
                  <span v-else>{{ segment.text }}</span>
                </template>
                <span v-if="!templateOpenerSegments.length" class="text-[#8CA0C0]">暂无开场模板</span>
              </div>

              <button type="button" class="text-xs font-semibold text-[#1B3A6B] underline" @click="showFullTemplate = !showFullTemplate">
                {{ showFullTemplate ? "收起完整示例回应" : "查看完整示例回应" }}
              </button>

              <p v-if="showFullTemplate" class="rounded-[11px] border border-[#E8EDF5] bg-white p-3 text-sm leading-relaxed text-[#1E293B]">
                {{ templateFullText }}
              </p>

              <span class="inline-flex rounded-[20px] bg-[#EDF2FB] px-2.5 py-1 text-xs text-[#1B3A6B]">适用语气：{{ toneLabel }}</span>
            </div>

            <div v-else-if="activeTab === 'phrases'" class="space-y-3">
              <section v-for="group in phraseGroups" :key="group.key" class="space-y-2">
                <p class="text-xs font-semibold text-[#8CA0C0]">{{ group.label }}</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="(item, idx) in group.items"
                    :key="`${group.key}-${idx}`"
                    type="button"
                    class="rounded-[20px] border px-2.5 py-1 text-xs transition-colors"
                    :class="isPhraseUsed(group.key, idx, item) ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1E293B] hover:bg-[#F8FAFD]'"
                    @click="togglePhrase(group.key, idx, item)"
                  >
                    {{ item }}
                  </button>
                </div>
              </section>
            </div>

            <div v-else class="space-y-2">
              <article
                v-for="(item, idx) in tips"
                :key="`${item}-${idx}`"
                class="rounded-[11px] border border-l-4 border-l-[#E8845A] border-[#E8EDF5] bg-[#FFF8F4] p-3 text-sm text-[#1E293B]"
              >
                {{ item }}
              </article>
              <p v-if="!tips.length" class="text-xs text-[#8CA0C0]">暂无提示要点。</p>
            </div>
          </section>
        </div>

        <section class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <p class="text-sm font-semibold text-[#1B3A6B]">今日练习统计</p>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <div class="rounded-[11px] bg-[#F8FAFD] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">已练题数</p>
                <p class="mt-1 text-lg font-semibold text-[#1E293B]">{{ todayStats.practicedCount }}</p>
              </div>
              <div class="rounded-[11px] bg-[#F8FAFD] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">分钟</p>
                <p class="mt-1 text-lg font-semibold text-[#1E293B]">{{ todayStats.practiceMinutes }}</p>
              </div>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <p class="text-sm font-semibold text-[#1B3A6B]">历史录音（最近20条）</p>
            <div v-if="!historyItems.length" class="mt-3 rounded-[11px] bg-[#F8FAFD] p-3 text-xs text-[#8CA0C0]">
              还没有可展示的录音记录。
            </div>
            <div v-else class="mt-3 space-y-2">
              <article v-for="item in historyItems" :key="item.id" class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="line-clamp-1 text-xs font-medium text-[#1E293B]">{{ item.summary }}</p>
                </div>
                <p class="mt-1 text-xs text-[#8CA0C0]">{{ formatDateTime(item.createdAt) }} · {{ formatDuration(item.durationSec) }}</p>
                <div class="mt-2">
                  <audio
                    v-if="item.hasAudio && item.playbackUrl"
                    class="w-full"
                    :src="item.playbackUrl"
                    controls
                    preload="metadata"
                  />
                  <button
                    v-else-if="item.hasAudio"
                    type="button"
                    class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
                    @click="replayHistory(item)"
                  >
                    {{ item.playbackLoading ? "加载中..." : "加载并播放录音" }}
                  </button>
                  <p v-if="item.playbackError" class="mt-1 text-xs text-[#D92D20]">{{ item.playbackError }}</p>
                  <button
                    v-if="!item.hasAudio"
                    type="button"
                    class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
                    @click="replayHistory(item)"
                  >
                    进入题目重练
                  </button>
                </div>
              </article>
            </div>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>
