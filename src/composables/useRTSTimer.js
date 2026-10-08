import { onUnmounted } from "vue";
import { usePracticeStore } from "@/stores/practice";

const RTS_PREPARE_SECONDS = 10;
const RTS_RECORD_SECONDS = 40;

export function useRTSTimer() {
  const practiceStore = usePracticeStore();
  let prepareTimerId = null;
  let recordTimerId = null;

  function clearTimer(timerName) {
    if (timerName === "prepare") {
      clearInterval(prepareTimerId);
      prepareTimerId = null;
      return;
    }

    if (timerName === "record") {
      clearInterval(recordTimerId);
      recordTimerId = null;
    }
  }

  function stopPrepareCountdown() {
    clearTimer("prepare");
  }

  function stopRecordCountdown() {
    clearTimer("record");
  }

  function startPrepareCountdown(seconds = RTS_PREPARE_SECONDS, onFinish) {
    clearTimer("prepare");
    const total = Math.max(1, Math.round(Number(seconds || RTS_PREPARE_SECONDS)));
    let remaining = total;
    practiceStore.setRTSPrepareTimer(remaining, total);

    prepareTimerId = setInterval(() => {
      remaining -= 1;
      practiceStore.setRTSPrepareTimer(Math.max(0, remaining), total);
      if (remaining <= 0) {
        clearTimer("prepare");
        if (typeof onFinish === "function") onFinish();
      }
    }, 1000);
  }

  function startRecordCountdown(seconds = RTS_RECORD_SECONDS, onFinish) {
    clearTimer("record");
    const total = Math.max(1, Math.round(Number(seconds || RTS_RECORD_SECONDS)));
    let remaining = total;
    practiceStore.setRTSRecordTimer(remaining, total);

    recordTimerId = setInterval(() => {
      remaining -= 1;
      practiceStore.setRTSRecordTimer(Math.max(0, remaining), total);
      if (remaining <= 0) {
        clearTimer("record");
        if (typeof onFinish === "function") onFinish();
      }
    }, 1000);
  }

  function stopAllCountdowns() {
    clearTimer("prepare");
    clearTimer("record");
  }

  onUnmounted(() => {
    stopAllCountdowns();
  });

  return {
    startPrepareCountdown,
    startRecordCountdown,
    stopPrepareCountdown,
    stopRecordCountdown,
    stopAllCountdowns
  };
}
