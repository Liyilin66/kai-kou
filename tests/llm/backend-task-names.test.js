import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

// Task names in agent prompts and plans must match src/stores/practice.js and src/lib/enabled-task-types.js.
test('backend never calls RTS 复述句子, WFD 写作填空/听写填空 or WE 学术短文', () => {
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const full = `${dir}/${name}`; statSync(full).isDirectory() ? walk(full) : name.endsWith('.js') && files.push(full); } };
  walk(new URL('../../backend', import.meta.url).pathname);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /写作填空|听写填空|学术短文/, file);
    assert.doesNotMatch(text, /RTS[^\n]{0,40}复述句子|复述句子[^\n]{0,20}\/rts/, file);
  }
  const chat = readFileSync(new URL('../../backend/agent/chat-service.js', import.meta.url), 'utf8');
  assert.match(chat, /title: "RTS 情景回应"/);
  assert.match(chat, /title: "WFD 听写句子"/);
  assert.match(readFileSync(new URL('../../backend/agent/daily-suggestion-service.js', import.meta.url), 'utf8'), /RTS: \{ title: "RTS 情景回应"/);
});
