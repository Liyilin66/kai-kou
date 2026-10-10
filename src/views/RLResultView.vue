<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore } from "@/stores/practice";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { PRONUNCIATION_NOT_ASSESSED_LABEL, PRONUNCIATION_NOT_ASSESSED_REASON } from "@/lib/ra-diagnosis-score";

const router = useRouter();
const store = usePracticeStore();

const result = computed(() =>
  store.result || {
    overall: 0,
    scores: { pronunciation: null, fluency: 0, content: 0 },
    feedback: "No feedback yet."
  }
);

const transcript = computed(() => store.transcript || "");

const scoreItems = [
  { key: "content", label: "Content", tip: "Key point coverage and summary structure." },
  { key: "pronunciation", label: "Pronunciation", tip: "Clarity of words and sounds." },
  { key: "fluency", label: "Fluency", tip: "Rhythm and smooth sentence connection." }
];

const resultBadge = computed(() => {
  const s = result.value.overall;
  if (s >= 75) return "Excellent";
  if (s >= 60) return "Good";
  return "Keep Going";
});

const resultTitle = computed(() => {
  const s = result.value.overall;
  if (s >= 75) return "Retell completed with strong structure";
  if (s >= 60) return "Good retell. Keep expanding key-point coverage";
  return "Great practice. Next attempt will be more complete";
});

function scoreColor(score) {
  if (score >= 75) return "text-kk-success";
  if (score >= 60) return "text-kk-ink";
  return "text-kk-notice";
}

function scoreBarColor(score) {
  if (score >= 75) return "bg-kk-success";
  if (score >= 60) return "bg-kk-ink-2";
  return "bg-kk-notice-line";
}

onMounted(() => {
  if (!store.result) {
    router.replace("/rl");
  }
});
</script>

<template>
  <div class="kk-page min-h-screen">
    <NavBar title="Re-tell Lecture Result" back-to="/rl" variant="kk" />

    <main class="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <section class="mb-6 text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-kk-ink-3">{{ resultBadge }}</p>
        <h1 class="mt-1 text-[24px] font-bold leading-snug text-kk-ink sm:text-[28px]">{{ resultTitle }}</h1>
        <p class="mt-1 text-kk-ink-3">
          Overall Score <span class="kk-num ml-1 text-[32px] font-extrabold text-kk-ink">{{ result.overall }}</span>
        </p>
      </section>

      <section class="mb-6 space-y-3">
        <article v-for="item in scoreItems" :key="item.key" class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
          <template v-if="item.key === 'pronunciation' && result.scores.pronunciation == null">
            <div class="flex items-center justify-between" data-testid="rl-pronunciation-not-assessed">
              <span class="text-sm font-semibold text-kk-ink">{{ item.label }}</span>
              <span class="text-sm font-semibold text-kk-ink-3">{{ PRONUNCIATION_NOT_ASSESSED_LABEL }}</span>
            </div>
            <p class="mt-1 text-xs text-kk-ink-3">{{ PRONUNCIATION_NOT_ASSESSED_REASON }}</p>
          </template>
          <template v-else>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-semibold text-kk-ink">{{ item.label }}</span>
            <span class="kk-num text-xl font-extrabold" :class="scoreColor(result.scores[item.key])">
              {{ result.scores[item.key] }}
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-kk-surface-2">
            <div
              class="h-2 rounded-full transition-all duration-700"
              :class="scoreBarColor(result.scores[item.key])"
              :style="{ width: `${result.scores[item.key]}%` }"
            />
          </div>
          <p class="mt-1 text-xs text-kk-ink-3">{{ item.tip }}</p>
          </template>
        </article>
      </section>

      <section class="mb-6 rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kk-ink text-sm font-bold text-kk-ink-inverse">AI</div>
          <div>
            <p class="mb-1 text-xs text-kk-ink-3">Coach Feedback</p>
            <p class="leading-relaxed text-kk-ink">{{ result.feedback }}</p>
          </div>
        </div>
      </section>

      <section class="mb-6 rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk">
        <p class="mb-2 text-sm font-semibold text-kk-ink">Recognized Summary</p>
        <p class="kk-text text-[17px] italic leading-relaxed text-kk-ink">
          "{{ transcript || '(No speech recognized. Please check microphone permissions.)' }}"
        </p>
      </section>

      <section class="space-y-3">
        <OrangeButton full tone="action" @click="router.push('/rl')">Practice Another RL</OrangeButton>
        <button
          type="button"
          class="min-h-[48px] w-full rounded-full border border-kk-line bg-kk-surface py-3 font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
          @click="router.push('/home')"
        >
          Back Home
        </button>
      </section>
    </main>
  </div>
</template>
