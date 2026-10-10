<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore } from "@/stores/practice";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import RADiagnosisResult from "@/components/ra/RADiagnosisResult.vue";

const router = useRouter();
const store = usePracticeStore();

const result = computed(() =>
  store.result || {
    overall: 0,
    feedback: "No feedback yet.",
    scores: { pronunciation: 0, fluency: 0, content: 0 },
    keywords: []
  }
);
const diagnosisResult = computed(() => store.result?.kind === "ra_diagnosis" ? store.result : null);

const keywords = computed(() => {
  if (store.result?.keywords?.length > 0) {
    return store.result.keywords;
  }

  return [
    { word: "quick", hit: true },
    { word: "brown", hit: true },
    { word: "fox", hit: false },
    { word: "jumps", hit: true },
    { word: "lazy", hit: false },
    { word: "dog", hit: true },
    { word: "river", hit: false },
    { word: "bank", hit: true }
  ];
});

const originalSentence = computed(
  () => store.currentQuestion?.content || "The quick brown fox jumps over the lazy dog near the river bank."
);

const resultBadge = computed(() => {
  const s = result.value.overall;
  if (s >= 70) return "Excellent";
  if (s >= 50) return "Good";
  return "Keep Going";
});

const resultTitle = computed(() => {
  const s = result.value.overall;
  if (s >= 70) return "Strong listening and repetition";
  if (s >= 50) return "You captured most key words";
  return "Good effort. Practice builds memory speed";
});

onMounted(() => {
  if (!store.result) {
    router.replace("/rs");
  }
});
</script>

<template>
  <RADiagnosisResult v-if="diagnosisResult" :result="diagnosisResult" />
  <div v-else class="kk-page min-h-screen">
    <NavBar title="Repeat Sentence Result" back-to="/rs" variant="kk" />

    <main class="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <section class="mb-6 text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-kk-ink-3">{{ resultBadge }}</p>
        <h1 class="mt-1 text-[24px] font-bold leading-snug text-kk-ink sm:text-[28px]">{{ resultTitle }}</h1>
        <p class="mt-1 text-kk-ink-3">
          Keyword Coverage <span class="kk-num ml-1 text-[32px] font-extrabold text-kk-ink">{{ result.overall }}%</span>
        </p>
      </section>

      <section class="mb-4 rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
        <p class="mb-3 text-[17px] font-semibold text-kk-ink">Keyword Coverage Details</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="kw in keywords"
            :key="kw.word"
            class="rounded-full border px-3 py-1 text-sm font-medium"
            :class="kw.hit ? 'border-kk-success-line bg-kk-success-bg text-kk-success' : 'border-kk-line bg-kk-surface-2 text-kk-ink-3'"
          >
            {{ kw.hit ? 'hit' : 'miss' }} {{ kw.word }}
          </span>
        </div>
        <p class="mt-3 text-xs text-kk-ink-3">Green tags were covered. Gray tags were missed this round.</p>
      </section>

      <section class="mb-4 rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
        <p class="mb-2 text-[17px] font-semibold text-kk-ink">Original Sentence</p>
        <p class="kk-text text-[17px] leading-relaxed text-kk-ink">{{ originalSentence }}</p>
      </section>

      <section class="mb-6 rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kk-ink text-sm font-bold text-kk-ink-inverse">AI</div>
          <div>
            <p class="mb-1 text-xs text-kk-ink-3">Coach Feedback</p>
            <p class="leading-relaxed text-kk-ink">{{ result.feedback }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <OrangeButton full tone="action" @click="router.push('/rs')">Practice Another RS</OrangeButton>
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
