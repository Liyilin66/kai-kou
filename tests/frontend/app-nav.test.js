import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PRIMARY_NAV_ITEMS, buildPracticeNavItems, isNavItemActive } from '../../src/lib/app-nav.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const NAV_HOSTS = ['src/views/HomeView.vue', 'src/views/ProfileView.vue', 'src/components/agent/AIWorkspace.vue', 'src/components/agent/AITutorLoading.vue'];

test('the practice group lists open task types in order, each linking to its own page', () => {
  const closed = buildPracticeNavItems({ diEnabled: false });
  assert.deepEqual(closed.map((item) => [item.code, item.to]), [
    ['RA', '/ra'], ['RS', '/rs'], ['RL', '/rl'], ['WFD', '/wfd'], ['RTS', '/rts'], ['WE', '/we']
  ]);
  const open = buildPracticeNavItems({ diEnabled: true });
  assert.deepEqual(open.map((item) => item.code), ['RA', 'RS', 'RL', 'WFD', 'RTS', 'DI', 'WE']);
});

test('RS and RL nav names follow the practice store', () => {
  const store = read('src/stores/practice.js');
  const names = Object.fromEntries(buildPracticeNavItems({ diEnabled: false }).map((item) => [item.code, item.label]));
  for (const code of ['RS', 'RL', 'WFD', 'RTS']) {
    assert.match(store, new RegExp(`title: "${code} - ${names[code]}"`), code);
  }
});

test('the current page and its sub-pages are highlighted, nothing else', () => {
  const [home, agent, profile] = PRIMARY_NAV_ITEMS;
  const [ra, rs] = buildPracticeNavItems({ diEnabled: false });
  assert.equal(isNavItemActive(home, '/home'), true);
  assert.equal(isNavItemActive(home, '/'), true);
  assert.equal(isNavItemActive(home, '/profile'), false);
  assert.equal(isNavItemActive(agent, '/agent'), true);
  assert.equal(isNavItemActive(profile, '/profile'), true);
  assert.equal(isNavItemActive(ra, '/ra/practice'), true);
  assert.equal(isNavItemActive(ra, '/rs'), false);
  assert.equal(isNavItemActive(rs, '/rs?questionId=RS_001'), true);
  assert.deepEqual(PRIMARY_NAV_ITEMS.map((item) => [item.to, item.short]), [['/home', '首页'], ['/agent', 'AI 私教'], ['/profile', '我的']]);
});

test('home, AI tutor and profile all render the shared nav and no longer carry their own sidebars', () => {
  for (const path of NAV_HOSTS) {
    const source = read(path);
    assert.match(source, /<AppNav[\s>/]/, path);
    assert.doesNotMatch(source, /label: "(练习中心|学习计划|学习报告)"/, path);
    assert.doesNotMatch(source, /<aside class="[^"]*sidebar/, path);
  }
  const nav = read('src/components/AppNav.vue');
  assert.match(nav, /buildPracticeNavItems\(\{ diEnabled: isDIEnabled\(\) \}\)/);
  assert.doesNotMatch(read('src/lib/app-nav.js'), /#quick|#goal|#report/);
});

test('only the three nav pages render AppNav, so practice and result pages stay immersive', () => {
  const hosts = readdirSync(new URL('../../src/views', import.meta.url))
    .filter((file) => file.endsWith('.vue') && /<AppNav[\s>/]/.test(read(`src/views/${file}`)));
  assert.deepEqual(hosts.sort(), ['HomeView.vue', 'ProfileView.vue']);
  assert.match(read('src/views/AgentView.vue'), /<AITutorLoading[\s\S]*<AIWorkspace/);
});

test('the tab bar shows under 1024 only and every host reserves its height', () => {
  const nav = read('src/components/AppNav.vue');
  assert.match(nav, /@media \(min-width:1024px\)\{\s*\.app-sidebar\{display:flex;\}\s*\.app-tabbar\{display:none;\}/);
  assert.match(read('src/assets/styles/main.css'), /--kk-tabbar-h:/);
  for (const path of NAV_HOSTS) assert.match(read(path), /var\(--kk-tabbar-h\)/, path);
});

test('home entries add RS and RL through the enabled task filter, and the avatar opens the profile', () => {
  const home = read('src/views/HomeView.vue');
  assert.match(home, /\{ code: "RS", desc: "复述句子\\n关键词抓取", to: "\/rs" \}/);
  assert.match(home, /\{ code: "RL", desc: "复述讲座\\n模板组织表达", to: "\/rl" \}/);
  assert.match(home, /moduleTaskTypes = computed\(\(\) => getEnabledTaskTypes\(\{\s*types: moduleCardConfigs\.map/);
  assert.match(home, /<RouterLink class="user-link" to="\/profile"/);
});

test('the mobile home folds the report cards behind a collapsed summary and shortens the coach card', () => {
  const home = read('src/views/HomeView.vue');
  assert.match(home, /const reportOpen = ref\(false\)/);
  assert.match(home, /:aria-expanded="reportOpen \? 'true' : 'false'"/);
  const fold = home.slice(home.indexOf('id="report-fold-body"'), home.indexOf('</section>', home.indexOf('id="report-fold-body"')));
  for (const card of ['hm-card', 'trend-card', 'weak-card', 'goal-card']) assert.match(fold, new RegExp(`class="card ${card}"`), card);
  assert.doesNotMatch(fold, /recent-card/);
  assert.match(home, /<RouterLink class="ai-line" to="\/agent">[\s\S]*?→/);
  assert.match(home, /本周练了 \$\{/);
});
