import { SPEECH_RULES } from './config.js';

function percentile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function detectSilences(samples, sampleRate, options = {}) {
  if (!samples || typeof samples.length !== 'number') throw new TypeError('samples must be PCM samples');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive');
  const settings = { ...SPEECH_RULES, ...options };
  if (!(settings.frameMs > 0) || !(settings.minSilenceMs > 0)) throw new RangeError('frame and silence lengths must be positive');
  const duration_ms = samples.length / sampleRate * 1000;
  const frameSize = Math.max(1, Math.round(sampleRate * settings.frameMs / 1000));
  const frames = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let energy = 0;
    for (let i = start; i < end; i++) {
      if (!Number.isFinite(samples[i])) throw new TypeError('PCM samples must be finite');
      energy += samples[i] ** 2;
    }
    frames.push({ start_ms: start / sampleRate * 1000, end_ms: end / sampleRate * 1000,
      db: Math.max(settings.minimumDb, 10 * Math.log10(energy / (end - start))) });
  }
  const sorted = frames.map(frame => frame.db).sort((a, b) => a - b);
  const noise_floor_db = sorted.length ? percentile(sorted, settings.noisePercentile) : settings.minimumDb;
  const speech_level_db = sorted.length ? percentile(sorted, settings.speechPercentile) : settings.minimumDb;
  const base = { silences: [], speech_onset_ms: null, speech_offset_ms: null, noise_floor_db, speech_level_db, duration_ms };
  if (!frames.length || speech_level_db <= settings.minimumDb) return base;
  const threshold = noise_floor_db + settings.thresholdFraction * (speech_level_db - noise_floor_db);
  // Flat nonzero energy cannot identify silence; avoid labelling an entire sustained
  // vowel (or stationary background noise) as a pause from percentile ties.
  const flat = speech_level_db - noise_floor_db < settings.minimumDynamicRangeDb;
  const quiet = frame => flat ? frame.db <= settings.minimumDb : frame.db < threshold;
  const first = frames.findIndex(frame => !quiet(frame));
  if (first < 0) return base;
  let last = frames.length - 1;
  while (quiet(frames[last])) last--;
  base.speech_onset_ms = frames[first].start_ms;
  base.speech_offset_ms = frames[last].end_ms;
  for (let i = first + 1; i < last;) {
    if (!quiet(frames[i])) { i++; continue; }
    const start_ms = frames[i].start_ms;
    while (i <= last && quiet(frames[i])) i++;
    const end_ms = frames[i - 1].end_ms;
    if (end_ms - start_ms >= settings.minSilenceMs) base.silences.push({ start_ms, end_ms });
  }
  return base;
}
