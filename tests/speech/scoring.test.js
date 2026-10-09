import test from 'node:test';import assert from 'node:assert/strict';
import {scoreRA,scoreRS,scoreToPracticeScores}from'../../backend/speech/scoring.js';
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
test('RS content band requires all reference words in order and treats middle insertions as imperfect',()=>{
 const perfect=input({N:6,ops:Array.from({length:6},(_,i)=>({type:'match',ref_index:i,hyp_index:i,start_ms:i*200,end_ms:i*200+100}))});
 const inserted=input({N:6,ops:[{type:'match',ref_index:0,hyp_index:0},{type:'match',ref_index:1,hyp_index:1},{type:'insertion',ref_index:null,hyp_index:2},{type:'match',ref_index:2,hyp_index:3},{type:'match',ref_index:3,hyp_index:4},{type:'match',ref_index:4,hyp_index:5},{type:'match',ref_index:5,hyp_index:6}]});
 assert.equal(scoreRS(perfect).content.band,3);
 assert.equal(scoreRS(inserted).content.band,2);
});
test('RS content band uses ordered trustworthy matches and ignores edge fillers and uncertain words',()=>{
 const half=input({N:6,ops:[{type:'insertion',tag:'filler',ref_index:null,hyp_index:0},{type:'match',ref_index:0,hyp_index:1},{type:'substitution',tag:'homophone',ref_index:1,hyp_index:2},{type:'match',ref_index:2,hyp_index:3},{type:'match',ref_index:3,hyp_index:4},{type:'insertion',ref_index:null,hyp_index:5}]});
 const some=input({N:6,ops:[{type:'match',ref_index:1,hyp_index:0},{type:'substitution',ref_index:4,hyp_index:1}]});
 const none=input({N:6,ops:[{type:'insertion',ref_index:null,hyp_index:0},{type:'substitution',tag:'low_confidence',ref_index:2,hyp_index:1}]});
 assert.equal(scoreRS(half).content.band,2);
 assert.equal(scoreRS(some).content.band,1);
 assert.equal(scoreRS(none).content.band,null);
});
test('RS ignores leading and trailing additions but not middle additions for a full sentence',()=>{
 const edge=input({N:3,ops:[{type:'insertion',ref_index:null,hyp_index:0},{type:'match',ref_index:0,hyp_index:1},{type:'match',ref_index:1,hyp_index:2},{type:'match',ref_index:2,hyp_index:3},{type:'insertion',ref_index:null,hyp_index:4}]});
 const middle=input({N:3,ops:[{type:'match',ref_index:0,hyp_index:0},{type:'insertion',ref_index:null,hyp_index:1},{type:'match',ref_index:1,hyp_index:2},{type:'match',ref_index:2,hyp_index:3}]});
 assert.equal(scoreRS(edge).content.band,3);
 assert.equal(scoreRS(middle).content.band,2);
});
test('RS score version and persisted content score use the content band, not RA ratio',()=>{
 const s=scoreRS(input({N:6,D:2,ops:[{type:'match',ref_index:0,hyp_index:0},{type:'match',ref_index:1,hyp_index:1}]}));
 assert.equal(s.score_version,'rs-score-0.1');
 assert.deepEqual(s.content,{band:1,matched:2,total:6,ratio:1/3});
 assert.equal(s.total,47);
 assert.deepEqual(scoreToPracticeScores(s),{overall:47,content:37,fluency:58,pronunciation:null});
});
test('RS low-confidence observations cannot manufacture a perfect content band', () => {
 const unknown = input({ N: 3, ops: [0,1,2].map(i => ({type:'substitution',tag:'low_confidence',ref_index:i,hyp_index:i})) });
 const score=scoreRS(unknown);assert.equal(score.content.matched,0);assert.equal(score.content.band,null);assert.equal(score.total,null);
 const partial=input({N:3,ops:[{type:'match',ref_index:0,hyp_index:0},{type:'substitution',tag:'low_confidence',ref_index:1,hyp_index:1},{type:'match',ref_index:2,hyp_index:2}]});
 assert.equal(scoreRS(partial).content.band,2);assert.equal(scoreRS(partial).content.uncertain,1);
});
