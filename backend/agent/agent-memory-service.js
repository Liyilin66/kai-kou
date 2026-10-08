import { getAccessStatus } from "../auth/access-status.js";

export const AGENT_MEMORY_NOT_READY_MESSAGE = "Agent 记忆表还没有创建，请先在 Supabase SQL Editor 执行 db/agent-memory-v1.sql。";
export const AGENT_VIP_REQUIRED_MESSAGE = "AI 私教为 VIP 专属功能。";

const MAIN_SESSION_TYPE = "main";
const ACTIVE_STATUS = "active";
const ARCHIVED_STATUS = "archived";
const DEFAULT_SESSION_TITLE = "我的 PTE AI 私教";
const MAX_CONTEXT_MESSAGES = 20;
const MAX_RESTORE_MESSAGES = 200;
const MAX_SESSION_HISTORY_ITEMS = 50;
const MAX_MESSAGE_CONTENT_LENGTH = 12000;

export class AgentMemoryError extends Error {
  constructor(status, reasonCode, message, details = {}) {
    super(message || reasonCode || "agent_memory_error");
    this.name = "AgentMemoryError";
    this.status = Number.isFinite(Number(status)) ? Number(status) : 500;
    this.reason_code = `${reasonCode || "agent_memory_error"}`.trim() || "agent_memory_error";
    this.details = details && typeof details === "object" ? details : {};
  }
}

export async function loadAgentProfile({ supabase, user }) {
  const userId = normalizeText(user?.id);
  if (!supabase || !userId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AgentMemoryError(500, "profile_load_failed", "暂时无法读取用户权限，请稍后再试。");
  }

  return data || null;
}

export function resolveAgentVipAccess({ user, profile } = {}) {
  const baseAccess = getAccessStatus(user || {}, profile || {});
  const now = new Date();
  const vipPlan = normalizeText(profile?.vip_plan).toLowerCase();
  const vipExpiresAt = parseNullableDate(profile?.vip_expires_at);
  const isLifetimeVip = vipPlan === "lifetime";
  const isDevBypass = shouldAllowDevBypass();
  const isVip = isAgentVipProfile(profile, now) || isDevBypass;

  return {
    ...baseAccess,
    isVip,
    isPremium: isVip,
    accessStatus: isVip ? "vip" : baseAccess.accessStatus,
    vipPlan: isLifetimeVip ? "lifetime" : baseAccess.vipPlan || vipPlan || "",
    vipExpiresAt: vipExpiresAt ? vipExpiresAt.toISOString() : baseAccess.vipExpiresAt || null,
    devBypass: isDevBypass
  };
}

export function isAgentVipProfile(profile, now = new Date()) {
  if (!profile || typeof profile !== "object") return false;

  const vipPlan = normalizeText(profile?.vip_plan).toLowerCase();
  const vipExpiresAt = parseNullableDate(profile?.vip_expires_at);
  const hasLegacyPremium = profile?.is_premium === true && !vipPlan && !vipExpiresAt;
  const hasLifetimeVip = vipPlan === "lifetime";
  const hasActiveExpiry = Boolean(vipExpiresAt) && vipExpiresAt.getTime() > now.getTime();

  return hasLegacyPremium || hasLifetimeVip || hasActiveExpiry;
}

export async function requireAgentVip({ supabase, user }) {
  const profile = await loadAgentProfile({ supabase, user });
  const access = resolveAgentVipAccess({ user, profile });

  if (!access.isVip) {
    throw new AgentMemoryError(403, "vip_required", AGENT_VIP_REQUIRED_MESSAGE, {
      access_status: access.accessStatus || "not_opened"
    });
  }

  return { profile, access };
}

export async function ensureMainAgentSession({ supabase, userId }) {
  const normalizedUserId = normalizeUuid(userId);
  if (!supabase || !normalizedUserId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const existing = await selectActiveMainSession(supabase, normalizedUserId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      user_id: normalizedUserId,
      title: DEFAULT_SESSION_TITLE,
      session_type: MAIN_SESSION_TYPE,
      status: ACTIVE_STATUS
    })
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .single();

  if (isUniqueViolation(error)) {
    const racedSession = await selectActiveMainSession(supabase, normalizedUserId);
    if (racedSession) return racedSession;
  }

  if (error || !data) {
    throw mapAgentStorageError(error, "agent_session_create_failed", "AI 私教会话暂时不可用，请稍后再试。");
  }

  return data;
}

export async function getAgentSessionForUser({ supabase, userId, sessionId }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = normalizeUuid(sessionId);
  if (!normalizedUserId || !normalizedSessionId) {
    throw new AgentMemoryError(400, "invalid_request", "会话参数不正确。");
  }

  const { data, error } = await supabase
    .from("agent_sessions")
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .eq("user_id", normalizedUserId)
    .eq("id", normalizedSessionId)
    .maybeSingle();

  if (error) {
    throw mapAgentStorageError(error, "agent_session_load_failed", "AI 私教会话暂时不可用，请稍后再试。");
  }

  if (!data) {
    throw new AgentMemoryError(403, "forbidden", "无权访问这个 AI 私教会话。");
  }

  return data;
}

export async function fetchAgentMessages({ supabase, userId, sessionId, limit = MAX_RESTORE_MESSAGES }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = normalizeUuid(sessionId);
  if (!normalizedUserId || !normalizedSessionId) {
    throw new AgentMemoryError(400, "invalid_request", "会话参数不正确。");
  }

  const safeLimit = clampInteger(limit, 1, MAX_RESTORE_MESSAGES);
  const { data, error } = await supabase
    .from("agent_messages")
    .select("id, session_id, user_id, role, content, intent, metadata, created_at")
    .eq("user_id", normalizedUserId)
    .eq("session_id", normalizedSessionId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw mapAgentStorageError(error, "agent_messages_load_failed", "AI 私教聊天记录暂时不可用，请稍后再试。");
  }

  return Array.isArray(data) ? data.slice().reverse() : [];
}

export async function listAgentSessions({ supabase, userId, limit = MAX_SESSION_HISTORY_ITEMS }) {
  const normalizedUserId = normalizeUuid(userId);
  if (!supabase || !normalizedUserId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const safeLimit = clampInteger(limit, 1, MAX_SESSION_HISTORY_ITEMS);
  const { data: sessions, error: sessionsError } = await supabase
    .from("agent_sessions")
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .eq("user_id", normalizedUserId)
    .eq("session_type", MAIN_SESSION_TYPE)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (sessionsError) {
    throw mapAgentStorageError(sessionsError, "agent_sessions_list_failed", "AI 私教历史对话暂时不可用，请稍后再试。");
  }

  const sessionRows = Array.isArray(sessions) ? sessions : [];
  if (!sessionRows.length) return [];

  const sessionIds = sessionRows.map((session) => session.id).filter(Boolean);
  const { data: messageRows, error: messagesError } = await supabase
    .from("agent_messages")
    .select("session_id, role, content, created_at")
    .eq("user_id", normalizedUserId)
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(1000, sessionIds.length * 20));

  if (messagesError) {
    throw mapAgentStorageError(messagesError, "agent_messages_list_failed", "AI 私教历史对话暂时不可用，请稍后再试。");
  }

  const groupedMessages = new Map();
  (Array.isArray(messageRows) ? messageRows : []).forEach((message) => {
    const sessionId = normalizeText(message?.session_id);
    if (!sessionId) return;
    if (!groupedMessages.has(sessionId)) groupedMessages.set(sessionId, []);
    groupedMessages.get(sessionId).push(message);
  });

  return sessionRows
    .map((session) => {
      const rows = groupedMessages.get(session.id) || [];
      const messageCount = rows.length;
      const lastMessage = rows[0] || null;
      return {
        id: session.id,
        title: resolveSessionDisplayTitle(session, rows),
        status: normalizeText(session.status) || ARCHIVED_STATUS,
        created_at: session.created_at || null,
        updated_at: session.updated_at || null,
        last_message_at: lastMessage?.created_at || session.updated_at || session.created_at || null,
        message_count: messageCount,
        preview: normalizeText(lastMessage?.content).slice(0, 80)
      };
    })
    .filter((session) => session.message_count > 0)
    .sort((left, right) => {
      const leftTime = Date.parse(left.last_message_at || left.updated_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.last_message_at || right.updated_at || right.created_at || "") || 0;
      return rightTime - leftTime;
    });
}

export async function fetchRecentModelMessages({ supabase, userId, sessionId, limit = MAX_CONTEXT_MESSAGES }) {
  const rows = await fetchAgentMessages({
    supabase,
    userId,
    sessionId,
    limit: clampInteger(limit, 1, MAX_CONTEXT_MESSAGES)
  });

  return rows
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content).slice(0, 1000),
      metadata: isPlainObject(item?.metadata) ? item.metadata : {}
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-MAX_CONTEXT_MESSAGES);
}

export async function insertAgentMessage({ supabase, userId, sessionId, role, content, intent = "", metadata = {} }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = await assertOwnedSessionId({ supabase, userId: normalizedUserId, sessionId });
  const normalizedRole = normalizeText(role).toLowerCase();
  const normalizedContent = normalizeText(content).slice(0, MAX_MESSAGE_CONTENT_LENGTH);

  if (!normalizedUserId || !normalizedSessionId || !["user", "assistant", "system_summary"].includes(normalizedRole) || !normalizedContent) {
    throw new AgentMemoryError(400, "invalid_request", "消息参数不正确。");
  }

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      session_id: normalizedSessionId,
      user_id: normalizedUserId,
      role: normalizedRole,
      content: normalizedContent,
      intent: normalizeText(intent) || null,
      metadata: isPlainObject(metadata) ? metadata : {}
    })
    .select("id, session_id, user_id, role, content, intent, metadata, created_at")
    .single();

  if (error || !data) {
    throw mapAgentStorageError(error, "agent_message_write_failed", "AI 私教聊天记录暂时无法保存，请稍后再试。");
  }

  await touchAgentSession({ supabase, userId: normalizedUserId, sessionId: normalizedSessionId });
  return data;
}

export async function restartMainAgentSession({ supabase, userId }) {
  const normalizedUserId = normalizeUuid(userId);
  if (!supabase || !normalizedUserId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const { error: archiveError } = await supabase
    .from("agent_sessions")
    .update({
      status: ARCHIVED_STATUS,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", normalizedUserId)
    .eq("session_type", MAIN_SESSION_TYPE)
    .eq("status", ACTIVE_STATUS);

  if (archiveError) {
    throw mapAgentStorageError(archiveError, "agent_session_archive_failed", "重新开始对话失败，请稍后再试。");
  }

  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      user_id: normalizedUserId,
      title: DEFAULT_SESSION_TITLE,
      session_type: MAIN_SESSION_TYPE,
      status: ACTIVE_STATUS
    })
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .single();

  if (error || !data) {
    throw mapAgentStorageError(error, "agent_session_create_failed", "重新开始对话失败，请稍后再试。");
  }

  return data;
}

export async function createNewAgentSession({ supabase, userId }) {
  const normalizedUserId = normalizeUuid(userId);
  if (!supabase || !normalizedUserId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const activeSession = await selectActiveMainSession(supabase, normalizedUserId);
  if (activeSession) {
    const existingMessages = await fetchAgentMessages({
      supabase,
      userId: normalizedUserId,
      sessionId: activeSession.id,
      limit: 1
    });
    if (!existingMessages.length) return activeSession;
  }

  return restartMainAgentSession({ supabase, userId: normalizedUserId });
}

export async function switchAgentSession({ supabase, userId, sessionId }) {
  const normalizedUserId = normalizeUuid(userId);
  const session = await getAgentSessionForUser({ supabase, userId: normalizedUserId, sessionId });
  if (session.session_type !== MAIN_SESSION_TYPE) {
    throw new AgentMemoryError(403, "forbidden", "无权访问这个 AI 私教会话。");
  }

  const { error: archiveError } = await supabase
    .from("agent_sessions")
    .update({
      status: ARCHIVED_STATUS,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", normalizedUserId)
    .eq("session_type", MAIN_SESSION_TYPE)
    .eq("status", ACTIVE_STATUS)
    .neq("id", session.id);

  if (archiveError) {
    throw mapAgentStorageError(archiveError, "agent_session_switch_failed", "切换历史对话失败，请稍后再试。");
  }

  const { data, error } = await supabase
    .from("agent_sessions")
    .update({
      status: ACTIVE_STATUS,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", normalizedUserId)
    .eq("id", session.id)
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .single();

  if (error || !data) {
    throw mapAgentStorageError(error, "agent_session_switch_failed", "切换历史对话失败，请稍后再试。");
  }

  const messages = await fetchAgentMessages({
    supabase,
    userId: normalizedUserId,
    sessionId: data.id,
    limit: MAX_RESTORE_MESSAGES
  });

  return { session: data, messages };
}

export async function updateAgentSessionTitleFromMessage({ supabase, userId, sessionId, message }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = await assertOwnedSessionId({ supabase, userId: normalizedUserId, sessionId });
  const title = buildSessionTitleFromMessage(message);
  if (!title) return null;

  const { data: session, error: loadError } = await supabase
    .from("agent_sessions")
    .select("id, user_id, title")
    .eq("user_id", normalizedUserId)
    .eq("id", normalizedSessionId)
    .maybeSingle();

  if (loadError) {
    throw mapAgentStorageError(loadError, "agent_session_load_failed", "AI 私教会话暂时不可用，请稍后再试。");
  }

  if (!session || !isDefaultSessionTitle(session.title)) return session || null;

  const { data, error } = await supabase
    .from("agent_sessions")
    .update({
      title,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", normalizedUserId)
    .eq("id", normalizedSessionId)
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .single();

  if (error) {
    throw mapAgentStorageError(error, "agent_session_title_update_failed", "AI 私教会话标题更新失败，请稍后再试。");
  }

  return data || null;
}

export async function deleteAgentChatHistory({ supabase, userId }) {
  const normalizedUserId = normalizeUuid(userId);
  if (!supabase || !normalizedUserId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const activeSession = await selectActiveMainSession(supabase, normalizedUserId);
  if (activeSession && activeSession.user_id !== normalizedUserId) {
    throw new AgentMemoryError(403, "forbidden", "无权删除这个 AI 私教会话。");
  }

  const { error: messagesError } = await supabase
    .from("agent_messages")
    .delete()
    .eq("user_id", normalizedUserId);

  if (messagesError) {
    throw mapAgentStorageError(messagesError, "agent_messages_delete_failed", "删除聊天记录失败，请稍后再试。");
  }

  const { error: sessionsError } = await supabase
    .from("agent_sessions")
    .delete()
    .eq("user_id", normalizedUserId);

  if (sessionsError) {
    throw mapAgentStorageError(sessionsError, "agent_sessions_delete_failed", "删除聊天记录失败，请稍后再试。");
  }

  return ensureMainAgentSession({ supabase, userId: normalizedUserId });
}

export async function deleteAgentSession({ supabase, userId, sessionId }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = normalizeUuid(sessionId);
  if (!supabase || !normalizedUserId || !normalizedSessionId) {
    throw new AgentMemoryError(400, "invalid_request", "会话参数不正确。");
  }

  const session = await getAgentSessionForUser({
    supabase,
    userId: normalizedUserId,
    sessionId: normalizedSessionId
  });
  if (session.session_type !== MAIN_SESSION_TYPE) {
    throw new AgentMemoryError(403, "forbidden", "无权删除这个 AI 私教会话。");
  }

  const { data: deletedSession, error: sessionDeleteError } = await supabase
    .from("agent_sessions")
    .delete()
    .eq("user_id", normalizedUserId)
    .eq("id", normalizedSessionId)
    .select("id")
    .single();

  if (sessionDeleteError || !deletedSession?.id) {
    throw mapAgentStorageError(sessionDeleteError, "agent_session_delete_failed", "删除聊天记录失败，请稍后再试。");
  }

  const fallbackSession = session.status === ACTIVE_STATUS
    ? await ensureMainAgentSession({ supabase, userId: normalizedUserId })
    : await selectActiveMainSession(supabase, normalizedUserId)
      || await ensureMainAgentSession({ supabase, userId: normalizedUserId });

  return {
    deleted_session_id: normalizedSessionId,
    deleted_active: session.status === ACTIVE_STATUS,
    session: fallbackSession
  };
}

export async function writeAgentUsageLog({ supabase, payload }) {
  if (!supabase || !isPlainObject(payload)) return;

  const userId = normalizeUuid(payload.user_id);
  if (!userId) return;
  const sessionId = normalizeUuid(payload.session_id)
    ? await assertOwnedSessionId({ supabase, userId, sessionId: payload.session_id })
    : null;

  const row = {
    user_id: userId,
    session_id: sessionId,
    request_id: normalizeText(payload.request_id) || null,
    intent: normalizeText(payload.intent) || null,
    provider_used: normalizeText(payload.provider_used) || null,
    model: normalizeText(payload.model) || null,
    input_tokens: toNullableInteger(payload.input_tokens),
    output_tokens: toNullableInteger(payload.output_tokens),
    latency_ms: toNullableInteger(payload.latency_ms),
    status: normalizeText(payload.status) || null,
    error_code: normalizeText(payload.error_code) || null
  };

  const { error } = await supabase
    .from("agent_usage_logs")
    .insert(row);

  if (error) {
    throw mapAgentStorageError(error, "agent_usage_log_write_failed", "usage log write failed");
  }
}

export function mapAgentStorageError(error, fallbackReasonCode = "agent_storage_error", fallbackMessage = "AI 私教暂时不可用，请稍后再试。") {
  if (isMissingAgentMemoryTable(error)) {
    return new AgentMemoryError(503, "agent_memory_not_ready", AGENT_MEMORY_NOT_READY_MESSAGE);
  }

  return new AgentMemoryError(
    Number(error?.status || 500),
    normalizeText(error?.code) || fallbackReasonCode,
    fallbackMessage
  );
}

async function selectActiveMainSession(supabase, userId) {
  const { data, error } = await supabase
    .from("agent_sessions")
    .select("id, user_id, title, session_type, status, created_at, updated_at")
    .eq("user_id", userId)
    .eq("session_type", MAIN_SESSION_TYPE)
    .eq("status", ACTIVE_STATUS)
    .maybeSingle();

  if (error) {
    throw mapAgentStorageError(error, "agent_session_load_failed", "AI 私教会话暂时不可用，请稍后再试。");
  }

  return data || null;
}

async function touchAgentSession({ supabase, userId, sessionId }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = normalizeUuid(sessionId);
  if (!supabase || !normalizedUserId || !normalizedSessionId) return;

  const { error } = await supabase
    .from("agent_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", normalizedUserId)
    .eq("id", normalizedSessionId);

  if (error) {
    throw mapAgentStorageError(error, "agent_session_touch_failed", "AI 私教会话暂时不可用，请稍后再试。");
  }
}

async function assertOwnedSessionId({ supabase, userId, sessionId }) {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedSessionId = normalizeUuid(sessionId);
  if (!normalizedUserId || !normalizedSessionId) {
    throw new AgentMemoryError(400, "invalid_request", "会话参数不正确。");
  }

  const session = await getAgentSessionForUser({
    supabase,
    userId: normalizedUserId,
    sessionId: normalizedSessionId
  });
  return session.id;
}

function resolveSessionDisplayTitle(session, messages = []) {
  const sessionTitle = normalizeText(session?.title);
  if (sessionTitle && !isDefaultSessionTitle(sessionTitle)) return sessionTitle.slice(0, 30);

  const firstUserMessage = (Array.isArray(messages) ? messages : [])
    .slice()
    .reverse()
    .find((item) => normalizeText(item?.role).toLowerCase() === "user" && normalizeText(item?.content));
  return buildSessionTitleFromMessage(firstUserMessage?.content) || sessionTitle || DEFAULT_SESSION_TITLE;
}

function buildSessionTitleFromMessage(message) {
  let text = normalizeText(message)
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/^(请|帮我|麻烦|可以|能不能|你能|我想|我要|给我|请你)+/i, "")
    .trim();

  if (!text) return "";

  const taskMatch = text.match(/\b(RA|RS|RL|WE|WFD|DI|RTS)\b/i);
  const task = taskMatch ? taskMatch[1].toUpperCase() : "";
  const keywordTitle = [
    ["弱项", "弱项分析"],
    ["训练计划", "训练计划"],
    ["今日计划", "今日计划"],
    ["可执行", "执行计划"],
    ["低分", "低分分析"],
    ["复数", "复数问题"],
    ["冠词", "冠词问题"],
    ["流畅", "流畅度训练"],
    ["发音", "发音改进"],
    ["图表", "图表描述"],
    ["模板", "模板梳理"]
  ].find(([keyword]) => text.includes(keyword));

  if (task && keywordTitle) return `${task} ${keywordTitle[1]}`.slice(0, 20);
  if (task) return `${task} 训练对话`;
  if (keywordTitle) return keywordTitle[1];

  text = text
    .replace(/[，。！？；：,.!?;:]+.*$/u, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();

  return (text || normalizeText(message)).slice(0, 20);
}

function isDefaultSessionTitle(title) {
  const normalized = normalizeText(title);
  return !normalized || normalized === DEFAULT_SESSION_TITLE || normalized === "我的 PTE AI 私教";
}

function isMissingAgentMemoryTable(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return code === "42P01"
    || code === "PGRST205"
    || code === "PGRST202"
    || (message.includes("agent_sessions") && (message.includes("does not exist") || message.includes("schema cache")))
    || (message.includes("agent_messages") && (message.includes("does not exist") || message.includes("schema cache")))
    || (message.includes("agent_usage_logs") && (message.includes("does not exist") || message.includes("schema cache")));
}

function isUniqueViolation(error) {
  return normalizeText(error?.code) === "23505";
}

function shouldAllowDevBypass() {
  const enabled = normalizeText(process.env.AGENT_DEV_ALLOW_NON_VIP).toLowerCase() === "true";
  if (!enabled) return false;

  const nodeEnv = normalizeText(process.env.NODE_ENV).toLowerCase();
  const vercelEnv = normalizeText(process.env.VERCEL_ENV).toLowerCase();
  return nodeEnv !== "production" && vercelEnv !== "production";
}

function parseNullableDate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function normalizeUuid(value) {
  const normalized = normalizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function clampInteger(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return max;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function toNullableInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return `${value}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
