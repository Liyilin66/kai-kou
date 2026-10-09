import { callGroq } from '../llm/providers/groq.js';
import { DI_RELATION_KINDS } from './di-answer-key.js';

// One fixed model at temperature 0 and no fallback: the same answer must not change band
// because a different provider happened to answer.
export const DI_CONTENT_MODEL = 'openai/gpt-oss-120b';
export const DI_CONTENT_PROMPT_VERSION = 'di-content-0.2';
const TIMEOUT_MS = 20_000;

// Project mapping from answer-key coverage to the official 0-6 Content descriptors
// (Score Guide pp.18-19). Inaccurate points are not counted as covered.
export function contentBandFromCoverage({ points = [], coveredIds = [], inaccurateIds = [] }) {
  const n = points.length;
  const covered = new Set(coveredIds);
  const c = covered.size, i = new Set(inaccurateIds).size;
  const topic = points.some(point => point.kind === 'topic' && covered.has(point.id));
  const relation = points.some(point => DI_RELATION_KINDS.has(point.kind) && covered.has(point.id));
  if (!n || c === 0) return 0;
  if (c === n && i === 0) return 6;
  if (c >= Math.ceil(0.75 * n) && topic && relation && i <= 1) return 5;
  if (c >= Math.ceil(0.5 * n) && relation && i <= 1) return 4;
  if (c >= 2 && i <= 2) return 3;
  if (i <= c) return 2;
  return 1;
}

export function normalizeForQuote(text) {
  return `${text || ''}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function describePoint(point) {
  const value = 'value' in point ? ` (value: ${point.value === null ? 'not legible' : point.value})` : '';
  return `${point.id} [${point.kind}] ${point.text}${value}`;
}

export function buildJudgePrompt({ answerKey, transcript }) {
  return `You grade only the CONTENT of a spoken PTE Academic "Describe Image" response.
You cannot see the image. The answer key below is the ground truth for what the image shows.

Answer key:
${answerKey.points.map(describePoint).join('\n')}

Transcript of the spoken response (automatic speech recognition, may contain small recognition errors):
"""${transcript}"""

For every answer-key point decide exactly one of:
- covered: the response conveys the main idea of this point correctly (paraphrase is fine; numbers must match the key apart from rounding).
- inaccurate: the response addresses this point but gets it wrong (wrong number, wrong category, reversed trend).
- missed: the response does not mention it.
Judge each point by its main idea, not by every detail it lists:
- A topic point is covered when the response says what the image is about, even without the title's exact wording or units.
- An element point is covered when the response names most of the main parts listed.
- A number or extreme point is covered when at least one of its key values is stated correctly together with what it refers to.
A point whose key value is "not legible" is covered if the response describes it without contradicting the key.

Return only JSON:
{"covered":[{"point_id":"P1","quote":"..."}],"inaccurate":[{"point_id":"P3","quote":"...","reason":"..."}],"missed":["P4"],"content_band":0}
- Every point id appears in exactly one of covered, inaccurate or missed.
- Each quote is ONE continuous phrase copied word for word from the transcript. Never join separate parts with "..." or other marks; if the support is spread out, quote the single most relevant phrase.
- content_band (0-6): 0 if nothing is covered; 6 if all points are covered with no inaccuracy; 5 if at least 75% are covered including the topic and a trend/comparison/sequence/conclusion point, with at most one inaccuracy; 4 if at least half are covered including a trend/comparison/sequence/conclusion point, with at most one inaccuracy; 3 if at least two are covered with at most two inaccuracies; 2 if inaccuracies do not outnumber covered points; otherwise 1.`;
}

export function validateJudgement(output, { answerKey, transcript }) {
  const errors = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { errors: ['output must be a JSON object'] };
  const pointIds = new Set(answerKey.points.map(point => point.id));
  const normalizedTranscript = ` ${normalizeForQuote(transcript)} `;
  const seen = new Map();
  const note = (id, list) => {
    if (!pointIds.has(id)) errors.push(`${list}: unknown point_id ${id}`);
    else if (seen.has(id)) errors.push(`${id} appears in both ${seen.get(id)} and ${list}`);
    else seen.set(id, list);
  };
  const checkQuoted = (list, needsReason) => {
    if (!Array.isArray(output[list])) { errors.push(`${list} must be an array`); return []; }
    return output[list].map(entry => {
      const id = `${entry?.point_id ?? ''}`;
      note(id, list);
      const quote = typeof entry?.quote === 'string' ? entry.quote.trim() : '';
      const normalizedQuote = normalizeForQuote(quote);
      if (!normalizedQuote) errors.push(`${list} ${id}: quote is required`);
      else if (!normalizedTranscript.includes(` ${normalizedQuote} `)) errors.push(`${list} ${id}: quote not found in transcript`);
      if (needsReason && (typeof entry?.reason !== 'string' || !entry.reason.trim())) errors.push(`${list} ${id}: reason is required`);
      return needsReason ? { point_id: id, quote, reason: `${entry?.reason ?? ''}`.trim() } : { point_id: id, quote };
    });
  };
  const covered = checkQuoted('covered', false);
  const inaccurate = checkQuoted('inaccurate', true);
  let missed = [];
  if (!Array.isArray(output.missed)) errors.push('missed must be an array');
  else { missed = output.missed.map(id => `${id}`); missed.forEach(id => note(id, 'missed')); }
  const absent = [...pointIds].filter(id => !seen.has(id));
  if (absent.length) errors.push(`points not classified: ${absent.join(', ')}`);
  if (!Number.isInteger(output.content_band) || output.content_band < 0 || output.content_band > 6) errors.push('content_band must be an integer 0-6');
  return { errors, covered, inaccurate, missed, model_band: output.content_band };
}

function parseJSON(text) {
  try { return JSON.parse(`${text || ''}`.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()); }
  catch { return null; }
}

export async function judgeDIContent({ answerKey, transcript, callModel = callGroq } = {}) {
  const meta = { model: DI_CONTENT_MODEL, prompt_version: DI_CONTENT_PROMPT_VERSION, answer_key_version: answerKey?.answer_key_version ?? null };
  if (!answerKey?.points?.length) return { status: 'not_scored', reason: 'answer_key_missing', ...meta, attempts: 0 };
  if (!normalizeForQuote(transcript)) {
    return { status: 'scored', reason: 'empty_transcript', covered: [], inaccurate: [], missed: answerKey.points.map(point => point.id),
      content_band: 0, model_band: null, band_mismatch: false, ...meta, attempts: 0, validation_failures: [] };
  }
  const basePrompt = buildJudgePrompt({ answerKey, transcript });
  const validation_failures = [];
  let prompt = basePrompt;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw;
    try { raw = await callModel({ prompt, model: DI_CONTENT_MODEL, temperature: 0, timeoutMs: TIMEOUT_MS }); }
    catch (error) {
      return { status: 'not_scored', reason: 'model_error', error_type: error?.raw_error_type || 'unknown', status_code: error?.status ?? null,
        ...meta, attempts: attempt, validation_failures };
    }
    const parsed = parseJSON(raw?.raw_text);
    const result = parsed ? validateJudgement(parsed, { answerKey, transcript }) : { errors: ['response is not valid JSON'] };
    if (!result.errors.length) {
      const content_band = contentBandFromCoverage({ points: answerKey.points,
        coveredIds: result.covered.map(entry => entry.point_id), inaccurateIds: result.inaccurate.map(entry => entry.point_id) });
      return { status: 'scored', covered: result.covered, inaccurate: result.inaccurate, missed: result.missed,
        content_band, model_band: result.model_band, band_mismatch: result.model_band !== content_band,
        ...meta, attempts: attempt, latency_ms: raw?.latency_ms ?? null, validation_failures };
    }
    validation_failures.push({ attempt, errors: result.errors });
    prompt = `${basePrompt}\n\nYour previous answer was rejected: ${result.errors.join('; ')}. Return corrected JSON only.`;
  }
  return { status: 'not_scored', reason: 'validation_failed', ...meta, attempts: 2, validation_failures };
}
