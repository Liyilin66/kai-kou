export const RA_SCORE_VERSION='ra-score-0.1';
const LABELS=['Disfluent','Limited','Intermediate','Good','Advanced','Highly proficient'];
const UNCERTAIN=new Set(['homophone','low_confidence']);
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
export function scoreRA({alignment={},pauses=[],metrics={}}={}){
 const total=Array.isArray(alignment.reference)?alignment.reference.length:(count(alignment.summary?.ref_count)??0);
 const seen=new Set();let errors=0,repetitions=0;
 for(const [index,op]of (alignment.ops||[]).entries()){
  if(UNCERTAIN.has(op.tag)||op.tag==='filler')continue;
  if(op.tag==='repetition'||op.type==='repetition')repetitions++;
  if(['substitution','omission'].includes(op.type)){
   const key=Number.isInteger(op.ref_index)?`ref:${op.ref_index}`:`unknown:${index}`;
   if(!seen.has(key)){seen.add(key);errors++;}
  }else if(['insertion','repetition'].includes(op.type))errors++;
 }
 const correct=Math.max(0,total-errors),ratio=total?correct/total:0;
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
 return {score_version:RA_SCORE_VERSION,content:{correct,total,errors,ratio},
  fluency:{band,label:LABELS[band],evidence:{D,L,W,R}},pronunciation:{status:'not_assessed'},
  total:Math.round(10+80*(.5*ratio+.5*band/5))};
}
export function scoreToPracticeScores(score){
 return {overall:score.total,content:Math.round(10+80*score.content.ratio),fluency:Math.round(10+80*score.fluency.band/5),pronunciation:null};
}
