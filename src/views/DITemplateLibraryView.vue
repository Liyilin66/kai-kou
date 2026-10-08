<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import DIHintPanel from "@/components/DIHintPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import {
  getDITaxonomy,
  getDITemplateById,
  getDITemplateCategories,
  getRandomDIQuestion,
  normalizeDIHintLevel
} from "@/lib/di-data";
import { isDIEnabled } from "@/lib/di-feature";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const uiStore = useUIStore();

const taxonomy = getDITaxonomy();

const selectedImageType = ref("");
const selectedCategoryKey = ref("");
const hintLevel = ref("strong");
const selectedBlockIds = ref([]);

const imageTypeOptions = computed(() => taxonomy.imageTypes || []);
const categoryOptions = computed(() => taxonomy.templateCategories || []);
const hintLevelOptions = computed(() => taxonomy.hintLevels || ["strong", "medium", "light"]);

const filteredCategories = computed(() => {
  const categories = getDITemplateCategories({
    imageType: selectedImageType.value,
    hintLevel: hintLevel.value
  });
  if (!selectedCategoryKey.value) return categories;
  return categories.filter((item) => item.categoryKey === selectedCategoryKey.value);
});

const flatFilteredBlocks = computed(() =>
  filteredCategories.value.flatMap((category) => category.templates || [])
);

const selectedBlocks = computed(() => selectedBlockIds.value.map((id) => getDITemplateById(id)).filter(Boolean));

function normalizeQueryArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => `${item || ""}`.trim()).filter(Boolean))];
  }
  const text = `${value || ""}`.trim();
  return text ? [text] : [];
}

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

function applyQueryDefaults() {
  selectedImageType.value = `${route.query?.imageType || ""}`.trim().toLowerCase();
  selectedCategoryKey.value = `${route.query?.category || ""}`.trim().toLowerCase();
  hintLevel.value = normalizeDIHintLevel(route.query?.hint, "strong");
  selectedBlockIds.value = normalizeQueryArray(route.query?.tb);
}

function toggleBlock(blockId) {
  const normalized = `${blockId || ""}`.trim();
  if (!normalized) return;
  if (selectedBlockIds.value.includes(normalized)) {
    selectedBlockIds.value = selectedBlockIds.value.filter((item) => item !== normalized);
    return;
  }
  selectedBlockIds.value = [...selectedBlockIds.value, normalized];
}

function clearSelectedBlocks() {
  selectedBlockIds.value = [];
}

function buildCarryQuery() {
  const query = {
    hint: hintLevel.value
  };
  if (selectedImageType.value) query.imageType = selectedImageType.value;
  if (selectedCategoryKey.value) query.category = selectedCategoryKey.value;
  if (selectedBlockIds.value.length) query.tb = selectedBlockIds.value;
  return query;
}

function goSelectWithTemplateContext() {
  router.push({
    path: "/di/select",
    query: buildCarryQuery()
  });
}

function startRandomWithTemplateContext() {
  const question = getRandomDIQuestion({
    filters: selectedImageType.value
      ? {
          imageType: selectedImageType.value
        }
      : {}
  });

  if (!question?.id) {
    uiStore.showToast("当前条件下暂无可用题目。", "warning");
    return;
  }

  router.push({
    path: "/di",
    query: {
      ...buildCarryQuery(),
      qid: question.id,
      type: `${question.imageType || selectedImageType.value || ""}`.trim().toLowerCase()
    }
  });
}

async function copyAssemblyToClipboard() {
  const text = selectedBlocks.value.map((item) => item?.sentence || "").filter(Boolean).join("\n");
  if (!text) {
    uiStore.showToast("请先选择至少一个模板。", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    uiStore.showToast("模板内容已复制。", "success");
  } catch {
    uiStore.showToast("复制失败，请手动复制。", "warning");
  }
}

onMounted(async () => {
  const allowed = await ensureAvailability();
  if (!allowed) return;
  applyQueryDefaults();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="DI 模板库" back-to="/home" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div class="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
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
            v-model="selectedCategoryKey"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange focus:outline-none"
          >
            <option value="">全部模板大类</option>
            <option v-for="item in categoryOptions" :key="item.categoryKey" :value="item.categoryKey">
              {{ item.categoryLabel }}
            </option>
          </select>

          <select
            v-model="hintLevel"
            class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange focus:outline-none"
          >
            <option v-for="item in hintLevelOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>

        <div class="flex flex-wrap gap-2">
          <OrangeButton tone="outline" @click="goSelectWithTemplateContext">带去选题练习</OrangeButton>
          <OrangeButton tone="outline" @click="startRandomWithTemplateContext">带去随机练习</OrangeButton>
          <OrangeButton tone="outline" @click="copyAssemblyToClipboard">复制已选模板</OrangeButton>
          <OrangeButton tone="outline" @click="clearSelectedBlocks">清空已选</OrangeButton>
        </div>
      </section>

      <section
        v-for="category in filteredCategories"
        :key="category.categoryKey"
        class="mb-4 rounded-xl border bg-white p-4 shadow-sm"
      >
        <div class="mb-2">
          <p class="text-sm font-semibold text-navy">{{ category.categoryLabel }}</p>
          <p class="mt-1 text-xs text-muted">
            适用图型：{{ (category.applicableImageTypes || []).join(" / ") }}
          </p>
          <p v-if="category.applicableNote" class="mt-1 text-xs text-muted">适用说明：{{ category.applicableNote }}</p>
          <p v-if="category.fillTips" class="mt-1 text-xs text-muted">万能填空建议：{{ category.fillTips }}</p>
        </div>

        <DIHintPanel
          :blocks="category.templates"
          :selected-block-ids="selectedBlockIds"
          :hint-level="hintLevel"
          @toggle-block="toggleBlock"
        />
      </section>

      <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-navy">当前拼装结果</p>
          <span class="text-xs text-muted">{{ selectedBlocks.length }} blocks</span>
        </div>

        <div v-if="selectedBlocks.length" class="space-y-2">
          <article
            v-for="item in selectedBlocks"
            :key="item.id"
            class="rounded-lg border border-gray-200 p-3"
          >
            <p class="mb-1 text-xs font-semibold text-navy">
              {{ item.shortLabel || item.title }}
              <span class="ml-1 text-muted">({{ item.categoryLabel }} · #{{ item.templateIndex }})</span>
            </p>
            <p class="text-xs leading-relaxed text-text">{{ item.sentence }}</p>
          </article>
        </div>
        <p v-else class="text-sm text-muted">还没有选择模板。先从上方三大类中点选需要的句型模板。</p>
      </section>

      <section class="mt-4 rounded-xl border bg-white p-4 shadow-sm">
        <p class="text-xs text-muted">当前筛选后模板总数：{{ flatFilteredBlocks.length }}</p>
      </section>
    </main>
  </div>
</template>
