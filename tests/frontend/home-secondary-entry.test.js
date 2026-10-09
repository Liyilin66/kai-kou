import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function readProjectFile(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function loadEnabledTaskContext() {
  const source = readProjectFile('src/lib/enabled-task-types.js')
    .replace(/^import .*?;\n/gm, '')
    .replace(/^export /gm, '');
  const context = vm.createContext({ isDIEnabled: () => false });
  vm.runInContext(source, context);
  return context;
}

test('alternate home views share the enabled task list for DI visibility', () => {
  const context = loadEnabledTaskContext();
  assert.deepEqual(
    Array.from(vm.runInContext("getEnabledTaskTypes({ types: HOME_TASK_TYPE_ORDER, diEnabled: false })", context)),
    ['RA', 'WFD', 'RTS', 'WE']
  );
  assert.deepEqual(
    Array.from(vm.runInContext("getEnabledTaskTypes({ types: HOME_TASK_TYPE_ORDER, diEnabled: true })", context)),
    ['RA', 'WFD', 'RTS', 'DI', 'WE']
  );

  for (const path of ['src/components/home/HomeDesktopDashboard.vue', 'src/views/HomeReplicaView.vue']) {
    assert.match(readProjectFile(path), /getEnabledTaskTypes/);
  }
});

test('alternate home views do not show fake coach, recent practice or free package copy', () => {
  const sources = [
    readProjectFile('src/components/home/HomeDesktopDashboard.vue'),
    readProjectFile('src/views/HomeReplicaView.vue')
  ].join('\n');

  for (const pattern of [
    /RECENT_PLACEHOLDERS/,
    /placeholder-di/,
    /72\/90|64\/90|05-16/,
    /10:32|10:33/,
    /2 天内可见提升/,
    /免费领取/,
    /PTE 备考资料包/
  ]) {
    assert.doesNotMatch(sources, pattern);
  }
});
test('desktop score change is observed analytics, not a fabricated increase from record count', () => {
 const source=readProjectFile('src/components/home/HomeDesktopDashboard.vue');
 assert.match(source,/helper: homeAnalytics.value.scoreComparisonText/);
 assert.doesNotMatch(source,/Math\.min\(9\.9, Math\.max\(1\.2/);
});
test('coach prompts and template links respect the same first-batch contracts', () => {
 for(const path of ['src/views/AgentView.vue','src/components/agent/AIWorkspace.vue','src/components/agent/AITutorLoading.vue']) {
  const source=readProjectFile(path);assert.doesNotMatch(source,/PTE 备考资料包|免费领取|真题 · 高频词汇/);
  assert.match(source,/\/we\/templates/);
 }
 assert.match(readProjectFile('src/views/AgentView.vue'),/hasUnavailableTaskRecommendation/);
 assert.match(readProjectFile('src/components/agent/AIWorkspace.vue'),/hasUnavailableTaskRecommendation/);
 assert.match(readProjectFile('src/components/agent/AgentChat.vue'),/getEnabledTaskTypes/);
});
