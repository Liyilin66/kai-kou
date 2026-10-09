import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackPracticeEvent } from '../../src/lib/practice-events.js';
const settle = () => new Promise(resolve => setImmediate(resolve));
test('telemetry returns immediately even when auth never completes', () => {
  assert.equal(trackPracticeEvent({ auth: { getUser: () => new Promise(() => {}) } }, {}, 'ra_retry_started'), undefined);
});
test('auth/network/insert failures stay silent', async () => {
  for (const getUser of [() => { throw Error('offline'); }, async () => ({ error: Error('auth') }), async () => ({ data: { user: { id: 'u' } } })]) {
    trackPracticeEvent({ auth: { getUser }, from: () => ({ insert: async () => { throw Error('offline'); } }) }, {}, 'ra_retry_started');
    await settle();
  }
});
test('events include only whitelisted fields and own user', async () => {
  const rows = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) }, from: name => { assert.equal(name, 'practice_events'); return { insert: async row => rows.push(row) }; } };
  const result = { analysis_id: 'a', question: { id: 'RA_024', content: 'secret' }, transcript: 'secret' };
  trackPracticeEvent(client, result, 'ra_result_viewed', { total: 80, text: 'secret' });
  trackPracticeEvent(client, result, 'ra_evidence_played', { evidence_type: 'omission', audio: 'secret' });
  trackPracticeEvent(client, result, 'invalid');
  await settle();
  assert.equal(rows.length, 2); assert.deepEqual(rows[0], { user_id: 'u', event: 'ra_result_viewed', analysis_id: 'a', question_id: 'RA_024', props: { total: 80 } });
  assert.deepEqual(rows[1].props, { evidence_type: 'omission' });
  assert.ok(!JSON.stringify(rows).includes('secret'));
});
test('all five events are wired to result UI handlers', () => {
  const source = readFileSync(new URL('../../src/components/ra/RADiagnosisResult.vue', import.meta.url), 'utf8');
  for (const event of ['ra_result_viewed', 'ra_evidence_played', 'ra_rules_opened', 'ra_retry_started', 'ra_compare_viewed']) assert.ok(source.includes(`track('${event}'`));
  assert.ok(source.includes('@click="openScoringRules"'));
});
