import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreRA } from '../../backend/speech/scoring.js';
import { diagnosisWordItems } from '../../src/lib/ra-diagnosis.js';
import {
  ANNOTATION_TAP_HINT, IMPROVED_CHECK_NOTE, PUNCTUATION_PAUSE_LABEL, PUNCTUATION_PAUSE_NOTE,
  evidenceLabel, evidenceNote, evidencePhrase, fluencyExplanation
} from '../../src/lib/ra-diagnosis-copy.js';

const source = fs.readFileSync(new URL('../../src/components/ra/RADiagnosisResult.vue', import.meta.url), 'utf8');

test('the fluency line states the band and this attempt\'s counts in place', () => {
  const fluency = { band: 3, label: 'Good', evidence: { D: 2, L: 0, W: 120, R: 9 } };
  assert.deepEqual(fluencyExplanation(fluency, { metrics: { hesitation_count: 2 } }), {
    basis: '3/5 档：有 2 次犹豫、0 次长停顿',
    meaning: '这一档表示没有长停顿，犹豫、重复共 2–3 次。'
  });
  // D counts hesitations plus recognised repetitions; the line names both.
  assert.equal(fluencyExplanation({ band: 2, evidence: { D: 4, L: 0, W: 110 } }, { metrics: { hesitation_count: 1 } }).basis,
    '2/5 档：有 1 次犹豫、3 次重复、0 次长停顿');
  // Speed only appears when it is what set the band.
  assert.equal(fluencyExplanation({ band: 4, evidence: { D: 0, L: 0, W: 74.6 } }, { metrics: { hesitation_count: 0 } }).basis,
    '4/5 档：有 0 次犹豫、0 次长停顿、语速 75 词/分');
  assert.equal(fluencyExplanation({ band: 0, evidence: { D: 1, L: 0, W: 31 } }, { metrics: { hesitation_count: 1 } }).basis,
    '0/5 档：有 1 次犹豫、0 次长停顿、语速 31 词/分');
  assert.equal(fluencyExplanation({ band: null, evidence: { D: 0, L: 0, W: 0 } }), null);
});

test('long pauses at punctuation are counted as sentence-end pauses in the fluency line', () => {
  const evidence = [{ id: 'E1', type: 'long_pause', detail: { pause_ms: 2400, at_punctuation: true } }];
  assert.equal(fluencyExplanation({ band: 2, evidence: { D: 0, L: 1, W: 100 } }, { metrics: { hesitation_count: 0 }, evidence }).basis,
    '2/5 档：有 0 次犹豫、1 次长停顿（其中 1 次在句末）');
});

test('each band meaning agrees with the real fluency scorer', () => {
  const alignment = { reference: [{ text: 'a' }], ops: [{ type: 'match', ref_index: 0, hyp_index: 0, start_ms: 0, end_ms: 300 }] };
  const claims = [
    ({ D, L, W }) => W < 40 || L >= 2,
    ({ D, L }) => L >= 2 || D >= 6,
    ({ D, L }) => L === 1 || (D >= 4 && D <= 5),
    ({ D, L }) => L === 0 && D >= 2 && D <= 3,
    ({ D, L, W }) => L === 0 && (D === 1 || (D === 0 && W < 90)),
    ({ D, L, W }) => L === 0 && D === 0 && W >= 90
  ];
  const seen = new Set();
  for (const hesitation_count of [0, 1, 2, 3, 4, 5, 6, 7]) for (const long_pause_count of [0, 1, 2, 3]) for (const wpm of [30, 80, 120]) {
    const { fluency } = scoreRA({ alignment, metrics: { hesitation_count, long_pause_count, wpm } });
    seen.add(fluency.band);
    assert.ok(claims[fluency.band](fluency.evidence), `band ${fluency.band} for ${JSON.stringify(fluency.evidence)}`);
    assert.match(fluencyExplanation(fluency, { metrics: { hesitation_count } }).meaning, /^这一档表示/);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5]);
});

const TEXT = 'Technology has changed the way people communicate.';
const alignment = { reference: ['technology', 'has', 'changed', 'the', 'way', 'people', 'communicate'].map((text) => ({ text })) };
const at = (type, index, extra = {}) => ({ id: `E${index}-${type}`, type, ref_span: [index, index + 1], text: alignment.reference[index]?.text, ...extra });
const phraseText = (phrase) => `${phrase.leading ? '… ' : ''}${[...phrase.before, `[${phrase.focus.join(' ')}]`, phrase.inserted ? `+${phrase.inserted}` : '', ...phrase.after].filter(Boolean).join(' ')}${phrase.trailing ? ' …' : ''}`;

test('suggestion phrases take two words either side and stop at the sentence edges', () => {
  const first = at('omission', 0);
  const middle = at('hesitation', 3);
  const last = at('substitution', 6);
  const second = at('omission', 1);
  const words = diagnosisWordItems(alignment, [first, middle, last, second], TEXT);
  assert.deepEqual(evidencePhrase(first, words), { leading: false, before: [], focus: ['Technology'], inserted: '', after: ['has', 'changed'], trailing: true });
  // Only one word exists before the second word, so the phrase starts at the sentence start without an ellipsis.
  assert.equal(phraseText(evidencePhrase(second, words)), 'Technology [has] changed the …');
  assert.equal(phraseText(evidencePhrase(middle, words)), '… has changed [the] way people …');
  // The display keeps the original punctuation on the last word.
  assert.equal(phraseText(evidencePhrase(last, words)), '… way people [communicate.]');
});

test('insertions show the extra word after its anchor; unplaced evidence has no phrase', () => {
  const insertion = { id: 'E9', type: 'insertion', ref_span: [2, 3], text: 'also' };
  const words = diagnosisWordItems(alignment, [insertion], TEXT);
  assert.equal(phraseText(evidencePhrase(insertion, words)), 'Technology has [changed] +also the way …');
  assert.equal(evidencePhrase({ id: 'E1', type: 'late_start', ref_span: null }, words), null);
  assert.equal(evidencePhrase(insertion, []), null);
});

test('long pauses at punctuation are named as sentence-end pauses with the breathing note', () => {
  const endPause = { type: 'long_pause', detail: { pause_ms: 2400, at_punctuation: true } };
  const midPause = { type: 'long_pause', detail: { pause_ms: 2400, at_punctuation: false } };
  assert.equal(PUNCTUATION_PAUSE_LABEL, '句末停顿超过 2 秒');
  assert.equal(evidenceLabel(endPause), '句末停顿超过 2 秒');
  assert.equal(evidenceNote(endPause), '持续 2.4 秒 · 句末可以换气，超过 2 秒会影响流利度');
  assert.equal(evidenceLabel(midPause), '长停顿');
  assert.equal(evidenceNote(midPause), '持续 2.4 秒');
  assert.equal(evidenceLabel({ type: 'substitution' }), '可能读错或识别不清');
  assert.equal(PUNCTUATION_PAUSE_NOTE, '句末可以换气，超过 2 秒会影响流利度');
});

test('the result page uses the shared copy in every place evidence is named', () => {
  assert.match(source, /data-testid="ra-fluency-basis">\{\{ fluencyCopy\.basis \}\}/);
  assert.match(source, /data-testid="ra-suggestion-phrase"/);
  assert.match(source, /<summary><h2>原文与标注<\/h2><span class="tap-hint" data-testid="ra-annotation-hint">\{\{ ANNOTATION_TAP_HINT \}\}<\/span><\/summary>/);
  assert.equal(ANNOTATION_TAP_HINT, '点标出的词可回听');
  assert.match(source, /:title="word\.annotations\.map\(evidenceLabel\)/);
  assert.match(source, /<small>\{\{ evidenceNote\(item\) \}\}<\/small>/);
  assert.match(source, /hint: IMPROVED_CHECK_NOTE/);
  assert.equal(IMPROVED_CHECK_NOTE, '本次未再标出，建议回听确认');
  assert.doesNotMatch(source, /labels\[evidenceById/);
});
