<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import NavBar from "@/components/NavBar.vue";
import { fetchQuestions, getQuestionAudioUrl } from "@/lib/questions";

const questions = ref([]);
const loading = ref(true);
const currentIndex = ref(0);
const isPlaying = ref(false);
const showText = ref(false);
const intervalSeconds = ref(2);
const autoLoop = ref(false);
const finished = ref(false);
const autoplayHint = ref("");
const queueActivated = ref(false);

let audioElement = null;
let queueTimer = null;
let destroyed = false;

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const progressPercent = computed(() => {
  const total = questions.value.length;
  if (!total) return 0;
  return Math.round(((currentIndex.value + 1) / total) * 100);
});

function getAudioUrl(question) {
  if (!question) return "";
  return String(getQuestionAudioUrl(question, "WFD") || "").trim();
}

function clearQueueTimer() {
  if (!queueTimer) return;
  clearTimeout(queueTimer);
  queueTimer = null;
}

function ensureAudioElement() {
  if (audioElement) return audioElement;

  const audio = new Audio();
  audio.preload = "auto";

  audio.onended = () => {
    isPlaying.value = false;
    if (!queueActivated.value) return;
    scheduleNext(intervalSeconds.value);
  };

  audio.onerror = () => {
    isPlaying.value = false;
    if (!queueActivated.value) return;
    scheduleNext(1);
  };

  audioElement = audio;
  return audioElement;
}

function destroyAudioElement() {
  if (!audioElement) return;
  audioElement.onended = null;
  audioElement.onerror = null;
  audioElement.pause();
  audioElement.src = "";
  audioElement.load();
  audioElement = null;
}

function stopPlayback() {
  clearQueueTimer();
  if (audioElement) {
    audioElement.pause();
  }
  isPlaying.value = false;
}

function markFinished() {
  finished.value = true;
  isPlaying.value = false;
  clearQueueTimer();
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
}

function scheduleNext(delaySeconds) {
  clearQueueTimer();
  queueTimer = setTimeout(() => {
    queueTimer = null;
    advanceToNext();
  }, Math.max(0, Number(delaySeconds) || 0) * 1000);
}

function advanceToNext() {
  if (destroyed || !questions.value.length) return;

  if (currentIndex.value < questions.value.length - 1) {
    currentIndex.value += 1;
    playCurrentAudio();
    return;
  }

  if (autoLoop.value) {
    currentIndex.value = 0;
    finished.value = false;
    playCurrentAudio();
    return;
  }

  markFinished();
}

function playCurrentAudio({ fromUserGesture = false, restartTrack = true } = {}) {
  if (destroyed || !currentQuestion.value) return;

  const audioUrl = getAudioUrl(currentQuestion.value);
  if (!audioUrl) {
    isPlaying.value = false;
    if (queueActivated.value) {
      scheduleNext(1);
    }
    return;
  }

  const audio = ensureAudioElement();

  clearQueueTimer();
  finished.value = false;
  autoplayHint.value = "";

  if (audio.src !== audioUrl) {
    audio.src = audioUrl;
    restartTrack = true;
  }

  if (restartTrack) {
    audio.currentTime = 0;
  }

  if (fromUserGesture) {
    queueActivated.value = true;
  }

  audio
    .play()
    .then(() => {
      isPlaying.value = true;
    })
    .catch(() => {
      isPlaying.value = false;
      if (fromUserGesture) {
        queueActivated.value = false;
        autoplayHint.value = "播放被浏览器拦截，请再点一次播放。";
      } else {
        autoplayHint.value = "连播已暂停，点播放后会继续整队列。";
      }
    });
}

function togglePlay() {
  if (!questions.value.length) return;

  if (isPlaying.value) {
    stopPlayback();
    return;
  }

  if (finished.value) {
    restart();
    return;
  }

  if (!queueActivated.value) {
    playCurrentAudio({ fromUserGesture: true, restartTrack: true });
    return;
  }

  if (audioElement && audioElement.paused) {
    audioElement
      .play()
      .then(() => {
        isPlaying.value = true;
        autoplayHint.value = "";
      })
      .catch(() => {
        playCurrentAudio({ fromUserGesture: true, restartTrack: true });
      });
    return;
  }

  playCurrentAudio({ fromUserGesture: true, restartTrack: true });
}

function nextQuestion() {
  if (!questions.value.length || currentIndex.value >= questions.value.length - 1) return;
  currentIndex.value += 1;
  finished.value = false;

  if (queueActivated.value) {
    playCurrentAudio();
  }
}

function prevQuestion() {
  if (!questions.value.length || currentIndex.value <= 0) return;
  currentIndex.value -= 1;
  finished.value = false;

  if (queueActivated.value) {
    playCurrentAudio();
  }
}

function jumpTo(index) {
  if (!questions.value.length) return;
  if (index < 0 || index >= questions.value.length) return;

  currentIndex.value = index;
  finished.value = false;

  if (queueActivated.value) {
    playCurrentAudio();
  }
}

function restart() {
  if (!questions.value.length) return;
  currentIndex.value = 0;
  finished.value = false;
  playCurrentAudio({ fromUserGesture: true, restartTrack: true });
}

onMounted(async () => {
  try {
    questions.value = await fetchQuestions("WFD");
  } finally {
    loading.value = false;
  }

  if (!questions.value.length) return;
  autoplayHint.value = "点击播放开始连续播放。";
});

onUnmounted(() => {
  destroyed = true;
  stopPlayback();
  destroyAudioElement();
});
</script>

<template>
  <div class="kk-page min-h-screen">
    <NavBar title="WFD 磨耳朵模式" back-to="/wfd" variant="kk" />

    <main class="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <div v-if="loading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-kk-ink border-t-transparent" />
        <p class="mt-3 text-sm text-kk-ink-3">正在加载题库...</p>
      </div>

      <template v-else>
        <div v-if="!questions.length" class="rounded-[20px] border border-kk-line bg-kk-surface p-6 text-center shadow-kk">
          <p class="text-lg font-bold text-kk-ink">暂无 WFD 音频题目</p>
          <p class="mt-1 text-sm text-kk-ink-3">请稍后再试，或联系管理员检查题库。</p>
        </div>

        <template v-else>
          <section class="mb-6 rounded-[20px] bg-kk-surface p-5 shadow-kk">
            <div class="flex items-start gap-3">
              <div class="text-3xl">🎧</div>
              <div>
                <h2 class="text-lg font-bold text-kk-ink">磨耳朵模式</h2>
                <p class="mt-1 text-sm leading-relaxed text-kk-ink-3">
                  自动顺序播放全部 {{ questions.length }} 道 WFD 音频，适合通勤、走路、碎片时间练听力。
                </p>
              </div>
            </div>
          </section>

          <section class="mb-4 rounded-[20px] bg-kk-surface p-6 shadow-kk">
            <div class="mb-6 text-center">
              <p class="mb-1 text-xs text-kk-ink-3">第 {{ currentIndex + 1 }} 题 / 共 {{ questions.length }} 题</p>
              <p class="text-lg font-bold text-kk-ink">{{ currentQuestion?.id || "WFD" }}</p>

              <div class="mt-3 h-1.5 w-full rounded-full bg-kk-surface-2">
                <div class="h-1.5 rounded-full bg-kk-ink transition-all duration-300" :style="{ width: `${progressPercent}%` }" />
              </div>
            </div>

            <div class="mb-6 flex h-14 items-end justify-center gap-1">
              <div
                v-for="i in 13"
                :key="i"
                class="w-2 rounded-full transition-all duration-150"
                :class="isPlaying ? 'bg-kk-ink animate-bounce' : 'bg-kk-surface-2'"
                :style="{
                  height: isPlaying ? `${[8, 16, 24, 32, 40, 48, 56, 48, 40, 32, 24, 16, 8][i - 1]}px` : '8px',
                  animationDelay: `${i * 0.06}s`
                }"
              />
            </div>

            <div class="mb-6">
              <button
                type="button"
                class="inline-flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-kk-action-text"
                @click="showText = !showText"
              >
                {{ showText ? "隐藏句子" : "显示句子" }}
              </button>
              <div v-if="showText" class="mt-3 rounded-[20px] bg-kk-surface-2 p-4">
                <p class="text-center leading-relaxed text-kk-ink">{{ currentQuestion?.content }}</p>
              </div>
            </div>

            <div class="flex items-center justify-center gap-4">
              <button
                type="button"
                class="flex h-12 w-12 items-center justify-center rounded-full transition-all"
                :disabled="currentIndex === 0"
                :class="currentIndex === 0 ? 'cursor-not-allowed bg-kk-surface-2 text-kk-ink-3 opacity-45' : 'bg-kk-surface-2 text-kk-ink hover:bg-kk-line'"
                @click="prevQuestion"
              >
                ‹
              </button>

              <button
                type="button"
                class="flex h-16 w-16 items-center justify-center rounded-full bg-kk-action text-2xl text-kk-on-action shadow-[0_0_0_8px_var(--kk-action-soft)] transition-colors hover:bg-kk-action-hover active:bg-kk-action-press"
                @click="togglePlay"
              >
                {{ isPlaying ? "⏸" : "▶" }}
              </button>

              <button
                type="button"
                class="flex h-12 w-12 items-center justify-center rounded-full transition-all"
                :disabled="currentIndex === questions.length - 1"
                :class="
                  currentIndex === questions.length - 1
                    ? 'cursor-not-allowed bg-kk-surface-2 text-kk-ink-3 opacity-45'
                    : 'bg-kk-surface-2 text-kk-ink hover:bg-kk-surface-2'
                "
                @click="nextQuestion"
              >
                ›
              </button>
            </div>

            <p v-if="autoplayHint" class="mt-3 text-center text-xs text-kk-ink-3">{{ autoplayHint }}</p>
          </section>

          <section class="mb-4 rounded-[20px] bg-kk-surface p-4 shadow-kk">
            <p class="mb-3 text-sm font-semibold text-kk-ink">播放设置</p>

            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm text-kk-ink-3">每题间隔</span>
              <div class="flex gap-2">
                <button
                  v-for="sec in [1, 2, 3, 5]"
                  :key="sec"
                  type="button"
                  class="inline-flex min-h-[36px] items-center rounded-full px-3 text-sm font-medium transition-colors"
                  :class="intervalSeconds === sec ? 'bg-kk-ink text-kk-ink-inverse' : 'bg-kk-surface-2 text-kk-ink-2 hover:bg-kk-line'"
                  @click="intervalSeconds = sec"
                >
                  {{ sec }}s
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm text-kk-ink-3">播完后循环</span>
              <button
                type="button"
                class="relative h-6 w-12 rounded-full transition-all"
                :class="autoLoop ? 'bg-kk-ink' : 'bg-kk-line'"
                @click="autoLoop = !autoLoop"
              >
                <div class="absolute top-0.5 h-5 w-5 rounded-full bg-kk-surface shadow-kk transition-all" :class="autoLoop ? 'left-6' : 'left-0.5'" />
              </button>
            </div>
          </section>

          <section class="rounded-[20px] bg-kk-surface p-4 shadow-kk">
            <p class="mb-3 text-sm font-semibold text-kk-ink">全部题目</p>
            <div class="max-h-64 space-y-2 overflow-y-auto">
              <button
                v-for="(q, idx) in questions"
                :key="q.id"
                type="button"
                class="flex min-h-[48px] w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors"
                :class="idx === currentIndex ? 'bg-kk-surface-2 ring-1 ring-kk-ink' : 'hover:bg-kk-surface-2'"
                @click="jumpTo(idx)"
              >
                <div
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  :class="
                    idx === currentIndex
                      ? 'bg-kk-ink text-kk-ink-inverse'
                      : idx < currentIndex
                        ? 'bg-kk-success-bg text-kk-success'
                        : 'bg-kk-surface-2 text-kk-ink-3'
                  "
                >
                  {{ idx < currentIndex ? "✓" : idx + 1 }}
                </div>
                <p class="line-clamp-1 flex-1 text-sm text-kk-ink">{{ q.content }}</p>
                <span v-if="idx === currentIndex" class="text-xs font-semibold text-kk-action-text">播放中</span>
              </button>
            </div>
          </section>

          <section v-if="finished" class="mt-4 rounded-[20px] border border-kk-success-line bg-kk-success-bg p-5 text-center">
            <p class="mb-2 text-2xl">🎉</p>
            <p class="font-bold text-kk-ink">全部听完了</p>
            <p class="mt-1 text-sm text-kk-ink-3">今天已完成 {{ questions.length }} 道听力磨耳朵练习。</p>
            <button
              type="button"
              class="mt-4 min-h-[48px] rounded-full px-6 py-3 text-[15px] font-bold transition-colors bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press"
              @click="restart"
            >
              再听一遍
            </button>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>
