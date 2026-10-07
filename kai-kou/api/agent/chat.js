import { buildAgentContext } from "../../backend/agent/build-agent-context.js";
import { buildAgentMessages } from "../../backend/agent/agent-prompt.js";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  buildPlanReplyFromSuggestion,
  createPlanSuggestionFromContext,
  ensureReplyContainsPlanTable,
  resolvePreviousPlanFromRecentMessages,
  shouldAttachPlanSuggestion
} from "../../backend/agent/agent-plan-service.js";
import {
  AgentChatServiceError,
  buildPracticeAnalysisReplyFromSummary,
  detectAgentIntent,
  getAgentTokenBudget,
  requestAgentChatCompletion,
  tryBuildFastPathAgentReply,
  shouldUsePracticeData
} from "../../backend/agent/chat-service.js";
import { loadDailyPracticeSummary } from "../../backend/agent/daily-suggestion-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { getBillingAdminClient, readBearerToken } from "../../backend/billing/supabase-admin.js";
import {
  AGENT_VIP_REQUIRED_MESSAGE,
  AgentMemoryError,
  ensureMainAgentSession,
  fetchRecentModelMessages,
  getAgentSessionForUser,
  insertAgentMessage,
  loadAgentProfile,
  resolveAgentVipAccess,
  updateAgentSessionTitleFromMessage,
  writeAgentUsageLog
} from "../../backend/agent/agent-memory-service.js";

const AGENT_AUTH_CACHE_TTL_MS = 30 * 1000;
const AGENT_VIP_CACHE_TTL_MS = 30 * 1000;
const AGENT_AUTH_CACHE_EXPIRY_SKEW_MS = 5 * 1000;
const agentAuthCache = new Map();
const agentVipCache = new Map();
const EARLY_FAST_PATH_INTENTS = new Set(["greeting", "thanks", "identity", "capability", "unrelated"]);

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("agent");
  const timing = createTimingState();
  let responseStatus = 500;
  let responsePayload = {
    ok: false,
    message: "AI 私教暂时不可用，请稍后再试。",
    reason_code: "unexpected_error",
    request_id: requestId
  };
  let intent = "";
  let usePracticeData = false;
  let context = null;
  let messages = [];
  let model = "";
  let provider = "";
  let reply = "";
  let usage = {};
  let reasonCode = "unexpected_error";
  let errorName = "";
  let errorMessageSafe = "";
  let recentMessages = [];
  let authStartedAt = 0;
  let selectedMaxTokens = 0;
  let globalMaxTokens = 0;
  let fastPathUsed = false;
  let outputChars = 0;
  let debugTiming = {};
  let planSuggestion = null;
  let previousPlan = null;
  let clientRecentMessages = [];
  let supabase = null;
  let userId = "";
  let agentSession = null;
  let shouldWriteUsageLog = false;
  let shouldPersistFailureReply = false;
  let userMessageForPersistence = "";
  let assistantMessageForPersistence = "";
  let persistenceMetadata = {};
  let responseSentBeforePersistence = false;
  let backgroundPersistenceTask = null;
  const memoryPhaseFailures = [];
  let authCacheHit = false;
  let vipCacheHit = false;

  try {
    if (req.method !== "POST") {
      responseStatus = 405;
      responsePayload = {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId
      };
      errorName = "InvalidRequest";
      errorMessageSafe = "invalid_request";
    } else {
      let body = {};
      try {
        body = readJsonBody(req);
      } catch {
        responseStatus = 400;
        responsePayload = {
          ok: false,
          message: "请输入你想问的问题。",
          reason_code: "invalid_request",
          request_id: requestId
        };
        errorName = "InvalidRequest";
        errorMessageSafe = "invalid_request";
      }

      if (responseStatus !== 400) {
        const message = normalizeText(body?.message);
        recentMessages = [];
        clientRecentMessages = sanitizeClientRecentMessages(body?.recent_messages);

        if (!message) {
          responseStatus = 400;
          responsePayload = {
            ok: false,
            message: "请输入你想问的问题。",
            reason_code: "invalid_request",
            request_id: requestId
          };
          errorName = "InvalidRequest";
          errorMessageSafe = "invalid_request";
        } else {
          const requestedSessionId = normalizeText(body?.session_id);
          const requestPracticeSignature = normalizeText(body?.practice_signature);
          const earlyIntentStartedAt = markTimingStart(timing, "intent");
          const earlyFastPathIntent = detectAgentIntent(message, { recentMessages: clientRecentMessages });
          markTimingEnd(timing, "intent", earlyIntentStartedAt, "intent_ms");

          const earlyFastPathStartedAt = markTimingStart(timing, "fast_path");
          const earlyFastPathReply = earlyFastPathIntent
            && EARLY_FAST_PATH_INTENTS.has(earlyFastPathIntent)
            ? tryBuildFastPathAgentReply({ intent: earlyFastPathIntent, message, context: null })
            : "";
          markTimingEnd(timing, "fast_path", earlyFastPathStartedAt, "fast_path_ms");

          authStartedAt = markTimingStart(timing, "auth");
          let authResult = null;
          try {
            authResult = await requireCachedAuthenticatedUser(req);
          } finally {
            markTimingEnd(timing, "auth", authStartedAt, "auth_ms");
          }
          const user = authResult.user;
          supabase = authResult.supabase;
          userId = normalizeText(user?.id);
          authCacheHit = Boolean(authResult.cacheHit);

          const vipCheckStartedAt = markTimingStart(timing, "vip_check");
          try {
            const vipResult = await requireCachedAgentVip({ supabase, user });
            vipCacheHit = Boolean(vipResult.cacheHit);
          } finally {
            markTimingEnd(timing, "vip_check", vipCheckStartedAt, "vip_check_ms");
          }

          if (earlyFastPathReply) {
            if (requestedSessionId) {
              const sessionLoadStartedAt = markTimingStart(timing, "session_load");
              try {
                agentSession = await getAgentSessionForUser({ supabase, userId, sessionId: requestedSessionId });
              } catch (sessionError) {
                recordMemoryPhaseFailure(memoryPhaseFailures, "session_load", sessionError);
                throw sessionError;
              } finally {
                markTimingEnd(timing, "session_load", sessionLoadStartedAt, "session_load_ms");
              }
              if (agentSession.session_type !== "main") {
                throw new AgentMemoryError(403, "forbidden", "无权访问这个 AI 私教会话。");
              }
            }

            intent = earlyFastPathIntent;
            previousPlan = null;
            usePracticeData = shouldUsePracticeData({ intent, message, recentMessages: clientRecentMessages });
            const tokenBudget = getAgentTokenBudget({ intent, message, recentMessages: clientRecentMessages });
            selectedMaxTokens = tokenBudget.selected_max_tokens;
            globalMaxTokens = tokenBudget.global_max_tokens;
            fastPathUsed = true;
            model = "";
            provider = "backend_fast_path";
            reply = sanitizePersistedAssistantReply(earlyFastPathReply);
            usage = {};
            debugTiming = {
              provider_request_ms: 0,
              provider_parse_ms: 0
            };
            reasonCode = "ok";
            outputChars = reply.length;
            responseStatus = 200;
            setResponseReady(timing);
            responsePayload = {
              ok: true,
              reply,
              session_id: normalizeText(agentSession?.id),
              model,
              provider,
              usage,
              reason_code: reasonCode,
              request_id: requestId,
              ...(shouldExposeDebug()
                ? {
                    debug: buildSafeDebug(context, intent, usePracticeData, clientRecentMessages, {
                      selectedMaxTokens,
                      globalMaxTokens,
                      fastPathUsed
                    })
                  }
                : {})
            };
          } else {
            const sessionLoadStartedAt = markTimingStart(timing, "session_load");
            try {
              agentSession = requestedSessionId
                ? await getAgentSessionForUser({ supabase, userId, sessionId: requestedSessionId })
                : await ensureMainAgentSession({ supabase, userId });
            } catch (sessionError) {
              recordMemoryPhaseFailure(memoryPhaseFailures, "session_load", sessionError);
              throw sessionError;
            } finally {
              markTimingEnd(timing, "session_load", sessionLoadStartedAt, "session_load_ms");
            }
            if (agentSession.session_type !== "main") {
              throw new AgentMemoryError(403, "forbidden", "无权访问这个 AI 私教会话。");
            }
            shouldWriteUsageLog = true;
            shouldPersistFailureReply = true;
            userMessageForPersistence = message;

            const recentMessagesStartedAt = markTimingStart(timing, "recent_messages_load");
            try {
              const storedRecentMessages = await fetchRecentModelMessages({
                supabase,
                userId,
                sessionId: agentSession.id,
                limit: 20
              });
              recentMessages = mergeRecentMessagesWithClientMetadata(storedRecentMessages, clientRecentMessages);
            } catch (recentMessagesError) {
              recordMemoryPhaseFailure(memoryPhaseFailures, "recent_messages_load", recentMessagesError);
              recentMessages = [];
            } finally {
              markTimingEnd(timing, "recent_messages_load", recentMessagesStartedAt, "recent_messages_load_ms");
            }

            const intentStartedAt = markTimingStart(timing, "intent");
            intent = detectAgentIntent(message, { recentMessages });
            previousPlan = intent === "regenerate_plan"
              ? resolvePreviousPlanFromRecentMessages(recentMessages)
              : null;
            usePracticeData = shouldUsePracticeData({ intent, message, recentMessages });
            const tokenBudget = getAgentTokenBudget({ intent, message, recentMessages });
            selectedMaxTokens = tokenBudget.selected_max_tokens;
            globalMaxTokens = tokenBudget.global_max_tokens;
            markTimingEnd(timing, "intent", intentStartedAt, "intent_ms");

            let localReplyProvider = "";
            let fastPathReply = tryBuildFastPathAgentReply({ intent, message, context: null });
            if (!fastPathReply) {
              if (shouldUseLocalPracticeSummary({ intent, message, recentMessages })) {
                const contextStartedAt = nowMs();
                const summaryStartedAt = nowMs();
                const practiceSummary = await loadDailyPracticeSummary({
                  supabase,
                  user,
                  practiceSignature: requestPracticeSignature
                });
                timing.lifetime_summary_ms = elapsedMs(summaryStartedAt);
                timing.profile_query_ms = 0;
                timing.practice_logs_query_ms = 0;
                context = buildContextFromPracticeSummary({ user, intent, summary: practiceSummary });
                timing.build_context_ms = elapsedMs(contextStartedAt);

                if (shouldAttachPlanSuggestion({ intent, message, recentMessages })) {
                  planSuggestion = createPlanSuggestionFromContext({
                    context,
                    message,
                    source: "agent_chat",
                    previousPlan,
                    requestId,
                    intent
                  });
                }

                fastPathReply = planSuggestion
                  ? buildPlanReplyFromSuggestion(planSuggestion, message, { previousPlan })
                  : tryBuildFastPathAgentReply({ intent, message, context })
                    || buildPracticeAnalysisReplyFromSummary(practiceSummary, message);
                localReplyProvider = planSuggestion ? "backend_plan_builder" : "backend_practice_summary";
              } else {
                const contextDiagnostics = { timing: {} };
                context = await buildAgentContext({
                  supabase,
                  user,
                  intent,
                  usePracticeData,
                  diagnostics: contextDiagnostics
                });
                mergeTiming(timing, contextDiagnostics.timing);

                if (shouldAttachPlanSuggestion({ intent, message, recentMessages })) {
                  planSuggestion = createPlanSuggestionFromContext({
                    context,
                    message,
                    source: "agent_chat",
                    previousPlan,
                    requestId,
                    intent
                  });
                }

                fastPathReply = planSuggestion
                  ? buildPlanReplyFromSuggestion(planSuggestion, message, { previousPlan })
                  : tryBuildFastPathAgentReply({ intent, message, context });
              }
            }

            if (fastPathReply) {
              fastPathUsed = true;
              model = "";
              provider = localReplyProvider || (planSuggestion ? "backend_plan_builder" : "backend_fast_path");
              reply = normalizeText(fastPathReply);
              usage = {};
              debugTiming = {
                provider_request_ms: 0,
                provider_parse_ms: 0
              };
            } else {
              const promptStartedAt = nowMs();
              messages = buildAgentMessages({ message, context, intent, recentMessages, previousPlan });
              timing.prompt_build_ms = elapsedMs(promptStartedAt);

              const chatResult = await requestAgentChatCompletion({
                messages,
                intent,
                recentMessages
              });
              model = normalizeText(chatResult?.model);
              provider = normalizeText(chatResult?.provider);
              reply = normalizeText(chatResult?.reply);
              if (planSuggestion) {
                reply = ensureReplyContainsPlanTable(reply, planSuggestion, message, { previousPlan });
              }
              usage = isPlainObject(chatResult?.usage) ? chatResult.usage : {};
              selectedMaxTokens = toRoundedInt(chatResult?.selected_max_tokens, selectedMaxTokens);
              globalMaxTokens = toRoundedInt(chatResult?.global_max_tokens, globalMaxTokens);
              debugTiming = isPlainObject(chatResult?.debug_timing) ? chatResult.debug_timing : {};
              mergeTiming(timing, debugTiming);
            }

            reply = sanitizePersistedAssistantReply(reply);
            assistantMessageForPersistence = reply;
            persistenceMetadata = {
              source: provider || "agent_chat",
              ...(planSuggestion
                ? {
                    plan_suggestion: planSuggestion,
                    plan_variant: planSuggestion.variant || null,
                    previous_plan_used: Boolean(previousPlan)
                  }
                : {})
            };

            reasonCode = "ok";
            outputChars = reply.length;
            responseStatus = 200;
            setResponseReady(timing);
            responsePayload = {
              ok: true,
              reply,
              session_id: agentSession.id,
              ...(planSuggestion ? { plan_suggestion: planSuggestion } : {}),
              model,
              provider,
              usage,
              reason_code: reasonCode,
              request_id: requestId,
              ...(shouldExposeDebug()
                ? {
                    debug: buildSafeDebug(context, intent, usePracticeData, recentMessages, {
                      selectedMaxTokens,
                      globalMaxTokens,
                      fastPathUsed
                    })
                  }
                : {})
            };
          }
        }
      }
    }
  } catch (error) {
    if (authStartedAt && !timing.auth_ms) {
      timing.auth_ms = elapsedMs(authStartedAt);
      timing.auth_end = new Date().toISOString();
    }

    if (error instanceof BillingRequestError && Number(error.status) === 401) {
      responseStatus = 401;
      responsePayload = {
        ok: false,
        message: "请先登录后再使用 AI 私教。",
        reason_code: "auth_failed",
        request_id: requestId
      };
      errorName = "BillingRequestError";
      errorMessageSafe = "auth_failed";
    } else if (error instanceof AgentMemoryError) {
      responseStatus = error.status;
      reasonCode = normalizeText(error.reason_code) || "agent_memory_error";
      responsePayload = {
        ok: false,
        message: error.message,
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = "AgentMemoryError";
      errorMessageSafe = reasonCode;
    } else if (error instanceof AgentChatServiceError) {
      model = normalizeText(error.model || model);
      provider = normalizeText(error.provider || provider);
      debugTiming = isPlainObject(error.debug_timing) ? error.debug_timing : {};
      mergeTiming(timing, debugTiming);

      responseStatus = error.status;
      reasonCode = normalizeText(error.reason_code) || "provider_error";
      responsePayload = {
        ok: false,
        message: error.message,
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = normalizeText(error.error_name || error.name || "AgentChatServiceError");
      errorMessageSafe = normalizeText(error.error_message_safe || error.reason_code || "provider_error");
      selectedMaxTokens = toRoundedInt(error.selected_max_tokens, selectedMaxTokens);
      globalMaxTokens = toRoundedInt(error.global_max_tokens, globalMaxTokens);
    } else {
      responseStatus = 500;
      reasonCode = "unexpected_error";
      responsePayload = {
        ok: false,
        message: "AI 私教暂时不可用，请稍后再试。",
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = normalizeText(error?.name || "Error");
      errorMessageSafe = "unexpected_error";
    }
  } finally {
    setResponseReady(timing);
    reasonCode = normalizeText(responsePayload?.reason_code || reasonCode) || "unexpected_error";
    outputChars = toRoundedInt(outputChars, reply.length);

    if (shouldWriteUsageLog && supabase && userId && agentSession?.id) {
      responseSentBeforePersistence = true;
      backgroundPersistenceTask = createBackgroundPersistenceTask({
        supabase,
        userId,
        sessionId: agentSession.id,
        requestId,
        userMessage: userMessageForPersistence,
        assistantReply: reasonCode === "ok"
          ? assistantMessageForPersistence
          : normalizeText(responsePayload?.message) || "AI 私教暂时不可用，请稍后再试。",
        shouldSaveAssistantReply: reasonCode === "ok" || shouldPersistFailureReply,
        assistantMetadata: reasonCode === "ok"
          ? persistenceMetadata
          : {
              source: "agent_chat_error",
              error_code: reasonCode || "unexpected_error",
              request_id: requestId
            },
        titleMessage: userMessageForPersistence,
        intent,
        provider,
        model,
        usage,
        latencyMs: timing.response_ready_ms || elapsedMs(timing._started_at),
        status: reasonCode === "ok" ? "ok" : "failed",
        errorCode: reasonCode === "ok" ? null : reasonCode
      });
    }

    const finalLogStartedAt = markTimingStart(timing, "final_log");
    markTimingEnd(timing, "final_log", finalLogStartedAt, "final_log_ms");
    const finalizedTiming = finalizeTiming(timing);

    logAgentRequestSummary({
      request_id: requestId,
      intent: normalizeText(intent) || null,
      usePracticeData,
      model: model || null,
      provider: provider || null,
      input_messages_count: messages.length,
      estimated_context_chars: estimateContextChars(messages),
      output_chars: outputChars,
      request_start: finalizedTiming.request_start,
      auth_start: finalizedTiming.auth_start,
      auth_end: finalizedTiming.auth_end,
      auth_ms: finalizedTiming.auth_ms,
      auth_cache_hit: authCacheHit,
      vip_check_start: finalizedTiming.vip_check_start,
      vip_check_end: finalizedTiming.vip_check_end,
      vip_check_ms: finalizedTiming.vip_check_ms,
      vip_cache_hit: vipCacheHit,
      intent_start: finalizedTiming.intent_start,
      intent_end: finalizedTiming.intent_end,
      intent_ms: finalizedTiming.intent_ms,
      fast_path_start: finalizedTiming.fast_path_start,
      fast_path_end: finalizedTiming.fast_path_end,
      fast_path_ms: finalizedTiming.fast_path_ms,
      session_load_ms: finalizedTiming.session_load_ms,
      recent_messages_load_ms: finalizedTiming.recent_messages_load_ms,
      build_context_ms: finalizedTiming.build_context_ms,
      profile_query_ms: finalizedTiming.profile_query_ms,
      practice_logs_query_ms: finalizedTiming.practice_logs_query_ms,
      lifetime_summary_ms: finalizedTiming.lifetime_summary_ms,
      prompt_build_ms: finalizedTiming.prompt_build_ms,
      provider_request_ms: finalizedTiming.provider_request_ms,
      provider_parse_ms: finalizedTiming.provider_parse_ms,
      response_ready_ms: finalizedTiming.response_ready_ms,
      memory_save_start: finalizedTiming.memory_save_start,
      memory_save_end: finalizedTiming.memory_save_end,
      memory_save_ms: finalizedTiming.memory_save_ms,
      user_message_save_ms: finalizedTiming.user_message_save_ms,
      title_update_ms: finalizedTiming.title_update_ms,
      assistant_message_save_ms: finalizedTiming.assistant_message_save_ms,
      failure_reply_save_ms: finalizedTiming.failure_reply_save_ms,
      usage_log_ms: finalizedTiming.usage_log_ms,
      background_persistence_ms: finalizedTiming.background_persistence_ms,
      response_sent_before_persistence: responseSentBeforePersistence,
      final_log_ms: finalizedTiming.final_log_ms,
      total_ms: finalizedTiming.total_ms,
      unaccounted_ms: finalizedTiming.unaccounted_ms,
      selected_max_tokens: selectedMaxTokens,
      global_max_tokens: globalMaxTokens,
      fast_path_used: fastPathUsed,
      memory_phase_failed: memoryPhaseFailures.length ? memoryPhaseFailures.join(",") : null,
      reason_code: reasonCode,
      error_name: errorName || null,
      error_message_safe: errorMessageSafe || null
    });

    responsePayload = {
      ...responsePayload,
      request_id: requestId,
      latency_ms: finalizedTiming.total_ms,
      ...(shouldExposeDebug()
        ? {
            debug_timing: buildResponseDebugTiming(finalizedTiming)
          }
        : {})
    };
  }

  const responseResult = respondJson(res, responseStatus, responsePayload);
  if (backgroundPersistenceTask) {
    scheduleBackgroundPersistence(backgroundPersistenceTask);
  }
  return responseResult;
}

function buildSafeDebug(context, intent, usePracticeData, recentMessages, extras = {}) {
  return {
    intent,
    usePracticeData,
    hasPracticeData: Boolean(context?.practice || context?.summary || context?.lifetime_summary),
    totalAttempts: Number(context?.summary?.total_attempts ?? context?.lifetime_summary?.total_attempts ?? 0),
    scoredAttempts: Number(context?.summary?.scored_attempts ?? context?.lifetime_summary?.scored_attempts ?? 0),
    overallAverageScore: context?.summary?.overall_average_score ?? context?.lifetime_summary?.overall_average_score ?? null,
    recentMessagesCount: Array.isArray(recentMessages) ? recentMessages.length : 0,
    selectedMaxTokens: toRoundedInt(extras.selectedMaxTokens, 0),
    globalMaxTokens: toRoundedInt(extras.globalMaxTokens, 0),
    fastPathUsed: Boolean(extras.fastPathUsed)
  };
}

function shouldUseLocalPracticeSummary({ intent = "", message = "", recentMessages = [] } = {}) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  if (normalizedIntent === "data_analysis" || normalizedIntent === "plan" || normalizedIntent === "regenerate_plan") return true;
  if (normalizedIntent !== "continuation") return false;

  const text = [
    normalizeText(message),
    ...(Array.isArray(recentMessages) ? recentMessages : []).map((item) => normalizeText(item?.content))
  ].join("\n");
  return /(计划|训练|安排|表格|薄弱项|弱项|复盘|分析|最近表现|今天练什么)/i.test(text);
}

function buildContextFromPracticeSummary({ user, intent, summary } = {}) {
  const averageScoreByTaskType = Object.entries(summary?.task_stats || {}).reduce((acc, [taskType, bucket]) => {
    acc[taskType] = Number.isFinite(Number(bucket?.average_score)) ? Number(bucket.average_score) : null;
    return acc;
  }, {});

  const lifetimeSummary = {
    total_attempts: toRoundedInt(summary?.total_attempts, 0),
    recent_7_days_attempts: toRoundedInt(summary?.recent_7_days_attempts, 0),
    recent_30_days_attempts: toRoundedInt(summary?.recent_30_days_attempts, 0),
    scored_attempts: Object.values(summary?.task_stats || {})
      .reduce((total, bucket) => total + toRoundedInt(bucket?.scored_attempts, 0), 0),
    overall_average_score: Number.isFinite(Number(summary?.recent_7_days_average_score))
      ? Number(summary.recent_7_days_average_score)
      : null,
    attempts_by_task_type: Object.entries(summary?.task_stats || {}).reduce((acc, [taskType, bucket]) => {
      acc[taskType] = toRoundedInt(bucket?.attempts, 0);
      return acc;
    }, {}),
    average_score_by_task_type: averageScoreByTaskType,
    latest_practice_at: normalizeText(summary?.latest_practice_at),
    practice_signature: normalizeText(summary?.practice_signature)
  };

  const weakTaskTypes = (Array.isArray(summary?.weak_top_3) ? summary.weak_top_3 : [])
    .map((item) => ({
      task_type: normalizeText(item?.task_type).toUpperCase(),
      label: normalizeText(item?.title) || normalizeText(item?.task_type).toUpperCase(),
      average_score: Number.isFinite(Number(item?.average_score)) ? Number(item.average_score) : null,
      comparable_score: Number.isFinite(Number(item?.average_score)) ? Number(item.average_score) : null,
      attempts: toRoundedInt(item?.attempts, 0),
      score_scale: "score_90"
    }))
    .filter((item) => item.task_type);

  return {
    app: {
      name: "开口",
      role: "PTE AI 私教",
      focus: "PTE 练习、备考、复盘和训练规划"
    },
    user: {
      id: normalizeText(user?.id),
      display_name: normalizeText(user?.user_metadata?.full_name || user?.email),
      is_logged_in: Boolean(user?.id),
      has_profile: false
    },
    intent: normalizeText(intent) || "data_analysis",
    context_scope: "cached_practice_summary",
    practice: {
      sample_insufficient: toRoundedInt(summary?.total_attempts, 0) < 5,
      total_recent_attempts: toRoundedInt(summary?.total_attempts, 0),
      recent_average_score_90_scale: Number.isFinite(Number(summary?.recent_7_days_average_score))
        ? Number(summary.recent_7_days_average_score)
        : null,
      weak_task_types: weakTaskTypes,
      recent_7_days_activity: [],
      current_streak_days: 0,
      latest_record: summary?.latest_practice_id
        ? {
            id: normalizeText(summary.latest_practice_id),
            task_type: normalizeText(summary.latest_task_type).toUpperCase(),
            created_at: normalizeText(summary.latest_practice_at)
          }
        : null,
      trend: {
        recent_window_attempts: toRoundedInt(summary?.recent_7_days_attempts, 0),
        direction: "unknown"
      }
    },
    summary: lifetimeSummary,
    lifetime_summary: lifetimeSummary
  };
}

function createBackgroundPersistenceTask({
  supabase,
  userId,
  sessionId,
  requestId,
  userMessage,
  assistantReply,
  shouldSaveAssistantReply = true,
  assistantMetadata = {},
  titleMessage,
  intent,
  provider,
  model,
  usage,
  latencyMs,
  status,
  errorCode
} = {}) {
  return async () => {
    const backgroundTiming = createTimingState();
    const failures = [];
    const backgroundStartedAt = markTimingStart(backgroundTiming, "background_persistence");
    const memorySaveStartedAt = markTimingStart(backgroundTiming, "memory_save");

    if (normalizeText(userMessage)) {
      const userMessageStartedAt = markTimingStart(backgroundTiming, "user_message_save");
      try {
        await insertAgentMessage({
          supabase,
          userId,
          sessionId,
          role: "user",
          content: userMessage,
          intent,
          metadata: {
            source: "agent_chat"
          }
        });
      } catch (error) {
        recordMemoryPhaseFailure(failures, "user_message_save", error);
      } finally {
        markTimingEnd(backgroundTiming, "user_message_save", userMessageStartedAt, "user_message_save_ms");
      }
    }

    if (normalizeText(titleMessage)) {
      const titleStartedAt = markTimingStart(backgroundTiming, "title_update");
      try {
        await updateAgentSessionTitleFromMessage({
          supabase,
          userId,
          sessionId,
          message: titleMessage
        });
      } catch (error) {
        recordMemoryPhaseFailure(failures, "title_update", error);
      } finally {
        markTimingEnd(backgroundTiming, "title_update", titleStartedAt, "title_update_ms");
      }
    }

    if (shouldSaveAssistantReply && normalizeText(assistantReply)) {
      const assistantStartedAt = markTimingStart(backgroundTiming, "assistant_message_save");
      try {
        await insertAgentMessage({
          supabase,
          userId,
          sessionId,
          role: "assistant",
          content: assistantReply,
          intent,
          metadata: assistantMetadata
        });
      } catch (error) {
        recordMemoryPhaseFailure(failures, "assistant_message_save", error);
      } finally {
        markTimingEnd(backgroundTiming, "assistant_message_save", assistantStartedAt, "assistant_message_save_ms");
      }
    }

    markTimingEnd(backgroundTiming, "memory_save", memorySaveStartedAt, "memory_save_ms");

    const usageStartedAt = markTimingStart(backgroundTiming, "usage_log");
    try {
      await writeAgentUsageLog({
        supabase,
        payload: {
          user_id: userId,
          session_id: sessionId,
          request_id: requestId,
          intent: normalizeText(intent) || null,
          provider_used: provider || null,
          model: model || null,
          input_tokens: usage?.prompt_tokens,
          output_tokens: usage?.completion_tokens,
          latency_ms: latencyMs,
          status: normalizeText(status) || "failed",
          error_code: normalizeText(errorCode) || null
        }
      });
    } catch (error) {
      recordMemoryPhaseFailure(failures, "usage_log_save", error);
    } finally {
      markTimingEnd(backgroundTiming, "usage_log", usageStartedAt, "usage_log_ms");
      markTimingEnd(backgroundTiming, "background_persistence", backgroundStartedAt, "background_persistence_ms");
    }

    logAgentBackgroundPersistenceSummary({
      request_id: requestId,
      session_id: sessionId,
      response_sent_before_persistence: true,
      background_persistence_ms: backgroundTiming.background_persistence_ms,
      memory_save_ms: backgroundTiming.memory_save_ms,
      user_message_save_ms: backgroundTiming.user_message_save_ms,
      title_update_ms: backgroundTiming.title_update_ms,
      assistant_message_save_ms: backgroundTiming.assistant_message_save_ms,
      usage_log_ms: backgroundTiming.usage_log_ms,
      memory_phase_failed: failures.length ? failures.join(",") : null
    });
  };
}

function scheduleBackgroundPersistence(task) {
  const persistencePromise = Promise.resolve()
    .then(task)
    .catch((error) => {
      try {
        console.warn("[agent/chat] background persistence failed", JSON.stringify({
          reason_code: normalizeText(error?.reason_code || error?.code || error?.name || "background_persistence_failed")
        }));
      } catch {
        // Background diagnostics must never become an unhandled rejection.
      }
    });

  const vercelWaitUntil = getVercelWaitUntil();
  if (typeof vercelWaitUntil === "function") {
    try {
      vercelWaitUntil(persistencePromise);
      return;
    } catch {
      // Local/dev runtimes may expose an incomplete request context.
    }
  }

  void persistencePromise;
}

function getVercelWaitUntil() {
  try {
    return globalThis?.[Symbol.for("@vercel/request-context")]?.get?.()?.waitUntil || null;
  } catch {
    return null;
  }
}

function sanitizeClientRecentMessages(sourceMessages) {
  return (Array.isArray(sourceMessages) ? sourceMessages : [])
    .map((item) => {
      const planSuggestion = sanitizeClientPlanSuggestion(item?.plan_suggestion || item?.planSuggestion);
      return {
        role: normalizeText(item?.role).toLowerCase(),
        content: normalizeText(item?.content).slice(0, 1000),
        ...(planSuggestion ? { metadata: { plan_suggestion: planSuggestion } } : {})
      };
    })
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-20);
}

function sanitizeClientPlanSuggestion(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items) || !value.items.length) return null;
  return {
    title: normalizeText(value.title).slice(0, 80),
    source: normalizeText(value.source).slice(0, 40),
    variant: normalizeText(value.variant).slice(0, 40),
    total_minutes: toRoundedInt(value.total_minutes, 0),
    items: value.items.slice(0, 8).map((item) => ({
      task_type: normalizeText(item?.task_type).toUpperCase().slice(0, 12),
      label: normalizeText(item?.label).slice(0, 40),
      count: toRoundedInt(item?.count, 0),
      minutes: toRoundedInt(item?.minutes, 0),
      focus: normalizeText(item?.focus).slice(0, 100),
      route: normalizeText(item?.route).slice(0, 80)
    }))
  };
}

function mergeRecentMessagesWithClientMetadata(storedMessages, clientMessages) {
  const output = (Array.isArray(storedMessages) ? storedMessages : []).map((item) => ({
    ...item,
    metadata: isPlainObject(item?.metadata) ? { ...item.metadata } : {}
  }));

  (Array.isArray(clientMessages) ? clientMessages : []).forEach((clientItem) => {
    const clientPlan = clientItem?.metadata?.plan_suggestion;
    if (!isPlainObject(clientPlan)) return;

    const match = findRecentMessageMatch(output, clientItem);
    if (match) {
      match.metadata = {
        ...(isPlainObject(match.metadata) ? match.metadata : {}),
        plan_suggestion: isPlainObject(match.metadata?.plan_suggestion) ? match.metadata.plan_suggestion : clientPlan
      };
      return;
    }

    output.push({
      role: clientItem.role,
      content: clientItem.content,
      metadata: {
        plan_suggestion: clientPlan
      }
    });
  });

  return output.slice(-20);
}

function findRecentMessageMatch(messages, candidate) {
  const candidateRole = normalizeText(candidate?.role).toLowerCase();
  const candidateContent = normalizeText(candidate?.content);
  if (!candidateRole || !candidateContent) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (normalizeText(item?.role).toLowerCase() !== candidateRole) continue;
    if (normalizeText(item?.content) !== candidateContent) continue;
    return item;
  }

  return null;
}

function createTimingState() {
  return {
    _started_at: nowMs(),
    request_start: new Date().toISOString(),
    auth_start: "",
    auth_end: "",
    auth_ms: 0,
    vip_check_start: "",
    vip_check_end: "",
    vip_check_ms: 0,
    intent_start: "",
    intent_end: "",
    intent_ms: 0,
    fast_path_start: "",
    fast_path_end: "",
    fast_path_ms: 0,
    session_load_start: "",
    session_load_end: "",
    session_load_ms: 0,
    recent_messages_load_start: "",
    recent_messages_load_end: "",
    recent_messages_load_ms: 0,
    build_context_ms: 0,
    profile_query_ms: 0,
    practice_logs_query_ms: 0,
    lifetime_summary_ms: 0,
    prompt_build_ms: 0,
    provider_request_ms: 0,
    provider_parse_ms: 0,
    response_ready_ms: 0,
    memory_save_start: "",
    memory_save_end: "",
    memory_save_ms: 0,
    user_message_save_start: "",
    user_message_save_end: "",
    user_message_save_ms: 0,
    title_update_start: "",
    title_update_end: "",
    title_update_ms: 0,
    assistant_message_save_start: "",
    assistant_message_save_end: "",
    assistant_message_save_ms: 0,
    failure_reply_save_start: "",
    failure_reply_save_end: "",
    failure_reply_save_ms: 0,
    usage_log_start: "",
    usage_log_end: "",
    usage_log_ms: 0,
    background_persistence_start: "",
    background_persistence_end: "",
    background_persistence_ms: 0,
    final_log_start: "",
    final_log_end: "",
    final_log_ms: 0,
    unaccounted_ms: 0,
    total_ms: 0
  };
}

function finalizeTiming(timing) {
  const safeTiming = {
    ...createTimingState(),
    ...(timing && typeof timing === "object" ? timing : {})
  };

  safeTiming.total_ms = elapsedMs(safeTiming._started_at);
  safeTiming.unaccounted_ms = calculateUnaccountedMs(safeTiming);
  delete safeTiming._started_at;
  return safeTiming;
}

function markTimingStart(timing, phase) {
  if (timing && typeof timing === "object") {
    timing[`${phase}_start`] = new Date().toISOString();
  }
  return nowMs();
}

function markTimingEnd(timing, phase, startedAt, msKey = `${phase}_ms`) {
  if (!timing || typeof timing !== "object") return;
  timing[`${phase}_end`] = new Date().toISOString();
  timing[msKey] = elapsedMs(startedAt);
}

function setResponseReady(timing) {
  if (!timing || typeof timing !== "object" || timing.response_ready_ms) return;
  timing.response_ready_ms = elapsedMs(timing._started_at);
}

function calculateUnaccountedMs(timing) {
  const contextMs = toRoundedInt(timing.build_context_ms)
    || toRoundedInt(timing.profile_query_ms)
    + toRoundedInt(timing.practice_logs_query_ms)
    + toRoundedInt(timing.lifetime_summary_ms);
  const knownMs = [
    timing.auth_ms,
    timing.vip_check_ms,
    timing.intent_ms,
    timing.fast_path_ms,
    timing.session_load_ms,
    timing.recent_messages_load_ms,
    contextMs,
    timing.prompt_build_ms,
    timing.provider_request_ms,
    timing.provider_parse_ms,
    timing.user_message_save_ms,
    timing.title_update_ms,
    timing.assistant_message_save_ms,
    timing.failure_reply_save_ms,
    timing.usage_log_ms,
    timing.background_persistence_ms,
    timing.final_log_ms
  ].reduce((total, value) => total + toRoundedInt(value), 0);

  return Math.max(0, toRoundedInt(timing.total_ms) - knownMs);
}

function buildResponseDebugTiming(timing) {
  return {
    request_start: timing.request_start,
    auth_start: timing.auth_start,
    auth_end: timing.auth_end,
    auth_ms: timing.auth_ms,
    vip_check_start: timing.vip_check_start,
    vip_check_end: timing.vip_check_end,
    vip_check_ms: timing.vip_check_ms,
    intent_start: timing.intent_start,
    intent_end: timing.intent_end,
    intent_ms: timing.intent_ms,
    fast_path_start: timing.fast_path_start,
    fast_path_end: timing.fast_path_end,
    fast_path_ms: timing.fast_path_ms,
    session_load_ms: timing.session_load_ms,
    recent_messages_load_ms: timing.recent_messages_load_ms,
    build_context_ms: timing.build_context_ms,
    profile_query_ms: timing.profile_query_ms,
    practice_logs_query_ms: timing.practice_logs_query_ms,
    lifetime_summary_ms: timing.lifetime_summary_ms,
    prompt_build_ms: timing.prompt_build_ms,
    provider_request_ms: timing.provider_request_ms,
    provider_parse_ms: timing.provider_parse_ms,
    response_ready_ms: timing.response_ready_ms,
    memory_save_start: timing.memory_save_start,
    memory_save_end: timing.memory_save_end,
    memory_save_ms: timing.memory_save_ms,
    user_message_save_ms: timing.user_message_save_ms,
    title_update_ms: timing.title_update_ms,
    assistant_message_save_ms: timing.assistant_message_save_ms,
    failure_reply_save_ms: timing.failure_reply_save_ms,
    usage_log_ms: timing.usage_log_ms,
    background_persistence_ms: timing.background_persistence_ms,
    final_log_ms: timing.final_log_ms,
    total_ms: timing.total_ms,
    unaccounted_ms: timing.unaccounted_ms
  };
}

function mergeTiming(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue;
    if (!Number.isFinite(Number(value))) continue;
    target[key] = Math.max(0, Math.round(Number(value)));
  }
}

function recordMemoryPhaseFailure(target, phase, error) {
  if (!Array.isArray(target)) return;
  const normalizedPhase = normalizeText(phase);
  if (!normalizedPhase || target.includes(normalizedPhase)) return;
  target.push(normalizedPhase);

  try {
    console.warn("[agent/chat] memory phase degraded", JSON.stringify({
      phase: normalizedPhase,
      reason_code: normalizeText(error?.reason_code || error?.code || error?.name || "memory_phase_failed")
    }));
  } catch {
    // Memory diagnostics must never affect user-facing chat.
  }
}

function logAgentRequestSummary(summary) {
  try {
    console.log("[agent/chat]", JSON.stringify(summary));
  } catch {
    console.log("[agent/chat]", summary?.request_id || "unknown_request");
  }
}

function logAgentBackgroundPersistenceSummary(summary) {
  try {
    console.info("[agent/chat/background]", JSON.stringify(summary));
  } catch {
    console.info("[agent/chat/background]", summary?.request_id || "unknown_request");
  }
}

function estimateContextChars(messages) {
  return (Array.isArray(messages) ? messages : [])
    .reduce((total, item) => total + normalizeText(item?.content).length, 0);
}

function sanitizePersistedAssistantReply(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const hasSensitiveMarker = /(system prompt|developer prompt|authorization:\s*bearer|service_role|api[_ -]?key|secret|jwt|private key|practice_logs|score_json)/i.test(text);
  const hasRawContextJson = /"(practice|summary|lifetime_summary|recent_logs|score_json|feedback)"\s*:/i.test(text);
  if (!hasSensitiveMarker && !hasRawContextJson) {
    return text;
  }

  let safeText = text
    .replace(/(authorization:\s*bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/([A-Z0-9_]*(?:API_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|JWT)[A-Z0-9_]*\s*[:=]\s*)["']?[^"',}\s]+["']?/gi, "$1[redacted]")
    .replace(/"(?:practice|summary|lifetime_summary|recent_logs|score_json|feedback)"\s*:\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\]|"[^"]*")/gi, "\"agent_context\":\"[redacted]\"");

  safeText = safeText
    .split(/\r?\n/)
    .filter((line) => !/(system prompt|developer prompt|service_role|private key|authorization:\s*bearer|practice_logs)/i.test(line))
    .join("\n")
    .trim();

  return safeText || "我无法展示内部提示词、密钥或后台上下文，但可以继续根据你可见的练习结果给出建议。";
}

async function requireCachedAuthenticatedUser(req) {
  const token = readBearerToken(req);
  if (!token) {
    throw new BillingRequestError(401, "unauthorized", "Please sign in first.");
  }

  const cacheKey = hashToken(token);
  const now = Date.now();
  pruneExpiredCache(agentAuthCache, now);

  const cached = agentAuthCache.get(cacheKey);
  if (cached && cached.expiresAt > now && (!cached.tokenExpiresAt || cached.tokenExpiresAt > now + AGENT_AUTH_CACHE_EXPIRY_SKEW_MS)) {
    return {
      user: cached.user,
      token,
      supabase: cached.supabase,
      cacheHit: true
    };
  }

  const supabase = getBillingAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user || null;
  if (error || !user?.id) {
    agentAuthCache.delete(cacheKey);
    throw new BillingRequestError(401, "unauthorized", "Session expired. Please sign in again.");
  }

  const tokenExpiresAt = resolveJwtExpiresAt(token);
  const cacheExpiresAt = tokenExpiresAt
    ? Math.min(now + AGENT_AUTH_CACHE_TTL_MS, tokenExpiresAt - AGENT_AUTH_CACHE_EXPIRY_SKEW_MS)
    : now + AGENT_AUTH_CACHE_TTL_MS;

  if (cacheExpiresAt > now) {
    agentAuthCache.set(cacheKey, {
      user,
      supabase,
      tokenExpiresAt,
      expiresAt: cacheExpiresAt
    });
  }

  return {
    user,
    token,
    supabase,
    cacheHit: false
  };
}

async function requireCachedAgentVip({ supabase, user }) {
  const userId = normalizeText(user?.id);
  if (!supabase || !userId) {
    throw new AgentMemoryError(401, "auth_failed", "请先登录后再使用 AI 私教。");
  }

  const now = Date.now();
  pruneExpiredCache(agentVipCache, now);

  const cached = agentVipCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return {
      profile: cached.profile,
      access: cached.access,
      cacheHit: true
    };
  }

  const profile = await loadAgentProfile({ supabase, user });
  const access = resolveAgentVipAccess({ user, profile });

  if (!access.isVip) {
    agentVipCache.delete(userId);
    throw new AgentMemoryError(403, "vip_required", AGENT_VIP_REQUIRED_MESSAGE, {
      access_status: access.accessStatus || "not_opened"
    });
  }

  const cacheExpiresAt = resolveVipCacheExpiresAt(access, now);
  if (cacheExpiresAt > now) {
    agentVipCache.set(userId, {
      profile,
      access,
      expiresAt: cacheExpiresAt
    });
  }

  return {
    profile,
    access,
    cacheHit: false
  };
}

function resolveVipCacheExpiresAt(access, now = Date.now()) {
  const ttlExpiresAt = now + AGENT_VIP_CACHE_TTL_MS;
  const vipExpiresAt = Date.parse(normalizeText(access?.vipExpiresAt));
  if (Number.isFinite(vipExpiresAt)) {
    return Math.min(ttlExpiresAt, vipExpiresAt - AGENT_AUTH_CACHE_EXPIRY_SKEW_MS);
  }
  return ttlExpiresAt;
}

function pruneExpiredCache(cache, now = Date.now()) {
  if (!cache || typeof cache.entries !== "function") return;
  for (const [key, value] of cache.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function hashToken(token) {
  return createHash("sha256").update(`${token || ""}`).digest("hex");
}

function resolveJwtExpiresAt(token) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  return Math.round(exp * 1000);
}

function decodeJwtPayload(token) {
  try {
    const payload = `${token || ""}`.split(".")[1] || "";
    if (!payload) return null;
    const paddedPayload = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function createRequestId(prefix = "agent") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function shouldExposeDebug() {
  const nodeEnv = `${process.env.NODE_ENV || ""}`.trim().toLowerCase();
  const vercelEnv = `${process.env.VERCEL_ENV || ""}`.trim().toLowerCase();
  return nodeEnv !== "production" && vercelEnv !== "production";
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - Number(startedAt || 0)));
}

function toRoundedInt(value, fallback = 0) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric);
  }
  return Math.max(0, Math.round(Number(fallback || 0)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
