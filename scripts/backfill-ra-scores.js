import {isDeepStrictEqual} from 'node:util';
import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath}from'node:url';
import{createClient}from'@supabase/supabase-js';import{extractFeatures}from'../backend/speech/features.js';import{scoreRA}from'../backend/speech/scoring.js';
export function scoreStoredDiagnosis(row){
 if(row.status!=='done')throw new Error('Only done diagnoses can be scored');
 const features=extractFeatures({alignment:row.aligned,referenceText:row.reference_text,silences:row.client_silences||[],...row.metrics});
 return scoreRA({alignment:row.aligned,pauses:features.pauses,metrics:row.metrics});
}
export async function backfillRAScores(client,{apply=false}={}){
 const rows=[];for(let from=0;;from+=500){const r=await client.from('speech_analyses').select('id,user_id,status,question_id,reference_text,aligned,metrics,client_silences').eq('status','done').order('id').range(from,from+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)break;}
 const output=[];
 for(const row of rows){const score=scoreStoredDiagnosis(row);const current=row.metrics?.score;
  const needsUpdate=!isDeepStrictEqual(current,score);
  output.push({id:row.id,question_id:row.question_id,before:current?.total??null,after:score.total,score,changed:needsUpdate});
  if(apply&&needsUpdate){const r=await client.rpc('backfill_ra_score',{p_id:row.id,p_score:score});if(r.error)throw new Error(`Backfill ${row.id}: ${r.error.message}`);}
 }
 return {mode:apply?'apply':'dry-run',records:rows.length,changed:output.filter(x=>x.changed).length,results:output};
}
async function main(){if(process.argv.slice(2).some(x=>x!=='--apply'))throw new Error('Usage: node scripts/backfill-ra-scores.js [--apply]');const{default:dotenv}=await import('dotenv');dotenv.config({path:'.env.local',quiet:true});const client=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const report=await backfillRAScores(client,{apply:process.argv.includes('--apply')});await fs.mkdir('output/eval',{recursive:true});await fs.writeFile(`output/eval/ra-scores-${report.mode}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode,records:report.records,changed:report.changed},null,2));console.table(report.results.map(r=>({id:r.id,question:r.question_id,before:r.before,after:r.after,changed:r.changed})));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
