// Build seeds/di/di-answer-key.json by asking an image-capable model what each DI image shows.
// Usage: node scripts/di-build-answer-key.js [--ids DI_Q001,DI_Q002] [--concurrency 4] [--force]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DI_ANSWER_KEY_VERSION, DI_POINT_KINDS, validateAnswerKeyItem } from '../backend/speech/di-answer-key.js';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = join(APP_ROOT, 'seeds/di/di-question-catalog.phase1.json');
const KEY_PATH = join(APP_ROOT, 'seeds/di/di-answer-key.json');
const CACHE_DIR = join(APP_ROOT, 'output/di/answer-key-cache');
const TIMEOUT_MS = 180_000;

export const ANSWER_KEY_PROMPT = `You are preparing an answer key for the PTE Academic "Describe Image" task.
Look at the image carefully and return only JSON in this shape:
{"points":[{"id":"P1","kind":"topic","text":"...","required":true},{"id":"P2","kind":"...","text":"...","value":"..."}]}
Rules:
- 4 to 6 points. P1 is the topic: what the image shows (title or subject, units, place or time range if shown).
- The other points cover, as far as the image allows: the main elements or categories, the highest/lowest or most notable value, key numbers, the main trend, comparison or sequence of steps, and one conclusion a careful viewer could draw.
- Allowed kinds: ${DI_POINT_KINDS.join(', ')}. Use "sequence" for the order of steps in a process or cycle, "element" for main parts of a map or diagram.
- "text" is one plain English sentence (max 30 words) stating the fact, so a grader can check whether a spoken description mentions it.
- "value" holds the exact number(s) with units exactly as printed. If a number is not clearly legible, set "value": null and do not guess. Omit "value" for points without numbers.
- Only describe what is visible in the image. Do not invent data, labels or causes.`;

export function parseModelJSON(text) {
  const trimmed = `${text || ''}`.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

export function buildAnswerKeyItem({ question, parsed, generatedBy }) {
  const points = (Array.isArray(parsed?.points) ? parsed.points : []).map((point, index) => {
    const output = { id: `P${index + 1}`, kind: point?.kind, text: `${point?.text ?? ''}`.trim() };
    if (point?.kind === 'topic') output.required = true;
    if (point && 'value' in point) output.value = point.value === '' ? null : point.value;
    return output;
  });
  return {
    id: question.id,
    answer_key_version: DI_ANSWER_KEY_VERSION,
    image_type: question.imageType,
    points,
    generated_by: generatedBy,
    review: { status: 'unreviewed' }
  };
}

// The relay rate-limits (429) and times out behind Cloudflare (524); back off and retry those.
export async function callVisionModel({ imagePath, prompt, fetchImpl = fetch, env = process.env, wait = ms => new Promise(r => setTimeout(r, ms)), retries = 3 }) {
  for (let attempt = 0; ; attempt++) {
    try { return await requestVisionModel({ imagePath, prompt, fetchImpl, env }); }
    catch (error) {
      if (!error.retryable || attempt >= retries) throw error;
      await wait(15_000 * 2 ** attempt);
    }
  }
}

async function requestVisionModel({ imagePath, prompt, fetchImpl, env }) {
  const base = `${env.AGENT_OPENAI_BASE_URL || ''}`.trim().replace(/\/+$/, '');
  const apiKey = `${env.AGENT_OPENAI_API_KEY || ''}`.trim();
  const model = `${env.DI_KEY_VISION_MODEL || env.AGENT_OPENAI_MODEL || ''}`.trim();
  if (!base || !apiKey || !model) throw new Error('AGENT_OPENAI_BASE_URL, AGENT_OPENAI_API_KEY and a model are required');
  const image = (await readFile(imagePath)).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }
      ] }] })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(`vision model HTTP ${response.status}`), { retryable: response.status === 429 || response.status >= 500 });
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('vision model returned empty content');
    return { text, requested_model: model, model: body?.model || model, usage: body?.usage || null };
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('vision model timed out'), { retryable: true });
    throw error;
  } finally { clearTimeout(timer); }
}

async function generateOne({ question, callModel, now }) {
  const imagePath = join(APP_ROOT, 'public', question.imageUrl.replace(/^\/+/, ''));
  let prompt = ANSWER_KEY_PROMPT;
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callModel({ imagePath, prompt });
    let item, errors;
    try {
      item = buildAnswerKeyItem({ question, parsed: parseModelJSON(result.text),
        generatedBy: { provider: 'openai-compatible', requested_model: result.requested_model, model: result.model, at: now(), attempts: attempt } });
      errors = validateAnswerKeyItem(item);
    } catch { errors = ['response is not valid JSON']; }
    attempts.push({ attempt, model: result.model, usage: result.usage, errors, raw: result.text });
    if (!errors.length) return { item, attempts };
    prompt = `${ANSWER_KEY_PROMPT}\n\nYour previous answer was rejected: ${errors.join('; ')}. Return corrected JSON only.`;
  }
  return { item: null, attempts };
}

export async function buildAnswerKey({ catalog, existing = { items: [] }, callModel, ids, force = false, concurrency = 4,
  now = () => new Date().toISOString(), onResult = () => {} }) {
  const byId = new Map((existing.items || []).map(item => [item.id, item]));
  const queue = catalog.questions.filter(question => (!ids || ids.includes(question.id))
    && (force ? byId.get(question.id)?.review?.status !== 'reviewed' : !byId.has(question.id)));
  const failures = [];
  const worker = async () => {
    for (let question = queue.shift(); question; question = queue.shift()) {
      try {
        const { item, attempts } = await generateOne({ question, callModel, now });
        await onResult({ id: question.id, ok: Boolean(item), attempts, item });
        if (item) byId.set(question.id, item); else failures.push({ id: question.id, errors: attempts.at(-1).errors });
      } catch (error) {
        await onResult({ id: question.id, ok: false, error: error.message });
        failures.push({ id: question.id, errors: [error.message] });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const order = new Map(catalog.questions.map((question, index) => [question.id, index]));
  const items = [...byId.values()].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  return { file: { answer_key_version: DI_ANSWER_KEY_VERSION, items }, failures };
}

function parseArgs(argv) {
  const value = flag => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  return { ids: value('--ids')?.split(',').map(id => id.trim()).filter(Boolean), concurrency: Number(value('--concurrency') || 4), force: argv.includes('--force') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const existing = await readFile(KEY_PATH, 'utf8').then(JSON.parse).catch(() => ({ items: [] }));
  await mkdir(CACHE_DIR, { recursive: true });
  // Persist each finished image so an interrupted run keeps its work.
  const saved = new Map((existing.items || []).map(item => [item.id, item]));
  const order = new Map(catalog.questions.map((question, index) => [question.id, index]));
  let writes = Promise.resolve();
  const { file, failures } = await buildAnswerKey({ catalog, existing, ...args,
    callModel: options => callVisionModel(options),
    onResult: async ({ item, ...result }) => {
      await writeFile(join(CACHE_DIR, `${result.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
      if (item) {
        saved.set(item.id, item);
        const items = [...saved.values()].sort((a, b) => order.get(a.id) - order.get(b.id));
        writes = writes.then(() => writeFile(KEY_PATH, `${JSON.stringify({ answer_key_version: DI_ANSWER_KEY_VERSION, items }, null, 2)}\n`));
        await writes;
      }
      console.log(`${result.id} ${result.ok ? 'ok' : 'failed'}${result.attempts ? ` attempts=${result.attempts.length} model=${result.attempts.at(-1).model}` : ` ${result.error}`}`);
    } });
  await writes;
  await writeFile(KEY_PATH, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`items=${file.items.length} failures=${failures.length}`);
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
