import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateFeedbackSamples} from '../../scripts/eval-feedback.js';
import {buildTemplateFeedback} from '../../backend/speech/feedback.js';
const sample=id=>({id,reference_text:'hello world',hypotheses:{groq_whisper:{text:'hello there',words:[{text:'hello',start_ms:0,end_ms:400},{text:'there',start_ms:500,end_ms:1000}],silences:[],speech_onset_ms:0,speech_offset_ms:1000,duration_ms:1000}}});
test('evaluation separates first pass, successful retry and template fallback without counting fallback as model success',async()=>{
 let call=0;const report=await evaluateFeedbackSamples([sample('one'),sample('two'),sample('three')],async input=>({feedback:buildTemplateFeedback(input),meta:{attempts:++call===1?1:2,template:call===3,provider:'test',model:'test'}}));
 assert.equal(report.first_pass_count,1);assert.equal(report.retry_pass_count,1);assert.equal(report.template_count,1);assert.equal(report.first_pass_rate,1/3);assert.equal(report.final_model_pass_rate,2/3);assert.equal(report.gate_passed,false);
});
test('no-evidence deterministic summaries do not inflate model acceptance rates',async()=>{
 const empty=sample('empty');empty.hypotheses.groq_whisper.text='hello world';empty.hypotheses.groq_whisper.words[1].text='world';
 const report=await evaluateFeedbackSamples([empty,sample('eligible')],async input=>({feedback:buildTemplateFeedback(input),meta:{attempts:input.evidence.length?1:0,template:!input.evidence.length,provider:'test',model:'test'}}));
 assert.equal(report.no_evidence_count,1);assert.equal(report.model_eligible_count,1);assert.equal(report.first_pass_rate,1);assert.equal(report.gate_passed,false);assert.equal(report.template_identical_rate,1);
});
test('invalid feedback or no eligible samples cannot pass evaluation',async()=>{
 assert.equal((await evaluateFeedbackSamples([])).gate_passed,false);
 const report=await evaluateFeedbackSamples([sample('bad')],async()=>({feedback:{summary:'发音错误',suggestions:[]},meta:{attempts:1,template:false}}));
 assert.equal(report.gate_passed,false);assert.equal(report.first_pass_rate,0);assert.equal(report.results[0].validation.ok,false);
});

test('template action comparison ignores punctuation and counts each suggestion including fallback', async () => {
 const report=await evaluateFeedbackSamples([sample('one')],async input=>{
  const feedback=buildTemplateFeedback(input);
  feedback.suggestions[0].action=feedback.suggestions[0].action.replace(/[，。]/g,'！');
  return {feedback,meta:{attempts:1,template:false}};
 });
 assert.equal(report.template_identical_rate,1);assert.equal(report.template_identical_count,1);assert.equal(report.suggestion_count,1);assert.equal(report.gate_passed,false);
});
test('valid distinct evidence-grounded actions pass the incremental-value gate',async()=>{
 const report=await evaluateFeedbackSamples([sample('one')],async input=>{
  const feedback=buildTemplateFeedback(input);feedback.suggestions[0].action='先回听确认，再把 hello world 连成短语练三遍。';
  return {feedback,meta:{attempts:1,template:false}};
 });
 assert.equal(report.template_identical_rate,0);assert.equal(report.gate_passed,true);
});
test('three rounds run serially and report mean and range with the release decision',async()=>{
 const {evaluateFeedbackRounds}=await import('../../scripts/eval-feedback.js');
 let active=0,calls=0;
 const report=await evaluateFeedbackRounds([sample('one')],async input=>{
  assert.equal(active++,0);calls++;await Promise.resolve();active--;
  const feedback=buildTemplateFeedback(input);feedback.suggestions[0].action='先回听确认，再把 hello world 连成短语练三遍。';
  return {feedback,meta:{attempts:calls===1?2:1,template:false}};
 });
 assert.equal(calls,3);assert.equal(report.metrics.first_pass_rate.mean,2/3);
 assert.equal(report.metrics.first_pass_rate.min,0);assert.equal(report.metrics.first_pass_rate.max,1);assert.equal(report.use_llm,true);
});
test('three-round decision chooses template-only when outputs merely copy templates',async()=>{
 const {evaluateFeedbackRounds}=await import('../../scripts/eval-feedback.js');
 const report=await evaluateFeedbackRounds([sample('one')],async input=>({feedback:buildTemplateFeedback(input),meta:{attempts:1,template:false}}));
 assert.equal(report.metrics.final_model_pass_rate.mean,1);assert.equal(report.metrics.template_identical_rate.mean,1);assert.equal(report.use_llm,false);
});
