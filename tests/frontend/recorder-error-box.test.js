import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').match(/<template>([\s\S]*)<\/template>/)[1];

// useRecorder() returns plain refs; templates do not unwrap them in conditions, so `recorder.error` alone is always truthy.
for (const path of ['src/views/RLView.vue', 'src/views/RSView.vue']) {
  test(`${path} shows the recorder error box only when there is an error`, () => {
    const source = template(path);
    assert.match(source, /v-if="recorder\.error\.value && phase !== 'processing'"/);
    assert.doesNotMatch(source, /v-if="[^"]*recorder\.error(?!\.value)[^"]*"/);
  });
}

for (const path of ['src/views/RLView.vue', 'src/views/RSView.vue']) {
  test(`${path} shows "Microphone warming up" until the recorder is really ready`, () => {
    const source = template(path);
    assert.match(source, /v-if="!recorder\.isReady\.value"/);
    assert.doesNotMatch(source, /v-if="!recorder\.isReady"/);
  });
}
