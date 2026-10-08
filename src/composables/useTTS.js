import { ref } from "vue";

export function useTTS() {
  const isPlaying = ref(false);
  const isSupported = ref(typeof window !== "undefined" && "speechSynthesis" in window);

  let utterance = null;
  let voiceChangeHandler = null;

  function getBestVoice() {
    if (!isSupported.value) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang === "en-AU") || voices.find((v) => v.lang === "en-GB") || voices.find((v) => v.lang.startsWith("en")) || null;
  }

  function speak(text, onEnd) {
    if (!isSupported.value || !text) {
      if (onEnd) onEnd();
      return;
    }

    stop();

    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-AU";
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const applyVoice = () => {
      const voice = getBestVoice();
      if (voice && utterance) {
        utterance.voice = voice;
      }
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      applyVoice();
    } else {
      voiceChangeHandler = () => applyVoice();
      window.speechSynthesis.onvoiceschanged = voiceChangeHandler;
    }

    utterance.onstart = () => {
      isPlaying.value = true;
    };

    utterance.onend = () => {
      isPlaying.value = false;
      cleanupVoiceHandler();
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      isPlaying.value = false;
      cleanupVoiceHandler();
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (!isSupported.value) return;
    window.speechSynthesis.cancel();
    isPlaying.value = false;
    cleanupVoiceHandler();
  }

  function cleanupVoiceHandler() {
    if (voiceChangeHandler && window.speechSynthesis.onvoiceschanged === voiceChangeHandler) {
      window.speechSynthesis.onvoiceschanged = null;
    }
    voiceChangeHandler = null;
  }

  return {
    isPlaying,
    isSupported,
    speak,
    stop
  };
}
