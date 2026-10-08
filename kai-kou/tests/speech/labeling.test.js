import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import{execFileSync}from'node:child_process';
import {labelingItems,labelingHTML} from '../../scripts/eval-build-labeling-kit.js';import{applyLabels}from'../../scripts/eval-apply-labels.js';
const sample=()=>({id:'real1',source:'real',reference_text:'hello world',audio:{local_file:'a.webm'},hypotheses:{browser_asr:{text:'hello there'},groq_whisper:{words:[{text:'hello',start_ms:0,end_ms:300},{text:'world',start_ms:400,end_ms:700}]}},labels:{status:'unlabeled',errors:[]}});
const exported=(items,choice)=>({version:1,items:items.map(i=>({id:i.id,sample_id:i.sample_id,ref_index:i.ref_index,choice}))});
test('candidate union preserves browser-only errors and excludes constructed and uncertain samples',()=>{
 const s=sample();assert.equal(labelingItems([s]).length,1);assert.equal(labelingItems([{...s,source:'constructed'}]).length,0);
 const h={...s,reference_text:'their house',hypotheses:{browser_asr:{text:'there house'},groq_whisper:{words:[{text:'their',start_ms:0,end_ms:300},{text:'house',start_ms:400,end_ms:700}]}}};assert.equal(labelingItems([h]).length,0);
});
test('all decisions apply corresponding errors; correct is empty and unclear remains unlabeled',()=>{
 for(const choice of ['wrong','correct','unclear']){const m=[sample()],r=applyLabels(m,exported(labelingItems(m),choice));assert.equal(r[0].labels.status,choice==='unclear'?'unlabeled':'labeled');assert.equal(r[0].labels.errors.length,choice==='wrong'?1:0);assert.equal(r[0].labels.labeled_by,'user-listening');}
});
test('partial and stale exports cannot become a complete label',()=>{
 const m=[sample()];assert.equal(applyLabels(m,{version:1,items:[]})[0].labels.status,'unlabeled');
 const e=exported(labelingItems(m),'wrong');e.items[0].ref_index=99;assert.throws(()=>applyLabels(m,e),/stale/);
});
test('HTML is self contained and escapes reference text',()=>{
 const items=labelingItems([sample()]);items[0].browser='<script>bad</script>';const html=labelingHTML(items);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('src="https://'));assert.ok(html.includes('我读对了（识别错误）'));
});
test('CLI applies a hand-made export to a temporary manifest with backup',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'label-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const m=[sample()];const manifest=path.join(dir,'manifest.json'),labels=path.join(dir,'labels.json');await fs.writeFile(manifest,JSON.stringify(m));await fs.writeFile(labels,JSON.stringify(exported(labelingItems(m),'wrong')));
 execFileSync(process.execPath,['scripts/eval-apply-labels.js',labels,manifest]);const r=JSON.parse(await fs.readFile(manifest));assert.equal(r[0].labels.status,'labeled');assert.equal(r[0].labels.errors[0].word,'world');assert.ok(await fs.stat(manifest+'.bak'));
});
