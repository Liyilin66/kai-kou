import test from 'node:test';import assert from 'node:assert/strict';import{evaluateLabeledPositions}from'../../scripts/eval-labeled-positions.js';
const manifest=[{id:'one',reference_text:'a boat sails away',hypotheses:{browser_asr:{text:'a coat sails today'},groq_whisper:{text:'a boat sails away'}}}];
const labels={version:1,items:[{id:'one:1',sample_id:'one',ref_index:1,choice:'wrong'},{id:'one:2',sample_id:'one',ref_index:2,choice:'correct'},{id:'one:3',sample_id:'one',ref_index:3,choice:'unclear'}]};
test('position benchmark excludes unclear and unselected positions without counting them as negatives',()=>{
 const r=evaluateLabeledPositions(manifest,labels);assert.equal(r.confirmed_count,2);assert.equal(r.unclear_count,1);
 assert.equal(r.reports[0].tp,1);assert.equal(r.reports[0].fp,0);assert.equal(r.reports[0].accuracy,1);
 assert.equal(r.reports[1].fn,1);assert.equal(r.reports[1].tn,1);assert.equal(r.reports[1].recall,0);
});
test('duplicate and stale position identifiers are rejected',()=>{
 assert.throws(()=>evaluateLabeledPositions(manifest,{version:1,items:[labels.items[0],labels.items[0]]}),/duplicate/);
 assert.throws(()=>evaluateLabeledPositions(manifest,{version:1,items:[{...labels.items[0],ref_index:4}]}),/Invalid/);
});
