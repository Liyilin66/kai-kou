import { BillingRequestError, getQueryParam, handleOptions, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";
import {
  AgentMemoryError,
  createNewAgentSession,
  deleteAgentChatHistory,
  deleteAgentSession,
  ensureMainAgentSession,
  fetchAgentMessages,
  getAgentSessionForUser,
  listAgentSessions,
  requireAgentVip,
  restartMainAgentSession,
  switchAgentSession
} from "../../backend/agent/agent-memory-service.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("agent_session");
  const startedAt = nowMs();

  try {
    const method = `${req.method || ""}`.toUpperCase();
    if (!["GET", "POST", "DELETE"].includes(method)) {
      return respondJson(res, 405, {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    const action = normalizeText(getQueryParam(req, "action") || "session").toLowerCase();
    const { user, supabase } = await requireAuthenticatedUser(req);
    const userId = normalizeText(user?.id);
    const { access } = await requireAgentVip({ supabase, user });

    if (method === "GET" && action === "session") {
      const session = await ensureMainAgentSession({ supabase, userId });
      return respondJson(res, 200, {
        ok: true,
        session,
        access: {
          is_vip: true,
          vip_plan: access.vipPlan || null,
          vip_expires_at: access.vipExpiresAt || null
        },
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "GET" && action === "messages") {
      const sessionId = normalizeText(getQueryParam(req, "session_id"));
      const session = await getAgentSessionForUser({ supabase, userId, sessionId });
      const messages = await fetchAgentMessages({
        supabase,
        userId,
        sessionId: session.id,
        limit: 200
      });

      return respondJson(res, 200, {
        ok: true,
        session,
        messages,
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "GET" && action === "list") {
      const sessions = await listAgentSessions({ supabase, userId, limit: 50 });
      return respondJson(res, 200, {
        ok: true,
        sessions,
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "POST" && action === "clear") {
      const session = await restartMainAgentSession({ supabase, userId });
      return respondJson(res, 200, {
        ok: true,
        session,
        messages: [],
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "POST" && action === "new") {
      const session = await createNewAgentSession({ supabase, userId });
      const sessions = await listAgentSessions({ supabase, userId, limit: 50 });
      return respondJson(res, 200, {
        ok: true,
        session,
        sessions,
        messages: [],
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "POST" && action === "switch") {
      const body = await readJsonBodySafe(req);
      const result = await switchAgentSession({
        supabase,
        userId,
        sessionId: normalizeText(body?.session_id)
      });
      const sessions = await listAgentSessions({ supabase, userId, limit: 50 });
      return respondJson(res, 200, {
        ok: true,
        session: result.session,
        messages: result.messages,
        sessions,
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "POST" && action === "delete-history") {
      const session = await deleteAgentChatHistory({ supabase, userId });
      return respondJson(res, 200, {
        ok: true,
        session,
        messages: [],
        sessions: [],
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    if (method === "DELETE" && action === "delete-session") {
      const sessionId = normalizeText(getQueryParam(req, "session_id"));
      const result = await deleteAgentSession({ supabase, userId, sessionId });
      const sessions = await listAgentSessions({ supabase, userId, limit: 50 });
      const messages = result.deleted_active
        ? []
        : await fetchAgentMessages({
          supabase,
          userId,
          sessionId: result.session.id,
          limit: 200
        });

      return respondJson(res, 200, {
        ok: true,
        deleted_session_id: result.deleted_session_id,
        session: result.session,
        messages,
        sessions,
        reason_code: "ok",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    return respondJson(res, 400, {
      ok: false,
      message: "Agent session action 不正确。",
      reason_code: "invalid_request",
      request_id: requestId,
      latency_ms: elapsedMs(startedAt)
    });
  } catch (error) {
    return respondJson(res, resolveErrorStatus(error), {
      ok: false,
      message: resolveErrorMessage(error),
      reason_code: resolveErrorReasonCode(error),
      request_id: requestId,
      latency_ms: elapsedMs(startedAt)
    });
  }
}

function resolveErrorStatus(error) {
  if (error instanceof BillingRequestError && Number(error.status) === 401) return 401;
  if (error instanceof AgentMemoryError) return error.status;
  return Number(error?.status || 500);
}

function resolveErrorReasonCode(error) {
  if (error instanceof BillingRequestError && Number(error.status) === 401) return "auth_failed";
  if (error instanceof AgentMemoryError) return error.reason_code;
  return normalizeText(error?.code || error?.reason_code) || "unexpected_error";
}

function resolveErrorMessage(error) {
  if (error instanceof BillingRequestError && Number(error.status) === 401) {
    return "请先登录后再使用 AI 私教。";
  }

  if (error instanceof AgentMemoryError) {
    return error.message;
  }

  return "AI 私教会话暂时不可用，请稍后再试。";
}

function createRequestId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

async function readJsonBodySafe(req) {
  try {
    if (req.body && typeof req.body === "object") return req.body;

    let rawBody = "";
    for await (const chunk of req) {
      rawBody += chunk;
      if (rawBody.length > 16 * 1024) {
        throw new AgentMemoryError(400, "invalid_request", "\u8bf7\u6c42\u53c2\u6570\u4e0d\u6b63\u786e\u3002");
      }
    }

    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new AgentMemoryError(400, "invalid_request", "\u8bf7\u6c42\u53c2\u6570\u4e0d\u6b63\u786e\u3002");
  }
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
