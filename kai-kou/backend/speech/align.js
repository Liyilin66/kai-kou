const CONTRACTIONS = {
  "hadn't": ['had', 'not'], "don't": ['do', 'not'],
  "can't": ['can', 'not'], "won't": ['will', 'not'], "i'm": ['i', 'am'],
  "isn't": ['is', 'not'], "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'], "weren't": ['were', 'not'], "didn't": ['did', 'not'],
  "doesn't": ['does', 'not'], "haven't": ['have', 'not'], "hasn't": ['has', 'not'],
  "couldn't": ['could', 'not'], "wouldn't": ['would', 'not'], "shouldn't": ['should', 'not'],
  "we're": ['we', 'are'], "i've": ['i', 'have'],
  "we've": ['we', 'have'], "they've": ['they', 'have'], "i'll": ['i', 'will'],
};
const SMALL = Object.fromEntries([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
].map((word, value) => [word, value]));
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1000, million: 1000000, billion: 1000000000 };
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90, hundredth: 100, thousandth: 1000 };
const DECADES = { twenties: 20, thirties: 30, forties: 40, fifties: 50, sixties: 60, seventies: 70, eighties: 80, nineties: 90 };
const CURRENCIES = { '$': 'dollars', '£': 'pounds', '€': 'euros' };
const HOMOPHONE_GROUPS = [
  ['its', "it's"], ['there', 'their', "they're"], ['your', "you're"], ['whose', "who's"],
  ['to', 'too', '#2'], ['for', '#4'], ['#1', 'won'], ['ate', '#8'], ['know', 'no'],
  ['knew', 'new'], ['hear', 'here'], ['right', 'write'], ['by', 'buy'],
  ['whether', 'weather'], ['weak', 'week'], ['sea', 'see'], ['son', 'sun'],
];
const HOMOPHONES = new Map(HOMOPHONE_GROUPS.flatMap((group, index) => group.map(word => [word, index])));
const CONTRACTION_PHRASES = { 'it is': "it's", 'they are': "they're", 'you are': "you're", 'who is': "who's" };
function homophone(left, right) {
  return left !== right && HOMOPHONES.has(left) && HOMOPHONES.get(left) === HOMOPHONES.get(right);
}
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'hmm']);
const SPELLINGS = {
  sizeable: 'sizable',
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring',
  favour: 'favor', favourite: 'favorite', favourites: 'favorites', favourable: 'favorable',
  flavour: 'flavor', flavours: 'flavors', honour: 'honor', honours: 'honors',
  humour: 'humor', labour: 'labor', neighbour: 'neighbor', neighbours: 'neighbors',
  behaviour: 'behavior', behaviours: 'behaviors', odour: 'odor', rumour: 'rumor',
  centre: 'center', centres: 'centers', centred: 'centered', centring: 'centering',
  theatre: 'theater', theatres: 'theaters', metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters',
  travelled: 'traveled', travelling: 'traveling', traveller: 'traveler', travellers: 'travelers',
  modelling: 'modeling', modelled: 'modeled', cancelled: 'canceled', cancelling: 'canceling',
  labelled: 'labeled', labelling: 'labeling', jewellery: 'jewelry',
};

function spelling(word) {
  if (SPELLINGS[word]) return SPELLINGS[word];
  // Restrict suffix rules to known spelling families: e.g. 'exercise' is not 'exercize'.
  return word.replace(/^(organ|real|recogn|special|normal|author|critic|apolog|capital|minim|maxim|priorit|summar|emphas|civil|optim|util|categor)is(e|ed|es|ing|ation|ations)$/, '$1iz$2')
    .replace(/^(anal|paral|catal)ys(e|ed|es|ing)$/, '$1yz$2');
}

function ordinal(value) {
  const lastTwo = value % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th');
  return `#${value}${suffix}`;
}

function cleanCharacters(text) {
  return text.replace(/[‘’ʼ＇]/g, "'").replace(/[‐‑‒–—−]/g, '-');
}

function lex(text, metadata = {}) {
  const words = cleanCharacters(text).match(/[$£€]?\d+(?:,\d{3})*(?:\.\d+)?(?:st|nd|rd|th|s)?%?|[\p{L}]+(?:'[\p{L}]+)*/giu) || [];
  return words.flatMap((text) => {
    const lower = text.toLowerCase();
    const expanded = CONTRACTIONS[lower];
    if (expanded) return expanded.map((norm) => ({ text, norm, ...metadata }));
    if (/^[$£€]?\d/.test(lower)) {
      const currency = CURRENCIES[lower[0]];
      const number = lower.replace(/^[$£€]/, '').replaceAll(',', '').replace(/%$/, '');
      const suffix = number.match(/(st|nd|rd|th|s)$/)?.[0] || '';
      const digits = suffix ? number.slice(0, -suffix.length) : number;
      // String canonicalization preserves integer precision and trims decimal zeroes.
      const [integer, fraction] = digits.split('.');
      const canonicalInteger = integer.replace(/^0+(?=\d)/, '');
      const canonicalFraction = fraction?.replace(/0+$/, '');
      const norm = `#${canonicalInteger}${canonicalFraction ? `.${canonicalFraction}` : ''}${suffix}`;
      const tokens = [{ text, norm, ...metadata }];
      if (currency) tokens.push({ text: lower[0], norm: currency, currency_suffix: true, ...metadata });
      if (lower.endsWith('%')) tokens.push({ text: '%', norm: 'percent', ...metadata });
      return tokens;
    }
    return [{ text, norm: spelling(lower), ...metadata }];
  });
}

function underHundred(tokens, offset) {
  const word = tokens[offset]?.norm;
  if (/^#\d+(?:\.\d+)?$/.test(word)) return { value: Number(word.slice(1)), end: offset + 1 };
  if (Object.hasOwn(SMALL, word)) return { value: SMALL[word], end: offset + 1 };
  if (Object.hasOwn(TENS, word)) {
    const next = tokens[offset + 1]?.norm;
    const unit = SMALL[next];
    return unit > 0 && unit < 10
      ? { value: TENS[word] + unit, end: offset + 2 }
      : { value: TENS[word], end: offset + 1 };
  }
  return null;
}

function numberGroup(tokens, offset) {
  let group = underHundred(tokens, offset);
  if (tokens[offset]?.norm === 'a' && (tokens[offset + 1]?.norm === 'hundred' || SCALES[tokens[offset + 1]?.norm])) {
    group = { value: 1, end: offset + 1 };
  }
  if (!group) return null;
  if (tokens[group.end]?.norm !== 'hundred' || group.value < 1 || group.value > 9) return group;
  let value = group.value * 100;
  let end = group.end + 1;
  const restOffset = tokens[end]?.norm === 'and' ? end + 1 : end;
  const rest = underHundred(tokens, restOffset);
  if (rest) { value += rest.value; end = rest.end; }
  return { value, end };
}

function decimalGroup(tokens, offset) {
  const group = numberGroup(tokens, offset);
  if (!group || tokens[group.end]?.norm !== 'point') return group;
  let end = group.end + 1;
  let digits = '';
  while (Object.hasOwn(SMALL, tokens[end]?.norm) && SMALL[tokens[end].norm] < 10) {
    digits += SMALL[tokens[end].norm]; end++;
  }
  return digits ? { value: Number(`${group.value}.${digits}`), end } : group;
}

function scaleNumber(value, scale) {
  // All supported scales are powers of ten. Shift the decimal exponent rather
  // than multiplying binary floats (4.1 * 1e6 becomes 4099999.9999999995).
  const [coefficient, exponent = '0'] = String(value).split('e');
  return Number(`${coefficient}e${Number(exponent) + Math.log10(scale)}`);
}

function readNumber(tokens, offset) {
  // Already canonical Arabic tokens must retain string precision unless scaled.
  if (/^#\d+(?:\.\d+)?$/.test(tokens[offset]?.norm) && !SCALES[tokens[offset + 1]?.norm]) return null;
  const first = decimalGroup(tokens, offset);
  if (!first) return null;
  const nextWord = tokens[first.end]?.norm;
  if (DECADES[nextWord] !== undefined && first.value >= 10 && first.value <= 99) {
    return { norm: `#${first.value * 100 + DECADES[nextWord]}s`, end: first.end + 1 };
  }
  if (first.value >= 20 && first.value < 100 && first.value % 10 === 0 && ORDINALS[nextWord] > 0 && ORDINALS[nextWord] < 10) {
    return { norm: ordinal(first.value + ORDINALS[nextWord]), end: first.end + 1 };
  }
  let group = first;
  let value = 0;
  let previousScale = Infinity;
  let hadScale = false;
  while (SCALES[tokens[group.end]?.norm] && SCALES[tokens[group.end].norm] < previousScale) {
    const scale = SCALES[tokens[group.end].norm];
    value += scaleNumber(group.value, scale);
    previousScale = scale;
    hadScale = true;
    const scaleEnd = group.end + 1;
    const nextOffset = tokens[scaleEnd]?.norm === 'and' ? scaleEnd + 1 : scaleEnd;
    const next = decimalGroup(tokens, nextOffset);
    if (!next) return { value, end: scaleEnd };
    group = next;
  }
  if (hadScale) return { value: value + group.value, end: group.end };
  // Year-style readings use exactly two adjacent groups in the range 10–99.
  const second = underHundred(tokens, first.end);
  if (first.value >= 10 && first.value <= 99 && second?.value >= 10 && second.value <= 99
      && tokens[second.end]?.norm !== 'hundred' && !SCALES[tokens[second.end]?.norm]) {
    return { value: first.value * 100 + second.value, end: second.end };
  }
  return first;
}

function normalize(raw) {
  // Currency units follow the complete amount, including any following scale.
  raw = raw.map(token => ({ ...token }));
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].currency_suffix && SCALES[raw[i + 1]?.norm]) {
      [raw[i], raw[i + 1]] = [raw[i + 1], raw[i]]; i++;
    }
  }
  const result = [];
  for (let offset = 0; offset < raw.length;) {
    const phrase = CONTRACTION_PHRASES[`${raw[offset]?.norm} ${raw[offset + 1]?.norm}`];
    const number = phrase ? { norm: phrase, end: offset + 2 } : readNumber(raw, offset);
    if (number) {
      const sources = raw.slice(offset, number.end);
      const confidences = sources.map((token) => token.confidence).filter(Number.isFinite);
      result.push({ ...sources[0], text: sources.map((token) => token.text).join(' '), norm: number.norm ?? `#${number.value}`,
        end_ms: sources.at(-1).end_ms, confidence: confidences.length ? Math.min(...confidences) : null });
      offset = number.end;
    } else {
      const token = raw[offset++];
      result.push({ ...token, norm: Object.hasOwn(ORDINALS, token.norm) ? ordinal(ORDINALS[token.norm]) : token.norm });
    }
  }
  // Indices always refer to this normalized sequence, including expanded/merged words.
  return result.map(({ currency_suffix, ...token }, index) => ({ ...token, index }));
}

export function normalizeTokens(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  return normalize(lex(text)).map(({ index, text, norm }) => ({ index, text, norm }));
}

function distance(left, right) {
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[right.length];
}

function similarity(left, right) {
  return 1 - distance(left, right) / Math.max(left.length, right.length, 1);
}

function optionalNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function alignWords(referenceText, hypothesis, options = {}) {
  const reference = normalizeTokens(referenceText);
  const threshold = options.lowConfidenceThreshold ?? 0.6;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('lowConfidenceThreshold must be between 0 and 1');
  let raw;
  if (typeof hypothesis === 'string') {
    raw = lex(hypothesis, { start_ms: null, end_ms: null, confidence: null });
  } else if (Array.isArray(hypothesis)) {
    raw = hypothesis.flatMap((word) => {
      if (typeof word?.text !== 'string') throw new TypeError('hypothesis words must have string text');
      return lex(word.text, { start_ms: optionalNumber(word.start_ms), end_ms: optionalNumber(word.end_ms), confidence: optionalNumber(word.confidence) });
    });
  } else throw new TypeError('hypothesis must be a string or word array');
  const normalizedHypothesis = normalize(raw);
  const rows = reference.length + 1;
  const columns = normalizedHypothesis.length + 1;
  const costs = Array.from({ length: rows }, () => new Float64Array(columns));
  const steps = Array.from({ length: rows }, () => Array(columns));
  for (let i = 1; i < rows; i++) { costs[i][0] = i; steps[i][0] = 'omission'; }
  for (let j = 1; j < columns; j++) { costs[0][j] = j; steps[0][j] = 'insertion'; }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      const same = reference[i - 1].norm === normalizedHypothesis[j - 1].norm;
      const soundsSame = homophone(reference[i - 1].norm, normalizedHypothesis[j - 1].norm);
      const candidates = [
        { type: same ? 'match' : 'substitution', cost: costs[i - 1][j - 1] + (same || soundsSame ? 0 : 1 - 0.5 * similarity(reference[i - 1].norm, normalizedHypothesis[j - 1].norm)) },
        { type: 'omission', cost: costs[i - 1][j] + 1 },
        { type: 'insertion', cost: costs[i][j - 1] + 1 },
      ];
      let best = candidates[0];
      for (const candidate of candidates.slice(1)) if (candidate.cost < best.cost - 1e-10) best = candidate;
      costs[i][j] = best.cost;
      steps[i][j] = best.type;
    }
  }
  const ops = [];
  let i = reference.length;
  let j = normalizedHypothesis.length;
  while (i || j) {
    const type = steps[i][j];
    const ref = type === 'insertion' ? null : reference[i - 1];
    const hyp = type === 'omission' ? null : normalizedHypothesis[j - 1];
    let tag = null;
    if (type === 'insertion') {
      if ([reference[i - 1]?.norm, reference[i]?.norm, normalizedHypothesis[j - 2]?.norm].includes(hyp.norm)) tag = 'repetition';
      else if (FILLERS.has(hyp.norm)) tag = 'filler';
    } else if (type === 'substitution' && homophone(ref.norm, hyp.norm)) tag = 'homophone';
    else if (type === 'substitution' && hyp.confidence !== null && hyp.confidence < threshold) tag = 'low_confidence';
    ops.push({ type, ref_index: ref?.index ?? null, hyp_index: hyp?.index ?? null,
      ref_text: ref?.text ?? null, hyp_text: hyp?.text ?? null,
      start_ms: hyp?.start_ms ?? null, end_ms: hyp?.end_ms ?? null, confidence: hyp?.confidence ?? null,
      tag, similarity: type === 'substitution' ? similarity(ref.norm, hyp.norm) : null });
    if (type !== 'insertion') i--;
    if (type !== 'omission') j--;
  }
  ops.reverse();
  const summary = { ref_count: reference.length, matched: 0, substituted: 0, omitted: 0, inserted: 0,
    repetitions: 0, fillers: 0, low_confidence: 0, homophones: 0, completeness: 0 };
  for (const op of ops) {
    if (op.type === 'match') summary.matched++;
    if (op.type === 'substitution' && op.tag !== 'low_confidence' && op.tag !== 'homophone') summary.substituted++;
    if (op.type === 'omission') summary.omitted++;
    if (op.type === 'insertion') summary.inserted++;
    if (op.tag === 'repetition') summary.repetitions++;
    if (op.tag === 'filler') summary.fillers++;
    if (op.tag === 'homophone') summary.homophones++;
    if (op.tag === 'low_confidence') summary.low_confidence++;
  }
  summary.completeness = reference.length ? summary.matched / reference.length : 0;
  return { reference, hypothesis: normalizedHypothesis, ops, summary };
}
