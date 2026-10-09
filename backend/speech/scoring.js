export const RA_SCORE_VERSION='ra-score-0.1';
export const RS_SCORE_VERSION='rs-score-0.1';
const LABELS=['Disfluent','Limited','Intermediate','Good','Advanced','Highly proficient'];
const UNCERTAIN=new Set(['homophone','low_confidence']);
const EDGE_INSERTION_TAGS=new Set(['filler']);
const count=value=>Number.isFinite(value)&&value>=0?Math.floor(value):null;

export function longestContinuousRun(alignment={},pauses=[]) {
 const spoken=(alignment.ops||[]).filter(op=>op.type!=='omission'&&op.hyp_index!==null&&op.tag!=='filler');
 const breaks=new Set();
 for(const pause of pauses){
  const duration=pause.duration_ms??(pause.end_ms-pause.start_ms);
  if(!Number.isFinite(duration)||duration<500)continue;
  const middle=(pause.start_ms+pause.end_ms)/2;let best=null;
  for(let i=0;i<spoken.length-1;i++){
   const left=spoken[i],right=spoken[i+1];
   if(Number.isFinite(middle)&&Number.isFinite(left.end_ms)&&Number.isFinite(right.start_ms)){
    const distance=Math.abs((left.end_ms+right.start_ms)/2-middle);
    if(!best||distance<best.distance)best={index:i,distance};
   }
  }
  if(best)breaks.add(best.index);
  else{
   const ref=pause.ref_index??pause.ref_span?.[0];
   if(Number.isInteger(ref)){const i=spoken.findIndex(op=>Number.isInteger(op.ref_index)&&op.ref_index+(op.ref_count??1)-1===ref);if(i>=0)breaks.add(i);}
  }
 }
 let longest=0,run=0;
 for(let i=0;i<spoken.length;i++){run+=Math.max(1,count(spoken[i].hyp_count)??1);longest=Math.max(longest,run);if(breaks.has(i))run=0;}
 return longest;
}
function scoreFluency({alignment={},pauses=[],metrics={}}={}){
 const repetitions=(alignment.ops||[]).filter(op=>!UNCERTAIN.has(op.tag)&&(op.tag==='repetition'||op.type==='repetition')).length;
 const D=(count(metrics.hesitation_count)??pauses.filter(p=>p.type==='hesitation').length)+repetitions;
 const L=count(metrics.long_pause_count)??pauses.filter(p=>p.type==='long_pause').length;
 const W=Number.isFinite(metrics.wpm)&&metrics.wpm>=0?metrics.wpm:0;
 const R=longestContinuousRun(alignment,pauses);
 let band;
 if((L>=2&&R<3)||W<40)band=0;
 else if(L>=2||D>=6)band=1;
 else if(L===1||D>=4)band=2;
 else if(D>=2)band=3;
 else if(D===1||W<90)band=4;
 else band=5;
 return {band,label:LABELS[band],evidence:{D,L,W,R}};
}
// Score Guide p.8: a zero Content score earns no score points and stops further trait scoring.
function contentZeroFluency(fluency){return {band:null,label:null,status:'not_scored',reason:'content_zero',evidence:fluency.evidence};}
export function scoreRA({alignment={},pauses=[],metrics={}}={}){
 const total=Array.isArray(alignment.reference)?alignment.reference.length:(count(alignment.summary?.ref_count)??0);
 const seen=new Set();let errors=0;
 for(const [index,op]of (alignment.ops||[]).entries()){
  if(UNCERTAIN.has(op.tag)||op.tag==='filler')continue;
  if(['substitution','omission'].includes(op.type)){
   const key=Number.isInteger(op.ref_index)?`ref:${op.ref_index}`:`unknown:${index}`;
   if(!seen.has(key)){seen.add(key);errors++;}
  }else if(['insertion','repetition'].includes(op.type))errors++;
 }
 const correct=Math.max(0,total-errors),ratio=total?correct/total:0;
 const fluency=scoreFluency({alignment,pauses,metrics});
 return {score_version:RA_SCORE_VERSION,content:{correct,total,errors,ratio},
  fluency:ratio===0?contentZeroFluency(fluency):fluency,pronunciation:{status:'not_assessed'},
  total:ratio===0?10:Math.round(10+80*(.5*ratio+.5*fluency.band/5))};
}
export function scoreRS({alignment={},pauses=[],metrics={}}={}){
 const total=Array.isArray(alignment.reference)?alignment.reference.length:(count(alignment.summary?.ref_count)??0);
 const ops=alignment.ops||[];
 const credibleMatch=op=>(op.type==='match'||op.tag==='homophone')&&op.tag!=='low_confidence'&&Number.isInteger(op.ref_index);
 const uncertain=new Set(ops.filter(op=>op.tag==='low_confidence'&&Number.isInteger(op.ref_index)).map(op=>op.ref_index)).size;
 const firstMatch=ops.findIndex(credibleMatch);
 const lastMatch=ops.findLastIndex(credibleMatch);
 const matched=new Set();
 let last=-1,middleInsertion=false;
 for(const op of ops){
  const index=ops.indexOf(op);
  if(op.type==='insertion'&&op.hyp_index!==null&&!EDGE_INSERTION_TAGS.has(op.tag)
   &&firstMatch>=0&&lastMatch>=0&&index>firstMatch&&index<lastMatch)middleInsertion=true;
  if(op.tag==='filler')continue;
  if(!credibleMatch(op))continue;
  if(op.ref_index<=last)continue;
  matched.add(op.ref_index);last=op.ref_index;
 }
 const correct=matched.size,ratio=total?correct/total:0;
 let band=0;
 if(total&&correct===total&&!middleInsertion&&!uncertain)band=3;
 else if(ratio>=.5)band=2;
 else if(correct>0)band=1;
 const fluency=scoreFluency({alignment,pauses,metrics});
 const pending=uncertain&&correct===0,zero=band===0&&!pending;
 return {score_version:RS_SCORE_VERSION,content:{band:pending?null:band,matched:correct,total,ratio,...(uncertain?{uncertain}: {})},fluency:zero?contentZeroFluency(fluency):fluency,pronunciation:{status:'not_assessed'},
  total:pending?null:zero?10:Math.round(10+80*(.5*(band/3)+.5*fluency.band/5))};
}
export function scoreToPracticeScores(score){
 const content=score?.score_version===RS_SCORE_VERSION
  ? score.content?.band===null?null:Math.round(10+80*((score.content?.band??0)/3))
  : Math.round(10+80*(score.content?.ratio??0));
 return {overall:score.total,content,fluency:score.fluency.band===null?null:Math.round(10+80*score.fluency.band/5),pronunciation:null};
}
