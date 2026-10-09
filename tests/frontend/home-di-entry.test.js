import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function loadDashboardContext() {
  const helper = readProjectFile('src/lib/enabled-task-types.js')
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
  const diagnosisScore = readProjectFile('src/lib/ra-diagnosis-score.js')
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
  const dashboard = readProjectFile('src/lib/home-desktop-dashboard.js')
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
  const source = [helper, diagnosisScore, dashboard].join('\n');
  const context = vm.createContext({ console, Date, Intl, Map, Set });
  vm.runInContext(source, context);
  return context;
}

test('available task types exclude DI only when the DI feature is off', () => {
  const context = loadDashboardContext();
  assert.deepEqual(
    Array.from(vm.runInContext('getEnabledTaskTypes({ diEnabled: false })', context)),
    ['RA', 'RS', 'RL', 'WFD', 'RTS', 'WE']
  );
  assert.deepEqual(
    Array.from(vm.runInContext('getEnabledTaskTypes({ diEnabled: true })', context)),
    ['RA', 'RS', 'RL', 'WFD', 'RTS', 'DI', 'WE']
  );
  assert.deepEqual(
    Array.from(vm.runInContext("getEnabledTaskTypes({ types: HOME_TASK_TYPE_ORDER, diEnabled: false })", context)),
    ['RA', 'WFD', 'RTS', 'WE']
  );
});

test('desktop dashboard state contains no DI entry points when DI is disabled', () => {
  const context = loadDashboardContext();
  const rows = [
    { id: 'di-1', task_type: 'DI', question_id: 'DI_Q001', created_at: '2026-10-09T01:00:00.000Z', score_json: { ai_review: { scores: { overall: 71, content: 76, fluency: 64 } } } },
    { id: 'ra-1', task_type: 'RA', question_id: 'RA_024', created_at: '2026-10-09T02:00:00.000Z', score_json: { scores: { overall: 62 } } },
    { id: 'wfd-1', task_type: 'WFD', question_id: 'WFD_001', created_at: '2026-10-09T03:00:00.000Z', score_json: { overall: 58 } }
  ];
  const state = vm.runInContext(
    `buildDesktopDashboardState({}, ${JSON.stringify(rows)}, { diEnabled: false, weeklyRows: ${JSON.stringify(rows)}, trendRows: { currentRows: ${JSON.stringify(rows)}, previousRows: [] } })`,
    context
  );

  assert.deepEqual(Array.from(Object.keys(state.moduleMetrics)), ['RA', 'WFD', 'RTS', 'WE']);
  assert.deepEqual(Array.from(state.heatmapMatrix.map((row) => row.taskType)), ['RA', 'WFD', 'RTS', 'WE']);
  assert.ok(state.heroTask.checklist.every((item) => item.task_type !== 'DI'));
  assert.ok(state.weakPoints.every((item) => item.taskType !== 'DI'));
  assert.ok(state.recentPractices.every((item) => item.taskType !== 'DI'));
  assert.doesNotMatch(state.coach.banner, /\bDI\b/);
  assert.doesNotMatch(JSON.stringify(state.coach.summaries), /\bDI\b|10:32|10:33|2 天内可见提升/);
});

test('empty dashboard state and homepage source do not expose fake coach or recent-practice samples', () => {
  const context = loadDashboardContext();
  const empty = vm.runInContext('createEmptyDesktopDashboardState(null)', context);
  assert.deepEqual(Array.from(empty.recentPractices), []);
  assert.deepEqual(Array.from(empty.coach.summaries), []);
  assert.doesNotMatch(empty.coach.banner, /\bDI\b/);

  const homeSource = readProjectFile('src/views/HomeView.vue');
  const desktopSource = readProjectFile('src/components/home/HomeDesktopDashboard.vue');
  assert.doesNotMatch(homeSource, /10:32|10:33|2 天内可见提升|免费领取|PTE 备考资料包/);
  assert.doesNotMatch(desktopSource, /placeholder-di|72\/90|64\/90|05-16|免费领取|PTE 备考资料包/);
});
