<script setup>
defineProps({
  label: {
    type: String,
    default: "Remaining Time"
  },
  remaining: {
    type: Number,
    required: true
  },
  progress: {
    type: Number,
    required: true
  },
  isWarning: {
    type: Boolean,
    default: false
  },
  // "kk" opts into docs/ui-guidelines.md; RA/RS keep the legacy look until their batch.
  tone: {
    type: String,
    default: "legacy"
  }
});
</script>

<template>
  <div class="w-full">
    <div class="mb-1 flex items-center justify-between text-sm">
      <span :class="tone === 'kk' ? 'text-[13px] text-kk-ink-2' : 'text-muted'">{{ label }}</span>
      <span v-if="tone === 'kk'" class="kk-num text-lg font-extrabold" :class="isWarning ? 'text-kk-action-press' : 'text-kk-action-text'">{{ remaining }}s</span>
      <span v-else :class="isWarning ? 'font-bold text-red-500' : 'text-text'">{{ remaining }}s</span>
    </div>
    <div class="h-2 w-full rounded-full" :class="tone === 'kk' ? 'bg-kk-surface-2' : 'bg-gray-200'">
      <div
        class="h-2 rounded-full transition-all duration-1000 ease-linear"
        :class="tone === 'kk' ? (isWarning ? 'bg-kk-action-press' : 'bg-kk-action') : (isWarning ? 'bg-red-500' : 'bg-orange')"
        :style="{ width: `${Math.max(0, Math.min(100, progress))}%` }"
      />
    </div>
  </div>
</template>