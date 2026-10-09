import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { alignWords } from '../backend/speech/align.js';
import { labelingHTML } from './eval-build-labeling-kit.js';
const root = fileURLToPath(new URL('../',import.meta.url));
const names={omission:'漏读',substitution:'可能读错或识别不清',insertion:'多读',repetition:'重复',hesitation:'停顿',long_pause:'停顿',pause:'停顿'};

export function mixedExtraItems(manifest, events) {
 const byId=new Map(manifest.map(sample=>[sample.id,sample]));
 return events.map((event,n)=>{
  const sample=byId.get(event.sample_id);if(!sample||sample.source!=='constructed')throw new Error('Unknown constructed sample');
  if(!/^[a-z0-9_-]+$/i.test(sample.id)||path.basename(sample.audio.local_file)!==sample.audio.local_file)throw new Error('Unsafe sample path');
  const whisper=sample.hypotheses.groq_whisper,alignment=alignWords(sample.reference_text,whisper.words??whisper.text);
  const index=event.ref_index;if(!Number.isInteger(index)||!alignment.reference[index])throw new Error('Invalid extra reference position');
  const op=alignment.ops.find(op=>op.ref_index===index&&Number.isFinite(op.start_ms))
   ??alignment.ops.find(op=>op.ref_index>index&&Number.isFinite(op.start_ms))
   ??[...alignment.ops].reverse().find(op=>Number.isFinite(op.end_ms));
  const start=Number.isFinite(event.start_ms)?event.start_ms:(op?.start_ms??op?.end_ms);
  const end=Number.isFinite(event.end_ms)?event.end_ms:(op?.end_ms??op?.start_ms);
  if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('Missing audio anchor for extra');
  const browser=alignWords(sample.reference_text,sample.hypotheses.browser_asr.words??sample.hypotheses.browser_asr.text);
  const heard=a=>a.ops.filter(op=>op.ref_index===index).map(op=>op.hyp_text??'（未识别）').join(' ');
  return {id:`mixed-extra:${sample.id}:${event.type}:${index}:${n}`,sample_id:sample.id,ref_index:index,type:event.type,
   word:alignment.reference[index].text,
   context:alignment.reference.slice(Math.max(0,index-5),index+6).map(ref=>({text:ref.text,target:ref.index===index})),
   browser:heard(browser),whisper:`${heard(alignment)}；系统额外标记：${names[event.type]||event.type}${event.hyp_text ? '；该事件识别到：'+event.hyp_text : ''}`,
   start_ms:Math.max(0,start-1000),end_ms:Math.min(whisper.duration_ms||Infinity,end+1000),
   audio_file:sample.audio.local_file,clip:`${sample.id}/${n+1}.m4a`};
 });
}
export async function buildMixedExtrasKit(manifest, events, directory=path.join(root,'eval/speech/labeling/mixed-extras-2026-10-09')) {
 const items=mixedExtraItems(manifest,events);await fs.mkdir(directory,{recursive:true});
 for(const item of items){const output=path.join(directory,item.clip);await fs.mkdir(path.dirname(output),{recursive:true});
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(item.start_ms/1000),'-i',path.join(root,'eval/speech/audio',item.audio_file),'-t',String((item.end_ms-item.start_ms)/1000),'-vn','-c:a','aac',output]);}
 const html=labelingHTML(items).replace('<h1>听一下，选一个</h1>','<h1>脚本外的额外标记</h1><p>以下都是正式诊断（Whisper + 音频能量）的未匹配预测，尚不是已确认误报。每行独立判断：只听这行注明的错误类型；停顿行判断是否确实有不自然停顿，不能因该词读错就把停顿也判为正确。已匹配脚本内的四类错误不会混入本页。部分行位于脚本位置附近，但预测类型或次数没有匹配；也请按该行注明的类型独立判断。</p>')
  .replaceAll('我读错了','这处确实有问题').replaceAll('我读对了（识别错误）','这处没有问题（系统误报）');
 await fs.writeFile(path.join(directory,'index.html'),html);await fs.writeFile(path.join(directory,'items.json'),JSON.stringify(items,null,2));
 return {positions:items.length,samples:new Set(items.map(x=>x.sample_id)).size,page:path.join(directory,'index.html')};
}

export async function main() {
 const {evaluateMixedManifest}=await import('./eval-mixed-speech.js');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'eval/speech/manifest.json'),'utf8'));
 const report=evaluateMixedManifest(manifest),whisper=report.reports.find(r=>r.hypothesis==='groq_whisper');
 const events=whisper.samples.flatMap(sample=>sample.extra_predictions
  .map(prediction=>({...prediction,sample_id:sample.id})));
 console.log(JSON.stringify(await buildMixedExtrasKit(manifest,events),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
