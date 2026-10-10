<script setup>
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import {
  getWEQuestionCatalog,
  getWEQuestionsByPromptType,
  getWEQuestionsByTopic,
  getWETaxonomy
} from "@/lib/we-data";

const router = useRouter();
const route = useRoute();
const ACTIVE_TEMPLATE_STORAGE_KEY = "we.activeTemplateId";
const ACTIVE_OPINION_STORAGE_KEY = "we.activeOpinionId";

const allQuestions = ref(getWEQuestionCatalog());
const searchText = ref("");
const selectedTopic = ref("all");
const selectedPromptType = ref("all");

const taxonomy = getWETaxonomy();
const topicOptions = computed(() => [{ id: "all", label: "All Topics" }, ...taxonomy.primaryTopics]);
const promptTypeOptions = computed(() => [{ id: "all", label: "All Types" }, ...taxonomy.promptTypes]);

function buildBaseList() {
  if (selectedTopic.value !== "all") {
    return getWEQuestionsByTopic(selectedTopic.value);
  }
  if (selectedPromptType.value !== "all") {
    return getWEQuestionsByPromptType(selectedPromptType.value);
  }
  return [...allQuestions.value];
}

const filteredQuestions = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  const baseList = buildBaseList();

  if (!keyword) return baseList;

  return baseList.filter((item) => {
    const title = String(item.displayTitle || "").toLowerCase();
    const prompt = String(item.promptText || "").toLowerCase();
    const label = String(item.sourceNumberLabel || "").toLowerCase();
    return title.includes(keyword) || prompt.includes(keyword) || label.includes(keyword);
  });
});

function onTopicChange(value) {
  selectedTopic.value = value;
  if (value !== "all") {
    selectedPromptType.value = "all";
  }
}

function onPromptTypeChange(value) {
  selectedPromptType.value = value;
  if (value !== "all") {
    selectedTopic.value = "all";
  }
}

function previewPrompt(promptText) {
  const text = String(promptText || "").trim();
  if (text.length <= 140) return text;
  return `${text.slice(0, 140).trim()}...`;
}

function getPersistedTemplateId() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ACTIVE_TEMPLATE_STORAGE_KEY) || "").trim();
}

function persistTemplateId(templateId) {
  const key = String(templateId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TEMPLATE_STORAGE_KEY, key);
}

function getPersistedOpinionId() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ACTIVE_OPINION_STORAGE_KEY) || "").trim();
}

function persistOpinionId(opinionId) {
  const key = String(opinionId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_OPINION_STORAGE_KEY, key);
}

function startPractice(questionId) {
  const templateId = String(route.query?.template || "").trim() || getPersistedTemplateId();
  const opinionId = String(route.query?.opinion || "").trim() || getPersistedOpinionId();
  const query = {};

  if (templateId) {
    query.template = templateId;
    persistTemplateId(templateId);
  }
  if (opinionId) {
    query.opinion = opinionId;
    persistOpinionId(opinionId);
  }

  router.push({
    path: `/we/practice/${questionId}`,
    query
  });
}
</script>

<template>
  <div class="kk-page min-h-screen">
    <NavBar title="WE 选题练习" back-to="/we" variant="kk" />

    <main class="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <div class="relative mb-4">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索编号、标题或题干关键词..."
          class="w-full rounded-xl border border-kk-line bg-kk-surface py-3 pl-10 pr-4 text-sm focus:border-kk-ink focus:outline-none"
        />
        <span class="absolute left-3 top-3.5 text-sm text-kk-ink-3">Q</span>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        <select
          :value="selectedTopic"
          class="rounded-lg border border-kk-line bg-kk-surface px-3 py-2 text-sm text-kk-ink focus:border-kk-ink focus:outline-none"
          @change="onTopicChange($event.target.value)"
        >
          <option v-for="topic in topicOptions" :key="topic.id" :value="topic.id">
            {{ topic.label }}
          </option>
        </select>

        <select
          :value="selectedPromptType"
          class="rounded-lg border border-kk-line bg-kk-surface px-3 py-2 text-sm text-kk-ink focus:border-kk-ink focus:outline-none"
          @change="onPromptTypeChange($event.target.value)"
        >
          <option v-for="promptType in promptTypeOptions" :key="promptType.id" :value="promptType.id">
            {{ promptType.label }}
          </option>
        </select>
      </div>

      <p class="mb-4 text-sm text-kk-ink-3">共 {{ filteredQuestions.length }} 道题</p>

      <div v-if="filteredQuestions.length" class="space-y-3">
        <article
          v-for="question in filteredQuestions"
          :key="question.id"
          class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk transition-colors hover:bg-kk-surface-2 sm:p-5"
        >
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-kk-surface-2 px-2 py-0.5 text-xs font-semibold text-kk-ink-2">
              {{ question.sourceNumberLabel }}
            </span>
            <span class="text-xs font-semibold text-kk-ink">{{ question.displayTitle }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2 py-0.5 text-xs text-kk-ink-2">
              {{ question.promptType }}
            </span>
            <span class="rounded-full bg-kk-surface-2 px-2 py-0.5 text-xs text-kk-ink-2">
              {{ question.primaryTopic }}
            </span>
          </div>

          <p class="mb-3 text-sm leading-relaxed text-kk-ink">{{ previewPrompt(question.promptText) }}</p>

          <div class="flex justify-end">
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center rounded-full bg-kk-action px-5 text-sm font-bold text-kk-on-action transition-colors hover:bg-kk-action-hover"
              @click="startPractice(question.id)"
            >
              开始练习
            </button>
          </div>
        </article>
      </div>

      <div v-else class="py-16 text-center">
        <p class="text-lg font-bold text-kk-ink">没有找到匹配的题目</p>
        <p class="mt-1 text-sm text-kk-ink-3">试试其他关键词或筛选条件</p>
      </div>
    </main>
  </div>
</template>
