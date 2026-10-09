import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { alignWords, normalizeTokens } from '../backend/speech/align.js';
import { labelIndex } from './eval-speech.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export const ACCURACY_THRESHOLD=60;
export const PAUSE_GAP_MS=500;

// REST PA is limited to 30s. Split long files at a canonical word boundary,
// preserving all audio and matching reference substrings; avoid known test errors.
export function planAzureSegments(sample) {
 const text=sample.reference_text,entry=sample.hypotheses.groq_whisper,duration=entry.duration_ms;
 if(!Number.isFinite(duration)||duration<=0||duration>60000)throw new Error('Invalid spike audio duration');
 const full=normalizeTokens(text);
 if(duration<=30000)return [{start_ms:0,end_ms:duration,ref_start:0,reference_text:text}];
 const alignment=alignWords(text,entry.words??entry.text);
 const known=(sample.labels.errors||[]).map(label=>labelIndex(text,label));
 const candidates=[];
 for(const match of text.matchAll(/\S+/g)){
  if(!match.index)continue;
  const before=normalizeTokens(text.slice(0,match.index)),after=normalizeTokens(text.slice(match.index)),index=before.length;
  if(before.length+after.length!==full.length||before.at(-1)?.norm!==full[index-1]?.norm||after[0]?.norm!==full[index]?.norm)continue;
  if(known.some(i=>Math.abs(i-index)<=2))continue;
  const left=[...alignment.ops].reverse().find(op=>op.ref_index<index&&Number.isFinite(op.end_ms));
  const right=alignment.ops.find(op=>op.ref_index>=index&&Number.isFinite(op.start_ms));
  if(!left||!right)continue;
  const time=(left.end_ms+right.start_ms)/2;
  if(time<=0||time>29500||duration-time>29500)continue;
  candidates.push({char:match.index,index,time});
 }
 candidates.sort((a,b)=>Math.abs(a.time-duration/2)-Math.abs(b.time-duration/2));
 const split=candidates[0];if(!split)throw new Error(`No safe REST split: ${sample.id}`);
 return [{start_ms:0,end_ms:split.time,ref_start:0,reference_text:text.slice(0,split.char).trim()},
  {start_ms:split.time,end_ms:duration,ref_start:split.index,reference_text:text.slice(split.char).trim()}];
}
export function validAzureResponse(data) {
 const best=data?.NBest?.[0],score=best?.PronunciationAssessment??best;
 return data?.RecognitionStatus==='Success' && Array.isArray(best?.Words) && best.Words.length>0
  && ['AccuracyScore','FluencyScore','CompletenessScore'].every(key=>Number.isFinite(score?.[key]))
  && best.Words.some(word=>typeof (word.PronunciationAssessment??word).ErrorType==='string');
}
export async function requestAzurePA({audio,referenceText,key,region,fetchImpl=fetch}){
 if(!key||!region||!/^[-a-z0-9]+$/.test(region))throw new Error('Missing or invalid Azure configuration');
 const parameters={ReferenceText:referenceText,GradingSystem:'HundredMark',Granularity:'Phoneme',Dimension:'Comprehensive',EnableMiscue:'True',EnableProsodyAssessment:'True'};
 const started=performance.now();
 const response=await fetchImpl(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`,{
  method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000',
   'Pronunciation-Assessment':Buffer.from(JSON.stringify(parameters)).toString('base64'),Accept:'application/json'},body:audio,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`azure_http_${response.status}`);
 const data=await response.json();
 const valid=validAzureResponse(data);
 return {response:data,assessment_valid:valid,...(!valid?{validation_error:'azure_missing_assessment_fields'}:{}),latency_ms:performance.now()-started};
}
const assessment=word=>word.PronunciationAssessment??word;
const time=word=>({start_ms:Number(word.Offset||0)/10000,end_ms:(Number(word.Offset||0)+Number(word.Duration||0))/10000});
export function mapAzureSample(sample,cache){
 const refs=new Map(),insertions=[],pauses=[];
 for(const chunk of cache.segments||[]){
  if(!validAzureResponse(chunk.response))continue;
  const words=chunk.response.NBest[0].Words;
  const tokenRows=[];let prefix='',previous=[];
  for(const word of words){prefix+=(prefix?' ':'')+word.Word;const tokens=normalizeTokens(prefix);let first=0;
   while(first<previous.length&&first<tokens.length&&previous[first].norm===tokens[first].norm)first++;
   for(let i=first;i<tokens.length;i++)(tokenRows[i]??=[]).push(word);previous=tokens;}
  const alignment=alignWords(chunk.reference_text,words.map(w=>({text:w.Word,...time(w)})));
  for(const [i,op]of alignment.ops.entries()){
   const rows=Array.from({length:op.hyp_count??1},(_,n)=>tokenRows[(op.hyp_index??-100)+n]||[]).flat();
   if(op.ref_index!==null){for(let n=0;n<(op.ref_count??1);n++){const index=chunk.ref_start+op.ref_index+n;refs.set(index,[...(refs.get(index)||[]),...rows]);}if(rows.some(w=>assessment(w).ErrorType==='Insertion'))insertions.push({ref_index:chunk.ref_start+op.ref_index,words:rows.map(w=>w.Word)});}
   else if(rows.some(w=>assessment(w).ErrorType==='Insertion')){
    const anchor=alignment.ops.slice(i+1).find(o=>o.ref_index!==null)?.ref_index??alignment.ops.slice(0,i).reverse().find(o=>o.ref_index!==null)?.ref_index;
    if(Number.isInteger(anchor))insertions.push({ref_index:chunk.ref_start+anchor,words:rows.map(w=>w.Word)});
   }
  }
  // Observable gaps only, not the browser's energy features. Chunk boundaries
  // are excluded because splitting can create artificial onset/offset silence.
  const spoken=words.filter(w=>assessment(w).ErrorType!=='Omission'&&Number(w.Duration)>0);
  for(let i=1;i<spoken.length;i++){const gap=time(spoken[i]).start_ms-time(spoken[i-1]).end_ms;
   if(gap>=PAUSE_GAP_MS){const op=alignment.ops.find(o=>o.start_ms===time(spoken[i]).start_ms&&o.ref_index!==null);
    if(op)pauses.push({ref_index:chunk.ref_start+op.ref_index,gap_ms:gap});}}
 }
 const at=index=>refs.get(index)||[];
 const pronunciation=index=>at(index).some(w=>assessment(w).ErrorType==='Mispronunciation'||
  (assessment(w).ErrorType!=='Omission'&&assessment(w).ErrorType!=='Insertion'&&Number.isFinite(assessment(w).AccuracyScore)&&assessment(w).AccuracyScore<ACCURACY_THRESHOLD));
 const anyError=index=>pronunciation(index)||at(index).some(w=>['Omission','Insertion'].includes(assessment(w).ErrorType))||insertions.some(p=>p.ref_index===index);
 const available=index=>(cache.segments||[]).some(chunk=>validAzureResponse(chunk.response)&&index>=chunk.ref_start&&index<chunk.ref_start+normalizeTokens(chunk.reference_text).length);
 return {at,pronunciation,anyError,insertions,pauses,available};
}
export function evaluateAzureCaches(manifest,caches,humanLabels){
 const real={positive_count:0,negative_count:0,hits:0,false_positives:0,missed:[],false_positive_positions:[],unavailable_positives:[],unavailable_negatives:[]};
 const constructed={omission:{hit:0,total:0,unavailable:0},substitution:{hit:0,total:0,unavailable:0},repetition:{hit:0,total:0,unavailable:0},pause:{hit:0,total:0,unavailable:0}};
 const perSample=[];
 for(const sample of manifest){const cache=caches[sample.id];if(!cache)continue;const mapped=mapAzureSample(sample,cache);const events=[];
  if(sample.source==='constructed')for(const label of sample.labels.errors){const index=labelIndex(sample.reference_text,label);let hit=false,type=label.type;
   if(type==='substitution')hit=mapped.pronunciation(index);
   else if(type==='omission')hit=mapped.at(index).some(w=>assessment(w).ErrorType==='Omission');
   else if(type==='repetition')hit=mapped.insertions.some(p=>Math.abs(p.ref_index-index)<=1);
   else if(['hesitation','long_pause'].includes(type)){type='pause';hit=mapped.pauses.some(p=>Math.abs(p.ref_index-index)<=1)||mapped.at(index).some(w=>assessment(w).ErrorType==='UnexpectedBreak');}
   if(constructed[type]){constructed[type].total++;if(!mapped.available(index))constructed[type].unavailable++;if(hit)constructed[type].hit++;events.push({type,word:label.word,ref_index:index,hit,available:mapped.available(index),azure:mapped.at(index).map(w=>({word:w.Word,score:assessment(w).AccuracyScore,error:assessment(w).ErrorType}))});}}
  if(sample.source==='real')for(const label of humanLabels.items.filter(x=>x.sample_id===sample.id&&['wrong','correct'].includes(x.choice))){
   const flagged=mapped.anyError(label.ref_index);if(label.choice==='wrong'){real.positive_count++;if(!mapped.available(label.ref_index)){real.unavailable_positives.push(label.id);continue;}if(flagged)real.hits++;else real.missed.push(label.id);}
   else{real.negative_count++;if(!mapped.available(label.ref_index)){real.unavailable_negatives.push(label.id);continue;}if(flagged){real.false_positives++;real.false_positive_positions.push(label.id);}}}
  perSample.push({id:sample.id,success:cache.segments.every(s=>validAzureResponse(s.response)),latency_ms:cache.latency_ms,http_requests:cache.segments.length,events});
 }
 const latencies=perSample.map(x=>x.latency_ms).sort((a,b)=>a-b),p90=latencies[Math.ceil(latencies.length*.9)-1]??null;
 const requests=Object.values(caches).flatMap(c=>c.segments),failed=requests.filter(s=>!validAzureResponse(s.response)).length;
 real.evaluable_positive_count=real.positive_count-real.unavailable_positives.length;real.evaluable_negative_count=real.negative_count-real.unavailable_negatives.length;
 const passed=constructed.substitution.hit>=3&&real.hits>5&&real.false_positives<=5&&real.unavailable_positives.length===0&&real.unavailable_negatives.length===0&&perSample.length===12&&failed===0&&p90<=6000;
 const httpTimes=requests.map(s=>s.latency_ms).filter(Number.isFinite).sort((a,b)=>a-b);
 return {http_latency:{p50_ms:httpTimes[Math.ceil(httpTimes.length*.5)-1],p90_ms:httpTimes[Math.ceil(httpTimes.length*.9)-1],min_ms:httpTimes[0],max_ms:httpTimes.at(-1)},generated_at:new Date().toISOString(),accuracy_threshold:ACCURACY_THRESHOLD,pause_gap_ms:PAUSE_GAP_MS,real,constructed,
  sample_tasks:perSample.length,http_requests:requests.length,failed_requests:failed,latency:{p50_ms:latencies[Math.ceil(latencies.length*.5)-1],p90_ms:p90,min_ms:latencies[0],max_ms:latencies.at(-1)},passed,per_sample:perSample};
}
export async function main(args=process.argv.slice(2)){
 const {default:dotenv}=await import('dotenv');dotenv.config({path:path.join(root,'.env.local'),quiet:true});
 const manifest=JSON.parse(await fs.readFile(path.join(root,'eval/speech/manifest.json'),'utf8'));
 const human=JSON.parse(await fs.readFile(path.join(root,'eval/speech/labels/user-listening-2026-10-08.json'),'utf8'));
 const directory=path.join(root,'eval/speech/cache'),caches={};await fs.mkdir(directory,{recursive:true});
 const live=args.includes('--live');const batch=new Date().toISOString();
 for(const sample of manifest){
  const target=path.join(directory,`${sample.id}.azure_pa.json`);
  if(!live){const cache=JSON.parse(await fs.readFile(target,'utf8'));cache.segments=cache.segments.map(s=>({...s,assessment_valid:validAzureResponse(s.response),...(!validAzureResponse(s.response)&&s.response?{validation_error:'azure_missing_assessment_fields'}:{})}));cache.success=cache.segments.every(s=>s.assessment_valid);caches[sample.id]=cache;await fs.writeFile(target,JSON.stringify(cache,null,2));continue;}
  const plans=planAzureSegments(sample),audioPath=path.join(root,'eval/speech/audio',sample.audio.local_file);
  const chunks=plans.map((segment,i)=>{const file=path.join(directory,`${sample.id}.azure-pa-${i}.wav`);
   execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(segment.start_ms/1000),'-i',audioPath,'-t',String((segment.end_ms-segment.start_ms)/1000),'-ac','1','-ar','16000','-c:a','pcm_s16le',file]);return {...segment,file};});
  const cache={sample_id:sample.id,batch,region:process.env.AZURE_SPEECH_REGION,mode:'scripted-rest-segmented',audio_sha256:createHash('sha256').update(await fs.readFile(audioPath)).digest('hex'),segments:[]};
  const started=performance.now();
  for(const chunk of chunks){try{const response=await requestAzurePA({audio:await fs.readFile(chunk.file),referenceText:chunk.reference_text,key:process.env.AZURE_SPEECH_KEY,region:process.env.AZURE_SPEECH_REGION});cache.segments.push({...chunk,file:undefined,...response});}
   catch(error){cache.segments.push({...chunk,file:undefined,error:/^azure_/.test(error.message)?error.message:error.name});}}
  cache.latency_ms=performance.now()-started;cache.success=cache.segments.every(s=>validAzureResponse(s.response));caches[sample.id]=cache;
  await fs.writeFile(target,JSON.stringify(cache,null,2));console.log(`${sample.id}: ${cache.success?'success':'failed'}, ${chunks.length} HTTP request(s), ${Math.round(cache.latency_ms)}ms`);
 }
 const report=evaluateAzureCaches(manifest,caches,human);report.batch_ids=[...new Set(Object.values(caches).map(c=>c.batch))];
 await fs.mkdir(path.join(root,'output/eval'),{recursive:true});await fs.writeFile(path.join(root,'output/eval/azure-pa-2026-10-09.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,per_sample:undefined},null,2));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
