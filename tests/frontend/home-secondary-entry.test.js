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

  assert.match(readProjectFile('src/views/HomeView.vue'), /getEnabledTaskType/);
});

test('the home view does not show fake coach, recent practice or free package copy', () => {
  const sources = readProjectFile('src/views/HomeView.vue');

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
test('home score change is observed analytics, not a fabricated increase from record count', () => {
 const source=readProjectFile('src/views/HomeView.vue');
 assert.match(source,/homeAnalytics\.value\.scoreComparisonText/);
 assert.doesNotMatch(source,/Math\.min\(9\.9, Math\.max\(1\.2/);
});
test('coach prompts and template links respect the same first-batch contracts', () => {
 for(const path of ['src/views/AgentView.vue','src/components/agent/AIWorkspace.vue','src/components/agent/AITutorLoading.vue']) {
  const source=readProjectFile(path);assert.doesNotMatch(source,/PTE 备考资料包|免费领取|真题 · 高频词汇/);
 }
 // The WE template entry lives in the shared AppNav sidebar, which the workspace and loading shell both render.
 assert.match(readProjectFile('src/components/AppNav.vue'),/\/we\/templates/);
 for(const path of ['src/components/agent/AIWorkspace.vue','src/components/agent/AITutorLoading.vue']) assert.match(readProjectFile(path),/<AppNav[\s>/]/);
 assert.match(readProjectFile('src/views/AgentView.vue'),/hasUnavailableTaskRecommendation/);
 assert.match(readProjectFile('src/components/agent/AIWorkspace.vue'),/hasUnavailableTaskRecommendation/);
});
