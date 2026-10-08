import {
  deleteAgentDailyPlan,
  getAgentDailyPlan,
  saveAgentDailyPlan
} from "../../backend/agent/agent-plan-service.js";
import { AgentMemoryError, requireAgentVip } from "../../backend/agent/agent-memory-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("agent_plan");
  const startedAt = nowMs();

  try {
    const method = `${req.method || ""}`.toUpperCase();
    if (!["GET", "POST", "DELETE"].includes(method)) {
      return respondJson(res, 405, {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId
      });
    }

    const { user, supabase } = await requireAuthenticatedUser(req);
    await requireAgentVip({ supabase, user });
    let payload = {};
    if (method === "POST") {
      payload = readJsonBody(req);
    }

    const result = method === "GET"
      ? await getAgentDailyPlan({ supabase, user })
      : method === "POST"
        ? await saveAgentDailyPlan({
          supabase,
          user,
          planSuggestion: payload?.plan_suggestion || payload?.plan || payload
        })
        : await deleteAgentDailyPlan({ supabase, user });

    return respondJson(res, 200, {
      ...result,
      request_id: requestId,
      latency_ms: elapsedMs(startedAt)
    });
  } catch (error) {
    if (error instanceof BillingRequestError && Number(error.status) === 401) {
      return respondJson(res, 401, {
        ok: false,
        plan: null,
        message: "请先登录后再使用可执行计划。",
        reason_code: "auth_failed",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (error instanceof AgentMemoryError) {
      return respondJson(res, error.status, {
        ok: false,
        plan: null,
        message: error.message,
        reason_code: error.reason_code,
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    console.warn("[agent/plan] request failed", JSON.stringify({
      request_id: requestId,
      reason_code: normalizeText(error?.code || error?.name || "unexpected_error"),
      total_ms: elapsedMs(startedAt)
    }));

    return respondJson(res, 200, {
      ok: false,
      plan: null,
      message: "可执行计划暂时不可用，请稍后再试。",
      reason_code: "plan_storage_error",
      request_id: requestId,
      latency_ms: elapsedMs(startedAt)
    });
  }
}

function createRequestId(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - Number(startedAt || 0)));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
