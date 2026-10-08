<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { getDIPlaybackUrl } from "@/lib/di-history";
import { supabase } from "@/lib/supabase";
import {
  DI_SCORE_STATUS_DEGRADED,
  DI_SCORE_STATUS_FAILED,
  DI_SCORE_STATUS_PENDING,
  getDIAiReviewJob,
  getDIFallbackReasonMessage,
  getDIReviewFromScoreJson,
  isDIReviewFailedFromLog,
  normalizeDIQuestionSnapshot,
  normalizeDIReviewStatus,
  normalizeTextValue,
  parseDIScoreJson,
  shouldRedirectDIResultToAnalyzing
} from "@/lib/di-ai-review";

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const loadError = ref("");
const logRow = ref(null);
const playbackUrl = ref("");

const scoreJson = computed(() => parseDIScoreJson(logRow.value?.score_json));
const aiReview = computed(() => getDIReviewFromScoreJson(scoreJson.value) || {});
const reviewJob = computed(() => getDIAiReviewJob(scoreJson.value));
const forcedFailedView = computed(() => normalizeTextValue(route.query?.reviewState).toLowerCase() === "failed");
const forcedFailureReason = computed(() => normalizeTextValue(route.query?.reviewReason));
const transcript = computed(() => normalizeTextValue(logRow.value?.transcript));
const questionSnapshot = computed(() => normalizeDIQuestionSnapshot(
  scoreJson.value?.question || { id: logRow.value?.question_id }
));
const questionId = computed(() => normalizeTextValue(questionSnapshot.value.id || logRow.value?.question_id));

const reviewStatus = computed(() => {
  if (forcedFailedView.value) return DI_SCORE_STATUS_FAILED;
  if (reviewJob.value?.status === "failed") return DI_SCORE_STATUS_FAILED;
  if (isDIReviewFailedFromLog(logRow.value)) return DI_SCORE_STATUS_FAILED;
  return normalizeDIReviewStatus(aiReview.value?.status);
});

const displayScores = computed(() => resolveDisplayScores({
  review: aiReview.value,
  status: reviewStatus.value
}));

const fallbackReasonMessage = computed(() => (
  getDIFallbackReasonMessage(
    forcedFailureReason.value
    || aiReview.value?.reason_code
    || aiReview.value?.fallback_reason
    || reviewJob.value?.last_error_code
  )
));

const statusLabel = computed(() => {
  if (reviewStatus.value === DI_SCORE_STATUS_FAILED) return "评分失败";
  if (reviewStatus.value === DI_SCORE_STATUS_PENDING) return "结果准备中";
  if (reviewStatus.value === DI_SCORE_STATUS_DEGRADED) return "AI评分降级";
  return "正常评分";
});

const statusMessage = computed(() => {
  if (reviewStatus.value === DI_SCORE_STATUS_FAILED) {
    return fallbackReasonMessage.value || "评分流程已终止，请稍后重试。";
  }
  if (reviewStatus.value === DI_SCORE_STATUS_PENDING) {
    return "本次结果还在整理中，正在为你跳转到分析页。";
  }
  if (reviewStatus.value === DI_SCORE_STATUS_DEGRADED) {
    return fallbackReasonMessage.value || "AI评分暂时不可用，已保留本次录音与练习记录。";
  }
  return "AI评分完成，可根据反馈继续优化。";
});

const feedbackText = computed(() => normalizeTextValue(
  aiReview.value?.feedback_zh
  || aiReview.value?.feedback
));

const betterResponse = computed(() => normalizeTextValue(aiReview.value?.better_response));

async function loadResultByRoute() {
  const logId = normalizeTextValue(route.query?.logId);
  if (!logId) {
    router.replace("/di");
    return;
  }

  loading.value = true;
  loadError.value = "";
  playbackUrl.value = "";
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, question_id, transcript, score_json, feedback, created_at")
      .eq("id", logId)
      .eq("task_type", "DI")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("未找到对应的 DI 结果记录。");
    }

    if (shouldRedirectDIResultToAnalyzing(data) && !forcedFailedView.value) {
      await router.replace({
        path: "/di/analyzing",
        query: buildRouteQuery(data.id, data.question_id)
      });
      return;
    }

    logRow.value = data;
    playbackUrl.value = await getDIPlaybackUrl(parseDIScoreJson(data.score_json)?.audio);
  } catch (error) {
    logRow.value = null;
    loadError.value = normalizeTextValue(error?.message) || "结果读取失败，请返回练习页重试。";
  } finally {
    loading.value = false;
  }
}

function buildRouteQuery(logId = "", currentQuestionId = "") {
  const query = {};
  const normalizedLogId = normalizeTextValue(logId);
  const normalizedQuestionId = normalizeTextValue(currentQuestionId);
  if (normalizedLogId) query.logId = normalizedLogId;
  if (normalizedQuestionId) query.id = normalizedQuestionId;
  return query;
}

function buildPracticeQuery({ preferNext = false } = {}) {
  const query = {};
  if (!preferNext && questionId.value) {
    query.qid = questionId.value;
  }
  if (questionSnapshot.value.imageType) {
    query.type = questionSnapshot.value.imageType;
  }
  return query;
}

function goBackPractice() {
  router.push({
    path: "/di",
    query: buildPracticeQuery()
  });
}

function goNextQuestion() {
  router.push({
    path: "/di",
    query: buildPracticeQuery({ preferNext: true })
  });
}

onMounted(() => {
  void loadResultByRoute();
});

watch(
  () => [route.query.logId, route.query.reviewState, route.query.reviewReason],
  () => {
    void loadResultByRoute();
  }
);

function resolveDisplayScores({ review = null, status = DI_SCORE_STATUS_PENDING } = {}) {
  const source = review && typeof review === "object" ? review : {};
  const display = source?.display_scores && typeof source.display_scores === "object" ? source.display_scores : {};
  const scores = source?.scores && typeof source.scores === "object" ? source.scores : {};
  const overall = clampDisplayScore(
    display?.overall
    ?? source?.overall
    ?? 10
  );
  const content = clampDisplayScore(display?.content ?? scores?.content ?? 10);
  const pronunciation = clampDisplayScore(display?.pronunciation ?? scores?.pronunciation ?? 10);
  const fluency = clampDisplayScore(display?.fluency ?? scores?.fluency ?? 10);

  if (status === DI_SCORE_STATUS_PENDING) {
    return {
      overall: 10,
      content: 10,
      pronunciation: 10,
      fluency: 10
    };
  }

  return {
    overall,
    content,
    pronunciation,
    fluency
  };
}

function clampDisplayScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 10;
  return Math.max(10, Math.min(90, Math.round(num)));
}
</script>

<template>
  <div class="min-h-screen bg-[#F5F7FB]">
    <NavBar title="DI AI评分结果" back-to="/di" />

    <main class="mx-auto max-w-3xl px-4 py-5">
      <section v-if="loading" class="rounded-2xl border border-[#E8EDF5] bg-white px-4 py-6 text-sm text-[#8CA0C0]">
        结果加载中...
      </section>

      <section v-else-if="loadError" class="rounded-2xl border border-[#F2D6D3] bg-[#FFF7F6] p-4">
        <p class="text-sm font-semibold text-[#B42318]">结果读取失败</p>
        <p class="mt-1 text-sm text-[#D92D20]">{{ loadError }}</p>
        <button
          type="button"
          class="mt-4 rounded-[11px] border border-[#E8EDF5] bg-white px-4 py-2 text-sm text-[#1B3A6B]"
          @click="goBackPractice"
        >
          返回练习页
        </button>
      </section>

      <template v-else>
        <section class="rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-xs text-[#8CA0C0]">状态：{{ statusLabel }}</p>
          <p class="mt-1 text-sm text-[#52627A]">{{ statusMessage }}</p>
          <p v-if="reviewStatus !== 'scored' && fallbackReasonMessage" class="mt-3 text-xs text-[#D92D20]">
            {{ fallbackReasonMessage }}
          </p>
          <p class="mt-3 text-xs text-[#8CA0C0]">题目 / 图题上下文</p>
          <p class="mt-1 text-sm leading-relaxed text-[#1E293B]">
            {{ questionSnapshot.displayTitle || questionSnapshot.topic || "未找到题目内容。" }}
          </p>
          <p class="mt-2 text-xs text-[#8CA0C0]">
            图型：{{ questionSnapshot.imageType || "-" }}
            <span v-if="questionId"> · 题号：{{ questionId }}</span>
          </p>
          <p v-if="questionSnapshot.questionContent" class="mt-2 text-sm leading-relaxed text-[#52627A]">
            {{ questionSnapshot.questionContent }}
          </p>
        </section>

        <section v-if="questionSnapshot.imageUrl" class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">题图</p>
          <div class="mt-3 overflow-hidden rounded-xl bg-[#F8FAFD]">
            <img
              :src="questionSnapshot.imageUrl"
              :alt="questionSnapshot.imageAlt || questionSnapshot.displayTitle || questionSnapshot.topic || questionId"
              class="max-h-[360px] w-full object-contain"
            />
          </div>
        </section>

        <section class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <article class="rounded-xl border border-[#E8EDF5] bg-white p-3">
            <p class="text-xs text-[#8CA0C0]">Overall</p>
            <p class="mt-1 text-2xl font-bold text-[#1B3A6B]">{{ displayScores.overall }}</p>
            <p class="text-xs text-[#8CA0C0]">/90</p>
          </article>
          <article class="rounded-xl border border-[#E8EDF5] bg-white p-3">
            <p class="text-xs text-[#8CA0C0]">Content</p>
            <p class="mt-1 text-xl font-semibold text-[#1E293B]">{{ displayScores.content }}</p>
            <p class="text-xs text-[#8CA0C0]">/90</p>
          </article>
          <article class="rounded-xl border border-[#E8EDF5] bg-white p-3">
            <p class="text-xs text-[#8CA0C0]">Pronunciation</p>
            <p class="mt-1 text-xl font-semibold text-[#1E293B]">{{ displayScores.pronunciation }}</p>
            <p class="text-xs text-[#8CA0C0]">/90</p>
          </article>
          <article class="rounded-xl border border-[#E8EDF5] bg-white p-3">
            <p class="text-xs text-[#8CA0C0]">Fluency</p>
            <p class="mt-1 text-xl font-semibold text-[#1E293B]">{{ displayScores.fluency }}</p>
            <p class="text-xs text-[#8CA0C0]">/90</p>
          </article>
        </section>

        <section class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">用户录音</p>
          <audio v-if="playbackUrl" class="mt-3 w-full" controls :src="playbackUrl" />
          <p v-else class="mt-2 text-xs text-[#8CA0C0]">当前录音暂不可回放，但练习记录已保留。</p>
        </section>

        <section class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">Transcript</p>
          <p class="mt-2 text-sm leading-relaxed text-[#52627A]">
            {{ transcript || "未识别到有效 transcript。" }}
          </p>
        </section>

        <section class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">中文反馈</p>
          <p class="mt-2 text-sm leading-relaxed text-[#52627A]">
            {{ feedbackText || "暂无反馈内容。" }}
          </p>
        </section>

        <section class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">更优回答建议</p>
          <p class="mt-2 text-sm leading-relaxed text-[#52627A]">
            {{ betterResponse || "This image presents several important features. Overall, the key pattern and the main comparison should be stated clearly." }}
          </p>
        </section>

        <section class="mt-5 space-y-3">
          <OrangeButton full @click="goNextQuestion">下一题</OrangeButton>
          <button
            type="button"
            class="w-full rounded-[11px] border border-[#E8EDF5] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B]"
            @click="goBackPractice"
          >
            返回继续练习
          </button>
        </section>
      </template>
    </main>
  </div>
</template>
