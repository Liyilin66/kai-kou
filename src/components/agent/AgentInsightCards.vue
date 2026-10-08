<script setup>
defineProps({
  cards: {
    type: Array,
    default: () => []
  },
  coachTip: {
    type: String,
    default: ""
  },
  loading: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <section class="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
    <div class="mb-4">
      <p class="text-sm font-semibold text-slate-900">学习状态摘要</p>
      <p class="mt-1 text-sm text-slate-500">先看最近状态，再决定今天问什么、练什么。</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <article
        v-for="card in cards"
        :key="card.id"
        class="rounded-2xl border border-slate-200/80 bg-gradient-to-br px-4 py-4"
        :class="card.accent"
      >
        <p class="text-xs font-medium tracking-[0.08em] text-slate-500">{{ card.label }}</p>
        <p class="mt-2 text-2xl font-semibold text-slate-900">
          {{ loading ? "--" : card.value }}
        </p>
        <p class="mt-2 text-sm leading-6 text-slate-600">
          {{ card.helper }}
        </p>
      </article>
    </div>

    <div class="mt-4 rounded-2xl border border-[#d8e5ff] bg-[linear-gradient(135deg,rgba(231,240,255,0.88),rgba(255,255,255,0.92))] px-4 py-4">
      <p class="text-xs font-medium tracking-[0.08em] text-slate-500">AI 私教提醒</p>
      <p class="mt-2 text-sm leading-7 text-slate-700">
        {{ coachTip }}
      </p>
    </div>
  </section>
</template>
