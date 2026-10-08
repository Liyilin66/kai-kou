<script setup>
const props = defineProps({
  summary: {
    type: Object,
    default: () => ({})
  },
  round: {
    type: Number,
    default: 1
  },
  totalRounds: {
    type: Number,
    default: 3
  },
  hintLevel: {
    type: String,
    default: "strong"
  },
  canNextRound: {
    type: Boolean,
    default: false
  },
  canSubmit: {
    type: Boolean,
    default: true
  },
  saving: {
    type: Boolean,
    default: false
  },
  showWeakAction: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["retry-round", "save-next-round", "save-next-question", "save-weak"]);
</script>

<template>
  <section class="rounded-xl border bg-white p-5 shadow-card">
    <p class="mb-3 text-sm font-semibold text-navy">训练反馈（非评分）</p>

    <div class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
      <p class="rounded-lg bg-gray-50 p-2">
        本次录音：
        <span class="font-semibold text-navy">{{ summary.recordingLabel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        5 秒开口：
        <span class="font-semibold text-navy">{{ summary.openedLabel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        录音时长：
        <span class="font-semibold text-navy">{{ summary.durationLabel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        当前提示：
        <span class="font-semibold text-navy">{{ hintLevel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        Drill 进度：
        <span class="font-semibold text-navy">第 {{ round }} / {{ totalRounds }} 轮</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        救命词使用：
        <span class="font-semibold text-navy">{{ summary.rescueLabel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        提交状态：
        <span class="font-semibold text-navy">{{ summary.savedLabel }}</span>
      </p>
      <p class="rounded-lg bg-gray-50 p-2">
        下一步建议：
        <span class="font-semibold text-navy">{{ summary.nextSuggestion }}</span>
      </p>
    </div>

    <div class="mt-4 flex flex-wrap justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
        :disabled="saving"
        @click="emit('retry-round')"
      >
        重新录音
      </button>

      <button
        v-if="canNextRound"
        type="button"
        class="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        :disabled="saving || !canSubmit"
        @click="emit('save-next-round')"
      >
        {{ saving ? "提交中..." : canSubmit ? "提交练习并进入下一轮" : "请先完成可用录音" }}
      </button>

      <button
        v-else
        type="button"
        class="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        :disabled="saving || !canSubmit"
        @click="emit('save-next-question')"
      >
        {{ saving ? "提交中..." : canSubmit ? "提交练习并进入下一题" : "请先完成可用录音" }}
      </button>

      <button
        v-if="!canNextRound && showWeakAction"
        type="button"
        class="rounded-lg border border-orange px-3 py-1.5 text-xs font-semibold text-orange transition-colors hover:bg-orange/5"
        :disabled="saving || !canSubmit"
        @click="emit('save-weak')"
      >
        {{ canSubmit ? "提交练习并继续弱项图型" : "请先完成可用录音" }}
      </button>
    </div>
  </section>
</template>
