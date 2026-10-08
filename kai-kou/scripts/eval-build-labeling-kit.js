import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { alignWords, normalizeTokens } from '../backend/speech/align.js';
import { predictedErrors } from './eval-speech.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const uncertain = op => ['homophone', 'low_confidence'].includes(op.tag);
export function labelingItems(manifest) {
  return manifest.filter(s => s.labels?.status === 'unlabeled' && s.source !== 'constructed' && !/mixed-4/.test(s.script_id || ''))
    .flatMap(sample => {
      const browser = sample.hypotheses?.browser_asr, whisper = sample.hypotheses?.groq_whisper;
      if (!browser || !whisper) throw new Error(`Missing paired hypotheses: ${sample.id}`);
      const ba = alignWords(sample.reference_text, browser.words ?? browser.text);
      const wa = alignWords(sample.reference_text, whisper.words ?? whisper.text);
      const ignored = new Set([...ba.ops, ...wa.ops].filter(uncertain).map(op => op.ref_index));
      const errors = [...predictedErrors(wa), ...predictedErrors(ba)];
      const indices = new Set(errors.map(e => e.ref_index));
      for (const ref of wa.reference) {
        const b = ba.ops.find(op => op.ref_index === ref.index), w = wa.ops.find(op => op.ref_index === ref.index);
        if (b && w && b.hyp_text?.toLowerCase() !== w.hyp_text?.toLowerCase() && (b.type !== 'match' || w.type !== 'match')) indices.add(ref.index);
      }
      return [...indices].filter(i => !ignored.has(i)).sort((a,b)=>a-b).map((index, n) => {
        const ref = wa.reference[index];
        if (!ref) throw new Error(`Invalid reference position ${sample.id}:${index}`);
        const op = wa.ops.find(op => op.ref_index === index && Number.isFinite(op.start_ms))
          ?? wa.ops.find(op => op.ref_index > index && Number.isFinite(op.start_ms))
          ?? [...wa.ops].reverse().find(op => Number.isFinite(op.end_ms));
        if (!op) throw new Error(`Missing word timestamps: ${sample.id}:${index}`);
        const error = errors.find(e => e.ref_index === index);
        return { id: `${sample.id}:${index}`, sample_id: sample.id, ref_index: index,
          word: normalizeTokens(ref.text).length === 1 ? ref.text : ref.norm.replace(/^#/, ''), occurrence: wa.reference.slice(0,index+1).filter(r => r.norm === ref.norm).length,
          type: error?.type || 'substitution',
          context: wa.reference.slice(Math.max(0,index-5),index+6).map(r => ({text:r.text,target:r.index===index})),
          browser: heardAt(ba,index),
          whisper: heardAt(wa,index),
          start_ms: Math.max(0,(op.start_ms??op.end_ms)-1000), end_ms: (op.end_ms??op.start_ms)+1000,
          audio_file: sample.audio.local_file, clip: `${sample.id}/${n+1}.m4a` };
      });
    });
}
function heardAt(alignment, index) {
  const ops = alignment.ops.filter(op=>op.ref_index===index).map(op=>op.hyp_text||'（未识别）');
  const extras = predictedErrors(alignment).filter(e=>e.ref_index===index&&['insertion','repetition'].includes(e.type)).map(e=>`[额外: ${e.hyp_text}]`);
  return [...ops,...extras].join(' ');
}
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function labelingHTML(items) {
  const dataset = JSON.stringify(items.map(({audio_file,...item})=>item)).replaceAll('<','\\u003c');
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RA 听音标注</title><style>body{max-width:960px;margin:auto;padding:24px;font:16px system-ui;background:#faf6ed;color:#302820}article{background:white;border:1px solid #ddd;border-radius:12px;padding:16px;margin:14px 0}label{display:inline-block;margin:8px}b{background:#ffe3a6}audio{display:block;max-width:100%;margin:10px 0}button{padding:14px;font:inherit}small{color:#666}</style><h1>听一下，选一个</h1><p>共 ${items.length} 个位置。请先听片段再判断；无需推断发音分。可导出未完成的草稿，但未选完或听不清的样本不会成为完整标注。选择会自动保存在本浏览器。</p><div id="rows">${items.map((item,n)=>`<article><small>${escape(item.sample_id)} · ${n+1}/${items.length}</small><p>${item.context.map(r=>r.target?`<b>${escape(r.text)}</b>`:escape(r.text)).join(' ')}</p><p>浏览器：${escape(item.browser)}<br>Whisper：${escape(item.whisper)}</p><audio controls preload="none" src="${escape(item.clip)}"></audio>${[['wrong','我读错了'],['correct','我读对了（识别错误）'],['unclear','听不清']].map(([v,t])=>`<label><input type="radio" name="${escape(item.id)}" value="${v}">${t}</label>`).join('')}</article>`).join('')}</div><p id="progress"></p><button id="export">导出标注 JSON</button><script>const items=${dataset};const saved=JSON.parse(localStorage.getItem('ra-listening-labels-v1')||'{}');for(const input of document.querySelectorAll('input')){input.checked=saved[input.name]===input.value;input.onchange=()=>{saved[input.name]=input.value;localStorage.setItem('ra-listening-labels-v1',JSON.stringify(saved));progress();};}function progress(){document.querySelector('#progress').textContent='已选择 '+items.filter(i=>saved[i.id]).length+' / '+items.length;}progress();document.querySelector('#export').onclick=()=>{const data={version:1,items:items.map(i=>({id:i.id,sample_id:i.sample_id,ref_index:i.ref_index,choice:saved[i.id]||null}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='labels-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};</script></html>`;
}
export async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root,'eval/speech/manifest.json'),'utf8'));
  const items = labelingItems(manifest), directory=path.join(root,'eval/speech/labeling');
  for (const item of items) {
    const clip=path.join(directory,item.clip);await fs.mkdir(path.dirname(clip),{recursive:true});
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(item.start_ms/1000),'-i',path.join(root,'eval/speech/audio',item.audio_file),'-t',String((item.end_ms-item.start_ms)/1000),'-vn','-c:a','aac',clip]);
  }
  await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'index.html'),labelingHTML(items));
  console.log(JSON.stringify({samples:new Set(items.map(i=>i.sample_id)).size,positions:items.length,page:path.join(directory,'index.html')},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
