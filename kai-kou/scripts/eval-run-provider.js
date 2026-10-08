import { readFile, writeFile, mkdir, rename, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, basename, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transcribeWithGroqWhisper, GROQ_WHISPER_MODEL } from '../backend/speech/providers/groq-whisper.js';
import { detectSilences } from '../backend/speech/silence.js';
import { RULES_VERSION } from '../backend/speech/config.js';

const execute = promisify(execFile);
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const TYPES = { '.webm': 'audio/webm', '.wav': 'audio/wav', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.aac': 'audio/aac' };

export async function requireFFmpeg() {
  try { await execute('ffmpeg', ['-version'], { timeout: 5000 }); }
  catch { throw new Error('ffmpeg is unavailable. Install the local development tool with: brew install ffmpeg'); }
}

export async function decodeWithFFmpeg(audioPath) {
  const directory = await mkdtemp(join(tmpdir(), 'ra-pcm-'));
  const output = join(directory, 'audio.f32le');
  try {
    await execute('ffmpeg', ['-nostdin', '-v', 'error', '-i', audioPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', output],
      { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const data = await readFile(output);
    if (!data.length || data.length % 4) throw new Error('Decoded PCM is empty or malformed');
    const samples = new Float32Array(data.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = data.readFloatLE(i * 4);
    return { samples, sampleRate: 16000 };
  } catch {
    throw new Error(`Cannot decode ${basename(audioPath)} into 16 kHz mono PCM`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function writeJSONAtomic(filename, data) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
    await rename(temp, filename);
  } finally { await rm(temp, { force: true }); }
}

function validateTranscription(result) {
  if (!result || result.provider !== 'groq' || result.model !== GROQ_WHISPER_MODEL
      || typeof result.text !== 'string' || !Array.isArray(result.words)
      || !Number.isFinite(result.duration_ms) || result.duration_ms < 0
      || !Number.isFinite(result.latency_ms) || result.latency_ms < 0) throw new Error('Invalid Groq transcription/cache format');
  for (const word of result.words) {
    if (typeof word.text !== 'string' || !Number.isFinite(word.start_ms) || !Number.isFinite(word.end_ms)
        || word.start_ms < 0 || word.end_ms < word.start_ms || word.confidence !== null) throw new Error('Invalid Groq word/cache format');
  }
}

export async function runProvider({ manifestPath = join(APP_ROOT, 'eval/speech/manifest.json'), ids,
  transcribe = transcribeWithGroqWhisper, decodeAudio = decodeWithFFmpeg, log = console.log } = {}) {
  manifestPath = resolve(manifestPath);
  const original = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  const samples = Array.isArray(manifest) ? manifest : manifest.samples;
  if (!Array.isArray(samples)) throw new Error('manifest.samples must be an array');
  const seen = new Set();
  for (const sample of samples) {
    if (!sample || !SAFE_ID.test(sample.id) || seen.has(sample.id)) throw new Error('Manifest contains an unsafe or duplicate sample id');
    seen.add(sample.id);
    const file = sample.audio?.local_file;
    if (file && (typeof file !== 'string' || basename(file) !== file || file.includes('\\') || !TYPES[extname(file).toLowerCase()])) {
      throw new Error(`${sample.id}: audio.local_file must be a supported filename, not a path`);
    }
  }
  if (ids?.some((id) => !seen.has(id))) throw new Error('Requested sample id does not exist');
  const selected = samples.filter((sample) => sample.audio?.local_file && (!ids || ids.includes(sample.id)));
  if (!selected.length) throw new Error('No selected samples have local audio');
  const root = dirname(manifestPath);
  const cacheDirectory = join(root, 'cache');
  await mkdir(cacheDirectory, { recursive: true });
  const timings = [];
  let expectedManifest = original;
  for (const sample of selected) {
    try {
      if (sample.consent !== true) throw new Error('Recording consent is required');
      const audioPath = join(root, 'audio', sample.audio.local_file);
      const audio = await readFile(audioPath);
      const audio_sha256 = createHash('sha256').update(audio).digest('hex');
      // Decode first: an unsupported/broken recording should not incur API cost.
      const { samples: pcm, sampleRate } = await decodeAudio(audioPath);
      const silence = detectSilences(pcm, sampleRate);
      const cachePath = join(cacheDirectory, `${sample.id}.groq_whisper.json`);
      let cached;
      try { cached = JSON.parse(await readFile(cachePath, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read transcription cache; repair or remove it before retrying'); }
      let result;
      const hit = cached?.sample_id === sample.id && cached?.audio_sha256 === audio_sha256
        && cached?.model === GROQ_WHISPER_MODEL && cached?.cache_version === 1;
      if (hit) {
        validateTranscription(cached.result);
        result = cached.result;
      } else {
        result = await transcribe({ audio, filename: sample.audio.local_file, mimeType: TYPES[extname(sample.audio.local_file).toLowerCase()] });
        validateTranscription(result);
        await writeJSONAtomic(cachePath, { cache_version: 1, sample_id: sample.id, audio_sha256,
          model: GROQ_WHISPER_MODEL, recorded_at: new Date().toISOString(), result });
      }
      sample.hypotheses ??= {};
      sample.hypotheses.groq_whisper = { text: result.text, words: result.words, silences: silence.silences,
        speech_onset_ms: silence.speech_onset_ms, speech_offset_ms: silence.speech_offset_ms,
        duration_ms: Math.round(pcm.length / sampleRate * 1000),
        model: result.model, rules_version: RULES_VERSION };
      // Preserve each successful sample; never silently overwrite a concurrent edit.
      const current = await readFile(manifestPath, 'utf8');
      if (current !== expectedManifest) {
        throw new Error('Manifest changed during processing; retry after resolving concurrent edits');
      }
      await writeJSONAtomic(manifestPath, manifest);
      expectedManifest = JSON.stringify(manifest, null, 2) + '\n';
      timings.push({ id: sample.id, latency_ms: result.latency_ms, cached: hit });
      log(`${sample.id}: ${hit ? 'cache' : 'Groq'} ${result.latency_ms}ms; ${silence.silences.length} internal silences`);
    } catch (error) { throw new Error(`${sample.id}: ${error.message}`, { cause: error }); }
  }
  const average_latency_ms = timings.reduce((sum, row) => sum + row.latency_ms, 0) / timings.length;
  const max_latency_ms = Math.max(...timings.map((row) => row.latency_ms));
  log(`Groq latency (${timings.length} samples, original call timings including cache): mean ${average_latency_ms.toFixed(1)}ms, max ${max_latency_ms}ms`);
  return { timings, average_latency_ms, max_latency_ms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: join(APP_ROOT, '.env.local'), quiet: true });
    await requireFFmpeg();
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--manifest' && args[i + 1]) options.manifestPath = args[++i];
      else if (args[i] === '--id' && args[i + 1]) (options.ids ??= []).push(args[++i]);
      else throw new Error('Usage: node scripts/eval-run-provider.js [--manifest path] [--id sample-id]');
    }
    await runProvider(options);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
