import { computed, onBeforeUnmount, ref } from "vue";

const DEFAULT_IDLE_THRESHOLD_MS = 3 * 60 * 1000;
const DEFAULT_TICK_MS = 1000;

function nowMs() {
  return Date.now();
}

function secondsFromMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.round(numeric / 1000));
}

export function useActivePracticeTimer({
  idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS,
  tickMs = DEFAULT_TICK_MS
} = {}) {
  const startedAt = ref("");
  const completedAt = ref("");
  const activeMs = ref(0);
  const idlePausedMs = ref(0);
  const running = ref(false);

  let timerId = null;
  let lastTickAtMs = 0;
  let lastInteractionAtMs = 0;
  let pageVisible = typeof document === "undefined" ? true : document.visibilityState === "visible";
  let listenersAttached = false;

  const activeSec = computed(() => secondsFromMs(activeMs.value));
  const idlePausedSec = computed(() => secondsFromMs(idlePausedMs.value));

  function syncTick(forceNowMs = nowMs()) {
    if (!running.value || !lastTickAtMs) {
      lastTickAtMs = forceNowMs;
      return;
    }

    const deltaMs = Math.max(0, forceNowMs - lastTickAtMs);
    lastTickAtMs = forceNowMs;
    if (!deltaMs) return;

    const isActive = pageVisible && (forceNowMs - lastInteractionAtMs) <= Math.max(1000, Number(idleThresholdMs || DEFAULT_IDLE_THRESHOLD_MS));
    if (isActive) {
      activeMs.value += deltaMs;
    } else {
      idlePausedMs.value += deltaMs;
    }
  }

  function markInteraction() {
    if (!running.value) return;
    const current = nowMs();
    syncTick(current);
    lastInteractionAtMs = current;
  }

  function handleVisibilityChange() {
    const current = nowMs();
    syncTick(current);
    pageVisible = typeof document === "undefined" ? true : document.visibilityState === "visible";
    if (pageVisible) {
      lastInteractionAtMs = current;
    }
  }

  function attachListeners() {
    if (listenersAttached || typeof window === "undefined" || typeof document === "undefined") return;
    listenersAttached = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("mousemove", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    window.addEventListener("scroll", markInteraction, true);
    window.addEventListener("input", markInteraction, true);
    window.addEventListener("pointerdown", markInteraction, true);
  }

  function detachListeners() {
    if (!listenersAttached || typeof window === "undefined" || typeof document === "undefined") return;
    listenersAttached = false;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("mousemove", markInteraction, true);
    window.removeEventListener("keydown", markInteraction, true);
    window.removeEventListener("scroll", markInteraction, true);
    window.removeEventListener("input", markInteraction, true);
    window.removeEventListener("pointerdown", markInteraction, true);
  }

  function startSession() {
    const current = nowMs();
    stopSession({ finalize: false });
    activeMs.value = 0;
    idlePausedMs.value = 0;
    startedAt.value = new Date(current).toISOString();
    completedAt.value = "";
    lastTickAtMs = current;
    lastInteractionAtMs = current;
    pageVisible = typeof document === "undefined" ? true : document.visibilityState === "visible";
    running.value = true;
    attachListeners();
    timerId = setInterval(() => {
      syncTick(nowMs());
    }, Math.max(250, Number(tickMs || DEFAULT_TICK_MS)));
  }

  function getSnapshot({ includeCompletedAt = false } = {}) {
    if (running.value) {
      syncTick(nowMs());
    }
    return {
      startedAt: `${startedAt.value || ""}`.trim(),
      completedAt: includeCompletedAt ? `${completedAt.value || ""}`.trim() : "",
      activeSec: activeSec.value,
      idlePausedSec: idlePausedSec.value
    };
  }

  function stopSession({ finalize = true } = {}) {
    if (running.value) {
      syncTick(nowMs());
    }
    clearInterval(timerId);
    timerId = null;
    running.value = false;
    if (finalize) {
      completedAt.value = new Date().toISOString();
    } else {
      completedAt.value = "";
    }
    const snapshot = getSnapshot({ includeCompletedAt: finalize });
    detachListeners();
    return snapshot;
  }

  onBeforeUnmount(() => {
    stopSession({ finalize: false });
  });

  return {
    running,
    activeSec,
    idlePausedSec,
    startSession,
    stopSession,
    getSnapshot,
    markInteraction
  };
}
