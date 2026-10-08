import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateManifest, validateManifest, matchErrors, labelIndex, predictedErrors, compareManifest, markdownReport, main } from '../../scripts/eval-speech.js';

function sample(overrides = {}) {
  return { id: 'sample-1', task_type: 'RA', question_id: 'RA_024', reference_text: 'the boat sailed',
    source: 'constructed', script_id: 'omit-boat', speaker_id: 'spk01', device: 'test', split: 'dev', consent: true,
    audio: { local_file: null, storage_path: null }, hypotheses: { browser_asr: { text: 'the sailed' } },
    old_scores: {}, labels: { status: 'labeled', errors: [{ type: 'omission', word: 'boat', occurrence: 1 }], labeled_by: 'test', notes: '' },
    ...overrides };
}

test('evaluates labeled omissions and excludes unlabeled alignment from metrics', () => {
  const report = evaluateManifest([sample(), sample({ id: 'unlabeled', labels: { status: 'unlabeled', errors: [], labeled_by: '', notes: '' } })]);
  assert.equal(report.labeled_count, 1);
  assert.equal(report.unlabeled_count, 1);
  assert.deepEqual(report.metrics.find((row) => row.type === 'omission'), { type: 'omission', tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 });
  assert.equal(report.samples[1].alignment.summary.omitted, 1);
});

test('browser transcription cannot detect pauses; labeled pauses are false negatives', () => {
  const labels = { status: 'labeled', errors: [{ type: 'long_pause', word: 'boat', occurrence: 1 }, { type: 'hesitation', word: 'sailed', occurrence: 1 }], labeled_by: 'test', notes: '' };
  const report = evaluateManifest([sample({ labels, hypotheses: { browser_asr: { text: 'the boat sailed' } } })]);
  for (const type of ['long_pause', 'hesitation']) {
    assert.equal(report.metrics.find((row) => row.type === type).recall, 0);
  }
});

test('false alarms counted on labeled error-free samples only', () => {
  const report = evaluateManifest([sample({ labels: { status: 'labeled', errors: [], labeled_by: 'test', notes: '' } })]);
  assert.deepEqual(report.no_error_samples, { count: 1, false_positives: 1 });
});

test('one-to-one matching maximizes credit without double counting tolerant positions', () => {
  const metrics = matchErrors([{ type: 'repetition', ref_index: 1 }, { type: 'repetition', ref_index: 0 }, { type: 'repetition', ref_index: 0 }],
    [{ type: 'repetition', ref_index: 0 }, { type: 'repetition', ref_index: 2 }]);
  assert.deepEqual(metrics.find((row) => row.type === 'repetition'), { type: 'repetition', tp: 2, fp: 1, fn: 0 });
  const exact = matchErrors([{ type: 'omission', ref_index: 1 }], [{ type: 'omission', ref_index: 0 }]);
  assert.deepEqual(exact.find((row) => row.type === 'omission'), { type: 'omission', tp: 0, fp: 1, fn: 1 });
});

test('word occurrence locates repeated reference words', () => {
  assert.equal(labelIndex('the boat and the ship', { word: 'the', occurrence: 2 }), 3);
});

test('validates the whole manifest before filtering, including speaker split leakage', () => {
  assert.throws(() => evaluateManifest([sample(), sample({ id: 'sample-2', split: 'test' })], { split: 'dev' }), /sample-2.*split.*both dev and test/);
});

test('manifest errors name sample and invalid field', () => {
  for (const [overrides, pattern] of [
    [{ id: 'bad', reference_text: null }, /bad.*reference_text/],
    [{ hypotheses: { browser_asr: { text: 42 } } }, /hypotheses.browser_asr.text/],
    [{ consent: false, source: 'real' }, /consent/],
    [{ old_scores: { overall: '55' } }, /old_scores.overall/],
    [{ labels: { status: 'labeled', errors: [{ type: 'omission', word: 'missing', occurrence: 1 }], labeled_by: '', notes: '' } }, /labels.errors\[0\].word/],
  ]) assert.throws(() => validateManifest([sample(overrides)]), pattern);
  assert.throws(() => validateManifest([sample(), sample()]), /duplicate sample id/);
});

test('filters by split and accepts an empty recognized transcript', () => {
  const report = evaluateManifest([sample({ hypotheses: { browser_asr: { text: '' } } }), sample({ id: 'test-sample', speaker_id: 'spk02', split: 'test' })], { split: 'dev' });
  assert.equal(report.sample_count, 1);
  assert.equal(report.samples[0].alignment.summary.omitted, 3);
});

test('CLI rejects unsupported options without reading or writing data', async () => {
  await assert.rejects(main(['--split']), /missing value/);
  await assert.rejects(main(['--unknown', 'value']), /Unknown option/);
});

test('homophone substitutions do not become predicted user errors',()=>{
 const ops=[{type:'substitution',tag:'homophone',ref_index:0,hyp_index:0,ref_text:'sea',hyp_text:'see'}];
 assert.deepEqual(predictedErrors({ops}),[]);
});

test('timed hypothesis uses PCM silences while browser baseline cannot detect pauses',()=>{
 const entry={text:'the boat sailed',words:[{text:'the',start_ms:0,end_ms:400},{text:'boat',start_ms:400,end_ms:1400},{text:'sailed',start_ms:1400,end_ms:1800}],silences:[{start_ms:400,end_ms:1200}],speech_onset_ms:0,speech_offset_ms:1800,duration_ms:1800};
 const labels={status:'labeled',errors:[{type:'hesitation',word:'boat',occurrence:1}],labeled_by:'test',notes:''};
 const data=sample({hypotheses:{browser_asr:{text:entry.text},groq_whisper:entry},labels});
 const acoustic=evaluateManifest([data],{hypothesis:'groq_whisper'});const browser=evaluateManifest([data]);
 assert.equal(acoustic.metrics.find(m=>m.type==='hesitation').tp,1);assert.equal(browser.metrics.find(m=>m.type==='hesitation').fn,1);
 assert.equal(acoustic.samples[0].features.pauses[0].type,'hesitation');
});
test('comparison uses the same labeled samples and excludes unlabeled samples',()=>{
 const data=sample({hypotheses:{browser_asr:{text:'the sailed'},groq_whisper:{text:'the boat sailed'}}});
 const unlabeled={...data,id:'unlabeled',labels:{status:'unlabeled',errors:[],labeled_by:'',notes:''}};
 const report=compareManifest([data,unlabeled]);assert.equal(report.sample_count,2);assert.equal(report.labeled_count,1);
 assert.deepEqual(report.reports.map(r=>r.samples.map(s=>s.id)),[['sample-1','unlabeled'],['sample-1','unlabeled']]);
 assert.equal(report.reports[0].metrics.find(m=>m.type==='omission').tp,1);assert.equal(report.reports[1].metrics.find(m=>m.type==='omission').fn,1);
 assert.match(markdownReport(report),/browser_asr Precision.*groq_whisper Precision/);
 assert.throws(()=>compareManifest([sample()]),/groq_whisper.*missing/);
});
test('invalid provider timestamps identify sample and field',()=>{
 const entry={text:'boat',words:[{text:'boat',start_ms:500,end_ms:100}],silences:[],speech_onset_ms:0,speech_offset_ms:1000};
 assert.throws(()=>validateManifest([sample({hypotheses:{groq_whisper:entry}})],'groq_whisper'),/words\[0\].*end/);
});
