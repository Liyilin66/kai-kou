<script setup>
const props = defineProps({
  isRecording: {
    type: Boolean,
    default: false
  },
  // "kk" opts into docs/ui-guidelines.md; RA/RS keep the legacy look until their batch.
  tone: {
    type: String,
    default: "legacy"
  }
});

const bars = [14, 22, 16, 24, 18];
</script>

<template>
  <div class="flex h-12 items-center justify-center gap-1">
    <div class="h-3 w-3 rounded-full" :class="[props.tone === 'kk' ? 'bg-kk-action' : 'bg-orange', props.isRecording ? 'animate-pulse' : 'opacity-30']" />

    <div
      v-for="(height, index) in bars"
      :key="index"
      class="bar w-1.5 rounded-full"
      :class="[props.tone === 'kk' ? 'bg-kk-action' : 'bg-orange', props.isRecording ? 'is-recording' : 'h-1 opacity-30']"
      :style="props.isRecording ? { '--target-height': `${height}px`, animationDelay: `${index * 0.12}s` } : {}"
    />

    <span class="ml-2 text-sm" :class="props.tone === 'kk' ? (props.isRecording ? 'font-semibold text-kk-action-text' : 'text-kk-ink-3') : (props.isRecording ? 'text-orange' : 'text-muted')">
      {{ props.isRecording ? 'Recording...' : 'Waiting...' }}
    </span>
  </div>
</template>

<style scoped>
.bar {
  height: var(--target-height);
}

.is-recording {
  animation: wave 0.9s ease-in-out infinite;
  transform-origin: center bottom;
}

@keyframes wave {
  0%,
  100% {
    transform: scaleY(0.45);
    opacity: 0.45;
  }

  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>