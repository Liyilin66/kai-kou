import test from 'node:test';import assert from 'node:assert/strict';
import{planAzureSegments,requestAzurePA,mapAzureSample,validAzureResponse}from'../../scripts/eval-azure-pa.js';
const sample={id:'one',reference_text:'hello world',labels:{errors:[]},hypotheses:{groq_whisper:{duration_ms:2000,words:[{text:'hello',start_ms:0,end_ms:500},{text:'world',start_ms:1000,end_ms:1500}]}}};
const response=words=>({RecognitionStatus:'Success',NBest:[{AccuracyScore:80,FluencyScore:80,CompletenessScore:100,Words:words}]});
const word=(Word,ErrorType,AccuracyScore,Offset=0)=>({Word,Offset,Duration:5000000,AccuracyScore,ErrorType});
test('word scoring accepts flat REST fields and does not call omitted zero-score a pronunciation finding',()=>{
 const r=response([word('hello','Omission',0),word('world','Mispronunciation',45,10000000)]);
 const m=mapAzureSample(sample,{segments:[{ref_start:0,reference_text:sample.reference_text,response:r}]});
 assert.equal(m.pronunciation(0),false);assert.equal(m.anyError(0),true);assert.equal(m.pronunciation(1),true);
 assert.equal(m.pauses.length,0);assert.equal(m.available(1),true);
});
test('HTTP success without assessment fields is invalid, not an all-zero pronunciation result',()=>{
 const r={RecognitionStatus:'Success',NBest:[{Words:[{Word:'hello',AccuracyScore:0}]}]};
 assert.equal(validAzureResponse(r),false);const m=mapAzureSample(sample,{segments:[{ref_start:0,reference_text:sample.reference_text,response:r}]});assert.equal(m.anyError(0),false);assert.equal(m.available(0),false);
});
test('short sample is not truncated and long sample partitions all audio and reference words',()=>{
 assert.equal(planAzureSegments(sample)[0].end_ms,2000);
 const text=Array(40).fill('hello').join(' '),s={...sample,reference_text:text,hypotheses:{groq_whisper:{duration_ms:40000,words:Array.from({length:40},(_,i)=>({text:'hello',start_ms:i*1000,end_ms:i*1000+800}))}}};const chunks=planAzureSegments(s);assert.equal(chunks.length,2);assert.equal(chunks[0].end_ms,chunks[1].start_ms);assert.equal(chunks[1].end_ms,40000);assert.equal(chunks.map(c=>c.reference_text).join(' '),text);assert.ok(chunks.every(c=>c.end_ms-c.start_ms<=30000));
});
test('REST request has en-US scripted miscue settings and secrets are not returned',async()=>{
 const out=await requestAzurePA({audio:Buffer.from('wav'),referenceText:'hello world',key:'test-secret',region:'eastasia',fetchImpl:async(url,opts)=>{
 assert.match(url,/eastasia.*language=en-US/);const p=JSON.parse(Buffer.from(opts.headers['Pronunciation-Assessment'],'base64'));assert.equal(p.EnableMiscue,'True');assert.equal(p.EnableProsodyAssessment,'True');assert.equal(p.ReferenceText,'hello world');
 return new Response(JSON.stringify(response([word('hello','None',99),word('world','None',99)])));}});
 assert.equal(validAzureResponse(out.response),true);assert.equal(JSON.stringify(out).includes('test-secret'),false);
});
test('Azure insertion tags survive ambiguous duplicate-word alignment',()=>{
 const r=response([word('hello','Insertion',90),word('hello','None',99,5000000),word('world','None',99,10000000)]);
 const m=mapAzureSample(sample,{segments:[{ref_start:0,reference_text:sample.reference_text,response:r}]});assert.ok(m.insertions.some(p=>p.ref_index<=1));
});
test('invalid assessment keeps raw HTTP-200 response for audit rather than losing it',async()=>{
 const raw={RecognitionStatus:'Success',NBest:[{Words:[{Word:'hello',AccuracyScore:0}]}]};
 const out=await requestAzurePA({audio:Buffer.from('wav'),referenceText:'hello',key:'test',region:'eastasia',fetchImpl:async()=>new Response(JSON.stringify(raw))});
 assert.equal(out.assessment_valid,false);assert.equal(out.validation_error,'azure_missing_assessment_fields');assert.deepEqual(out.response,raw);
});
