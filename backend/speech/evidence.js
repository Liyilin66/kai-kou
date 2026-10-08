import { SPEECH_RULES } from './config.js';

export function buildEvidence({ alignment, pauses = [], metrics = {} } = {}) {
  const evidence = [];
  const ops = alignment?.ops ?? [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === 'match' || ['homophone', 'low_confidence'].includes(op.tag)) continue;
    const type = op.tag === 'repetition' ? 'repetition' : op.type;
    if (!['omission', 'substitution', 'repetition', 'insertion'].includes(type)) continue;
    const anchor = op.ref_index ?? ops.slice(0, i).reverse().find(item => item.ref_index !== null)?.ref_index
      ?? ops.slice(i + 1).find(item => item.ref_index !== null)?.ref_index ?? null;
    evidence.push({ type, ref_span: anchor === null ? null : [anchor, anchor + 1], text: op.ref_text ?? op.hyp_text ?? '',
      time_ms: Number.isFinite(op.start_ms) && Number.isFinite(op.end_ms) ? [op.start_ms, op.end_ms] : null,
      detail: { expected: op.ref_text, observed: op.hyp_text,
        description: type === 'substitution' ? '可能读错或识别不清' : { omission: '未识别到原文词语', repetition: '识别到重复词语', insertion: '识别到额外词语' }[type] },
      severity: type === 'omission' ? 3 : 2 });
  }
  for (const pause of pauses) {
    if (!['hesitation', 'long_pause'].includes(pause.type)) continue;
    evidence.push({ type: pause.type, ref_span: pause.ref_span, text: pause.text,
      time_ms: [pause.start_ms, pause.end_ms], detail: { pause_ms: pause.duration_ms ?? pause.end_ms - pause.start_ms,
        at_punctuation: pause.at_punctuation }, severity: pause.type === 'long_pause' ? 3 : 2 });
  }
  if (Number.isFinite(metrics.speech_onset_ms) && metrics.speech_onset_ms >= SPEECH_RULES.lateStartMs) {
    evidence.push({ type: 'late_start', ref_span: null, text: '', time_ms: [0, metrics.speech_onset_ms],
      detail: { delay_ms: metrics.speech_onset_ms }, severity: 2 });
  }
  evidence.sort((a, b) => b.severity - a.severity
    || (a.ref_span?.[0] ?? -1) - (b.ref_span?.[0] ?? -1)
    || (a.time_ms?.[0] ?? 0) - (b.time_ms?.[0] ?? 0));
  return evidence.map((item, index) => ({ id: `E${index + 1}`, ...item }));
}
