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
  }
});
</script>

<template>
  <div class="w-full">
    <div class="mb-1 flex items-center justify-between text-sm">
      <span class="text-muted">{{ label }}</span>
      <span :class="isWarning ? 'font-bold text-red-500' : 'text-text'">{{ remaining }}s</span>
    </div>
    <div class="h-2 w-full rounded-full bg-gray-200">
      <div
        class="h-2 rounded-full transition-all duration-1000 ease-linear"
        :class="isWarning ? 'bg-red-500' : 'bg-orange'"
        :style="{ width: `${Math.max(0, Math.min(100, progress))}%` }"
      />
    </div>
  </div>
</template>