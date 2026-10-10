<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  RTS_TEMPLATE_CATEGORIES,
  RTS_TEMPLATE_COUNTS,
  RTS_TEMPLATE_LIBRARY,
  RTS_TEMPLATE_LIBRARY_BY_CATEGORY
} from "@/data/rtsTemplateLibrary";

const router = useRouter();
const activeCategory = ref(RTS_TEMPLATE_CATEGORIES[0]?.key || "academic");

const categoryTabs = computed(() =>
  RTS_TEMPLATE_CATEGORIES.map((item) => ({
    ...item,
    count: Number(RTS_TEMPLATE_COUNTS[item.key] || 0)
  }))
);

const activeCategoryMeta = computed(() =>
  categoryTabs.value.find((item) => item.key === activeCategory.value) || categoryTabs.value[0] || null
);

const activeTemplates = computed(() => RTS_TEMPLATE_LIBRARY_BY_CATEGORY[activeCategory.value] || []);
const totalTemplates = computed(() => RTS_TEMPLATE_LIBRARY.length);

function goBack() {
  router.push("/home");
}

function goRTSHome() {
  router.push("/rts");
}

function selectCategory(categoryKey) {
  if (!RTS_TEMPLATE_LIBRARY_BY_CATEGORY[categoryKey]) return;
  activeCategory.value = categoryKey;
}

function formatSerial(value) {
  const number = Number(value || 0);
  return String(number).padStart(2, "0");
}
</script>

<template>
  <div class="kk-page min-h-screen">
    <header class="border-b border-kk-line bg-kk-surface text-kk-ink">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10">
        <button type="button" class="-ml-2 inline-flex min-h-[44px] items-center px-2 text-[15px] font-medium text-kk-ink hover:text-kk-action-text" @click="goBack">← 返回首页</button>
        <p class="text-base font-semibold">RTS 模板库</p>
        <button type="button" class="inline-flex min-h-[44px] items-center px-1 text-sm font-semibold text-kk-action-text" @click="goRTSHome">RTS 首页</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <section class="rounded-[20px] border border-kk-line bg-kk-surface p-5 shadow-kk">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-[17px] font-semibold text-kk-ink">按场景分类模板</p>
            <p class="mt-1 text-sm text-kk-ink-3">共 {{ totalTemplates }} 条模板，全部来自 RTS 模板文档。</p>
          </div>
          <span class="rounded-full bg-kk-surface-2 px-3 py-1 text-xs font-semibold text-kk-ink-2">
            当前分类：{{ activeCategoryMeta?.label || "-" }}（{{ activeCategoryMeta?.count || 0 }}）
          </span>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="item in categoryTabs"
            :key="item.key"
            type="button"
            class="inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm font-medium transition-colors"
            :class="item.key === activeCategory
              ? 'border-kk-ink bg-kk-ink text-kk-ink-inverse'
              : 'border-kk-line bg-kk-surface text-kk-ink hover:bg-kk-surface-2'"
            @click="selectCategory(item.key)"
          >
            {{ item.label }} · {{ item.tag }} · {{ item.count }}
          </button>
        </div>
      </section>

      <section class="mt-4 space-y-3">
        <article
          v-for="item in activeTemplates"
          :key="item.id"
          class="rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk sm:p-5"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs font-semibold text-kk-ink kk-num">#{{ formatSerial(item.serial) }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-2">{{ item.categoryLabel }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-3">{{ item.id }}</span>
          </div>

          <p class="mt-3 text-[15px] font-semibold text-kk-ink">{{ item.title }}</p>
          <p class="mt-2 rounded-2xl border border-kk-line bg-kk-surface-2 p-3 text-[15px] leading-relaxed text-kk-ink kk-text">
            {{ item.content }}
          </p>
          <p class="mt-2 text-xs text-kk-ink-3">所属分类：{{ item.categoryLabel }}（{{ activeCategoryMeta?.tag || item.category }}）</p>
        </article>

        <div v-if="!activeTemplates.length" class="rounded-2xl border border-dashed border-kk-line p-4 text-sm text-kk-ink-3">
          当前分类暂无模板内容。
        </div>
      </section>
    </main>
  </div>
</template>
