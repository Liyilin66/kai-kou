<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { getDIQuestionsByFilters, getDITaxonomy, normalizeDIHintLevel } from "@/lib/di-data";
import { getDIHistorySummary, getDIWeaknessBoard } from "@/lib/di-history";
import { isDIEnabled } from "@/lib/di-feature";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const uiStore = useUIStore();

const loading = ref(true);
const searchText = ref("");
const selectedImageType = ref("");
const selectedDifficulty = ref("");
const selectedTags = ref([]);
const highFreqOnly = ref(false);
const practicedOnly = ref(false);
const weakOnly = ref(false);

const practicedQuestionIds = ref([]);
const weakBoard = ref([]);

const taxonomy = getDITaxonomy();
const imageTypeOptions = computed(() => taxonomy.imageTypes || []);
const difficultyOptions = computed(() => taxonomy.difficultyScale || []);

const hintFromQuery = computed(() => normalizeDIHintLevel(route.query?.hint, "strong"));
const templateBlocksFromQuery = computed(() => normalizeQueryArray(route.query?.tb));
const categoryFromQuery = computed(() => `${route.query?.category || ""}`.trim().toLowerCase());

const weakImageTypes = computed(() => weakBoard.value.map((item) => item.imageType).filter(Boolean));
const weakImageSet = computed(() => new Set(weakImageTypes.value));

const allQuestions = computed(() =>
  getDIQuestionsByFilters({
    imageType: selectedImageType.value || "",
    difficulty: selectedDifficulty.value || "",
    tags: selectedTags.value,
    highFreq: highFreqOnly.value ? "1" : null,
    practiced: practicedOnly.value ? "1" : null,
    weakOnly: weakOnly.value ? "1" : null,
    practicedQuestionIds: practicedQuestionIds.value,
    weakImageTypes: weakImageTypes.value
  })
);

const availableTagOptions = computed(() => {
  const set = new Set();
  getDIQuestionsByFilters().forEach((item) => {
    (item.tags || []).forEach((tag) => set.add(tag));
  });
  return [...set].sort();
});

const filteredQuestions = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  if (!keyword) return allQuestions.value;
  return allQuestions.value.filter((item) => {
    const inTitle = String(item.displayTitle || "").toLowerCase().includes(keyword);
    const inLabel = String(item.sourceNumberLabel || "").toLowerCase().includes(keyword);
    const inTags = (item.tags || []).some((tag) => tag.includes(keyword));
    return inTitle || inLabel || inTags;
  });
});

async function ensureAvailability() {
  if (!isDIEnabled()) {
    router.replace("/home");
    return false;
  }

  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  if (!authStore.canPractice) {
    router.replace("/limit");
    return false;
  }

  return true;
}

function normalizeQueryArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => `${item || ""}`.trim()).filter(Boolean))];
  }
  const text = `${value || ""}`.trim();
  return text ? [text] : [];
}

function normalizeBooleanQuery(value) {
  const normalized = `${value || ""}`.trim();
  return normalized === "1";
}

function applyQueryDefaults() {
  selectedImageType.value = `${route.query?.imageType || ""}`.trim().toLowerCase();
  selectedDifficulty.value = `${route.query?.difficulty || ""}`.trim();
  selectedTags.value = normalizeQueryArray(route.query?.tag).map((item) => item.toLowerCase());
  highFreqOnly.value = normalizeBooleanQuery(route.query?.highFreq);
  practicedOnly.value = normalizeBooleanQuery(route.query?.practiced);
  weakOnly.value = normalizeBooleanQuery(route.query?.weakOnly);
}

async function loadHistory() {
  loading.value = true;
  try {
    const [historySummary, weakness] = await Promise.all([
      getDIHistorySummary({ limit: 20 }),
      getDIWeaknessBoard({ limit: 20 })
    ]);
    practicedQuestionIds.value = historySummary.practicedQuestionIds || [];
    weakBoard.value = weakness || [];
  } finally {
    loading.value = false;
  }
}

function toggleTag(tag) {
  const normalized = `${tag || ""}`.trim().toLowerCase();
  if (!normalized) return;
  if (selectedTags.value.includes(normalized)) {
    selectedTags.value = selectedTags.value.filter((item) => item !== normalized);
    return;
  }
  selectedTags.value = [...selectedTags.value, normalized];
}

function buildCarryQuery() {
  const query = {
    hint: hintFromQuery.value
  };

  if (selectedImageType.value) query.imageType = selectedImageType.value;
  if (categoryFromQuery.value) query.category = categoryFromQuery.value;
  if (templateBlocksFromQuery.value.length) {
    query.tb = templateBlocksFromQuery.value;
  }
  return query;
}

function startPractice(questionId) {
  const normalizedId = `${questionId || ""}`.trim();
  if (!normalizedId) return;
  const matchedQuestion = filteredQuestions.value.find((item) => `${item?.id || ""}`.trim() === normalizedId);
  const resolvedType = `${matchedQuestion?.imageType || selectedImageType.value || ""}`.trim().toLowerCase();
  router.push({
    path: "/di",
    query: {
      ...buildCarryQuery(),
      qid: normalizedId,
      type: resolvedType
    }
  });
}

function resetFilters() {
  selectedImageType.value = "";
  selectedDifficulty.value = "";
  selectedTags.value = [];
  highFreqOnly.value = false;
  practicedOnly.value = false;
  weakOnly.value = false;
  searchText.value = "";
}

onMounted(async () => {
  const allowed = await ensureAvailability();
  if (!allowed) return;
  applyQueryDefaults();
  await loadHistory();
  if (weakOnly.value && !weakImageTypes.value.length) {
    uiStore.showToast("暂无弱项图型记录，已显示全部题目。", "warning");
    weakOnly.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="DI 选题练习" back-to="/home" />

    <main class="mx-auto max-w-3xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div class="mb-3">
          <input
            v-model="searchText"
            type="text"
            placeholder="搜索题号、标题或标签"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange focus:outline-none"
          />
        </div>

        <div class="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <select
            v-model="selectedImageType"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange focus:outline-none"
          >
            <option value="">全部图型</option>
            <option v-for="item in imageTypeOptions" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>

          <select
            v-model="selectedDifficulty"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange focus:outline-none"
          >
            <option value="">全部难度</option>
            <option v-for="item in difficultyOptions" :key="item.value" :value="String(item.value)">
              {{ item.label }}
            </option>
          </select>
        </div>

        <div class="mb-3 flex flex-wrap gap-2">
          <button
            v-for="tag in availableTagOptions"
            :key="tag"
            type="button"
            class="rounded-full border px-3 py-1 text-xs transition-colors"
            :class="selectedTags.includes(tag) ? 'border-orange bg-orange/10 text-orange' : 'border-gray-200 text-muted hover:border-orange'"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>

        <div class="mb-3 flex flex-wrap gap-2 text-xs">
          <label class="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1">
            <input v-model="highFreqOnly" type="checkbox" />
            高频题
          </label>
          <label class="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1">
            <input v-model="practicedOnly" type="checkbox" />
            已练过
          </label>
          <label class="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1">
            <input v-model="weakOnly" type="checkbox" />
            弱项图型
          </label>
          <button
            type="button"
            class="rounded border border-gray-300 px-2 py-1 text-muted transition-colors hover:border-orange hover:text-orange"
            @click="resetFilters"
          >
            重置筛选
          </button>
        </div>

        <p class="text-xs text-muted">当前提示档位：{{ hintFromQuery }}</p>
      </section>

      <section class="rounded-xl border bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-semibold text-navy">题目列表</p>
          <span class="text-xs text-muted">共 {{ filteredQuestions.length }} 题</span>
        </div>

        <div v-if="loading" class="py-10 text-center">
          <div class="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-orange border-t-transparent" />
          <p class="mt-2 text-xs text-muted">加载中...</p>
        </div>

        <div v-else-if="filteredQuestions.length" class="space-y-3">
          <article
            v-for="question in filteredQuestions"
            :key="question.id"
            class="rounded-lg border border-gray-200 p-3"
          >
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-orange">{{ question.sourceNumberLabel }}</span>
              <span class="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{{ question.imageType }}</span>
              <span class="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-muted">difficulty {{ question.difficulty }}</span>
              <span v-if="question.isHighFrequency" class="rounded bg-green-50 px-2 py-0.5 text-[11px] text-green-700">high freq</span>
              <span v-if="practicedQuestionIds.includes(question.id)" class="rounded bg-orange/10 px-2 py-0.5 text-[11px] text-orange">practiced</span>
              <span v-if="weakImageSet.has(question.imageType)" class="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-600">weak</span>
            </div>

            <p class="text-sm font-semibold text-navy">{{ question.displayTitle }}</p>
            <p class="mt-1 text-xs text-muted">{{ (question.tags || []).join(" · ") }}</p>

            <div class="mt-3 flex justify-end">
              <button
                type="button"
                class="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                @click="startPractice(question.id)"
              >
                开始练习
              </button>
            </div>
          </article>
        </div>

        <p v-else class="text-sm text-muted">当前筛选条件下没有匹配题目。</p>
      </section>
    </main>
  </div>
</template>
