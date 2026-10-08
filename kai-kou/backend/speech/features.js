import { normalizeTokens } from './align.js';
import { SPEECH_RULES } from './config.js';

function punctuationBoundaries(text) {
  const indices = new Set();
  for (const match of text.matchAll(/[,;:.!?]+(?:["'’”)]*)/g)) {
    if (/^[,.]$/.test(match[0]) && /\d/.test(text[match.index - 1] ?? '') && /\d/.test(text[match.index + 1] ?? '')) continue;
    const count = normalizeTokens(text.slice(0, match.index)).length;
    if (count) indices.add(count - 1);
  }
  return indices;
}

function referenceEndIndex(op) {
  return op.ref_index + Math.max(1, op.ref_count ?? 1) - 1;
}

export function extractFeatures({ alignment, silences = [], speech_onset_ms = null, speech_offset_ms = null,
  referenceText = '', duration_ms } = {}) {
  const reference = alignment?.reference ?? [];
  const timed = (alignment?.ops ?? []).filter(op => Number.isFinite(op.start_ms) && Number.isFinite(op.end_ms));
  const punctuation = punctuationBoundaries(referenceText);
  const boundaries = [];
  for (let i = 0; i < timed.length - 1; i++) {
    const left = timed[i];
    const right = timed[i + 1];
    // Insertions have no reference index; anchor them to the nearest preceding
    // reference word. This also handles omissions between recognized words.
    const anchor = timed.slice(0, i + 1).reverse().find(op => op.ref_index !== null);
    if (!anchor) continue;
    boundaries.push({ time: (left.end_ms + right.start_ms) / 2, index: referenceEndIndex(anchor) });
  }
  const pauses = silences.filter(s => Number.isFinite(s.start_ms) && Number.isFinite(s.end_ms) && s.end_ms > s.start_ms).map(s => {
    const midpoint = (s.start_ms + s.end_ms) / 2;
    const boundary = boundaries.reduce((best, b) => !best || Math.abs(b.time - midpoint) < Math.abs(best.time - midpoint) ? b : best, null);
    const ref_index = boundary?.index ?? null;
    const at_punctuation = ref_index !== null && punctuation.has(ref_index);
    const duration = s.end_ms - s.start_ms;
    let type = 'short_pause';
    if (duration >= SPEECH_RULES.longPauseMs) type = 'long_pause';
    else if (at_punctuation && duration < SPEECH_RULES.naturalPauseMs) type = 'natural';
    else if (!at_punctuation && duration >= SPEECH_RULES.hesitationMs) type = 'hesitation';
    // Punctuation pauses between 1.2s and 2s remain observable without a claim
    // that the supplied rules do not support.
    else if (at_punctuation) type = 'pause';
    return { type, start_ms: s.start_ms, end_ms: s.end_ms, duration_ms: duration, ref_index,
      ref_span: ref_index === null ? null : [ref_index, ref_index + 1],
      text: ref_index === null ? '' : reference[ref_index]?.text ?? '', at_punctuation };
  });
  const span = Number.isFinite(speech_onset_ms) && Number.isFinite(speech_offset_ms)
    ? Math.max(0, speech_offset_ms - speech_onset_ms) : 0;
  // Union clipped intervals so overlap or leading/trailing intervals cannot
  // inflate the silence duration or produce negative articulation time.
  const intervals = pauses.map(p => [Math.max(p.start_ms, speech_onset_ms ?? 0), Math.min(p.end_ms, speech_offset_ms ?? 0)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let silent = 0;
  let end = -Infinity;
  for (const [a, b] of intervals) { silent += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  const active = Math.max(0, span - silent);
  const count = (alignment?.ops ?? []).filter(op => op.hyp_index !== null && !['filler', 'repetition'].includes(op.tag))
    .reduce((sum, op) => sum + Math.max(1, op.hyp_count ?? 1), 0);
  const total = Number.isFinite(duration_ms) && duration_ms >= (speech_offset_ms ?? 0) ? duration_ms : speech_offset_ms ?? 0;
  return { pauses, metrics: {
    speech_onset_ms, speech_offset_ms, duration_ms: total,
    wpm: span ? count * 60000 / span : 0,
    articulation_wpm: active ? count * 60000 / active : 0,
    speech_ratio: total ? active / total : 0,
    hesitation_count: pauses.filter(p => p.type === 'hesitation').length,
    long_pause_count: pauses.filter(p => p.type === 'long_pause').length,
    completeness: alignment?.summary?.completeness ?? 0,
  } };
}
