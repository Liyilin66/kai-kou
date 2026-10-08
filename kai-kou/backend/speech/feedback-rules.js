import { normalizeTokens } from './align.js';
// Shared with the result page: deterministic fallbacks never call a provider.
const TYPE_PATTERNS = {
  omission: /漏读|漏词|遗漏|未读|未识别到|缺词|少读/,
  insertion: /多读|额外|增读|插入|多余/,
  repetition: /重复|反复读|重读了/,
  substitution: /读错|识别不清|识别不确定|替换|识别差异|转写差异/,
  hesitation: /停顿|犹豫|卡顿|不连贯/,
  long_pause: /停顿|犹豫|卡顿|不连贯/,
  late_start: /开口|起读|开始.*慢|启动|延迟/,
};
const TIME_CLAIM = /(?:[0-9零一二三四五六七八九十百两]+(?:[.点][0-9零一二三四五六七八九十百两]+)?)\s*(?:毫秒|秒|分钟)/;
const englishWords = text => String(text ?? '').toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
const BANNED = /发音错误|发音不准|分数|\d\s*分|PTE|发音|音素|重音|口音|语法|拼写/i;
const length = text => Array.from(text).length;
export function selectFeedbackEvidence(evidence = []) {
  return (Array.isArray(evidence) ? evidence : []).filter(item => item && TYPE_PATTERNS[item.type] && typeof item.id === 'string')
    .slice().sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, 6);
}

export function feedbackSentenceContext(referenceText = '') {
  let offset = 0;
  return (String(referenceText).match(/[^.!?]+[.!?]*/g) ?? []).map((text, index) => {
    const start = offset;
    offset += normalizeTokens(text).length;
    return { index, start, end: offset, text: text.trim() };
  });
}

export function validateFeedback(payload, evidence = [], referenceText = '') {
  const errors = [];
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(payload)) return { ok: false, errors: ['反馈必须是 JSON 对象'] };
  if (Object.keys(payload).some(key => !['summary', 'suggestions'].includes(key))) errors.push('只允许 summary 和 suggestions 字段');
  function checkText(text, max, label) {
    if (typeof text !== 'string' || !text.trim() || length(text) > max) errors.push(`${label} 必须是 1–${max} 字的文本`);
    else {
      if (!/[\u3400-\u9fff]/u.test(text)) errors.push(`${label} 必须用中文`);
      if (BANNED.test(text)) errors.push(`${label} 含禁用词或无依据的专业判断`);
    }
  }
  checkText(payload.summary, 60, 'summary');
  const items = Array.isArray(evidence) ? evidence : [];
  const sentences = feedbackSentenceContext(referenceText);
  const sentenceFor = item => sentences.find(sentence => item?.ref_span?.[0] >= sentence.start
    && item?.ref_span?.[0] < sentence.end && item.ref_span[1] <= sentence.end);
  const byId = new Map(items.map(item => [item?.id, item]));
  function checkGrounding(text, cited, label) {
    if (typeof text !== 'string') return;
    // Timing is displayed from code-owned evidence. The model may not invent it.
    if (TIME_CLAIM.test(text)) errors.push(`${label} 不允许自行描述时长，请引用证据标签回听`);
    const words = new Set(cited.flatMap(item => englishWords([sentenceFor(item)?.text, item?.text, item?.detail?.expected, item?.detail?.observed].filter(Boolean).join(' '))));
    if (englishWords(text).some(word => !words.has(word))) errors.push(`${label} 含所引用证据之外的英文词语`);
  }
  checkGrounding(payload.summary, items, 'summary');
  if (!Array.isArray(payload.suggestions)) return { ok: false, errors: [...errors, 'suggestions 必须是数组'] };
  if (payload.suggestions.length > 3 || (items.length > 0 && !payload.suggestions.length)
    || (!items.length && payload.suggestions.length)) errors.push('有证据时建议须为 1–3 条，无证据时须为 0 条');
  for (const [i, suggestion] of payload.suggestions.entries()) {
    const label = `suggestions[${i}]`;
    if (!object(suggestion)) { errors.push(`${label} 必须是对象`); continue; }
    if (Object.keys(suggestion).some(key => !['evidence_ids', 'issue', 'action'].includes(key))) errors.push(`${label} 包含额外字段`);
    checkText(suggestion.issue, 40, `${label}.issue`);
    checkText(suggestion.action, 60, `${label}.action`);
    const ids = suggestion.evidence_ids;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !byId.has(id))) {
      errors.push(`${label}.evidence_ids 必须引用已有证据编号`); continue;
    }
    const types = new Set(ids.map(id => byId.get(id).type));
    const issue = typeof suggestion.issue === 'string' ? suggestion.issue : '';
    const action = typeof suggestion.action === 'string' ? suggestion.action : '';
    const mentioned = Object.entries(TYPE_PATTERNS).filter(([, pattern]) => pattern.test(issue)).map(([type]) => type);
    const compatible = type => types.has(type) || (['long_pause', 'hesitation'].includes(type) && (types.has('long_pause') || types.has('hesitation')));
    if (!mentioned.length || mentioned.some(type => !compatible(type)) || [...types].some(type => !TYPE_PATTERNS[type]?.test(issue))) {
      errors.push(`${label}.issue 问题类型必须与引用证据一致`);
    }
    const cited = ids.map(id => byId.get(id));
    if (ids.length > 1 && (types.size !== 1 || !sentenceFor(cited[0])
      || cited.some(item => sentenceFor(item)?.index !== sentenceFor(cited[0]).index))) {
      errors.push(`${label} 多个证据必须属于同一类型、同一句原文`);
    }
    checkGrounding(issue, cited, `${label}.issue`);
    checkGrounding(action, cited, `${label}.action`);
    for (const [type, pattern] of Object.entries(TYPE_PATTERNS)) {
      if (!pattern.test(action) || compatible(type)) continue;
      // Repeating a phrase is a practice instruction, not evidence of a repetition.
      const repetitionPractice = type === 'repetition' && /重复|反复读/.test(action)
        && !/重复了|重复词|重复问题|(?:你|这里|此处|该处|录音|识别|存在|出现|发现).*重复/.test(action)
        && /遍|次|练习|先|再|请/.test(action);
      if (!repetitionPractice) errors.push(`${label}.action 提到了引用证据不支持的问题类型 ${type}`);
    }
    // Substitution remains explicitly uncertain in both explanation and practice.
    if (types.has('substitution') && (!/可能|不确定/.test(issue) || !/回听/.test(`${issue}${action}`))) errors.push(`${label} 替换证据必须保留不确定性并建议回听`);
  }
  // A summary must not introduce a diagnosed category absent from all evidence.
  if (typeof payload.summary === 'string') for (const [type, pattern] of Object.entries(TYPE_PATTERNS)) {
    if (pattern.test(payload.summary) && !items.some(item => item?.type === type ||
      (['hesitation', 'long_pause'].includes(type) && ['hesitation', 'long_pause'].includes(item?.type)))) errors.push(`summary 提到了无证据的问题类型 ${type}`);
  }
  return { ok: !errors.length, errors };
}

export function buildTemplateFeedback({ evidence = [], metrics = {} } = {}) {
  const selected = selectFeedbackEvidence(evidence);
  if (!selected.length) {
    return { summary: Number.isFinite(metrics.wpm) && metrics.wpm > 0
      ? `已完成朗读，当前语速约每分钟${Math.round(metrics.wpm)}词，继续保持清晰连贯。`
      : '已完成本次朗读，继续对照原文保持清晰连贯。', suggestions: [] };
  }
  const suggestions = selected.slice(0, 3).map(item => {
    const word = length(String(item.text ?? '')) <= 12 && !BANNED.test(String(item.text ?? '')) && !TIME_CLAIM.test(String(item.text ?? ''))
      ? String(item.text ?? '') : '';
    const place = word ? `“${word}”处` : '标记位置';
    const issues = {
      omission: `${place}可能漏读了词语`, insertion: `${place}识别到额外词语`, repetition: `${place}识别到重复词语`,
      substitution: `${place}可能读错或识别不清`, hesitation: `${place}存在犹豫停顿`,
      long_pause: `${place}存在较长停顿`, late_start: '录音开始后开口较晚',
    };
    const actions = {
      omission: '回听标记位置，对照原文慢读，再完整读一遍。', insertion: '回听标记位置，对照原文确认后再读一遍。',
      repetition: '回听标记位置，先慢读这一句，再连贯读三遍。', substitution: '先回听这一处，确认是否读错或识别不清，再对照原文重读。',
      hesitation: '回听标记位置，先把前后词语连起来练三遍。', long_pause: '回听标记位置，先把这一句连贯读三遍。',
      late_start: '先看清开头几个词，准备好后及时开口，再试一次。',
    };
    return { evidence_ids: [item.id], issue: issues[item.type], action: actions[item.type] };
  });
  return { summary: '先回听标记位置，再按下面的建议练习。', suggestions };
}
