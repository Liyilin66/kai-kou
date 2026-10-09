// Only these scalar fields may leave the page through instrumentation.
const fields = {
  ra_result_viewed: ['total', 'task_type'],
  ra_evidence_played: ['evidence_type', 'task_type'],
  ra_rules_opened: ['task_type'],
  ra_retry_started: ['task_type'],
  ra_compare_viewed: ['improved', 'ongoing', 'new', 'task_type']
};
export function trackPracticeEvent(client, result, event, values = {}) {
  // Deliberately return immediately: authentication/network delays cannot block UI.
  void (async () => {
    try {
      if (!Object.hasOwn(fields, event)) return;
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user?.id) return;
      const props = {};
      const resultTaskType = String(result?.task_type || result?.question?.task_type || '').trim().toUpperCase();
      for (const key of fields[event]) {
        const value = key === 'task_type' ? (values[key] || resultTaskType) : values[key];
        if (key === 'task_type' && ['RA', 'RS'].includes(value)) props[key] = value;
        else if (key === 'evidence_type' ? typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) : Number.isFinite(value)) props[key] = value;
      }
      await client.from('practice_events').insert({ user_id: data.user.id, event,
        analysis_id: result.analysis_id || null, question_id: result.question?.id || null, props });
    } catch { /* Optional telemetry must never interrupt practice. */ }
  })();
}
