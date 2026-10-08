<script setup>
import { computed } from "vue";

const props = defineProps({
  blocks: {
    type: Array,
    default: () => []
  },
  selectedBlockIds: {
    type: Array,
    default: () => []
  },
  hintLevel: {
    type: String,
    default: "strong"
  }
});

const emit = defineEmits(["toggle-block"]);

const selectedSet = computed(() => new Set((props.selectedBlockIds || []).map((item) => `${item || ""}`.trim())));

function handleToggle(blockId) {
  const normalized = `${blockId || ""}`.trim();
  if (!normalized) return;
  emit("toggle-block", normalized);
}

function previewText(item) {
  const level = `${props.hintLevel || "strong"}`.trim().toLowerCase();
  if (level === "light") return `${item?.sentence || ""}`.trim();
  if (level === "medium") return `${item?.skeleton || item?.sentence || ""}`.trim();
  return `${item?.sentence || ""}`.trim();
}
</script>

<template>
  <section class="rounded-xl border bg-white p-4 shadow-sm">
    <div class="mb-3 flex items-center justify-between">
      <p class="text-sm font-semibold text-navy">模板提示</p>
      <span class="text-xs text-muted">{{ blocks.length }} blocks</span>
    </div>

    <div v-if="blocks.length" class="grid grid-cols-1 gap-2 md:grid-cols-2">
      <button
        v-for="block in blocks"
        :key="block.id"
        type="button"
        class="rounded-lg border p-3 text-left transition-colors"
        :class="selectedSet.has(block.id) ? 'border-orange bg-orange/5' : 'border-gray-200 hover:border-orange/50'"
        @click="handleToggle(block.id)"
      >
        <div class="mb-1 flex items-center justify-between gap-2">
          <p class="text-xs font-semibold text-navy">{{ block.shortLabel || block.title }}</p>
          <span class="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-muted">
            {{ block.categoryLabel || block.categoryKey || "template" }}
          </span>
        </div>
        <p class="text-xs leading-relaxed text-text">{{ previewText(block) }}</p>
      </button>
    </div>

    <p v-else class="text-sm text-muted">当前筛选下暂无模板块。</p>
  </section>
</template>
