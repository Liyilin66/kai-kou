<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { supabase } from "@/lib/supabase";
import { getRTSPlaybackUrl, RTS_TOPIC_META, useRTSData } from "@/composables/useRTSData";
import {
  getRTSAiReviewJob,
  getRTSFallbackReasonMessage,
  getRTSReviewFromScoreJson,
  isRTSReviewFailedFromLog,
  parseRTSScoreJson,
  normalizeRTSReviewStatus,
  normalizeTextValue,
  shouldRedirectRTSResultToAnalyzing
} from "@/lib/rts-ai-review";

const RTS_STATUS_PENDING = "pending";
const RTS_STATUS_SCORED = "scored";
const RTS_STATUS_RULE_GATED = "rule_gated";
const RTS_STATUS_DEGRADED = "ai_review_degraded";
const DISPLAY_MIN = 10;
const DISPLAY_MAX = 90;
const CONTENT_RAW_MAX = 3;
const PRON_RAW_MAX = 5;
const FLUENCY_RAW_MAX = 5;

const RTS_REASON_MESSAGE_MAP = {
  appropriacy_zero_off_topic: "回答内容与场景不匹配。",
  appropriacy_zero_goal_not_met: "回答没有完成情境目标。",
  appropriacy_zero_template_like: "可再补一条更具体的行动建议，让回答更完整。",
  appropriacy_zero_context_incoherent: "语境信息不连贯，影响理解。",
  appropriacy_zero_register_mismatch: "语气可以再更自然一点，但主要先保证关键信息完整。",
  appropriacy_zero_too_short: "回答过短，无法完成任务。",
  transcript_empty: "未识别到有效转写文本。",
  audio_not_usable: "录音可用性不足，无法稳定评阅。",
  ai_review_unavailable: "AI评阅服务暂时不可用。"
};

const route = useRoute();
const router = useRouter();
const { getQuestionById, getRandomQuestion } = useRTSData();

const loading = ref(true);
const loadError = ref("");
const logRow = ref(null);
const question = ref(null);
const playbackUrl = ref("");

const scoreJson = computed(() => parseRTSScoreJson(logRow.value?.score_json));
const aiReview = computed(() => getRTSReviewFromScoreJson(scoreJson.value) || {});
const reviewJob = computed(() => getRTSAiReviewJob(scoreJson.value));
const forcedFailedView = computed(() => normalizeTextValue(route.query?.reviewState).toLowerCase() === "failed");
const forcedFailureReason = computed(() => normalizeTextValue(route.query?.reviewReason));
const transcript = computed(() => normalizeTextValue(logRow.value?.transcript));
const questionId = computed(() => normalizeTextValue(logRow.value?.question_id));
const sceneSummary = computed(() => {
  const fromQuestion = normalizeTextValue(question.value?.content || scoreJson.value?.question_content);
  if (fromQuestion) return fromQuestion;
  if (transcript.value) return transcript.value;
  return "未找到题目内容。";
});

const reviewStatus = computed(() => {
  if (forcedFailedView.value) return RTS_STATUS_DEGRADED;
  if (reviewJob.value?.status === "failed") return RTS_STATUS_DEGRADED;
  if (isRTSReviewFailedFromLog(logRow.value)) return RTS_STATUS_DEGRADED;
  if (!Object.keys(aiReview.value || {}).length) return RTS_STATUS_PENDING;
  return normalizeRTSReviewStatus(aiReview.value?.status);
});

const displayScores = computed(() => {
  return resolveDisplayScores({
    review: aiReview.value,
    status: reviewStatus.value
  });
});

const fallbackReasonMessage = computed(() => (
  forcedFailureReason.value
  || normalizeTextValue(aiReview.value?.fallback_reason_message_zh)
  || getRTSFallbackReasonMessage(aiReview.value?.fallback_reason || reviewJob.value?.last_error_code)
));

const statusLabel = computed(() => {
  if (forcedFailedView.value || reviewJob.value?.status === "failed") return "评阅失败（已终止）";
  if (reviewStatus.value === RTS_STATUS_PENDING) return "结果准备中";
  if (reviewStatus.value === RTS_STATUS_RULE_GATED) return "内容未达要求最低档";
  if (reviewStatus.value === RTS_STATUS_DEGRADED) return "AI评分降级";
  return "正常评分";
});

const statusMessage = computed(() => {
  if (forcedFailedView.value || reviewJob.value?.status === "failed") {
    return fallbackReasonMessage.value || "评分流程已终止，请稍后重试。";
  }
  if (reviewStatus.value === RTS_STATUS_PENDING) {
    return "本次结果还在整理中，正在为你跳转到分析页。";
  }
  if (reviewStatus.value === RTS_STATUS_RULE_GATED) {
    return "内容未达要求，按最低档处理。";
  }
  if (reviewStatus.value === RTS_STATUS_DEGRADED) {
    return fallbackReasonMessage.value || "AI评阅暂时不可用，已保留本次录音与练习记录。";
  }
  return "AI评阅完成，可根据反馈继续优化。";
});

const feedbackList = computed(() => {
  const review = aiReview.value || {};
  const fromProduct = normalizeTextArray(review?.product?.feedback_zh);
  if (fromProduct.length) return normalizeRTSFeedbackList(fromProduct);
  const fromFeedback = normalizeTextValue(review?.feedback || logRow.value?.feedback);
  return fromFeedback ? normalizeRTSFeedbackList([fromFeedback]) : [];
});

const betterExpression = computed(() => normalizeRTSBetterExpression(
  normalizeTextValue(aiReview.value?.product?.better_expression_zh),
  sceneSummary.value
));
const gateReasonMessages = computed(() => {
  const review = aiReview.value || {};
  const direct = normalizeTextArray(review?.gate_reason_messages_zh);
  if (direct.length) return direct;
  const reasonCodes = Array.isArray(review?.gate?.reason_codes) ? review.gate.reason_codes : [];
  return reasonCodes.map((item) => RTS_REASON_MESSAGE_MAP[normalizeTextValue(item)]).filter(Boolean);
});
const detailMessages = computed(() => {
  if (reviewStatus.value === RTS_STATUS_RULE_GATED) return gateReasonMessages.value;
  if (reviewStatus.value === RTS_STATUS_DEGRADED) {
    const messages = normalizeTextArray(aiReview.value?.gate_reason_messages_zh);
    if (messages.length) return messages;
    return fallbackReasonMessage.value ? [fallbackReasonMessage.value] : [];
  }
  return [];
});

const topicLabel = computed(() => {
  const topicKey = normalizeTextValue(question.value?.topic || scoreJson.value?.topic || scoreJson.value?.question_meta?.topic);
  return RTS_TOPIC_META[topicKey]?.label || "日常安排";
});

const toneLabel = computed(() => {
  const value = normalizeTextValue(
    question.value?.key_points?.tone
    || scoreJson.value?.tone
    || scoreJson.value?.question_meta?.tone
  );
  return value || "半正式语气";
});

async function loadResultByRoute() {
  const logId = normalizeTextValue(route.query?.logId);
  if (!logId) {
    router.replace("/rts/practice");
    return;
  }

  loading.value = true;
  loadError.value = "";
  playbackUrl.value = "";
  question.value = null;
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, question_id, transcript, score_json, feedback, created_at")
      .eq("id", logId)
      .eq("task_type", "RTS")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("未找到对应的 RTS 结果记录。");
    }

    if (shouldRedirectRTSResultToAnalyzing(data) && !forcedFailedView.value) {
      await router.replace({
        path: "/rts/analyzing",
        query: buildRouteQuery(data.id, data.question_id)
      });
      return;
    }

    logRow.value = data;
    question.value = await getQuestionById(data.question_id);
    const audio = parseRTSScoreJson(data.score_json)?.audio;
    playbackUrl.value = await getRTSPlaybackUrl(audio);
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

function goBackPractice() {
  const id = questionId.value;
  router.push({
    path: "/rts/practice",
    query: id ? { id } : {}
  });
}

async function goNextQuestion() {
  const nextQuestion = await getRandomQuestion(questionId.value);
  router.push({
    path: "/rts/practice",
    query: nextQuestion?.id ? { id: nextQuestion.id } : {}
  });
}

function goRTSHome() {
  router.push("/rts");
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

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeTextValue(item)).filter(Boolean);
}

function normalizeRTSFeedbackList(items = []) {
  const normalized = items
    .map((item) => normalizeRTSFeedbackItem(item))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function normalizeRTSFeedbackItem(value = "") {
  const text = normalizeTextValue(value);
  if (!text) return "";
  if (/(复述|照搬|自己的话|模板)/.test(text)) {
    return "关键信息覆盖已经不错，下一步建议把行动建议说得更具体。";
  }
  return text;
}

function normalizeRTSBetterExpression(value = "", questionText = "") {
  const normalized = normalizeTextValue(value).replace(/\s+/g, " ").trim();
  if (isSimpleEnglishSentence(normalized)) {
    return toSimpleEnglishSentence(normalized);
  }
  return buildSimpleResultSuggestion(questionText);
}

function buildSimpleResultSuggestion(questionText = "") {
  const tokens = new Set(
    normalizeTextValue(questionText)
      .toLowerCase()
      .match(/[a-z]+(?:'[a-z]+)?/g) || []
  );
  const hasClassScene = (
    tokens.has("class")
    || tokens.has("classes")
    || tokens.has("skip")
    || tokens.has("skips")
    || tokens.has("assignment")
    || tokens.has("assignments")
    || tokens.has("homework")
    || tokens.has("late")
    || tokens.has("early")
  );
  if (hasClassScene) {
    return "Hey, try one small step first: go to class on time and submit homework on time.";
  }
  return "Hey, tell the main problem first, then give one simple and clear suggestion.";
}

function isSimpleEnglishSentence(value = "") {
  if (!value) return false;
  if (/[\u4e00-\u9fff]/.test(value)) return false;
  if (/[;:]/.test(value)) return false;
  const words = value.match(/[a-z]+(?:'[a-z]+)?/gi) || [];
  if (words.length < 6 || words.length > 24) return false;
  if (words.some((word) => word.length > 11)) return false;
  return true;
}

function toSimpleEnglishSentence(value = "") {
  const words = (value.match(/[a-z]+(?:'[a-z]+)?/gi) || []).slice(0, 22);
  if (!words.length) return "";
  const sentence = words.join(" ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clampScore(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function mapRawToDisplay(rawScore, rawMax) {
  const bounded = clampScore(rawScore, 0, rawMax);
  if (rawMax <= 0) return DISPLAY_MIN;
  return clampScore(Math.round(DISPLAY_MIN + (bounded / rawMax) * (DISPLAY_MAX - DISPLAY_MIN)), DISPLAY_MIN, DISPLAY_MAX);
}

function composeOverall(content, pronunciation, fluency) {
  return clampScore(
    Math.round(
      Number(content || 0) * 0.5
      + Number(pronunciation || 0) * 0.25
      + Number(fluency || 0) * 0.25
    ),
    DISPLAY_MIN,
    DISPLAY_MAX
  );
}

function firstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function resolveDisplayScores({ review, status } = {}) {
  const source = toObject(review) || {};
  if (status === RTS_STATUS_PENDING || status === RTS_STATUS_RULE_GATED) {
    return {
      content: DISPLAY_MIN,
      pronunciation: DISPLAY_MIN,
      fluency: DISPLAY_MIN,
      overall: DISPLAY_MIN
    };
  }

  const contentRaw = firstNumber(
    source?.raw_traits?.content_raw,
    source?.official_traits?.appropriacy?.score,
    source?.official_traits?.content?.score
  );
  const pronunciationRaw = firstNumber(
    source?.raw_traits?.pronunciation_raw,
    source?.official_traits?.pronunciation?.score
  );
  const fluencyRaw = firstNumber(
    source?.raw_traits?.fluency_raw,
    source?.official_traits?.oral_fluency?.score
  );

  const content = clampScore(
    firstNumber(
      source?.scores?.content,
      source?.product?.content,
      source?.display_scores?.content,
      source?.diagnostics?.display_scores?.content,
      Number.isFinite(contentRaw) ? mapRawToDisplay(contentRaw, CONTENT_RAW_MAX) : NaN
    ),
    DISPLAY_MIN,
    DISPLAY_MAX
  );
  const pronunciation = clampScore(
    firstNumber(
      source?.scores?.pronunciation,
      source?.product?.pronunciation,
      source?.display_scores?.pronunciation,
      source?.diagnostics?.display_scores?.pronunciation,
      Number.isFinite(pronunciationRaw) ? mapRawToDisplay(pronunciationRaw, PRON_RAW_MAX) : NaN
    ),
    DISPLAY_MIN,
    DISPLAY_MAX
  );
  const fluency = clampScore(
    firstNumber(
      source?.scores?.fluency,
      source?.product?.fluency,
      source?.display_scores?.fluency,
      source?.diagnostics?.display_scores?.fluency,
      Number.isFinite(fluencyRaw) ? mapRawToDisplay(fluencyRaw, FLUENCY_RAW_MAX) : NaN
    ),
    DISPLAY_MIN,
    DISPLAY_MAX
  );

  return {
    content,
    pronunciation,
    fluency,
    overall: composeOverall(content, pronunciation, fluency)
  };
}
</script>

<template>
  <div class="min-h-screen bg-[#F5F7FB]">
    <NavBar title="RTS AI评分结果" back-to="/rts/practice" />

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
          <ul v-if="detailMessages.length" class="mt-3 space-y-1 text-xs text-[#D92D20]">
            <li v-for="(item, idx) in detailMessages" :key="`detail-${idx}`">- {{ item }}</li>
          </ul>
          <p class="mt-3 text-xs text-[#8CA0C0]">题目 / 场景摘要</p>
          <p class="mt-1 text-sm leading-relaxed text-[#1E293B]">{{ sceneSummary }}</p>
          <p class="mt-2 text-xs text-[#8CA0C0]">主题：{{ topicLabel }} · 语气：{{ toneLabel }}</p>
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
          <ul v-if="feedbackList.length" class="mt-2 space-y-1 text-sm text-[#52627A]">
            <li v-for="(item, idx) in feedbackList" :key="`feedback-${idx}`">- {{ item }}</li>
          </ul>
          <p v-else class="mt-2 text-sm text-[#8CA0C0]">暂无反馈内容。</p>
        </section>

        <section class="mt-4 rounded-2xl border border-[#E8EDF5] bg-white p-4">
          <p class="text-sm font-semibold text-[#1B3A6B]">更优回答建议</p>
          <p class="mt-2 text-sm leading-relaxed text-[#52627A]">
            {{ betterExpression || "Hey, tell the main problem first, then give one simple and clear suggestion." }}
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
          <button
            type="button"
            class="w-full rounded-[11px] border border-transparent bg-[#F3F6FB] px-4 py-3 text-sm text-[#52627A]"
            @click="goRTSHome"
          >
            返回 RTS 首页
          </button>
        </section>
      </template>
    </main>
  </div>
</template>
