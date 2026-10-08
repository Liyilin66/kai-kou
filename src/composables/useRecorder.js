import { ref } from "vue";
import { detectSilences } from "../../backend/speech/silence.js";

export function useRecorder() {
  const isRecording = ref(false);
  const isReady = ref(false);
  const transcript = ref("");
  const audioBlob = ref(null);
  const error = ref(null);
  const isSupported = ref(true);
  const isStopping = ref(false);
  const currentAttemptId = ref(0);
  const lastStartMeta = ref(null);
  const lastStopMeta = ref(null);

  let recognition = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let recorderEngine = "";
  let webAudioRecorderHandle = null;
  let audioChunks = [];
  let lastChunkMimeType = "";
  let mediaDataEventCount = 0;
  let mediaNonEmptyDataEventCount = 0;
  let mediaChunkSizeList = [];
  let mediaChunkMimeTypeList = [];
  let mediaChunkTotalBytes = 0;
  let mediaLastDataAvailableAtMs = 0;
  let stopRequested = false;
  let restartCount = 0;
  let waitReadyResolver = null;
  let interimTranscript = "";
  let activeStopPromise = null;
  let activeStopAttemptId = 0;
  let stopCallCount = 0;
  let attemptCounter = 0;

  let mediaStopResolver = null;
  let mediaStopTimer = null;
  let mediaStopResolverAttemptId = 0;
  let recognitionStopResolver = null;
  let recognitionStopTimer = null;
  let recognitionStopResolverAttemptId = 0;

  const MAX_RESTARTS = 5;
  const MIC_WARMUP_MS = 300;
  const READY_TIMEOUT_MS = 2000;
  const MEDIARECORDER_START_WATCHDOG_MS = 1700;
  const MEDIARECORDER_START_WATCHDOG_IOS_SAFARI_MS = 2800;
  const AUDIO_PLAYABLE_VALIDATION_TIMEOUT_MS = 4000;
  const MEDIARECORDER_FINAL_CHUNK_GRACE_MS = 900;
  const MEDIARECORDER_FINAL_CHUNK_GRACE_IOS_WEBKIT_MS = 2600;
  const MEDIARECORDER_FINAL_DRAIN_POLL_MS = 90;
  const MEDIARECORDER_STOP_REQUESTDATA_LEAD_MS_IOS_WEBKIT = 120;
  const MEDIARECORDER_NO_AUDIO_RETRY_DELAY_MS = 280;
  const AUDIO_NON_SILENT_ABS_THRESHOLD = 0.01;
  const WEBAUDIO_BUFFER_SIZE = 4096;
  const RECOGNITION_STOP_TIMEOUT_MS = 5000;
  const MEDIA_STOP_TIMEOUT_MS = 8000;
  const MAX_AUDIO_BLOB_BYTES = 8 * 1024 * 1024;
  const MIN_AUDIO_BLOB_BYTES = 256;
  const PLATFORM_STRATEGY_IOS_SAFARI = "ios_safari_like";
  const PLATFORM_STRATEGY_ANDROID = "android_browser_like";
  const PLATFORM_STRATEGY_OTHER = "other";
  const MEDIARECORDER_START_CANDIDATES = [
    {
      createMode: "explicit_mime",
      mimeType: "audio/webm;codecs=opus",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "explicit_mime",
      mimeType: "audio/webm",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "explicit_mime",
      mimeType: "audio/mp4",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_no_timeslice",
      useTimeslice: false
    }
  ];
  const MEDIARECORDER_START_CANDIDATES_IOS_SAFARI = [
    {
      createMode: "explicit_mime",
      mimeType: "audio/mp4",
      startMode: "start_no_timeslice",
      useTimeslice: false
    },
    {
      createMode: "explicit_mime",
      mimeType: "audio/mp4",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_no_timeslice",
      useTimeslice: false
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_250",
      useTimeslice: true
    }
  ];
  const MEDIARECORDER_START_CANDIDATES_ANDROID = [
    {
      createMode: "explicit_mime",
      mimeType: "audio/webm;codecs=opus",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "explicit_mime",
      mimeType: "audio/webm",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_250",
      useTimeslice: true
    },
    {
      createMode: "default_constructor",
      mimeType: "",
      startMode: "start_no_timeslice",
      useTimeslice: false
    }
  ];
  const KNOWN_AUDIO_MIME_PREFIXES = [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg"
  ];
  const INVALID_AUDIO_BLOB_ISSUES = new Set([
    "AUDIO_BLOB_EMPTY",
    "AUDIO_BLOB_TOO_SMALL",
    "AUDIO_MIME_UNSUPPORTED",
    "AUDIO_BLOB_NOT_PLAYABLE"
  ]);

  function isVerboseRecorderDebugEnabled() {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage?.getItem("RTS_RECORDER_DEBUG") === "1";
    } catch {
      return false;
    }
  }

  function devLog(event, payload = {}) {
    if (!import.meta.env.DEV && !isVerboseRecorderDebugEnabled()) return;
    console.info(`[recorder] ${event}`, payload);
  }

  function captureChunkStatsSnapshot() {
    return {
      dataEventCount: Number(mediaDataEventCount || 0),
      nonEmptyDataEventCount: Number(mediaNonEmptyDataEventCount || 0),
      chunkSizeList: Array.isArray(mediaChunkSizeList) ? [...mediaChunkSizeList] : [],
      chunkMimeTypeList: Array.isArray(mediaChunkMimeTypeList) ? [...mediaChunkMimeTypeList] : [],
      chunkTotalBytes: Number(mediaChunkTotalBytes || 0),
      lastDataAvailableAtMs: Number(mediaLastDataAvailableAtMs || 0)
    };
  }

  function createAttemptId() {
    attemptCounter += 1;
    currentAttemptId.value = attemptCounter;
    return currentAttemptId.value;
  }

  function isAttemptCurrent(attemptId) {
    if (!attemptId) return false;
    return Number(currentAttemptId.value || 0) === Number(attemptId || 0);
  }

  function clearStopResolversAndTimers() {
    clearTimeout(mediaStopTimer);
    mediaStopTimer = null;
    mediaStopResolver = null;
    mediaStopResolverAttemptId = 0;

    clearTimeout(recognitionStopTimer);
    recognitionStopTimer = null;
    recognitionStopResolver = null;
    recognitionStopResolverAttemptId = 0;
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

  function waitForMs(ms) {
    const safeMs = Math.max(0, Number(ms || 0));
    if (!safeMs) return Promise.resolve();
    return new Promise((resolve) => {
      setTimeout(resolve, safeMs);
    });
  }

  function getSpeechRecognitionCtor() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  function isLikelyIOSSafariBrowser() {
    if (typeof navigator === "undefined") return false;
    const ua = `${navigator.userAgent || ""}`;
    const platform = `${navigator.platform || ""}`;
    const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
    const isIOSDevice = /iP(ad|hone|od)/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
    const hasSafariToken = /Safari/i.test(ua);
    const hasAppleWebKit = /AppleWebKit/i.test(ua);
    const isKnownOtherIOSBrowser = /(CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA|DuckDuckGo)/i.test(ua);
    return Boolean(isIOSDevice && hasSafariToken && hasAppleWebKit && !isKnownOtherIOSBrowser);
  }

  function isLikelyIOSWebKitRuntime() {
    if (typeof navigator === "undefined") return false;
    const ua = `${navigator.userAgent || ""}`;
    const platform = `${navigator.platform || ""}`;
    const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
    const isIOSDevice = /iP(ad|hone|od)/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
    const hasAppleWebKit = /AppleWebKit/i.test(ua);
    return Boolean(isIOSDevice && hasAppleWebKit);
  }

  function isAndroidLikeBrowser() {
    if (typeof navigator === "undefined") return false;
    return /Android/i.test(`${navigator.userAgent || ""}`);
  }

  function isLikelyHuaweiLikeDevice() {
    if (typeof navigator === "undefined") return false;
    const ua = `${navigator.userAgent || ""}`;
    const vendor = `${navigator.vendor || ""}`;
    return /(Huawei|HUAWEI|HONOR|HarmonyOS|HMOS)/i.test(`${ua} ${vendor}`);
  }

  function resolvePlatformStrategy() {
    if (isLikelyIOSSafariBrowser()) return PLATFORM_STRATEGY_IOS_SAFARI;
    if (isAndroidLikeBrowser()) return PLATFORM_STRATEGY_ANDROID;
    return PLATFORM_STRATEGY_OTHER;
  }

  function getPlatformStrategyConfig(strategy) {
    if (strategy === PLATFORM_STRATEGY_IOS_SAFARI) {
      return {
        platformStrategy: PLATFORM_STRATEGY_IOS_SAFARI,
        startWatchdogMs: MEDIARECORDER_START_WATCHDOG_IOS_SAFARI_MS,
        mediaRecorderCandidates: MEDIARECORDER_START_CANDIDATES_IOS_SAFARI
      };
    }
    if (strategy === PLATFORM_STRATEGY_ANDROID) {
      return {
        platformStrategy: PLATFORM_STRATEGY_ANDROID,
        startWatchdogMs: MEDIARECORDER_START_WATCHDOG_MS,
        mediaRecorderCandidates: MEDIARECORDER_START_CANDIDATES_ANDROID
      };
    }
    return {
      platformStrategy: PLATFORM_STRATEGY_OTHER,
      startWatchdogMs: MEDIARECORDER_START_WATCHDOG_MS,
      mediaRecorderCandidates: MEDIARECORDER_START_CANDIDATES
    };
  }

  function getMediaRecorderStartWatchdogMs() {
    return isLikelyIOSSafariBrowser()
      ? MEDIARECORDER_START_WATCHDOG_IOS_SAFARI_MS
      : MEDIARECORDER_START_WATCHDOG_MS;
  }

  function createStartMeta() {
    const safeNavigator = typeof navigator !== "undefined" ? navigator : null;
    const safeWindow = typeof window !== "undefined" ? window : null;
    const hasGetUserMedia = Boolean(safeNavigator?.mediaDevices?.getUserMedia);
    const hasMediaRecorder = typeof MediaRecorder !== "undefined";
    const hasSpeechRecognition = Boolean(getSpeechRecognitionCtor());
    return {
      attemptId: Number(currentAttemptId.value || 0),
      ua: safeNavigator?.userAgent || "",
      secureContext: Boolean(safeWindow?.isSecureContext),
      hasGetUserMedia,
      hasMediaRecorder,
      hasSpeechRecognition,
      platformStrategy: PLATFORM_STRATEGY_OTHER,
      isAndroidLike: isAndroidLikeBrowser(),
      isIOSSafari: isLikelyIOSSafariBrowser(),
      isHuaweiLike: false,
      allowWithoutSpeechRecognition: false,
      selectedMimeType: "",
      mediaRecorderStartWatchdogMs: MEDIARECORDER_START_WATCHDOG_MS,
      streamActive: false,
      audioTrackCount: 0,
      firstAudioTrackReadyState: "",
      firstAudioTrackEnabled: false,
      startAttempts: [],
      mediaRecorderAttempts: [],
      recorderEngine: "",
      webAudioFallbackTried: false,
      webAudioFallbackOk: false,
      webAudioFallbackErrorCode: "",
      webAudioFallbackErrorMessage: "",
      startErrorCode: "",
      startErrorMessage: "",
      speechEnabled: false,
      speechReason: ""
    };
  }

  function applyStartMetaPatch(patch = {}) {
    if (!lastStartMeta.value) return;
    Object.assign(lastStartMeta.value, patch);
  }

  function setStartFailure(code, message = "") {
    applyStartMetaPatch({
      startErrorCode: code || "",
      startErrorMessage: `${message || ""}`
    });
  }

  function appendStartAttempt(attempt = {}) {
    if (!lastStartMeta.value) return;
    if (!Array.isArray(lastStartMeta.value.startAttempts)) {
      lastStartMeta.value.startAttempts = [];
    }
    if (!Array.isArray(lastStartMeta.value.mediaRecorderAttempts)) {
      lastStartMeta.value.mediaRecorderAttempts = [];
    }
    const normalizedAttempt = {
      createMode: attempt.createMode || "",
      mimeType: attempt.mimeType || "",
      startMode: attempt.startMode || "",
      ok: Boolean(attempt.ok),
      errorCode: attempt.errorCode || "",
      errorName: attempt.errorName || "",
      errorMessage: attempt.errorMessage || ""
    };
    lastStartMeta.value.startAttempts.push(normalizedAttempt);
    lastStartMeta.value.mediaRecorderAttempts.push({ ...normalizedAttempt });
  }

  function setSpeechMode(reason, enabled) {
    applyStartMetaPatch({
      speechEnabled: Boolean(enabled),
      speechReason: reason || ""
    });
  }

  function normalizeMimeType(mimeType) {
    return `${mimeType || ""}`.trim().toLowerCase();
  }

  function normalizeMimeTypeBase(mimeType) {
    return normalizeMimeType(mimeType).split(";")[0].trim();
  }

  function isKnownAudioMimeType(mimeType) {
    const normalizedMimeType = normalizeMimeTypeBase(mimeType);
    if (!normalizedMimeType) return false;
    return KNOWN_AUDIO_MIME_PREFIXES.some((prefix) => normalizedMimeType.startsWith(prefix));
  }

  function resolveDefaultRecordingMimeType(platformStrategy = PLATFORM_STRATEGY_OTHER) {
    if (platformStrategy === PLATFORM_STRATEGY_IOS_SAFARI) return "audio/mp4";
    if (platformStrategy === PLATFORM_STRATEGY_ANDROID) return "audio/webm";
    return "audio/webm";
  }

  function resolvePreferredRecordingMimeType({
    recorderMimeType = "",
    chunkMimeType = "",
    startMetaMimeType = "",
    platformStrategy = PLATFORM_STRATEGY_OTHER
  } = {}) {
    const candidates = [
      normalizeMimeType(recorderMimeType),
      normalizeMimeType(chunkMimeType),
      normalizeMimeType(startMetaMimeType)
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (isKnownAudioMimeType(candidate)) return candidate;
    }
    return resolveDefaultRecordingMimeType(platformStrategy);
  }

  function isMimeTypePlayable(mimeType) {
    const normalizedMimeType = normalizeMimeType(mimeType);
    if (!normalizedMimeType) return false;
    if (typeof document === "undefined") return isKnownAudioMimeType(normalizedMimeType);

    try {
      const probe = document.createElement("audio");
      const directResult = `${probe.canPlayType(normalizedMimeType) || ""}`.toLowerCase();
      if (directResult === "probably" || directResult === "maybe") return true;

      const normalizedBase = normalizeMimeTypeBase(normalizedMimeType);
      const baseResult = `${probe.canPlayType(normalizedBase) || ""}`.toLowerCase();
      if (baseResult === "probably" || baseResult === "maybe") return true;
    } catch {
      // no-op
    }

    return isKnownAudioMimeType(normalizedMimeType);
  }

  function isFinitePositiveDuration(durationSeconds) {
    const duration = Number(durationSeconds || 0);
    return Number.isFinite(duration) && duration > 0;
  }

  function validateBlobPlayableWithAudioElement(blob, attemptId = 0, timeoutMs = AUDIO_PLAYABLE_VALIDATION_TIMEOUT_MS) {
    if (!isAttemptCurrent(attemptId)) {
      return Promise.resolve({
        supported: false,
        playable: false,
        method: "audio_element",
        durationSec: 0,
        staleAttempt: true,
        errorCode: "ATTEMPT_STALE"
      });
    }
    if (
      !blob
      || typeof document === "undefined"
      || typeof URL === "undefined"
      || typeof URL.createObjectURL !== "function"
    ) {
      return Promise.resolve({
        supported: false,
        playable: false,
        method: "audio_element",
        durationSec: 0,
        errorCode: "AUDIO_ELEMENT_UNAVAILABLE"
      });
    }

    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      let settled = false;
      let timer = null;
      let objectUrl = "";

      const finalize = (payload = {}) => {
        if (settled) return;
        settled = true;

        clearTimeout(timer);
        timer = null;
        audio.removeEventListener("loadedmetadata", onReady);
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("durationchange", onReady);
        audio.removeEventListener("error", onError);

        try {
          audio.pause();
        } catch {
          // no-op
        }
        try {
          audio.removeAttribute("src");
          audio.src = "";
          audio.load();
        } catch {
          // no-op
        }
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // no-op
          }
        }

        resolve({
          supported: true,
          playable: Boolean(payload.playable),
          method: "audio_element",
          durationSec: Number(payload.durationSec || 0),
          staleAttempt: Boolean(payload.staleAttempt),
          errorCode: `${payload.errorCode || ""}`
        });
      };

      const onReady = () => {
        if (!isAttemptCurrent(attemptId)) {
          finalize({
            playable: false,
            durationSec: 0,
            staleAttempt: true,
            errorCode: "ATTEMPT_STALE"
          });
          return;
        }
        const durationSec = Number(audio.duration || 0);
        if (isFinitePositiveDuration(durationSec)) {
          finalize({
            playable: true,
            durationSec,
            errorCode: ""
          });
          return;
        }
        if (Number(audio.readyState || 0) >= 3) {
          finalize({
            playable: true,
            durationSec: 0,
            errorCode: "AUDIO_ELEMENT_READYSTATE_ONLY"
          });
        }
      };

      const onError = () => {
        finalize({
          playable: false,
          durationSec: 0,
          staleAttempt: !isAttemptCurrent(attemptId),
          errorCode: "AUDIO_ELEMENT_ERROR"
        });
      };

      audio.preload = "metadata";
      audio.muted = true;
      audio.addEventListener("loadedmetadata", onReady);
      audio.addEventListener("canplay", onReady);
      audio.addEventListener("durationchange", onReady);
      audio.addEventListener("error", onError);

      timer = setTimeout(() => {
        finalize({
          playable: false,
          durationSec: 0,
          staleAttempt: !isAttemptCurrent(attemptId),
          errorCode: "AUDIO_ELEMENT_TIMEOUT"
        });
      }, timeoutMs);

      try {
        objectUrl = URL.createObjectURL(blob);
        if (!isAttemptCurrent(attemptId)) {
          finalize({
            playable: false,
            durationSec: 0,
            staleAttempt: true,
            errorCode: "ATTEMPT_STALE"
          });
          return;
        }
        audio.src = objectUrl;
        audio.load();
      } catch {
        finalize({
          playable: false,
          durationSec: 0,
          staleAttempt: !isAttemptCurrent(attemptId),
          errorCode: "AUDIO_ELEMENT_LOAD_FAILED"
        });
      }
    });
  }

  function decodeAudioDataCompat(audioContext, audioArrayBuffer) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const safeResolve = (decodedBuffer) => {
        if (settled) return;
        settled = true;
        resolve(decodedBuffer);
      };
      const safeReject = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      try {
        const maybePromise = audioContext.decodeAudioData(audioArrayBuffer, safeResolve, safeReject);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(safeResolve).catch(safeReject);
        }
      } catch (err) {
        safeReject(err);
      }
    });
  }

  async function validateBlobPlayableWithDecodeAudioData(blob, attemptId = 0) {
    if (!isAttemptCurrent(attemptId)) {
      return {
        supported: false,
        playable: false,
        method: "decode_audio_data",
        durationSec: 0,
        staleAttempt: true,
        errorCode: "ATTEMPT_STALE"
      };
    }
    const AudioContextCtor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioContextCtor || !blob || typeof blob.arrayBuffer !== "function") {
      return {
        supported: false,
        playable: false,
        method: "decode_audio_data",
        durationSec: 0,
        errorCode: "DECODE_AUDIO_UNAVAILABLE"
      };
    }

    let audioContext = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (!isAttemptCurrent(attemptId)) {
        return {
          supported: false,
          playable: false,
          method: "decode_audio_data",
          durationSec: 0,
          staleAttempt: true,
          errorCode: "ATTEMPT_STALE"
        };
      }
      if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
        return {
          supported: true,
          playable: false,
          method: "decode_audio_data",
          durationSec: 0,
          errorCode: "DECODE_ARRAYBUFFER_EMPTY"
        };
      }

      audioContext = new AudioContextCtor();
      const decodedBuffer = await decodeAudioDataCompat(audioContext, arrayBuffer.slice(0));
      if (!isAttemptCurrent(attemptId)) {
        return {
          supported: false,
          playable: false,
          method: "decode_audio_data",
          durationSec: 0,
          staleAttempt: true,
          errorCode: "ATTEMPT_STALE"
        };
      }
      const durationSec = Number(decodedBuffer?.duration || 0);
      if (isFinitePositiveDuration(durationSec)) {
        return {
          supported: true,
          playable: true,
          method: "decode_audio_data",
          durationSec,
          errorCode: ""
        };
      }
      return {
        supported: true,
        playable: false,
        method: "decode_audio_data",
        durationSec: 0,
        errorCode: "DECODE_DURATION_INVALID"
      };
    } catch (err) {
      return {
        supported: true,
        playable: false,
        method: "decode_audio_data",
        durationSec: 0,
        errorCode: err?.name ? `DECODE_FAILED_${err.name}` : "DECODE_FAILED"
      };
    } finally {
      try {
        if (audioContext && audioContext.state !== "closed") {
          await audioContext.close();
        }
      } catch {
        // no-op
      }
    }
  }

  async function validatePlayableAudioBlob(blob, mimeType, attemptId = 0) {
    if (!isAttemptCurrent(attemptId)) {
      return {
        playable: false,
        method: "none",
        durationSec: 0,
        staleAttempt: true,
        errorCode: "ATTEMPT_STALE"
      };
    }
    if (!blob || blob.size <= 0) {
      return {
        playable: false,
        method: "none",
        durationSec: 0,
        errorCode: "AUDIO_BLOB_EMPTY"
      };
    }
    const mimeTypeLikelyPlayable = isMimeTypePlayable(mimeType);

    const elementCheck = await validateBlobPlayableWithAudioElement(blob, attemptId);
    if (elementCheck?.staleAttempt || !isAttemptCurrent(attemptId)) {
      return {
        playable: false,
        method: "none",
        durationSec: 0,
        staleAttempt: true,
        errorCode: "ATTEMPT_STALE"
      };
    }
    if (elementCheck.playable) {
      return elementCheck;
    }

    const decodeCheck = await validateBlobPlayableWithDecodeAudioData(blob, attemptId);
    if (decodeCheck?.staleAttempt || !isAttemptCurrent(attemptId)) {
      return {
        playable: false,
        method: "none",
        durationSec: 0,
        staleAttempt: true,
        errorCode: "ATTEMPT_STALE"
      };
    }
    if (decodeCheck.playable) {
      return decodeCheck;
    }

    if (elementCheck.supported) {
      return {
        playable: false,
        method: elementCheck.method,
        durationSec: 0,
        errorCode: elementCheck.errorCode || decodeCheck.errorCode || (mimeTypeLikelyPlayable ? "AUDIO_NOT_PLAYABLE" : "AUDIO_MIME_UNSUPPORTED")
      };
    }

    if (decodeCheck.supported) {
      return {
        playable: false,
        method: decodeCheck.method,
        durationSec: 0,
        errorCode: decodeCheck.errorCode || (mimeTypeLikelyPlayable ? "AUDIO_NOT_PLAYABLE" : "AUDIO_MIME_UNSUPPORTED")
      };
    }

    return {
      playable: false,
      method: "none",
      durationSec: 0,
      errorCode: mimeTypeLikelyPlayable ? "PLAYABLE_VALIDATION_UNAVAILABLE" : "AUDIO_MIME_UNSUPPORTED"
    };
  }

  function isUsableAudioResult({ blob, hasAudio, blobSize, blobIssueCode, mimeType, previewPlayable }) {
    if (!blob || !hasAudio || blobSize <= 0) return false;
    if (typeof previewPlayable === "boolean" && previewPlayable) return true;
    if (INVALID_AUDIO_BLOB_ISSUES.has(`${blobIssueCode || ""}`)) return false;
    if (!isMimeTypePlayable(mimeType)) return false;
    if (typeof previewPlayable === "boolean") return previewPlayable;
    return true;
  }

  function detectBlobIssue({ blobSize, blobTooLarge, mimeType, previewPlayable = false }) {
    if (blobTooLarge) return "AUDIO_BLOB_TOO_LARGE";
    if (blobSize <= 0) return "AUDIO_BLOB_EMPTY";
    if (previewPlayable && blobSize > 0) return "";
    if (blobSize < MIN_AUDIO_BLOB_BYTES) return "AUDIO_BLOB_TOO_SMALL";

    if (!previewPlayable && !isKnownAudioMimeType(mimeType)) return "AUDIO_MIME_UNSUPPORTED";

    return "";
  }

  function createEmptyAudioAmplitudeStats({
    sampleRate = 0,
    channelCount = 0,
    durationMs = 0
  } = {}) {
    return {
      amplitudeStatsAvailable: false,
      peakAmplitude: 0,
      rmsAmplitude: 0,
      meanAbsAmplitude: 0,
      nonSilentFrameRatio: 0,
      sampleRate: Number(sampleRate || 0),
      channelCount: Number(channelCount || 0),
      durationMs: Number(durationMs || 0)
    };
  }

  function computeAudioAmplitudeStatsFromFloatSamples(
    floatSamples,
    { sampleRate = 0, channelCount = 1 } = {}
  ) {
    const samples = floatSamples instanceof Float32Array ? floatSamples : new Float32Array(0);
    const totalSampleCount = Number(samples.length || 0);
    const safeChannelCount = Math.max(1, Number(channelCount || 1));
    const safeSampleRate = Math.max(0, Number(sampleRate || 0));
    if (totalSampleCount <= 0) {
      return createEmptyAudioAmplitudeStats({
        sampleRate: safeSampleRate,
        channelCount: safeChannelCount,
        durationMs: 0
      });
    }

    let peakAmplitude = 0;
    let sumAbs = 0;
    let sumSq = 0;
    let nonSilentCount = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Number(samples[i] || 0);
      const absValue = Math.abs(sample);
      if (absValue > peakAmplitude) peakAmplitude = absValue;
      sumAbs += absValue;
      sumSq += sample * sample;
      if (absValue >= AUDIO_NON_SILENT_ABS_THRESHOLD) {
        nonSilentCount += 1;
      }
    }
    const meanAbsAmplitude = sumAbs / totalSampleCount;
    const rmsAmplitude = Math.sqrt(sumSq / totalSampleCount);
    const nonSilentFrameRatio = nonSilentCount / totalSampleCount;
    const frameCount = Math.max(1, Math.floor(totalSampleCount / safeChannelCount));
    const durationMs = safeSampleRate > 0
      ? Math.max(0, Math.round((frameCount / safeSampleRate) * 1000))
      : 0;
    let speechDiagnosis = null;
    if (import.meta.env.VITE_RA_DIAGNOSIS === "on" && safeSampleRate > 0) {
      const mono = new Float32Array(frameCount);
      for (let frame = 0; frame < frameCount; frame++) {
        for (let channel = 0; channel < safeChannelCount; channel++) {
          mono[frame] += samples[frame * safeChannelCount + channel] / safeChannelCount;
        }
      }
      speechDiagnosis = detectSilences(mono, safeSampleRate);
    }
    return {
      speechDiagnosis,
      amplitudeStatsAvailable: true,
      peakAmplitude: Number(peakAmplitude || 0),
      rmsAmplitude: Number(rmsAmplitude || 0),
      meanAbsAmplitude: Number(meanAbsAmplitude || 0),
      nonSilentFrameRatio: Number(nonSilentFrameRatio || 0),
      sampleRate: Number(safeSampleRate || 0),
      channelCount: Number(safeChannelCount || 0),
      durationMs: Number(durationMs || 0)
    };
  }

  async function analyzeBlobAudioAmplitudeStats(blob, attemptId = 0) {
    if (!blob || Number(blob.size || 0) <= 0) {
      return createEmptyAudioAmplitudeStats();
    }
    if (!isAttemptCurrent(attemptId)) {
      return createEmptyAudioAmplitudeStats();
    }
    const AudioContextCtor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioContextCtor || typeof blob.arrayBuffer !== "function") {
      return createEmptyAudioAmplitudeStats();
    }

    let audioContext = null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (!isAttemptCurrent(attemptId)) {
        return createEmptyAudioAmplitudeStats();
      }
      if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
        return createEmptyAudioAmplitudeStats();
      }

      audioContext = new AudioContextCtor();
      const decodedBuffer = await decodeAudioDataCompat(audioContext, arrayBuffer.slice(0));
      const sampleRate = Number(decodedBuffer?.sampleRate || 0);
      const channelCount = Math.max(1, Number(decodedBuffer?.numberOfChannels || 1));
      const frameCount = Math.max(0, Number(decodedBuffer?.length || 0));
      if (!frameCount) {
        return createEmptyAudioAmplitudeStats({
          sampleRate,
          channelCount,
          durationMs: 0
        });
      }

      const channelData = [];
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        channelData.push(decodedBuffer.getChannelData(channelIndex));
      }
      const merged = new Float32Array(frameCount * channelCount);
      let writeIndex = 0;
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
          merged[writeIndex] = Number(channelData[channelIndex]?.[frameIndex] || 0);
          writeIndex += 1;
        }
      }
      return computeAudioAmplitudeStatsFromFloatSamples(merged, {
        sampleRate,
        channelCount
      });
    } catch {
      return createEmptyAudioAmplitudeStats();
    } finally {
      try {
        if (audioContext?.state !== "closed") {
          await audioContext?.close?.();
        }
      } catch {
        // no-op
      }
    }
  }

  function resolveReadyWait() {
    if (!waitReadyResolver) return;
    waitReadyResolver();
    waitReadyResolver = null;
  }

  function resolveRecognitionStopWait(payload = {}, attemptId = null) {
    if (!recognitionStopResolver) return;
    if (
      attemptId !== null
      && recognitionStopResolverAttemptId
      && Number(recognitionStopResolverAttemptId) !== Number(attemptId)
    ) {
      return;
    }
    const resolve = recognitionStopResolver;
    recognitionStopResolver = null;
    recognitionStopResolverAttemptId = 0;
    clearTimeout(recognitionStopTimer);
    recognitionStopTimer = null;
    resolve(payload);
  }

  function resolveMediaStopWait(payload = {}, attemptId = null) {
    if (!mediaStopResolver) return;
    if (
      attemptId !== null
      && mediaStopResolverAttemptId
      && Number(mediaStopResolverAttemptId) !== Number(attemptId)
    ) {
      return;
    }
    const resolve = mediaStopResolver;
    mediaStopResolver = null;
    mediaStopResolverAttemptId = 0;
    clearTimeout(mediaStopTimer);
    mediaStopTimer = null;
    resolve(payload);
  }

  function cleanupMediaStream() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  function getStreamRuntimeMeta(stream) {
    const audioTracks = stream?.getAudioTracks?.() || [];
    const firstAudioTrack = audioTracks[0];
    return {
      streamActive: Boolean(stream?.active),
      audioTrackCount: audioTracks.length,
      firstAudioTrackReadyState: `${firstAudioTrack?.readyState || ""}`,
      firstAudioTrackEnabled: Boolean(firstAudioTrack?.enabled)
    };
  }

  function getStreamStopTrackMeta(stream) {
    const audioTracks = stream?.getAudioTracks?.() || [];
    const firstAudioTrack = audioTracks[0] || null;
    const hasMuted = Boolean(firstAudioTrack && ("muted" in firstAudioTrack));
    return {
      streamActiveAtStop: Boolean(stream?.active),
      trackReadyStateAtStop: `${firstAudioTrack?.readyState || ""}`,
      trackEnabledAtStop: firstAudioTrack ? Boolean(firstAudioTrack.enabled) : false,
      trackMutedAtStop: hasMuted ? Boolean(firstAudioTrack?.muted) : null
    };
  }

  function evaluateStreamUsabilityForWebAudio(stream, { relaxed = false } = {}) {
    const runtimeMeta = getStreamRuntimeMeta(stream);
    const normalizedReadyState = `${runtimeMeta.firstAudioTrackReadyState || ""}`.trim().toLowerCase();
    const hasAudioTrack = Number(runtimeMeta.audioTrackCount || 0) > 0;
    const strictOk = Boolean(runtimeMeta.streamActive) && hasAudioTrack && normalizedReadyState === "live";
    if (strictOk) {
      return {
        ok: true,
        relaxed,
        runtimeMeta: {
          ...runtimeMeta,
          firstAudioTrackReadyState: normalizedReadyState || runtimeMeta.firstAudioTrackReadyState
        }
      };
    }
    if (!relaxed) {
      return {
        ok: false,
        relaxed,
        runtimeMeta: {
          ...runtimeMeta,
          firstAudioTrackReadyState: normalizedReadyState || runtimeMeta.firstAudioTrackReadyState
        }
      };
    }
    const relaxedOk = hasAudioTrack && normalizedReadyState !== "ended";
    return {
      ok: relaxedOk,
      relaxed,
      runtimeMeta: {
        ...runtimeMeta,
        firstAudioTrackReadyState: normalizedReadyState || runtimeMeta.firstAudioTrackReadyState
      }
    };
  }

  function createMediaRecorderCandidate(stream, config = {}) {
    const createMode = config.createMode || "default_constructor";
    const mimeType = `${config.mimeType || ""}`;
    const startMode = config.startMode || "start_250";
    const baseAttempt = {
      createMode,
      mimeType,
      startMode,
      ok: false,
      errorCode: "",
      errorName: "",
      errorMessage: ""
    };

    if (typeof MediaRecorder === "undefined") {
      return {
        ok: false,
        recorder: null,
        attempt: {
          ...baseAttempt,
          errorCode: "MEDIA_UNSUPPORTED",
          errorName: "NotSupportedError",
          errorMessage: "mediarecorder_unavailable"
        }
      };
    }

    if (
      mimeType &&
      typeof MediaRecorder.isTypeSupported === "function" &&
      !MediaRecorder.isTypeSupported(mimeType)
    ) {
      return {
        ok: false,
        recorder: null,
        attempt: {
          ...baseAttempt,
          errorCode: "MEDIARECORDER_MIME_UNSUPPORTED",
          errorName: "NotSupportedError",
          errorMessage: `mime_not_supported:${mimeType}`
        }
      };
    }

    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      return {
        ok: true,
        recorder,
        attempt: baseAttempt
      };
    } catch (err) {
      return {
        ok: false,
        recorder: null,
        attempt: {
          ...baseAttempt,
          errorCode: "MEDIARECORDER_CREATE_FAILED",
          errorName: err?.name || "MediaRecorderCreateError",
          errorMessage: err?.message || "mediarecorder_create_failed"
        }
      };
    }
  }

  function waitForRecorderStart(recorder, timeoutMs = MEDIARECORDER_START_WATCHDOG_MS) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const cleanup = () => {
        clearTimeout(timer);
        timer = null;
        recorder.removeEventListener?.("start", onStart);
        recorder.removeEventListener?.("error", onError);
      };

      const finalize = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };

      const onStart = () => {
        finalize({
          ok: true,
          errorCode: "",
          errorName: "",
          errorMessage: ""
        });
      };

      const onError = (event) => {
        const rawError = event?.error || event;
        finalize({
          ok: false,
          errorCode: "MEDIARECORDER_START_FAILED",
          errorName: rawError?.name || "MediaRecorderStartError",
          errorMessage: rawError?.message || "mediarecorder_start_event_error"
        });
      };

      recorder.addEventListener?.("start", onStart);
      recorder.addEventListener?.("error", onError);
      timer = setTimeout(() => {
        finalize({
          ok: false,
          errorCode: "MEDIARECORDER_START_TIMEOUT",
          errorName: "TimeoutError",
          errorMessage: `mediarecorder_start_timeout_${timeoutMs}ms`
        });
      }, timeoutMs);
    });
  }

  function cleanupFailedRecorderCandidate(recorder) {
    if (!recorder) return;
    try {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      recorder.onstart = null;
    } catch {
      // no-op
    }
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch {
      // no-op
    }
  }

  function attachRecorderEventHandlers(recorder, attemptId) {
    if (!recorder) return;

    recorder.ondataavailable = (event) => {
      if (!isAttemptCurrent(attemptId)) return;
      const chunk = event?.data || null;
      const chunkSize = Math.max(0, Number(chunk?.size || 0));
      const chunkMimeType = `${chunk?.type || ""}`.trim();
      mediaDataEventCount += 1;
      mediaLastDataAvailableAtMs = Date.now();
      mediaChunkSizeList.push(chunkSize);
      mediaChunkMimeTypeList.push(chunkMimeType);
      if (mediaChunkSizeList.length > 120) mediaChunkSizeList = mediaChunkSizeList.slice(-120);
      if (mediaChunkMimeTypeList.length > 120) mediaChunkMimeTypeList = mediaChunkMimeTypeList.slice(-120);

      if (chunk && chunkSize > 0) {
        lastChunkMimeType = `${chunk.type || lastChunkMimeType || ""}`.trim();
        audioChunks.push(chunk);
        mediaNonEmptyDataEventCount += 1;
        mediaChunkTotalBytes += chunkSize;
      }
      devLog("media:dataavailable", {
        attemptId,
        chunkSize,
        chunkMimeType,
        dataEventCount: Number(mediaDataEventCount || 0),
        nonEmptyDataEventCount: Number(mediaNonEmptyDataEventCount || 0),
        chunkCount: Number(audioChunks.length || 0),
        chunkTotalBytes: Number(mediaChunkTotalBytes || 0)
      });
    };

    recorder.onerror = (event) => {
      devLog("media:error", { error: event?.error?.name || event?.error || "unknown" });
    };

    recorder.onstop = () => {
      void (async () => {
        const platformStrategy = `${lastStartMeta.value?.platformStrategy || resolvePlatformStrategy()}`;
        const isIOSWebKitLike = platformStrategy === PLATFORM_STRATEGY_IOS_SAFARI || isLikelyIOSWebKitRuntime();
        const finalDrainWindowMs = isIOSWebKitLike
          ? MEDIARECORDER_FINAL_CHUNK_GRACE_IOS_WEBKIT_MS
          : MEDIARECORDER_FINAL_CHUNK_GRACE_MS;
        const chunkBytesBeforeDrain = Number(mediaChunkTotalBytes || 0);
        const dataEventsBeforeDrain = Number(mediaDataEventCount || 0);
        const finalDrainStartedAt = getNowMs();
        let finalDrainWaitMs = 0;
        let finalDrainUsed = false;
        if ((audioChunks.length <= 0 || chunkBytesBeforeDrain <= 0) && finalDrainWindowMs > 0) {
          finalDrainUsed = true;
          const drainDeadlineAt = finalDrainStartedAt + finalDrainWindowMs;
          while (getNowMs() < drainDeadlineAt) {
            if (audioChunks.length > 0 && Number(mediaChunkTotalBytes || 0) > 0) {
              break;
            }
            await waitForMs(MEDIARECORDER_FINAL_DRAIN_POLL_MS);
          }
          finalDrainWaitMs = getElapsedMs(finalDrainStartedAt);
        }

        const chunkStats = captureChunkStatsSnapshot();
        const stopTrackMeta = getStreamStopTrackMeta(mediaStream);
        if (!isAttemptCurrent(attemptId)) {
          resolveMediaStopWait({
            timedOut: false,
            skipped: true,
            staleAttempt: true,
            chunkCount: 0,
            rawChunkCount: Number(audioChunks.length || 0),
            rawChunkBytes: Number(chunkStats.chunkTotalBytes || 0),
            blobSize: 0,
            mimeType: resolvePreferredRecordingMimeType({
              recorderMimeType: recorder?.mimeType || "",
              chunkMimeType: lastChunkMimeType,
              startMetaMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
              platformStrategy
            }),
            mediaRecorderMimeType: `${recorder?.mimeType || ""}`,
            chunkMimeType: `${lastChunkMimeType || ""}`,
            lastChunkMimeType: `${lastChunkMimeType || ""}`,
            selectedMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
            mediaRecorderStateAfterStop: `${recorder?.state || "inactive"}`,
            finalDrainWindowMs: Number(finalDrainWindowMs || 0),
            finalDrainWaitMs: Number(finalDrainWaitMs || 0),
            finalDrainUsed: Boolean(finalDrainUsed),
            chunkBytesBeforeDrain: Number(chunkBytesBeforeDrain || 0),
            dataEventsBeforeDrain: Number(dataEventsBeforeDrain || 0),
            ...stopTrackMeta,
            ...chunkStats
          }, attemptId);
          return;
        }

        const mimeType = resolvePreferredRecordingMimeType({
          recorderMimeType: recorder?.mimeType || "",
          chunkMimeType: lastChunkMimeType,
          startMetaMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
          platformStrategy
        });
        audioBlob.value = new Blob(audioChunks, { type: mimeType });
        const meta = {
          chunkCount: Number(audioChunks.length || 0),
          rawChunkCount: Number(audioChunks.length || 0),
          rawChunkBytes: Number(chunkStats.chunkTotalBytes || 0),
          blobSize: Number(audioBlob.value?.size || 0),
          mimeType: audioBlob.value?.type || mimeType,
          mediaRecorderMimeType: `${recorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          lastChunkMimeType: `${lastChunkMimeType || ""}`,
          selectedMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
          mediaRecorderStateAfterStop: `${recorder?.state || "inactive"}`,
          finalDrainWindowMs: Number(finalDrainWindowMs || 0),
          finalDrainWaitMs: Number(finalDrainWaitMs || 0),
          finalDrainUsed: Boolean(finalDrainUsed),
          chunkBytesBeforeDrain: Number(chunkBytesBeforeDrain || 0),
          dataEventsBeforeDrain: Number(dataEventsBeforeDrain || 0),
          ...stopTrackMeta,
          ...chunkStats
        };
        devLog("media:stopped", meta);
        cleanupMediaStream();
        resolveMediaStopWait({ timedOut: false, ...meta }, attemptId);
      })();
    };
  }

  function setRecorderEngine(engine) {
    recorderEngine = engine || "";
    applyStartMetaPatch({
      recorderEngine
    });
  }

  function mergePcmChunks(floatChunks, totalSampleCount) {
    const safeTotal = Math.max(0, Number(totalSampleCount || 0));
    const merged = new Float32Array(safeTotal);
    let offset = 0;
    for (const chunk of floatChunks || []) {
      if (!chunk || !chunk.length) continue;
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  function encodeWavFromPcm(floatSamples, sampleRate = 44100) {
    const pcmSamples = floatSamples instanceof Float32Array ? floatSamples : new Float32Array(0);
    const safeSampleRate = Math.max(8000, Math.floor(sampleRate || 44100));
    const bytesPerSample = 2;
    const channelCount = 1;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = pcmSamples.length * bytesPerSample;
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);

    const writeString = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, safeSampleRate, true);
    view.setUint32(28, safeSampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let dataOffset = 44;
    for (let i = 0; i < pcmSamples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, pcmSamples[i]));
      const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(dataOffset, int16Sample, true);
      dataOffset += 2;
    }

    return new Blob([wavBuffer], { type: "audio/wav" });
  }

  async function ensureAudioContextRunning(audioContext) {
    if (!audioContext) return false;
    if (audioContext.state === "running") return true;
    for (let i = 0; i < 3; i += 1) {
      try {
        await audioContext.resume();
      } catch {
        // no-op
      }
      if (audioContext.state === "running") return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return audioContext.state === "running";
  }

  async function createWebAudioRecorder(stream) {
    const AudioContextCtor = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioContextCtor) {
      return {
        ok: false,
        errorCode: "WEBAUDIO_UNSUPPORTED",
        errorName: "NotSupportedError",
        errorMessage: "audiocontext_unavailable",
        handle: null
      };
    }

    let audioContext = null;
    let sourceNode = null;
    let processorNode = null;
    let silentGainNode = null;
    try {
      audioContext = new AudioContextCtor();
      await ensureAudioContextRunning(audioContext);

      sourceNode = audioContext.createMediaStreamSource(stream);
      processorNode = audioContext.createScriptProcessor(WEBAUDIO_BUFFER_SIZE, 1, 1);
      silentGainNode = audioContext.createGain();
      silentGainNode.gain.value = 0;
      const pcmChunks = [];
      const handle = {
        audioContext,
        sourceNode,
        processorNode,
        silentGainNode,
        pcmChunks,
        totalSampleCount: 0,
        sampleRate: audioContext.sampleRate || 44100,
        channelCount: 1,
        stopPromise: null,
        finalized: false
      };

      processorNode.onaudioprocess = (event) => {
        if (handle.finalized) return;
        const inputData = event?.inputBuffer?.getChannelData?.(0);
        if (!inputData || !inputData.length) return;
        const copied = new Float32Array(inputData.length);
        copied.set(inputData);
        pcmChunks.push(copied);
        handle.totalSampleCount += copied.length;
      };

      sourceNode.connect(processorNode);
      processorNode.connect(silentGainNode);
      silentGainNode.connect(audioContext.destination);

      if (!(await ensureAudioContextRunning(audioContext))) {
        throw new Error("webaudio_context_not_running");
      }

      return {
        ok: true,
        errorCode: "",
        errorName: "",
        errorMessage: "",
        handle
      };
    } catch (err) {
      try {
        processorNode?.disconnect();
      } catch {
        // no-op
      }
      try {
        silentGainNode?.disconnect();
      } catch {
        // no-op
      }
      try {
        sourceNode?.disconnect();
      } catch {
        // no-op
      }
      try {
        await audioContext?.close?.();
      } catch {
        // no-op
      }
      return {
        ok: false,
        errorCode: "WEBAUDIO_CREATE_FAILED",
        errorName: err?.name || "WebAudioCreateError",
        errorMessage: err?.message || "webaudio_create_failed",
        handle: null
      };
    }
  }

  async function stopWebAudioRecorder(handle) {
    if (!handle) {
      return {
        ok: false,
        errorCode: "WEBAUDIO_STOP_HANDLE_MISSING",
        errorMessage: "webaudio_handle_missing",
        chunkCount: 0,
        totalSampleCount: 0,
        wavEncodeInputSampleCount: 0,
        blob: null,
        mimeType: "audio/wav",
        audioAmplitudeStats: createEmptyAudioAmplitudeStats()
      };
    }

    if (handle.stopPromise) {
      return handle.stopPromise;
    }

    handle.stopPromise = (async () => {
      try {
        handle.finalized = true;
        if (handle.processorNode) {
          handle.processorNode.onaudioprocess = null;
        }
        try {
          handle.silentGainNode?.disconnect();
        } catch {
          // no-op
        }
        try {
          handle.sourceNode?.disconnect();
        } catch {
          // no-op
        }
        try {
          handle.processorNode?.disconnect();
        } catch {
          // no-op
        }
        try {
          if (handle.audioContext?.state !== "closed") {
            await handle.audioContext?.close?.();
          }
        } catch {
          // no-op
        }

        const mergedPcm = mergePcmChunks(handle.pcmChunks, handle.totalSampleCount);
        const wavBlob = encodeWavFromPcm(mergedPcm, handle.sampleRate);
        return {
          ok: true,
          errorCode: "",
          errorMessage: "",
          chunkCount: handle.pcmChunks.length,
          totalSampleCount: Number(handle.totalSampleCount || 0),
          wavEncodeInputSampleCount: Number(mergedPcm.length || 0),
          blob: wavBlob,
          mimeType: "audio/wav",
          audioAmplitudeStats: computeAudioAmplitudeStatsFromFloatSamples(mergedPcm, {
            sampleRate: handle.sampleRate,
            channelCount: handle.channelCount
          })
        };
      } catch (err) {
        return {
          ok: false,
          errorCode: "WEBAUDIO_STOP_FAILED",
          errorMessage: err?.message || "webaudio_stop_failed",
          chunkCount: Number(handle?.pcmChunks?.length || 0),
          totalSampleCount: Number(handle?.totalSampleCount || 0),
          wavEncodeInputSampleCount: 0,
          blob: null,
          mimeType: "audio/wav",
          audioAmplitudeStats: createEmptyAudioAmplitudeStats()
        };
      }
    })();

    return handle.stopPromise;
  }

  async function tryStartFallbackAudioEngine(stream, attemptId = 0) {
    if (!isAttemptCurrent(attemptId)) return false;
    const platformStrategy = `${lastStartMeta.value?.platformStrategy || resolvePlatformStrategy()}`;
    const hasMediaRecorder = Boolean(lastStartMeta.value?.hasMediaRecorder);
    const allowRelaxedStreamGate = platformStrategy === PLATFORM_STRATEGY_IOS_SAFARI || !hasMediaRecorder;
    applyStartMetaPatch({
      webAudioFallbackTried: true,
      webAudioFallbackOk: false,
      webAudioFallbackErrorCode: "",
      webAudioFallbackErrorMessage: ""
    });

    let streamCheck = evaluateStreamUsabilityForWebAudio(stream);
    if (!streamCheck.ok && allowRelaxedStreamGate) {
      const firstAudioTrack = stream?.getAudioTracks?.()?.[0] || null;
      if (firstAudioTrack && firstAudioTrack.enabled === false) {
        try {
          firstAudioTrack.enabled = true;
        } catch {
          // no-op
        }
      }
      await waitForMs(120);
      streamCheck = evaluateStreamUsabilityForWebAudio(stream, { relaxed: true });
    }
    if (!streamCheck.ok) {
      const code = "WEBAUDIO_STREAM_NOT_LIVE";
      const message = "audio_stream_not_live";
      applyStartMetaPatch({
        ...streamCheck.runtimeMeta,
        webAudioFallbackOk: false,
        webAudioFallbackErrorCode: code,
        webAudioFallbackErrorMessage: message
      });
      return false;
    }
    applyStartMetaPatch(streamCheck.runtimeMeta);

    const created = await createWebAudioRecorder(stream);
    if (!isAttemptCurrent(attemptId)) {
      try {
        await stopWebAudioRecorder(created?.handle || null);
      } catch {
        // no-op
      }
      return false;
    }
    if (!created.ok || !created.handle) {
      applyStartMetaPatch({
        webAudioFallbackOk: false,
        webAudioFallbackErrorCode: created.errorCode || "WEBAUDIO_CREATE_FAILED",
        webAudioFallbackErrorMessage: created.errorMessage || "webaudio_create_failed"
      });
      return false;
    }

    webAudioRecorderHandle = created.handle;
    setRecorderEngine("web_audio_wav");
    applyStartMetaPatch({
      selectedMimeType: "audio/wav",
      webAudioFallbackOk: true,
      webAudioFallbackErrorCode: "",
      webAudioFallbackErrorMessage: ""
    });
    return true;
  }

  async function tryStartMediaRecorderWithFallback(stream, options = {}, attemptId = 0) {
    const startWatchdogMs = Number(options?.startWatchdogMs || MEDIARECORDER_START_WATCHDOG_MS);
    const candidates = Array.isArray(options?.candidates) && options.candidates.length > 0
      ? options.candidates
      : MEDIARECORDER_START_CANDIDATES;
    for (const candidate of candidates) {
      const created = createMediaRecorderCandidate(stream, candidate);
      if (!created.ok || !created.recorder) {
        appendStartAttempt(created.attempt);
        continue;
      }

      const recorder = created.recorder;
      let startResult;

      try {
        if (candidate.useTimeslice) {
          recorder.start(250);
        } else {
          recorder.start();
        }
        startResult = await waitForRecorderStart(recorder, startWatchdogMs);
      } catch (err) {
        startResult = {
          ok: false,
          errorCode: "MEDIARECORDER_START_FAILED",
          errorName: err?.name || "MediaRecorderStartError",
          errorMessage: err?.message || "mediarecorder_start_failed"
        };
      }

      if (startResult?.ok) {
        if (!isAttemptCurrent(attemptId)) {
          cleanupFailedRecorderCandidate(recorder);
          return false;
        }
        mediaRecorder = recorder;
        audioChunks = [];
        mediaDataEventCount = 0;
        mediaNonEmptyDataEventCount = 0;
        mediaChunkSizeList = [];
        mediaChunkMimeTypeList = [];
        mediaChunkTotalBytes = 0;
        mediaLastDataAvailableAtMs = 0;
        audioBlob.value = null;
        attachRecorderEventHandlers(mediaRecorder, attemptId);
        appendStartAttempt({
          ...created.attempt,
          ok: true
        });
        applyStartMetaPatch({
          selectedMimeType: mediaRecorder?.mimeType || candidate.mimeType || ""
        });
        return true;
      }

      appendStartAttempt({
        ...created.attempt,
        ok: false,
        errorCode: startResult?.errorCode || "MEDIARECORDER_START_FAILED",
        errorName: startResult?.errorName || "",
        errorMessage: startResult?.errorMessage || ""
      });
      cleanupFailedRecorderCandidate(recorder);
    }

    return false;
  }

  function waitForAudioSignal(stream, timeoutMs = 2000) {
    return new Promise((resolve) => {
      let ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        resolve();
        return;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const deadline = Date.now() + timeoutMs;

      function cleanup() {
        try {
          source.disconnect();
          ctx.close();
        } catch {
          // no-op
        }
      }

      function check() {
        if (Date.now() >= deadline) {
          cleanup();
          resolve();
          return;
        }

        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const normalized = (buf[i] - 128) / 128;
          sum += normalized * normalized;
        }

        if (Math.sqrt(sum / buf.length) > 0.01) {
          cleanup();
          resolve();
          return;
        }

        setTimeout(check, 80);
      }

      check();
    });
  }

  function restartRecognitionWithDelay(delay = 120) {
    if (!recognition || stopRequested || !isRecording.value || restartCount >= MAX_RESTARTS) return;
    restartCount += 1;

    try {
      recognition.stop();
    } catch {
      // no-op
    }

    setTimeout(() => {
      if (!recognition || stopRequested || !isRecording.value) return;
      try {
        recognition.start();
      } catch {
        // no-op
      }
    }, delay);
  }

  function buildFinalTranscript() {
    return `${transcript.value || ""} ${interimTranscript || ""}`.trim().replace(/\s+/g, " ");
  }

  function waitForRecognitionStop(attemptId = 0) {
    if (!recognition) {
      return Promise.resolve({ timedOut: false, skipped: true });
    }

    return new Promise((resolve) => {
      recognitionStopResolver = resolve;
      recognitionStopResolverAttemptId = Number(attemptId || 0);
      recognitionStopTimer = setTimeout(() => {
        resolveRecognitionStopWait({ timedOut: true }, attemptId);
      }, RECOGNITION_STOP_TIMEOUT_MS);
    });
  }

  function waitForMediaStop(attemptId = 0) {
    const platformStrategy = `${lastStartMeta.value?.platformStrategy || resolvePlatformStrategy()}`;
    const fallbackMimeType = resolvePreferredRecordingMimeType({
      recorderMimeType: `${mediaRecorder?.mimeType || ""}`,
      chunkMimeType: `${lastChunkMimeType || ""}`,
      startMetaMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
      platformStrategy
    });
    const chunkStats = captureChunkStatsSnapshot();
    const stopTrackMeta = getStreamStopTrackMeta(mediaStream);
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return Promise.resolve({
        timedOut: false,
        skipped: true,
        chunkCount: Number(audioChunks.length || 0),
        rawChunkCount: Number(audioChunks.length || 0),
        rawChunkBytes: Number(chunkStats.chunkTotalBytes || 0),
        blobSize: audioBlob.value?.size || 0,
        mimeType: audioBlob.value?.type || fallbackMimeType,
        mediaRecorderMimeType: `${mediaRecorder?.mimeType || ""}`,
        chunkMimeType: `${lastChunkMimeType || ""}`,
        lastChunkMimeType: `${lastChunkMimeType || ""}`,
        selectedMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
        mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
        finalDrainWaitMs: 0,
        finalDrainWindowMs: 0,
        stopWaitMs: 0,
        ...stopTrackMeta,
        ...chunkStats
      });
    }

    return new Promise((resolve) => {
      mediaStopResolver = resolve;
      mediaStopResolverAttemptId = Number(attemptId || 0);
      mediaStopTimer = setTimeout(() => {
        resolveMediaStopWait({
          timedOut: true,
          chunkCount: Number(audioChunks.length || 0),
          rawChunkCount: Number(audioChunks.length || 0),
          rawChunkBytes: Number(captureChunkStatsSnapshot().chunkTotalBytes || 0),
          blobSize: audioBlob.value?.size || 0,
          mimeType: audioBlob.value?.type || fallbackMimeType,
          mediaRecorderMimeType: `${mediaRecorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          lastChunkMimeType: `${lastChunkMimeType || ""}`,
          selectedMimeType: `${lastStartMeta.value?.selectedMimeType || ""}`,
          mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
          finalDrainWaitMs: 0,
          finalDrainWindowMs: 0,
          ...getStreamStopTrackMeta(mediaStream),
          ...captureChunkStatsSnapshot()
        }, attemptId);
      }, MEDIA_STOP_TIMEOUT_MS);
    });
  }

  function initSpeechRecognition(attemptId = 0) {
    const SpeechRecognition = getSpeechRecognitionCtor();

    if (!SpeechRecognition) {
      recognition = null;
      setSpeechMode("SPEECH_RECOGNITION_UNSUPPORTED", false);
      return { ok: false, reason: "SPEECH_RECOGNITION_UNSUPPORTED" };
    }

    try {
      recognition = new SpeechRecognition();
    } catch (err) {
      recognition = null;
      setSpeechMode("SPEECH_RECOGNITION_INIT_FAILED", false);
      applyStartMetaPatch({
        speechErrorCode: "SPEECH_RECOGNITION_INIT_FAILED",
        speechErrorMessage: err?.message || "speech_init_failed"
      });
      devLog("speech:init_failed", {
        error: err?.message || "speech_init_failed"
      });
      return { ok: false, reason: "SPEECH_RECOGNITION_INIT_FAILED" };
    }

    setSpeechMode("SPEECH_RECOGNITION_ENABLED", true);
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!isAttemptCurrent(attemptId)) return;
      restartCount = 0;
      applyStartMetaPatch({
        speechErrorCode: "",
        speechErrorMessage: ""
      });
    };

    recognition.onresult = (event) => {
      if (!isAttemptCurrent(attemptId)) return;
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const current = `${event.results[i][0]?.transcript || ""}`.trim();
        if (!current) continue;
        if (event.results[i].isFinal) {
          finalText += `${current} `;
        } else {
          interimText += `${current} `;
        }
      }

      if (finalText) {
        transcript.value = `${transcript.value} ${finalText}`.trim().replace(/\s+/g, " ");
        restartCount = 0;
      }
      interimTranscript = interimText.trim();
    };

    recognition.onerror = (event) => {
      if (!isAttemptCurrent(attemptId)) return;
      const speechError = `${event?.error || ""}`;
      if (speechError === "aborted") {
        return;
      }

      if (speechError === "no-speech") {
        if (!stopRequested) restartRecognitionWithDelay(120);
        return;
      }

      const speechErrorCode = speechError === "not-allowed" || speechError === "service-not-allowed"
        ? "SPEECH_RECOGNITION_PERMISSION_DENIED"
        : speechError === "audio-capture"
          ? "SPEECH_RECOGNITION_AUDIO_CAPTURE_FAILED"
          : speechError === "network"
            ? "SPEECH_RECOGNITION_NETWORK_ERROR"
            : "SPEECH_RECOGNITION_RUNTIME_ERROR";
      const speechErrorMessage = speechError === "not-allowed" || speechError === "service-not-allowed"
        ? "语音识别权限未开启，请允许浏览器访问麦克风后重试。"
        : speechError === "audio-capture"
          ? "语音识别无法获取麦克风输入，请检查麦克风后重试。"
          : speechError === "network"
            ? "语音识别网络异常，已进入兼容录音模式，可继续录音。"
            : `语音识别异常：${speechError || "unknown"}`;

      setSpeechMode(speechErrorCode, false);
      applyStartMetaPatch({
        speechErrorCode,
        speechErrorMessage
      });
      recognition = null;
      if (!stopRequested) {
        error.value = speechErrorMessage;
      }
      resolveRecognitionStopWait({ timedOut: false, degraded: true }, attemptId);
    };

    recognition.onend = () => {
      if (!isAttemptCurrent(attemptId)) return;
      if (stopRequested) {
        transcript.value = buildFinalTranscript();
        interimTranscript = "";
        resolveRecognitionStopWait({ timedOut: false }, attemptId);
        return;
      }

      if (isRecording.value) {
        restartRecognitionWithDelay(200);
      }
    };

    return { ok: true, reason: "SPEECH_RECOGNITION_READY" };
  }

  async function initMediaRecorder() {
    const hasGetUserMedia = Boolean(navigator?.mediaDevices?.getUserMedia);
    const hasMediaRecorder = typeof MediaRecorder !== "undefined";
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      error.value = "当前页面未处于安全环境，无法使用录音功能，请使用 HTTPS 链接访问。";
      setStartFailure("INSECURE_CONTEXT", error.value);
      return false;
    }
    if (!hasGetUserMedia) {
      isSupported.value = false;
      error.value = "当前浏览器不支持录音功能，请改用 Chrome、Edge 或 Safari。";
      setStartFailure("MEDIA_UNSUPPORTED", error.value);
      return false;
    }

    isSupported.value = true;
    if (!hasMediaRecorder) {
      devLog("media:mediarecorder_unavailable_fallback_only", {
        attemptId: Number(currentAttemptId.value || 0)
      });
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      applyStartMetaPatch(getStreamRuntimeMeta(mediaStream));
      return true;
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        error.value = "麦克风权限未开启，请允许浏览器访问麦克风后重试。";
        setStartFailure("MIC_PERMISSION_DENIED", error.value);
        return false;
      }

      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        error.value = "未检测到可用麦克风，请连接麦克风后重试。";
        setStartFailure("MIC_NOT_FOUND", error.value);
        return false;
      }

      error.value = "录音初始化失败，请重试；如仍失败，请改用 Chrome 浏览器。";
      setStartFailure("MEDIA_INIT_FAILED", err?.message || "media_init_failed");
      return false;
    }
  }

  function detachRecognitionHandlers() {
    if (!recognition) return;
    try {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    } catch {
      // no-op
    }
  }

  async function resetRecorderStateForNewAttempt(attemptId) {
    detachRecognitionHandlers();

    if (webAudioRecorderHandle) {
      try {
        await stopWebAudioRecorder(webAudioRecorderHandle);
      } catch {
        // no-op
      }
    }

    try {
      recognition?.stop?.();
    } catch {
      // no-op
    }
    recognition = null;
    mediaRecorder = null;
    webAudioRecorderHandle = null;
    recorderEngine = "";
    stopRequested = false;
    restartCount = 0;
    waitReadyResolver = null;
    activeStopPromise = null;
    activeStopAttemptId = 0;
    audioChunks = [];
    lastChunkMimeType = "";
    mediaDataEventCount = 0;
    mediaNonEmptyDataEventCount = 0;
    mediaChunkSizeList = [];
    mediaChunkMimeTypeList = [];
    mediaChunkTotalBytes = 0;
    mediaLastDataAvailableAtMs = 0;

    clearStopResolversAndTimers();
    cleanupMediaStream();

    transcript.value = "";
    interimTranscript = "";
    audioBlob.value = null;
    error.value = null;
    isReady.value = false;
    isRecording.value = false;
    isStopping.value = false;
    lastStopMeta.value = null;
    lastStartMeta.value = createStartMeta();
    applyStartMetaPatch({
      attemptId: Number(attemptId || 0),
      stopErrorCode: "",
      stopErrorMessage: "",
      playableValidationMethod: "",
      playableValidationErrorCode: "",
      previewPlayable: false
    });
  }

  async function startRecording(options = {}) {
    const allowWithoutSpeechRecognition = Boolean(options?.allowWithoutSpeechRecognition);

    if (activeStopPromise) {
      try {
        await activeStopPromise;
      } catch {
        // no-op
      }
    }

    const attemptId = createAttemptId();
    await resetRecorderStateForNewAttempt(attemptId);

    if (!isAttemptCurrent(attemptId)) {
      return false;
    }

    const isHuaweiLike = isLikelyHuaweiLikeDevice();
    const platformStrategy = resolvePlatformStrategy();
    const strategyConfig = getPlatformStrategyConfig(platformStrategy);
    const startWatchdogMs = Number(strategyConfig?.startWatchdogMs || getMediaRecorderStartWatchdogMs());
    const mediaRecorderCandidates = Array.isArray(strategyConfig?.mediaRecorderCandidates)
      ? strategyConfig.mediaRecorderCandidates
      : MEDIARECORDER_START_CANDIDATES;
    applyStartMetaPatch({
      platformStrategy,
      allowWithoutSpeechRecognition,
      isAndroidLike: isAndroidLikeBrowser(),
      isIOSSafari: isLikelyIOSSafariBrowser(),
      isHuaweiLike,
      attemptId,
      mediaRecorderStartWatchdogMs: startWatchdogMs,
      recorderEngine: "",
      webAudioFallbackTried: false,
      webAudioFallbackOk: false,
      webAudioFallbackErrorCode: "",
      webAudioFallbackErrorMessage: ""
    });

    const mediaReady = await initMediaRecorder();
    if (!isAttemptCurrent(attemptId)) {
      cleanupMediaStream();
      return false;
    }
    if (!mediaReady) {
      cleanupMediaStream();
      return false;
    }

    await Promise.race([
      waitForAudioSignal(mediaStream),
      new Promise((resolve) => setTimeout(resolve, MIC_WARMUP_MS))
    ]);

    if (!isAttemptCurrent(attemptId)) {
      cleanupMediaStream();
      return false;
    }

    const speechInit = isHuaweiLike
      ? { ok: true, reason: "SPEECH_RECOGNITION_DISABLED_HUAWEI" }
      : initSpeechRecognition(attemptId);
    if (isHuaweiLike) {
      setSpeechMode("SPEECH_RECOGNITION_DISABLED_HUAWEI", false);
      devLog("speech:disabled", { reason: "SPEECH_RECOGNITION_DISABLED_HUAWEI" });
    } else if (!speechInit?.ok) {
      devLog("speech:disabled", { reason: speechInit?.reason || "unknown" });
      if (!allowWithoutSpeechRecognition) {
        const reason = speechInit?.reason || "SPEECH_RECOGNITION_UNAVAILABLE";
        const message = reason === "SPEECH_RECOGNITION_UNSUPPORTED"
          ? "当前浏览器不支持语音识别，请改用支持的浏览器。"
          : "语音识别初始化失败，请重试。";
        error.value = message;
        setStartFailure(reason, message);
        cleanupMediaStream();
        return false;
      }
    }

    const readyPromise = new Promise((resolve) => {
      if (!isAttemptCurrent(attemptId)) {
        resolve();
        return;
      }
      waitReadyResolver = resolve;
      setTimeout(() => {
        if (isAttemptCurrent(attemptId)) {
          resolveReadyWait();
        } else {
          resolve();
        }
      }, READY_TIMEOUT_MS);
    });

    if (recognition) {
      try {
        recognition.start();
      } catch (err) {
        const speechStartError = err?.message || "speech_start_failed";
        setSpeechMode("SPEECH_RECOGNITION_START_FAILED", false);
        applyStartMetaPatch({
          speechErrorCode: "SPEECH_RECOGNITION_START_FAILED",
          speechErrorMessage: speechStartError
        });
        devLog("speech:start_failed", { error: speechStartError });
        recognition = null;
        if (!allowWithoutSpeechRecognition) {
          error.value = "语音识别启动失败，请重试。";
          setStartFailure("SPEECH_RECOGNITION_START_FAILED", speechStartError);
          cleanupMediaStream();
          resolveReadyWait();
          return false;
        }
      }
    }

    const started = await tryStartMediaRecorderWithFallback(mediaStream, {
      startWatchdogMs,
      candidates: mediaRecorderCandidates
    }, attemptId);
    if (!isAttemptCurrent(attemptId)) {
      cleanupMediaStream();
      resolveReadyWait();
      return false;
    }
    if (!started) {
      const webAudioStarted = await tryStartFallbackAudioEngine(mediaStream, attemptId);
      if (!isAttemptCurrent(attemptId)) {
        cleanupMediaStream();
        resolveReadyWait();
        return false;
      }
      if (webAudioStarted) {
        setStartFailure("", "");
        isRecording.value = true;
        isReady.value = true;
        resolveReadyWait();
        await readyPromise;
        return true;
      }

      const attempts = Array.isArray(lastStartMeta.value?.startAttempts) ? lastStartMeta.value.startAttempts : [];
      const timeoutAttempt = [...attempts].reverse().find((attempt) => attempt?.errorCode === "MEDIARECORDER_START_TIMEOUT");
      const lastAttempt = attempts[attempts.length - 1] || null;
      const webAudioErrorCode = lastStartMeta.value?.webAudioFallbackErrorCode || "";
      const webAudioErrorMessage = lastStartMeta.value?.webAudioFallbackErrorMessage || "";
      const startFailureCode = "RECORDER_ALL_ENGINES_FAILED";
      const fallbackMessage = "录音启动失败，请重试；如仍失败，请更换浏览器或设备。";
      const detailMessage = timeoutAttempt?.errorMessage || lastAttempt?.errorMessage || "";
      error.value = fallbackMessage;
      setStartFailure(
        startFailureCode,
        webAudioErrorCode
          ? `${webAudioErrorCode}:${webAudioErrorMessage || detailMessage || "webaudio_fallback_failed"}`
          : (detailMessage || fallbackMessage)
      );
      try {
        recognition?.stop();
      } catch {
        // no-op
      }
      recognition = null;
      resolveReadyWait();
      isRecording.value = false;
      isReady.value = false;
      stopRequested = true;
      cleanupMediaStream();
      return false;
    }

    if (!isAttemptCurrent(attemptId)) {
      cleanupMediaStream();
      resolveReadyWait();
      return false;
    }

    setRecorderEngine("media_recorder");
    applyStartMetaPatch({
      webAudioFallbackTried: false,
      webAudioFallbackOk: false
    });
    setStartFailure("", "");
    isRecording.value = true;
    isReady.value = true;
    resolveReadyWait();

    await readyPromise;
    if (!isAttemptCurrent(attemptId)) {
      return false;
    }
    return true;
  }

  function createStaleStopResult(stopReason, attemptId, patch = {}) {
    return {
      attemptId: Number(attemptId || 0),
      staleAttempt: true,
      stopReason: stopReason || "manual",
      stopCallCount,
      recorderEngineAtStart: "",
      recorderEngineAtStop: "",
      recorderEngine: recorderEngine || "",
      transcript: "",
      blob: null,
      blobSize: 0,
      hasAudio: false,
      blobTooLarge: false,
      recorderStopTimedOut: false,
      recognitionStopTimedOut: false,
      chunkCount: 0,
      mimeType: "",
      mediaRecorderMimeType: "",
      chunkMimeType: "",
      selectedMimeType: "",
      mimeTypePlayable: false,
      previewPlayable: false,
      playableValidationMethod: "",
      playableValidationErrorCode: "ATTEMPT_STALE",
      playableDurationSec: 0,
      hasUsableAudio: false,
      finalRecorderEngine: "",
      rawChunkCount: 0,
      rawChunkBytes: 0,
      lastChunkMimeType: "",
      fallbackProducedBlob: false,
      fallbackBlobSize: 0,
      finalUsableDecision: false,
      finalUsableReason: "",
      finalPlaybackUsable: false,
      finalPlaybackReason: "",
      finalBlobPlayable: false,
      finalSilenceWarning: false,
      playbackUrlCreated: false,
      stopNoAudioRetryAttempted: false,
      stopNoAudioRetryRecovered: false,
      stopNoAudioRetryDelayMs: 0,
      dataEventCount: 0,
      nonEmptyDataEventCount: 0,
      chunkSizeList: [],
      chunkMimeTypeList: [],
      chunkTotalBytes: 0,
      lastDataAvailableAtMs: 0,
      peakAmplitude: 0,
      rmsAmplitude: 0,
      meanAbsAmplitude: 0,
      nonSilentFrameRatio: 0,
      silenceFrameRatio: 0,
      amplitudeDynamicRange: 0,
      sampleRate: 0,
      channelCount: 0,
      durationMs: 0,
      stopRecorderMs: 0,
      recognitionStopMs: 0,
      mediaStopMs: 0,
      stopWaitMs: 0,
      finalDrainWaitMs: 0,
      finalDrainWindowMs: 0,
      mediaRecorderStateAtStopRequest: "inactive",
      mediaRecorderStateAfterStop: "inactive",
      streamActiveAtStop: false,
      trackReadyStateAtStop: "",
      trackEnabledAtStop: false,
      trackMutedAtStop: null,
      webAudioTotalSampleCount: 0,
      wavEncodeInputSampleCount: 0,
      blobIssueCode: "AUDIO_BLOB_EMPTY",
      stopErrorCode: "ATTEMPT_STALE",
      stopErrorMessage: "",
      ...patch
    };
  }
  async function stopRecorderAndGetBlob(options = {}) {
    const stopReason = options.reason || "manual";
    const stopAttemptId = Number(options.attemptId || currentAttemptId.value || 0);
    const skipPlayableValidation = Boolean(options.skipPlayableValidation);
    const retryNoAudioOnce = options.retryNoAudioOnce !== false;
    const noAudioRetryDelayMs = Math.max(
      0,
      Number(options.noAudioRetryDelayMs || MEDIARECORDER_NO_AUDIO_RETRY_DELAY_MS)
    );
    if (!stopAttemptId || !isAttemptCurrent(stopAttemptId)) {
      return createStaleStopResult(stopReason, stopAttemptId, {
        stopErrorCode: "ATTEMPT_STALE_BEFORE_STOP"
      });
    }
    if (activeStopPromise) {
      if (activeStopAttemptId && Number(activeStopAttemptId) !== stopAttemptId) {
        return createStaleStopResult(stopReason, stopAttemptId, {
          stopErrorCode: "ATTEMPT_STALE_ACTIVE_STOP_OTHER_ATTEMPT"
        });
      }
      return activeStopPromise;
    }
    stopCallCount += 1;
    const stopStartedAt = getNowMs();
    const startMetaSnapshot = lastStartMeta.value || {};
    const platformStrategy = `${startMetaSnapshot?.platformStrategy || resolvePlatformStrategy()}`;
    const isAndroidLike = Boolean(startMetaSnapshot?.isAndroidLike);
    const isIOSSafari = Boolean(startMetaSnapshot?.isIOSSafari);
    const isIOSWebKitLikeStop = platformStrategy === PLATFORM_STRATEGY_IOS_SAFARI || isLikelyIOSWebKitRuntime();
    const webAudioFallbackTried = Boolean(startMetaSnapshot?.webAudioFallbackTried);
    const webAudioFallbackOk = Boolean(startMetaSnapshot?.webAudioFallbackOk);
    const recorderEngineAtStart = `${startMetaSnapshot?.recorderEngine || ""}`.trim();
    const recorderEngineAtStop = `${recorderEngine || ""}`.trim();
    const stopTrackMetaAtRequest = getStreamStopTrackMeta(mediaStream);
    const mediaRecorderStateAtStopRequest = `${mediaRecorder?.state || "inactive"}`;
    activeStopAttemptId = stopAttemptId;
    activeStopPromise = (async () => {
      stopRequested = true;
      resolveReadyWait();
      isReady.value = false;
      restartCount = 0;
      isStopping.value = true;
      devLog("stop:start", {
        stopCallCount,
        stopReason,
        stopAttemptId,
        skipPlayableValidation,
        retryNoAudioOnce,
        noAudioRetryDelayMs,
        platformStrategy,
        isAndroidLike,
        isIOSSafari,
        isIOSWebKitLikeStop,
        recorderEngineAtStart,
        recorderEngine,
        recorderState: mediaRecorderStateAtStopRequest,
        mediaRecorderStateAtStopRequest,
        ...stopTrackMetaAtRequest,
        chunkCountBeforeStop: audioChunks.length,
        chunkStatsBeforeStop: captureChunkStatsSnapshot()
      });
      const recognitionWaitStartedAt = getNowMs();
      const recognitionStopPromise = waitForRecognitionStop(stopAttemptId).then((result) => ({
        ...(result || {}),
        waitMs: getElapsedMs(recognitionWaitStartedAt)
      }));
      const mediaWaitStartedAt = getNowMs();
      const usingWebAudio = recorderEngine === "web_audio_wav";
      let mediaStopPromise = null;
      if (usingWebAudio) {
        mediaStopPromise = (async () => {
          const stopped = await stopWebAudioRecorder(webAudioRecorderHandle);
          if (!isAttemptCurrent(stopAttemptId)) {
            return {
              timedOut: false,
              skipped: true,
              staleAttempt: true,
              waitMs: getElapsedMs(mediaWaitStartedAt),
              chunkCount: 0,
              rawChunkCount: 0,
              rawChunkBytes: 0,
              blobSize: 0,
              blob: null,
              mimeType: "audio/wav",
              lastChunkMimeType: `${lastChunkMimeType || ""}`,
              mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
              finalDrainWaitMs: 0,
              finalDrainWindowMs: 0,
              ...stopTrackMetaAtRequest,
              totalSampleCount: 0,
              wavEncodeInputSampleCount: 0,
              audioAmplitudeStats: createEmptyAudioAmplitudeStats(),
              webAudioStopError: false,
              stopErrorCode: "ATTEMPT_STALE",
              stopErrorMessage: "attempt_stale"
            };
          }
          webAudioRecorderHandle = null;
          if (!stopped?.ok || !stopped?.blob) {
            cleanupMediaStream();
            return {
              timedOut: false,
              skipped: false,
              waitMs: getElapsedMs(mediaWaitStartedAt),
              chunkCount: Number(stopped?.chunkCount || 0),
              rawChunkCount: Number(stopped?.chunkCount || 0),
              rawChunkBytes: 0,
              blobSize: 0,
              blob: null,
              mimeType: "audio/wav",
              lastChunkMimeType: `${lastChunkMimeType || ""}`,
              mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
              finalDrainWaitMs: 0,
              finalDrainWindowMs: 0,
              ...stopTrackMetaAtRequest,
              totalSampleCount: Number(stopped?.totalSampleCount || 0),
              wavEncodeInputSampleCount: Number(stopped?.wavEncodeInputSampleCount || 0),
              audioAmplitudeStats: stopped?.audioAmplitudeStats || createEmptyAudioAmplitudeStats(),
              webAudioStopError: true,
              stopErrorCode: stopped?.errorCode || "WEBAUDIO_STOP_FAILED",
              stopErrorMessage: stopped?.errorMessage || "webaudio_stop_failed"
            };
          }
          audioBlob.value = stopped.blob;
          cleanupMediaStream();
          return {
            timedOut: false,
            skipped: false,
            waitMs: getElapsedMs(mediaWaitStartedAt),
            chunkCount: Number(stopped.chunkCount || 0),
            rawChunkCount: Number(stopped.chunkCount || 0),
            rawChunkBytes: Number(stopped.blob?.size || 0),
            blobSize: Number(stopped.blob?.size || 0),
            blob: stopped.blob,
            mimeType: "audio/wav",
            lastChunkMimeType: `${lastChunkMimeType || ""}`,
            mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
            finalDrainWaitMs: 0,
            finalDrainWindowMs: 0,
            ...stopTrackMetaAtRequest,
            totalSampleCount: Number(stopped?.totalSampleCount || 0),
            wavEncodeInputSampleCount: Number(stopped?.wavEncodeInputSampleCount || 0),
            audioAmplitudeStats: stopped?.audioAmplitudeStats || createEmptyAudioAmplitudeStats(),
            webAudioStopError: false,
            stopErrorCode: "",
            stopErrorMessage: ""
          };
        })();
      } else {
        mediaStopPromise = waitForMediaStop(stopAttemptId).then((result) => ({
          ...(result || {}),
          waitMs: getElapsedMs(mediaWaitStartedAt)
        }));
      }
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          resolveRecognitionStopWait({ timedOut: false, skipped: true }, stopAttemptId);
        }
      } else {
        resolveRecognitionStopWait({ timedOut: false, skipped: true }, stopAttemptId);
      }
      if (usingWebAudio) {
        // WebAudio stop is handled inside mediaStopPromise
      } else if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          let requestDataInvoked = false;
          if (typeof mediaRecorder.requestData === "function") {
            try {
              mediaRecorder.requestData();
              requestDataInvoked = true;
            } catch {
              // no-op
            }
          }
          if (isIOSWebKitLikeStop && requestDataInvoked && MEDIARECORDER_STOP_REQUESTDATA_LEAD_MS_IOS_WEBKIT > 0) {
            await waitForMs(MEDIARECORDER_STOP_REQUESTDATA_LEAD_MS_IOS_WEBKIT);
          }
          mediaRecorder.stop();
        } catch {
          const fallbackMimeType = resolvePreferredRecordingMimeType({
            recorderMimeType: `${mediaRecorder?.mimeType || ""}`,
            chunkMimeType: `${lastChunkMimeType || ""}`,
            startMetaMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
            platformStrategy
          });
          cleanupMediaStream();
          resolveMediaStopWait({
            timedOut: false,
            skipped: true,
            recorderStopError: true,
            chunkCount: Number(audioChunks.length || 0),
            rawChunkCount: Number(audioChunks.length || 0),
            rawChunkBytes: Number(captureChunkStatsSnapshot().chunkTotalBytes || 0),
            blobSize: audioBlob.value?.size || 0,
            mimeType: audioBlob.value?.type || fallbackMimeType,
            mediaRecorderMimeType: `${mediaRecorder?.mimeType || ""}`,
            chunkMimeType: `${lastChunkMimeType || ""}`,
            lastChunkMimeType: `${lastChunkMimeType || ""}`,
            selectedMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
            mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
            finalDrainWaitMs: 0,
            finalDrainWindowMs: 0,
            ...stopTrackMetaAtRequest,
            ...captureChunkStatsSnapshot()
          }, stopAttemptId);
        }
      } else {
        const fallbackMimeType = resolvePreferredRecordingMimeType({
          recorderMimeType: `${mediaRecorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          startMetaMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
          platformStrategy
        });
        if (!audioBlob.value && audioChunks.length > 0) {
          audioBlob.value = new Blob(audioChunks, { type: fallbackMimeType });
        }
        cleanupMediaStream();
        resolveMediaStopWait({
          timedOut: false,
          skipped: true,
          chunkCount: Number(audioChunks.length || 0),
          rawChunkCount: Number(audioChunks.length || 0),
          rawChunkBytes: Number(captureChunkStatsSnapshot().chunkTotalBytes || 0),
          blobSize: audioBlob.value?.size || 0,
          mimeType: audioBlob.value?.type || fallbackMimeType,
          mediaRecorderMimeType: `${mediaRecorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          lastChunkMimeType: `${lastChunkMimeType || ""}`,
          selectedMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
          mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
          finalDrainWaitMs: 0,
          finalDrainWindowMs: 0,
          ...stopTrackMetaAtRequest,
          ...captureChunkStatsSnapshot()
        }, stopAttemptId);
      }
      const [recognitionStopResult, mediaStopResult] = await Promise.all([recognitionStopPromise, mediaStopPromise]);
      if (!isAttemptCurrent(stopAttemptId) || mediaStopResult?.staleAttempt) {
        return createStaleStopResult(stopReason, stopAttemptId, {
          stopErrorCode: "ATTEMPT_STALE_AFTER_WAIT"
        });
      }
      transcript.value = buildFinalTranscript();
      interimTranscript = "";
      const stopRecorderMs = getElapsedMs(stopStartedAt);
      const recognitionStopMs = Number(recognitionStopResult?.waitMs || 0);
      const mediaStopMs = Number(mediaStopResult?.waitMs || 0);
      const stopWaitMs = Number(mediaStopResult?.waitMs || mediaStopMs || 0);
      let blob = audioBlob.value || mediaStopResult?.blob || null;
      if (!audioBlob.value && mediaStopResult?.blob) {
        audioBlob.value = mediaStopResult.blob;
      }
      let blobSize = blob?.size || 0;
      let blobTooLarge = blobSize > MAX_AUDIO_BLOB_BYTES;
      let hasAudio = blobSize > 0;
      const mimeType = mediaStopResult?.mimeType || blob?.type || resolvePreferredRecordingMimeType({
        recorderMimeType: `${mediaRecorder?.mimeType || ""}`,
        chunkMimeType: `${lastChunkMimeType || ""}`,
        startMetaMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
        platformStrategy
      });
      let stopNoAudioRetryAttempted = false;
      let stopNoAudioRetryRecovered = false;
      const canRetryNoAudio = retryNoAudioOnce
        && !usingWebAudio
        && !mediaStopResult?.timedOut
        && !mediaStopResult?.webAudioStopError;
      const shouldRetryForMissingData = !hasAudio || blobSize < MIN_AUDIO_BLOB_BYTES;
      if (canRetryNoAudio && shouldRetryForMissingData && noAudioRetryDelayMs > 0) {
        stopNoAudioRetryAttempted = true;
        await waitForMs(noAudioRetryDelayMs);
        if (!isAttemptCurrent(stopAttemptId)) {
          return createStaleStopResult(stopReason, stopAttemptId, {
            stopErrorCode: "ATTEMPT_STALE_AFTER_NO_AUDIO_RETRY"
          });
        }
        if (!audioBlob.value && audioChunks.length > 0) {
          audioBlob.value = new Blob(audioChunks, { type: mimeType });
        }
        blob = audioBlob.value;
        blobSize = blob?.size || 0;
        blobTooLarge = blobSize > MAX_AUDIO_BLOB_BYTES;
        hasAudio = blobSize > 0;
        stopNoAudioRetryRecovered = hasAudio && blobSize >= MIN_AUDIO_BLOB_BYTES;
      }
      const playableCheck = skipPlayableValidation
        ? {
            playable: true,
            method: "skipped",
            durationSec: 0,
            errorCode: ""
          }
        : await validatePlayableAudioBlob(blob, mimeType, stopAttemptId);
      if (!skipPlayableValidation && (!isAttemptCurrent(stopAttemptId) || playableCheck?.staleAttempt)) {
        return createStaleStopResult(stopReason, stopAttemptId, {
          stopErrorCode: "ATTEMPT_STALE_AFTER_PLAYABLE_CHECK"
        });
      }
      let blobIssueCode = detectBlobIssue({
        blobSize,
        blobTooLarge,
        mimeType,
        previewPlayable: Boolean(playableCheck.playable)
      });
      if (!blobIssueCode && !playableCheck.playable) {
        blobIssueCode = "AUDIO_BLOB_NOT_PLAYABLE";
      }
      const mimeTypePlayable = isMimeTypePlayable(mimeType);
      const hasFinalPlayableBlob = Boolean(blob && blobSize > 0 && (playableCheck.playable || mimeTypePlayable));
      let hasUsableAudio = isUsableAudioResult({
        blob,
        hasAudio,
        blobSize,
        blobIssueCode,
        mimeType,
        previewPlayable: playableCheck.playable
      });
      if (!hasUsableAudio && hasFinalPlayableBlob) {
        hasUsableAudio = true;
      }
      const finalRecorderEngine = `${usingWebAudio ? "web_audio_wav" : (recorderEngine || "")}`.trim();
      const fallbackProducedBlob = Boolean(
        (usingWebAudio || webAudioFallbackTried || webAudioFallbackOk)
        && blob
        && blobSize > 0
      );
      const fallbackBlobSize = fallbackProducedBlob ? Number(blobSize || 0) : 0;
      const finalUsableDecision = Boolean(hasUsableAudio || hasFinalPlayableBlob);
      let finalUsableReason = "";
      const finalBlobPlayable = Boolean(hasFinalPlayableBlob);
      const finalPlaybackUsable = Boolean(finalBlobPlayable);
      let finalPlaybackReason = "";
      if (finalUsableDecision) {
        finalUsableReason = hasFinalPlayableBlob
          ? (playableCheck.playable ? "FINAL_BLOB_PLAYABLE_BY_PROBE" : "FINAL_BLOB_PLAYABLE_BY_MIME")
          : "FINAL_USABLE_BY_SHARED_LAYER";
        finalPlaybackReason = hasFinalPlayableBlob
          ? (playableCheck.playable ? "FINAL_PREVIEW_PLAYABLE_BY_PROBE" : "FINAL_PREVIEW_PLAYABLE_BY_MIME")
          : "FINAL_PREVIEW_PLAYABLE_BY_SHARED_LAYER";
        if (INVALID_AUDIO_BLOB_ISSUES.has(`${blobIssueCode || ""}`)) {
          blobIssueCode = "";
        }
      } else if (!blob || blobSize <= 0) {
        finalUsableReason = "FINAL_BLOB_EMPTY";
        finalPlaybackReason = "FINAL_PREVIEW_BLOB_EMPTY";
      } else if (blobTooLarge) {
        finalUsableReason = "FINAL_BLOB_TOO_LARGE";
        finalPlaybackReason = "FINAL_PREVIEW_BLOB_TOO_LARGE";
      } else if (blobIssueCode) {
        finalUsableReason = `FINAL_${blobIssueCode}`;
        finalPlaybackReason = `FINAL_PREVIEW_${blobIssueCode}`;
      } else if (playableCheck?.errorCode) {
        finalUsableReason = `${playableCheck.errorCode}`;
        finalPlaybackReason = `${playableCheck.errorCode}`;
      } else {
        finalUsableReason = "FINAL_UNUSABLE_UNKNOWN";
        finalPlaybackReason = "FINAL_PREVIEW_UNUSABLE_UNKNOWN";
      }
      let audioAmplitudeStats = mediaStopResult?.audioAmplitudeStats || createEmptyAudioAmplitudeStats();
      if (!audioAmplitudeStats?.amplitudeStatsAvailable && blob && blobSize > 0) {
        audioAmplitudeStats = await analyzeBlobAudioAmplitudeStats(blob, stopAttemptId);
      }
      if (!isAttemptCurrent(stopAttemptId)) {
        return createStaleStopResult(stopReason, stopAttemptId, {
          stopErrorCode: "ATTEMPT_STALE_AFTER_AMPLITUDE_STATS"
        });
      }
      const runtimeChunkStats = captureChunkStatsSnapshot();
      const rawChunkCount = Number(mediaStopResult?.rawChunkCount ?? mediaStopResult?.chunkCount ?? audioChunks.length);
      const rawChunkBytes = Number(
        mediaStopResult?.rawChunkBytes
        ?? mediaStopResult?.chunkTotalBytes
        ?? runtimeChunkStats.chunkTotalBytes
        ?? blobSize
        ?? 0
      );
      const mediaRecorderStateAfterStop = `${mediaStopResult?.mediaRecorderStateAfterStop || mediaRecorder?.state || "inactive"}`;
      const chunkSizeList = runtimeChunkStats.chunkSizeList.length
        ? runtimeChunkStats.chunkSizeList
        : Array.isArray(mediaStopResult?.chunkSizeList) ? mediaStopResult.chunkSizeList : [];
      const chunkMimeTypeList = runtimeChunkStats.chunkMimeTypeList.length
        ? runtimeChunkStats.chunkMimeTypeList
        : Array.isArray(mediaStopResult?.chunkMimeTypeList) ? mediaStopResult.chunkMimeTypeList : [];
      const result = {
        attemptId: stopAttemptId,
        staleAttempt: false,
        stopReason,
        stopCallCount,
        platformStrategy,
        isAndroidLike,
        isIOSSafari,
        webAudioFallbackTried,
        webAudioFallbackOk,
        recorderEngineAtStart,
        recorderEngineAtStop,
        recorderEngine,
        transcript: transcript.value,
        blob,
        blobSize,
        hasAudio,
        blobTooLarge,
        recorderStopTimedOut: Boolean(mediaStopResult?.timedOut),
        recognitionStopTimedOut: Boolean(recognitionStopResult?.timedOut),
        chunkCount: Number(mediaStopResult?.chunkCount ?? audioChunks.length),
        rawChunkCount,
        rawChunkBytes,
        mimeType,
        mediaRecorderMimeType: `${mediaStopResult?.mediaRecorderMimeType || mediaRecorder?.mimeType || ""}`,
        chunkMimeType: `${mediaStopResult?.chunkMimeType || lastChunkMimeType || ""}`,
        lastChunkMimeType: `${mediaStopResult?.lastChunkMimeType || lastChunkMimeType || ""}`,
        selectedMimeType: `${mediaStopResult?.selectedMimeType || startMetaSnapshot?.selectedMimeType || ""}`,
        mimeTypePlayable,
        previewPlayable: Boolean(playableCheck.playable),
        playableValidationMethod: `${playableCheck.method || ""}`,
        playableValidationErrorCode: `${playableCheck.errorCode || ""}`,
        playableDurationSec: Number(playableCheck.durationSec || 0),
        hasUsableAudio: finalUsableDecision,
        finalRecorderEngine,
        fallbackProducedBlob,
        fallbackBlobSize,
        finalUsableDecision,
        finalUsableReason,
        finalPlaybackUsable,
        finalPlaybackReason,
        finalBlobPlayable,
        finalSilenceWarning: false,
        playbackUrlCreated: false,
        stopNoAudioRetryAttempted,
        stopNoAudioRetryRecovered,
        stopNoAudioRetryDelayMs: stopNoAudioRetryAttempted ? noAudioRetryDelayMs : 0,
        dataEventCount: Number(runtimeChunkStats.dataEventCount || mediaStopResult?.dataEventCount || 0),
        nonEmptyDataEventCount: Number(runtimeChunkStats.nonEmptyDataEventCount || mediaStopResult?.nonEmptyDataEventCount || 0),
        chunkSizeList,
        chunkMimeTypeList,
        chunkTotalBytes: Number(runtimeChunkStats.chunkTotalBytes || mediaStopResult?.chunkTotalBytes || blobSize || 0),
        lastDataAvailableAtMs: Number(runtimeChunkStats.lastDataAvailableAtMs || mediaStopResult?.lastDataAvailableAtMs || 0),
        speechDiagnosis: audioAmplitudeStats?.speechDiagnosis || null,
        peakAmplitude: Number(audioAmplitudeStats?.peakAmplitude || 0),
        rmsAmplitude: Number(audioAmplitudeStats?.rmsAmplitude || 0),
        meanAbsAmplitude: Number(audioAmplitudeStats?.meanAbsAmplitude || 0),
        nonSilentFrameRatio: Number(audioAmplitudeStats?.nonSilentFrameRatio || 0),
        silenceFrameRatio: Number(Math.max(0, 1 - Number(audioAmplitudeStats?.nonSilentFrameRatio || 0))),
        amplitudeDynamicRange: Number(
          Math.max(0, Number(audioAmplitudeStats?.peakAmplitude || 0) - Number(audioAmplitudeStats?.meanAbsAmplitude || 0))
        ),
        sampleRate: Number(audioAmplitudeStats?.sampleRate || 0),
        channelCount: Number(audioAmplitudeStats?.channelCount || 0),
        durationMs: Number(audioAmplitudeStats?.durationMs || 0),
        stopRecorderMs,
        recognitionStopMs,
        mediaStopMs,
        stopWaitMs,
        finalDrainWaitMs: Number(mediaStopResult?.finalDrainWaitMs || 0),
        finalDrainWindowMs: Number(mediaStopResult?.finalDrainWindowMs || 0),
        mediaRecorderStateAtStopRequest,
        mediaRecorderStateAfterStop,
        streamActiveAtStop: Boolean(
          typeof mediaStopResult?.streamActiveAtStop === "boolean"
            ? mediaStopResult.streamActiveAtStop
            : stopTrackMetaAtRequest.streamActiveAtStop
        ),
        trackReadyStateAtStop: `${mediaStopResult?.trackReadyStateAtStop || stopTrackMetaAtRequest.trackReadyStateAtStop || ""}`,
        trackEnabledAtStop: Boolean(
          typeof mediaStopResult?.trackEnabledAtStop === "boolean"
            ? mediaStopResult.trackEnabledAtStop
            : stopTrackMetaAtRequest.trackEnabledAtStop
        ),
        trackMutedAtStop: mediaStopResult?.trackMutedAtStop ?? stopTrackMetaAtRequest.trackMutedAtStop ?? null,
        webAudioTotalSampleCount: Number(mediaStopResult?.totalSampleCount || 0),
        wavEncodeInputSampleCount: Number(mediaStopResult?.wavEncodeInputSampleCount || 0),
        blobIssueCode,
        stopErrorCode: "",
        stopErrorMessage: ""
      };
      result.stopErrorCode = mediaStopResult?.webAudioStopError
        ? (mediaStopResult?.stopErrorCode || "WEBAUDIO_STOP_FAILED")
        : result.recorderStopTimedOut
          ? "RECORDER_STOP_TIMEOUT"
          : result.recognitionStopTimedOut
            ? "RECOGNITION_STOP_TIMEOUT"
            : (finalUsableDecision ? "" : blobIssueCode);
      result.stopErrorMessage = mediaStopResult?.webAudioStopError
        ? `${mediaStopResult?.stopErrorMessage || "webaudio_stop_failed"}`
        : result.recorderStopTimedOut
          ? "media_stop_timeout"
          : result.recognitionStopTimedOut
            ? "recognition_stop_timeout"
            : (finalUsableDecision ? "" : `${playableCheck?.errorCode || ""}`);
      if (!isAttemptCurrent(stopAttemptId)) {
        return {
          ...result,
          staleAttempt: true,
          stopErrorCode: "ATTEMPT_STALE_BEFORE_WRITEBACK"
        };
      }
      lastStopMeta.value = result;
      devLog("stop:finalized", result);
      if (blobTooLarge) {
        error.value = "录音时长过长，请缩短后重试。";
      } else if (result.recorderStopTimedOut) {
        error.value = "录音处理超时，请重试一次。";
      } else if (result.recognitionStopTimedOut) {
        error.value = "录音处理超时，请重试一次。";
      } else if (mediaStopResult?.webAudioStopError) {
        error.value = "录音处理失败，请重试一次。";
      }
      return result;
    })()
      .catch(async (err) => {
        if (!isAttemptCurrent(stopAttemptId)) {
          return createStaleStopResult(stopReason, stopAttemptId, {
            stopErrorCode: "ATTEMPT_STALE_ON_EXCEPTION"
          });
        }
        const failedBlobSize = audioBlob.value?.size || 0;
        const failedBlobTooLarge = failedBlobSize > MAX_AUDIO_BLOB_BYTES;
        const failedMimeType = audioBlob.value?.type || resolvePreferredRecordingMimeType({
          recorderMimeType: `${mediaRecorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          startMetaMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
          platformStrategy
        });
        const failedBlobIssueCode = detectBlobIssue({
          blobSize: failedBlobSize,
          blobTooLarge: failedBlobTooLarge,
          mimeType: failedMimeType,
          previewPlayable: false
        });
        const failedMimeTypePlayable = isMimeTypePlayable(failedMimeType);
        const failedChunkStats = captureChunkStatsSnapshot();
        const failedHasUsableAudio = isUsableAudioResult({
          blob: audioBlob.value,
          hasAudio: failedBlobSize > 0,
          blobSize: failedBlobSize,
          blobIssueCode: failedBlobIssueCode,
          mimeType: failedMimeType,
          previewPlayable: false
        });
        const failedAudioAmplitudeStats = failedBlobSize > 0
          ? await analyzeBlobAudioAmplitudeStats(audioBlob.value, stopAttemptId)
          : createEmptyAudioAmplitudeStats();
        const failedResult = {
          attemptId: stopAttemptId,
          staleAttempt: false,
          stopReason,
          stopCallCount,
          platformStrategy,
          isAndroidLike,
          isIOSSafari,
          webAudioFallbackTried,
          webAudioFallbackOk,
          recorderEngineAtStart,
          recorderEngineAtStop,
          recorderEngine,
          transcript: buildFinalTranscript(),
          blob: audioBlob.value,
          blobSize: failedBlobSize,
          hasAudio: failedBlobSize > 0,
          blobTooLarge: failedBlobTooLarge,
          recorderStopTimedOut: false,
          recognitionStopTimedOut: false,
          chunkCount: audioChunks.length,
          rawChunkCount: Number(audioChunks.length || 0),
          rawChunkBytes: Number(failedChunkStats.chunkTotalBytes || failedBlobSize || 0),
          mimeType: failedMimeType,
          mediaRecorderMimeType: `${mediaRecorder?.mimeType || ""}`,
          chunkMimeType: `${lastChunkMimeType || ""}`,
          lastChunkMimeType: `${lastChunkMimeType || ""}`,
          selectedMimeType: `${startMetaSnapshot?.selectedMimeType || ""}`,
          mimeTypePlayable: failedMimeTypePlayable,
          previewPlayable: false,
          playableValidationMethod: "",
          playableValidationErrorCode: "STOP_EXCEPTION",
          playableDurationSec: 0,
          hasUsableAudio: failedHasUsableAudio,
          finalRecorderEngine: `${recorderEngine || ""}`.trim(),
          fallbackProducedBlob: false,
          fallbackBlobSize: 0,
          finalUsableDecision: Boolean(failedHasUsableAudio),
          finalUsableReason: failedHasUsableAudio
            ? "FINAL_USABLE_BY_SHARED_LAYER"
            : `${failedBlobIssueCode || "FINAL_EXCEPTION"}`,
          finalPlaybackUsable: Boolean(failedHasUsableAudio && failedBlobSize > 0),
          finalPlaybackReason: failedHasUsableAudio
            ? "FINAL_PREVIEW_PLAYABLE_BY_SHARED_LAYER"
            : `${failedBlobIssueCode || "FINAL_PREVIEW_EXCEPTION"}`,
          finalBlobPlayable: Boolean(failedHasUsableAudio && failedBlobSize > 0),
          finalSilenceWarning: false,
          playbackUrlCreated: false,
          stopNoAudioRetryAttempted: false,
          stopNoAudioRetryRecovered: false,
          stopNoAudioRetryDelayMs: 0,
          dataEventCount: Number(failedChunkStats.dataEventCount || 0),
          nonEmptyDataEventCount: Number(failedChunkStats.nonEmptyDataEventCount || 0),
          chunkSizeList: failedChunkStats.chunkSizeList,
          chunkMimeTypeList: failedChunkStats.chunkMimeTypeList,
          chunkTotalBytes: Number(failedChunkStats.chunkTotalBytes || failedBlobSize || 0),
          lastDataAvailableAtMs: Number(failedChunkStats.lastDataAvailableAtMs || 0),
          peakAmplitude: Number(failedAudioAmplitudeStats?.peakAmplitude || 0),
          rmsAmplitude: Number(failedAudioAmplitudeStats?.rmsAmplitude || 0),
          meanAbsAmplitude: Number(failedAudioAmplitudeStats?.meanAbsAmplitude || 0),
          nonSilentFrameRatio: Number(failedAudioAmplitudeStats?.nonSilentFrameRatio || 0),
          silenceFrameRatio: Number(Math.max(0, 1 - Number(failedAudioAmplitudeStats?.nonSilentFrameRatio || 0))),
          amplitudeDynamicRange: Number(
            Math.max(
              0,
              Number(failedAudioAmplitudeStats?.peakAmplitude || 0) - Number(failedAudioAmplitudeStats?.meanAbsAmplitude || 0)
            )
          ),
          sampleRate: Number(failedAudioAmplitudeStats?.sampleRate || 0),
          channelCount: Number(failedAudioAmplitudeStats?.channelCount || 0),
          durationMs: Number(failedAudioAmplitudeStats?.durationMs || 0),
          stopRecorderMs: getElapsedMs(stopStartedAt),
          recognitionStopMs: 0,
          mediaStopMs: 0,
          stopWaitMs: 0,
          finalDrainWaitMs: 0,
          finalDrainWindowMs: 0,
          mediaRecorderStateAtStopRequest,
          mediaRecorderStateAfterStop: `${mediaRecorder?.state || "inactive"}`,
          streamActiveAtStop: Boolean(stopTrackMetaAtRequest.streamActiveAtStop),
          trackReadyStateAtStop: `${stopTrackMetaAtRequest.trackReadyStateAtStop || ""}`,
          trackEnabledAtStop: Boolean(stopTrackMetaAtRequest.trackEnabledAtStop),
          trackMutedAtStop: stopTrackMetaAtRequest.trackMutedAtStop ?? null,
          webAudioTotalSampleCount: 0,
          wavEncodeInputSampleCount: 0,
          blobIssueCode: failedBlobIssueCode,
          stopErrorCode: "RECORDER_STOP_EXCEPTION",
          stopErrorMessage: `${err?.message || "stop_failed"}`,
          stopError: err?.message || "stop_failed"
        };
        lastStopMeta.value = failedResult;
        error.value = "录音处理失败，请重试一次。";
        devLog("stop:error", failedResult);
        return failedResult;
      })
      .finally(() => {
        resolveRecognitionStopWait({ timedOut: false, cleanup: true }, stopAttemptId);
        resolveMediaStopWait({ timedOut: false, cleanup: true }, stopAttemptId);
        if (isAttemptCurrent(stopAttemptId)) {
          cleanupMediaStream();
          recognition = null;
          mediaRecorder = null;
          webAudioRecorderHandle = null;
          recorderEngine = "";
          isRecording.value = false;
          isStopping.value = false;
        }
        if (Number(activeStopAttemptId) === Number(stopAttemptId)) {
          activeStopPromise = null;
          activeStopAttemptId = 0;
        }
      });
    return activeStopPromise;
  }
  function stopRecording() {
    void stopRecorderAndGetBlob({
      reason: "manual",
      attemptId: Number(currentAttemptId.value || 0)
    });
  }

  return {
    isRecording,
    isReady,
    transcript,
    audioBlob,
    error,
    isSupported,
    isStopping,
    currentAttemptId,
    lastStartMeta,
    lastStopMeta,
    startRecording,
    stopRecording,
    stopRecorderAndGetBlob
  };
}

