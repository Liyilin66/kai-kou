import { alignWords } from './align.js';
import { extractFeatures } from './features.js';
import { buildEvidence } from './evidence.js';
import { RULES_VERSION } from './config.js';
import { transcribeWithGroqWhisper } from './providers/groq-whisper.js';

export const AUDIO_BUCKET = 'practice-audio';
export function validateAnalysisInput(body, userId) {
  if (typeof body.attempt_id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.attempt_id)) return [400, 'invalid_attempt_id'];
  if (body.action === 'legacy_score') return null;
  if (typeof body.audio_path !== 'string' || !body.audio_path.startsWith(`ra/${userId}/`) || body.audio_path.length > 500
    || body.audio_path.includes('..') || /[\\%?#\u0000-\u001f]/.test(body.audio_path)) return [403, 'invalid_audio_path'];
  if (!['string', 'number'].includes(typeof body.question_id) || !String(body.question_id).trim() || String(body.question_id).length > 100) return [400, 'invalid_question_id'];
  if (!Number.isFinite(body.duration_ms) || body.duration_ms <= 0 || body.duration_ms > 120000) return [400, 'invalid_duration'];
  const onset = body.speech_onset_ms, offset = body.speech_offset_ms;
  if (!((onset === null && offset === null) || (Number.isFinite(onset) && Number.isFinite(offset) && onset >= 0 && offset >= onset && offset <= body.duration_ms))) return [400, 'invalid_speech_bounds'];
  if (!Array.isArray(body.silences) || body.silences.length > 500) return [400, 'invalid_silences'];
  let lastEnd = 0;
  for (const interval of body.silences) {
    if (!Number.isFinite(interval?.start_ms) || !Number.isFinite(interval?.end_ms) || interval.start_ms < lastEnd || interval.end_ms <= interval.start_ms || interval.end_ms > body.duration_ms) return [400, 'invalid_silences'];
    lastEnd = interval.end_ms;
  }
  return null;
}

export function analysisResponse(row) {
  return { analysis_id: row.id, attempt_id: row.attempt_id, status: row.status, alignment: row.aligned,
    metrics: row.metrics, evidence: row.evidence, provider: row.provider, model: row.model,
    rules_version: row.rules_version, diagnosis_version: row.rules_version, timings_ms: row.timings_ms,
    question: { id: row.question_id, content: row.reference_text },
    audio: { bucket: AUDIO_BUCKET, path: row.audio_path }, transcript: row.transcript, error_code: row.error_code };
}

export async function diagnoseRecording({ db, row, body, transcribe = transcribeWithGroqWhisper }) {
  const timings = {}, started = performance.now();
  if (body.speech_onset_ms === null && body.speech_offset_ms === null) {
    const alignment = alignWords(row.reference_text, []);
    const features = extractFeatures({ alignment, referenceText: row.reference_text, duration_ms: body.duration_ms });
    return { status: 'unusable_audio', transcript: '', provider: 'none', model: null, rules_version: RULES_VERSION,
      aligned: alignment, metrics: features.metrics, evidence: [], timings_ms: { total: 0 }, error_code: 'no_speech_detected' };
  }
  let step = performance.now();
  const { data: audio, error } = await db.storage.from(AUDIO_BUCKET).download(row.audio_path);
  if (error || !audio) throw Object.assign(new Error('audio_download_failed'), { code: 'audio_download_failed' });
  if (!audio.size || audio.size > 20 * 1024 * 1024) throw Object.assign(new Error('invalid_audio_size'), { code: 'invalid_audio_size' });
  timings.download = Math.round(performance.now() - step);
  step = performance.now();
  const recognized = await transcribe({ audio, filename: row.audio_path.split('/').pop(), mimeType: audio.type || 'audio/webm' });
  timings.transcribe = Math.round(performance.now() - step);
  step = performance.now();
  const alignment = alignWords(row.reference_text, recognized.words);
  timings.align = Math.round(performance.now() - step);
  step = performance.now();
  const features = extractFeatures({ alignment, referenceText: row.reference_text, silences: body.silences,
    speech_onset_ms: body.speech_onset_ms, speech_offset_ms: body.speech_offset_ms, duration_ms: body.duration_ms });
  const evidence = buildEvidence({ alignment, ...features });
  timings.features_evidence = Math.round(performance.now() - step);
  timings.total = Math.round(performance.now() - started);
  return { status: recognized.words.length ? 'done' : 'unusable_audio', transcript: recognized.text,
    provider: recognized.provider, model: recognized.model, rules_version: RULES_VERSION,
    aligned: alignment, metrics: features.metrics, evidence, timings_ms: timings,
    error_code: recognized.words.length ? null : 'no_speech_detected' };
}
