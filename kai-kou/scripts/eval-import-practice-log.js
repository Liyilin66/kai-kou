import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
export function parseArgs(argv) {
  const options = { speaker: '', device: 'unknown', split: 'dev', consent: false };
  const flags = new Set(['log-id', 'latest', 'user-id', 'script', 'speaker', 'device', 'split']);
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--consent') { options.consent = true; continue; }
    const name = flag.slice(2);
    if (!flag.startsWith('--') || !flags.has(name) || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Invalid argument: ${flag}`);
    options[name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = argv[++index];
  }
  if (Boolean(options.logId) === Boolean(options.latest)) throw new Error('Choose --log-id or --latest');
  if (!['dev', 'test'].includes(options.split)) throw new Error('--split must be dev or test');
  if (options.latest && (!/^\d+$/.test(options.latest) || Number(options.latest) < 1 || Number(options.latest) > 100 || !options.userId)) throw new Error('--latest requires 1–100 and --user-id');
  if (!options.userId && !options.consent) throw new Error('Specify your own --user-id or provide --consent for a consenting user');
  return options;
}

export async function importPracticeLogs(client, options, directory = path.join(appRoot, 'eval/speech')) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest)) throw new Error('manifest.json must contain an array');
  const scripts = JSON.parse(await fs.readFile(path.join(directory, 'scripts.json'), 'utf8'));
  const script = options.script ? scripts.find(item => item.id === options.script) : null;
  if (options.script && !script) throw new Error(`Unknown script: ${options.script}`);
  let query = client.from('practice_logs').select('id,user_id,task_type,question_id,transcript,score_json,created_at');
  if (options.logId) query = query.eq('id', options.logId);
  else query = query.eq('user_id', options.userId).eq('task_type', 'RA').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Number(options.latest));
  const { data: logs, error } = await query;
  if (error) throw new Error('practice_logs read failed');
  if (!logs?.length) throw new Error('No matching practice log');
  // Check every record before downloading private audio or writing local data.
  for (const log of logs) {
    if (!options.consent && log.user_id !== options.userId) throw new Error('Consent required: record does not belong to --user-id');
    if (log.task_type !== 'RA') throw new Error(`Practice log ${log.id}: only RA is supported`);
    if (script && script.question_id !== log.question_id) throw new Error(`Practice log ${log.id}: script question does not match`);
  }
  const imported = [];
  for (const log of logs) {
    const previousIndex = manifest.findIndex(item => String(item.hypotheses?.browser_asr?.practice_log_id) === String(log.id));
    const previous = previousIndex >= 0 ? manifest[previousIndex] : null;
    const speaker = options.speaker || previous?.speaker_id || `spk-${createHash('sha256').update(log.user_id).digest('hex').slice(0, 12)}`;
    if (manifest.some((item, index) => index !== previousIndex && item.speaker_id === speaker && item.split !== options.split)) throw new Error(`Speaker ${speaker} already belongs to another split`);
    let reference = log.score_json?.questionSnapshot?.content;
    if (!reference) {
      const { data: question, error: questionError } = await client.from('questions').select('content').eq('id', log.question_id).maybeSingle();
      if (questionError || !question?.content) throw new Error(`Practice log ${log.id}: reference text unavailable`);
      reference = question.content;
    }
    if (typeof reference !== 'string' || typeof log.transcript !== 'string') throw new Error(`Practice log ${log.id}: invalid reference or transcript`);
    const audio = log.score_json?.audio;
    if (!audio?.path || (audio.bucket && audio.bucket !== 'practice-audio') || !audio.path.startsWith(`ra/${log.user_id}/`) || audio.path.split('/').includes('..')) throw new Error(`Practice log ${log.id}: valid private RA audio path required`);
    let id = previous?.id;
    if (!id) {
      let number = 1;
      while (manifest.some(item => item.id === `ra-real-${String(number).padStart(4, '0')}`)) number++;
      id = `ra-real-${String(number).padStart(4, '0')}`;
    }
    const extension = path.extname(audio.path).toLowerCase();
    if (!['.webm', '.wav', '.mp4', '.m4a', '.mp3', '.ogg', '.aac'].includes(extension)) throw new Error(`Practice log ${log.id}: unsupported audio extension`);
    const localFile = `${id}${extension}`;
    const { data: blob, error: audioError } = await client.storage.from('practice-audio').download(audio.path);
    if (audioError || !blob || blob.size === 0) throw new Error(`Practice log ${log.id}: audio download failed`);
    await fs.mkdir(path.join(directory, 'audio'), { recursive: true });
    await fs.writeFile(path.join(directory, 'audio', localFile), Buffer.from(await blob.arrayBuffer()));
    const sample = {
      id, task_type: 'RA', question_id: log.question_id, reference_text: reference,
      source: script ? 'constructed' : (previous?.source || 'real'), script_id: script?.id || previous?.script_id || null,
      speaker_id: speaker, device: options.device, split: options.split, consent: true,
      audio: { local_file: localFile, storage_path: audio.path },
      hypotheses: { ...previous?.hypotheses, browser_asr: { text: log.transcript, practice_log_id: String(log.id) } },
      old_scores: { ...(log.score_json?.scores || {}), ...(log.score_json?.overall != null ? { overall: log.score_json.overall } : {}) },
      labels: script ? { status: 'labeled', errors: structuredClone(script.errors), labeled_by: 'recording-script', notes: `Planned errors from ${script.id}; verify that recording followed instructions.` }
        : previous?.labels || { status: 'unlabeled', errors: [], labeled_by: '', notes: '' }
    };
    if (previousIndex >= 0) manifest[previousIndex] = sample; else manifest.push(sample);
    imported.push({ id, practice_log_id: String(log.id), question_id: log.question_id, labels_status: sample.labels.status });
  }
  const tempPath = `${manifestPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(tempPath, manifestPath);
  return imported;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing server Supabase configuration');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const imported = await importPracticeLogs(client, options);
  console.log(JSON.stringify({ imported }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Import failed: ${error.message}`); process.exitCode = 1; });
}
