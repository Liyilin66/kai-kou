<script setup>
const props = defineProps({
  actions: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["select"]);

function handleSelect(action) {
  if (props.disabled) return;
  emit("select", action);
}
</script>

<template>
  <section class="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
    <div class="mb-4">
      <p class="text-sm font-semibold text-slate-900">快捷问题</p>
      <p class="mt-1 text-sm text-slate-500">不想从零开始时，点一下就能直接发问。</p>
    </div>

    <div class="grid gap-3">
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="group rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(59,130,246,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disabled"
        @click="handleSelect(action)"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">{{ action.title }}</p>
            <p class="mt-1 text-sm leading-6 text-slate-500">{{ action.subtitle }}</p>
          </div>
          <span class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 transition group-hover:bg-slate-900 group-hover:text-white">
            发送
          </span>
        </div>
      </button>
    </div>
  </section>
</template>
