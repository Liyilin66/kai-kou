// DI, RTS and RL still score content and fluency from recognised text with an LLM. Pronunciation
// cannot be judged from text, so, like RA and RS, these task types report it as not assessed.
// Pure module: imported by the API and by the browser bundle.
export const PRONUNCIATION_NOT_ASSESSED_VERSIONS = Object.freeze({
  DI: 'di-legacy-np-0.1',
  RTS: 'rts-legacy-np-0.1',
  RL: 'rl-legacy-np-0.1'
});
const VERSIONS = new Set(Object.values(PRONUNCIATION_NOT_ASSESSED_VERSIONS));

// Previous overall weights with pronunciation removed and the rest scaled to sum to 1:
// DI 0.45/0.25/0.30 -> 0.6/0.4, RTS 0.15/0.25/0.60 -> 0.2/0.8, RL equal thirds -> halves.
export const OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION = Object.freeze({
  DI: Object.freeze({ content: 0.6, fluency: 0.4 }),
  RTS: Object.freeze({ content: 0.2, fluency: 0.8 }),
  RL: Object.freeze({ content: 0.5, fluency: 0.5 })
});

export function isPronunciationNotAssessedVersion(version) {
  return VERSIONS.has(version);
}

export function weightedOverallWithoutPronunciation(taskType, { content = 0, fluency = 0 } = {}) {
  const weights = OVERALL_WEIGHTS_WITHOUT_PRONUNCIATION[taskType];
  if (!weights) throw new Error(`No pronunciation-free weights for ${taskType}`);
  return Number(content || 0) * weights.content + Number(fluency || 0) * weights.fluency;
}

function clearKey(container, key = 'pronunciation') {
  return container && typeof container === 'object' && key in container ? { ...container, [key]: null } : container;
}

// Clears every place a scorer stores a pronunciation number and stamps the version.
export function withPronunciationNotAssessed(result, taskType) {
  const score_version = PRONUNCIATION_NOT_ASSESSED_VERSIONS[taskType];
  if (!score_version) throw new Error(`No pronunciation-free version for ${taskType}`);
  if (!result || typeof result !== 'object') return result;
  const output = { ...result, score_version, pronunciation_status: 'not_assessed' };
  for (const key of ['scores', 'display_scores', 'product']) output[key] = clearKey(output[key]);
  if (output.diagnostics?.display_scores) output.diagnostics = { ...output.diagnostics, display_scores: clearKey(output.diagnostics.display_scores) };
  if (output.raw_traits) output.raw_traits = clearKey(output.raw_traits, 'pronunciation_raw');
  if (output.official_traits?.pronunciation !== undefined) {
    output.official_traits = { ...output.official_traits,
      pronunciation: { score: null, max: output.official_traits.pronunciation?.max ?? null, judged: false, status: 'not_assessed' } };
  }
  return output;
}
