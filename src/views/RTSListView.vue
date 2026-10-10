<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { RTS_TOPIC_META, useRTSData } from "@/composables/useRTSData";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { loadQuestions, getUserRTSStats } = useRTSData();

const loading = ref(true);
const questions = ref([]);
const activeFilter = ref("all");
const practiceCountMap = ref({});
const topicOrder = ["work", "daily", "service", "social"];

const filteredQuestions = computed(() => {
  const source = Array.isArray(questions.value) ? questions.value : [];
  const filterValue = `${activeFilter.value || "all"}`.trim();

  if (filterValue === "all") return source;
  if (filterValue.startsWith("topic:")) {
    const topic = filterValue.replace("topic:", "");
    return source.filter((item) => item.topic === topic);
  }
  if (filterValue.startsWith("difficulty:")) {
    const difficulty = Number(filterValue.replace("difficulty:", ""));
    return source.filter((item) => Number(item.difficulty) === difficulty);
  }
  return source;
});

const filterOptions = computed(() => {
  const source = Array.isArray(questions.value) ? questions.value : [];
  const topicOptions = topicOrder.map((topicKey) => {
    const meta = RTS_TOPIC_META[topicKey] || RTS_TOPIC_META.daily;
    const count = source.filter((item) => item.topic === topicKey).length;
    return {
      value: `topic:${topicKey}`,
      label: `${meta.shortLabel || meta.label} ${count}`
    };
  });

  const difficultyOptions = [1, 2, 3].map((difficulty) => {
    const count = source.filter((item) => Number(item.difficulty) === difficulty).length;
    return {
      value: `difficulty:${difficulty}`,
      label: `难度${"★".repeat(difficulty)} ${count}`
    };
  });

  return [{ value: "all", label: `全部 ${source.length}` }, ...topicOptions, ...difficultyOptions];
});

function goBack() {
  router.push("/rts");
}

function topicMeta(topic) {
  return RTS_TOPIC_META[topic] || RTS_TOPIC_META.daily;
}

function toneBadge(question) {
  const tone = `${question?.key_points?.tone || ""}`.trim();
  if (tone === "formal") return "正式";
  if (tone === "informal") return "非正式";
  return "半正式";
}

function difficultyStars(question) {
  const difficulty = Math.max(1, Math.min(3, Math.round(Number(question?.difficulty || 1))));
  return "★".repeat(difficulty);
}

function questionNumber(questionId) {
  const normalized = `${questionId || ""}`.trim();
  const match = normalized.match(/(\d{1,3})$/);
  if (!match) return normalized || "--";
  return match[1].padStart(3, "0");
}

function practicedTimes(questionId) {
  return Number(practiceCountMap.value?.[questionId] || 0);
}

function startPractice(questionId) {
  const normalized = `${questionId || ""}`.trim();
  if (!normalized) return;
  router.push({
    path: "/rts/practice",
    query: { id: normalized }
  });
}

function resolveFilterFromRoute() {
  const category = `${route.query?.category || ""}`.trim().toLowerCase();
  const difficulty = Number(route.query?.difficulty);
  if (RTS_TOPIC_META[category]) {
    activeFilter.value = `topic:${category}`;
    return;
  }
  if (Number.isFinite(difficulty) && difficulty >= 1 && difficulty <= 3) {
    activeFilter.value = `difficulty:${difficulty}`;
    return;
  }
  activeFilter.value = "all";
}

function syncRouteWithFilter(value) {
  const normalized = `${value || "all"}`.trim() || "all";
  if (normalized === "all") {
    router.replace({ path: "/rts/list" });
    return;
  }
  if (normalized.startsWith("topic:")) {
    router.replace({
      path: "/rts/list",
      query: { category: normalized.replace("topic:", "") }
    });
    return;
  }
  if (normalized.startsWith("difficulty:")) {
    router.replace({
      path: "/rts/list",
      query: { difficulty: normalized.replace("difficulty:", "") }
    });
  }
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadListData() {
  loading.value = true;
  try {
    questions.value = await loadQuestions();
    const userId = await resolveCurrentUserId();
    if (!userId) {
      practiceCountMap.value = {};
      return;
    }
    const stats = await getUserRTSStats(userId, {
      recentLimit: 1,
      logsLimit: 600
    });
    practiceCountMap.value = stats.questionPracticeCountMap || {};
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.query,
  () => {
    resolveFilterFromRoute();
  },
  { deep: true }
);

onMounted(async () => {
  resolveFilterFromRoute();
  await loadListData();
});
</script>

<template>
  <div class="kk-page min-h-screen">
    <header class="border-b border-kk-line bg-kk-surface text-kk-ink">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10">
        <button type="button" class="-ml-2 inline-flex min-h-[44px] items-center px-2 text-[15px] font-medium text-kk-ink hover:text-kk-action-text" @click="goBack">← 返回</button>
        <p class="text-base font-semibold">RTS 题库列表</p>
        <p class="kk-num text-sm text-kk-ink-3">共{{ filteredQuestions.length }}题</p>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <section class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button
          v-for="item in filterOptions"
          :key="item.value"
          type="button"
          class="inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors"
          :class="activeFilter === item.value
            ? 'border-kk-ink bg-kk-ink text-kk-ink-inverse'
            : 'border-kk-line bg-kk-surface text-kk-ink hover:bg-kk-surface-2'"
          @click="() => { activeFilter = item.value; syncRouteWithFilter(item.value); }"
        >
          {{ item.label }}
        </button>
      </section>

      <section v-if="loading" class="rounded-2xl border border-dashed border-kk-line p-4 text-sm text-kk-ink-3">
        题库加载中...
      </section>

      <section v-else-if="!filteredQuestions.length" class="rounded-2xl border border-dashed border-kk-line p-4 text-sm text-kk-ink-3">
        当前筛选条件下暂无题目。
      </section>

      <section v-else class="space-y-3">
        <article
          v-for="question in filteredQuestions"
          :key="question.id"
          class="cursor-pointer rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk transition-colors hover:bg-kk-surface-2 sm:p-5"
          @click="startPractice(question.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs font-semibold text-kk-ink">题号 {{ questionNumber(question.id) }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-2">{{ question.id }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-2">{{ topicMeta(question.topic).label }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-2">{{ toneBadge(question) }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink">难度 {{ difficultyStars(question) }}</span>
          </div>

          <p
            class="kk-text mt-3 text-[15px] leading-relaxed text-kk-ink [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
          >
            {{ question.content }}
          </p>

          <div class="mt-4 flex items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2 text-xs text-kk-ink-3">
              <span class="rounded-full bg-kk-surface-2 px-2 py-1">难度点 {{ difficultyStars(question) }}</span>
              <span>已练 {{ practicedTimes(question.id) }} 次</span>
            </div>
            <button
              type="button"
              class="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-kk-action px-5 text-sm font-bold text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press"
              @click.stop="startPractice(question.id)"
            >
              开始练习
            </button>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>
