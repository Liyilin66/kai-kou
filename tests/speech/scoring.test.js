import test from 'node:test';import assert from 'node:assert/strict';
import {scoreRA,scoreToPracticeScores}from'../../backend/speech/scoring.js';
const input=({N=10,ops=[],D=0,L=0,W=120,pauses=[]}={})=>({alignment:{reference:Array.from({length:N},(_,index)=>({index,text:'word'})),ops},metrics:{hesitation_count:D,long_pause_count:L,wpm:W},pauses});
test('content counts each error and deduplicates reference replacement/omission, not separate insertions',()=>{
 const s=scoreRA(input({ops:[{type:'substitution',ref_index:1},{type:'omission',ref_index:1},{type:'omission',ref_index:2},{type:'insertion',ref_index:null},{type:'insertion',tag:'repetition',ref_index:null}]}));
 assert.deepEqual(s.content,{correct:6,total:10,errors:4,ratio:.6});
});
test('uncertain matches and fillers do not count as content errors',()=>{
 const s=scoreRA(input({ops:[{type:'substitution',tag:'homophone',ref_index:1},{type:'substitution',tag:'low_confidence',ref_index:2},{type:'insertion',tag:'filler',ref_index:null}]}));assert.equal(s.content.errors,0);
});
test('empty reference produces finite bounded score without pronunciation numbers',()=>{
 const s=scoreRA(input({N:0,W:0}));assert.equal(s.content.ratio,0);assert.equal(s.total,10);assert.deepEqual(s.pronunciation,{status:'not_assessed'});
});
for(const [name,config,band]of[
 ['W below 40',{W:39.99},0],['W 40',{W:40},4],['D one',{D:1},4],['D two',{D:2},3],['D three',{D:3},3],['D four',{D:4},2],['D five',{D:5},2],['D six',{D:6},1],['one long pause',{L:1},2],['two long pauses no run',{L:2},0],['slow no hesitation',{W:89.99},4],['W 90',{W:90},5]
])test(`fluency boundary ${name}`,()=>assert.equal(scoreRA(input(config)).fluency.band,band));
test('long pauses with an observed run of three retain band one',()=>{
 const ops=Array.from({length:4},(_,i)=>({type:'match',ref_index:i,hyp_index:i,start_ms:i*200,end_ms:i*200+180}));const s=scoreRA(input({L:2,ops}));assert.equal(s.fluency.evidence.R,4);assert.equal(s.fluency.band,1);
});
test('energy pauses of at least 500ms split the longest continuous run including natural pauses',()=>{
 const ops=Array.from({length:5},(_,i)=>({type:'match',ref_index:i,hyp_index:i,start_ms:i*1000,end_ms:i*1000+300}));
 const s=scoreRA(input({ops,pauses:[{type:'natural',start_ms:350,end_ms:900,ref_index:0}]}));assert.equal(s.fluency.evidence.R,4);
});
test('same input is deterministic; formula is rounded and persisted pronunciation is null',()=>{
 const data=input({D:2,ops:[{type:'omission',ref_index:1}]});const s=scoreRA(data);assert.deepEqual(s,scoreRA(data));assert.equal(s.total,70);assert.equal(s.score_version,'ra-score-0.1');assert.deepEqual(scoreToPracticeScores(s),{overall:70,content:82,fluency:58,pronunciation:null});
});
