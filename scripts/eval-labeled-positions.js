import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignWords } from '../backend/speech/align.js';
import { predictedErrors } from './eval-speech.js';
const root = fileURLToPath(new URL('../', import.meta.url));

// Human choices describe whether the word position is wrong, not its error type.
// Evaluate exact positions once each; do not count unlabeled positions as negatives.
export function evaluateLabeledPositions(manifest, exported) {
  if (exported?.version !== 1 || !Array.isArray(exported.items)) throw new Error('Invalid labeling export');
  const samples = new Map(manifest.map(s => [s.id,s]));
  const seen = new Set();
  for (const item of exported.items) {
    if (seen.has(item.id) || item.id !== `${item.sample_id}:${item.ref_index}` || !samples.has(item.sample_id)
      || !Number.isInteger(item.ref_index) || !['wrong','correct','unclear',null].includes(item.choice)) throw new Error('Invalid or duplicate labeling position');
    seen.add(item.id);
  }
  const confirmed = exported.items.filter(i => ['wrong','correct'].includes(i.choice));
  const reports = ['browser_asr','groq_whisper'].map(hypothesis => {
    const counts = {tp:0,fp:0,fn:0,tn:0};
    const positions = [];
    for (const sample of manifest) {
      const selected = confirmed.filter(i => i.sample_id === sample.id);
      if (!selected.length) continue;
      const entry=sample.hypotheses[hypothesis];
      const alignment=alignWords(sample.reference_text,entry.words??entry.text);
      const predicted=predictedErrors(alignment);
      for (const item of selected) {
        const ref=alignment.reference[item.ref_index];if(!ref)throw new Error('Reference position out of bounds');
        const flagged=predicted.some(p=>p.ref_index===item.ref_index);
        const outcome=item.choice==='wrong'?(flagged?'tp':'fn'):(flagged?'fp':'tn');counts[outcome]++;
        positions.push({sample_id:sample.id,ref_index:item.ref_index,word:ref.text,choice:item.choice,flagged,outcome,
          observed:alignment.ops.filter(op=>op.ref_index===item.ref_index).map(op=>op.hyp_text??'（未识别）').join(' ')});
      }
    }
    const {tp,fp,fn,tn}=counts;
    return {hypothesis,...counts,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
      accuracy:positions.length?(tp+tn)/positions.length:null,positions};
  });
  return {generated_at:new Date().toISOString(),candidate_count:exported.items.length,confirmed_count:confirmed.length,
    unclear_count:exported.items.filter(i=>i.choice==='unclear').length,unselected_count:exported.items.filter(i=>i.choice===null).length,
    sample_count:new Set(exported.items.map(i=>i.sample_id)).size,reports};
}
async function main(){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'eval/speech/manifest.json'),'utf8'));
 const labels=JSON.parse(await fs.readFile(process.argv[2]||path.join(root,'eval/speech/labels/user-listening-2026-10-08.json'),'utf8'));
 const report=evaluateLabeledPositions(manifest,labels);const target=path.join(root,'output/eval/labeled-positions-2026-10-08.json');
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,reports:report.reports.map(({positions,...metrics})=>metrics),output:target},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
