<template>
  <div class="kk-page min-h-screen">
    <NavBar title="WFD 听写练习" back-to="/wfd" variant="kk" />

    <div class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-kk-ink-3">{{ question?.id || "" }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-kk-ink border-t-transparent" />
        <p class="mt-3 text-sm text-kk-ink-3">加载题目中...</p>
      </div>

      <div v-else-if="!question" class="rounded-2xl bg-kk-surface p-8 text-center shadow-kk">
        <p class="text-xl font-bold text-kk-ink">暂无可用 WFD 题目</p>
        <p class="mt-2 text-sm leading-relaxed text-kk-ink-3">
          当前账号或环境没有读取到 WFD 题库。可以稍后重试，或先返回题库页检查题目状态。
        </p>
        <button
          type="button"
          class="mt-5 min-h-[48px] rounded-full px-6 py-3 text-[15px] font-bold bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press"
          @click="router.push('/wfd/list')"
        >
          返回 WFD 题库
        </button>
      </div>

      <div v-else-if="phase !== 'processing'">
        <div class="mb-4 rounded-[20px] bg-kk-surface p-5 shadow-kk">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm font-semibold text-kk-ink">Listen carefully</p>
            <button
              v-if="!isAudioPlaying && replaysLeft > 0"
              type="button"
              class="inline-flex min-h-[36px] items-center rounded-full border border-kk-line bg-kk-surface px-4 text-sm font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
              @click="replayAudio"
            >
              再听一遍 ({{ replaysLeft }})
            </button>
            <span v-else-if="isAudioPlaying" class="text-[13px] font-semibold text-kk-action-text">播放中...</span>
            <span v-else class="text-xs text-kk-ink-3">已无重听次数</span>
          </div>

          <div class="flex h-8 items-end justify-center gap-1">
            <div
              v-for="i in 11"
              :key="i"
              class="w-1.5 rounded-full bg-kk-ink transition-all duration-150"
              :class="isAudioPlaying ? 'animate-bounce' : 'opacity-20'"
              :style="{
                height: isAudioPlaying ? `${[8, 14, 20, 26, 30, 32, 30, 26, 20, 14, 8][i - 1]}px` : '4px',
                animationDelay: `${i * 0.07}s`
              }"
            />
          </div>
          <p v-if="audioError" class="mt-4 rounded-2xl bg-kk-error-bg px-3 py-2 text-sm leading-relaxed text-kk-error">
            {{ audioError }}
          </p>
        </div>

        <div class="mb-4 rounded-[20px] bg-kk-surface p-5 shadow-kk">
          <p class="mb-3 text-sm font-semibold text-kk-ink">Type what you heard</p>
          <input
            v-model="userInput"
            type="text"
            placeholder="Type the sentence here..."
            class="kk-text min-h-[52px] w-full rounded-2xl border border-kk-line bg-kk-surface-2 px-4 py-3 text-[17px] text-kk-ink focus:border-kk-ink focus:bg-kk-surface focus:outline-none"
            @keyup.enter="canSubmit && handleSubmit()"
          />
          <p class="mt-2 text-right text-xs text-kk-ink-3">
            {{ wordCount }} words
          </p>
        </div>

        <div class="mb-4">
          <button type="button" class="inline-flex min-h-[44px] items-center text-sm font-semibold text-kk-action-text" @click="showAnswer = !showAnswer">
            {{ showAnswer ? "隐藏答案" : "查看答案" }}
          </button>
          <div v-if="showAnswer" class="mt-2 rounded-2xl border border-kk-line bg-kk-surface-2 p-4">
            <p class="mb-1 text-xs text-kk-ink-3">标准答案</p>
            <p class="font-medium leading-relaxed text-kk-ink">{{ question?.content }}</p>
          </div>
        </div>

        <button
          type="button"
          class="mb-4 min-h-[52px] w-full rounded-full py-3 text-[15px] font-bold transition-colors"
          :class="canSubmit ? 'bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press' : 'cursor-not-allowed bg-kk-surface-2 text-kk-ink-3'"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          Submit
        </button>

        <div class="mb-4 rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
          <p class="mb-2 text-sm font-semibold text-kk-ink">Tips</p>
          <ul class="space-y-1 text-sm text-kk-ink-3">
            <li>- 拼写要准确，大小写不影响得分</li>
            <li>- 冠词和介词也要写</li>
            <li>- 可以边听边打，不用等音频结束</li>
          </ul>
        </div>

        <div class="text-center">
          <button type="button" class="inline-flex min-h-[44px] items-center text-sm font-semibold text-kk-action-text" @click="skipQuestion">跳过这题 →</button>
        </div>
      </div>

      <div v-else class="py-16 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-kk-surface-2">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-kk-ink border-t-transparent" />
        </div>
        <p class="text-xl font-bold text-kk-ink">批改中...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import { supabase } from "@/lib/supabase";
import { getRandomQuestion, getQuestionAudioUrl } from "@/lib/questions";
import { usePracticeStore } from "@/stores/practice";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();

const question = ref(null);
const questionLoading = ref(true);
const phase = ref("active"); // active | processing
const userInput = ref("");
const replaysLeft = ref(2);
const isAudioPlaying = ref(false);
const showAnswer = ref(false);
const audioError = ref("");

let audioElement = null;
let playTimer = null;
let isUnmounted = false;

const hasPlayableAudio = computed(() => Boolean(question.value) && Boolean(getAudioUrl(question.value)) && !audioError.value);
const canSubmit = computed(() => hasPlayableAudio.value && userInput.value.trim().length >= 2);
const wordCount = computed(() => userInput.value.trim().split(/\s+/).filter(Boolean).length);

function syncQuestionToStore() {
  if (!question.value) return;
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || "unknown",
    taskType: "WFD",
    content: question.value?.content || ""
  });
}

function getAudioUrl(item) {
  if (!item) return "";
  return String(getQuestionAudioUrl(item, "WFD") || "").trim();
}

function clearPlayTimer() {
  clearTimeout(playTimer);
  playTimer = null;
}

function stopAudio() {
  if (!audioElement) {
    isAudioPlaying.value = false;
    return;
  }
  audioElement.onended = null;
  audioElement.onerror = null;
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement = null;
  isAudioPlaying.value = false;
}

function schedulePlay(delay = 600) {
  clearPlayTimer();
  playTimer = setTimeout(() => {
    if (!isUnmounted) {
      playAudio();
    }
  }, delay);
}

function playAudio() {
  if (!question.value || phase.value === "processing") return;

  audioError.value = "";
  const audioUrl = getAudioUrl(question.value);
  if (!audioUrl) {
    isAudioPlaying.value = false;
    audioError.value = "这道题暂时没有可播放音频，请换一题或稍后再试。";
    return;
  }

  stopAudio();
  isAudioPlaying.value = true;
  audioElement = new Audio(audioUrl);

  audioElement.onended = () => {
    isAudioPlaying.value = false;
  };

  audioElement.onerror = () => {
    isAudioPlaying.value = false;
    audioError.value = "音频加载失败，请检查网络后重试，或先换一题。";
  };

  audioElement.play().catch(() => {
    isAudioPlaying.value = false;
    audioError.value = "音频播放被浏览器拦截或暂不可用，请点击“再听一遍”重试。";
  });
}

function replayAudio() {
  if (replaysLeft.value <= 0 || isAudioPlaying.value || phase.value === "processing") return;
  replaysLeft.value -= 1;
  playAudio();
}

function normalizeWord(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:'"()\-]/g, "")
    .trim();
}

function calculateScore(correctText, userText) {
  const correctWords = String(correctText || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const userWords = String(userText || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const total = correctWords.length;
  if (!total) {
    return { score: 0, correct: 0, total: 0, wordResults: [] };
  }

  const userNorm = userWords.map((word) => normalizeWord(word));
  let correct = 0;
  const wordResults = [];

  correctWords.forEach((word) => {
    const clean = normalizeWord(word);
    const idx = userNorm.indexOf(clean);
    if (idx !== -1) {
      correct += 1;
      userNorm.splice(idx, 1);
      wordResults.push({ text: word, status: "correct" });
    } else {
      wordResults.push({ text: word, status: "missing" });
    }
  });

  return {
    score: Math.round((correct / total) * 100),
    correct,
    total,
    wordResults
  };
}

function getFeedback(score) {
  if (score >= 90) return "非常准确！拼写和用词都很到位，继续保持。";
  if (score >= 70) return "答得不错！注意冠词和介词这些小词，会更完整。";
  if (score >= 50) return "抓住了大部分内容，多练几遍熟悉常见句型会进步很快。";
  return "这道题有一定难度，多听几遍感受句子节奏，下次会更好。";
}

async function handleSubmit() {
  if (!canSubmit.value || !question.value || !hasPlayableAudio.value || phase.value === "processing") return;
  phase.value = "processing";

  stopAudio();
  clearPlayTimer();

  const answer = userInput.value.trim();
  const { score, correct, total, wordResults } = calculateScore(question.value.content, answer);
  const feedback = getFeedback(score);

  practiceStore.setTranscript(answer);
  practiceStore.setWFDResult({
    score,
    correct,
    total,
    wordResults,
    userInput: answer,
    correctAnswer: question.value.content || "",
    feedback
  });

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      const { error } = await supabase.from("practice_logs").insert({
        user_id: session.user.id,
        task_type: "WFD",
        question_id: question.value.id || "unknown",
        transcript: answer,
        score_json: {
          score,
          correct,
          total,
          wordResults,
          userInput: answer,
          correctAnswer: question.value.content || ""
        },
        feedback
      });

      if (!error) {
        authStore.decrementRemaining();
      } else {
        console.warn("WFD practice_logs insert error:", error);
      }
    }
  } catch (error) {
    console.warn("WFD log error:", error);
  }

  router.push("/wfd/result");
}

async function loadQuestion({ fromSelected = false } = {}) {
  questionLoading.value = true;
  stopAudio();
  clearPlayTimer();

  try {
    if (fromSelected && practiceStore.selectedQuestion) {
      question.value = practiceStore.selectedQuestion;
      practiceStore.clearSelectedQuestion();
    } else {
      question.value = await getRandomQuestion("WFD");
    }

    userInput.value = "";
    showAnswer.value = false;
    audioError.value = "";
    replaysLeft.value = 2;
    phase.value = "active";

    syncQuestionToStore();
  } finally {
    questionLoading.value = false;
  }
}

async function skipQuestion() {
  if (phase.value === "processing") return;
  await loadQuestion({ fromSelected: false });
  schedulePlay(500);
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }

  await loadQuestion({ fromSelected: true });
  schedulePlay(600);
});

onUnmounted(() => {
  isUnmounted = true;
  stopAudio();
  clearPlayTimer();
});
</script>
