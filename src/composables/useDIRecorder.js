import { computed, onBeforeUnmount, ref } from "vue";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";

export function useDIRecorder({ prepareSeconds = 25, recordingSeconds = 40 } = {}) {
  const recorder = useRecorder();
  const timer = useTimer();

  const phase = ref("prepare");
  const stopResult = ref(null);
  const previewUrl = ref("");
  const prepareStartedAtMs = ref(0);
  const prepareDurationSec = ref(0);
  const recordingStartedAtMs = ref(0);
  const recordingDurationSec = ref(0);

  const timerLabel = computed(() => {
    if (phase.value === "prepare") return "看图准备";
    if (phase.value === "recording") return "开口描述";
    if (phase.value === "processing") return "结束录音";
    return "听回放";
  });

  const timerRemaining = computed(() => Number(timer.remaining.value || 0));
  const timerProgress = computed(() => {
    if (phase.value === "playback") return 100;
    const raw = Number(timer.progress.value || 0);
    return Math.max(0, Math.min(100, 100 - raw));
  });

  const canSkipPrepare = computed(() => phase.value === "prepare");
  const canFinishRecording = computed(() => phase.value === "recording" && !recorder.isStopping.value);

  function revokePreviewUrl() {
    if (!previewUrl.value) return;
    if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
    try {
      URL.revokeObjectURL(previewUrl.value);
    } catch {
      // no-op
    }
    previewUrl.value = "";
  }

  function assignPreviewUrl(blob) {
    revokePreviewUrl();
    if (!blob || Number(blob?.size || 0) <= 0) return;
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    try {
      previewUrl.value = URL.createObjectURL(blob);
    } catch {
      previewUrl.value = "";
    }
  }

  function resetRoundState() {
    timer.stop();
    stopResult.value = null;
    prepareStartedAtMs.value = 0;
    prepareDurationSec.value = 0;
    recordingDurationSec.value = 0;
    recordingStartedAtMs.value = 0;
    revokePreviewUrl();
  }

  async function enterPreparePhase() {
    resetRoundState();
    phase.value = "prepare";
    prepareStartedAtMs.value = Date.now();
    timer.start(prepareSeconds, () => {
      void startRecordingPhase();
    });
  }

  async function startRecordingPhase() {
    if (phase.value === "recording") return true;
    if (phase.value === "prepare") {
      const elapsedMs = prepareStartedAtMs.value
        ? Math.max(0, Date.now() - Number(prepareStartedAtMs.value || 0))
        : 0;
      prepareDurationSec.value = Math.min(prepareSeconds, Math.max(0, Math.round(elapsedMs / 1000)));
    }
    timer.stop();
    phase.value = "recording";
    recordingStartedAtMs.value = Date.now();

    const started = await recorder.startRecording({
      allowWithoutSpeechRecognition: true
    });

    if (!started) {
      phase.value = "prepare";
      return false;
    }

    timer.start(recordingSeconds, () => {
      void stopRecordingPhase({ reason: "timeout" });
    });
    return true;
  }

  async function skipPreparePhase() {
    if (phase.value !== "prepare") return false;
    return startRecordingPhase();
  }

  async function stopRecordingPhase({ reason = "manual" } = {}) {
    if (phase.value !== "recording") return stopResult.value;
    timer.stop();
    phase.value = "processing";

    const result = await recorder.stopRecorderAndGetBlob({
      reason: `di_${reason}`,
      skipPlayableValidation: true
    });

    const elapsedMs = Math.max(0, Date.now() - Number(recordingStartedAtMs.value || Date.now()));
    recordingDurationSec.value = Math.max(0, Math.round(elapsedMs / 1000));
    stopResult.value = result;
    assignPreviewUrl(result?.blob);
    phase.value = "playback";
    return result;
  }

  async function restartRound() {
    recorder.stopRecording();
    await enterPreparePhase();
  }

  onBeforeUnmount(() => {
    timer.stop();
    recorder.stopRecording();
    revokePreviewUrl();
  });

  return {
    recorder,
    timer,
    phase,
    stopResult,
    previewUrl,
    prepareDurationSec,
    recordingDurationSec,
    timerLabel,
    timerRemaining,
    timerProgress,
    canSkipPrepare,
    canFinishRecording,
    enterPreparePhase,
    skipPreparePhase,
    startRecordingPhase,
    stopRecordingPhase,
    restartRound
  };
}
