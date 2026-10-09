// Unversioned diagnosis observations remain unscored; only versioned reference scores are numeric.
export function hasRAReferenceScore(score) {
  return score?.score_version === 'ra-score-0.1' && hasNumericScore(score?.scores?.overall);
}

export function isRADiagnosis(score) {
  return Boolean(score && (score.analysis_id || score.diagnosis_version) && !hasRAReferenceScore(score));
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
