import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {labelIndex} from '../../scripts/eval-speech.js';

test('each of the five questions has four distinct mixed errors with at least five intervening words',()=>{
 const scripts=JSON.parse(fs.readFileSync(new URL('../../eval/speech/scripts.json',import.meta.url)));
 const questions=[...new Set(scripts.map(script=>script.question_id))];
 const mixed=scripts.filter(script=>script.id.endsWith('-mixed-4'));
 assert.equal(questions.length,5);assert.equal(mixed.length,5);
 for(const question of questions){
  const entries=mixed.filter(script=>script.question_id===question);assert.equal(entries.length,1,question);
  const script=entries[0];
  assert.deepEqual(script.errors.map(error=>error.type).sort(),['long_pause','omission','repetition','substitution']);
  const indices=script.errors.map(error=>labelIndex(script.reference_text,error)).sort((a,b)=>a-b);
  for(let i=1;i<indices.length;i++)assert.ok(indices[i]-indices[i-1]-1>=5,`${script.id}: errors ${indices[i-1]} and ${indices[i]} too close`);
 }
});
