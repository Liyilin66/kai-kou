import test from'node:test';import assert from'node:assert/strict';import{scoreStoredDiagnosis,backfillRAScores}from'../../scripts/backfill-ra-scores.js';
const row={id:'one',status:'done',reference_text:'hello world',aligned:{reference:[{text:'hello'},{text:'world'}],ops:[{type:'match',ref_index:0,hyp_index:0,start_ms:0,end_ms:500},{type:'match',ref_index:1,hyp_index:1,start_ms:500,end_ms:1000}]},metrics:{wpm:120,hesitation_count:0,long_pause_count:0,speech_onset_ms:0,speech_offset_ms:1000,duration_ms:1000},client_silences:[]};
function fake(rows){const state={calls:[]};const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:rows})};return{state,client:{from:()=>q,rpc:async(name,args)=>{state.calls.push({name,args});return{data:{}};}}};}
test('dry run never writes and apply uses one atomic RPC per changed done result',async()=>{
 const{client,state}=fake([row]);const preview=await backfillRAScores(client);assert.equal(preview.changed,1);assert.equal(state.calls.length,0);
 await backfillRAScores(client,{apply:true});assert.equal(state.calls.length,1);assert.equal(state.calls[0].name,'backfill_ra_score');assert.equal(state.calls[0].args.p_score.total,90);
});
test('unchanged JSONB score with different key order is not rewritten',async()=>{
 const score=scoreStoredDiagnosis(row);const reordered=Object.fromEntries(Object.entries(score).reverse());const{client,state}=fake([{...row,metrics:{...row.metrics,score:reordered}}]);const r=await backfillRAScores(client,{apply:true});assert.equal(r.changed,0);assert.equal(state.calls.length,0);
});
test('RA backfill explicitly selects RA rows so it cannot relabel RS scores', async () => {
 const filters=[];const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},order:()=>q,range:async()=>({data:[]})};
 await backfillRAScores({from:()=>q});assert.ok(filters.some(([key,value])=>key==='task_type'&&value==='RA'));
});
