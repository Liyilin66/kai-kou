import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {importPracticeLogs,parseArgs} from '../../scripts/eval-import-practice-log.js';

const log={id:407,user_id:'owner',task_type:'RA',question_id:'RA_024',transcript:'The sea tree began',score_json:{questionSnapshot:{content:'The sea trade began'},audio:{bucket:'practice-audio',path:'ra/owner/sample.webm'},scores:{content:55,overall:53}}};
async function fixture(t,rows=[log],samples=[]){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pte-import-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(samples));await fs.writeFile(path.join(dir,'scripts.json'),JSON.stringify([{id:'normal',question_id:'RA_024',errors:[]}]));
 let downloads=0;
 const client={from(table){assert.equal(table,'practice_logs');const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return q},storage:{from(bucket){assert.equal(bucket,'practice-audio');return{async download(){downloads++;return{data:new Blob(['audio']),error:null}}}}}};
 return{dir,client,downloads:()=>downloads};
}
test('CLI requires identified owner or explicit consent',()=>{assert.throws(()=>parseArgs(['--log-id','407']),/user-id|consent/);assert.throws(()=>parseArgs(['--latest','5','--consent']),/user-id/);assert.equal(parseArgs(['--log-id','407','--user-id','owner']).logId,'407');});
test('foreign records are rejected before private audio download',async t=>{const f=await fixture(t);await assert.rejects(importPracticeLogs(f.client,{logId:'407',userId:'someone-else',split:'dev'},f.dir),/Consent/);assert.equal(f.downloads(),0);assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json'))),[]);});
test('own record imports audio and scores, then updates without duplicate',async t=>{const f=await fixture(t);const options={logId:'407',userId:'owner',split:'dev',device:'iphone-chrome',speaker:'spk01'};const result=await importPracticeLogs(f.client,options,f.dir);assert.equal(result[0].id,'ra-real-0001');let samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples[0].labels.status,'unlabeled');assert.equal(samples[0].reference_text,'The sea trade began');assert.equal(samples[0].old_scores.overall,53);assert.equal((await fs.readFile(path.join(f.dir,'audio','ra-real-0001.webm'))).toString(),'audio');await importPracticeLogs(f.client,options,f.dir);samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples.length,1);});
test('script import transfers intended labels only to matching question',async t=>{const f=await fixture(t);await importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev',device:'iphone',script:'normal'},f.dir);const samples=JSON.parse(await fs.readFile(path.join(f.dir,'manifest.json')));assert.equal(samples[0].source,'constructed');assert.equal(samples[0].labels.status,'labeled');assert.deepEqual(samples[0].labels.errors,[]);});
test('speaker cannot be added to both development and test',async t=>{const f=await fixture(t,[log],[{id:'existing',speaker_id:'spk01',split:'test'}]);await assert.rejects(importPracticeLogs(f.client,{logId:'407',userId:'owner',split:'dev',speaker:'spk01'},f.dir),/another split/);assert.equal(f.downloads(),0);});
test('batch consent is checked before any audio download',async t=>{const f=await fixture(t,[log,{...log,id:408,user_id:'other'}]);await assert.rejects(importPracticeLogs(f.client,{latest:'2',userId:'owner',split:'dev'},f.dir),/Consent/);assert.equal(f.downloads(),0);});
test('explicit consent permits a different record owner',async t=>{const f=await fixture(t);await importPracticeLogs(f.client,{logId:'407',userId:'other',consent:true,split:'dev',device:'unknown'},f.dir);assert.equal(f.downloads(),1);});
