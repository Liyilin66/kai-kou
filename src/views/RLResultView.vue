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
    scores: { pronunciation: 0, fluency: 0, content: 0 },
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
  if (score >= 75) return "text-green-500";
  if (score >= 60) return "text-orange";
  return "text-gray-400";
}

function scoreBarColor(score) {
  if (score >= 75) return "bg-green-400";
  if (score >= 60) return "bg-orange";
  return "bg-gray-300";
}

onMounted(() => {
  if (!store.result) {
    router.replace("/rl");
  }
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Re-tell Lecture Result" back-to="/rl" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <section class="mb-6 text-center">
        <p class="text-sm font-semibold uppercase tracking-wide text-orange">{{ resultBadge }}</p>
        <h1 class="mt-1 text-2xl font-bold text-navy">{{ resultTitle }}</h1>
        <p class="mt-1 text-muted">
          Overall Score <span class="text-xl font-bold text-orange">{{ result.overall }}</span>
        </p>
      </section>

      <section class="mb-6 space-y-3">
        <article v-for="item in scoreItems" :key="item.key" class="rounded-xl bg-white p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-semibold text-navy">{{ item.label }}</span>
            <span class="text-lg font-bold" :class="scoreColor(result.scores[item.key])">
              {{ result.scores[item.key] }}
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-gray-100">
            <div
              class="h-2 rounded-full transition-all duration-700"
              :class="scoreBarColor(result.scores[item.key])"
              :style="{ width: `${result.scores[item.key]}%` }"
            />
          </div>
          <p class="mt-1 text-xs text-muted">{{ item.tip }}</p>
        </article>
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

      <section class="mb-6 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Recognized Summary</p>
        <p class="text-sm italic leading-relaxed text-muted">
          "{{ transcript || '(No speech recognized. Please check microphone permissions.)' }}"
        </p>
      </section>

      <section class="space-y-3">
        <OrangeButton full @click="router.push('/rl')">Practice Another RL</OrangeButton>
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
