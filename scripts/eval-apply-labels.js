import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelingItems } from './eval-build-labeling-kit.js';
export function applyLabels(manifest, exported) {
  if(exported?.version!==1||!Array.isArray(exported.items))throw new Error('Unsupported labeling export');
  const candidates=labelingItems(manifest), byId=new Map(candidates.map(i=>[i.id,i])), choices=new Map();
  for(const item of exported.items){
    const target=byId.get(item.id);
    if(!target||target.sample_id!==item.sample_id||target.ref_index!==item.ref_index||choices.has(item.id))throw new Error('Unknown, stale or duplicate labeling position');
    if(![null,'wrong','correct','unclear'].includes(item.choice))throw new Error('Invalid labeling choice');
    choices.set(item.id,item.choice);
  }
  return manifest.map(sample=>{
    const positions=candidates.filter(i=>i.sample_id===sample.id);if(!positions.length)return sample;
    const complete=positions.every(i=>['wrong','correct'].includes(choices.get(i.id)));
    const errors=positions.filter(i=>choices.get(i.id)==='wrong').map(i=>({type:i.type,word:i.word,occurrence:i.occurrence}));
    const notes=positions.filter(i=>!['wrong','correct'].includes(choices.get(i.id))).map(i=>`${i.word} (${i.ref_index}): ${choices.get(i.id)==='unclear'?'听不清':'未选择'}`).join('；');
    return {...sample,labels:{...sample.labels,status:complete?'labeled':'unlabeled',errors,labeled_by:'user-listening',notes}};
  });
}
export async function main(){
 const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/eval-apply-labels.js <labels.json> [manifest.json]');
 const target=process.argv[3]||fileURLToPath(new URL('../eval/speech/manifest.json',import.meta.url));
 const manifest=JSON.parse(await fs.readFile(target,'utf8')),labels=JSON.parse(await fs.readFile(input,'utf8'));
 const result=applyLabels(manifest,labels);await fs.copyFile(target,target+'.bak');await fs.writeFile(target,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({labeled:result.filter(s=>s.labels.status==='labeled').length,backup:target+'.bak'}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
