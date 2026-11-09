import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDailyPracticeSummary } from '../../backend/agent/daily-suggestion-service.js';

function practice(id, taskType, daysAgo = 0, scoreJson = {}) {
  return { id, user_id: 'owner', task_type: taskType, score_json: scoreJson,
    created_at: new Date(Date.now() - daysAgo * 86400000).toISOString() };
}

function mockDatabase(initialRows) {
  const state = { rows: initialRows, queries: [] };
  return { state, from(table) {
    assert.equal(table, 'practice_logs');
    const query = { filters: [], orders: [], head: false, limitValue: Infinity,
      select(columns, options = {}) { this.head = Boolean(options.head); return this; },
      eq(key, value) { this.filters.push(row => row[key] === value); return this; },
      in(key, values) { this.filters.push(row => values.includes(row[key])); return this; },
      order(key, options) { this.orders.push([key, options.ascending]); return this; },
      limit(value) { this.limitValue = value; return this; },
      then(resolve, reject) {
        state.queries.push(this);
        const rows = state.rows.filter(row => this.filters.every(filter => filter(row)))
          .sort((left, right) => {
            for (const [key, ascending] of this.orders) {
              const compared = String(left[key]).localeCompare(String(right[key]));
              if (compared) return ascending ? compared : -compared;
            }
            return 0;
          });
        return Promise.resolve({ data: this.head ? null : rows.slice(0, this.limitValue), count: rows.length }).then(resolve, reject);
      }
    };
    return query;
  } };
}

let nextUser = 0;
async function summaryFor(rows) {
  const db = mockDatabase(rows);
  const id = `daily-summary-${++nextUser}`;
  db.state.rows = rows.map(row => ({ ...row, user_id: id }));
  return loadDailyPracticeSummary({ supabase: db, user: { id } });
}

function modernScore(taskType, total) {
  return { analysis_id: `analysis-${taskType}`, diagnosis_version: 'speech-diag-0.1',
    metrics: { score: { score_version: `${taskType.toLowerCase()}-score-0.1`, total } } };
}

test('one RA and one RS count as two attempts with numerical reference scores', async () => {
  const summary = await summaryFor([
    practice('ra', 'RA', 0, modernScore('RA', 80)),
    practice('rs', 'RS', 0, modernScore('RS', 60))
  ]);
  assert.equal(summary.total_attempts, 2);
  assert.equal(summary.today_attempts, 2);
  assert.equal(summary.recent_7_days_attempts, 2);
  assert.equal(summary.recent_30_days_attempts, 2);
  assert.equal(summary.task_stats.RA.average_score, 80);
  assert.equal(summary.task_stats.RS.average_score, 60);
  assert.equal(summary.recent_7_days_average_score, 70);
  assert.equal(summary.today_task_counts.RS, 1);
  assert.equal(summary.weakest_task_type, 'RS');
});

test('RL contributes to total, windows, latest practice, and per-task aggregates', async () => {
  const summary = await summaryFor([
    practice('rl-latest', 'RL', 0, { overall: 55 }),
    practice('rs-recent', 'RS', 2, modernScore('RS', 65)),
    practice('rl-month', 'RL', 10, { overall: 75 }),
    practice('ra-old', 'RA', 40, { overall: 85 })
  ]);
  assert.equal(summary.total_attempts, 4);
  assert.equal(summary.today_attempts, 1);
  assert.equal(summary.recent_7_days_attempts, 2);
  assert.equal(summary.recent_30_days_attempts, 3);
  assert.equal(summary.recent_7_days_average_score, 60);
  assert.equal(summary.latest_practice_id, 'rl-latest');
  assert.equal(summary.latest_task_type, 'RL');
  assert.equal(summary.task_stats.RL.attempts, 2);
  assert.equal(summary.task_stats.RL.average_score, 65);
  assert.equal(summary.today_task_counts.RL, 1);
});

test('unscored RA/RS diagnoses remain activity with null averages even with stale overall', async () => {
  const summary = await summaryFor(['RA', 'RS'].map(type => practice(type, type, 0, {
    analysis_id: type, diagnosis_version: 'speech-diag-0.1', overall: 90,
    metrics: { score: { score_version: `${type.toLowerCase()}-score-0.1`, total: null } }
  })));
  assert.equal(summary.total_attempts, 2);
  assert.equal(summary.recent_7_days_average_score, null);
  assert.equal(summary.weakest_task_type, '');
  for (const type of ['RA', 'RS']) {
    assert.equal(summary.task_stats[type].scored_attempts, 0);
    assert.equal(summary.task_stats[type].average_score, null);
  }
});

test('old score records, JSON strings, and versioned reference scores remain readable', async () => {
  const summary = await summaryFor([
    practice('old-ra', 'RA', 0, JSON.stringify({ overall: 72 })),
    practice('old-rs', 'RS', 0, { scores: { overall: 68 } }),
    practice('reference', 'RA', 0, { analysis_id: 'reference', score_version: 'ra-score-0.1', scores: { overall: 78 } }),
    practice('missing', 'RS', 0, { overall: null, scores: { overall: '' } })
  ]);
  assert.equal(summary.task_stats.RA.average_score, 75);
  assert.equal(summary.task_stats.RS.average_score, 68);
  assert.equal(summary.task_stats.RS.scored_attempts, 1);
});

test('matching signatures reuse cache and new practice signatures refresh RS counts', async () => {
  const user = { id: `daily-summary-${++nextUser}` };
  const db = mockDatabase([practice('first', 'RA', 0, { overall: 70 })]);
  db.state.rows[0].user_id = user.id;
  const first = await loadDailyPracticeSummary({ supabase: db, user });
  const cached = await loadDailyPracticeSummary({ supabase: db, user, practiceSignature: first.practice_signature });
  assert.deepEqual(cached, first);
  assert.equal(db.state.queries.length, 2);
  db.state.rows.push({ ...practice('second', 'RS', 0, modernScore('RS', 60)), user_id: user.id });
  const refreshed = await loadDailyPracticeSummary({ supabase: db, user, practiceSignature: 'new-practice-signature' });
  assert.equal(db.state.queries.length, 4);
  assert.equal(refreshed.total_attempts, 2);
  assert.equal(refreshed.task_stats.RS.attempts, 1);
  assert.notEqual(refreshed.practice_signature, first.practice_signature);
});
