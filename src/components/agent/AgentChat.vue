<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { parseAgentContent } from "@/lib/agent-rich-content";

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  pending: {
    type: Boolean,
    default: false
  },
  draft: {
    type: String,
    default: ""
  },
  errorMessage: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["submit", "retry", "update:draft"]);
const messagesAnchorRef = ref(null);

const draftModel = computed({
  get: () => props.draft,
  set: (value) => emit("update:draft", value)
});

watch(
  () => [props.messages.length, props.pending],
  async () => {
    await nextTick();
    messagesAnchorRef.value?.scrollIntoView({ behavior: "smooth", block: "end" });
  }
);

onMounted(async () => {
  await nextTick();
  messagesAnchorRef.value?.scrollIntoView({ behavior: "auto", block: "end" });
});

function handleKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;

  event.preventDefault();
  emit("submit", props.draft);
}

function renderBlocks(value) {
  return parseAgentContent(value);
}
</script>

<template>
  <section class="flex min-h-[620px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_28px_70px_rgba(15,23,42,0.1)] backdrop-blur">
    <header class="border-b border-slate-200/80 px-5 py-4">
      <p class="text-sm font-semibold text-slate-900">和 AI 私教对话</p>
      <p class="mt-1 text-sm text-slate-500">可以自然打招呼、问题型方法，或让我结合你的练习记录做分析。</p>
    </header>

    <div class="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
      <div
        v-if="!messages.length"
        class="rounded-[24px] border border-dashed border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)] px-5 py-8 text-center"
      >
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef4ff] text-xl">
          学
        </div>
        <p class="mt-4 text-lg font-semibold text-slate-900">先从一个真实问题开始</p>
        <p class="mt-2 text-sm leading-7 text-slate-500">
          例如“你好”、“你是谁”、“DI 怎么提高？”、“我最近哪项最弱？”。如果上一轮已经给了建议，也可以直接回“好”或“继续”。
        </p>
      </div>

      <div
        v-for="message in messages"
        :key="message.id"
        class="flex"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <article
          class="max-w-[88%] rounded-[24px] px-4 py-3 shadow-sm sm:max-w-[80%]"
          :class="message.role === 'user'
            ? 'bg-[linear-gradient(135deg,#15335f,#214a8b)] text-white'
            : message.tone === 'error'
              ? 'border border-[#f2c8bb] bg-[#fff5f1] text-[#8a452d]'
              : 'border border-slate-200 bg-[#f8fbff] text-slate-800'"
        >
          <div class="space-y-3">
            <template v-for="(block, blockIndex) in renderBlocks(message.content)" :key="`${message.id}-${blockIndex}`">
              <p
                v-if="block.type === 'paragraph'"
                class="whitespace-pre-wrap text-sm leading-7"
              >
                {{ block.text }}
              </p>

              <div
                v-else-if="block.type === 'table'"
                class="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80"
              >
                <table class="min-w-full border-collapse text-left text-sm text-slate-700">
                  <thead class="bg-slate-100/90 text-slate-900">
                    <tr>
                      <th
                        v-for="(header, headerIndex) in block.headers"
                        :key="`${message.id}-${blockIndex}-header-${headerIndex}`"
                        class="border-b border-slate-200 px-3 py-2 font-semibold whitespace-nowrap"
                      >
                        {{ header }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, rowIndex) in block.rows"
                      :key="`${message.id}-${blockIndex}-row-${rowIndex}`"
                      class="align-top"
                    >
                      <td
                        v-for="(cell, cellIndex) in row"
                        :key="`${message.id}-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`"
                        class="border-b border-slate-100 px-3 py-2 text-slate-700"
                      >
                        {{ cell }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
          <p
            v-if="message.meta"
            class="mt-2 text-[11px]"
            :class="message.role === 'user' ? 'text-white/70' : 'text-slate-400'"
          >
            {{ message.meta }}
          </p>
        </article>
      </div>

      <div v-if="pending" class="flex justify-start">
        <article class="max-w-[88%] rounded-[24px] border border-slate-200 bg-[#f8fbff] px-4 py-3 text-slate-700 shadow-sm sm:max-w-[80%]">
          <div class="flex items-center gap-3">
            <span class="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500"></span>
            <span class="text-sm">AI 私教正在思考…</span>
          </div>
        </article>
      </div>

      <div ref="messagesAnchorRef"></div>
    </div>

    <div class="sticky bottom-0 border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur sm:px-5">
      <div
        v-if="errorMessage"
        class="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-[#f2c8bb] bg-[#fff5f1] px-4 py-3 text-sm text-[#8a452d]"
      >
        <p class="leading-6">{{ errorMessage }}</p>
        <button
          type="button"
          class="shrink-0 rounded-full border border-[#e4ab96] px-3 py-1 text-xs font-medium transition hover:bg-[#ffe9e1]"
          @click="$emit('retry')"
        >
          重试
        </button>
      </div>

      <div class="rounded-[24px] border border-slate-200 bg-slate-50/90 px-3 py-3 shadow-inner">
        <textarea
          v-model="draftModel"
          class="min-h-[72px] w-full resize-none border-0 bg-transparent px-2 text-sm leading-7 text-slate-800 outline-none placeholder:text-slate-400"
          placeholder="直接问：DI 怎么提高？或者结合我的记录看今天练什么。"
          :disabled="pending"
          @keydown="handleKeydown"
        ></textarea>

        <div class="mt-3 flex items-center justify-between gap-3">
          <p class="text-xs text-slate-400">按 Enter 发送，Shift + Enter 换行，也可以直接回“好 / 继续 / 就这个”延续上一轮。</p>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#15335f,#214a8b)] px-4 py-2 text-sm font-medium text-white shadow-[0_12px_30px_rgba(33,74,139,0.25)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="pending || !draft.trim()"
            @click="$emit('submit', draft)"
          >
            {{ pending ? "发送中..." : "发送" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
