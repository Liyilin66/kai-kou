import { createClient } from '@supabase/supabase-js';
import { getAccessStatus } from '../../backend/auth/access-status.js';
import { analysisResponse, diagnoseRecording, normalizeDiagnosisTaskType, validateAnalysisInput } from '../../backend/speech/analyze-service.js';
import scoreHandler from '../score.js';
import { generatePublishedFeedback } from '../../backend/speech/feedback.js';

export function createAnalyzeHandler({ createDb, diagnose = diagnoseRecording, legacyHandler = scoreHandler, feedbackGenerator = generatePublishedFeedback } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const bearer = req.headers?.authorization || req.headers?.Authorization || '';
    const token = /^Bearer\s+(.+)$/i.exec(bearer)?.[1];
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    let db, row;
    try {
      db = createDb ? createDb() : getDb();
      if (!db) return res.status(503).json({ error: 'supabase_not_configured' });
      const { data: auth, error: authError } = await db.auth.getUser(token);
      if (authError || !auth?.user) return res.status(401).json({ error: 'unauthorized' });
      const user = auth.user, body = req.body || {};
      const invalid = validateAnalysisInput(body, user.id);
      if (invalid) return res.status(invalid[0]).json({ error: invalid[1] });
      const { data: profile, error: profileError } = await db.from('profiles').select('is_premium, trial_days, trial_granted_at, vip_plan, vip_expires_at').eq('id', user.id).maybeSingle();
      if (profileError) return res.status(500).json({ error: 'profile_load_failed' });
      if (!getAccessStatus(user, profile).canUseAiScoring) return res.status(403).json({ error: 'access_expired' });
      const lookup = () => db.from('speech_analyses').select('*').eq('user_id', user.id).eq('attempt_id', body.attempt_id).maybeSingle();
      const existing = await lookup();
      if (existing.error) throw new Error('analysis_read_failed');
      const requestedTaskType = normalizeDiagnosisTaskType(body.task_type);
      if (existing.data && normalizeDiagnosisTaskType(existing.data.task_type) !== requestedTaskType) return res.status(409).json({ error: 'analysis_task_type_mismatch' });
      if (body.action === 'feedback') {
        if (!existing.data) return res.status(404).json({ error: 'analysis_not_found' });
        row = existing.data;
        if (row.status !== 'done') return res.status(409).json({ error: 'analysis_not_ready' });
        if (row.feedback_status) return res.status(row.feedback_status === 'processing' ? 202 : 200).json(feedbackResponse(row));
        const claimed = await db.from('speech_analyses').update({ feedback_status: 'processing' })
          .eq('id', row.id).eq('user_id', user.id).is('feedback_status', null).select('id').maybeSingle();
        if (claimed.error) throw new Error('feedback_claim_failed');
        if (!claimed.data) {
          const concurrent = await lookup();
          if (concurrent.error || !concurrent.data) throw new Error('feedback_read_failed');
          return res.status(concurrent.data.feedback_status === 'processing' ? 202 : 200).json(feedbackResponse(concurrent.data));
        }
        let result;
        try {
          // Feedback only receives server-stored evidence; no client evidence or transcript.
          result = await feedbackGenerator({ evidence: row.evidence, metrics: row.metrics, referenceText: row.reference_text });
        } catch {
          const failed = await db.from('speech_analyses').update({ feedback_status: 'failed' })
            .eq('id', row.id).eq('user_id', user.id);
          if (failed.error) throw new Error('feedback_failure_save_failed');
          return res.status(200).json(feedbackResponse({ ...row, feedback_status: 'failed' }));
        }
        // Save advice and the matching history summary in one transaction.
        const saved = await db.rpc('complete_ra_feedback', { p_id: row.id, p_user_id: user.id, p_feedback: result.feedback, p_meta: result.meta });
        if (saved.error || !saved.data) throw new Error('feedback_save_failed');
        return res.status(200).json(feedbackResponse(saved.data));
      }
      if (body.action === 'legacy_score') {
        if (!existing.data) return res.status(404).json({ error: 'analysis_not_found' });
        row = existing.data;
        if (row.status !== 'done') return res.status(409).json({ error: 'analysis_not_ready' });
        if (row.legacy_score || row.legacy_status) return res.status(200).json({ legacy_status: row.legacy_status || 'done' });
        // Conditional claim protects against parallel shadow requests and duplicate charges.
        const claimed = await db.from('speech_analyses').update({ legacy_status: 'processing' }).eq('id', row.id).eq('user_id', user.id).is('legacy_status', null).select('id').maybeSingle();
        if (claimed.error) throw new Error('legacy_claim_failed');
        if (!claimed.data) return res.status(202).json({ legacy_status: 'processing' });
        let status = 200, payload;
        const capture = { setHeader() {}, status(code) { status = code; return this; }, json(value) { payload = value; return this; }, end() { return this; } };
        // Only browser recognition reproduces the old scoring input. Never replace
        // missing browser text with the new provider's more accurate transcript.
        if (typeof row.client_transcript === 'string' && row.client_transcript.trim()) {
          try { await legacyHandler({ method: 'POST', headers: { authorization: bearer }, body: { taskType: row.task_type || 'RA', transcript: row.client_transcript, questionContent: row.reference_text } }, capture); } catch { status = 500; /* Shadow failure must not alter diagnosis. */ }
        }
        const successful = status === 200 && payload && !payload.error && Number.isFinite(payload.overall) && payload.provider_used && payload.provider_used !== 'none';
        const saved = await db.from('speech_analyses').update({ legacy_score: successful ? payload : null, legacy_status: successful ? 'done' : 'failed' }).eq('id', row.id).eq('user_id', user.id);
        if (saved.error) throw new Error('legacy_save_failed');
        return res.status(200).json({ legacy_status: successful ? 'done' : 'failed' });
      }
      if (body.action) return res.status(400).json({ error: 'invalid_action' });
      const taskType = normalizeDiagnosisTaskType(body.task_type);
      if (existing.data) {
        if (normalizeDiagnosisTaskType(existing.data.task_type) !== taskType) return res.status(409).json({ error: 'analysis_task_type_mismatch' });
        return res.status(existing.data.status === 'processing' ? 202 : 200).json(analysisResponse(existing.data));
      }
      const { data: question, error: questionError } = await db.from('questions').select('id, content, task_type').eq('id', body.question_id).eq('task_type', taskType).eq('is_active', true).maybeSingle();
      if (questionError) throw new Error('question_read_failed');
      if (!question?.content) return res.status(404).json({ error: 'question_not_found' });
      const claim = await db.from('speech_analyses').insert({ user_id: user.id, attempt_id: body.attempt_id, task_type: taskType,
        question_id: String(question.id), reference_text: question.content, audio_path: body.audio_path,
        status: 'processing', client_silences: body.silences, client_transcript: body.client_transcript ?? '' }).select('*').single();
      if (claim.error?.code === '23505') {
        const concurrent = await lookup();
        if (concurrent.error || !concurrent.data) throw new Error('analysis_read_failed');
        return res.status(concurrent.data.status === 'processing' ? 202 : 200).json(analysisResponse(concurrent.data));
      }
      if (claim.error || !claim.data) throw new Error('analysis_claim_failed');
      row = claim.data;
      let diagnosis;
      try { diagnosis = await diagnose({ db, row, body }); }
      catch (error) {
        const code = error.code === 'audio_download_failed' || error.code === 'invalid_audio_size' ? error.code : 'transcription_failed';
        const failed = await db.from('speech_analyses').update({ status: 'failed', error_code: code }).eq('id', row.id);
        if (failed.error) throw new Error('analysis_failure_save_failed');
        return res.status(502).json({ error: code, analysis_id: row.id, status: 'failed' });
      }
      const completion = await db.rpc('complete_ra_analysis', { p_id: row.id, p_result: diagnosis });
      if (completion.error || !completion.data) throw new Error('analysis_save_failed');
      return res.status(200).json(analysisResponse(completion.data));
    } catch {
      // A persistence failure is not a transcription failure: keep the processing claim
      // so retries cannot charge again. Operators can inspect/reconcile the stored row.
      return res.status(500).json({ error: 'analysis_service_failed', ...(row ? { analysis_id: row.id } : {}) });
    }
  };
}
function feedbackResponse(row) {
  return { analysis_id: row.id, feedback_status: row.feedback_status, feedback: row.feedback ?? null, feedback_meta: row.feedback_meta ?? null };
}
function getDb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
export default createAnalyzeHandler();
