import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {importPracticeLogs,parseArgs} from '../../scripts/eval-import-practice-log.js';

const log={id:407,user_id:'owner',task_type:'RA',question_id:'RA_024',transcript:'The sea tree began',score_json:{questionSnapshot:{content:'The sea trade began'},audio:{bucket:'practice-audio',path:'ra/owner/sample.webm'},scores:{content:55,overall:53}}};
async function fixture(t,rows=[log],samples=[],analyses=[]){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pte-import-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(samples));await fs.writeFile(path.join(dir,'scripts.json'),JSON.stringify([{id:'normal',question_id:'RA_024',errors:[]}]));
 let downloads=0;
 const client={from(table){assert.ok(['practice_logs','speech_analyses'].includes(table));const q={select(){return q},eq(){return q},order(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:analyses[0]||null,error:null})},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q},storage:{from(bucket){assert.equal(bucket,'practice-audio');return{async download(){downloads++;return{data:new Blob(['audio']),error:null}}}}}};
 return{dir,client,downloads:()=>downloads};
}
test('CLI requires identified owner or explicit consent',()=>{assert.throws(()=>parseArgs(['--log-id','407']),/user-id|consent/);assert.throws(()=>parseArgs(['--latest','5','--consent']),/user-id/);assert.equal(parseArgs(['--log-id','407','--user-id','owner']).logId,'407');});
test('foreign records are rejected before private audio download',async t=>{const f=await fixture(t);await assert.rejects(importPracticeLogs(f.client,{logId:'407',userId:'someone-else',split:'dev'},f.dir),/Consent/);assert.equal(f.downloads(),0);assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json'))),[]);});
test('own record imports audio and scores, then updates without duplicate',async t=>{const f=await fixture(t);const options={logId:'407',userId:'owner',split:'dev',device:'iphone-chrome',speaker:'spk01'};const result=await importPracticeLogs(f.client,options,f.dir);assert.equal(result[0].id,'ra-real-0001');let samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples[0].labels.status,'unlabeled');assert.equal(samples[0].reference_text,'The sea trade began');assert.equal(samples[0].old_scores.overall,53);assert.equal((await fs.readFile(path.join(f.dir,'audio','ra-real-0001.webm'))).toString(),'audio');await importPracticeLogs(f.client,options,f.dir);samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples.length,1);});
test('script import transfers intended labels only to matching question',async t=>{const f=await fixture(t);await importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev',device:'iphone',script:'normal'},f.dir);const samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples[0].source,'constructed');assert.equal(samples[0].labels.status,'labeled');assert.deepEqual(samples[0].labels.errors,[]);});
test('speaker cannot be added to both development and test',async t=>{const f=await fixture(t,[log],[{id:'existing',speaker_id:'spk01',split:'test'}]);await assert.rejects(importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev',speaker:'spk01'},f.dir),/another split/);assert.equal(f.downloads(),0);});
test('batch consent is checked before any audio download',async t=>{const f=await fixture(t,[log,{...log,id:408,user_id:'other'}]);await assert.rejects(importPracticeLogs(f.client,{latest:'2',userId:'owner',split:'dev'},f.dir),/Consent/);assert.equal(f.downloads(),0);});
test('explicit consent permits a different record owner',async t=>{const f=await fixture(t);await importPracticeLogs(f.client,{logId:'407',userId:'other',consent:true,split:'dev',device:'unknown'},f.dir);assert.equal(f.downloads(),1);});
test('one script cannot label a batch of latest recordings',()=>{
 assert.throws(()=>parseArgs(['--latest','2','--user-id','owner','--script','normal']),/script.*latest|latest.*script/);
 assert.equal(parseArgs(['--latest','1','--user-id','owner','--script','normal']).latest,'1');
});
test('constructed IDs have a separate sequence and reimport preserves it',async t=>{
 const f=await fixture(t,[{...log,id:408}],[{id:'ra-real-0001',source:'real',speaker_id:'spk01',split:'dev',hypotheses:{browser_asr:{practice_log_id:'407'}}}]);
 const options={logId:'408',userId:'owner',script:'normal',split:'dev',device:'iphone',speaker:'spk01'};
 const first=await importPracticeLogs(f.client,options,f.dir);assert.equal(first[0].id,'ra-con-0001');
 await importPracticeLogs(f.client,options,f.dir);
 const samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples.length,2);assert.equal(samples[0].id,'ra-real-0001');assert.equal(samples[1].id,'ra-con-0001');
});
test('script import of the same log preserves the original real sample',async t=>{
 const f=await fixture(t);
 const options={logId:'407',userId:'owner',split:'dev',device:'iphone',speaker:'spk01'};
 await importPracticeLogs(f.client,options,f.dir);
 const original=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')))[0];
 await importPracticeLogs(f.client,{...options,script:'normal'},f.dir);
 const samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));
 assert.equal(samples.length,2);assert.deepEqual(samples[0],original);assert.equal(samples[1].id,'ra-con-0001');
});
test('diagnosis import preserves browser and Whisper hypotheses with stored timings without retranscription',async t=>{
 const diagnosisLog={...log,transcript:'Whisper words',score_json:{...log.score_json,analysis_id:'analysis-1',metrics:{completeness:0.8}}};
 const words=[{text:'Whisper',start_ms:100,end_ms:400,confidence:null},{text:'words',start_ms:400,end_ms:900,confidence:null}];
 const analysis={id:'analysis-1',user_id:'owner',question_id:'RA_024',audio_path:log.score_json.audio.path,status:'done',reference_text:'The sea trade began',client_transcript:'Browser words',transcript:'Whisper words',aligned:{words,hypothesis:[{text:'wrong normalized fallback'}]},client_silences:[{start_ms:200,end_ms:500}],metrics:{speech_onset_ms:100,speech_offset_ms:900,duration_ms:1000},model:'whisper-large-v3',rules_version:'ra-diag-0.1',legacy_score:{scores:{pronunciation:50,fluency:60,content:70},overall:60}};
 const f=await fixture(t,[diagnosisLog],[],[analysis]);await importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev',device:'iphone'},f.dir);
 const sample=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')))[0];
 assert.equal(sample.hypotheses.browser_asr.text,'Browser words');assert.equal(sample.hypotheses.groq_whisper.text,'Whisper words');assert.deepEqual(sample.hypotheses.groq_whisper.words,words);assert.deepEqual(sample.hypotheses.groq_whisper.silences,analysis.client_silences);assert.equal(sample.hypotheses.groq_whisper.duration_ms,1000);assert.equal(sample.old_scores.overall,60);
});
test('diagnosis with lost browser transcript refuses to fabricate browser baseline',async t=>{
 const f=await fixture(t,[{...log,score_json:{...log.score_json,analysis_id:'analysis-1'}}],[],[{id:'analysis-1',status:'done',user_id:'owner',question_id:'RA_024',audio_path:log.score_json.audio.path,transcript:'Whisper only',client_transcript:null}]);
 await assert.rejects(importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev'},f.dir),/browser transcript unavailable/);assert.equal(f.downloads(),0);
});
