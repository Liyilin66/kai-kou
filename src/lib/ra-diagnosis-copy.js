// Display copy for the RA/RS diagnosis result page. Wording only: the bands and
// thresholds themselves live in backend/speech (scoring.js, config.js) and are not changed here.

export const EVIDENCE_LABELS = {
  omission: '漏读',
  substitution: '可能读错或识别不清',
  repetition: '重复',
  insertion: '多读',
  hesitation: '犹豫',
  long_pause: '长停顿',
  late_start: '开口延迟'
};

export const PUNCTUATION_PAUSE_LABEL = '句末停顿超过 2 秒';
export const PUNCTUATION_PAUSE_NOTE = '句末可以换气，超过 2 秒会影响流利度';
export const IMPROVED_CHECK_NOTE = '本次未再标出，建议回听确认';
export const ANNOTATION_TAP_HINT = '点标出的词可回听';

const isPunctuationPause = (item) => item?.type === 'long_pause' && item?.detail?.at_punctuation === true;

export function evidenceLabel(item) {
  if (isPunctuationPause(item)) return PUNCTUATION_PAUSE_LABEL;
  return EVIDENCE_LABELS[item?.type] || item?.type || '回听';
}

// The small line under an evidence row: how long the pause was, plus the breathing note at sentence ends.
export function evidenceNote(item) {
  const pauseMs = Number(item?.detail?.pause_ms);
  const duration = Number.isFinite(pauseMs) && pauseMs > 0 ? `持续 ${(pauseMs / 1000).toFixed(1)} 秒` : '';
  if (isPunctuationPause(item)) return [duration, PUNCTUATION_PAUSE_NOTE].filter(Boolean).join(' · ');
  return item?.detail?.description || duration || '点击回听核验';
}

// One sentence per band, restating the ordered rules in backend/speech/scoring.js (scoreFluency).
const BAND_MEANINGS = [
  '语速很慢（低于 40 词/分），或多次长停顿把句子切得很碎。',
  '有 2 次及以上长停顿，或犹豫、重复达到 6 次及以上。',
  '有 1 次长停顿，或犹豫、重复共 4–5 次。',
  '没有长停顿，犹豫、重复共 2–3 次。',
  '没有长停顿，只有 1 次犹豫或重复；或没有卡顿但语速偏慢（低于 90 词/分）。',
  '没有犹豫、重复和长停顿，语速不低于 90 词/分。'
];

const wholeCount = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : null);

// "3/5 档：有 2 次犹豫、0 次长停顿" plus the band's meaning, so the card reads without the rules dialog.
export function fluencyExplanation(fluency, { metrics = {}, evidence = [] } = {}) {
  const band = fluency?.band;
  if (!Number.isInteger(band) || band < 0 || band > 5) return null;
  const D = wholeCount(fluency?.evidence?.D) ?? 0;
  const L = wholeCount(fluency?.evidence?.L) ?? 0;
  const W = Number(fluency?.evidence?.W);
  const hesitations = Math.min(D, wholeCount(metrics.hesitation_count) ?? D);
  const repetitions = D - hesitations;
  const punctuationPauses = evidence.filter(isPunctuationPause).length;
  const parts = [`${hesitations} 次犹豫`];
  if (repetitions > 0) parts.push(`${repetitions} 次重复`);
  parts.push(`${L} 次长停顿${punctuationPauses > 0 && L > 0 ? `（其中 ${Math.min(punctuationPauses, L)} 次在句末）` : ''}`);
  // Speed decides bands 0, 4 and 5 when there are no other problems; show it only then.
  const speedMatters = Number.isFinite(W) && (W < 40 || (L === 0 && D <= 1));
  if (speedMatters) parts.push(`语速 ${Math.round(W)} 词/分`);
  return { basis: `${band}/5 档：有 ${parts.join('、')}`, meaning: `这一档表示${BAND_MEANINGS[band]}` };
}

// The phrase around a piece of evidence: up to two words either side, with the evidence word marked.
// `words` is diagnosisWordItems() output, whose annotations hold the evidence objects.
export function evidencePhrase(item, words = [], radius = 2) {
  if (!item || !Array.isArray(words) || !words.length) return null;
  const positions = words
    .map((word, index) => ((word.annotations || []).some((note) => note === item || (note?.id && note.id === item.id)) ? index : -1))
    .filter((index) => index >= 0);
  if (!positions.length) return null;
  const first = positions[0];
  const last = positions[positions.length - 1];
  const start = Math.max(0, first - radius);
  const end = Math.min(words.length - 1, last + radius);
  const text = (from, to) => words.slice(from, to).map((word) => word.text);
  // An insertion is anchored to the word before it; the extra word itself is not in the original.
  const inserted = item.type === 'insertion' && item.text ? item.text : '';
  return {
    leading: start > 0,
    before: text(start, first),
    focus: text(first, last + 1),
    inserted,
    after: text(last + 1, end + 1),
    trailing: end < words.length - 1
  };
}
