import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SEED = 'seeds/rs/questions.json';
const DEFAULT_BUCKET = 'question-audio';
const DEFAULT_PREFIX = 'rs';
const DEFAULT_DELAY_MS = 3200;
const AUDIO_FORMAT = 'audio-16khz-32kbitrate-mono-mp3';
const TRUE = new Set(['1', 'true', 'yes', 'y', 'on']);

export function parseArgs(argv) {
  const args = { apply: false, seed: DEFAULT_SEED, bucket: DEFAULT_BUCKET, prefix: DEFAULT_PREFIX, delayMs: DEFAULT_DELAY_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    const value = inlineValue ?? (!argv[i + 1] || argv[i + 1].startsWith('--') ? true : argv[i + 1]);
    if (inlineValue === undefined && value !== true) i += 1;
    if (rawKey === 'apply') args.apply = value === true || TRUE.has(String(value).toLowerCase());
    else if (rawKey === 'seed') args.seed = String(value);
    else if (rawKey === 'bucket') args.bucket = String(value);
    else if (rawKey === 'prefix') args.prefix = String(value);
    else if (rawKey === 'delay-ms') args.delayMs = Math.max(0, Number(value) || 0);
    else throw new Error(`Unknown argument --${rawKey}`);
  }
  return args;
}

export function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function validateQuestions(questions) {
  if (!Array.isArray(questions)) throw new Error('RS seed must be a JSON array.');
  if (questions.length !== 60) throw new Error(`Expected 60 RS questions, got ${questions.length}.`);
  const seen = new Set();
  const bands = { 1: [8, 11], 2: [12, 15], 3: [16, 20] };
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const question of questions) {
    const id = String(question?.id || '').trim();
    if (!/^RS_\d{3}$/.test(id)) throw new Error(`Invalid RS id: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate RS id: ${id}`);
    seen.add(id);
    const difficulty = Number(question.difficulty);
    if (!bands[difficulty]) throw new Error(`${id} has invalid difficulty ${question.difficulty}.`);
    counts[difficulty] += 1;
    const content = String(question.content || '').trim();
    const words = countWords(content);
    const [min, max] = bands[difficulty];
    if (words < min || words > max) throw new Error(`${id} difficulty ${difficulty} must have ${min}-${max} words, got ${words}.`);
    if (!String(question.voice || '').trim()) throw new Error(`${id} is missing an Azure voice.`);
  }
  for (const difficulty of [1, 2, 3]) {
    if (counts[difficulty] !== 20) throw new Error(`Difficulty ${difficulty} must have 20 questions, got ${counts[difficulty]}.`);
  }
  return questions;
}

export function buildStoragePath(question, prefix = DEFAULT_PREFIX) {
  const hash = createHash('sha256').update(`${question.id}\n${question.voice}\n${question.content}`).digest('hex').slice(0, 12);
  return path.posix.join(prefix.replace(/^\/+|\/+$/g, ''), `${question.id.toLowerCase()}-${hash}.mp3`);
}

export function buildQuestionRow(question, audioPath, audioUrl) {
  return {
    id: question.id,
    task_type: 'RS',
    content: question.content,
    audio_path: audioPath,
    audio_url: audioUrl,
    difficulty: question.difficulty,
    is_active: true
  };
}

export function buildSsml(question) {
  const escaped = String(question.content)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const lang = String(question.voice).slice(0, 5);
  return `<speak version="1.0" xml:lang="${lang}"><voice xml:lang="${lang}" name="${question.voice}">${escaped}</voice></speak>`;
}

export async function synthesizeAzureSpeech(question, { key, region, fetchImpl = fetch }) {
  if (!key || !region) throw new Error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION.');
  const response = await fetchImpl(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AUDIO_FORMAT,
      'User-Agent': 'kai-kou-rs-question-bank'
    },
    body: buildSsml(question)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Azure TTS failed for ${question.id}: ${response.status} ${response.statusText} ${text}`.trim());
  }
  return Buffer.from(await response.arrayBuffer());
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readQuestions(seedPath) {
  const absolute = path.isAbsolute(seedPath) ? seedPath : path.join(ROOT, seedPath);
  return validateQuestions(JSON.parse(await fs.readFile(absolute, 'utf8')));
}

function createSupabaseClientFromEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function buildRSQuestionBank(options, deps = {}) {
  const questions = validateQuestions(options.questions || await readQuestions(options.seed || DEFAULT_SEED));
  const supabase = deps.supabase || (options.apply ? createSupabaseClientFromEnv() : null);
  const synthesize = deps.synthesize || ((question) => synthesizeAzureSpeech(question, {
    key: process.env.AZURE_SPEECH_KEY,
    region: process.env.AZURE_SPEECH_REGION
  }));
  const results = [];
  const rows = [];
  let synthesizedCharacters = 0, synthesisRequests = 0, cacheHits = 0;
  const cacheDir = options.cacheDir || path.join(ROOT, 'output/rs-audio');
  if (options.apply) await fs.mkdir(cacheDir, {recursive:true});
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const audioPath = buildStoragePath(question, options.prefix || DEFAULT_PREFIX);
    if (!options.apply) {
      rows.push(buildQuestionRow(question, audioPath, null));
      results.push({ id: question.id, mode: 'dry-run', audioPath });
      continue;
    }
    if (index > 0 && options.delayMs > 0) await sleep(options.delayMs);
    const cachePath = path.join(cacheDir, path.basename(audioPath));
    let audio;
    try { audio = await fs.readFile(cachePath); cacheHits++; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      audio = await synthesize(question);
      synthesisRequests++; synthesizedCharacters += question.content.length;
      await fs.writeFile(cachePath, audio);
    }
    const upload = await supabase.storage.from(options.bucket || DEFAULT_BUCKET).upload(audioPath, audio, {
      contentType: 'audio/mpeg',
      upsert: true
    });
    if (upload.error) throw new Error(`Upload failed for ${question.id}: ${upload.error.message}`);
    const { data } = supabase.storage.from(options.bucket || DEFAULT_BUCKET).getPublicUrl(audioPath);
    const row = buildQuestionRow(question, audioPath, data.publicUrl);
    rows.push(row);
    results.push({ id: question.id, mode: 'applied', audioPath, bytes: audio.length });
    console.log(`[${index + 1}/${questions.length}] ${question.id} uploaded ${audioPath}`);
  }
  if (options.apply) {
    const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
    if (error) throw new Error(`Question upsert failed: ${error.message}`);
  }
  return { mode: options.apply ? 'apply' : 'dry-run', count: questions.length, rows, results, synthesizedCharacters, synthesisRequests, cacheHits };
}

async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const result = await buildRSQuestionBank(args);
  await fs.mkdir(path.join(ROOT,'output/rs-audio'), {recursive:true});
  await fs.writeFile(path.join(ROOT,'output/rs-audio',`report-${result.mode}.json`), JSON.stringify(result,null,2));
  console.log(JSON.stringify({ mode: result.mode, count: result.count, synthesizedCharacters:result.synthesizedCharacters,synthesisRequests:result.synthesisRequests,cacheHits:result.cacheHits }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
