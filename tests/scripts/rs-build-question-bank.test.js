import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildQuestionRow,
  buildRSQuestionBank,
  buildSsml,
  buildStoragePath,
  countWords,
  parseArgs,
  validateQuestions
} from '../../scripts/rs-build-question-bank.js';

const sample = [
  { id: 'RS_001', difficulty: 1, content: 'Students should submit the lab notes before Friday morning.', voice: 'en-US-JennyNeural' },
  { id: 'RS_021', difficulty: 2, content: 'The research assistant compared survey responses from two different campus libraries.', voice: 'en-GB-SoniaNeural' },
  { id: 'RS_041', difficulty: 3, content: 'The lecturer argued that historical evidence should be evaluated within its wider social and political context.', voice: 'en-AU-NatashaNeural' }
];

function makeQuestions() {
  return Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    const difficulty = number <= 20 ? 1 : number <= 40 ? 2 : 3;
    const words = difficulty === 1
      ? 'one two three four five six seven eight'
      : difficulty === 2
        ? 'one two three four five six seven eight nine ten eleven twelve'
        : 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
    return {
      id: `RS_${String(number).padStart(3, '0')}`,
      difficulty,
      content: `${words}.`,
      voice: ['en-US-JennyNeural', 'en-GB-SoniaNeural', 'en-AU-NatashaNeural'][index % 3]
    };
  });
}

test('seed file has 60 original RS rows split into length-based difficulty bands', async () => {
  const questions = (await import('../../seeds/rs/questions.json', { with: { type: 'json' } })).default;
  validateQuestions(questions);
  assert.deepEqual([1, 2, 3].map(difficulty => questions.filter(q => q.difficulty === difficulty).length), [20, 20, 20]);
  assert.equal(new Set(questions.map(q => q.content.toLowerCase())).size, 60);
  assert.equal(questions.every(q => countWords(q.content) >= 8 && countWords(q.content) <= 20), true);
});

test('validation rejects short or misplaced difficulty rows', () => {
  const questions = makeQuestions();
  questions[40] = { ...questions[40], content: 'too short for hard difficulty' };
  assert.throws(() => validateQuestions(questions), /RS_041 difficulty 3 must have 16-20 words/);
});

test('storage path is stable for the same id voice and content', () => {
  assert.equal(buildStoragePath(sample[0]), buildStoragePath(sample[0]));
  assert.match(buildStoragePath(sample[0]), /^rs\/rs_001-[a-f0-9]{12}\.mp3$/);
  assert.notEqual(buildStoragePath(sample[0]), buildStoragePath({ ...sample[0], content: `${sample[0].content} Again.` }));
});

test('dry-run builds rows but does not synthesize, upload, or upsert', async () => {
  const result = await buildRSQuestionBank({
    apply: false,
    questions: makeQuestions(),
    bucket: 'question-audio',
    prefix: 'rs',
    delayMs: 0
  }, {
    synthesize: async () => { throw new Error('must not synthesize in dry-run'); }
  });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.rows.length, 60);
  assert.equal(result.rows[0].task_type, 'RS');
  assert.equal(result.rows[0].audio_url, null);
});

test('apply uploads generated audio and upserts exactly 60 question rows', async t => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(),'rs-bank-test-'));
  t.after(()=>fs.rm(cacheDir,{recursive:true,force:true}));
  const uploads = [];
  const upserts = [];
  const supabase = {
    storage: {
      from(bucket) {
        return {
          upload: async (audioPath, audio, options) => {
            uploads.push({ bucket, audioPath, audio: Buffer.from(audio), options });
            return { data: { path: audioPath }, error: null };
          },
          getPublicUrl: audioPath => ({ data: { publicUrl: `https://cdn.example/${audioPath}` } })
        };
      }
    },
    from(table) {
      assert.equal(table, 'questions');
      return { upsert: async (rows, options) => { upserts.push({ rows, options }); return { error: null }; } };
    }
  };
  const result = await buildRSQuestionBank({
    apply: true,
    cacheDir,
    questions: makeQuestions(),
    bucket: 'question-audio',
    prefix: 'rs',
    delayMs: 0
  }, {
    supabase,
    synthesize: async question => Buffer.from(`audio:${question.id}`)
  });
  assert.equal(result.mode, 'apply');
  assert.equal(uploads.length, 60);
  assert.equal(result.synthesisRequests,60);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].options.onConflict, 'id');
  assert.equal(upserts[0].rows.length, 60);
  assert.equal(upserts[0].rows[0].audio_url.startsWith('https://cdn.example/rs/rs_001-'), true);
  const repeated=await buildRSQuestionBank({apply:true,cacheDir,questions:makeQuestions(),delayMs:0},{supabase,synthesize:()=>{throw Error('must reuse cache');}});
  assert.equal(repeated.synthesisRequests,0);assert.equal(repeated.cacheHits,60);
  assert.equal(new Set(upserts.flatMap(x=>x.rows.map(r=>r.id))).size,60);
});

test('SSML escapes text and uses the voice locale', () => {
  const ssml = buildSsml({ ...sample[0], content: 'Use A & B < C during "review".' });
  assert.match(ssml, /xml:lang="en-US"/);
  assert.match(ssml, /name="en-US-JennyNeural"/);
  assert.match(ssml, /A &amp; B &lt; C during &quot;review&quot;\./);
});

test('question rows keep only the columns expected by the shared questions table', () => {
  assert.deepEqual(buildQuestionRow(sample[1], 'rs/rs_021.mp3', 'https://cdn/rs_021.mp3'), {
    id: 'RS_021',
    task_type: 'RS',
    content: sample[1].content,
    audio_path: 'rs/rs_021.mp3',
    audio_url: 'https://cdn/rs_021.mp3',
    difficulty: 2,
    is_active: true
  });
});

test('CLI defaults to dry-run and requires --apply for side effects', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    seed: 'seeds/rs/questions.json',
    bucket: 'question-audio',
    prefix: 'rs',
    delayMs: 3200
  });
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs(['--apply', '--delay-ms', '0']).apply, true);
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
});
