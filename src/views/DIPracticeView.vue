<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import DIDrillProgress from "@/components/DIDrillProgress.vue";
import DIHintPanel from "@/components/DIHintPanel.vue";
import DIRescuePanel from "@/components/DIRescuePanel.vue";
import DIResultPanel from "@/components/DIResultPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";
import { buildPracticeAnalytics } from "@/lib/practice-analytics";
import { supabase } from "@/lib/supabase";
import {
  getDIQuestionById,
  getDITemplatesByFilters,
  getDIRescuePhrases,
  getRandomDIQuestion,
  normalizeDIHintLevel
} from "@/lib/di-data";
import {
  getDIPlaybackUrl,
  getDIQuestionHistory,
  getWeakestDIImageType,
  hasDIAudio,
  uploadDIAudio
} from "@/lib/di-history";
import { isDIEnabled } from "@/lib/di-feature";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useTimer();

const TOTAL_DRILL_ROUNDS = 3;
const TARGET_DURATION_SEC = 30;
const PREPARE_SECONDS = 25;
const QUESTION_HISTORY_LIMIT = 10;

const questionLoading = ref(true);
const question = ref(null);
const phase = ref("idle");
const drillRound = ref(1);
const hintLevel = ref("strong");
const selectedBlockIds = ref([]);
const fiveSecondModeEnabled = ref(true);
const rescueUsedCount = ref(0);
const recordingStartedAt = ref(0);
const roundStartedAtIso = ref("");
const firstTranscriptMs = ref(null);
const speechDetectionAvailable = ref(false);
const openedIn5s = ref(null);
const openDetectionMode = ref("unavailable");
const prepareDurationSec = ref(0);
const speechDurationSec = ref(0);
const roundTranscript = ref("");
const nextSuggestion = ref("先完成本轮录音，再看下一步建议。");
const savingRound = ref(false);
const weakestImageType = ref("");
const roundStopResult = ref(null);
const previewAudioUrl = ref("");
const previewAudioRef = ref(null);
const roundSavedAt = ref("");

const questionHistoryLoading = ref(false);
const questionHistoryError = ref("");
const questionHistoryRecords = ref([]);
const historyPlaybackByRecordId = reactive({});

const selfFluencyRating = ref(3);
const selfStructureRating = ref(3);
const selfFreezeCount = ref(0);

const hasRoundResult = computed(() => phase.value === "ready_to_save");
const canNextRound = computed(() => drillRound.value < TOTAL_DRILL_ROUNDS);
const hintAutoByRound = computed(() => resolveHintByRound(drillRound.value));
const goalDurationReached = computed(() => speechDurationSec.value >= TARGET_DURATION_SEC);
const templateBlocks = computed(() =>
  getDITemplatesByFilters({
    imageType: question.value?.imageType || "",
    hintLevel: hintLevel.value
  })
);
const rescuePhrases = computed(() =>
  getDIRescuePhrases({
    hintLevel: hintLevel.value
  })
);
const questionHighFrequencyWords = computed(() => normalizeQuestionHighFrequencyWords(question.value?.highFrequencyWords));
const hasRecordedAudio = computed(() => hasUsableRoundAudio(roundStopResult.value));
const hasPreviewAudio = computed(() => hasRecordedAudio.value && Boolean(previewAudioUrl.value));
const canSubmitRoundPractice = computed(() => hasRoundResult.value && hasRecordedAudio.value && !savingRound.value);
const showWeakAction = computed(() => Boolean(weakestImageType.value) && !canNextRound.value);
const canFinishRecording = computed(() => phase.value === "recording" && !recorder.isStopping.value);

const resultSummary = computed(() => ({
  recordingLabel: hasRecordedAudio.value ? "已完成录音" : "录音不可用，请重录",
  openedLabel: formatOpenedLabel(openedIn5s.value),
  durationLabel: goalDurationReached.value
    ? `已达标（${speechDurationSec.value}s）`
    : `未达标（${speechDurationSec.value}s / ${TARGET_DURATION_SEC}s）`,
  rescueLabel: `${rescueUsedCount.value} 次`,
  savedLabel: roundSavedAt.value ? `已保存（${new Date(roundSavedAt.value).toLocaleTimeString()}）` : "未提交",
  nextSuggestion: nextSuggestion.value
}));

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function normalizeQueryArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => `${item || ""}`.trim()).filter(Boolean))].slice(0, 8);
  }
  const text = `${value || ""}`.trim();
  return text ? [text] : [];
}

function normalizeHistoryRecordId(value) {
  const id = `${value || ""}`.trim();
  return id || "unknown";
}

function normalizeQuestionHighFrequencyWords(words) {
  if (!Array.isArray(words)) return [];
  return words
    .map((item) => {
      const word = `${item?.word || ""}`.trim();
      if (!word) return null;
      return {
        word,
        partOfSpeech: `${item?.partOfSpeech || item?.pos || ""}`.trim(),
        chinese: `${item?.chinese || item?.definitionZh || item?.defZh || ""}`.trim(),
        note: `${item?.note || item?.definitionEn || item?.defEn || ""}`.trim(),
        example: `${item?.example || ""}`.trim()
      };
    })
    .filter(Boolean);
}

function resolveHintByRound(round) {
  const normalizedRound = Math.max(1, Number(round || 1));
  if (normalizedRound >= 3) return "light";
  if (normalizedRound === 2) return "medium";
  return "strong";
}

function formatOpenedLabel(value) {
  if (value === true) return "是（5 秒内）";
  if (value === false) return "否（超过 5 秒）";
  return "N/A（STT 不可用）";
}

function formatHistoryDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function hasUsableRoundAudio(stopResult) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  const blob = stopResult.blob;
  const blobSize = Number(stopResult?.blobSize ?? blob?.size ?? 0);
  if (!blob || blobSize <= 0) return false;
  if (typeof stopResult?.hasUsableAudio === "boolean") {
    return stopResult.hasUsableAudio;
  }
  return true;
}

function revokePreviewAudioUrl() {
  if (previewAudioUrl.value && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    try {
      URL.revokeObjectURL(previewAudioUrl.value);
    } catch {
      // no-op
    }
  }
  previewAudioUrl.value = "";
}

function setPreviewAudioFromStopResult(stopResult) {
  revokePreviewAudioUrl();
  if (!hasUsableRoundAudio(stopResult)) return;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  try {
    previewAudioUrl.value = URL.createObjectURL(stopResult.blob);
  } catch {
    previewAudioUrl.value = "";
  }
}

function playPreviewAudio() {
  if (!hasPreviewAudio.value || !previewAudioRef.value) return;
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

function resetRoundStates() {
  rescueUsedCount.value = 0;
  recordingStartedAt.value = 0;
  roundStartedAtIso.value = "";
  firstTranscriptMs.value = null;
  speechDetectionAvailable.value = false;
  openedIn5s.value = null;
  openDetectionMode.value = "unavailable";
  prepareDurationSec.value = 0;
  speechDurationSec.value = 0;
  roundTranscript.value = "";
  nextSuggestion.value = "先完成本轮录音，再看下一步建议。";
  roundSavedAt.value = "";
  roundStopResult.value = null;
  revokePreviewAudioUrl();
}

async function ensureAvailability() {
  if (!isDIEnabled()) {
    router.replace("/home");
    return false;
  }

  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  if (!authStore.canPractice) {
    router.replace("/limit");
    return false;
  }

  return true;
}

async function loadQuestionByRoute() {
  questionLoading.value = true;
  try {
    const questionId = `${route.params?.id || ""}`.trim();
    let currentQuestion = questionId ? getDIQuestionById(questionId) : null;
    if (!currentQuestion) {
      currentQuestion = getRandomDIQuestion();
    }
    question.value = currentQuestion;
    if (!question.value?.id) {
      uiStore.showToast("未找到可用 DI 题目。", "warning");
      router.replace("/home");
      return;
    }

    const routeHint = normalizeDIHintLevel(route.query?.hint, "");
    hintLevel.value = routeHint || hintAutoByRound.value;
    const selectedFromQuery = normalizeQueryArray(route.query?.tb);
    if (selectedFromQuery.length) {
      selectedBlockIds.value = selectedFromQuery;
    } else {
      selectedBlockIds.value = (question.value?.recommendedTemplateIds || []).filter(Boolean).slice(0, 5);
    }
    drillRound.value = Math.max(1, Math.min(TOTAL_DRILL_ROUNDS, Number(route.query?.drillRound || 1)));
    resetRoundStates();
  } finally {
    questionLoading.value = false;
  }
}

async function loadWeakImageType() {
  weakestImageType.value = await getWeakestDIImageType({ limit: 20 });
}

async function loadQuestionHistory() {
  const questionId = `${question.value?.id || ""}`.trim();
  if (!questionId) {
    questionHistoryRecords.value = [];
    questionHistoryError.value = "";
    questionHistoryLoading.value = false;
    clearHistoryPlaybackState();
    return;
  }

  questionHistoryLoading.value = true;
  questionHistoryError.value = "";
  clearHistoryPlaybackState();
  try {
    questionHistoryRecords.value = await getDIQuestionHistory(questionId, {
      limit: QUESTION_HISTORY_LIMIT
    });
  } catch (error) {
    console.warn("DI question history load failed:", error, { questionId });
    questionHistoryRecords.value = [];
    questionHistoryError.value = "历史记录加载失败，请重试。";
  } finally {
    questionHistoryLoading.value = false;
  }
}

async function loadHistoryPlayback(record) {
  if (!hasDIAudio(record)) return;
  const state = getHistoryPlaybackState(record?.id);
  if (state.loading) return;
  state.loading = true;
  state.error = "";

  const signedUrl = await getDIPlaybackUrl(record, 60 * 20);
  if (!signedUrl) {
    state.loading = false;
    state.error = "录音链接加载失败，请重试。";
    return;
  }

  state.url = signedUrl;
  state.loading = false;
}

async function startRound() {
  if (questionLoading.value || phase.value === "recording" || phase.value === "processing") return;
  resetRoundStates();
  roundStartedAtIso.value = new Date().toISOString();
  phase.value = "preparing";
  timer.start(PREPARE_SECONDS, beginRecording);
}

async function beginRecording() {
  if (phase.value === "recording" || phase.value === "processing") return;
  prepareDurationSec.value = Math.min(
    PREPARE_SECONDS,
    Math.max(0, Math.round(PREPARE_SECONDS - Number(timer.remaining.value || 0)))
  );
  phase.value = "recording";
  recordingStartedAt.value = nowMs();
  firstTranscriptMs.value = null;
  roundTranscript.value = "";
  const started = await recorder.startRecording({
    allowWithoutSpeechRecognition: true
  });

  if (!started) {
    phase.value = "idle";
    uiStore.showToast("录音启动失败，请重试。", "warning");
    return;
  }

  speechDetectionAvailable.value = Boolean(recorder.lastStartMeta.value?.speechEnabled);
  timer.start(TARGET_DURATION_SEC, finishRecording);
}

async function skipPrepareAndStartRecording() {
  if (phase.value !== "preparing") return;
  timer.stop();
  await beginRecording();
}

async function finishRecording() {
  if (phase.value !== "recording") return;
  phase.value = "processing";
  timer.stop();

  const stopResult = await recorder.stopRecorderAndGetBlob({
    reason: "di_round_submit",
    skipPlayableValidation: true
  });

  const durationSec = Math.max(0, Math.round((nowMs() - Number(recordingStartedAt.value || nowMs())) / 1000));
  speechDurationSec.value = durationSec;
  roundTranscript.value = `${stopResult?.transcript || recorder.transcript.value || ""}`.trim();
  roundStopResult.value = stopResult;
  setPreviewAudioFromStopResult(stopResult);

  if (!fiveSecondModeEnabled.value) {
    openedIn5s.value = null;
    openDetectionMode.value = "disabled";
  } else if (!speechDetectionAvailable.value) {
    openedIn5s.value = null;
    openDetectionMode.value = "unavailable";
  } else if (firstTranscriptMs.value === null) {
    openedIn5s.value = false;
    openDetectionMode.value = "transcript";
  } else {
    openedIn5s.value = firstTranscriptMs.value <= 5000;
    openDetectionMode.value = "transcript";
  }

  if (!hasUsableRoundAudio(stopResult)) {
    nextSuggestion.value = "本轮录音不可用，请优先重新录音。";
  } else if (openedIn5s.value === false) {
    nextSuggestion.value = "下一轮优先把开口提前到 5 秒以内。";
  } else if (!goalDurationReached.value) {
    nextSuggestion.value = `下一轮尽量说满 ${TARGET_DURATION_SEC} 秒，结构保持不变。`;
  } else if (canNextRound.value) {
    nextSuggestion.value = "下一轮自动降提示，尝试更少依赖模板。";
  } else {
    nextSuggestion.value = "三连练已完成，可随机下一题或继续弱项图型。";
  }

  phase.value = "ready_to_save";
}

function toggleTemplateBlock(blockId) {
  const normalized = `${blockId || ""}`.trim();
  if (!normalized) return;
  if (selectedBlockIds.value.includes(normalized)) {
    selectedBlockIds.value = selectedBlockIds.value.filter((item) => item !== normalized);
    return;
  }
  selectedBlockIds.value = [...selectedBlockIds.value, normalized].slice(0, 8);
}

async function useRescuePhrase(phrase) {
  rescueUsedCount.value += 1;
  const text = `${phrase?.text || ""}`.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    uiStore.showToast("救命词已复制。", "success", 1800);
  } catch {
    uiStore.showToast("已记录本次救命词使用。", "success", 1800);
  }
}

async function retryCurrentRound() {
  phase.value = "idle";
  await startRound();
}

async function persistCurrentRound() {
  if (savingRound.value || !question.value?.id) return false;
  if (!hasUsableRoundAudio(roundStopResult.value)) {
    uiStore.showToast("请先完成可用录音，再提交练习。", "warning");
    return false;
  }

  savingRound.value = true;
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      uiStore.showToast("登录状态失效，请重新登录。", "warning");
      return false;
    }

    const audioMeta = await uploadDIAudio({
      userId: session.user.id,
      questionId: question.value.id,
      blob: roundStopResult.value?.blob
    });
    if (!audioMeta?.path) {
      uiStore.showToast("录音保存失败，请重试。", "warning");
      return false;
    }

    const finishedAtIso = new Date().toISOString();
    const startedAtIso = roundStartedAtIso.value || finishedAtIso;
    const normalizedFluency = Math.max(1, Math.min(5, Math.round(Number(selfFluencyRating.value || 0))));
    const normalizedStructure = Math.max(1, Math.min(5, Math.round(Number(selfStructureRating.value || 0))));
    const normalizedFreezeCount = Math.max(0, Math.round(Number(selfFreezeCount.value || 0)));
    const speechSec = Math.max(
      0,
      Math.round(Number(roundStopResult.value?.playableDurationSec || speechDurationSec.value || 0))
    );
    const analytics = buildPracticeAnalytics({
      source: "computed_client_flow",
      totalActiveSec: Number(prepareDurationSec.value || 0) + speechSec,
      breakdown: {
        prepare_sec: Number(prepareDurationSec.value || 0),
        record_sec: speechSec,
        speech_sec: speechSec
      }
    });

    const payload = {
      user_id: session.user.id,
      task_type: "DI",
      question_id: question.value.id,
      transcript: roundTranscript.value,
      feedback: nextSuggestion.value,
      score_json: {
        mode: "di_phase1_training",
        question: {
          id: question.value.id,
          image_type: question.value.imageType,
          difficulty: question.value.difficulty,
          tags: question.value.tags || [],
          is_high_frequency: Boolean(question.value.isHighFrequency)
        },
        session: {
          hint_level: hintLevel.value,
          five_second_mode: Boolean(fiveSecondModeEnabled.value),
          drill_round: drillRound.value,
          drill_total_rounds: TOTAL_DRILL_ROUNDS,
          used_template_block_ids: [...selectedBlockIds.value]
        },
        metrics: {
          opened_in_5s: openedIn5s.value,
          open_detection_mode: openDetectionMode.value,
          speech_duration_sec: speechDurationSec.value,
          rescue_used_count: rescueUsedCount.value,
          self_fluency_rating: normalizedFluency,
          self_structure_rating: normalizedStructure,
          self_freeze_count: normalizedFreezeCount
        },
        analytics,
        timestamps: {
          practice_started_at: startedAtIso,
          practice_finished_at: finishedAtIso
        },
        training: {
          submit_mode: "practice_only",
          saved_success: true
        },
        audio: audioMeta
      }
    };

    const { error } = await supabase.from("practice_logs").insert(payload);
    if (error) {
      console.warn("DI practice_logs insert error:", error, {
        questionId: question.value.id,
        drillRound: drillRound.value
      });
      uiStore.showToast("练习记录保存失败，请稍后再试。", "warning");
      return false;
    }

    roundSavedAt.value = finishedAtIso;
    uiStore.showToast("提交练习成功，录音已保存。", "success", 1800);
    await Promise.all([loadWeakImageType(), loadQuestionHistory()]);
    return true;
  } finally {
    savingRound.value = false;
  }
}

async function saveAndNextRound() {
  const ok = await persistCurrentRound();
  if (!ok) return;
  drillRound.value = Math.min(TOTAL_DRILL_ROUNDS, drillRound.value + 1);
  hintLevel.value = resolveHintByRound(drillRound.value);
  phase.value = "idle";
  await startRound();
}

async function saveAndNextQuestion() {
  const ok = await persistCurrentRound();
  if (!ok) return;

  const nextQuestion = getRandomDIQuestion({
    excludedId: question.value?.id || ""
  });
  if (!nextQuestion?.id) {
    uiStore.showToast("暂无可用下一题，返回首页。", "warning");
    router.push("/home");
    return;
  }

  router.push({
    path: `/di/practice/${nextQuestion.id}`,
    query: {
      hint: "strong",
      drillRound: "1"
    }
  });
}

async function saveAndWeakQuestion() {
  const ok = await persistCurrentRound();
  if (!ok) return;

  const targetImageType = weakestImageType.value || "";
  const nextQuestion = getRandomDIQuestion({
    excludedId: question.value?.id || "",
    filters: targetImageType
      ? {
          imageType: targetImageType
        }
      : {}
  });

  if (!nextQuestion?.id) {
    uiStore.showToast("弱项图型暂无可用题目，已切换随机下一题。", "warning");
    const fallbackQuestion = getRandomDIQuestion({
      excludedId: question.value?.id || ""
    });
    if (!fallbackQuestion?.id) {
      router.push("/home");
      return;
    }
    router.push({
      path: `/di/practice/${fallbackQuestion.id}`,
      query: {
        hint: "strong",
        drillRound: "1"
      }
    });
    return;
  }

  router.push({
    path: `/di/practice/${nextQuestion.id}`,
    query: {
      hint: "strong",
      imageType: targetImageType,
      drillRound: "1"
    }
  });
}

watch(
  () => recorder.transcript.value,
  (value) => {
    if (phase.value !== "recording") return;
    const text = `${value || ""}`.trim();
    if (!text) return;
    if (firstTranscriptMs.value !== null) return;
    firstTranscriptMs.value = Math.max(0, Math.round(nowMs() - Number(recordingStartedAt.value || nowMs())));
  }
);

watch(
  () => route.params?.id,
  async () => {
    const allowed = await ensureAvailability();
    if (!allowed) return;
    timer.stop();
    recorder.stopRecording();
    await loadQuestionByRoute();
    await loadQuestionHistory();
    await startRound();
  }
);

onMounted(async () => {
  const allowed = await ensureAvailability();
  if (!allowed) return;
  await loadQuestionByRoute();
  await Promise.all([loadWeakImageType(), loadQuestionHistory()]);
  await startRound();
});

onUnmounted(() => {
  timer.stop();
  recorder.stopRecording();
  revokePreviewAudioUrl();
  clearHistoryPlaybackState();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="DI 单题训练" back-to="/home" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-2 text-sm text-muted">题目加载中...</p>
      </div>

      <template v-else-if="question">
        <DIDrillProgress :round="drillRound" :total="TOTAL_DRILL_ROUNDS" :hint-level="hintLevel" />

        <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="rounded bg-orange/10 px-2 py-0.5 text-xs font-semibold text-orange">{{ question.sourceNumberLabel }}</span>
            <span class="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{{ question.imageType }}</span>
            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-muted">difficulty {{ question.difficulty }}</span>
          </div>
          <p class="mb-3 text-sm font-semibold text-navy">{{ question.displayTitle }}</p>
          <div class="overflow-hidden rounded-lg border border-gray-200">
            <img :src="question.imageUrl" :alt="question.imageAlt" class="w-full object-cover" />
          </div>
        </section>

        <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">录音区</p>
            <div class="flex items-center gap-2 text-xs text-muted">
              <span>5 秒开口模式</span>
              <input v-model="fiveSecondModeEnabled" type="checkbox" />
            </div>
          </div>

          <div v-if="phase === 'preparing'" class="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            准备中... {{ timer.remaining }} 秒后开始录音
            <div class="mt-3">
              <OrangeButton @click="skipPrepareAndStartRecording">跳过准备，立即录音</OrangeButton>
            </div>
          </div>

          <div v-else-if="phase === 'recording'" class="rounded-lg bg-orange/5 p-3 text-sm">
            <p class="mb-1 text-orange">录音中：剩余 {{ timer.remaining }} 秒</p>
            <p class="text-muted">请保持结构：开头 -> 总览 -> 细节 -> 收尾</p>
            <p class="mt-2 text-xs text-text">{{ recorder.transcript || "实时转写中（可能不可用）..." }}</p>
            <div class="mt-3">
              <OrangeButton :disabled="!canFinishRecording" @click="finishRecording">
                {{ canFinishRecording ? "结束录音" : "录音中..." }}
              </OrangeButton>
            </div>
          </div>

          <div v-else-if="phase === 'processing'" class="rounded-lg bg-gray-50 p-3 text-sm text-muted">
            正在整理本轮结果...
          </div>

          <div v-else-if="phase === 'ready_to_save'" class="rounded-lg bg-gray-50 p-3 text-sm">
            <p class="font-semibold text-navy">
              {{ hasRecordedAudio ? "本轮录音已完成，可先试听再提交练习。" : "本轮录音不可用，请先重新录音。" }}
            </p>
            <audio
              v-if="hasPreviewAudio"
              ref="previewAudioRef"
              class="mt-3 w-full"
              :src="previewAudioUrl"
              controls
              preload="metadata"
            />
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300"
                :disabled="!hasPreviewAudio"
                @click="playPreviewAudio"
              >
                试听录音
              </button>
              <button
                type="button"
                class="rounded-lg border border-orange px-3 py-1.5 text-xs font-semibold text-orange transition-colors hover:bg-orange/5"
                :disabled="savingRound"
                @click="retryCurrentRound"
              >
                重新录音
              </button>
            </div>
          </div>

          <div v-else class="rounded-lg bg-gray-50 p-3 text-sm text-muted">
            点击下方按钮开始本轮。
            <div class="mt-2">
              <OrangeButton @click="startRound">开始本轮</OrangeButton>
            </div>
          </div>
        </section>

        <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DIHintPanel
            :blocks="templateBlocks"
            :selected-block-ids="selectedBlockIds"
            :hint-level="hintLevel"
            @toggle-block="toggleTemplateBlock"
          />
          <DIRescuePanel :phrases="rescuePhrases" :used-count="rescueUsedCount" @use-phrase="useRescuePhrase" />
        </div>

        <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">本题高频词汇</p>
            <span class="text-xs text-muted">{{ questionHighFrequencyWords.length }} words</span>
          </div>

          <div v-if="questionHighFrequencyWords.length" class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <article
              v-for="(word, index) in questionHighFrequencyWords"
              :key="`${word.word}-${index}`"
              class="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <div class="flex items-baseline gap-2">
                <p class="text-sm font-semibold text-navy">{{ word.word }}</p>
                <span v-if="word.partOfSpeech" class="text-xs text-slate-500">{{ word.partOfSpeech }}</span>
              </div>
              <p v-if="word.chinese" class="mt-1 text-xs text-slate-700">{{ word.chinese }}</p>
              <p v-if="word.note" class="mt-1 text-xs text-slate-600">{{ word.note }}</p>
              <p v-if="word.example" class="mt-1 text-xs italic text-slate-500">{{ word.example }}</p>
            </article>
          </div>
          <p v-else class="text-xs text-slate-500">当前题目暂无词汇数据。</p>
        </section>

        <section v-if="hasRoundResult" class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">本轮自评</p>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label class="text-xs text-muted">
              流利度（1-5）
              <input v-model.number="selfFluencyRating" type="number" min="1" max="5" class="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-text" />
            </label>
            <label class="text-xs text-muted">
              结构度（1-5）
              <input v-model.number="selfStructureRating" type="number" min="1" max="5" class="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-text" />
            </label>
            <label class="text-xs text-muted">
              卡顿次数
              <input v-model.number="selfFreezeCount" type="number" min="0" max="20" class="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-sm text-text" />
            </label>
          </div>
        </section>

        <div v-if="hasRoundResult" class="mt-4">
          <DIResultPanel
            :summary="resultSummary"
            :round="drillRound"
            :total-rounds="TOTAL_DRILL_ROUNDS"
            :hint-level="hintLevel"
            :can-next-round="canNextRound"
            :can-submit="canSubmitRoundPractice"
            :saving="savingRound"
            :show-weak-action="showWeakAction"
            @retry-round="retryCurrentRound"
            @save-next-round="saveAndNextRound"
            @save-next-question="saveAndNextQuestion"
            @save-weak="saveAndWeakQuestion"
          />
        </div>

        <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-navy">本题历史录音</p>
            <button
              type="button"
              class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800"
              :disabled="questionHistoryLoading"
              @click="loadQuestionHistory"
            >
              {{ questionHistoryLoading ? "加载中..." : "刷新历史" }}
            </button>
          </div>

          <p v-if="questionHistoryError" class="text-xs text-red-600">{{ questionHistoryError }}</p>
          <p v-else-if="questionHistoryLoading" class="text-xs text-slate-500">正在加载本题历史...</p>
          <p v-else-if="!questionHistoryRecords.length" class="text-xs text-slate-500">本题还没有历史录音。</p>

          <article
            v-for="record in questionHistoryRecords"
            v-else
            :key="record.id"
            class="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3 last:mb-0"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-slate-500">{{ formatHistoryDateTime(record.createdAt) }}</p>
              <p class="text-xs font-semibold text-navy">{{ question.sourceNumberLabel }}</p>
            </div>

            <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
              <span class="rounded bg-white px-2 py-0.5">时长 {{ Number(record.score?.metrics?.speechDurationSec || 0) }}s</span>
              <span class="rounded bg-white px-2 py-0.5">hint {{ record.score?.session?.hintLevel || "-" }}</span>
              <span class="rounded bg-white px-2 py-0.5">drill {{ Number(record.score?.session?.drillRound || 1) }}</span>
            </div>

            <p v-if="record.transcript" class="mt-2 text-xs text-slate-600 line-clamp-2">{{ record.transcript }}</p>

            <div v-if="hasDIAudio(record)" class="mt-2 space-y-2">
              <audio
                v-if="getHistoryPlaybackState(record.id).url"
                class="w-full"
                controls
                preload="none"
                :src="getHistoryPlaybackState(record.id).url"
              />

              <button
                type="button"
                class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800"
                :disabled="getHistoryPlaybackState(record.id).loading"
                @click="loadHistoryPlayback(record)"
              >
                {{ getHistoryPlaybackState(record.id).url ? "刷新回放链接" : "加载并播放录音" }}
              </button>

              <p v-if="getHistoryPlaybackState(record.id).loading" class="text-xs text-slate-500">正在加载回放链接...</p>
              <p v-if="getHistoryPlaybackState(record.id).error" class="text-xs text-red-600">{{ getHistoryPlaybackState(record.id).error }}</p>
            </div>
            <p v-else class="mt-2 text-xs text-slate-500">本次记录没有可回放录音。</p>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>
