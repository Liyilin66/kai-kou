import { computed, ref } from "vue";

export function useTimer() {
  const remaining = ref(0);
  const total = ref(0);
  const isRunning = ref(false);
  let timerId = null;

  const progress = computed(() => {
    if (total.value === 0) return 0;
    return Math.max(0, (remaining.value / total.value) * 100);
  });

  const isWarning = computed(() => remaining.value > 0 && remaining.value <= 10);

  function stop() {
    clearInterval(timerId);
    timerId = null;
    isRunning.value = false;
  }

  function start(seconds, onFinish) {
    stop();
    remaining.value = seconds;
    total.value = seconds;
    isRunning.value = true;

    timerId = setInterval(() => {
      remaining.value -= 1;
      if (remaining.value <= 0) {
        remaining.value = 0;
        stop();
        if (onFinish) onFinish();
      }
    }, 1000);
  }

  function reset() {
    stop();
    remaining.value = 0;
    total.value = 0;
  }

  return {
    remaining,
    total,
    progress,
    isWarning,
    isRunning,
    start,
    stop,
    reset
  };
}
