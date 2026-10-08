import { defineStore } from "pinia";
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import { getApiUrl } from "@/lib/api-url";
import { buildPracticeAnalytics } from "@/lib/practice-analytics";
import { supabase } from "@/lib/supabase";

const RA_MIN_SCORE = 10;
const RA_MAX_SCORE = 90;
const SCORE_API_TIMEOUT_MS = 15000;
const RA_SCORE_API_TIMEOUT_MS = 45000;
const PRACTICE_AUDIO_BUCKET = "practice-audio";
const WE_RAW_MAX = 26;
const WE_REVIEW_LABEL = "AI评阅（估分）";
const WE_GATE_LEVEL = "需重写";
const WE_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";
const WE_STATUS_SCORED = "scored";
const WE_STATUS_RULE_GATED = "rule_gated";
const WE_STATUS_AI_DEGRADED = "ai_review_degraded";
const WE_AI_FALLBACK_LEVEL = "评阅降级";
const WE_AI_FALLBACK_IMPROVEMENTS = [
  "AI评阅服务暂时不可用，请稍后重试。",
  "本次为降级结果，你的作文不一定存在内容不足问题。"
];
const WE_AI_FALLBACK_FINAL_COMMENT = "AI评阅服务暂时不可用，本次已进入降级结果。你的作文不一定存在内容不足问题，请稍后重试。";
const WE_CLIENT_DEGRADED_REVIEW_LABEL = "AI评阅（客户端降级）";
const WE_CLIENT_DEGRADED_IMPROVEMENTS = [
  "当前设备与评阅服务连接不稳定，建议稍后重试。",
  "先根据结构、论据和语法自行修改，再次提交可获得更准确结果。"
];
const SCORE_API_DEV_FALLBACK_PORTS = [3000, 3001];

const TASKS = [
  {
    id: "ra",
    title: "RA - 朗读",
    subtitle: "节奏与流利度",
    description: "跟读文本，稳定语速与停连。",
    icon: "ra",
    iconBg: "bg-[#1E4A86]",
    to: "/ra"
  },
  {
    id: "rs",
    title: "RS - 复述句子",
    subtitle: "关键词抓取",
    description: "先抓关键词，再完整复述。",
    icon: "rs",
    iconBg: "bg-[#2E5EA8]",
    to: "/rs"
  },
  {
    id: "rl",
    title: "RL - 复述讲座",
    subtitle: "模板组织表达",
    description: "用稳定框架组织讲座复述。",
    icon: "rl",
    iconBg: "bg-gradient-to-br from-[#7A1DE6] to-[#BC1CFB]",
    to: "/rl"
  },
  {
    id: "rts",
    title: "RTS - 情景回应",
    subtitle: "情境沟通",
    description: "听场景并给出得体回应。",
    icon: "rts",
    iconBg: "bg-[#1B3A6B]",
    to: "/rts"
  },
  {
    id: "we",
    title: "WE - 写作",
    subtitle: "结构优先",
    description: "清晰写出引言、主体和结论。",
    icon: "we",
    iconBg: "bg-[#00AA45]",
    to: "/we"
  },
  {
    id: "wfd",
    title: "WFD - 听写句子",
    subtitle: "准确率训练",
    description: "听清句子并完整拼写。",
    icon: "wfd",
    iconBg: "bg-[#F3054E]",
    to: "/wfd"
  }
];

function createDefaultRTSSessionState() {
  return {
    phase: "listening",
    questionId: "",
    questionIndex: 1,
    totalQuestions: 0,
    prepareRemaining: 10,
    prepareTotal: 10,
    recordRemaining: 40,
    recordTotal: 40,
    listeningProgress: 0,
    listeningStatus: "idle",
    listeningLabel: "点击播放场景",
    listeningRemaining: 0,
    listeningTotal: 0,
    usedPhraseIds: []
  };
}

export const usePracticeStore = defineStore("practice", {
  state: () => ({
    tasks: TASKS,

    currentQuestion: null,
    selectedQuestion: null,
    questionContent: "",
    phase: "idle",

    transcript: "",
    audioBlob: null,
    result: null,
    wfdResult: null,

    diRecentRecordings: [],
    rtsSession: createDefaultRTSSessionState(),
    rtsRecentRecordings: []
  }),

  actions: {
    setQuestion(question) {
      this.currentQuestion = question;
      this.questionContent = question?.content || "";
      this.phase = "idle";
      this.transcript = "";
      this.audioBlob = null;
      this.result = null;
      this.wfdResult = null;
    },

    setSelectedQuestion(question) {
      this.selectedQuestion = question || null;
    },

    clearSelectedQuestion() {
      this.selectedQuestion = null;
    },

    setPhase(phase) {
      this.phase = phase;
    },

    setTranscript(text) {
      this.transcript = text;
    },

    setAudioBlob(blob) {
      this.audioBlob = blob;
    },

    setResult(result) {
      this.result = result;
      this.wfdResult = null;
      this.phase = "done";
    },

    setWFDResult(result) {
      this.wfdResult = result || null;
      this.phase = "done";
    },

    pushDIRecentRecording(record) {
      const nextRecord = record && typeof record === "object" ? record : null;
      if (!nextRecord) return;
      const normalizedId = `${nextRecord.id || ""}`.trim() || `di_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const normalized = {
        id: normalizedId,
        questionId: `${nextRecord.questionId || ""}`.trim(),
        blobUrl: `${nextRecord.blobUrl || ""}`.trim(),
        durationSec: Math.max(0, Number(nextRecord.durationSec || 0)),
        rating: Math.max(0, Math.min(5, Math.round(Number(nextRecord.rating || 0)))),
        createdAt: `${nextRecord.createdAt || new Date().toISOString()}`
      };

      const deduped = this.diRecentRecordings.filter((item) => `${item?.id || ""}`.trim() !== normalizedId);
      const merged = [normalized, ...deduped];
      const kept = merged.slice(0, 20);
      const dropped = merged.slice(20);

      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        dropped.forEach((item) => {
          const url = `${item?.blobUrl || ""}`.trim();
          if (!url) return;
          try {
            URL.revokeObjectURL(url);
          } catch {
            // no-op
          }
        });
      }

      this.diRecentRecordings = kept;
    },

    clearDIRecentRecordings() {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        this.diRecentRecordings.forEach((item) => {
          const url = `${item?.blobUrl || ""}`.trim();
          if (!url) return;
          try {
            URL.revokeObjectURL(url);
          } catch {
            // no-op
          }
        });
      }
      this.diRecentRecordings = [];
    },

    initRTSSession(payload = {}) {
      const next = payload && typeof payload === "object" ? payload : {};
      const defaults = createDefaultRTSSessionState();
      this.rtsSession = {
        ...defaults,
        ...this.rtsSession,
        ...next,
        usedPhraseIds: Array.isArray(next.usedPhraseIds)
          ? [...new Set(next.usedPhraseIds.map((item) => `${item || ""}`.trim()).filter(Boolean))]
          : Array.isArray(this.rtsSession?.usedPhraseIds)
            ? [...new Set(this.rtsSession.usedPhraseIds.map((item) => `${item || ""}`.trim()).filter(Boolean))]
            : []
      };
    },

    resetRTSSession() {
      this.rtsSession = createDefaultRTSSessionState();
    },

    setRTSPhase(phase) {
      this.rtsSession = {
        ...this.rtsSession,
        phase: `${phase || "listening"}`.trim() || "listening"
      };
    },

    setRTSQuestionMeta(payload = {}) {
      const next = payload && typeof payload === "object" ? payload : {};
      const nextQuestionIndex = Math.max(1, Math.round(Number(next.questionIndex || this.rtsSession.questionIndex || 1)));
      const nextTotalQuestions = Math.max(0, Math.round(Number(next.totalQuestions || this.rtsSession.totalQuestions || 0)));
      this.rtsSession = {
        ...this.rtsSession,
        questionId: `${next.questionId || this.rtsSession.questionId || ""}`.trim(),
        questionIndex: nextQuestionIndex,
        totalQuestions: nextTotalQuestions
      };
    },

    setRTSPrepareTimer(remaining, total = this.rtsSession.prepareTotal || 10) {
      const normalizedTotal = Math.max(0, Math.round(Number(total || 0)));
      const normalizedRemaining = Math.max(0, Math.round(Number(remaining || 0)));
      this.rtsSession = {
        ...this.rtsSession,
        prepareRemaining: normalizedRemaining,
        prepareTotal: normalizedTotal || this.rtsSession.prepareTotal || 10
      };
    },

    setRTSRecordTimer(remaining, total = this.rtsSession.recordTotal || 40) {
      const normalizedTotal = Math.max(0, Math.round(Number(total || 0)));
      const normalizedRemaining = Math.max(0, Math.round(Number(remaining || 0)));
      this.rtsSession = {
        ...this.rtsSession,
        recordRemaining: normalizedRemaining,
        recordTotal: normalizedTotal || this.rtsSession.recordTotal || 40
      };
    },

    setRTSListeningStatus(payload = {}) {
      const next = payload && typeof payload === "object" ? payload : {};
      const progressRaw = Number(next.progress);
      const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : this.rtsSession.listeningProgress;
      const remainingRaw = Number(next.remaining);
      const totalRaw = Number(next.total);
      const listeningRemaining = Number.isFinite(remainingRaw)
        ? Math.max(0, Math.round(remainingRaw))
        : this.rtsSession.listeningRemaining;
      const listeningTotal = Number.isFinite(totalRaw)
        ? Math.max(0, Math.round(totalRaw))
        : this.rtsSession.listeningTotal;

      this.rtsSession = {
        ...this.rtsSession,
        listeningProgress: progress,
        listeningStatus: `${next.status || this.rtsSession.listeningStatus || "idle"}`.trim() || "idle",
        listeningLabel: `${next.label || this.rtsSession.listeningLabel || "点击播放场景"}`.trim() || "点击播放场景",
        listeningRemaining,
        listeningTotal
      };
    },

    toggleRTSUsedPhrase(phraseId) {
      const normalizedId = `${phraseId || ""}`.trim();
      if (!normalizedId) return;

      const current = Array.isArray(this.rtsSession?.usedPhraseIds) ? this.rtsSession.usedPhraseIds : [];
      const has = current.includes(normalizedId);
      const next = has ? current.filter((item) => item !== normalizedId) : [...current, normalizedId];
      this.rtsSession = {
        ...this.rtsSession,
        usedPhraseIds: next
      };
    },

    clearRTSUsedPhrases() {
      this.rtsSession = {
        ...this.rtsSession,
        usedPhraseIds: []
      };
    },

    pushRTSRecentRecording(record) {
      const nextRecord = record && typeof record === "object" ? record : null;
      if (!nextRecord) return;

      const normalizedId = `${nextRecord.id || ""}`.trim() || `rts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const normalized = {
        id: normalizedId,
        questionId: `${nextRecord.questionId || ""}`.trim(),
        blobUrl: `${nextRecord.blobUrl || ""}`.trim(),
        durationSec: Math.max(0, Number(nextRecord.durationSec || 0)),
        rating: Math.max(0, Math.min(5, Math.round(Number(nextRecord.rating || 0)))),
        createdAt: `${nextRecord.createdAt || new Date().toISOString()}`
      };

      const deduped = this.rtsRecentRecordings.filter((item) => `${item?.id || ""}`.trim() !== normalizedId);
      const merged = [normalized, ...deduped];
      const kept = merged.slice(0, 20);
      const dropped = merged.slice(20);

      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        dropped.forEach((item) => {
          const url = `${item?.blobUrl || ""}`.trim();
          if (!url) return;
          try {
            URL.revokeObjectURL(url);
          } catch {
            // no-op
          }
        });
      }

      this.rtsRecentRecordings = kept;
    },

    clearRTSRecentRecordings() {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        this.rtsRecentRecordings.forEach((item) => {
          const url = `${item?.blobUrl || ""}`.trim();
          if (!url) return;
          try {
            URL.revokeObjectURL(url);
          } catch {
            // no-op
          }
        });
      }
      this.rtsRecentRecordings = [];
    },

    resetResult() {
      this.result = null;
      this.wfdResult = null;
      this.transcript = "";
      this.audioBlob = null;
      this.phase = "idle";
    },

    async submitScore(taskType, transcript, questionContent, questionId, options = {}) {
      this.phase = "processing";
      const normalizedTaskType = normalizeTaskType(taskType);
      const submittedTranscript = typeof transcript === "string" ? transcript : "";
      const trimmedSubmittedTranscript = submittedTranscript.trim();
      this.transcript = submittedTranscript;
      this.questionContent = questionContent || this.questionContent || "";

      if (normalizedTaskType === "WE") {
        this.result = null;
      }

      const authStore = useAuthStore();
      const normalizedQuestionId = questionId || this.currentQuestion?.id || "unknown";
      const requestIdPrefix = normalizedTaskType ? normalizedTaskType.toLowerCase() : "req";
      const clientRequestId = `${options?.requestId || createRequestId(requestIdPrefix)}`.trim() || createRequestId(requestIdPrefix);
      const submitSeq = Number(options?.submitSeq || 0);
      const submissionDebug = buildSubmissionDebugInfo(trimmedSubmittedTranscript);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("getSession error:", sessionError);
      }

      const session = sessionData?.session || null;
      const token = session?.access_token || authStore.session?.access_token || "";
      const scoreApiUrl = getApiUrl("/api/score");
      const scoreApiStartedAt = getNowMs();
      let scoreApiStatus = 0;
      let remainingDeducted = false;

      function decrementRemainingOnce() {
        if (remainingDeducted) return;
        authStore.decrementRemaining();
        remainingDeducted = true;
      }

      if (!token) {
        if (normalizedTaskType === "WE") {
          this.result = null;
          this.phase = "idle";
          return buildWESubmitErrorResult({
            error: "auth_session_missing",
            scoreErrorCode: "AUTH_SESSION_MISSING",
            scoreApiMs: getElapsedMs(scoreApiStartedAt),
            status: scoreApiStatus,
            requestId: clientRequestId,
            submitSeq,
            submissionDebug,
            diagnostics: buildScoreApiDiagnostics({
              requestId: clientRequestId,
              scoreErrorCode: "AUTH_SESSION_MISSING",
              failureType: "auth_error"
            })
          });
        }

        await authStore.logout();
        router.push("/auth");
        return null;
      }

      try {
        const scoreApiRequestPayload = {
          taskType,
          transcript: submittedTranscript,
          questionContent: this.questionContent,
          question_id: normalizedQuestionId,
          request_id: clientRequestId
        };

        const scoreApiAttempt = await fetchScoreApiWithCandidateUrls({
          primaryUrl: scoreApiUrl,
          taskType: normalizedTaskType,
          token,
          requestId: clientRequestId,
          payload: scoreApiRequestPayload,
          timeoutMs: resolveScoreApiTimeoutMs(normalizedTaskType)
        });
        const response = scoreApiAttempt.response;
        const usedScoreApiUrl = scoreApiAttempt.usedUrl || scoreApiUrl;

        scoreApiStatus = Number(response?.status || 0);
        const scoreApiMs = getElapsedMs(scoreApiStartedAt);
        const responsePayload = scoreApiAttempt.responsePayload || await safeReadResponse(response);
        const data = responsePayload.data;
        const responseRequestId = resolveResponseRequestId({
          responseData: data,
          clientRequestId
        });
        const responseDiagnostics = buildScoreApiDiagnostics({
          response,
          responsePayload,
          requestId: responseRequestId
        });
        console.info("[practice:score] score_api_done", {
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode: "",
          status: scoreApiStatus,
          request_id: responseRequestId,
          scoreApiUrl: usedScoreApiUrl
        });

        if (
          (response.status === 403 || response.status === 429) &&
          (data?.error === "access_expired" || data?.error === "daily_limit_reached")
        ) {
          this.result = {
            error: "access_expired",
            message: data.message || "当前账号未开通 AI 评阅，请开通 VIP 或使用试用权限。"
          };
          this.phase = "limited";
          await authStore.loadStatus();
          router.push("/limit");
          return this.result;
        }

        if (response.status === 401) {
          if (normalizedTaskType === "WE") {
            this.result = null;
            this.phase = "idle";
            return buildWESubmitErrorResult({
              error: "auth_session_expired",
              scoreErrorCode: "AUTH_SESSION_EXPIRED",
              scoreApiMs,
              status: scoreApiStatus,
              requestId: responseRequestId,
              submitSeq,
              submissionDebug,
              diagnostics: {
                ...responseDiagnostics,
                failure_type: "auth_error"
              }
            });
          }

          await authStore.logout();
          router.push("/auth");
          return null;
        }

        let normalizedResult = null;
        if (!response.ok) {
          if (normalizedTaskType === "RA") {
            const responseError = new Error(`Score API failed with status ${response.status}`);
            responseError.code = getScoreApiErrorCode({
              status: response.status,
              isHtml: responsePayload.isHtml
            });
            responseError.diagnostics = {
              ...responseDiagnostics,
              score_error_code: responseError.code,
              failure_type: "http_error",
              provider_used: data && Object.prototype.hasOwnProperty.call(data, "provider_used") ? data.provider_used : null,
              last_provider_attempted: data?.last_provider_attempted || null,
              fallback_reason: data?.fallback_reason || null,
              fallback_error_type: data?.fallback_error_type || null,
              raw_error_type: data?.raw_error_type || null,
              error_stage: data?.error_stage || null,
              provider_attempts: Array.isArray(data?.provider_attempts) ? data.provider_attempts : [],
              is_fallback: Boolean(data?.is_fallback)
            };
            throw responseError;
          }
          if (data && typeof data === "object" && (data.scores || data.traits || typeof data.status === "string")) {
            normalizedResult = normalizeScoreData(data, taskType);
          } else {
            const responseError = new Error(`Score API failed with status ${response.status}`);
            responseError.code = getScoreApiErrorCode({
              status: response.status,
              isHtml: responsePayload.isHtml
            });
            responseError.diagnostics = {
              ...responseDiagnostics,
              score_error_code: responseError.code,
              failure_type: "http_error"
            };
            throw responseError;
          }
        }

        if (!normalizedResult) {
          normalizedResult = normalizeScoreData(data || {}, taskType);
        }

        this.result = {
          ...normalizedResult,
          submitted_word_count: submissionDebug.submitted_word_count,
          submitted_excerpt: submissionDebug.submitted_excerpt,
          submitted_text_hash: submissionDebug.submitted_text_hash,
          reviewed_at: new Date().toISOString(),
          meta: {
            scoreApiMs,
            scoreErrorCode: "",
            status: scoreApiStatus,
            statusText: responseDiagnostics.statusText,
            contentType: responseDiagnostics.contentType,
            request_id: responseRequestId,
            submit_seq: submitSeq
          }
        };
        this.phase = "done";
        decrementRemainingOnce();

        if (session?.user?.id) {
          const currentTranscript = this.transcript;
          const currentQuestionContent = this.questionContent;
          const currentResult = this.result;
          const currentAudioBlob = this.audioBlob;
          const currentLogAnalytics = options?.logAnalytics || null;
          const currentLogPracticeTimestamps = options?.logPracticeTimestamps || null;
          const currentTaskType = normalizedTaskType;
          const currentUserId = session.user.id;

          void (async () => {
            const logStartedAt = getNowMs();
            const audioMeta = await uploadPracticeAudioForRA({
              taskType: currentTaskType,
              userId: currentUserId,
              questionId: normalizedQuestionId,
              blob: currentAudioBlob
            });
            const scoreJson = buildPracticeLogScoreJson({
              taskType: currentTaskType,
              result: currentResult,
              questionId: normalizedQuestionId,
              questionContent: currentQuestionContent,
              audioMeta,
              analytics: currentLogAnalytics,
              practiceTimestamps: currentLogPracticeTimestamps
            });
            const payload = {
              user_id: currentUserId,
              task_type: currentTaskType,
              question_id: normalizedQuestionId,
              transcript: currentTranscript,
              score_json: scoreJson,
              feedback: currentResult?.feedback || ""
            };
            const { error: insertError } = await supabase.from("practice_logs").insert(payload);
            const practiceLogMs = getElapsedMs(logStartedAt);

            if (insertError) {
              console.warn("practice_logs insert error:", insertError, {
                taskType: normalizedTaskType,
                questionId: normalizedQuestionId,
                practiceLogMs
              });
              return;
            }

            console.info("[practice:score] practice_logs_insert_done", {
              taskType: normalizedTaskType,
              questionId: normalizedQuestionId,
              practiceLogMs,
              hasAudio: Boolean(audioMeta?.path)
            });
          })();
        }

        return this.result;
      } catch (error) {
        const scoreApiMs = getElapsedMs(scoreApiStartedAt);
        const scoreErrorCode =
          error?.name === "AbortError"
            ? "SCORE_API_TIMEOUT"
            : isScoreApiKnownErrorCode(error?.code)
              ? error.code
              : "SCORE_API_FAILED";
        const failureType = resolveScoreFailureType(error, scoreErrorCode);
        const diagnostics = normalizeScoreApiDiagnostics(error?.diagnostics, {
          requestId: clientRequestId,
          status: scoreApiStatus,
          scoreErrorCode,
          failureType
        });
        console.error("Score API failed:", {
          error,
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode,
          status: scoreApiStatus,
          scoreApiUrl,
          request_id: diagnostics.request_id,
          failure_type: diagnostics.failure_type,
          diagnostics
        });

        if (normalizedTaskType === "WE") {
          const isAuthFailure = scoreErrorCode === "AUTH_SESSION_MISSING" || scoreErrorCode === "AUTH_SESSION_EXPIRED";
          if (isAuthFailure) {
            this.result = null;
            this.phase = "idle";
            return buildWESubmitErrorResult({
              error: "score_request_failed",
              scoreErrorCode,
              scoreApiMs,
              status: diagnostics.status,
              requestId: diagnostics.request_id || clientRequestId,
              submitSeq,
              submissionDebug,
              diagnostics
            });
          }

          const degradedResult = buildWEClientDegradedResult({
            scoreErrorCode,
            diagnostics,
            scoreApiMs,
            submissionDebug,
            submitSeq
          });
          this.result = degradedResult;
          this.phase = "done";

          if (session?.user?.id) {
            const currentUserId = session.user.id;
            const currentTranscript = this.transcript;
            const currentQuestionContent = this.questionContent;
            const currentResult = this.result;

            void (async () => {
              const payload = {
                user_id: currentUserId,
                task_type: normalizedTaskType,
                question_id: normalizedQuestionId,
                transcript: currentTranscript,
                score_json: buildPracticeLogScoreJson({
                  taskType: normalizedTaskType,
                  result: currentResult,
                  questionId: normalizedQuestionId,
                  questionContent: currentQuestionContent,
                  audioMeta: null,
                  analytics: options?.logAnalytics || null,
                  practiceTimestamps: options?.logPracticeTimestamps || null
                }),
                feedback: currentResult?.feedback || ""
              };
              const { error: insertError } = await supabase.from("practice_logs").insert(payload);
              if (insertError) {
                console.warn("WE degraded practice_logs insert error:", insertError, {
                  taskType: normalizedTaskType,
                  questionId: normalizedQuestionId
                });
              }
            })();
          }

          return this.result;
        }

        if (normalizedTaskType === "RA") {
          this.result = buildRASubmitErrorResult({
            scoreErrorCode,
            diagnostics,
            scoreApiMs,
            requestId: diagnostics.request_id || clientRequestId
          });
          this.phase = "idle";
          return this.result;
        }

        this.result = {
          ...buildFallbackResult(taskType),
          meta: {
            scoreApiMs,
            scoreErrorCode,
            status: scoreApiStatus
          }
        };
        this.phase = "done";
        return this.result;
      }
    }
  }
});

function normalizeScoreData(data, taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return normalizeWEScoreData(data);
  }

  const pronunciation =
    normalizedTaskType === "RA" ? clampRAScore(data?.scores?.pronunciation) : clampScore(data?.scores?.pronunciation);
  const fluency = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.fluency) : clampScore(data?.scores?.fluency);
  const content = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.content) : clampScore(data?.scores?.content);
  const overall =
    normalizedTaskType === "RA"
      ? clampRAOverall(data?.overall)
      : clampOverall(data?.overall, Math.round((pronunciation + fluency + content) / 3));
  const feedback = typeof data?.feedback === "string" && data.feedback.trim()
    ? data.feedback.trim()
    : "这次练习已完成，继续保持。";

  const result = {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords: normalizeKeywords(data?.keywords),
    feedback,
    overall
  };

  if (normalizedTaskType === "RA") {
    result.provider_used = `${data?.provider_used || ""}`.trim() || null;
    result.fallback_reason = data?.fallback_reason ?? null;
    result.raw_error_type = `${data?.raw_error_type || ""}`.trim() || "";
    result.provider_attempts = Array.isArray(data?.provider_attempts) ? data.provider_attempts : [];
    result.last_provider_attempted = `${data?.last_provider_attempted || ""}`.trim() || null;
  }

  return result;
}

function normalizeWEScoreData(data) {
  const gateTriggered = Boolean(data?.gate?.triggered);
  const reasonCodes = Array.isArray(data?.gate?.reason_codes)
    ? data.gate.reason_codes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];
  const status = normalizeWEStatus(data?.status, {
    gateTriggered,
    reasonCodes
  });
  const isAiReviewDegraded = status === WE_STATUS_AI_DEGRADED;
  const traitStatus = status === WE_STATUS_SCORED ? WE_STATUS_SCORED : "";
  const formScore = clampRange(data?.traits?.form?.score, 0, 2);
  const contentScore = clampRange(data?.traits?.content?.score, 0, 6);
  const traits = {
    content: { score: contentScore, max: 6 },
    form: { score: formScore, max: 2 },
    development_structure_coherence: normalizeTraitObject(data?.traits?.development_structure_coherence, 6, traitStatus),
    grammar: normalizeTraitObject(data?.traits?.grammar, 2, traitStatus),
    general_linguistic_range: normalizeTraitObject(data?.traits?.general_linguistic_range, 6, traitStatus),
    vocabulary_range: normalizeTraitObject(data?.traits?.vocabulary_range, 2, traitStatus),
    spelling: normalizeTraitObject(data?.traits?.spelling, 2, traitStatus)
  };

  const rawTotal = status !== WE_STATUS_SCORED
    ? 0
    : clampRange(
      data?.raw_total,
      0,
      WE_RAW_MAX
    );

  const overallEstimated = status !== WE_STATUS_SCORED
    ? 0
    : clampRange(
      data?.overall_estimated,
      0,
      90,
      Math.round(((Number(rawTotal || 0)) / WE_RAW_MAX) * 90)
    );

  const visibleSummary = normalizeWESummary(data?.visible_summary, {
    gateTriggered,
    overallEstimated,
    reasonCodes
  });
  const feedback = normalizeZhText(data?.feedback, visibleSummary.final_comment);

  return {
    taskType: "WE",
    status,
    is_ai_review_degraded: isAiReviewDegraded,
    is_estimated: true,
    review_label: resolveWEReviewLabel(data?.review_label, status),
    raw_total: rawTotal,
    raw_max: WE_RAW_MAX,
    overall_estimated: overallEstimated,
    traits,
    gate: {
      triggered: gateTriggered,
      reason_codes: reasonCodes
    },
    provider_used: `${data?.provider_used || "none"}`.trim() || "none",
    fallback_reason: data?.fallback_reason ?? null,
    error_stage: `${data?.error_stage || ""}`.trim() || "",
    raw_error_type: `${data?.raw_error_type || ""}`.trim() || "",
    visible_summary: visibleSummary,
    feedback,
    gate_reason_messages_zh: reasonCodes.map((code) => mapGateReasonCodeToZh(code)).filter(Boolean)
  };
}

function normalizeTaskType(taskType) {
  if (typeof taskType !== "string") return "";
  return taskType.trim().toUpperCase();
}

function resolveScoreApiTimeoutMs(taskType) {
  return normalizeTaskType(taskType) === "RA" ? RA_SCORE_API_TIMEOUT_MS : SCORE_API_TIMEOUT_MS;
}

function normalizeWEStatus(rawStatus, { gateTriggered = false, reasonCodes = [] } = {}) {
  const normalizedReasonCodes = Array.isArray(reasonCodes)
    ? reasonCodes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];
  if (normalizedReasonCodes.includes(WE_AI_FALLBACK_REASON_CODE)) {
    return WE_STATUS_AI_DEGRADED;
  }

  const normalizedStatus = `${rawStatus || ""}`.trim().toLowerCase();
  if (normalizedStatus === WE_STATUS_AI_DEGRADED) return WE_STATUS_AI_DEGRADED;
  if (normalizedStatus === WE_STATUS_RULE_GATED) return WE_STATUS_RULE_GATED;
  if (normalizedStatus === WE_STATUS_SCORED) return WE_STATUS_SCORED;
  if (gateTriggered) return WE_STATUS_RULE_GATED;
  return WE_STATUS_SCORED;
}

function resolveWEReviewLabel(rawLabel, status) {
  const normalizedLabel = `${rawLabel || ""}`.trim();
  if (normalizedLabel) return normalizedLabel;
  if (status === WE_STATUS_AI_DEGRADED) return "AI评阅（降级）";
  if (status === WE_STATUS_RULE_GATED) return "规则判定（未进入AI评阅）";
  return WE_REVIEW_LABEL;
}

function buildFallbackResult(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return {
      taskType: "WE",
      status: WE_STATUS_RULE_GATED,
      is_ai_review_degraded: false,
      is_estimated: true,
      review_label: WE_REVIEW_LABEL,
      raw_total: 0,
      raw_max: WE_RAW_MAX,
      overall_estimated: 0,
      traits: {
        content: { score: 0, max: 6 },
        form: { score: 0, max: 2 },
        development_structure_coherence: null,
        grammar: null,
        general_linguistic_range: null,
        vocabulary_range: null,
        spelling: null
      },
      gate: {
        triggered: true,
        reason_codes: ["content_zero_no_meaningful_response"]
      },
      provider_used: "none",
      fallback_reason: null,
      visible_summary: {
        level: WE_GATE_LEVEL,
        strengths: [],
        improvements: [
          "请先满足作文长度与基本格式要求。",
          "请确保回应题目且填写完整内容。"
        ],
        final_comment: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。"
      },
      feedback: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。",
      gate_reason_messages_zh: [mapGateReasonCodeToZh("content_zero_no_meaningful_response")]
    };
  }

  const fallback = {
    scores: {
      pronunciation: 65,
      fluency: 63,
      content: 67
    },
    feedback: "网络暂时不稳定，这是估算分数。你已经完成了练习，继续保持。",
    overall: 65
  };

  if (normalizedTaskType === "RS") {
    return {
      ...fallback,
      keywords: []
    };
  }

  return {
    ...fallback,
    keywords: []
  };
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(90, Math.round(num)));
}

function clampRAScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(num)));
}

function clampRAOverall(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(num)));
}

function clampOverall(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((item) => ({
      word: typeof item?.word === "string" ? item.word : "",
      hit: Boolean(item?.hit)
    }))
    .filter((item) => item.word);
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getElapsedMs(startAt) {
  return Math.max(0, Math.round(getNowMs() - startAt));
}

function buildPracticeLogScoreJson({
  taskType,
  result,
  questionId,
  questionContent,
  audioMeta,
  analytics = null,
  practiceTimestamps = null
}) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return {
      status: `${result?.status || "scored"}`.trim() || "scored",
      traits: result?.traits || null,
      gate: result?.gate || { triggered: true, reason_codes: [] },
      raw_total: result?.raw_total ?? null,
      raw_max: WE_RAW_MAX,
      overall_estimated: result?.overall_estimated ?? null,
      provider_used: `${result?.provider_used || "none"}`.trim() || "none",
      fallback_reason: result?.fallback_reason ?? null,
      visible_summary: result?.visible_summary || null,
      request_id: `${result?.meta?.request_id || ""}`.trim() || "",
      submitted_word_count: Number(result?.submitted_word_count || 0),
      submitted_excerpt: `${result?.submitted_excerpt || ""}`.trim() || "",
      submitted_text_hash: `${result?.submitted_text_hash || ""}`.trim() || "",
      reviewed_at: `${result?.reviewed_at || ""}`.trim() || "",
      analytics: analytics ? buildPracticeAnalytics(analytics) : undefined,
      practice_started_at: `${practiceTimestamps?.startedAt || ""}`.trim() || undefined,
      practice_completed_at: `${practiceTimestamps?.completedAt || ""}`.trim() || undefined
    };
  }

  if (normalizedTaskType !== "RA") {
    const baseScores = result?.scores && typeof result.scores === "object" ? { ...result.scores } : {};
    const overall = Number(result?.overall);
    if (Number.isFinite(overall) && overall > 0) {
      baseScores.overall = clampOverall(overall, Math.round(overall));
    }
    if (analytics) {
      baseScores.analytics = buildPracticeAnalytics(analytics);
    }
    return baseScores;
  }

  const pronunciation = clampRAScore(result?.scores?.pronunciation);
  const fluency = clampRAScore(result?.scores?.fluency);
  const content = clampRAScore(result?.scores?.content);
  const overall = clampRAOverall(result?.overall);
  const snapshotContent = `${questionContent || ""}`.trim();

  return {
    scores: {
      pronunciation,
      fluency,
      content,
      overall
    },
    analytics: analytics ? buildPracticeAnalytics(analytics) : undefined,
    audio: audioMeta || null,
    provider_used: `${result?.provider_used || ""}`.trim() || null,
    fallback_reason: result?.fallback_reason ?? null,
    raw_error_type: `${result?.raw_error_type || ""}`.trim() || "",
    provider_attempts: Array.isArray(result?.provider_attempts) ? result.provider_attempts : [],
    last_provider_attempted: `${result?.last_provider_attempted || ""}`.trim() || null,
    request_id: `${result?.meta?.request_id || ""}`.trim() || "",
    questionSnapshot: {
      id: `${questionId || "unknown"}`.trim() || "unknown",
      content: snapshotContent,
      taskType: "RA"
    }
  };
}

async function uploadPracticeAudioForRA({ taskType, userId, questionId, blob }) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType !== "RA") return null;
  if (!userId) return null;
  if (!blob || Number(blob?.size || 0) <= 0) return null;

  const mimeType = normalizeMimeType(blob?.type);
  const ext = getAudioExtByMimeType(mimeType);
  const safeQuestionId = sanitizePathSegment(questionId || "unknown");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const path = `ra/${userId}/${timestamp}-${safeQuestionId}-${randomSuffix}.${ext}`;

  try {
    const { error } = await supabase.storage.from(PRACTICE_AUDIO_BUCKET).upload(path, blob, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

    if (error) {
      console.warn("RA audio upload failed:", error, {
        path,
        mimeType,
        size: Number(blob?.size || 0)
      });
      return null;
    }

    return {
      bucket: PRACTICE_AUDIO_BUCKET,
      path,
      mimeType: mimeType || "",
      size: Number(blob?.size || 0),
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("RA audio upload error:", error, {
      path,
      mimeType,
      size: Number(blob?.size || 0)
    });
    return null;
  }
}

function sanitizePathSegment(value) {
  const cleaned = `${value || ""}`
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return cleaned || "unknown";
}

function normalizeMimeType(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getAudioExtByMimeType(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

async function safeReadResponse(response) {
  const contentType = `${response?.headers?.get?.("content-type") || ""}`.toLowerCase();
  try {
    const rawText = await response.text();
    const trimmedText = `${rawText || ""}`.trim();
    if (!trimmedText) {
      return {
        data: null,
        isHtml: false,
        contentType,
        rawText: ""
      };
    }

    let data = null;
    try {
      data = JSON.parse(trimmedText);
    } catch {
      data = null;
    }

    return {
      data,
      isHtml: isLikelyHtmlResponse(trimmedText, contentType),
      contentType,
      rawText: trimmedText.slice(0, 1200)
    };
  } catch {
    return {
      data: null,
      isHtml: false,
      contentType,
      rawText: ""
    };
  }
}

function isLikelyHtmlResponse(text, contentType = "") {
  if (`${contentType || ""}`.includes("text/html")) return true;
  return /^<!doctype html/i.test(text) || /^<html/i.test(text) || text.includes("<html");
}

function getScoreApiErrorCode({ status, isHtml = false } = {}) {
  if (Number(status) === 404) {
    return isHtml ? "SCORE_API_ROUTE_NOT_FOUND_HTML" : "SCORE_API_ROUTE_NOT_FOUND";
  }
  if (isHtml) return "SCORE_API_UNEXPECTED_HTML";
  return "SCORE_API_HTTP_ERROR";
}

function isScoreApiKnownErrorCode(code) {
  return [
    "SCORE_API_HTTP_ERROR",
    "SCORE_API_ROUTE_NOT_FOUND",
    "SCORE_API_ROUTE_NOT_FOUND_HTML",
    "SCORE_API_UNEXPECTED_HTML"
  ].includes(`${code || ""}`);
}

function normalizeTraitObject(value, max, status) {
  if (status !== WE_STATUS_SCORED) return null;
  return {
    score: clampRange(value?.score, 0, max),
    max
  };
}

function normalizeWESummary(value, { gateTriggered = false, overallEstimated = 0, reasonCodes = [] } = {}) {
  const fallbackStrengths = ["结构基本完整，主题方向较明确。", "主要观点能够被理解。"];
  const fallbackImprovements = ["补充更具体的论据和展开细节。", "提交前检查语法与拼写错误。"];
  const normalizedReasonCodes = Array.isArray(reasonCodes)
    ? reasonCodes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];

  if (gateTriggered) {
    const isAiFallbackGate = normalizedReasonCodes.includes(WE_AI_FALLBACK_REASON_CODE);
    if (isAiFallbackGate) {
      return {
        level: normalizeZhText(value?.level, WE_AI_FALLBACK_LEVEL),
        strengths: [],
        improvements: normalizeZhList(value?.improvements, WE_AI_FALLBACK_IMPROVEMENTS),
        final_comment: normalizeZhText(
          value?.final_comment || value?.finalComment,
          WE_AI_FALLBACK_FINAL_COMMENT
        )
      };
    }

    return {
      level: WE_GATE_LEVEL,
      strengths: [],
      improvements: ["请先满足作文长度与基本格式要求。", "请确保回应题目且填写完整内容。"],
      final_comment: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。"
    };
  }

  const strengths = normalizeZhList(value?.strengths, fallbackStrengths);
  const improvements = normalizeZhList(value?.improvements, fallbackImprovements);

  return {
    level: normalizeZhLevel(value?.level, overallEstimated),
    strengths,
    improvements,
    final_comment: normalizeZhText(
      value?.final_comment || value?.finalComment,
      "本次为AI估分结果，请根据改进建议持续优化作文表达。"
    )
  };
}

function normalizeZhList(items, fallbackItems) {
  const normalized = [];
  for (let i = 0; i < 2; i += 1) {
    const candidate = normalizeZhText(Array.isArray(items) ? items[i] : "", fallbackItems[i] || "");
    if (candidate) {
      normalized.push(candidate);
    }
  }
  return normalized.length ? normalized : fallbackItems.slice(0, 2);
}

function normalizeZhLevel(value, overallEstimated) {
  const raw = `${value || ""}`.trim();
  if (containsChinese(raw)) return raw;

  const lower = raw.toLowerCase();
  if (lower.includes("strong")) return "较强";
  if (lower.includes("fair")) return "中等";
  if (lower.includes("develop")) return "需提升";
  if (lower.includes("rewrite") || lower.includes("not scored")) return WE_GATE_LEVEL;

  if (overallEstimated >= 78) return "较强";
  if (overallEstimated >= 60) return "中等";
  return "需提升";
}

function normalizeZhText(value, fallback) {
  const text = `${value || ""}`.trim();
  if (containsChinese(text)) return text;
  return `${fallback || ""}`.trim();
}

function containsChinese(value) {
  return /[\u4e00-\u9fff]/.test(`${value || ""}`);
}

function mapGateReasonCodeToZh(code) {
  const map = {
    form_zero_word_count_too_short: "作文字数过少，未达到 WE 最低长度要求。",
    form_zero_word_count_too_long: "作文字数过多，超出 WE 推荐长度范围。",
    form_zero_all_caps: "全文大写会被判定为格式不合规。",
    form_zero_missing_punctuation: "标点过少，句子边界不清晰。",
    form_zero_bullets_or_fragmented_sentences: "内容过于碎片化或使用了项目符号，影响作文结构。",
    content_zero_off_topic: "内容与题目关联度不足，存在离题风险。",
    content_zero_template_not_filled: "模板占位内容未替换，作文未完成。",
    content_zero_no_meaningful_response: "有效内容不足，无法形成可评阅作文。",
    ai_review_unavailable: WE_AI_FALLBACK_FINAL_COMMENT
  };

  return map[`${code || ""}`.trim()] || "本次作文触发规则限制，请根据建议重写后再提交。";
}

function clampRange(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function buildWESubmitErrorResult({
  error = "score_request_failed",
  scoreErrorCode = "",
  scoreApiMs = 0,
  status = 0,
  requestId = "",
  submitSeq = 0,
  submissionDebug,
  diagnostics
} = {}) {
  const normalizedDiagnostics = normalizeScoreApiDiagnostics(diagnostics, {
    requestId,
    status,
    scoreErrorCode
  });

  return {
    error,
    submitted_word_count: Number(submissionDebug?.submitted_word_count || 0),
    submitted_excerpt: `${submissionDebug?.submitted_excerpt || ""}`.trim(),
    submitted_text_hash: `${submissionDebug?.submitted_text_hash || ""}`.trim(),
    reviewed_at: new Date().toISOString(),
    meta: {
      scoreApiMs: Math.max(0, Math.round(Number(scoreApiMs || 0))),
      scoreErrorCode: `${scoreErrorCode || normalizedDiagnostics.score_error_code || ""}`.trim(),
      status: normalizedDiagnostics.status,
      statusText: normalizedDiagnostics.statusText,
      contentType: normalizedDiagnostics.contentType,
      request_id: normalizedDiagnostics.request_id,
      submit_seq: Number(submitSeq || 0),
      failure_type: normalizedDiagnostics.failure_type,
      is_http_error: normalizedDiagnostics.is_http_error,
      is_fetch_failed: normalizedDiagnostics.is_fetch_failed,
      backend_error: normalizedDiagnostics.backend_error,
      backend_code: normalizedDiagnostics.backend_code,
      backend_meta: normalizedDiagnostics.backend_meta
    }
  };
}

function buildRASubmitErrorResult({
  scoreErrorCode = "",
  diagnostics = {},
  scoreApiMs = 0,
  requestId = ""
} = {}) {
  const normalizedDiagnostics = normalizeScoreApiDiagnostics(diagnostics, {
    requestId,
    scoreErrorCode
  });

  return {
    error: "score_request_failed",
    taskType: "RA",
    message: "AI scoring is temporarily unavailable. Please retry.",
    is_fallback: true,
    provider_used: normalizedDiagnostics.provider_used,
    last_provider_attempted: normalizedDiagnostics.last_provider_attempted,
    fallback_reason: normalizedDiagnostics.fallback_reason,
    fallback_error_type: normalizedDiagnostics.fallback_error_type,
    raw_error_type: normalizedDiagnostics.raw_error_type,
    error_stage: normalizedDiagnostics.error_stage,
    provider_attempts: normalizedDiagnostics.provider_attempts,
    reviewed_at: new Date().toISOString(),
    meta: {
      scoreApiMs: Math.max(0, Math.round(Number(scoreApiMs || 0))),
      scoreErrorCode: `${scoreErrorCode || normalizedDiagnostics.score_error_code || ""}`.trim(),
      status: normalizedDiagnostics.status,
      statusText: normalizedDiagnostics.statusText,
      contentType: normalizedDiagnostics.contentType,
      request_id: normalizedDiagnostics.request_id,
      failure_type: normalizedDiagnostics.failure_type,
      is_http_error: normalizedDiagnostics.is_http_error,
      is_fetch_failed: normalizedDiagnostics.is_fetch_failed,
      backend_error: normalizedDiagnostics.backend_error,
      backend_code: normalizedDiagnostics.backend_code,
      provider_used: normalizedDiagnostics.provider_used,
      last_provider_attempted: normalizedDiagnostics.last_provider_attempted,
      fallback_reason: normalizedDiagnostics.fallback_reason,
      fallback_error_type: normalizedDiagnostics.fallback_error_type,
      raw_error_type: normalizedDiagnostics.raw_error_type,
      error_stage: normalizedDiagnostics.error_stage,
      provider_attempts: normalizedDiagnostics.provider_attempts
    }
  };
}

function buildWEClientDegradedResult({
  scoreErrorCode = "",
  diagnostics = {},
  scoreApiMs = 0,
  submissionDebug,
  submitSeq = 0
} = {}) {
  const normalizedDiagnostics = normalizeScoreApiDiagnostics(diagnostics, {
    scoreErrorCode
  });
  const submittedWordCount = Number(submissionDebug?.submitted_word_count || 0);
  const hasEnoughWords = submittedWordCount >= 120;
  const hasVeryLongEssay = submittedWordCount >= 260;
  const contentScore = hasEnoughWords ? 4 : submittedWordCount >= 80 ? 3 : 2;
  const formScore = hasVeryLongEssay ? 1 : 2;
  const coarseRawTotal = Math.max(0, Math.min(26, contentScore + formScore + 8));
  const coarseOverall = Math.round((coarseRawTotal / WE_RAW_MAX) * 90);
  const shortCode = normalizeOptionalText(normalizedDiagnostics.score_error_code);
  const fallbackCode = shortCode || "SCORE_API_FAILED";
  const fallbackReason = shortCode || "score_api_unreachable";

  return {
    error: "score_request_failed",
    taskType: "WE",
    status: WE_STATUS_AI_DEGRADED,
    is_ai_review_degraded: true,
    is_estimated: true,
    review_label: WE_CLIENT_DEGRADED_REVIEW_LABEL,
    raw_total: coarseRawTotal,
    raw_max: WE_RAW_MAX,
    overall_estimated: coarseOverall,
    traits: {
      content: { score: contentScore, max: 6 },
      form: { score: formScore, max: 2 },
      development_structure_coherence: null,
      grammar: null,
      general_linguistic_range: null,
      vocabulary_range: null,
      spelling: null
    },
    gate: {
      triggered: true,
      reason_codes: [WE_AI_FALLBACK_REASON_CODE]
    },
    provider_used: "client_fallback",
    fallback_reason: fallbackReason,
    error_stage: "client_fallback",
    raw_error_type: fallbackReason,
    visible_summary: {
      level: WE_AI_FALLBACK_LEVEL,
      strengths: submittedWordCount >= 180 ? ["你的内容长度和结构基础较好。"] : [],
      improvements: [...WE_CLIENT_DEGRADED_IMPROVEMENTS],
      final_comment: WE_AI_FALLBACK_FINAL_COMMENT
    },
    feedback: WE_AI_FALLBACK_FINAL_COMMENT,
    gate_reason_messages_zh: [mapGateReasonCodeToZh(WE_AI_FALLBACK_REASON_CODE)],
    submitted_word_count: submittedWordCount,
    submitted_excerpt: `${submissionDebug?.submitted_excerpt || ""}`.trim(),
    submitted_text_hash: `${submissionDebug?.submitted_text_hash || ""}`.trim(),
    reviewed_at: new Date().toISOString(),
    meta: {
      scoreApiMs: Math.max(0, Math.round(Number(scoreApiMs || 0))),
      scoreErrorCode: fallbackCode,
      status: normalizedDiagnostics.status,
      statusText: normalizedDiagnostics.statusText,
      contentType: normalizedDiagnostics.contentType,
      request_id: normalizedDiagnostics.request_id,
      submit_seq: Number(submitSeq || 0),
      failure_type: normalizedDiagnostics.failure_type,
      is_http_error: normalizedDiagnostics.is_http_error,
      is_fetch_failed: normalizedDiagnostics.is_fetch_failed,
      backend_error: normalizedDiagnostics.backend_error,
      backend_code: normalizedDiagnostics.backend_code,
      backend_meta: normalizedDiagnostics.backend_meta,
      fallback_active: true,
      fallback_reason_code: fallbackCode
    }
  };
}

async function fetchScoreApiWithCandidateUrls({
  primaryUrl,
  taskType,
  token,
  requestId,
  payload,
  timeoutMs = SCORE_API_TIMEOUT_MS
} = {}) {
  const candidates = buildScoreApiCandidateUrls(primaryUrl, taskType);
  let lastError = null;

  for (const candidateUrl of candidates) {
    const scoreAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = scoreAbortController
      ? setTimeout(() => {
          scoreAbortController.abort();
        }, timeoutMs)
      : null;

    try {
      const response = await fetch(candidateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-request-id": requestId
        },
        body: JSON.stringify(payload || {}),
        signal: scoreAbortController?.signal
      });
      const responsePayload = await safeReadResponse(response);
      if (shouldTryNextScoreApiCandidateByResponse(response, responsePayload, taskType)) {
        lastError = createScoreApiCandidateError({
          status: Number(response?.status || 0),
          responsePayload,
          candidateUrl
        });
        continue;
      }

      return {
        response,
        responsePayload,
        usedUrl: candidateUrl
      };
    } catch (error) {
      lastError = error;
      if (!shouldTryNextScoreApiCandidateByError(error, taskType)) {
        throw error;
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  if (lastError) throw lastError;
  throw new Error("Score API request failed without candidate attempt.");
}

function buildScoreApiCandidateUrls(primaryUrl, taskType) {
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) return;
    const key = normalizeUrlKey(normalized);
    if (!key) return;
    if (candidates.some((item) => item.key === key)) return;
    candidates.push({ key, url: normalized });
  };

  addCandidate(primaryUrl);

  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE" && isRuntimeLocalOrigin()) {
    addCandidate("/api/score");

    const devTarget = normalizeAbsoluteHttpUrl(import.meta.env?.VITE_DEV_API_TARGET);
    if (devTarget) addCandidate(`${trimTrailingSlash(devTarget)}/api/score`);

    const apiBase = normalizeAbsoluteHttpUrl(import.meta.env?.VITE_API_BASE);
    if (apiBase) addCandidate(`${trimTrailingSlash(apiBase)}/api/score`);

    SCORE_API_DEV_FALLBACK_PORTS.forEach((port) => {
      addCandidate(`http://localhost:${port}/api/score`);
    });
  }

  return candidates.map((item) => item.url);
}

function shouldTryNextScoreApiCandidateByResponse(response, responsePayload, taskType) {
  if (normalizeTaskType(taskType) !== "WE") return false;
  if (response?.ok) return false;

  const status = Number(response?.status || 0);
  if (status === 404) return true;
  if (status >= 502 && status <= 504) return true;
  if (Boolean(responsePayload?.isHtml)) return true;
  return false;
}

function shouldTryNextScoreApiCandidateByError(error, taskType) {
  if (normalizeTaskType(taskType) !== "WE") return false;
  const name = `${error?.name || ""}`.toLowerCase();
  const code = `${error?.code || ""}`.toLowerCase();
  const message = `${error?.message || ""}`.toLowerCase();

  if (name === "aborterror") return true;
  if (code.includes("econn") || code.includes("timedout")) return true;
  if (message.includes("fetch failed") || message.includes("network")) return true;
  return false;
}

function createScoreApiCandidateError({ status, responsePayload, candidateUrl } = {}) {
  const error = new Error(`Score API candidate failed: ${candidateUrl} (${status || 0})`);
  error.code = getScoreApiErrorCode({
    status: Number(status || 0),
    isHtml: Boolean(responsePayload?.isHtml)
  });
  error.diagnostics = {
    status: Number(status || 0),
    score_error_code: error.code,
    failure_type: "http_error",
    response_body_snippet: `${responsePayload?.rawText || ""}`.trim().slice(0, 240),
    is_html: Boolean(responsePayload?.isHtml)
  };
  return error;
}

function resolveResponseRequestId({ responseData, clientRequestId } = {}) {
  const responseRequestId = `${responseData?.request_id || ""}`.trim();
  if (responseRequestId) return responseRequestId;
  return `${clientRequestId || ""}`.trim();
}

function buildScoreApiDiagnostics({
  response,
  responsePayload,
  requestId = "",
  scoreErrorCode = "",
  failureType = ""
} = {}) {
  const responseData = responsePayload?.data;
  return normalizeScoreApiDiagnostics(
    {
      request_id: requestId,
      status: Number(response?.status || 0),
      statusText: `${response?.statusText || ""}`.trim(),
      contentType: `${responsePayload?.contentType || ""}`.trim().toLowerCase(),
      score_error_code: `${scoreErrorCode || ""}`.trim(),
      failure_type: `${failureType || ""}`.trim(),
      backend_error: normalizeOptionalText(responseData?.error),
      backend_code: normalizeOptionalText(responseData?.code ?? responseData?.error_code),
      backend_meta: isPlainObject(responseData?.meta) ? responseData.meta : null,
      provider_used: responseData && Object.prototype.hasOwnProperty.call(responseData, "provider_used")
        ? responseData.provider_used
        : null,
      last_provider_attempted: responseData?.last_provider_attempted || null,
      fallback_reason: responseData?.fallback_reason || null,
      fallback_error_type: responseData?.fallback_error_type || null,
      raw_error_type: responseData?.raw_error_type || null,
      error_stage: responseData?.error_stage || null,
      provider_attempts: Array.isArray(responseData?.provider_attempts) ? responseData.provider_attempts : [],
      is_fallback: Boolean(responseData?.is_fallback),
      response_body_snippet: `${responsePayload?.rawText || ""}`.trim(),
      is_html: Boolean(responsePayload?.isHtml)
    },
    {
      requestId,
      status: Number(response?.status || 0),
      scoreErrorCode,
      failureType
    }
  );
}

function normalizeScoreApiDiagnostics(diagnostics, fallback = {}) {
  const safe = isPlainObject(diagnostics) ? diagnostics : {};
  const scoreErrorCode = `${safe.score_error_code || fallback.scoreErrorCode || ""}`.trim();
  const failureType = normalizeFailureType(
    `${safe.failure_type || fallback.failureType || resolveFailureTypeFromScoreError(scoreErrorCode)}`.trim()
  );
  const statusNumber = Number(safe.status ?? fallback.status ?? 0);
  const status = Number.isFinite(statusNumber) ? Math.max(0, Math.round(statusNumber)) : 0;
  const requestId = `${safe.request_id || fallback.requestId || ""}`.trim();
  const statusText = `${safe.statusText || safe.status_text || ""}`.trim();
  const contentType = `${safe.contentType || safe.content_type || ""}`.trim().toLowerCase();
  const backendError = normalizeOptionalText(safe.backend_error);
  const backendCode = normalizeOptionalText(safe.backend_code);
  const backendMeta = isPlainObject(safe.backend_meta) ? safe.backend_meta : null;
  const providerAttempts = Array.isArray(safe.provider_attempts) ? safe.provider_attempts : [];
  const responseBodySnippet = `${safe.response_body_snippet || ""}`.trim().slice(0, 240);
  const isHttpError = status >= 400 || failureType === "http_error" || failureType === "auth_error";
  const isFetchFailed = failureType === "fetch_failed" || failureType === "timeout";

  return {
    request_id: requestId,
    status,
    statusText,
    contentType,
    score_error_code: scoreErrorCode,
    failure_type: failureType,
    is_http_error: isHttpError,
    is_fetch_failed: isFetchFailed,
    backend_error: backendError,
    backend_code: backendCode,
    backend_meta: backendMeta,
    provider_used: Object.prototype.hasOwnProperty.call(safe, "provider_used") ? safe.provider_used || null : null,
    last_provider_attempted: normalizeOptionalText(safe.last_provider_attempted),
    fallback_reason: normalizeOptionalText(safe.fallback_reason),
    fallback_error_type: normalizeOptionalText(safe.fallback_error_type),
    raw_error_type: normalizeOptionalText(safe.raw_error_type),
    error_stage: normalizeOptionalText(safe.error_stage),
    provider_attempts: providerAttempts,
    is_fallback: Boolean(safe.is_fallback),
    response_body_snippet: responseBodySnippet,
    is_html: Boolean(safe.is_html)
  };
}

function resolveScoreFailureType(error, scoreErrorCode) {
  const normalizedCode = `${scoreErrorCode || ""}`.trim();
  if (error?.name === "AbortError" || normalizedCode === "SCORE_API_TIMEOUT") return "timeout";
  if (normalizedCode === "AUTH_SESSION_MISSING" || normalizedCode === "AUTH_SESSION_EXPIRED") return "auth_error";
  if (isScoreApiKnownErrorCode(error?.code) || isScoreApiKnownErrorCode(normalizedCode)) return "http_error";
  return "fetch_failed";
}

function resolveFailureTypeFromScoreError(scoreErrorCode) {
  const normalizedCode = `${scoreErrorCode || ""}`.trim();
  if (!normalizedCode) return "unknown";
  if (normalizedCode === "SCORE_API_TIMEOUT") return "timeout";
  if (normalizedCode === "AUTH_SESSION_MISSING" || normalizedCode === "AUTH_SESSION_EXPIRED") return "auth_error";
  if (isScoreApiKnownErrorCode(normalizedCode)) return "http_error";
  if (normalizedCode === "SCORE_API_FAILED") return "fetch_failed";
  return "unknown";
}

function normalizeFailureType(value) {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (normalized === "timeout") return "timeout";
  if (normalized === "http_error") return "http_error";
  if (normalized === "fetch_failed") return "fetch_failed";
  if (normalized === "auth_error") return "auth_error";
  return normalized || "unknown";
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) return "";
  return `${value}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimTrailingSlash(value) {
  return `${value || ""}`.replace(/\/+$/, "");
}

function normalizeAbsoluteHttpUrl(value) {
  const normalized = `${value || ""}`.trim();
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function isRuntimeLocalOrigin() {
  if (typeof window === "undefined" || !window.location?.hostname) return false;
  const host = `${window.location.hostname || ""}`.trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function normalizeUrlKey(url) {
  const normalized = `${url || ""}`.trim();
  if (!normalized) return "";

  if (normalized.startsWith("/")) {
    return `relative:${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function buildSubmissionDebugInfo(transcript) {
  const safeText = `${transcript || ""}`.trim();
  const words = safeText ? safeText.split(/\s+/).filter(Boolean) : [];
  const excerpt = safeText.slice(0, 180);
  const hash = hashText(safeText);

  return {
    submitted_word_count: words.length,
    submitted_excerpt: excerpt,
    submitted_text_hash: hash
  };
}

function hashText(text) {
  let hash = 2166136261;
  const normalized = `${text || ""}`;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createRequestId(prefix = "req") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


