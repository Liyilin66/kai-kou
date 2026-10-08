import { buildDailySuggestionResponse } from "../../backend/agent/daily-suggestion-service.js";
import { AgentMemoryError, requireAgentVip } from "../../backend/agent/agent-memory-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("daily_suggestion");
  const startedAt = nowMs();

  try {
    if (req.method !== "POST") {
      return respondJson(res, 405, {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId
      });
    }

    const body = readJsonBody(req);
    const { user, supabase } = await requireAuthenticatedUser(req);
    await requireAgentVip({ supabase, user });
    const payload = await buildDailySuggestionResponse({
      supabase,
      user,
      requestId,
      force: Boolean(body?.force),
      practiceSignature: normalizeText(body?.practice_signature)
    });

    return respondJson(res, 200, {
      ...payload,
      latency_ms: elapsedMs(startedAt)
    });
  } catch (error) {
    if (error instanceof BillingRequestError && Number(error.status) === 401) {
      return respondJson(res, 401, {
        ok: false,
        message: "请先登录后再使用今日 AI 建议。",
        reason_code: "auth_failed",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (error instanceof AgentMemoryError) {
      return respondJson(res, error.status, {
        ok: false,
        message: error.message,
        reason_code: error.reason_code,
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    console.warn("[daily-suggestion] request failed", JSON.stringify({
      request_id: requestId,
      reason_code: normalizeText(error?.code || error?.name || "unexpected_error"),
      total_ms: elapsedMs(startedAt)
    }));

    return respondJson(res, 503, {
      ok: false,
      message: "今日 AI 建议暂时不可用，请稍后刷新。",
      reason_code: "daily_suggestion_unavailable",
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
