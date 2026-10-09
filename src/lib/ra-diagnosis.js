import { buildTemplateFeedback } from "../../backend/speech/feedback-rules.js";
import { normalizeTokens } from "../../backend/speech/align.js";

// One submission object belongs to one finalized recording. Retrying analysis
// reuses both the upload and attempt ID; recording again creates a new object.
export function createRADiagnosisSubmission({ client, fetchImpl = fetch, createId = () => crypto.randomUUID() }) {
  let attemptId = createId();
  let audioPath = '';
  return async function submit({ blob, questionId, speechDiagnosis, clientTranscript = '' }) {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session.user?.id) throw new Error('请先登录，再提交诊断。');
    if (!speechDiagnosis || !(speechDiagnosis.duration_ms > 0)) throw new Error('录音无法解码，请重新录音。');
    if (!audioPath) {
      const mime = (blob?.type || '').split(';')[0];
      const ext = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/webm': 'webm' }[mime] || 'webm';
      const path = `ra/${session.user.id}/${attemptId}.${ext}`;
      const uploaded = await client.storage.from('practice-audio').upload(path, blob, { contentType: mime || 'application/octet-stream', upsert: false });
      if (uploaded.error) throw new Error('录音上传失败，请重新录音后提交。');
      audioPath = path;
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let response;
    try {
      response = await fetchImpl('/api/ra/analyze', {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ attempt_id: attemptId, question_id: questionId, audio_path: audioPath, client_transcript: clientTranscript,
          silences: speechDiagnosis.silences, speech_onset_ms: speechDiagnosis.speech_onset_ms,
          speech_offset_ms: speechDiagnosis.speech_offset_ms, duration_ms: speechDiagnosis.duration_ms })
      });
    } finally { clearTimeout(timeout); }
    const result = await response.json();
    if (result.status === 'unusable_audio') {
      audioPath = ''; attemptId = createId();
      const error = new Error('没有检测到朗读声音，请检查麦克风后重录');
      error.code = 'unusable_audio';
      throw error;
    }
    if (!response.ok || result.status !== 'done') throw new Error(result.message || result.error?.message || result.error || '录音诊断失败，请稍后重试。');
    // Server reads the saved transcript and reference, and writes the shadow
    // score itself. No client-provided score is trusted or shown to the learner.
    if (!result.metrics?.score) void fetchImpl('/api/ra/analyze', { method: 'POST', headers, keepalive: true,
      body: JSON.stringify({ action: 'legacy_score', attempt_id: attemptId }) }).catch(() => {});
    return { ...result, diagnosis_version: result.rules_version, kind: 'ra_diagnosis' };
  };
}

export function evidencePlaybackSeconds(evidence, alignment) {
  if (Number.isFinite(evidence?.time_ms?.[0])) {
    const lead = ['long_pause', 'hesitation', 'late_start'].includes(evidence.type) ? 1000 : 0;
    return Math.max(0, evidence.time_ms[0] - lead) / 1000;
  }
  const index = evidence?.ref_span?.[0];
  if (!Number.isInteger(index)) return null;
  const ops = alignment?.ops || [];
  const next = ops.find(op => op.ref_index >= index && Number.isFinite(op.start_ms));
  const previous = [...ops].reverse().find(op => op.ref_index < index && Number.isFinite(op.end_ms));
  const anchor = next?.start_ms ?? previous?.end_ms;
  return Number.isFinite(anchor) ? Math.max(0, anchor - 1000) / 1000 : null;
}

export function diagnosisWordItems(alignment, evidence = [], referenceText = '') {
  let displayWords = (alignment?.reference || []).map((word, index) => ({ text: word.text, indices: [index] }));
  if (referenceText) {
    // Prefix normalization preserves original punctuation and contractions in
    // the UI while mapping each displayed word back to canonical alignment.
    let previous = [];
    displayWords = Array.from(referenceText.matchAll(/\S+/g), match => {
      const prefix = normalizeTokens(referenceText.slice(0, match.index + match[0].length));
      let first = 0;
      while (first < previous.length && first < prefix.length && previous[first].norm === prefix[first].norm) first++;
      const indices = Array.from({ length: Math.max(0, prefix.length - first) }, (_, offset) => first + offset);
      previous = prefix;
      return { text: match[0], indices };
    });
  }
  return displayWords.map((word, index) => {
    const ops = (alignment?.ops || []).filter(item => word.indices.includes(item.ref_index));
    const uncertain = ops.some(op => ['homophone', 'low_confidence'].includes(op.tag));
    const annotations = evidence.filter(item => item.ref_span && word.indices.some(i => i >= item.ref_span[0] && i < item.ref_span[1]));
    return { text: word.text, index, uncertain, annotations,
      type: uncertain ? 'uncertain' : annotations[0]?.type || 'match' };
  });
}

// Feedback follows analysis independently; failure still leaves useful evidence
// guidance on screen, and leaving the result page cancels all pending work.
export async function loadRADiagnosisFeedback({ client, result, fetchImpl = fetch, signal, wait = feedbackDelay }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 30000);
  try {
    controller.signal.throwIfAborted();
    if (!result.attempt_id) throw new Error('missing saved attempt');
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('session unavailable');
    for (let attempt = 0; attempt < 5; attempt++) {
      controller.signal.throwIfAborted();
      const response = await fetchImpl('/api/ra/analyze', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: 'feedback', attempt_id: result.attempt_id })
      });
      const body = await response.json();
      if (response.ok && body.feedback_status === 'done' && typeof body.feedback?.summary === 'string' && Array.isArray(body.feedback?.suggestions)) return body;
      if (response.status !== 202 || body.feedback_status !== 'processing') throw new Error('feedback unavailable');
      if (attempt < 4) await wait(1500, controller.signal);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
  return { feedback: buildTemplateFeedback({ evidence: result.evidence || [], metrics: result.metrics || {}, referenceText: result.question?.content || '' }),
    feedback_meta: { provider: 'template', model: 'template', prompt_version: 'ra-feedback-0.2' }, feedback_status: 'done' };
}

function feedbackDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
