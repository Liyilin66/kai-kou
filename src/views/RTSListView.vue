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
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 hover:opacity-90" @click="goBack">← 返回</button>
        <p class="text-base font-semibold">RTS 题库列表</p>
        <p class="text-xs text-white/75">共{{ filteredQuestions.length }}题</p>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <section class="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="item in filterOptions"
          :key="item.value"
          type="button"
          class="shrink-0 rounded-[20px] border px-3 py-1.5 text-xs font-medium transition-colors"
          :class="activeFilter === item.value
            ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white'
            : 'border-[#E8EDF5] bg-white text-[#1E293B] hover:bg-[#F8FAFD]'"
          @click="() => { activeFilter = item.value; syncRouteWithFilter(item.value); }"
        >
          {{ item.label }}
        </button>
      </section>

      <section v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
        题库加载中...
      </section>

      <section v-else-if="!filteredQuestions.length" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
        当前筛选条件下暂无题目。
      </section>

      <section v-else class="space-y-3">
        <article
          v-for="question in filteredQuestions"
          :key="question.id"
          class="cursor-pointer rounded-[14px] border border-[#E8EDF5] bg-white p-4 transition-colors hover:bg-[#F8FAFD]"
          @click="startPractice(question.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-[#EDF2FB] px-2.5 py-1 text-xs font-semibold text-[#1B3A6B]">题号 {{ questionNumber(question.id) }}</span>
            <span class="rounded-full bg-[#F5F7FB] px-2.5 py-1 text-xs text-[#48617F]">{{ question.id }}</span>
            <span class="rounded-full px-2.5 py-1 text-xs" :class="topicMeta(question.topic).badgeClass">{{ topicMeta(question.topic).label }}</span>
            <span class="rounded-full bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">{{ toneBadge(question) }}</span>
            <span class="rounded-full bg-[#F5F7FB] px-2.5 py-1 text-xs text-[#1E293B]">难度 {{ difficultyStars(question) }}</span>
          </div>

          <p
            class="mt-3 text-sm leading-relaxed text-[#1E293B] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
          >
            {{ question.content }}
          </p>

          <div class="mt-4 flex items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2 text-xs text-[#8CA0C0]">
              <span class="rounded-full bg-[#F8FAFD] px-2 py-1">难度点 {{ difficultyStars(question) }}</span>
              <span>已练 {{ practicedTimes(question.id) }} 次</span>
            </div>
            <button
              type="button"
              class="rounded-[11px] bg-[#E8845A] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
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
