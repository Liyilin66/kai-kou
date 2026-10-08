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
  <div class="min-h-screen bg-bg">
    <NavBar title="Re-tell Lecture" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">Question {{ questionIndex }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <section v-if="phase === 'playing'" class="space-y-4">
          <article class="overflow-hidden rounded-xl border bg-white shadow-card">
            <img :src="imageUrl" :alt="question.topic || 'Lecture topic'" class="h-48 w-full object-cover" @error="(e) => (e.target.style.display = 'none')" />
            <div class="p-4">
              <p class="text-xs text-muted">Topic</p>
              <p class="font-bold text-navy">{{ question.topic || "General Topic" }}</p>
            </div>
          </article>

          <section class="rounded-xl border bg-white p-4 shadow-card">
            <div class="mb-3 flex items-center justify-between text-sm">
              <span class="text-muted">Lecture Playback</span>
              <span :class="tts.isPlaying ? 'font-semibold text-orange' : 'text-muted'">
                {{ tts.isPlaying ? "Playing..." : "Loading..." }}
              </span>
            </div>
            <div class="flex h-10 items-end justify-center gap-1.5">
              <div
                v-for="(h, i) in barHeights"
                :key="i"
                class="w-1.5 rounded-full bg-orange transition-all"
                :class="tts.isPlaying ? 'animate-pulse' : 'opacity-25'"
                :style="{ height: `${h}px`, animationDelay: `${i * 0.08}s` }"
              />
            </div>
          </section>

          <section class="rounded-xl border bg-white p-4 shadow-card">
            <p class="mb-2 text-sm font-semibold text-navy">Quick Notes (not scored)</p>
            <textarea
              v-model="notes"
              placeholder="Write key words while listening..."
              class="h-20 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-text focus:border-orange focus:outline-none"
            />
          </section>

          <button type="button" class="w-full text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">Skip</button>
        </section>

        <section v-else-if="phase === 'preparing'" class="space-y-4">
          <article class="rounded-xl border bg-white p-6 text-center shadow-card">
            <p class="text-lg font-bold text-navy">Get ready to re-tell the lecture</p>
            <p class="mt-1 text-sm text-muted">Recording starts automatically</p>
          </article>

          <TimerBar label="Preparation" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />

          <section class="rounded-xl border-l-4 border-orange bg-white p-4 shadow-sm">
            <p class="mb-2 text-sm font-semibold text-navy">Structure template</p>
            <p class="text-sm leading-relaxed text-muted">
              The lecture mainly discusses <span class="font-bold text-orange">[topic]</span>. The speaker mentions
              <span class="font-bold text-orange">[point 1]</span>, then explains
              <span class="font-bold text-orange">[point 2]</span>, and finally concludes
              <span class="font-bold text-orange">[conclusion]</span>.
            </p>
          </section>

          <section v-if="notes" class="rounded-xl border bg-white p-4 shadow-sm">
            <p class="mb-1 text-xs text-muted">Your notes</p>
            <p class="text-sm text-navy">{{ notes }}</p>
          </section>
        </section>

        <section v-else-if="phase === 'recording'" class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar label="Recording" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">Skip</button>
          </div>

          <section class="rounded-xl border bg-white p-4 text-center shadow-card">
            <div v-if="!recorder.isReady" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-orange border-t-transparent" />
              <p class="text-sm text-muted">Microphone warming up...</p>
            </div>
            <div v-else class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <p class="font-bold text-navy">Start re-telling now</p>
            </div>
          </section>

          <section class="rounded-xl border bg-white p-4 shadow-card">
            <RecordingWave :is-recording="Boolean(recorder.isRecording.value)" />
            <div class="mt-4 flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-xl border-2 border-gray-200 py-4 text-sm font-semibold text-muted transition-all hover:border-orange hover:text-orange"
                @click="restartRecording"
              >
                Re-record
              </button>
              <button
                type="button"
                class="flex-1 rounded-xl py-4 text-lg font-bold transition-all"
                :class="canSubmit ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400'"
                :disabled="!canSubmit"
                @click="handleSubmit"
              >
                {{ canSubmit ? "Submit Response" : "Recording..." }}
              </button>
            </div>
          </section>

          <section>
            <button type="button" class="text-sm text-orange underline transition-opacity hover:opacity-75" @click="showTemplate = !showTemplate">
              {{ showTemplate ? "Hide template" : "Show template" }}
            </button>
            <div v-if="showTemplate" class="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p class="text-sm leading-relaxed text-navy">
                The lecture mainly discusses <strong>{{ question.topic || "the topic" }}</strong>. The speaker mentions
                <strong>{{ keyPoints[0] || "the first key point" }}</strong> and explains
                <strong>{{ keyPoints[1] || "the second key point" }}</strong>.
              </p>
            </div>
          </section>
        </section>

        <section v-else-if="phase === 'processing'" class="py-10 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
          </div>
          <p class="text-xl font-bold text-navy">Analysing your response...</p>
        </section>

        <section v-else class="rounded-xl border bg-white p-6 text-center shadow-card">
          <p class="text-sm text-muted">Microphone permission or speech recognition is required.</p>
          <button type="button" class="mt-4 text-sm text-orange underline" @click="startLecturePlayback(200)">Try again</button>
        </section>

        <section v-if="recorder.error && phase !== 'processing'" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p class="text-sm text-red-600">{{ recorder.error }}</p>
        </section>
      </template>
    </main>
  </div>
</template>
