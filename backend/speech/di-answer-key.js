// Describe Image answer keys: what a correct description should mention, per image.
export const DI_ANSWER_KEY_VERSION = 'di-key-0.1';
export const DI_POINT_KINDS = ['topic', 'element', 'extreme', 'number', 'trend', 'comparison', 'sequence', 'conclusion'];
// Points that describe how features relate; the content band needs at least one of these.
export const DI_RELATION_KINDS = new Set(['trend', 'comparison', 'sequence', 'conclusion']);
const REVIEW_STATUSES = new Set(['unreviewed', 'reviewed']);

export function validateAnswerKeyItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object') return ['item must be an object'];
  if (typeof item.id !== 'string' || !/^DI_Q\d{3}$/.test(item.id)) errors.push('id must look like DI_Q001');
  if (item.answer_key_version !== DI_ANSWER_KEY_VERSION) errors.push(`answer_key_version must be ${DI_ANSWER_KEY_VERSION}`);
  if (typeof item.image_type !== 'string' || !item.image_type) errors.push('image_type is required');
  const points = Array.isArray(item.points) ? item.points : [];
  if (points.length < 4 || points.length > 6) errors.push('points must contain 4-6 items');
  const ids = new Set();
  points.forEach((point, index) => {
    const label = `points[${index}]`;
    if (!point || typeof point !== 'object') { errors.push(`${label} must be an object`); return; }
    if (point.id !== `P${index + 1}`) errors.push(`${label}.id must be P${index + 1}`);
    if (ids.has(point.id)) errors.push(`${label}.id is duplicated`);
    ids.add(point.id);
    if (!DI_POINT_KINDS.includes(point.kind)) errors.push(`${label}.kind is not allowed`);
    if (typeof point.text !== 'string' || !point.text.trim() || point.text.length > 240) errors.push(`${label}.text must be 1-240 characters`);
    if ('value' in point && point.value !== null && typeof point.value !== 'string' && typeof point.value !== 'number') errors.push(`${label}.value must be a string, number or null`);
    if ('required' in point && typeof point.required !== 'boolean') errors.push(`${label}.required must be boolean`);
  });
  const topics = points.filter(point => point?.kind === 'topic');
  if (topics.length !== 1 || topics[0].required !== true) errors.push('exactly one required topic point is needed');
  if (!points.some(point => DI_RELATION_KINDS.has(point?.kind))) errors.push('at least one trend, comparison, sequence or conclusion point is needed');
  if (!REVIEW_STATUSES.has(item.review?.status)) errors.push('review.status must be unreviewed or reviewed');
  return errors;
}

export function indexAnswerKey(file) {
  const items = Array.isArray(file?.items) ? file.items : [];
  return new Map(items.map(item => [item.id, item]));
}
