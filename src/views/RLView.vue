<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { useRecorder } from "@/composables/useRecorder";
import { useTTS } from "@/composables/useTTS";
import { useTimer } from "@/composables/useTimer";
import { useAuthStore } from "@/stores/auth";
import { getRandomQuestion } from "@/lib/questions";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "RL_FALLBACK",
  topic: "General Topic",
  imageKeyword: "education lecture",
  audioScript: "The lecture discusses a general academic topic.",
  keyPoints: ["main idea", "supporting detail"],
  content: "Topic: General lecture."
};

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const timer = useTimer();
const recorder = useRecorder();
const tts = useTTS();

const phase = ref("playing");
const notes = ref("");
const showTemplate = ref(false);
const recordingSeconds = ref(0);
const playbackStartedAtMs = ref(0);
const playbackDurationSec = ref(0);
const prepareStartedAtMs = ref(0);
const prepareDurationSec = ref(0);
const questionIndex = ref(1);
const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });

const canSubmit = computed(() => recordingSeconds.value >= 3);

const barHeights = [10, 16, 24, 34, 28, 22, 30, 20, 14];
const keyPoints = computed(() => {
  if (Array.isArray(question.value?.keyPoints)) return question.value.keyPoints;
  if (Array.isArray(question.value?.key_points)) return question.value.key_points;
  return [];
});
const imageUrl = computed(() => {
  const explicit = question.value?.imageUrl || question.value?.image_url;
  if (explicit) return explicit;

  const keyword = question.value?.imageKeyword || question.value?.image_keyword || question.value?.topic || "education lecture";
  return `https://source.unsplash.com/800x400/?${encodeURIComponent(keyword)}`;
});

let isSubmitting = false;
let isStartingRecording = false;
let recordingTicker = null;
let unmounted = false;
let playbackDelayTimer = null;
let audioPlayer = null;
let hasFinalizedRecording = false;
let submitCallCount = 0;

function getQuestionAudioScript() {
  return question.value?.audioScript || question.value?.audio_script || question.value?.content || defaultQuestion.audioScript;
}

function getQuestionAudioUrl() {
  return question.value?.audioUrl || question.value?.audio_url || "";
}

function syncQuestionToStore() {
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || defaultQuestion.id,
    taskType: "RL",
    content: getQuestionAudioScript()
  });
}

async function loadQuestion({ incrementIndex = false } = {}) {
  questionLoading.value = true;

  try {
    const picked = await getRandomQuestion("RL");
    question.value = picked || { ...defaultQuestion };
    syncQuestionToStore();

    if (incrementIndex) {
      questionIndex.value += 1;
    }
  } finally {
    questionLoading.value = false;
  }
}

function stopAudioPlayer() {
  if (!audioPlayer) return;

  audioPlayer.onended = null;
  audioPlayer.onerror = null;
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer = null;
  tts.isPlaying.value = false;
}

function playTextToSpeech(onEnd) {
  const text = getQuestionAudioScript();
  if (!tts.isSupported.value || !text) {
    if (onEnd) onEnd();
    return;
  }

  tts.speak(text, onEnd);
}

function playRealAudio(url, onEnd) {
  stopAudioPlayer();

  const audio = new Audio(url);
  audioPlayer = audio;
  tts.isPlaying.value = true;

  const finish = () => {
    if (audioPlayer !== audio) return;
    stopAudioPlayer();
    if (onEnd) onEnd();
  };

  const fail = () => {
    if (audioPlayer !== audio) return;
    stopAudioPlayer();
    playTextToSpeech(onEnd);
  };

  audio.onended = finish;
  audio.onerror = fail;
  audio.play().catch(fail);
}

function playQuestionAudio(onEnd) {
  playbackStartedAtMs.value = Date.now();
  const finish = () => {
    const elapsedMs = playbackStartedAtMs.value
      ? Math.max(0, Date.now() - Number(playbackStartedAtMs.value || 0))
      : 0;
    playbackDurationSec.value = Math.max(0, Math.round(elapsedMs / 1000));
    if (onEnd) onEnd();
  };
  const realAudioUrl = getQuestionAudioUrl();
  if (realAudioUrl) {
    playRealAudio(realAudioUrl, finish);
    return;
  }

  playTextToSpeech(finish);
}

function startLecturePlayback(delay = 700) {
  cleanupPlaybackDelay();
  stopAudioPlayer();
  stopRecordingTicker();
  timer.stop();
  tts.stop();
  void recorder.stopRecorderAndGetBlob({ reason: "playback_reset" });

  phase.value = "playing";
  notes.value = "";
  showTemplate.value = false;
  recordingSeconds.value = 0;
  playbackDurationSec.value = 0;
  prepareDurationSec.value = 0;
  hasFinalizedRecording = false;

  playbackDelayTimer = setTimeout(() => {
    if (unmounted || questionLoading.value) return;
    playQuestionAudio(startPreparing);
  }, delay);
}

function startPreparing() {
  if (questionLoading.value) return;
  phase.value = "preparing";
  prepareStartedAtMs.value = Date.now();
  hasFinalizedRecording = false;
  timer.start(10, startRecording);
}

async function startRecording() {
  if (questionLoading.value) return;
  if (isStartingRecording || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording = true;

  try {
    if (phase.value === "preparing") {
      const elapsedMs = prepareStartedAtMs.value
        ? Math.max(0, Date.now() - Number(prepareStartedAtMs.value || 0))
        : 0;
      prepareDurationSec.value = Math.min(10, Math.max(0, Math.round(elapsedMs / 1000)));
    }
    phase.value = "recording";
    const started = await recorder.startRecording();
    if (!started) {
      phase.value = "idle";
      return;
    }

    hasFinalizedRecording = false;
    submitCallCount = 0;
    startRecordingTicker();
    timer.start(40, handleSubmit);
  } finally {
    isStartingRecording = false;
  }
}

async function handleSubmit() {
  if (questionLoading.value) return;
  if (isSubmitting || hasFinalizedRecording || phase.value !== "recording") return;
  isSubmitting = true;
  hasFinalizedRecording = true;
  submitCallCount += 1;

  try {
    phase.value = "processing";
    stopRecordingTicker();
    timer.stop();
    const stopResult = await recorder.stopRecorderAndGetBlob({ reason: "submit" });
    debugSubmit("stop_result", stopResult);

    const transcript = `${stopResult?.transcript || recorder.transcript.value || ""}`.trim();
    if (shouldRetryWithToast(stopResult, transcript)) {
      phase.value = "idle";
      if (!unmounted) {
        await restartRecording();
      }
      return;
    }

    const recordFromPlayable = Number(stopResult?.playableDurationSec || 0);
    const recordFromDurationMs = Number(stopResult?.durationMs || 0);
    const recordSec = Number.isFinite(recordFromPlayable) && recordFromPlayable > 0
      ? Math.max(0, Math.round(recordFromPlayable))
      : Number.isFinite(recordFromDurationMs) && recordFromDurationMs > 0
        ? Math.max(0, Math.round(recordFromDurationMs / 1000))
        : Math.max(0, Math.round(Number(recordingSeconds.value || 0)));
    const playSec = Math.max(0, Math.round(Number(playbackDurationSec.value || 0)));
    const prepareSec = Math.max(0, Math.round(Number(prepareDurationSec.value || 0)));
    const scoreResult = await practiceStore.submitScore(
      "RL",
      transcript,
      getQuestionAudioScript(),
      question.value?.id || "unknown",
      {
        logAnalytics: {
          source: recordSec > 0 ? "computed_client_flow" : "fallback_existing_duration",
          totalActiveSec: playSec + prepareSec + recordSec,
          breakdown: {
            play_sec: playSec,
            prepare_sec: prepareSec,
            record_sec: recordSec,
            speech_sec: recordSec
          }
        }
      }
    );

    if (!unmounted && practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
      router.push("/rl/result");
    }
  } finally {
    isSubmitting = false;
  }
}

async function skipQuestion() {
  if (questionLoading.value || phase.value === "processing") return;

  cleanupPlaybackDelay();
  stopAudioPlayer();
  stopRecordingTicker();
  timer.stop();
  tts.stop();
  await recorder.stopRecorderAndGetBlob({ reason: "skip" });
  hasFinalizedRecording = false;

  await loadQuestion({ incrementIndex: true });
  startLecturePlayback(250);
}

async function restartRecording() {
  if (questionLoading.value || isStartingRecording || phase.value === "processing") return;

  stopRecordingTicker();
  timer.stop();
  await recorder.stopRecorderAndGetBlob({ reason: "restart" });
  phase.value = "idle";
  hasFinalizedRecording = false;
  await startRecording();
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
}

function debugSubmit(event, payload) {
  if (!import.meta.env.DEV) return;
  console.info(`[rl-submit:${submitCallCount}] ${event}`, payload);
}

function shouldRetryWithToast(stopResult, transcript) {
  if (stopResult?.blobTooLarge) {
    uiStore.showToast("Recording is too long. Please try a shorter response.", "warning");
    return true;
  }

  if (stopResult?.recorderStopTimedOut || stopResult?.recognitionStopTimedOut) {
    uiStore.showToast("Processing took too long. Please try again.", "warning");
    return true;
  }

  if (!stopResult?.hasAudio) {
    uiStore.showToast("Recording failed. Please try again.", "warning");
    return true;
  }

  if (!transcript || transcript.length < 3) {
    uiStore.showToast("No speech detected. Please try again.", "warning");
    return true;
  }

  return false;
}

function cleanupPlaybackDelay() {
  clearTimeout(playbackDelayTimer);
  playbackDelayTimer = null;
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }

  await loadQuestion();
  startLecturePlayback();
});

onUnmounted(() => {
  unmounted = true;
  cleanupPlaybackDelay();
  stopAudioPlayer();
  stopRecordingTicker();
  timer.stop();
  tts.stop();
  recorder.stopRecording();
});
</script>

<template>
  <div class="kk-page min-h-screen">
    <NavBar title="Re-tell Lecture" back-to="/home" variant="kk" />

    <main class="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <p class="kk-num mb-4 text-[13px] font-semibold text-kk-ink-3">Question {{ questionIndex }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-kk-ink border-t-transparent" />
        <p class="mt-3 text-sm text-kk-ink-3">Loading question...</p>
      </div>

      <template v-else>
        <section v-if="phase === 'playing'" class="space-y-4">
          <article class="overflow-hidden rounded-[20px] border border-kk-line bg-kk-surface shadow-kk">
            <img :src="imageUrl" :alt="question.topic || 'Lecture topic'" class="h-48 w-full object-cover" @error="(e) => (e.target.style.display = 'none')" />
            <div class="p-4">
              <p class="text-xs text-kk-ink-3">Topic</p>
              <p class="text-[17px] font-bold text-kk-ink">{{ question.topic || "General Topic" }}</p>
            </div>
          </article>

          <section class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
            <div class="mb-3 flex items-center justify-between text-sm">
              <span class="text-kk-ink-3">Lecture Playback</span>
              <span :class="tts.isPlaying ? 'font-semibold text-kk-action-text' : 'text-kk-ink-3'">
                {{ tts.isPlaying ? "Playing..." : "Loading..." }}
              </span>
            </div>
            <div class="flex h-10 items-end justify-center gap-1.5">
              <div
                v-for="(h, i) in barHeights"
                :key="i"
                class="w-1.5 rounded-full bg-kk-ink transition-all"
                :class="tts.isPlaying ? 'animate-pulse' : 'opacity-25'"
                :style="{ height: `${h}px`, animationDelay: `${i * 0.08}s` }"
              />
            </div>
          </section>

          <section class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
            <p class="mb-2 text-sm font-semibold text-kk-ink">Quick Notes (not scored)</p>
            <textarea
              v-model="notes"
              placeholder="Write key words while listening..."
              class="h-24 w-full resize-none rounded-2xl border border-kk-line bg-kk-surface-2 p-3 text-[15px] text-kk-ink focus:border-kk-ink focus:bg-kk-surface focus:outline-none"
            />
          </section>

          <button type="button" class="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-kk-action-text" @click="skipQuestion">Skip</button>
        </section>

        <section v-else-if="phase === 'preparing'" class="space-y-4">
          <article class="rounded-[20px] border border-kk-line bg-kk-surface p-6 text-center shadow-kk">
            <p class="text-lg font-bold text-kk-ink">Get ready to re-tell the lecture</p>
            <p class="mt-1 text-sm text-kk-ink-3">Recording starts automatically</p>
          </article>

          <TimerBar tone="kk" label="Preparation" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />

          <section class="rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
            <p class="mb-2 text-sm font-semibold text-kk-ink">Structure template</p>
            <p class="text-sm leading-relaxed text-kk-ink-3">
              The lecture mainly discusses <span class="rounded bg-kk-notice-bg px-1 font-semibold text-kk-notice">[topic]</span>. The speaker mentions
              <span class="rounded bg-kk-notice-bg px-1 font-semibold text-kk-notice">[point 1]</span>, then explains
              <span class="rounded bg-kk-notice-bg px-1 font-semibold text-kk-notice">[point 2]</span>, and finally concludes
              <span class="rounded bg-kk-notice-bg px-1 font-semibold text-kk-notice">[conclusion]</span>.
            </p>
          </section>

          <section v-if="notes" class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
            <p class="mb-1 text-xs text-kk-ink-3">Your notes</p>
            <p class="text-sm text-kk-ink">{{ notes }}</p>
          </section>
        </section>

        <section v-else-if="phase === 'recording'" class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar tone="kk" label="Recording" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="inline-flex min-h-[44px] items-center text-sm font-semibold text-kk-action-text" @click="skipQuestion">Skip</button>
          </div>

          <section class="rounded-[20px] border border-kk-line bg-kk-surface p-4 text-center shadow-kk">
            <div v-if="!recorder.isReady" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-kk-ink border-t-transparent" />
              <p class="text-sm text-kk-ink-3">Microphone warming up...</p>
            </div>
            <div v-else class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 animate-pulse rounded-full bg-kk-action" />
              <p class="font-bold text-kk-ink">Start re-telling now</p>
            </div>
          </section>

          <section class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
            <RecordingWave tone="kk" :is-recording="Boolean(recorder.isRecording.value)" />
            <div class="mt-4 flex gap-3">
              <button
                type="button"
                class="min-h-[52px] flex-1 rounded-full border border-kk-line bg-kk-surface py-3 text-[15px] font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
                @click="restartRecording"
              >
                Re-record
              </button>
              <button
                type="button"
                class="min-h-[52px] flex-1 rounded-full py-3 text-[15px] font-bold transition-colors"
                :class="canSubmit ? 'bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press' : 'cursor-not-allowed bg-kk-surface-2 text-kk-ink-3'"
                :disabled="!canSubmit"
                @click="handleSubmit"
              >
                {{ canSubmit ? "Submit Response" : "Recording..." }}
              </button>
            </div>
          </section>

          <section>
            <button type="button" class="inline-flex min-h-[44px] items-center text-sm font-semibold text-kk-action-text" @click="showTemplate = !showTemplate">
              {{ showTemplate ? "Hide template" : "Show template" }}
            </button>
            <div v-if="showTemplate" class="mt-2 rounded-xl border border-kk-line bg-kk-surface-2 p-4">
              <p class="text-sm leading-relaxed text-kk-ink">
                The lecture mainly discusses <strong>{{ question.topic || "the topic" }}</strong>. The speaker mentions
                <strong>{{ keyPoints[0] || "the first key point" }}</strong> and explains
                <strong>{{ keyPoints[1] || "the second key point" }}</strong>.
              </p>
            </div>
          </section>
        </section>

        <section v-else-if="phase === 'processing'" class="py-10 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-kk-surface-2">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-kk-ink border-t-transparent" />
          </div>
          <p class="text-xl font-bold text-kk-ink">Analysing your response...</p>
        </section>

        <section v-else class="rounded-[20px] border border-kk-line bg-kk-surface p-6 text-center shadow-kk">
          <p class="text-sm text-kk-ink-3">Microphone permission or speech recognition is required.</p>
          <button type="button" class="mt-4 inline-flex min-h-[44px] items-center text-sm font-semibold text-kk-action-text" @click="startLecturePlayback(200)">Try again</button>
        </section>

        <section v-if="recorder.error && phase !== 'processing'" class="mt-4 rounded-lg border border-kk-error-line bg-kk-error-bg p-4">
          <p class="text-sm text-kk-error">{{ recorder.error }}</p>
        </section>
      </template>
    </main>
  </div>
</template>
