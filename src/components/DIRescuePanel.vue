<script setup>
const props = defineProps({
  phrases: {
    type: Array,
    default: () => []
  },
  usedCount: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(["use-phrase"]);

function handleUse(phrase) {
  emit("use-phrase", phrase);
}
</script>

<template>
  <section class="rounded-xl border bg-white p-4 shadow-sm">
    <div class="mb-3 flex items-center justify-between">
      <p class="text-sm font-semibold text-navy">卡壳救命词</p>
      <span class="text-xs text-muted">已使用 {{ usedCount }} 次</span>
    </div>

    <div v-if="phrases.length" class="flex flex-wrap gap-2">
      <button
        v-for="phrase in phrases"
        :key="phrase.id"
        type="button"
        class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-left text-text transition-colors hover:border-orange hover:bg-orange/5"
        @click="handleUse(phrase)"
      >
        {{ phrase.text }}
      </button>
    </div>

    <p v-else class="text-xs text-muted">当前档位暂无救命词。</p>
  </section>
</template>
