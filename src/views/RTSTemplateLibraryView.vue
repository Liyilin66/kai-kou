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
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goBack">← 返回首页</button>
        <p class="text-base font-semibold">RTS 模板库</p>
        <button type="button" class="text-xs text-white/80 transition-opacity hover:opacity-90" @click="goRTSHome">RTS 首页</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <section class="rounded-[14px] border border-[#E8EDF5] bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-base font-semibold text-[#1E293B]">按场景分类模板</p>
            <p class="mt-1 text-sm text-[#8CA0C0]">共 {{ totalTemplates }} 条模板，全部来自 RTS 模板文档。</p>
          </div>
          <span class="rounded-full bg-[#EDF2FB] px-3 py-1 text-xs font-semibold text-[#1B3A6B]">
            当前分类：{{ activeCategoryMeta?.label || "-" }}（{{ activeCategoryMeta?.count || 0 }}）
          </span>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="item in categoryTabs"
            :key="item.key"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="item.key === activeCategory
              ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white'
              : 'border-[#E8EDF5] bg-white text-[#1E293B] hover:bg-[#F8FAFD]'"
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
          class="rounded-[14px] border border-[#E8EDF5] bg-white p-4"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-[#FFF3EC] px-2.5 py-1 text-xs font-semibold text-[#E8845A]">#{{ formatSerial(item.serial) }}</span>
            <span class="rounded-full bg-[#EDF2FB] px-2.5 py-1 text-xs text-[#1B3A6B]">{{ item.categoryLabel }}</span>
            <span class="rounded-full bg-[#F8FAFD] px-2.5 py-1 text-xs text-[#8CA0C0]">{{ item.id }}</span>
          </div>

          <p class="mt-3 text-sm font-semibold text-[#1E293B]">{{ item.title }}</p>
          <p class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-sm leading-relaxed text-[#1E293B]">
            {{ item.content }}
          </p>
          <p class="mt-2 text-xs text-[#8CA0C0]">所属分类：{{ item.categoryLabel }}（{{ activeCategoryMeta?.tag || item.category }}）</p>
        </article>

        <div v-if="!activeTemplates.length" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          当前分类暂无模板内容。
        </div>
      </section>
    </main>
  </div>
</template>
