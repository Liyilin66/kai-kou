<script setup>
import { computed } from "vue";

const props = defineProps({
  round: {
    type: Number,
    default: 1
  },
  total: {
    type: Number,
    default: 3
  },
  hintLevel: {
    type: String,
    default: "strong"
  }
});

const normalizedRound = computed(() => Math.max(1, Number(props.round || 1)));
const normalizedTotal = computed(() => Math.max(1, Number(props.total || 3)));
const normalizedHint = computed(() => `${props.hintLevel || "strong"}`.trim().toLowerCase());
</script>

<template>
  <section class="rounded-xl border bg-white p-4 shadow-sm">
    <div class="mb-2 flex items-center justify-between">
      <p class="text-sm font-semibold text-navy">本题三连练</p>
      <span class="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">
        Round {{ normalizedRound }}/{{ normalizedTotal }}
      </span>
    </div>

    <div class="mb-2 grid grid-cols-3 gap-2">
      <div
        v-for="step in normalizedTotal"
        :key="`drill-step-${step}`"
        class="rounded-lg border px-3 py-2 text-center text-xs font-semibold"
        :class="step <= normalizedRound ? 'border-orange bg-orange/10 text-orange' : 'border-gray-200 text-muted'"
      >
        第 {{ step }} 轮
      </div>
    </div>

    <p class="text-xs text-muted">
      当前提示档位：
      <span class="font-semibold text-navy">{{ normalizedHint }}</span>
      （系统会在下一轮自动降提示）
    </p>
  </section>
</template>
