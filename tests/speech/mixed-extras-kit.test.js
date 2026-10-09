import test from 'node:test';import assert from 'node:assert/strict';import{mixedExtraItems}from'../../scripts/eval-build-mixed-extras-kit.js';
const sample={id:'ra-con-0001',source:'constructed',reference_text:'hello world',audio:{local_file:'one.webm'},hypotheses:{browser_asr:{text:'hello world'},groq_whisper:{words:[{text:'hello',start_ms:200,end_ms:400},{text:'word',start_ms:1200,end_ms:1400}],duration_ms:1800}}};
test('extra kit uses supplied unmatched events only and expands pause time for listening',()=>{
 const r=mixedExtraItems([sample],[{sample_id:sample.id,type:'pause',ref_index:0,start_ms:400,end_ms:1200}]);
 assert.equal(r.length,1);assert.equal(r[0].start_ms,0);assert.equal(r[0].end_ms,1800);assert.match(r[0].whisper,/停顿/);assert.equal(r[0].context.filter(x=>x.target).length,1);
});
test('multiple types at one position remain separate listening decisions and unsafe or missing references are rejected',()=>{
 const r=mixedExtraItems([sample],[{sample_id:sample.id,type:'pause',ref_index:1},{sample_id:sample.id,type:'substitution',ref_index:1}]);assert.notEqual(r[0].id,r[1].id);
 assert.throws(()=>mixedExtraItems([sample],[{sample_id:sample.id,type:'pause',ref_index:99}]),/Invalid/);
 assert.throws(()=>mixedExtraItems([{...sample,audio:{local_file:'../private.wav'}}],[{sample_id:sample.id,type:'pause',ref_index:1}]),/Unsafe/);
});
