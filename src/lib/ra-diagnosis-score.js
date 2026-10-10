import { isPronunciationNotAssessedVersion } from '../../backend/scoring/pronunciation-not-assessed.js';

// Same wording as the RA/RS diagnosis cards.
export const PRONUNCIATION_NOT_ASSESSED_LABEL = '本版本未评估';
export const PRONUNCIATION_NOT_ASSESSED_REASON = '现有技术无法可靠测量发音，测不出来的项不给分。';

// Unversioned diagnosis observations remain unscored; only versioned reference scores are numeric.
export function hasRAReferenceScore(score) {
  return score?.score_version === 'ra-score-0.1' && hasNumericScore(score?.scores?.overall);
}

export function hasSpeakingReferenceScore(score) {
  return hasRAReferenceScore(score) || (score?.score_version === 'rs-score-0.1' && hasNumericScore(score?.scores?.overall));
}

export function isRADiagnosis(score) {
  return Boolean(score && (score.analysis_id || score.diagnosis_version) && !hasSpeakingReferenceScore(score));
}

export function diagnosisLabel(score) {
  if (!isRADiagnosis(score)) return '';
  const value = score?.metrics?.completeness;
  const percent = value === null || value === undefined || value === '' ? null : Number(value);
  return Number.isFinite(percent)
    ? `诊断：完整度 ${Math.round(Math.max(0, Math.min(1, percent)) * 100)}%`
    : '诊断：完整度待确认';
}

// docs/ra-scoring-rules.md (ra-score-0.1): content and fluency weigh half each and pronunciation is not
// assessed. Unversioned legacy RA/RS rows stored an overall that included a pronunciation number, so their
// display overall is rebuilt from content and fluency alone. Versioned reference scores and diagnosis rows
// are left as stored (null here).
export function legacySpeakingDisplayOverall(score) {
  if (!score || typeof score !== 'object' || hasSpeakingReferenceScore(score) || isRADiagnosis(score)) return null;
  const scores = score.scores && typeof score.scores === 'object' ? score.scores : score;
  if (!hasNumericScore(scores.content) || !hasNumericScore(scores.fluency)) return null;
  return Math.round((Number(scores.content) + Number(scores.fluency)) / 2);
}

export function hasNumericScore(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

// RA/RS reference scores and the DI/RTS/RL "-np" versions carry no pronunciation number;
// nothing may stand in for it (no proxy from overall, no zero).
export function isPronunciationNotAssessed(score) {
  const version = score?.score_version ?? score?.ai_review?.score_version;
  return hasSpeakingReferenceScore(score) || isPronunciationNotAssessedVersion(version);
}
