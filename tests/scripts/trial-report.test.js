import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialReport, parseReportArgs } from '../../scripts/trial-report.js';

const raScore = total => ({ metrics: { score: { total } } });

test('report metrics are anonymous and count evidence replay by viewed analysis ids', () => {
  const report = buildTrialReport({
    since: '2026-10-09T00:00:00.000Z',
    participants: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: null }],
    practices: [
      { user_id: 'u1', question_id: 'RA_001', score_json: raScore(60), created_at: '2026-10-08T23:00:00.000Z' },
      { user_id: 'u1', question_id: 'RA_001', score_json: raScore(62), created_at: '2026-10-09T01:00:00.000Z' },
      { user_id: 'u1', question_id: 'RA_002', score_json: raScore(72), created_at: '2026-10-10T01:00:00.000Z' },
      { user_id: 'u1', question_id: 'RA_003', score_json: raScore(78), created_at: '2026-10-10T02:00:00.000Z' },
      { user_id: 'u2', question_id: 'RA_004', score_json: { scores: { overall: 55 } }, created_at: '2026-10-09T03:00:00.000Z' }
    ],
    events: [
      { user_id: 'u1', event: 'ra_result_viewed', analysis_id: 'a1', created_at: '2026-10-09T01:02:00.000Z' },
      { user_id: 'u1', event: 'ra_result_viewed', analysis_id: 'a2', created_at: '2026-10-09T01:03:00.000Z' },
      { user_id: 'u1', event: 'ra_evidence_played', analysis_id: 'a1', created_at: '2026-10-09T01:04:00.000Z' },
      { user_id: 'u1', event: 'ra_evidence_played', analysis_id: 'not-viewed', created_at: '2026-10-09T01:05:00.000Z' },
      { user_id: 'u1', event: 'ra_rules_opened', analysis_id: 'a1', created_at: '2026-10-09T01:06:00.000Z' },
      { user_id: 'u1', event: 'ra_retry_started', analysis_id: 'a1', created_at: '2026-10-10T01:06:00.000Z' },
      { user_id: 'u2', event: 'ra_result_viewed', analysis_id: 'b1', created_at: '2026-10-09T03:10:00.000Z' }
    ]
  });
  assert.deepEqual(report.participants.map(row => row.participant), ['参与者 1', '参与者 2', '参与者 3']);
  assert.equal(JSON.stringify(report).includes('@'), false);
  assert.equal(report.participants[0].practice_count, 3);
  assert.equal(report.participants[0].active_days, 2);
  assert.equal(report.participants[0].result_views, 2);
  assert.equal(report.participants[0].evidence_replay_result_page_fraction, 0.5);
  assert.equal(report.participants[0].rules_opens, 1);
  assert.equal(report.participants[0].retries, 1);
  assert.equal(report.participants[0].returned_after_first_day, true);
  assert.deepEqual(report.participants[0].score_reference, {
    first_day: '2026-10-09',
    final_day: '2026-10-10',
    first_day_avg: 62,
    final_day_new_question_avg: 75,
    delta: 13,
    final_day_new_question_count: 2
  });
  assert.equal(report.participants[2].status, '对方还没注册');
});

test('final-day repeated historical questions are excluded from descriptive score delta', () => {
  const report = buildTrialReport({
    since: '2026-10-09T00:00:00.000Z',
    participants: [{ user_id: 'u1' }],
    practices: [
      { user_id: 'u1', question_id: 'RA_010', score_json: raScore(50), created_at: '2026-10-08T01:00:00.000Z' },
      { user_id: 'u1', question_id: 'RA_011', score_json: raScore(70), created_at: '2026-10-09T01:00:00.000Z' },
      { user_id: 'u1', question_id: 'RA_010', score_json: raScore(90), created_at: '2026-10-10T01:00:00.000Z' }
    ],
    events: []
  });
  assert.equal(report.participants[0].score_reference.final_day_new_question_count, 0);
  assert.equal(report.participants[0].score_reference.final_day_new_question_avg, null);
  assert.equal(report.participants[0].score_reference.delta, null);
});

test('CLI arguments validate date and anonymized email list', () => {
  assert.deepEqual(parseReportArgs(['--since', '2026-10-09', '--emails', 'a@x.com,b@y.com']), {
    since: '2026-10-09T00:00:00.000Z',
    emails: ['a@x.com', 'b@y.com']
  });
  assert.throws(() => parseReportArgs(['--since', 'bad', '--emails', 'a@x.com']));
  assert.throws(() => parseReportArgs(['--since', '2026-10-09', '--emails', 'bad']));
});
test('one day cannot produce a before-after score comparison', () => {
  const report = buildTrialReport({ since: '2026-10-09T00:00:00Z', participants: [{ user_id: 'u' }], practices: [{ user_id: 'u', question_id: 'RA_001', score_total: 70, created_at: '2026-10-09T02:00:00Z' }] });
  assert.equal(report.participants[0].score_reference.delta, null);
  assert.equal(report.participants[0].score_reference.first_day_avg, 70);
});
test('date must exist and participant emails are deduplicated', () => {
  assert.throws(() => parseReportArgs(['--since', '2026-02-30', '--emails', 'a@x.com']));
  assert.deepEqual(parseReportArgs(['--since', '2026-10-09', '--emails', 'A@x.com,a@x.com']).emails, ['a@x.com']);
});
