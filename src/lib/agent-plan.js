import { getApiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const AGENT_PLAN_PATH = "/api/agent/plan";
const PLAN_CLIENT_TIMEOUT_MS = 30000;

export async function loadAgentPlan() {
  return performPlanRequest({ method: "GET" });
}

export async function saveAgentPlan(planSuggestion) {
  return performPlanRequest({
    method: "POST",
    body: {
      plan_suggestion: planSuggestion
    }
  });
}

export async function deleteAgentPlan() {
  return performPlanRequest({ method: "DELETE" });
}

async function performPlanRequest({ method = "GET", body = null } = {}) {
  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      plan: null,
      message: "请先登录后再使用可执行计划。",
      reason_code: "auth_failed"
    };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
      controller.abort();
    }, PLAN_CLIENT_TIMEOUT_MS)
    : null;

  try {
    let result = await performPlanFetch({
      token,
      method,
      body,
      signal: controller?.signal
    });

    if (result.status === 401) {
      const refreshedToken = await resolveAccessToken({ forceRefresh: true });
      if (refreshedToken) {
        result = await performPlanFetch({
          token: refreshedToken,
          method,
          body,
          signal: controller?.signal
        });
      }
    }

    if (result.payload) {
      return normalizePlanPayload(result.payload, result.status);
    }

    return {
      ok: false,
      plan: null,
      message: "可执行计划暂时不可用，请稍后再试。",
      reason_code: "network_error"
    };
  } catch (error) {
    return {
      ok: false,
      plan: null,
      message: error?.name === "AbortError"
        ? "可执行计划加载超时，请稍后再试。"
        : "网络连接不太稳定，请稍后再试。",
      reason_code: error?.name === "AbortError" ? "timeout" : "network_error"
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function performPlanFetch({ token, method, body, signal }) {
  const response = await fetch(getApiUrl(AGENT_PLAN_PATH), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal
  });

  return {
    status: response.status,
    payload: await readJsonPayload(response)
  };
}

function normalizePlanPayload(payload, status = 0) {
  return {
    ok: payload?.ok !== false && Number(status) < 400,
    plan: isPlainObject(payload?.plan) ? payload.plan : null,
    plan_date: normalizeText(payload?.plan_date),
    message: normalizeText(payload?.message),
    reason_code: normalizeText(payload?.reason_code) || (Number(status) >= 400 ? "request_failed" : "ok"),
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

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
