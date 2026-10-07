import { getApiUrl } from "@/lib/api-url";
import { createEmptyHomeAnalytics, loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";
import { createEmptyProfilePortrait, loadProfilePortraitSnapshotForAuth } from "@/lib/profile-portrait";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const AGENT_CHAT_PATH = "/api/agent/chat";
const AGENT_DAILY_SUGGESTION_PATH = "/api/agent/daily-suggestion";
const AGENT_SESSION_PATH = "/api/agent/session";
const AGENT_CLIENT_TIMEOUT_MS = 45000;
const MAX_RECENT_MESSAGES = 10;
const MAX_RECENT_MESSAGE_CONTENT_LENGTH = 1000;
const TASK_LABELS = {
  RA: "RA",
  RS: "RS",
  RL: "RL",
  WE: "WE",
  WFD: "WFD",
  DI: "DI",
  RTS: "RTS"
};

export async function sendAgentMessage(message, conversationId = "", recentMessages = [], options = {}) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    return {
      ok: false,
      message: "请输入你想问的问题。",
      reason_code: "invalid_request"
    };
  }

  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      message: "请先登录后再使用 AI 私教。",
      reason_code: "auth_failed"
    };
  }

  const requestPayload = {
    message: normalizedMessage,
    conversation_id: normalizeText(conversationId) || undefined,
    session_id: normalizeText(options?.sessionId || options?.session_id) || undefined,
    practice_signature: normalizeText(options?.practiceSignature || options?.practice_signature) || undefined,
    recent_messages: sanitizeRecentMessages(recentMessages)
  };

  let result = await performAgentRequest({
    token,
    payload: requestPayload
  });

  if (result.status === 401) {
    const refreshedToken = await resolveAccessToken({ forceRefresh: true });
    if (refreshedToken && refreshedToken !== token) {
      result = await performAgentRequest({
        token: refreshedToken,
        payload: requestPayload
      });
    }
  }

  if (result.networkError) {
    return result.networkError;
  }

  if (result.payload && result.status >= 400) {
    return normalizeFailurePayload(result.payload, result.status);
  }

  if (result.payload) {
    return normalizeSuccessPayload(result.payload);
  }

  return {
    ok: false,
    message: "网络连接不太稳定，请稍后再试。",
    reason_code: "network_error"
  };
}

export async function loadAgentMainSession() {
  return performAgentSessionRequest({
    method: "GET",
    query: {
      action: "session"
    }
  });
}

export async function loadAgentSessionMessages(sessionId) {
  return performAgentSessionRequest({
    method: "GET",
    query: {
      action: "messages",
      session_id: normalizeText(sessionId)
    }
  });
}

export async function loadAgentSessionList() {
  return performAgentSessionRequest({
    method: "GET",
    query: {
      action: "list"
    }
  });
}

export async function createAgentNewSession() {
  return performAgentSessionRequest({
    method: "POST",
    query: {
      action: "new"
    }
  });
}

export async function switchAgentSession(sessionId) {
  return performAgentSessionRequest({
    method: "POST",
    query: {
      action: "switch"
    },
    payload: {
      session_id: normalizeText(sessionId)
    }
  });
}

export async function clearAgentMainSession() {
  return performAgentSessionRequest({
    method: "POST",
    query: {
      action: "clear"
    }
  });
}

export async function deleteAgentChatHistory() {
  return performAgentSessionRequest({
    method: "POST",
    query: {
      action: "delete-history"
    }
  });
}

export async function deleteAgentSession(sessionId) {
  return performAgentSessionRequest({
    method: "DELETE",
    query: {
      action: "delete-session",
      session_id: normalizeText(sessionId)
    }
  });
}

export async function requestDailyAiSuggestion({ force = false, practiceSignature = "" } = {}) {
  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      message: "请先登录后再查看今日 AI 建议。",
      reason_code: "auth_failed"
    };
  }

  const requestPayload = {
    force: Boolean(force),
    practice_signature: normalizeText(practiceSignature) || undefined
  };

  let result = await performAgentRequest({
    token,
    path: AGENT_DAILY_SUGGESTION_PATH,
    payload: requestPayload
  });

  if (result.status === 401) {
    const refreshedToken = await resolveAccessToken({ forceRefresh: true });
    if (refreshedToken && refreshedToken !== token) {
      result = await performAgentRequest({
        token: refreshedToken,
        path: AGENT_DAILY_SUGGESTION_PATH,
        payload: requestPayload
      });
    }
  }

  if (result.networkError) {
    return result.networkError;
  }

  if (result.payload && result.status >= 400) {
    return normalizeFailurePayload(result.payload, result.status);
  }

  if (result.payload) {
    return {
      ok: result.payload.ok !== false,
      suggestion: isPlainObject(result.payload.suggestion) ? result.payload.suggestion : null,
      generated_at: normalizeText(result.payload.generated_at),
      source: normalizeText(result.payload.source) || "fallback",
      practice_signature: normalizeText(result.payload.practice_signature),
      summary: isPlainObject(result.payload.summary) ? result.payload.summary : null,
      model: normalizeText(result.payload.model),
      provider: normalizeText(result.payload.provider),
      reason_code: normalizeText(result.payload.reason_code) || "ok",
      request_id: normalizeText(result.payload.request_id)
    };
  }

  return {
    ok: false,
    message: "网络连接不太稳定，请稍后再试。",
    reason_code: "network_error"
  };
}

function sanitizeRecentMessages(recentMessages) {
  return (Array.isArray(recentMessages) ? recentMessages : [])
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content).slice(0, MAX_RECENT_MESSAGE_CONTENT_LENGTH),
      plan_suggestion: sanitizeClientPlanSuggestion(item?.plan_suggestion || item?.planSuggestion)
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-MAX_RECENT_MESSAGES);
}

function sanitizeClientPlanSuggestion(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items) || !value.items.length) return null;
  return {
    title: normalizeText(value.title).slice(0, 80),
    source: normalizeText(value.source).slice(0, 40),
    variant: normalizeText(value.variant).slice(0, 40),
    total_minutes: Number.isFinite(Number(value.total_minutes)) ? Math.max(0, Math.round(Number(value.total_minutes))) : 0,
    items: value.items.slice(0, 8).map((item) => ({
      task_type: normalizeText(item?.task_type).toUpperCase().slice(0, 12),
      label: normalizeText(item?.label).slice(0, 40),
      count: Number.isFinite(Number(item?.count)) ? Math.max(0, Math.round(Number(item.count))) : 0,
      minutes: Number.isFinite(Number(item?.minutes)) ? Math.max(0, Math.round(Number(item.minutes))) : 0,
      focus: normalizeText(item?.focus).slice(0, 100),
      route: normalizeText(item?.route).slice(0, 80)
    }))
  };
}

async function performAgentRequest({ token, payload, path = AGENT_CHAT_PATH } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, AGENT_CLIENT_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(getApiUrl(path || AGENT_CHAT_PATH), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload || {}),
      signal: controller?.signal
    });

    return {
      status: Number(response.status || 0),
      payload: await readJsonPayload(response)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        networkError: {
          ok: false,
          message: "AI 私教这次思考超时了，请换个更具体的问题再试。",
          reason_code: "provider_timeout"
        }
      };
    }

    return {
      networkError: {
        ok: false,
        message: "网络连接不太稳定，请稍后再试。",
        reason_code: "network_error"
      }
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function performAgentSessionRequest({ method = "GET", query = {}, payload = null } = {}) {
  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      message: "请先登录后再使用 AI 私教。",
      reason_code: "auth_failed"
    };
  }

  let result = await performAuthorizedJsonRequest({
    token,
    method,
    path: buildPathWithQuery(AGENT_SESSION_PATH, query),
    payload
  });

  if (result.status === 401) {
    const refreshedToken = await resolveAccessToken({ forceRefresh: true });
    if (refreshedToken && refreshedToken !== token) {
      result = await performAuthorizedJsonRequest({
        token: refreshedToken,
        method,
        path: buildPathWithQuery(AGENT_SESSION_PATH, query),
        payload
      });
    }
  }

  if (result.networkError) return result.networkError;
  if (result.payload && result.status >= 400) return normalizeFailurePayload(result.payload, result.status);
  if (!result.payload) {
    return {
      ok: false,
      message: "网络连接不太稳定，请稍后再试。",
      reason_code: "network_error"
    };
  }

  return normalizeSessionPayload(result.payload);
}

async function performAuthorizedJsonRequest({ token, method = "GET", path, payload = null } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, AGENT_CLIENT_TIMEOUT_MS)
    : null;

  try {
    const normalizedMethod = normalizeText(method).toUpperCase() || "GET";
    const response = await fetch(getApiUrl(path || AGENT_SESSION_PATH), {
      method: normalizedMethod,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: normalizedMethod === "GET" ? undefined : JSON.stringify(payload || {}),
      signal: controller?.signal
    });

    return {
      status: Number(response.status || 0),
      payload: await readJsonPayload(response)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        networkError: {
          ok: false,
          message: "AI 私教连接超时，请稍后再试。",
          reason_code: "provider_timeout"
        }
      };
    }

    return {
      networkError: {
        ok: false,
        message: "网络连接不太稳定，请稍后再试。",
        reason_code: "network_error"
      }
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadAgentOverview(authStore) {
  const [homeAnalytics, profilePortrait, recentTaskSnapshot] = await Promise.all([
    loadHomeAnalyticsSnapshotForAuth(authStore).catch(() => ({
      ...createEmptyHomeAnalytics(),
      loading: false
    })),
    loadProfilePortraitSnapshotForAuth(authStore).catch(() => ({
      ...createEmptyProfilePortrait(),
      loading: false
    })),
    loadRecentTaskSnapshot(authStore).catch(() => createEmptyRecentTaskSnapshot())
  ]);

  return {
    homeAnalytics,
    profilePortrait,
    recentTaskSnapshot
  };
}

function normalizeSuccessPayload(payload) {
  return {
    ok: true,
    reply: normalizeText(payload?.reply),
    session_id: normalizeText(payload?.session_id),
    plan_suggestion: isPlainObject(payload?.plan_suggestion) ? payload.plan_suggestion : null,
    model: normalizeText(payload?.model),
    provider: normalizeText(payload?.provider),
    usage: isPlainObject(payload?.usage) ? payload.usage : {},
    latency_ms: Number.isFinite(Number(payload?.latency_ms)) ? Math.round(Number(payload.latency_ms)) : 0,
    reason_code: normalizeText(payload?.reason_code) || "ok",
    request_id: normalizeText(payload?.request_id)
  };
}

function normalizeSessionPayload(payload) {
  return {
    ok: payload?.ok !== false,
    session: isPlainObject(payload?.session) ? payload.session : null,
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    sessions: Array.isArray(payload?.sessions) ? payload.sessions : [],
    access: isPlainObject(payload?.access) ? payload.access : null,
    latency_ms: Number.isFinite(Number(payload?.latency_ms)) ? Math.round(Number(payload.latency_ms)) : 0,
    reason_code: normalizeText(payload?.reason_code) || "ok",
    request_id: normalizeText(payload?.request_id),
    message: normalizeText(payload?.message)
  };
}

function normalizeFailurePayload(payload, status = 0) {
  const reasonCode = normalizeText(payload?.reason_code || payload?.error);
  if (Number(status) === 401 || reasonCode === "auth_failed") {
    return {
      ok: false,
      message: normalizeText(payload?.message) || "请先登录后再使用 AI 私教。",
      reason_code: "auth_failed",
      request_id: normalizeText(payload?.request_id)
    };
  }

  if (reasonCode === "vip_required") {
    return {
      ok: false,
      message: normalizeText(payload?.message) || "AI 私教为 VIP 专属功能。",
      reason_code: "vip_required",
      request_id: normalizeText(payload?.request_id)
    };
  }

  if (reasonCode === "agent_memory_not_ready") {
    return {
      ok: false,
      message: normalizeText(payload?.message) || "Agent 记忆表还没有创建，请先在 Supabase SQL Editor 执行 db/agent-memory-v1.sql。",
      reason_code: "agent_memory_not_ready",
      request_id: normalizeText(payload?.request_id)
    };
  }

  return {
    ok: false,
    message: normalizeText(payload?.message) || "AI 私教暂时不可用，请稍后再试。",
    reason_code: reasonCode || (Number(status) === 400 ? "invalid_request" : "provider_error"),
    request_id: normalizeText(payload?.request_id)
  };
}

async function resolveAccessToken({ forceRefresh = false } = {}) {
  const authStore = useAuthStore();

  try {
    await authStore.init();

    const storeToken = normalizeText(authStore.session?.access_token);
    if (storeToken && !forceRefresh) {
      return storeToken;
    }

    const { data, error } = await supabase.auth.getSession();
    const sessionToken = normalizeText(data?.session?.access_token);
    if (!error && sessionToken && !forceRefresh) {
      return sessionToken;
    }

    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult?.error) {
      return sessionToken || storeToken || "";
    }

    return normalizeText(refreshResult?.data?.session?.access_token) || sessionToken || storeToken || "";
  } catch {
    return "";
  }
}

async function loadRecentTaskSnapshot(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return createEmptyRecentTaskSnapshot();

  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, created_at, score_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error || !Array.isArray(data)) {
    return createEmptyRecentTaskSnapshot();
  }

  const recentRows = data
    .map((row) => ({
      taskType: normalizeTaskType(row?.task_type),
      createdAt: normalizeText(row?.created_at),
      score: resolveComparableScore(row?.task_type, row?.score_json)
    }))
    .filter((item) => item.taskType);

  const attemptsByTask = {};
  const scoredByTask = {};
  let totalComparableScore = 0;
  let totalComparableScoreCount = 0;

  recentRows.forEach((item) => {
    attemptsByTask[item.taskType] = (attemptsByTask[item.taskType] || 0) + 1;

    if (!Number.isFinite(Number(item?.score?.comparable))) return;

    if (!scoredByTask[item.taskType]) {
      scoredByTask[item.taskType] = {
        totalDisplay: 0,
        totalComparable: 0,
        count: 0
      };
    }

    scoredByTask[item.taskType].totalDisplay += Number(item.score.display || 0);
    scoredByTask[item.taskType].totalComparable += Number(item.score.comparable || 0);
    scoredByTask[item.taskType].count += 1;

    totalComparableScore += Number(item.score.comparable || 0);
    totalComparableScoreCount += 1;
  });

  const weakTask = Object.entries(scoredByTask)
    .map(([taskType, bucket]) => ({
      taskType,
      label: TASK_LABELS[taskType] || taskType,
      averageDisplay: bucket.count ? Number((bucket.totalDisplay / bucket.count).toFixed(1)) : null,
      averageComparable: bucket.count ? Number((bucket.totalComparable / bucket.count).toFixed(1)) : null
    }))
    .sort((left, right) => Number(left.averageComparable || 0) - Number(right.averageComparable || 0))[0] || null;

  const recent7DayAttempts = recentRows.filter((item) => {
    if (!item.createdAt) return false;
    const createdAt = new Date(item.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return false;
    const diffMs = Date.now() - createdAt.getTime();
    return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    recentAttempts: recentRows.length,
    recent7DayAttempts,
    averageScore: totalComparableScoreCount
      ? Number((totalComparableScore / totalComparableScoreCount).toFixed(1))
      : null,
    weakTaskType: weakTask?.taskType || "",
    weakTaskTypeLabel: weakTask?.label || "",
    weakTaskAverageDisplay: weakTask?.averageDisplay ?? null,
    latestPracticeId: normalizeText(data?.[0]?.id),
    latestPracticeAt: normalizeText(data?.[0]?.created_at),
    sampleInsufficient: recentRows.length < 5 || totalComparableScoreCount < 3
  };
}

function createEmptyRecentTaskSnapshot() {
  return {
    recentAttempts: 0,
    recent7DayAttempts: 0,
    averageScore: null,
    weakTaskType: "",
    weakTaskTypeLabel: "",
    weakTaskAverageDisplay: null,
    latestPracticeId: "",
    latestPracticeAt: "",
    sampleInsufficient: true
  };
}

function resolveComparableScore(taskType, scoreJson) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const score = parseJsonObject(scoreJson);

  if (normalizedTaskType === "WFD") {
    const accuracy = normalizePercent(score?.score)
      ?? normalizePercent(score?.overall)
      ?? resolveWfdAccuracy(score);

    if (!Number.isFinite(Number(accuracy))) return null;

    return {
      display: Number(accuracy.toFixed(1)),
      comparable: Number((10 + (accuracy / 100) * 80).toFixed(1))
    };
  }

  const candidates = [
    score?.overall_estimated,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.ai_review?.product?.overall,
    score?.ai_review?.overall,
    score?.product?.overall,
    score?.diagnostics?.display_scores?.overall,
    score?.display_scores?.overall,
    score?.scores?.overall,
    score?.overall
  ];

  for (const candidate of candidates) {
    const normalized = normalizeScore90(candidate);
    if (Number.isFinite(Number(normalized))) {
      return {
        display: normalized,
        comparable: normalized
      };
    }
  }

  return null;
}

function resolveWfdAccuracy(score) {
  const correct = Number(score?.correct);
  const total = Number(score?.total);
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return (Math.max(0, correct) / total) * 100;
}

async function resolveCurrentUserId(authStore) {
  const authUserId = normalizeText(authStore?.user?.id);
  if (authUserId) return authUserId;

  try {
    const { data } = await supabase.auth.getSession();
    return normalizeText(data?.session?.user?.id);
  } catch {
    return "";
  }
}

function parseJsonObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isPlainObject(value) ? value : {};
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function buildPathWithQuery(path, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value);
    if (normalizedKey && normalizedValue) {
      params.set(normalizedKey, normalizedValue);
    }
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return TASK_LABELS[normalized] ? normalized : "";
}

function normalizeScore90(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(Math.max(0, Math.min(90, numeric)).toFixed(1));
}

function normalizePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(Math.max(0, Math.min(100, numeric)).toFixed(1));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
