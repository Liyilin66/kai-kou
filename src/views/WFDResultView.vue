<template>
  <div class="kk-page min-h-screen">
    <NavBar title="WFD 结果" back-to="/wfd" variant="kk" />

    <div class="mx-auto max-w-2xl px-4 py-6">
      <div v-if="!result" class="py-16 text-center">
        <p class="text-sm text-kk-ink-3">正在跳转...</p>
      </div>

      <div v-else>
        <div class="mb-6 text-center">
          <p class="mb-2 text-4xl">{{ resultEmoji }}</p>
          <h1 class="mb-1 text-2xl font-bold text-kk-ink">{{ resultTitle }}</h1>
          <p class="text-kk-ink-3">
            得分
            <span class="kk-num mx-1 text-[28px] font-extrabold text-kk-ink">{{ result.correct }}</span>
            / {{ result.total }}
            <span class="ml-1 text-sm text-kk-ink-3">({{ result.score }}%)</span>
          </p>
        </div>

        <div class="mb-4 rounded-[20px] bg-kk-surface p-4 shadow-kk">
          <p class="mb-3 text-sm font-semibold text-kk-ink">逐词对比</p>
          <div class="mb-3 flex flex-wrap gap-2">
            <span
              v-for="(word, i) in result.wordResults"
              :key="i"
              class="kk-text rounded-lg px-2.5 py-1 text-[15px] font-medium"
              :class="word.status === 'correct' ? 'bg-kk-success-bg text-kk-success' : 'bg-kk-error-bg text-kk-error underline decoration-kk-error-line decoration-2 underline-offset-4'"
            >
              {{ word.text }}
            </span>
          </div>
          <div class="flex gap-4 border-t pt-3 text-xs text-kk-ink-3">
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded bg-kk-success-bg ring-1 ring-kk-success-line"></span>正确
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded border-b-2 border-kk-error-line bg-kk-error-bg"></span>漏掉了
            </span>
          </div>
        </div>

        <div class="mb-4 rounded-[20px] bg-kk-surface p-4 shadow-kk">
          <p class="mb-2 text-sm font-semibold text-kk-ink">标准答案</p>
          <p class="leading-relaxed text-kk-ink">{{ result.correctAnswer }}</p>
        </div>

        <div class="mb-4 rounded-[20px] bg-kk-surface p-4 shadow-kk">
          <p class="mb-2 text-sm font-semibold text-kk-ink">你写的</p>
          <p class="italic leading-relaxed text-kk-ink-3">"{{ result.userInput }}"</p>
        </div>

        <div class="mb-6 rounded-[20px] bg-kk-surface p-4 shadow-kk">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-kk-ink text-sm font-bold text-kk-ink-inverse">AI</div>
            <div>
              <p class="mb-1 text-xs text-kk-ink-3">教练反馈</p>
              <p class="leading-relaxed text-kk-ink">{{ result.feedback }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <button
            type="button"
            class="min-h-[52px] w-full rounded-full py-3 text-[15px] font-bold bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press"
            @click="router.push('/wfd/practice')"
          >
            再练一题 →
          </button>
          <button
            type="button"
            class="min-h-[48px] w-full rounded-full border border-kk-line bg-kk-surface py-3 font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
            @click="router.push('/home')"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePracticeStore } from "@/stores/practice";
import NavBar from "@/components/NavBar.vue";

const router = useRouter();
const store = usePracticeStore();
const result = computed(() => store.wfdResult);

onMounted(() => {
  if (!result.value) {
    setTimeout(() => {
      router.replace("/wfd");
    }, 1500);
  }
});

const resultEmoji = computed(() => {
  const score = Number(result.value?.score || 0);
  if (score >= 90) return "🎉";
  if (score >= 70) return "💪";
  if (score >= 50) return "📝";
  return "🌱";
});

const resultTitle = computed(() => {
  const score = Number(result.value?.score || 0);
  if (score >= 90) return "太准了！";
  if (score >= 70) return "答得不错！";
  if (score >= 50) return "继续练，越来越好！";
  return "很好的练习！";
});
</script>
