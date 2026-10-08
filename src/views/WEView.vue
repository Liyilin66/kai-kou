<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { useUIStore } from "@/stores/ui";
import { usePracticeStore } from "@/stores/practice";
import { useActivePracticeTimer } from "@/composables/useActivePracticeTimer";
import { supabase } from "@/lib/supabase";
import {
  getDefaultWETemplate,
  getRandomWEQuestion,
  getUniversalWETemplates,
  getWEOpinionSentencesByQuestionId,
  getWEOpinionSentencesGroupedByStance,
  getWEQuestionById,
  getWETemplateById
} from "@/lib/we-data";

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();
const practiceStore = usePracticeStore();
const WE_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";
const WE_AI_FALLBACK_NOTICE = "AI评阅服务暂时不可用，本次已进入降级结果。你的作文不一定存在内容不足问题，请稍后重试。";
const ACTIVE_TEMPLATE_STORAGE_KEY = "we.activeTemplateId";
const ACTIVE_OPINION_STORAGE_KEY = "we.activeOpinionId";
const DIAG_DEV_FALLBACK_PORTS = [3001, 3000];
const showDebugApiDiagnostics = import.meta.env.DEV;

const defaultQuestion = {
  id: "WE_FALLBACK",
  sourceNumberLabel: "#0",
  displayTitle: "General Essay",
  promptText:
    "Some people think online learning should replace traditional classroom teaching, while others disagree. Discuss both views and give your own opinion.",
  promptType: "agree_disagree",
  primaryTopic: "education_learning",
  difficulty: 2
};

const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });
const universalTemplates = ref(getUniversalWETemplates());
const currentTemplateId = ref(getDefaultWETemplate()?.id || universalTemplates.value[0]?.id || "");
const showTemplateSwitcher = ref(false);
const activeOpinionId = ref("");
const showRecommendedOpinions = ref(false);
const isSubmitting = ref(false);
const submitSeq = ref(0);
const activeSubmitSeq = ref(0);
const reviewState = ref("idle");
const reviewErrorMessage = ref("");
const latestReviewResult = ref(null);
const pendingResetDraft = ref(false);
const clientFetchDiagState = ref("idle");
const clientFetchDiagResult = ref(null);
const clientFetchDiagMessage = ref("");
const postProbeDiagState = ref("idle");
const postProbeDiagResult = ref(null);
const postProbeDiagMessage = ref("");

const body = ref("");
const activePracticeTimer = useActivePracticeTimer();

const wordCount = computed(() => (body.value.trim() ? body.value.trim().split(/\s+/).length : 0));
const weResult = computed(() => latestReviewResult.value);
const weStrengths = computed(() => weResult.value?.visible_summary?.strengths || []);
const weImprovements = computed(() => weResult.value?.visible_summary?.improvements || []);
const gateReasonTips = computed(() => weResult.value?.gate_reason_messages_zh || []);
const reviewFailureMeta = computed(() => weResult.value?.meta || null);
const reviewFailureRequestId = computed(() => `${reviewFailureMeta.value?.request_id || ""}`.trim());
const reviewFailureStatus = computed(() => Number(reviewFailureMeta.value?.status || 0));
const reviewFailureStatusText = computed(() => `${reviewFailureMeta.value?.statusText || ""}`.trim());
const reviewFailureErrorCode = computed(() => `${reviewFailureMeta.value?.scoreErrorCode || ""}`.trim());
const reviewFailureType = computed(() => `${reviewFailureMeta.value?.failure_type || ""}`.trim());
const reviewFailureTypeLabel = computed(() => {
  if (reviewFailureType.value === "http_error") return "HTTP error";
  if (reviewFailureType.value === "fetch_failed") return "Fetch failed";
  if (reviewFailureType.value === "timeout") return "Timeout";
  if (reviewFailureType.value === "auth_error") return "Auth error";
  return reviewFailureType.value || "unknown";
});
const reviewFailureBackendError = computed(() => `${reviewFailureMeta.value?.backend_error || ""}`.trim());
const reviewFailureBackendCode = computed(() => `${reviewFailureMeta.value?.backend_code || ""}`.trim());
const isAiFallbackGate = computed(() => {
  const reasonCodes = Array.isArray(weResult.value?.gate?.reason_codes)
    ? weResult.value.gate.reason_codes.map((item) => `${item || ""}`.trim())
    : [];
  return reasonCodes.includes(WE_AI_FALLBACK_REASON_CODE);
});
const reviewTitle = computed(() => {
  if (!weResult.value) return "AI评阅（估分）";
  if (Boolean(weResult.value?.is_ai_review_degraded) || isAiFallbackGate.value) {
    return "AI评阅（降级结果）";
  }
  if (weResult.value?.gate?.triggered) {
    return "规则判定结果（未进入完整AI评阅）";
  }
  return weResult.value?.review_label || "AI评阅（估分）";
});

const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "Easy";
  if (difficulty >= 3) return "Hard";
  return "Medium";
});

const questionTitle = computed(() => question.value?.displayTitle || defaultQuestion.displayTitle);
const questionPromptText = computed(() => question.value?.promptText || defaultQuestion.promptText);
const questionType = computed(() => question.value?.promptType || "agree_disagree");
const questionTopic = computed(() => question.value?.primaryTopic || "education_learning");
const questionNumberLabel = computed(() => question.value?.sourceNumberLabel || "#0");
const currentTemplate = computed(() => {
  const key = String(currentTemplateId.value || "").trim();
  if (!key) return null;
  return universalTemplates.value.find((item) => item.id === key) || null;
});

const recommendedOpinionGrouped = computed(() => getWEOpinionSentencesGroupedByStance(question.value?.id));
const opinionStanceBlocks = computed(() => {
  const grouped = recommendedOpinionGrouped.value;
  return [
    { key: "support", label: "Support", items: grouped.support || [] },
    { key: "against", label: "Against", items: grouped.against || [] },
    { key: "balanced", label: "Balanced", items: grouped.balanced || [] }
  ];
});
const hasRecommendedOpinions = computed(() => opinionStanceBlocks.value.some((item) => item.items.length > 0));
const recommendedOpinionCount = computed(() => opinionStanceBlocks.value.reduce((total, item) => total + item.items.length, 0));

function getPersistedTemplateId() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ACTIVE_TEMPLATE_STORAGE_KEY) || "").trim();
}

function persistTemplateId(templateId) {
  const key = String(templateId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TEMPLATE_STORAGE_KEY, key);
}

function getPersistedOpinionId() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ACTIVE_OPINION_STORAGE_KEY) || "").trim();
}

function persistOpinionId(opinionId) {
  const key = String(opinionId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_OPINION_STORAGE_KEY, key);
}

function applyTemplateFromRoute() {
  const templateIdFromRoute = String(route.query?.template || "").trim();
  const persistedTemplateId = getPersistedTemplateId();
  const candidateTemplateId = templateIdFromRoute || persistedTemplateId;

  if (candidateTemplateId && universalTemplates.value.some((item) => item.id === candidateTemplateId)) {
    currentTemplateId.value = candidateTemplateId;
    persistTemplateId(candidateTemplateId);
    return;
  }

  if (!currentTemplate.value) {
    currentTemplateId.value = universalTemplates.value[0]?.id || "";
    persistTemplateId(currentTemplateId.value);
  }
}

function applyOpinionFromRoute() {
  const opinionIdFromRoute = String(route.query?.opinion || "").trim();
  const persistedOpinionId = getPersistedOpinionId();
  const candidateOpinionId = opinionIdFromRoute || persistedOpinionId;
  if (!candidateOpinionId) {
    activeOpinionId.value = "";
    return;
  }

  const currentQuestionOpinionIds = getWEOpinionSentencesByQuestionId(question.value?.id).map((item) => item.id);
  if (currentQuestionOpinionIds.includes(candidateOpinionId)) {
    activeOpinionId.value = candidateOpinionId;
    persistOpinionId(candidateOpinionId);
    return;
  }

  activeOpinionId.value = "";
}

function applyQuestion(nextQuestion, { resetDraft = false } = {}) {
  question.value = nextQuestion || { ...defaultQuestion };
  showRecommendedOpinions.value = false;
  reviewErrorMessage.value = "";
  reviewState.value = "idle";
  latestReviewResult.value = null;
  activePracticeTimer.startSession();

  if (resetDraft) {
    body.value = "";
  }

  applyTemplateFromRoute();
  applyOpinionFromRoute();
}

function loadQuestionByRoute() {
  questionLoading.value = true;

  try {
    const routeQuestionId = String(route.params?.id || "").trim();
    const shouldResetDraft = pendingResetDraft.value || routeQuestionId.length > 0;
    if (routeQuestionId) {
      const selected = getWEQuestionById(routeQuestionId);
      if (selected) {
        applyQuestion(selected, { resetDraft: true });
        pendingResetDraft.value = false;
        return;
      }
      uiStore.showToast("Question not found. Loaded a random prompt instead.", "warning");
    }

    applyQuestion(getRandomWEQuestion(), { resetDraft: shouldResetDraft });
    pendingResetDraft.value = false;
  } finally {
    questionLoading.value = false;
  }
}

function goSelectPractice() {
  const templateId = String(currentTemplateId.value || "").trim();
  const opinionId = String(activeOpinionId.value || "").trim();
  const query = {};
  if (templateId) query.template = templateId;
  if (opinionId) query.opinion = opinionId;

  router.push({
    path: "/we/select",
    query
  });
}

function goTemplateLibrary() {
  const templateId = String(currentTemplateId.value || "").trim();
  router.push({
    path: "/we/templates",
    query: templateId ? { template: templateId } : {}
  });
}

function goOpinionLibrary() {
  const opinionId = String(activeOpinionId.value || "").trim();
  router.push({
    path: "/we/opinions",
    query: opinionId ? { opinion: opinionId } : {}
  });
}

function goHistory() {
  const questionId = String(question.value?.id || "").trim();
  router.push({
    path: "/we/history",
    query: questionId ? { question: questionId } : {}
  });
}

function toggleRecommendedOpinions() {
  showRecommendedOpinions.value = !showRecommendedOpinions.value;
}

function toggleTemplateSwitcher() {
  showTemplateSwitcher.value = !showTemplateSwitcher.value;
}

function selectTemplate(templateId) {
  const key = String(templateId || "").trim();
  if (!key) return;
  if (!universalTemplates.value.some((item) => item.id === key)) return;

  currentTemplateId.value = key;
  persistTemplateId(key);
  showTemplateSwitcher.value = false;
}

function importCurrentTemplate() {
  const key = String(currentTemplateId.value || "").trim();
  const template = getWETemplateById(key) || currentTemplate.value;
  const content = String(template?.content || "").trim();
  if (!content) {
    uiStore.showToast("Template is empty.", "warning");
    return;
  }

  if (body.value.trim()) {
    body.value = `${body.value.trim()}\n\n${content}`;
  } else {
    body.value = content;
  }

  uiStore.showToast("Template inserted into body.", "success");
}

async function copyOpinionSentence(sentence) {
  const text = String(sentence?.text || "").trim();
  if (!text) {
    uiStore.showToast("Sentence is empty.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    uiStore.showToast("Sentence copied.", "success");
  } catch (error) {
    uiStore.showToast("Copy failed. Please copy manually.", "warning");
  }
}

function insertOpinionSentence(sentence) {
  const text = String(sentence?.text || "").trim();
  if (!text) {
    uiStore.showToast("Sentence is empty.", "warning");
    return;
  }

  if (body.value.trim()) {
    body.value = `${body.value.trim()}\n\n${text}`;
  } else {
    body.value = text;
  }

  const opinionId = String(sentence?.id || "").trim();
  if (opinionId) {
    activeOpinionId.value = opinionId;
    persistOpinionId(opinionId);
  }

  uiStore.showToast("Opinion sentence inserted into body.", "success");
}

function nextQuestion() {
  if (questionLoading.value) return;

  const templateId = String(currentTemplateId.value || "").trim();
  const opinionId = String(activeOpinionId.value || "").trim();
  const query = {};
  if (templateId) query.template = templateId;
  if (opinionId) query.opinion = opinionId;

  if (route.params?.id) {
    pendingResetDraft.value = true;
    router.push({ path: "/we", query });
    return;
  }
  applyQuestion(getRandomWEQuestion(question.value?.id), { resetDraft: true });
}

async function submitEssay() {
  if (questionLoading.value) return;

  const submittedEssay = `${body.value || ""}`.trim();
  if (!submittedEssay) {
    uiStore.showToast("请先完成作文内容再提交。", "warning");
    return;
  }

  if (isSubmitting.value) return;
  const currentSubmitSeq = submitSeq.value + 1;
  submitSeq.value = currentSubmitSeq;
  activeSubmitSeq.value = currentSubmitSeq;
  isSubmitting.value = true;
  const activeTimerSnapshot = activePracticeTimer.stopSession();
  reviewState.value = "reviewing";
  reviewErrorMessage.value = "";
  latestReviewResult.value = null;
  const requestId = `we_review_${Date.now()}_${currentSubmitSeq}`;

  try {
    const scoreResult = await practiceStore.submitScore(
      "WE",
      submittedEssay,
      questionPromptText.value,
      question.value?.id || "unknown",
      {
        requestId,
        submitSeq: currentSubmitSeq,
        logAnalytics: {
          source: "computed_active_timer",
          totalActiveSec: activeTimerSnapshot.activeSec,
          breakdown: {
            active_sec: activeTimerSnapshot.activeSec,
            idle_paused_sec: activeTimerSnapshot.idlePausedSec
          }
        },
        logPracticeTimestamps: {
          startedAt: activeTimerSnapshot.startedAt,
          completedAt: activeTimerSnapshot.completedAt
        }
      }
    );

    if (currentSubmitSeq !== activeSubmitSeq.value) {
      return;
    }

    const hasRequestError = Boolean(
      !scoreResult
      || scoreResult.error
      || isClientFallbackResult(scoreResult)
      || scoreResult?.meta?.scoreErrorCode
    );
    if (hasRequestError) {
      const failureMessage = resolveReviewFailureMessage(scoreResult);
      reviewState.value = "failed";
      reviewErrorMessage.value = failureMessage;
      latestReviewResult.value = scoreResult || null;
      console.warn("[we:review] submit_failed", {
        request_id: scoreResult?.meta?.request_id || "",
        status: scoreResult?.meta?.status || 0,
        scoreErrorCode: scoreResult?.meta?.scoreErrorCode || "",
        failure_type: scoreResult?.meta?.failure_type || "",
        backend_error: scoreResult?.meta?.backend_error || "",
        backend_code: scoreResult?.meta?.backend_code || ""
      });
      uiStore.showToast(failureMessage, "warning");
      return;
    }

    reviewState.value = "done";
    latestReviewResult.value = scoreResult;
    const isAiReviewDegraded = Boolean(scoreResult?.is_ai_review_degraded) || isAiReviewUnavailableResult(scoreResult);
    if (isAiReviewDegraded) {
      uiStore.showToast(WE_AI_FALLBACK_NOTICE, "warning");
      return;
    }

    if (scoreResult?.gate?.triggered) {
      uiStore.showToast("本次结果为规则判定，未进入完整AI评阅。", "warning");
      return;
    }

    uiStore.showToast("AI评阅已完成。", "success");
  } finally {
    if (currentSubmitSeq === activeSubmitSeq.value) {
      isSubmitting.value = false;
    }
    if (!questionLoading.value) {
      activePracticeTimer.startSession();
    }
  }
}

function isAiReviewUnavailableResult(scoreResult) {
  const reasonCodes = Array.isArray(scoreResult?.gate?.reason_codes)
    ? scoreResult.gate.reason_codes.map((item) => `${item || ""}`.trim())
    : [];
  return reasonCodes.includes(WE_AI_FALLBACK_REASON_CODE);
}

function isClientFallbackResult(scoreResult) {
  const providerUsed = `${scoreResult?.provider_used || ""}`.trim();
  const errorStage = `${scoreResult?.error_stage || ""}`.trim();
  return providerUsed === "client_fallback" || errorStage === "client_fallback";
}

function resolveReviewFailureMessage(scoreResult) {
  const errorCode = `${scoreResult?.meta?.scoreErrorCode || ""}`.trim();
  if (isClientFallbackResult(scoreResult)) {
    if (
      errorCode === "SCORE_API_ROUTE_NOT_FOUND"
      || errorCode === "SCORE_API_ROUTE_NOT_FOUND_HTML"
      || errorCode === "SCORE_API_UNEXPECTED_HTML"
    ) {
      return "评阅接口路由未命中，请检查 API 端口、Vite 代理或 VITE_API_BASE 配置。";
    }

    if (errorCode === "SCORE_API_TIMEOUT") {
      return "评阅接口连接超时，请检查网络或本地 API 服务后重试。";
    }

    return "评阅接口暂时不可达（网络或路由异常），请稍后重试。";
  }

  if (!errorCode) return "本次评阅失败，请重试。";

  if (
    errorCode === "SCORE_API_ROUTE_NOT_FOUND"
    || errorCode === "SCORE_API_ROUTE_NOT_FOUND_HTML"
    || errorCode === "SCORE_API_UNEXPECTED_HTML"
  ) {
    return "评阅服务路由未命中，请检查 API 端口、Vite 代理或 VITE_API_BASE 配置。";
  }

  if (errorCode === "SCORE_API_TIMEOUT") {
    return "评阅请求超时，请稍后重试。";
  }

  if (errorCode === "AUTH_SESSION_MISSING" || errorCode === "AUTH_SESSION_EXPIRED") {
    return "登录状态已失效，请重新登录后再试。当前草稿已保留。";
  }

  if (errorCode === "SCORE_API_HTTP_ERROR" || errorCode === "SCORE_API_FAILED") {
    return "评阅服务暂时不可用，请稍后重试。";
  }

  return "本次评阅失败，请重试。";
}

function clearAll() {
  body.value = "";
  reviewErrorMessage.value = "";
  reviewState.value = "idle";
  latestReviewResult.value = null;
}

async function copyFailureRequestId() {
  const requestId = reviewFailureRequestId.value;
  if (!requestId) {
    uiStore.showToast("当前没有可复制的请求编号。", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(requestId);
    uiStore.showToast("请求编号已复制。", "success");
  } catch {
    uiStore.showToast("复制失败，请手动记录请求编号。", "warning");
  }
}

async function runClientFetchDiagnostic() {
  if (clientFetchDiagState.value === "running") return;

  const requestId = `we_diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  clientFetchDiagState.value = "running";
  clientFetchDiagResult.value = null;
  clientFetchDiagMessage.value = "";

  try {
    const {
      response,
      payload,
      envelope,
      usedUrl
    } = await requestDiagnosticWithCandidates({
      path: "/api/debug/client-fetch",
      method: "GET",
      headers: {
        "x-request-id": requestId
      }
    });

    if (!response.ok) {
      const statusText = `${response.statusText || ""}`.trim();
      const likelyProxyMismatch = Number(response.status || 0) >= 500 && !`${payload?.route || ""}`.trim();
      clientFetchDiagState.value = "failed";
      clientFetchDiagMessage.value = likelyProxyMismatch
        ? `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}（可能命中错误 API 服务）`
        : `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`;
      clientFetchDiagResult.value = {
        request_id: `${payload?.request_id || requestId}`.trim(),
        status: Number(response.status || 0),
        route: `${payload?.route || ""}`.trim(),
        ok: false,
        error: `${payload?.error || envelope?.raw_text || ""}`.trim(),
        content_type: `${envelope?.content_type || response.headers.get("content-type") || ""}`.trim(),
        used_url: `${usedUrl || ""}`.trim()
      };
      console.warn("[we:diag] client_fetch_http_failed", clientFetchDiagResult.value);
      return;
    }

    clientFetchDiagState.value = "success";
    clientFetchDiagResult.value = {
      request_id: `${payload?.request_id || requestId}`.trim(),
      status: Number(response.status || 0),
      route: `${payload?.route || ""}`.trim(),
      ok: Boolean(payload?.ok),
      timestamp: `${payload?.timestamp || ""}`.trim(),
      used_url: `${usedUrl || ""}`.trim()
    };
    console.info("[we:diag] client_fetch_ok", clientFetchDiagResult.value);
  } catch (error) {
    clientFetchDiagState.value = "failed";
    clientFetchDiagMessage.value = "Fetch failed";
    clientFetchDiagResult.value = {
      request_id: requestId,
      status: 0,
      route: "",
      ok: false,
      error: `${error?.message || "fetch_failed"}`.trim(),
      used_url: ""
    };
    console.warn("[we:diag] client_fetch_failed", clientFetchDiagResult.value);
  }
}

async function runPostProbeDiagnostic() {
  if (postProbeDiagState.value === "running") return;

  const requestId = `we_post_diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  postProbeDiagState.value = "running";
  postProbeDiagResult.value = null;
  postProbeDiagMessage.value = "";

  try {
    const sessionResult = await supabase.auth.getSession();
    const token = `${sessionResult?.data?.session?.access_token || ""}`.trim();
    const headers = {
      "Content-Type": "application/json",
      "x-request-id": requestId
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const body = {
      probe: true,
      request_id: requestId,
      source: "we-mobile-diagnosis"
    };
    const {
      response,
      payload,
      envelope,
      usedUrl
    } = await requestDiagnosticWithCandidates({
      path: "/api/debug/post-probe",
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const statusText = `${response.statusText || ""}`.trim();
      const likelyProxyMismatch = Number(response.status || 0) >= 500 && !`${payload?.route || ""}`.trim();
      postProbeDiagState.value = "failed";
      postProbeDiagMessage.value = likelyProxyMismatch
        ? `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}（可能命中错误 API 服务）`
        : `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`;
      postProbeDiagResult.value = {
        request_id: `${payload?.request_id || requestId}`.trim(),
        status: Number(response.status || 0),
        error_code: `${payload?.error || `HTTP_${response.status}`}`.trim(),
        failure_type: "HTTP error",
        error_message: `${postProbeDiagMessage.value}`.trim(),
        content_type: `${envelope?.content_type || response.headers.get("content-type") || ""}`.trim(),
        used_url: `${usedUrl || ""}`.trim()
      };
      console.warn("[we:diag] post_probe_http_failed", postProbeDiagResult.value);
      return;
    }

    postProbeDiagState.value = "success";
    postProbeDiagResult.value = {
      request_id: `${payload?.request_id || requestId}`.trim(),
      status: Number(response.status || 0),
      route: `${payload?.route || ""}`.trim(),
      has_authorization: Boolean(payload?.has_authorization),
      content_type: `${payload?.content_type || ""}`.trim(),
      body_size: Number(payload?.body_size || 0),
      used_url: `${usedUrl || ""}`.trim()
    };
    console.info("[we:diag] post_probe_ok", postProbeDiagResult.value);
  } catch (error) {
    postProbeDiagState.value = "failed";
    postProbeDiagMessage.value = "Fetch failed";
    postProbeDiagResult.value = {
      request_id: requestId,
      status: 0,
      error_code: "SCORE_API_FAILED",
      failure_type: "Fetch failed",
      error_message: `${error?.message || "fetch_failed"}`.trim(),
      used_url: ""
    };
    console.warn("[we:diag] post_probe_failed", postProbeDiagResult.value);
  }
}

async function requestDiagnosticWithCandidates({ path, method = "GET", headers = {}, body = null } = {}) {
  const candidates = buildDiagnosticCandidateUrls(path);
  let lastFetchError = null;
  let lastHttpResult = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body
      });
      const envelope = await readDiagnosticPayload(response);
      const shouldRetryNext = shouldTryNextDiagnosticCandidate(response, envelope, candidates.length);
      if (!response.ok && shouldRetryNext) {
        lastHttpResult = {
          response,
          payload: envelope?.payload || null,
          envelope,
          usedUrl: url
        };
        continue;
      }

      return {
        response,
        payload: envelope?.payload || null,
        envelope,
        usedUrl: url
      };
    } catch (error) {
      lastFetchError = error;
      if (shouldRetryDiagnosticFetchError(error, candidates.length)) {
        continue;
      }
      throw error;
    }
  }

  if (lastHttpResult) return lastHttpResult;
  if (lastFetchError) throw lastFetchError;
  throw new Error("diagnostic_request_failed");
}

function buildDiagnosticCandidateUrls(path) {
  const normalizedPath = normalizeRelativeApiPath(path);
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) return;
    const key = normalizeUrlKey(normalized);
    if (!key) return;
    if (candidates.some((item) => item.key === key)) return;
    candidates.push({ key, url: normalized });
  };

  addCandidate(normalizedPath);
  if (isRuntimeLocalOrigin()) {
    const devTarget = normalizeAbsoluteHttpUrl(import.meta.env?.VITE_DEV_API_TARGET);
    if (devTarget) addCandidate(`${trimTrailingSlash(devTarget)}${normalizedPath}`);

    const apiBase = normalizeAbsoluteHttpUrl(import.meta.env?.VITE_API_BASE);
    if (apiBase) addCandidate(`${trimTrailingSlash(apiBase)}${normalizedPath}`);

    DIAG_DEV_FALLBACK_PORTS.forEach((port) => {
      addCandidate(`http://localhost:${port}${normalizedPath}`);
    });
  }

  return candidates.map((item) => item.url);
}

function shouldTryNextDiagnosticCandidate(response, envelope, candidateCount = 1) {
  if (candidateCount <= 1) return false;
  if (response?.ok) return false;

  const status = Number(response?.status || 0);
  if (status === 404) return true;
  if (status >= 500) return true;
  return Boolean(envelope?.is_html);
}

function shouldRetryDiagnosticFetchError(error, candidateCount = 1) {
  if (candidateCount <= 1) return false;
  const name = `${error?.name || ""}`.trim().toLowerCase();
  const code = `${error?.code || ""}`.trim().toLowerCase();
  const message = `${error?.message || ""}`.trim().toLowerCase();

  if (name === "aborterror") return true;
  if (code.includes("econn") || code.includes("timedout")) return true;
  if (message.includes("fetch failed") || message.includes("network")) return true;
  return false;
}

async function readDiagnosticPayload(response) {
  const contentType = `${response?.headers?.get("content-type") || ""}`.trim().toLowerCase();
  const text = await response.text();
  const trimmed = `${text || ""}`.trim();
  if (!trimmed) {
    return {
      payload: null,
      raw_text: "",
      content_type: contentType,
      is_html: false
    };
  }

  try {
    return {
      payload: JSON.parse(trimmed),
      raw_text: trimmed.slice(0, 500),
      content_type: contentType,
      is_html: false
    };
  } catch {
    const isHtml = contentType.includes("text/html")
      || /^<!doctype html/i.test(trimmed)
      || /^<html/i.test(trimmed)
      || trimmed.includes("<html");
    return {
      payload: null,
      raw_text: trimmed.slice(0, 500),
      content_type: contentType,
      is_html: isHtml
    };
  }
}

function normalizeRelativeApiPath(path) {
  const normalized = `${path || ""}`.trim();
  if (!normalized) return "/api/debug/client-fetch";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeAbsoluteHttpUrl(value) {
  const normalized = `${value || ""}`.trim();
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function trimTrailingSlash(value) {
  return `${value || ""}`.replace(/\/+$/, "");
}

function isRuntimeLocalOrigin() {
  if (typeof window === "undefined" || !window.location?.hostname) return false;
  const host = `${window.location.hostname || ""}`.trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function normalizeUrlKey(url) {
  const normalized = `${url || ""}`.trim();
  if (!normalized) return "";
  if (normalized.startsWith("/")) return `relative:${normalized}`;

  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

watch(
  () => route.params?.id,
  () => {
    loadQuestionByRoute();
  }
);

watch(
  () => route.query?.template,
  () => {
    applyTemplateFromRoute();
  }
);

watch(
  () => route.query?.opinion,
  () => {
    applyOpinionFromRoute();
  }
);

onMounted(() => {
  loadQuestionByRoute();
});

onUnmounted(() => {
  activePracticeTimer.stopSession({ finalize: false });
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write Essay" back-to="/home" />

    <main class="mx-auto max-w-3xl px-4 py-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">Question {{ questionNumberLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <OrangeButton tone="outline" @click="goTemplateLibrary">看模板</OrangeButton>
          <OrangeButton tone="outline" @click="goOpinionLibrary">观点句</OrangeButton>
          <OrangeButton tone="outline" @click="goSelectPractice">选题练习</OrangeButton>
          <OrangeButton tone="outline" @click="goHistory">历史提交</OrangeButton>
        </div>
      </div>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <section class="mb-4 rounded-xl border-l-4 border-orange bg-white p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">{{ questionTitle }}</p>
            <span class="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">{{ difficultyLabel }}</span>
          </div>

          <p class="mb-3 text-sm leading-relaxed text-text">{{ questionPromptText }}</p>

          <div class="flex flex-wrap gap-2">
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{{ questionType }}</span>
            <span class="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{{ questionTopic }}</span>
          </div>
        </section>

        <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-navy">当前模板预览</p>
              <p class="text-xs text-muted">10 个全文通用模板（默认模板 1）</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                @click="toggleTemplateSwitcher"
              >
                切换模板
              </button>
              <button
                type="button"
                class="rounded-lg bg-orange px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                @click="importCurrentTemplate"
              >
                一键导入模板
              </button>
            </div>
          </div>

          <div v-if="currentTemplate" class="rounded-lg border border-gray-200 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-navy">{{ currentTemplate.title }}</p>
              <span class="text-xs text-muted">{{ currentTemplate.shortLabel || currentTemplate.id }}</span>
            </div>
            <pre class="overflow-auto whitespace-pre-wrap rounded-md bg-[#F8FAFC] p-3 text-xs leading-relaxed text-text">{{ currentTemplate.content }}</pre>
          </div>

          <p v-else class="text-sm text-muted">暂无可用模板。</p>

          <div v-if="showTemplateSwitcher" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              v-for="template in universalTemplates"
              :key="template.id"
              type="button"
              class="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
              :class="template.id === currentTemplateId
                ? 'border-orange bg-orange/10 text-orange'
                : 'border-gray-200 text-text hover:border-orange hover:bg-orange/5'"
              @click="selectTemplate(template.id)"
            >
              <span class="font-semibold">{{ template.shortLabel || template.title }}</span>
              <span class="ml-1 text-muted">({{ template.id }})</span>
            </button>
          </div>
        </section>

        <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">Recommended Opinion Sentences</p>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">{{ recommendedOpinionCount }} sentences</span>
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                @click="toggleRecommendedOpinions"
              >
                {{ showRecommendedOpinions ? "收起观点句" : "展开观点句" }}
              </button>
            </div>
          </div>

          <div v-if="showRecommendedOpinions">
            <div v-if="hasRecommendedOpinions" class="space-y-3">
              <div v-for="block in opinionStanceBlocks" :key="block.key" class="space-y-2">
                <div v-if="block.items.length" class="rounded-lg border border-gray-200 p-3">
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-navy">{{ block.label }}</p>
                  <div class="space-y-2">
                    <article
                      v-for="sentence in block.items"
                      :key="sentence.id"
                      class="rounded-md border p-2"
                      :class="sentence.id === activeOpinionId ? 'border-orange bg-orange/5' : 'border-gray-200'"
                    >
                      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p class="text-[11px] font-semibold text-muted">{{ sentence.subTopicLabel || sentence.subTopicKey }} · {{ sentence.id }}</p>
                        <div class="flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                            @click="copyOpinionSentence(sentence)"
                          >
                            复制
                          </button>
                          <button
                            type="button"
                            class="rounded bg-orange px-2 py-0.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                            @click="insertOpinionSentence(sentence)"
                          >
                            插入正文
                          </button>
                        </div>
                      </div>
                      <p class="text-xs leading-relaxed text-text">{{ sentence.text }}</p>
                      <p class="mt-1 text-[11px] leading-relaxed text-muted">{{ sentence.translationZh }}</p>
                    </article>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted">No recommended opinion sentences for this question yet.</p>
          </div>
          <p v-else class="text-xs text-muted">已折叠，点击“展开观点句”查看。</p>
        </section>

        <section class="rounded-xl border bg-white p-6 shadow-card">
          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="block text-sm font-medium text-text">Body</label>
              <span class="text-sm text-orange">Words: {{ wordCount }}</span>
            </div>
            <textarea
              v-model="body"
              class="min-h-[320px] w-full resize-y rounded-lg border border-[#D1D5DB] p-3 text-sm outline-none focus:border-[#9BB7E3]"
              placeholder="Write your response here..."
            />
          </div>

          <div class="mt-5 flex flex-wrap justify-end gap-3">
            <OrangeButton tone="outline" @click="nextQuestion">Next Question</OrangeButton>
            <OrangeButton tone="outline" @click="clearAll">Clear</OrangeButton>
            <OrangeButton :disabled="isSubmitting || questionLoading" @click="submitEssay">
              {{ isSubmitting ? "提交中..." : "提交评阅" }}
            </OrangeButton>
          </div>
        </section>

        <section v-if="reviewState === 'reviewing'" class="mt-4 rounded-xl border bg-white p-6 shadow-card">
          <p class="text-sm font-semibold text-navy">AI评阅（估分）进行中...</p>
          <p class="mt-2 text-sm text-muted">正在处理本次提交内容，请稍候。</p>
        </section>

        <section v-if="reviewState === 'failed' && reviewErrorMessage" class="mt-4 rounded-xl border border-red-200 bg-red-50 p-6 shadow-card">
          <p class="text-sm font-semibold text-red-600">{{ reviewErrorMessage }}</p>
          <div class="mt-3 space-y-1 text-xs text-red-700/90">
            <div class="flex flex-wrap items-center gap-2">
              <span>请求编号：{{ reviewFailureRequestId || "N/A" }}</span>
              <button
                v-if="reviewFailureRequestId"
                type="button"
                class="rounded border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-500 hover:text-red-800"
                @click="copyFailureRequestId"
              >
                复制编号
              </button>
            </div>
            <p v-if="reviewFailureStatus > 0">状态：{{ reviewFailureStatus }} <span v-if="reviewFailureStatusText">{{ reviewFailureStatusText }}</span></p>
            <p v-if="reviewFailureErrorCode">错误码：{{ reviewFailureErrorCode }}</p>
            <p v-if="reviewFailureTypeLabel">类型：{{ reviewFailureTypeLabel }}</p>
            <p v-if="reviewFailureBackendError || reviewFailureBackendCode">
              后端：{{ reviewFailureBackendError || "unknown_error" }}
              <span v-if="reviewFailureBackendCode">（code: {{ reviewFailureBackendCode }}）</span>
            </p>
          </div>

          <div v-if="showDebugApiDiagnostics" class="mt-4 rounded-lg border border-red-200 bg-white/70 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-semibold text-red-700">API连通性诊断</p>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-500 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="clientFetchDiagState === 'running'"
                  @click="runClientFetchDiagnostic"
                >
                  {{ clientFetchDiagState === "running" ? "诊断中..." : "诊断 /api/debug/client-fetch" }}
                </button>
                <button
                  type="button"
                  class="rounded border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-500 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="postProbeDiagState === 'running'"
                  @click="runPostProbeDiagnostic"
                >
                  {{ postProbeDiagState === "running" ? "诊断中..." : "诊断 /api/debug/post-probe" }}
                </button>
              </div>
            </div>

            <p class="text-[11px] text-red-700/80">
              用于确认当前手机是否能基础访问线上 API，不影响 WE 主评分流程。
            </p>

            <div v-if="clientFetchDiagState === 'success' && clientFetchDiagResult" class="mt-2 space-y-1 text-[11px] text-red-700/90">
              <p>结果：可达（status {{ clientFetchDiagResult.status }}）</p>
              <p>请求编号：{{ clientFetchDiagResult.request_id || "N/A" }}</p>
              <p>路由：{{ clientFetchDiagResult.route || "client-fetch" }}</p>
              <p v-if="clientFetchDiagResult.used_url">目标：{{ clientFetchDiagResult.used_url }}</p>
            </div>

            <div v-else-if="clientFetchDiagState === 'failed' && clientFetchDiagResult" class="mt-2 space-y-1 text-[11px] text-red-700/90">
              <p>结果：不可达 / 异常（{{ clientFetchDiagMessage || "Fetch failed" }}）</p>
              <p>请求编号：{{ clientFetchDiagResult.request_id || "N/A" }}</p>
              <p v-if="clientFetchDiagResult.status">状态：{{ clientFetchDiagResult.status }}</p>
              <p v-if="clientFetchDiagResult.error">错误：{{ clientFetchDiagResult.error }}</p>
              <p v-if="clientFetchDiagResult.content_type">Content-Type：{{ clientFetchDiagResult.content_type }}</p>
              <p v-if="clientFetchDiagResult.used_url">目标：{{ clientFetchDiagResult.used_url }}</p>
            </div>

            <div v-if="postProbeDiagState === 'success' && postProbeDiagResult" class="mt-3 space-y-1 text-[11px] text-red-700/90">
              <p>POST结果：可达（status {{ postProbeDiagResult.status }}）</p>
              <p>请求编号：{{ postProbeDiagResult.request_id || "N/A" }}</p>
              <p>路由：{{ postProbeDiagResult.route || "post-probe" }}</p>
              <p>携带授权：{{ postProbeDiagResult.has_authorization ? "true" : "false" }}</p>
              <p>Content-Type：{{ postProbeDiagResult.content_type || "N/A" }}</p>
              <p>Body大小：{{ postProbeDiagResult.body_size ?? 0 }}</p>
              <p v-if="postProbeDiagResult.used_url">目标：{{ postProbeDiagResult.used_url }}</p>
            </div>

            <div v-else-if="postProbeDiagState === 'failed' && postProbeDiagResult" class="mt-3 space-y-1 text-[11px] text-red-700/90">
              <p>POST结果：失败 / 异常</p>
              <p>错误码：{{ postProbeDiagResult.error_code || "SCORE_API_FAILED" }}</p>
              <p>类型：{{ postProbeDiagResult.failure_type || "Fetch failed" }}</p>
              <p>请求编号：{{ postProbeDiagResult.request_id || "N/A" }}</p>
              <p v-if="postProbeDiagResult.error_message">错误：{{ postProbeDiagResult.error_message }}</p>
              <p v-if="postProbeDiagResult.content_type">Content-Type：{{ postProbeDiagResult.content_type }}</p>
              <p v-if="postProbeDiagResult.used_url">目标：{{ postProbeDiagResult.used_url }}</p>
            </div>
          </div>
        </section>

        <section v-if="weResult && reviewState === 'done'" class="mt-4 rounded-xl border bg-white p-6 shadow-card">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">{{ reviewTitle }}</p>
            <p class="text-sm text-orange">
              总分：<span class="font-bold">{{ weResult.overall_estimated }}/90</span>
            </p>
          </div>

          <p class="mb-3 text-sm text-text">
            等级：<span class="font-semibold">{{ weResult.visible_summary?.level || "中等" }}</span>
          </p>

          <div class="mb-3">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-navy">优点</p>
            <ul class="list-disc space-y-1 pl-5 text-sm text-text">
              <li v-for="(item, idx) in weStrengths.slice(0, 2)" :key="`strength-${idx}`">{{ item }}</li>
            </ul>
          </div>

          <div class="mb-3">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-navy">改进建议</p>
            <ul class="list-disc space-y-1 pl-5 text-sm text-text">
              <li v-for="(item, idx) in weImprovements.slice(0, 2)" :key="`improve-${idx}`">{{ item }}</li>
            </ul>
          </div>

          <div v-if="isAiFallbackGate" class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p class="text-sm font-semibold text-blue-700">{{ WE_AI_FALLBACK_NOTICE }}</p>
          </div>

          <div v-if="weResult.gate?.triggered && gateReasonTips.length" class="mb-3 rounded-lg border border-orange/40 bg-orange/5 p-3">
            <p class="mb-1 text-xs font-semibold text-orange">规则提醒</p>
            <ul class="list-disc space-y-1 pl-5 text-sm text-text">
              <li v-for="(tip, idx) in gateReasonTips" :key="`gate-${idx}`">{{ tip }}</li>
            </ul>
          </div>

          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-navy">总评</p>
          <p class="text-sm leading-relaxed text-muted">
            {{ weResult.visible_summary?.final_comment || weResult.feedback }}
          </p>

          <p class="mt-3 text-xs text-muted">
            当前结果对应最近一次提交内容。
            <span v-if="weResult.submitted_word_count">（提交词数：{{ weResult.submitted_word_count }}）</span>
          </p>
        </section>
      </template>
    </main>
  </div>
</template>
