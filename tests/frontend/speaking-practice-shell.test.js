import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function source(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("shared speaking shell owns the palette and step chrome", () => {
  const component = source("src/components/SpeakingPracticeShell.vue");
  const styles = source("src/styles/speaking-practice.css");

  assert.match(component, /class="speaking-practice-shell ra-practice-shell"/);
  assert.match(component, /<slot name="topbar">/);
  assert.match(component, /class="ra-topbar"/);
  assert.match(component, /class="step-bar"/);
  assert.match(styles, /\.speaking-practice-shell\s*\{/);
  assert.match(styles, /--c0:\s*#1e1208/);
  assert.match(styles, /--card:\s*#faf6ef/);
  assert.match(styles, /--bdr:\s*#d4c8b4/);
  assert.doesNotMatch(styles, /:root\s*\{/);
});

test("RA practice reuses the shell while preserving its existing topbar content", () => {
  const raView = source("src/views/RAView.vue");

  assert.match(raView, /import SpeakingPracticeShell from "@\/components\/SpeakingPracticeShell\.vue"/);
  assert.match(raView, /<SpeakingPracticeShell[\s\S]*data-testid="ra-practice-page"[\s\S]*stepper-testid="ra-stepper"/);
  assert.match(raView, /<template #topbar>/);
  assert.match(raView, /data-testid="ra-back"/);
  assert.match(raView, /VIP · 无限练习/);
});

test("RS practice uses the shared shell without changing logout behavior", () => {
  const rsView = source("src/views/RSView.vue");

  assert.match(rsView, /import SpeakingPracticeShell from "@\/components\/SpeakingPracticeShell\.vue"/);
  assert.match(rsView, /:member-label="authStore\.statusText \|\| '未开通'"/);
  assert.match(rsView, /@exit="handleLogout"/);
  assert.match(rsView, /async function handleLogout\(\) \{\s*await authStore\.logout\(\);\s*router\.replace\("\/auth"\);\s*\}/);
});

test("diagnosis result is inside step four of the shared shell and does not fetch auth state", () => {
  const result = source("src/components/ra/RADiagnosisResult.vue");

  assert.match(result, /import SpeakingPracticeShell from '@\/components\/SpeakingPracticeShell\.vue'/);
  assert.match(result, /:current-step="3"/);
  assert.match(result, /:member-label="memberLabel"/);
  assert.match(result, /const memberLabel = computed\(\(\) => authStore\.statusText \|\| '未开通'\)/);
  assert.doesNotMatch(result, /authStore\.loadStatus/);
  assert.doesNotMatch(result, /var\(--c0,\s*#/);
  assert.doesNotMatch(result, /#302820/);
  assert.doesNotMatch(result, /#fffaf3/);
});

test("palette and primary button have one shared owner rather than copied result styling", () => {
 const ra=source('src/views/RAView.vue'),result=source('src/components/ra/RADiagnosisResult.vue'),styles=source('src/styles/speaking-practice.css');
 assert.doesNotMatch(ra,/--c0:/);
 assert.match(result,/class="primary-action retry"/);
 assert.match(styles,/\.speaking-practice-shell \.primary-action/);
 assert.match(styles,/--speaking-card-radius: 13px/);
});
test("shared CSS does not target similarly named headers on other task pages", () => {
 const styles=source('src/styles/speaking-practice.css');
 for(const line of styles.split('\n')) {
  if(line.trim().startsWith('.')) assert.ok(line.trim().startsWith('.speaking-practice-shell'), line);
 }
});
