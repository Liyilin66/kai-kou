import { createProviderError, toProviderError } from '../../llm/provider-error.js';

export const GROQ_WHISPER_MODEL = 'whisper-large-v3';
const PROVIDER = 'groq_whisper';

// Reference text is deliberately not inferred here. The caller may opt into a
// separately evaluated recognition prompt, but ordinary RA evaluation omits it.
export async function transcribeWithGroqWhisper({ audio, filename = 'recording.webm', mimeType = 'audio/webm', prompt } = {}) {
  const model = GROQ_WHISPER_MODEL;
  const timeoutValue = Number(process.env.SPEECH_GROQ_TIMEOUT_MS);
  const timeout_ms = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 15_000;
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw createProviderError(PROVIDER, { model, message: 'GROQ_API_KEY is not configured', raw_error_type: 'groq_whisper_missing_config' });
  if (!Buffer.isBuffer(audio) && !(audio instanceof Blob)) throw new TypeError('audio must be a Buffer or Blob');
  if (!(audio.size ?? audio.length)) throw new TypeError('audio must not be empty');
  const form = new FormData();
  form.append('file', audio instanceof Blob ? audio : new Blob([audio], { type: mimeType }), filename);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('temperature', '0');
  form.append('language', 'en');
  if (prompt !== undefined && prompt !== '') {
    if (typeof prompt !== 'string') throw new TypeError('prompt must be a string');
    form.append('prompt', prompt);
  }
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), timeout_ms);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal
    });
    if (!response.ok) throw createProviderError(PROVIDER, { model, status: response.status, timeout_ms,
      message: `Groq transcription failed (HTTP ${response.status})` });
    const result = await response.json();
    if (typeof result.text !== 'string' || !Array.isArray(result.words)) throw new Error('Groq returned invalid transcription data');
    const words = result.words.map((word) => {
      if (typeof word.word !== 'string' || !Number.isFinite(word.start) || !Number.isFinite(word.end)
          || word.start < 0 || word.end < word.start) throw new Error('Groq returned invalid word timestamps');
      return { text: word.word, start_ms: Math.round(word.start * 1000), end_ms: Math.round(word.end * 1000), confidence: null };
    });
    const duration_ms = Number.isFinite(result.duration) && result.duration >= 0
      ? Math.round(result.duration * 1000) : Math.max(0, ...words.map((word) => word.end_ms));
    return { words, text: result.text, duration_ms, provider: 'groq', model, latency_ms: Math.round(performance.now() - started) };
  } catch (error) {
    const converted = toProviderError(PROVIDER, error);
    converted.model = model;
    converted.timeout_ms = timeout_ms;
    throw converted;
  } finally {
    clearTimeout(timer);
  }
}
