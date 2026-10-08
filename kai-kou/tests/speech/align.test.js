import test from 'node:test';
import assert from 'node:assert/strict';
import { alignWords, normalizeTokens } from '../../backend/speech/align.js';

test('identical text matches every normalized word', () => {
  const result = alignWords('The boat crossed the water.', 'The boat crossed the water.');
  assert.equal(result.summary.completeness, 1);
  assert.equal(result.summary.matched, 5);
  assert.ok(result.ops.every((op) => op.type === 'match'));
});

test('middle omission retains its reference index', () => {
  const result = alignWords('large cargo boats', 'large boats');
  assert.deepEqual(result.ops.map((op) => [op.type, op.ref_index, op.hyp_index]), [
    ['match', 0, 0], ['omission', 1, null], ['match', 2, 1],
  ]);
  assert.equal(result.ops[1].hyp_text, null);
  assert.equal(result.summary.omitted, 1);
});

test('repeated word is tagged even when tie-breaking inserts before its match', () => {
  const result = alignWords('the boat', 'the the boat');
  assert.equal(result.summary.inserted, 1);
  assert.equal(result.summary.repetitions, 1);
  assert.equal(result.ops.find((op) => op.type === 'insertion').tag, 'repetition');
});

test('filler is an insertion, not a substitution', () => {
  const result = alignWords('large boats', 'large um boats');
  assert.equal(result.summary.fillers, 1);
  assert.equal(result.summary.substituted, 0);
  assert.equal(result.ops[1].tag, 'filler');
});

for (const [reference, hypothesis, norm] of [
  ['five thousand', '5000', '#5000'],
  ['5,000', 'five thousand', '#5000'],
  ['two thousand and five', '2005', '#2005'],
  ['one hundred and twenty', '120', '#120'],
  ['a thousand', '1000', '#1000'],
  ['nineteen ninety', '1990', '#1990'],
  ['twenty twenty', '2020', '#2020'],
  ['19th', 'nineteenth', '#19th'],
  ['3.50', '03.5', '#3.5'],
  ['one million two hundred thousand and five', '1200005', '#1200005'],
]) {
  test(`number normalization: ${reference} matches ${hypothesis}`, () => {
    const result = alignWords(reference, hypothesis);
    assert.equal(result.summary.completeness, 1);
    assert.equal(result.reference.length, 1);
    assert.equal(result.reference[0].norm, norm);
  });
}

test('percent symbol expands into number and percent', () => {
  const result = alignWords('40%', 'forty percent');
  assert.deepEqual(result.reference.map((token) => token.norm), ['#40', 'percent']);
  assert.equal(result.summary.matched, 2);
});

test('number parsing does not swallow conjunctions or consecutive single digits', () => {
  assert.deepEqual(normalizeTokens('five thousand and boats').map((token) => token.norm), ['#5000', 'and', 'boats']);
  assert.deepEqual(normalizeTokens('one two three a boat').map((token) => token.norm), ['#1', '#2', '#3', 'a', 'boat']);
});

test('American and British spelling variants match', () => {
  const result = alignWords('travelled colour centre modelling organise analysed', 'traveled color center modeling organize analyzed');
  assert.equal(result.summary.matched, 6);
  assert.equal(result.summary.completeness, 1);
  assert.equal(normalizeTokens('exercise')[0].norm, 'exercise');
});

test('contractions expand but possessives retain apostrophes', () => {
  const result = alignWords("hadn't it's don't can't won't i'm they're earth's", "had not it is do not can not will not i am they are earth's");
  assert.equal(result.summary.completeness, 1);
  assert.equal(result.reference.at(-1).norm, "earth's");
  assert.equal(result.reference[0].text, "hadn't");
  assert.equal(result.reference[1].text, "hadn't");
});

test('hyphens and unicode dashes split words', () => {
  const result = alignWords('well-known long—term', 'well known long term');
  assert.equal(result.summary.matched, 4);
});

test('punctuation, case and curly quotes do not affect matches', () => {
  const result = alignWords('“IT’S” EARTH’S water!', "it is earth's water");
  assert.equal(result.summary.matched, 3);
});

test('low-confidence substitutions remain visible but are excluded from user-error count', () => {
  const result = alignWords('boats', [{ text: 'boat', confidence: 0.3 }]);
  assert.equal(result.ops[0].type, 'substitution');
  assert.equal(result.ops[0].tag, 'low_confidence');
  assert.equal(result.summary.substituted, 0);
  assert.equal(result.summary.low_confidence, 1);
  assert.equal(result.summary.completeness, 0);
  assert.equal(alignWords('boats', [{ text: 'boat', confidence: 0.3 }], { lowConfidenceThreshold: 0.2 }).summary.substituted, 1);
});

test('confidence at the threshold and missing confidence do not suppress substitutions', () => {
  assert.equal(alignWords('boats', [{ text: 'boat', confidence: 0.6 }]).summary.substituted, 1);
  assert.equal(alignWords('boats', 'boat').summary.substituted, 1);
});

test('timestamped words carry metadata into match and substitution operations', () => {
  const result = alignWords('large boats', [
    { text: 'large', start_ms: 120, end_ms: 400, confidence: 0.99 },
    { text: 'boat', start_ms: 410, end_ms: 700, confidence: 0.8 },
  ]);
  assert.deepEqual(result.ops.map(({ start_ms, end_ms, confidence }) => ({ start_ms, end_ms, confidence })), [
    { start_ms: 120, end_ms: 400, confidence: 0.99 },
    { start_ms: 410, end_ms: 700, confidence: 0.8 },
  ]);
});

test('merged number spans first to last word, keeps minimum observed confidence', () => {
  const words = [
    { text: 'five', start_ms: 50, end_ms: 150, confidence: 0.9 },
    { text: 'thousand', start_ms: 170, end_ms: 400, confidence: 0.7 },
  ];
  const before = structuredClone(words);
  const result = alignWords('5000', words);
  assert.deepEqual(result.hypothesis[0], { index: 0, text: 'five thousand', norm: '#5000', start_ms: 50, end_ms: 400, confidence: 0.7 });
  assert.deepEqual(words, before);
});

test('empty hypothesis yields only omissions and zero completeness', () => {
  const result = alignWords('large boats', '');
  assert.equal(result.summary.omitted, 2);
  assert.equal(result.summary.completeness, 0);
  assert.ok(result.ops.every((op) => op.start_ms === null && op.confidence === null));
});

test('empty reference has well-defined completeness and insertion counts', () => {
  assert.equal(alignWords('', '').summary.completeness, 0);
  assert.equal(alignWords('', 'a boat').summary.inserted, 2);
});

test('similarity assigns waterfront to water rather than first', () => {
  const result = alignWords('water first began', 'waterfront began');
  assert.deepEqual(result.ops.map((op) => [op.type, op.ref_text, op.hyp_text]), [
    ['substitution', 'water', 'waterfront'], ['omission', 'first', null], ['match', 'began', 'began'],
  ]);
  assert.equal(result.ops[0].similarity, 0.5);
});

test('repeated calls including ties produce identical results', () => {
  const input = ['the the boat water first', 'the boat waterfront'];
  assert.deepEqual(alignWords(...input), alignWords(...input));
  assert.deepEqual(normalizeTokens('5000 well-known'), [
    { index: 0, text: '5000', norm: '#5000' }, { index: 1, text: 'well', norm: 'well' }, { index: 2, text: 'known', norm: 'known' },
  ]);
});

test('RA_024 has exactly the known ten unmatched reference words', () => {
  const reference = 'Not a lot is known about how the transportation of goods by water first began. Large cargo boats were being used in some parts of the world up to five thousand years ago. However, sea trade became more widespread when large sailing boats travelled between ports, carrying spices, perfumes and objects made by hand.';
  const hypothesis = 'Not a lot is knowing about how the transportation of goods by waterfront began large cargo boats were being used in some parts of the world up to 5000 years ago however sea tree become more widespread with large selling boat traveled between ports carrying species performance and objects made by hand';
  const result = alignWords(reference, hypothesis);
  assert.deepEqual(result.ops.filter((op) => op.ref_index !== null && op.type !== 'match').map((op) => op.ref_text), [
    'known', 'water', 'first', 'trade', 'became', 'when', 'sailing', 'boats', 'spices', 'perfumes',
  ]);
  assert.ok(result.ops.some((op) => op.type === 'match' && op.ref_text === 'five thousand' && op.hyp_text === '5000'));
  assert.ok(result.ops.some((op) => op.type === 'match' && op.ref_text === 'travelled' && op.hyp_text === 'traveled'));
});

test('invalid inputs fail explicitly', () => {
  assert.throws(() => normalizeTokens(null), TypeError);
  assert.throws(() => alignWords('boat', null), TypeError);
  assert.throws(() => alignWords('boat', [{}]), TypeError);
  assert.throws(() => alignWords('boat', 'boat', { lowConfidenceThreshold: -1 }), RangeError);
});

for (const [reference, hypothesis, norms] of [
  ['the twenty-first century', 'the 21st century', ['the', '#21st', 'century']],
  ['the 21st century', 'the twenty first century', ['the', '#21st', 'century']],
  ['about 2 million people', 'about two million people', ['about', '#2000000', 'people']],
  ['about 1.5 million people', 'about one point five million people', ['about', '#1500000', 'people']],
  ['it was 3.5 metres', 'it was three point five meters', ['it', 'was', '#3.5', 'meters']],
  ['in the 1990s', 'in the nineteen nineties', ['in', 'the', '#1990s']],
  ['costs $5 each', 'costs five dollars each', ['costs', '#5', 'dollars', 'each']],
  ['£5', 'five pounds', ['#5', 'pounds']],
  ['€5', 'five euros', ['#5', 'euros']],
  ['$2 million', 'two million dollars', ['#2000000', 'dollars']],
  ['zero point zero five', '0.05', ['#0.05']],
  ['thirty-second', '32nd', ['#32nd']],
  ['hundredth thousandth', '100th 1000th', ['#100th', '#1000th']],
]) {
  test(`review numeric regression: ${reference}`, () => {
    const result = alignWords(reference, hypothesis);
    assert.deepEqual(result.reference.map(t => t.norm), norms);
    assert.deepEqual(result.hypothesis.map(t => t.norm), norms);
    assert.ok(result.ops.every(op => op.type === 'match'));
  });
}

for (const group of [
  ['its', "it's"], ['there', 'their', "they're"], ['your', "you're"], ['whose', "who's"],
  ['to', 'too', 'two'], ['for', 'four'], ['one', 'won'], ['ate', 'eight'],
  ['know', 'no'], ['knew', 'new'], ['hear', 'here'], ['right', 'write'], ['by', 'buy'],
  ['whether', 'weather'], ['weak', 'week'], ['sea', 'see'], ['son', 'sun'],
]) {
  test(`review homophones: ${group.join('/')}`, () => {
    for (const left of group) for (const right of group) {
      if (left === right) continue;
      const result = alignWords(`word ${left} end`, `word ${right} end`);
      assert.deepEqual(result.ops.map(op => op.type), ['match', 'substitution', 'match']);
      assert.equal(result.ops[1].tag, 'homophone');
      assert.equal(result.summary.substituted, 0);
      assert.equal(result.summary.homophones, 1);
      assert.equal(result.summary.omitted + result.summary.inserted, 0);
    }
  });
}

test('homophone contractions remain single tokens and explicit expansions still match', () => {
  assert.deepEqual(normalizeTokens("it's they're you're who's").map(t => t.norm), ["it's", "they're", "you're", "who's"]);
  assert.equal(alignWords("it's they're you're who's", 'it is they are you are who is').summary.completeness, 1);
});

test('merged decimal scales retain the complete timestamp span and minimum confidence', () => {
  const words = ['one', 'point', 'five', 'million'].map((text, i) => ({text, start_ms: i * 100, end_ms: i * 100 + 90, confidence: 0.9 - i / 10}));
  const result = alignWords('1.5 million', words);
  assert.equal(result.hypothesis[0].norm, '#1500000');
  assert.equal(result.ops[0].start_ms, 0);
  assert.equal(result.ops[0].end_ms, 390);
  assert.equal(result.ops[0].confidence, words[3].confidence);
});

test('homophones supersede confidence uncertainty without suppressing unrelated errors', () => {
  assert.equal(alignWords('to', [{text: 'two', confidence: 0.2}]).ops[0].tag, 'homophone');
  assert.equal(alignWords('sea trade', 'see tree').summary.substituted, 1);
  assert.deepEqual(normalizeTokens('the nineties').map(t => t.norm), ['the', 'nineties']);
});


test('unscaled Arabic numbers preserve precision and remain separate', () => {
  assert.deepEqual(normalizeTokens('9007199254740993 19 90').map(t => t.norm), ['#9007199254740993', '#19', '#90']);
});

test('currency and scaled Arabic amounts retain word timestamps', () => {
  const result = alignWords('two million dollars', [
    { text: '$2', start_ms: 10, end_ms: 80, confidence: 0.9 },
    { text: 'million', start_ms: 100, end_ms: 200, confidence: 0.7 },
  ]);
  assert.equal(result.summary.completeness, 1);
  assert.deepEqual(result.hypothesis.map(t => t.norm), ['#2000000', 'dollars']);
  assert.equal(result.ops[0].start_ms, 10);
  assert.equal(result.ops[0].end_ms, 200);
  assert.equal(result.ops[0].confidence, 0.7);
});


for (const [reference, hypothesis, norm] of [
  ['4.1 million', '4100000', '#4100000'],
  ['four point one million', '4100000', '#4100000'],
  ['4.1000001 million', '4100000.1', '#4100000.1'],
  ['0.0000001 million', '0.1', '#0.1'],
]) {
  test(`decimal scales avoid binary multiplication artifacts: ${reference}`, () => {
    const result = alignWords(reference, hypothesis);
    assert.deepEqual(result.reference.map(token => token.norm), [norm]);
    assert.equal(result.summary.completeness, 1);
  });
}
