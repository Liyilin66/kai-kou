const UNCERTAIN_TAGS = new Set(['homophone', 'low_confidence']);
const IGNORED_TYPES = new Set(['homophone', 'low_confidence']);
const AUDIO_BUCKET = 'practice-audio';
const ANALYSIS_SELECT = [
  'id',
  'attempt_id',
  'status',
  'question_id',
  'reference_text',
  'audio_path',
  'transcript',
  'aligned',
  'metrics',
  'evidence',
  'provider',
  'model',
  'rules_version',
  'timings_ms',
  'error_code',
  'created_at'
].join(',');

const METRIC_SPECS = [
  { key: 'completeness', label: '完整度', better: 'higher', format: formatPercent },
  { key: 'hesitation_count', label: '犹豫', better: 'lower', format: formatCount },
  { key: 'long_pause_count', label: '长停顿', better: 'lower', format: formatCount },
  { key: 'wpm', label: '语速', better: 'neutral', format: formatWpm }
];

export function compareDiagnoses(previous, current) {
  if (!previous || !current) return null;
  const previousItems = comparableEvidence(previous);
  const currentItems = comparableEvidence(current);
  const previousByKey = new Map(previousItems.map(item => [item.key, item]));
  const currentByKey = new Map(currentItems.map(item => [item.key, item]));

  const improved = previousItems.filter(item => !currentByKey.has(item.key));
  const ongoing = previousItems
    .filter(item => currentByKey.has(item.key))
    .map(item => ({ ...currentByKey.get(item.key), previousEvidence: item.evidence }));
  const newIssues = currentItems.filter(item => !previousByKey.has(item.key));
  const metricChanges = compareMetrics(previous.metrics, current.metrics);

  return {
    previous_id: previous.analysis_id || previous.id || '',
    current_id: current.analysis_id || current.id || '',
    metricChanges,
    improved,
    ongoing,
    newIssues,
    hasIssues: Boolean(improved.length || ongoing.length || newIssues.length)
  };
}

export async function loadPreviousRADiagnosis({ client, result }) {
  const attemptId = `${result?.attempt_id || ''}`.trim();
  if (!client || !attemptId) return null;

  const { data: current, error: currentError } = await client
    .from('speech_analyses')
    .select('id, attempt_id, question_id, created_at')
    .eq('attempt_id', attemptId)
    .eq('status', 'done')
    .maybeSingle();

  if (currentError || !current?.created_at || !current?.question_id) return null;

  const { data: previous, error: previousError } = await client
    .from('speech_analyses')
    .select(ANALYSIS_SELECT)
    .eq('question_id', current.question_id)
    .eq('status', 'done')
    .lt('created_at', current.created_at)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError || !previous) return null;
  return rowToDiagnosis(previous);
}

export function rowToDiagnosis(row) {
  if (!row) return null;
  return {
    kind: 'ra_diagnosis',
    analysis_id: row.id,
    attempt_id: row.attempt_id,
    status: row.status,
    alignment: row.aligned,
    metrics: row.metrics,
    evidence: row.evidence,
    provider: row.provider,
    model: row.model,
    rules_version: row.rules_version,
    diagnosis_version: row.rules_version,
    timings_ms: row.timings_ms,
    created_at: row.created_at,
    question: { id: row.question_id, content: row.reference_text },
    audio: row.audio_path ? { bucket: AUDIO_BUCKET, path: row.audio_path } : null,
    transcript: row.transcript,
    error_code: row.error_code
  };
}

function compareMetrics(previous = {}, current = {}) {
  return METRIC_SPECS.map(spec => {
    const before = normalizeMetric(previous?.[spec.key]);
    const after = normalizeMetric(current?.[spec.key]);
    if (!Number.isFinite(before) && !Number.isFinite(after)) return null;
    const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
    return {
      key: spec.key,
      label: spec.label,
      before,
      after,
      beforeText: spec.format(before),
      afterText: spec.format(after),
      delta,
      trend: metricTrend(delta, spec.better)
    };
  }).filter(Boolean);
}

function comparableEvidence(diagnosis) {
  const uncertainRefs = uncertainReferenceIndexes(diagnosis?.alignment);
  return (Array.isArray(diagnosis?.evidence) ? diagnosis.evidence : [])
    .map(item => normalizeEvidence(item, uncertainRefs))
    .filter(Boolean);
}

function normalizeEvidence(item, uncertainRefs) {
  const type = `${item?.type || ''}`.trim();
  const tag = `${item?.tag || ''}`.trim();
  const refIndex = Number(item?.ref_span?.[0]);
  const normalizedRefIndex = type === 'late_start' && !Number.isInteger(refIndex) ? 'opening' : refIndex;
  if (!type || IGNORED_TYPES.has(type) || UNCERTAIN_TAGS.has(tag) || (!Number.isInteger(normalizedRefIndex) && normalizedRefIndex !== 'opening') || uncertainRefs.has(normalizedRefIndex)) return null;
  return {
    key: `${type}:${normalizedRefIndex}`,
    type,
    refIndex: normalizedRefIndex,
    text: `${item?.text || ''}`.trim(),
    evidence: item
  };
}

function uncertainReferenceIndexes(alignment) {
  const indexes = new Set();
  for (const op of Array.isArray(alignment?.ops) ? alignment.ops : []) {
    if (UNCERTAIN_TAGS.has(op?.tag) && Number.isInteger(op?.ref_index)) indexes.add(op.ref_index);
  }
  return indexes;
}

function metricTrend(delta, better) {
  if (!Number.isFinite(delta) || delta === 0 || better === 'neutral') return 'neutral';
  if (better === 'higher') return delta > 0 ? 'better' : 'worse';
  return delta < 0 ? 'better' : 'worse';
}

function normalizeMetric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '暂无';
}

function formatCount(value) {
  return Number.isFinite(value) ? `${Math.round(value)} 次` : '暂无';
}

function formatWpm(value) {
  return Number.isFinite(value) ? `${Math.round(value)} 词/分` : '暂无';
}
