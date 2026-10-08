<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import {
  clearDIReviewInflight,
  ensureDIReviewForLog,
  fetchDIPracticeLog,
  finalizeDIReviewAsDegraded,
  getDIAiReviewJob,
  getDIFallbackReasonMessage,
  isDIReviewFailedFromLog,
  isDIReviewJobStalled,
  isDIReviewReadyFromLog,
  normalizeDIQuestionSnapshot,
  normalizeTextValue,
  parseDIScoreJson
} from "@/lib/di-ai-review";

const DI_ANALYZE_POLL_MS = 1800;
const DI_ANALYZE_MAX_WAIT_MS = 45000;
const DI_ANALYZE_STARTED_AT_STORAGE_PREFIX = "kai_kou_di_analyzing_started_at_";
const DI_ANALYZE_DEFAULT_STATUS = "AI 正在生成本题反馈与评分，请稍候…";

const route = useRoute();
const router = useRouter();

const logRow = ref(null);
const errorMessage = ref("");
const statusMessage = ref(DI_ANALYZE_DEFAULT_STATUS);
const startedAtMs = ref(0);
const clockNowMs = ref(Date.now());
const polling = ref(false);

let pollTimer = null;
let elapsedTimer = null;
let scoringStarted = false;
let cancelled = false;
let terminalStopped = false;

const routeLogId = computed(() => normalizeTextValue(route.query?.logId));
const routeQuestionId = computed(() => normalizeTextValue(route.query?.id || logRow.value?.question_id));
const routeStartedAt = computed(() => normalizeTextValue(route.query?.startedAt || route.query?.startedAtMs));
const routePendingSubmit = computed(() => normalizeTextValue(route.query?.pendingSubmit) === "1");
const routeSubmitFailed = computed(() => normalizeTextValue(route.query?.submitFailed) === "1");
const routeSubmitReason = computed(() => normalizeTextValue(route.query?.submitReason || route.query?.reasonCode || route.query?.reason));

const elapsedSeconds = computed(() => {
  if (!startedAtMs.value) return 0;
  return Math.max(0, Math.floor((clockNowMs.value - startedAtMs.value) / 1000));
});

const questionSnapshot = computed(() => normalizeDIQuestionSnapshot(parseDIScoreJson(logRow.value?.score_json)?.question));

const sceneSummary = computed(() => (
  questionSnapshot.value.displayTitle
  || questionSnapshot.value.topic
  || normalizeTextValue(logRow.value?.transcript)
  || "本次练习记录已保存，正在准备结果。"
));

const analyzingStatusText = computed(() => {
  const job = getDIAiReviewJob(logRow.value?.score_json);
  if (job.status === "running") return "AI 正在生成本题反馈与评分，请稍候…";
  if (job.status === "completed") return "分析即将完成，正在整理结果…";
  if (job.status === "failed") return "分析流程已结束，正在跳转结果页…";
  return statusMessage.value;
});

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function clearElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function tickElapsedClock() {
  clockNowMs.value = Date.now();
}

function startElapsedTimer() {
  clearElapsedTimer();
  tickElapsedClock();
  elapsedTimer = setInterval(() => {
    tickElapsedClock();
  }, 1000);
}

function parseStartedAtMs(value) {
  const normalized = normalizeTextValue(value);
  if (!normalized) return 0;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }

  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 0;
}

function getAnalyzeStartedAtStorageKey(logId = "") {
  const normalizedLogId = normalizeTextValue(logId);
  return normalizedLogId ? `${DI_ANALYZE_STARTED_AT_STORAGE_PREFIX}${normalizedLogId}` : "";
}

function readStartedAtFromStorage(logId = "") {
  if (typeof sessionStorage === "undefined") return 0;
  const key = getAnalyzeStartedAtStorageKey(logId);
  if (!key) return 0;
  try {
    return parseStartedAtMs(sessionStorage.getItem(key));
  } catch {
    return 0;
  }
}

function writeStartedAtToStorage(logId = "", startedAt = 0) {
  if (typeof sessionStorage === "undefined") return;
  const key = getAnalyzeStartedAtStorageKey(logId);
  if (!key || !startedAt) return;
  try {
    sessionStorage.setItem(key, String(startedAt));
  } catch {
    // no-op
  }
}

function resolveStartedAtForAnalyzing(row = null) {
  const fromRoute = parseStartedAtMs(routeStartedAt.value);
  if (fromRoute) return fromRoute;

  const logId = normalizeTextValue(row?.id || routeLogId.value);
  const fromStorage = readStartedAtFromStorage(logId);
  if (fromStorage) return fromStorage;

  const job = getDIAiReviewJob(row?.score_json);
  const fromJob = parseStartedAtMs(job.started_at || job.created_at);
  if (fromJob) return fromJob;

  const fromRow = parseStartedAtMs(row?.created_at);
  if (fromRow) return fromRow;

  return Date.now();
}

function syncStartedAtState(row = null) {
  const resolvedStartedAt = resolveStartedAtForAnalyzing(row);
  startedAtMs.value = resolvedStartedAt;
  tickElapsedClock();
  const logId = normalizeTextValue(row?.id || routeLogId.value);
  if (logId && resolvedStartedAt) {
    writeStartedAtToStorage(logId, resolvedStartedAt);
  }
}

function buildResultRouteQuery(
  logId = "",
  questionId = "",
  {
    reviewState = "",
    reviewReason = ""
  } = {}
) {
  const query = {};
  const normalizedLogId = normalizeTextValue(logId);
  const normalizedQuestionId = normalizeTextValue(questionId);
  const normalizedReviewState = normalizeTextValue(reviewState);
  const normalizedReviewReason = normalizeTextValue(reviewReason);
  if (normalizedLogId) query.logId = normalizedLogId;
  if (normalizedQuestionId) query.id = normalizedQuestionId;
  if (normalizedReviewState) query.reviewState = normalizedReviewState;
  if (normalizedReviewReason) query.reviewReason = normalizedReviewReason;
  return query;
}

function buildPracticeRouteQuery(row = null) {
  const snapshot = normalizeDIQuestionSnapshot(parseDIScoreJson(row?.score_json)?.question);
  const query = {};
  const questionId = normalizeTextValue(snapshot.id || row?.question_id || routeQuestionId.value);
  const imageType = normalizeTextValue(snapshot.imageType);
  if (questionId) query.qid = questionId;
  if (imageType) query.type = imageType;
  return query;
}

function stopPollingWithError(message = "") {
  clearPollTimer();
  terminalStopped = true;
  polling.value = false;
  if (message) {
    errorMessage.value = message;
  }
  statusMessage.value = "分析已终止，请查看结果或返回练习页。";
}

async function redirectToResult(row = null, extraQuery = {}) {
  const safeRow = row || logRow.value;
  const resolvedLogId = normalizeTextValue(safeRow?.id || routeLogId.value);
  if (!resolvedLogId || cancelled) return;
  clearPollTimer();
  clearDIReviewInflight(resolvedLogId);
  terminalStopped = true;
  await router.replace({
    path: "/di/result",
    query: buildResultRouteQuery(
      resolvedLogId,
      safeRow?.question_id || routeQuestionId.value,
      extraQuery
    )
  });
}

async function redirectToFailedResult(row = null, reasonCode = "") {
  const normalizedReasonCode = normalizeTextValue(reasonCode);
  await redirectToResult(row, {
    reviewState: "failed",
    reviewReason: normalizedReasonCode
  });
}

async function forceDegradedAndRedirect(row = null) {
  const safeRow = row || logRow.value;
  if (!safeRow) throw new Error("missing_di_log_for_degrade");
  statusMessage.value = "分析时间较长，正在整理已保存结果…";
  const finalized = await finalizeDIReviewAsDegraded({
    logRow: safeRow,
    reasonCode: "ai_review_timeout"
  });
  const latest = await fetchDIPracticeLog(finalized.logId);
  if (!latest || (!isDIReviewReadyFromLog(latest) && !isDIReviewFailedFromLog(latest))) {
    throw new Error("practice_logs_update_failed_terminal");
  }
  logRow.value = latest;
  await redirectToResult(latest);
}

async function maybeStartScoring(row = null) {
  if (scoringStarted || !row || cancelled || terminalStopped) return;
  scoringStarted = true;
  statusMessage.value = DI_ANALYZE_DEFAULT_STATUS;
  void ensureDIReviewForLog({
    logRow: row
  }).then(async (result) => {
    if (cancelled || terminalStopped) return;
    const latest = await fetchDIPracticeLog(result?.logId || row?.id).catch(() => null);
    if (latest && (isDIReviewReadyFromLog(latest) || isDIReviewFailedFromLog(latest))) {
      logRow.value = latest;
      await redirectToResult(latest);
    }
  }).catch(async (error) => {
    if (cancelled || terminalStopped) return;
    const reasonCode = normalizeTextValue(error?.raw_error_type || error?.message || "practice_logs_update_failed");
    const latest = await fetchDIPracticeLog(row?.id).catch(() => null);
    if (latest && (isDIReviewReadyFromLog(latest) || isDIReviewFailedFromLog(latest))) {
      logRow.value = latest;
      await redirectToResult(latest);
      return;
    }
    if (latest) {
      logRow.value = latest;
      await redirectToFailedResult(latest, reasonCode);
      return;
    }
    stopPollingWithError(getDIFallbackReasonMessage(reasonCode));
  });
}

async function pollOnce() {
  if (cancelled || terminalStopped) return;
  const currentLogId = routeLogId.value;
  if (!currentLogId) {
    if (routeSubmitFailed.value) {
      stopPollingWithError(getDIFallbackReasonMessage(routeSubmitReason.value || "practice_log_insert_failed"));
      return;
    }
    if (routePendingSubmit.value) {
      if (Date.now() - startedAtMs.value >= DI_ANALYZE_MAX_WAIT_MS) {
        stopPollingWithError("提交超时，请返回练习页重试。");
        return;
      }
      statusMessage.value = DI_ANALYZE_DEFAULT_STATUS;
      clearPollTimer();
      pollTimer = setTimeout(() => {
        void pollOnce();
      }, DI_ANALYZE_POLL_MS);
      return;
    }
    await router.replace({
      path: "/di",
      query: buildPracticeRouteQuery()
    });
    return;
  }

  polling.value = true;
  errorMessage.value = "";
  try {
    const row = await fetchDIPracticeLog(currentLogId);
    if (!row) {
      throw new Error("di_practice_log_not_found");
    }
    logRow.value = row;
    syncStartedAtState(row);

    if (isDIReviewReadyFromLog(row) || isDIReviewFailedFromLog(row)) {
      await redirectToResult(row);
      return;
    }

    if (isDIReviewJobStalled(row)) {
      await forceDegradedAndRedirect(row);
      return;
    }

    await maybeStartScoring(row);

    if (Date.now() - startedAtMs.value >= DI_ANALYZE_MAX_WAIT_MS) {
      await forceDegradedAndRedirect(row);
      return;
    }

    clearPollTimer();
    pollTimer = setTimeout(() => {
      void pollOnce();
    }, DI_ANALYZE_POLL_MS);
  } catch (error) {
    const reasonCode = normalizeTextValue(error?.raw_error_type || error?.message || "practice_logs_update_failed");
    if (logRow.value?.id) {
      await redirectToFailedResult(logRow.value, reasonCode);
      return;
    }
    stopPollingWithError(getDIFallbackReasonMessage(reasonCode));
  } finally {
    polling.value = false;
  }
}

async function restartChecking() {
  clearPollTimer();
  scoringStarted = false;
  terminalStopped = false;
  errorMessage.value = "";
  statusMessage.value = DI_ANALYZE_DEFAULT_STATUS;
  syncStartedAtState(logRow.value);
  await pollOnce();
}

function goBackPractice() {
  router.push({
    path: "/di",
    query: buildPracticeRouteQuery(logRow.value)
  });
}

onMounted(() => {
  cancelled = false;
  terminalStopped = false;
  startElapsedTimer();
  syncStartedAtState();
  void pollOnce();
});

watch(
  () => [route.query.logId, route.query.pendingSubmit, route.query.submitFailed, route.query.submitReason, route.query.startedAt],
  () => {
    clearPollTimer();
    clearDIReviewInflight(routeLogId.value);
    logRow.value = null;
    errorMessage.value = "";
    statusMessage.value = DI_ANALYZE_DEFAULT_STATUS;
    syncStartedAtState();
    scoringStarted = false;
    terminalStopped = false;
    void pollOnce();
  }
);

onUnmounted(() => {
  cancelled = true;
  clearPollTimer();
  clearElapsedTimer();
});
</script>

<template>
  <div class="min-h-screen bg-[#F5F7FB]">
    <NavBar title="DI 分析中" back-to="/di" />

    <main class="mx-auto flex min-h-[calc(100vh-72px)] max-w-md flex-col justify-center px-6 py-8">
      <section class="rounded-[28px] border border-[#E8EDF5] bg-white px-6 py-10 text-center shadow-[0_18px_48px_rgba(27,58,107,0.08)]">
        <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF2EB]">
          <span class="di-analyzing-spinner" />
        </div>

        <h1 class="mt-7 text-[32px] font-semibold tracking-[-0.02em] text-[#1B3A6B]">
          正在分析你的 DI 作答
        </h1>
        <p class="mt-3 text-base text-[#7A8CA5]">
          {{ analyzingStatusText }}
        </p>
        <p class="mt-2 text-xs text-[#A0AEC0]">
          已等待 {{ elapsedSeconds }} 秒
        </p>

        <div class="mt-8 rounded-2xl bg-[#F8FAFD] px-4 py-4 text-left">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#8CA0C0]">
            当前题目
          </p>
          <p class="mt-2 text-sm leading-6 text-[#445468]">
            {{ sceneSummary }}
          </p>
          <p v-if="questionSnapshot.imageType" class="mt-2 text-xs text-[#8CA0C0]">
            图型：{{ questionSnapshot.imageType }}
          </p>
        </div>

        <p v-if="errorMessage" class="mt-6 rounded-2xl border border-[#F2D6D3] bg-[#FFF7F6] px-4 py-3 text-left text-sm text-[#B42318]">
          {{ errorMessage }}
        </p>

        <div v-if="errorMessage" class="mt-6 space-y-3">
          <OrangeButton full @click="restartChecking">
            重新检查
          </OrangeButton>
          <button
            type="button"
            class="w-full rounded-[12px] border border-[#E8EDF5] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B]"
            @click="goBackPractice"
          >
            返回练习页
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.di-analyzing-spinner {
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  border: 4px solid rgba(232, 132, 90, 0.16);
  border-top-color: #e8845a;
  animation: di-analyzing-spin 1s linear infinite;
}

@keyframes di-analyzing-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
