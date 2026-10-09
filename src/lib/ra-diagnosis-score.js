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

export function hasNumericScore(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

// RA/RS reference scores and the DI/RTS/RL "-np" versions carry no pronunciation number;
// nothing may stand in for it (no proxy from overall, no zero).
export function isPronunciationNotAssessed(score) {
  const version = score?.score_version ?? score?.ai_review?.score_version;
  return hasSpeakingReferenceScore(score) || isPronunciationNotAssessedVersion(version);
}
