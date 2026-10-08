// Offline diagnosis rules; calibrate on the development set, never the test set.
export const RULES_VERSION = 'ra-diag-0.1';
export const SPEECH_RULES = Object.freeze({
  frameMs: 20,
  minSilenceMs: 250,
  noisePercentile: 0.1,
  speechPercentile: 0.9,
  thresholdFraction: 0.3,
  minimumDynamicRangeDb: 3,
  minimumDb: -120,
  naturalPauseMs: 1200,
  hesitationMs: 500,
  longPauseMs: 2000,
  lateStartMs: 3000,
});
