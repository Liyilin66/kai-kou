<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore } from "@/stores/practice";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";

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
  <div class="min-h-screen bg-bg">
    <NavBar title="Repeat Sentence Result" back-to="/rs" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <section class="mb-6 text-center">
        <p class="text-sm font-semibold uppercase tracking-wide text-orange">{{ resultBadge }}</p>
        <h1 class="mt-1 text-2xl font-bold text-navy">{{ resultTitle }}</h1>
        <p class="mt-1 text-muted">
          Keyword Coverage <span class="text-xl font-bold text-orange">{{ result.overall }}%</span>
        </p>
      </section>

      <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-3 text-sm font-semibold text-navy">Keyword Coverage Details</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="kw in keywords"
            :key="kw.word"
            class="rounded-full border px-3 py-1 text-sm font-medium"
            :class="kw.hit ? 'border-green-200 bg-green-100 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-400'"
          >
            {{ kw.hit ? 'hit' : 'miss' }} {{ kw.word }}
          </span>
        </div>
        <p class="mt-3 text-xs text-muted">Green tags were covered. Gray tags were missed this round.</p>
      </section>

      <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Original Sentence</p>
        <p class="leading-relaxed text-text">{{ originalSentence }}</p>
      </section>

      <section class="mb-6 rounded-xl bg-white p-4 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">AI</div>
          <div>
            <p class="mb-1 text-xs text-muted">Coach Feedback</p>
            <p class="leading-relaxed text-text">{{ result.feedback }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <OrangeButton full @click="router.push('/rs')">Practice Another RS</OrangeButton>
        <button
          type="button"
          class="w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
          @click="router.push('/home')"
        >
          Back Home
        </button>
      </section>
    </main>
  </div>
</template>
