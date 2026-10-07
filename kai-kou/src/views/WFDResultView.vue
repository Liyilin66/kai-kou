<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WFD 结果" back-to="/wfd" />

    <div class="mx-auto max-w-2xl px-4 py-6">
      <div v-if="!result" class="py-16 text-center">
        <p class="text-sm text-muted">正在跳转...</p>
      </div>

      <div v-else>
        <div class="mb-6 text-center">
          <p class="mb-2 text-4xl">{{ resultEmoji }}</p>
          <h1 class="mb-1 text-2xl font-bold text-navy">{{ resultTitle }}</h1>
          <p class="text-muted">
            得分
            <span class="mx-1 text-2xl font-bold text-orange">{{ result.correct }}</span>
            / {{ result.total }}
            <span class="ml-1 text-sm text-muted">({{ result.score }}%)</span>
          </p>
        </div>

        <div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <p class="mb-3 text-sm font-semibold text-navy">逐词对比</p>
          <div class="mb-3 flex flex-wrap gap-2">
            <span
              v-for="(word, i) in result.wordResults"
              :key="i"
              class="rounded-lg px-2.5 py-1 text-sm font-medium"
              :class="word.status === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'"
            >
              {{ word.text }}
            </span>
          </div>
          <div class="flex gap-4 border-t pt-3 text-xs text-muted">
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded bg-green-100"></span>正确
            </span>
            <span class="flex items-center gap-1">
              <span class="inline-block h-3 w-3 rounded bg-red-100"></span>漏掉了
            </span>
          </div>
        </div>

        <div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">标准答案</p>
          <p class="leading-relaxed text-text">{{ result.correctAnswer }}</p>
        </div>

        <div class="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">你写的</p>
          <p class="italic leading-relaxed text-muted">"{{ result.userInput }}"</p>
        </div>

        <div class="mb-6 rounded-xl bg-white p-4 shadow-sm">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-navy text-white">AI</div>
            <div>
              <p class="mb-1 text-xs text-muted">教练反馈</p>
              <p class="leading-relaxed text-text">{{ result.feedback }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <button
            type="button"
            class="w-full rounded-xl bg-orange py-4 text-lg font-bold text-white shadow-md hover:opacity-90"
            @click="router.push('/wfd/practice')"
          >
            再练一题 →
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
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
