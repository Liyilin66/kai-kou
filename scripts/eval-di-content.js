// Offline DI content-judge evaluation: transcribe stored DI recordings, judge each transcript
// repeatedly, build a local review page, and score the pre-agreed gates.
// Usage:
//   node scripts/eval-di-content.js [--runs 5]           # transcribe, judge, report, review page
//   node scripts/eval-di-content.js --transcribe-only     # download and transcribe recordings only
//   node scripts/eval-di-content.js --apply-review <export.json>
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { transcribeWithGroqWhisper } from '../backend/speech/providers/groq-whisper.js';
import { judgeDIContent } from '../backend/speech/di-content-judge.js';
import { indexAnswerKey } from '../backend/speech/di-answer-key.js';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(APP_ROOT, 'eval/di');
const KEY_PATH = join(APP_ROOT, 'seeds/di/di-answer-key.json');
const CATALOG_PATH = join(APP_ROOT, 'seeds/di/di-question-catalog.phase1.json');
const REPORT_PATH = join(DATA_DIR, 'report.json');
const REVIEW_TYPES = ['bar', 'line', 'pie', 'map', 'process', 'mixed', 'line', 'process'];

// Whisper outputs phrases like "Thank you." on silent recordings; these are not answers.
export const MIN_TRANSCRIPT_WORDS = 5;
export const wordCount = text => (`${text || ''}`.match(/[\p{L}\p{N}']+/gu) || []).length;
export const GATES = { maxWrongPointsPerImage: 1, identicalShare: 0.8, maxBandSpread: 1, finalPassRate: 0.95, minAgreements: 4 };

// Eight review images covering every chart type, in catalog order, skipping images without a key.
export function selectReviewImages(catalog, keys) {
  const used = [];
  for (const type of REVIEW_TYPES) {
    const question = catalog.questions.find(entry => entry.imageType === type && keys.has(entry.id) && !used.includes(entry.id));
    if (question) used.push(question.id);
  }
  return used;
}

// Deterministic pick so the review set does not change between runs.
export function pickSamples(ids, count, seed = 14) {
  const list = [...ids];
  let state = seed;
  for (let i = list.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const j = state % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

export function summarizeRuns(samples) {
  const runs = samples.flatMap(sample => sample.runs);
  const scored = runs.filter(run => run.status === 'scored');
  const perSample = samples.map(sample => {
    const bands = sample.runs.map(run => run.status === 'scored' ? run.content_band : null);
    const numeric = bands.filter(band => band !== null);
    const allScored = numeric.length === bands.length && bands.length > 0;
    return { id: sample.id, bands, identical: allScored && new Set(numeric).size === 1,
      spread: numeric.length ? Math.max(...numeric) - Math.min(...numeric) : null, allScored };
  });
  const identical = perSample.filter(sample => sample.identical).length;
  const others = perSample.filter(sample => !sample.identical);
  return {
    samples: samples.length, runs: runs.length,
    first_attempt_pass: runs.filter(run => run.status === 'scored' && run.attempts === 1).length,
    final_pass: scored.length,
    final_pass_rate: runs.length ? scored.length / runs.length : 0,
    band_mismatch: scored.filter(run => run.band_mismatch).length,
    identical, identical_share: samples.length ? identical / samples.length : 0,
    others_within_spread: others.every(sample => sample.allScored && sample.spread <= GATES.maxBandSpread),
    per_sample: perSample,
    not_scored_reasons: runs.filter(run => run.status !== 'scored').reduce((counts, run) => ({ ...counts, [run.reason]: (counts[run.reason] || 0) + 1 }), {})
  };
}

export function evaluateGates({ summary, review }) {
  const images = Object.entries(review?.images || {}).map(([id, marks]) => ({ id,
    wrong: Object.entries(marks).filter(([key, value]) => /^P\d+$/.test(key) && value === 'wrong').length,
    unclear: Object.entries(marks).filter(([key, value]) => /^P\d+$/.test(key) && value === 'unclear').length }));
  const agreements = Object.values(review?.judgements || {}).filter(entry => entry?.verdict === 'agree').length;
  const judged = Object.values(review?.judgements || {}).filter(entry => entry?.verdict).length;
  const keyGate = images.length > 0 && images.every(image => image.wrong <= GATES.maxWrongPointsPerImage);
  const stabilityGate = summary.identical_share >= GATES.identicalShare && summary.others_within_spread;
  const passGate = summary.final_pass_rate >= GATES.finalPassRate;
  const agreementGate = agreements >= GATES.minAgreements;
  return { images, agreements, judged, gates: { answer_key: keyGate, stability: stabilityGate, validation: passGate, agreement: agreementGate },
    passed: keyGate && stabilityGate && passGate && agreementGate };
}

const exists = path => access(path).then(() => true, () => false);

async function loadSamples(db) {
  const { data, error } = await db.from('practice_logs').select('id, question_id, created_at, score_json').eq('task_type', 'DI').order('created_at');
  if (error) throw error;
  return data.map(row => ({ row, audio: (typeof row.score_json === 'string' ? JSON.parse(row.score_json) : row.score_json)?.audio }))
    .filter(({ audio }) => audio?.bucket && audio?.path)
    .map(({ row, audio }) => ({ id: `di-log-${row.id}`, question_id: row.question_id, created_at: row.created_at, audio }));
}

async function ensureTranscript(db, sample) {
  const cachePath = join(DATA_DIR, 'cache', `${sample.id}.json`);
  if (await exists(cachePath)) return JSON.parse(await readFile(cachePath, 'utf8'));
  const audioPath = join(DATA_DIR, 'audio', `${sample.id}${extname(sample.audio.path) || '.webm'}`);
  if (!await exists(audioPath)) {
    const { data, error } = await db.storage.from(sample.audio.bucket).download(sample.audio.path);
    if (error) throw new Error(`download ${sample.id}: ${error.message}`);
    await writeFile(audioPath, Buffer.from(await data.arrayBuffer()));
  }
  const audio = await readFile(audioPath);
  const mimeType = `${sample.audio.mimeType || 'audio/webm'}`.split(';')[0];
  const result = await transcribeWithGroqWhisper({ audio, filename: `${sample.id}${extname(audioPath)}`, mimeType });
  const cached = { text: result.text, duration_ms: result.duration_ms, model: result.model, audio_file: audioPath.slice(APP_ROOT.length + 1) };
  await writeFile(cachePath, `${JSON.stringify(cached, null, 2)}\n`);
  return cached;
}

function reviewPage(data) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DI 抽检</title>
<style>body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#f5f3ef;color:#2b2620}main{max-width:1180px;margin:0 auto;padding:20px 16px 80px}h1{font-size:22px}section.card{background:#fff;border:1px solid #e3dccf;border-radius:12px;padding:16px;margin:16px 0}
.pair{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px}@media(max-width:820px){.pair{grid-template-columns:1fr}}img{max-width:100%;border:1px solid #eee;border-radius:8px}
.point{border-top:1px solid #eee;padding:8px 0}.point small{color:#7a6f61}.opts label{margin-right:12px;white-space:nowrap}textarea{width:100%;min-height:44px;box-sizing:border-box}.tag{display:inline-block;font-size:12px;padding:1px 6px;border-radius:6px;background:#efe7da;margin-right:6px}
.covered{color:#1f6f43}.inaccurate{color:#a33}.missed{color:#7a6f61}blockquote{margin:6px 0;padding:8px 10px;background:#faf7f1;border-left:3px solid #c9b48f}#bar{position:fixed;left:0;right:0;bottom:0;background:#2b2620;color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}#bar button{font:inherit;padding:8px 14px;border-radius:8px;border:0;background:#e7b768;cursor:pointer}</style></head>
<body><main><h1>DI 要点表与内容判定抽检</h1><p>A 部分：8 张图，对照图片逐个标记要点“正确 / 有错 / 读不清”，有错请在备注写正确内容。B 部分：5 条回答的判定，选“同意 / 不同意”。选择会自动保存在本浏览器；完成后点底部“导出结果”，把下载的文件路径告诉 Claude。</p>
<h2>A. 要点表（8 张图）</h2><div id="images"></div><h2>B. 内容判定（5 条）</h2><div id="judgements"></div></main>
<div id="bar"><span id="progress"></span><button id="export" type="button">导出结果</button></div>
<script>const DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};
const KEY='di-review-'+DATA.generated_at;let state={images:{},judgements:{}};try{state=JSON.parse(localStorage.getItem(KEY))||state}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{};progress()};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function radios(name,options,current){return options.map(([v,l])=>'<label><input type="radio" name="'+name+'" value="'+v+'"'+(current===v?' checked':'')+'> '+l+'</label>').join('')}
document.getElementById('images').innerHTML=DATA.images.map(img=>{const marks=state.images[img.id]||{};return '<section class="card"><h3>'+img.id+' <span class="tag">'+img.image_type+'</span></h3><div class="pair"><div><img src="'+img.image_url+'" alt="'+img.id+'"></div><div>'+img.points.map(p=>'<div class="point"><b>'+p.id+'</b> <span class="tag">'+p.kind+'</span>'+esc(p.text)+(('value' in p)?'<br><small>value: '+esc(p.value===null?'（读不清，未填）':p.value)+'</small>':'')+'<div class="opts" data-img="'+img.id+'" data-point="'+p.id+'">'+radios(img.id+'-'+p.id,[['correct','正确'],['wrong','有错'],['unclear','读不清']],marks[p.id])+'</div></div>').join('')+'<p>备注（有错时写正确内容）</p><textarea data-img-note="'+img.id+'">'+esc(marks.note)+'</textarea></div></div></section>'}).join('');
document.getElementById('judgements').innerHTML=DATA.judgements.map((j,i)=>{const s=state.judgements[j.id]||{};const pts=Object.fromEntries(j.points.map(p=>[p.id,p]));const line=(cls,label,list)=>list.length?'<p class="'+cls+'"><b>'+label+'</b></p>'+list.map(e=>'<div>'+e.point_id+'：'+esc(pts[e.point_id]?.text)+(e.quote?'<br><small>原话：“'+esc(e.quote)+'”</small>':'')+(e.reason?'<br><small>理由：'+esc(e.reason)+'</small>':'')+'</div>').join(''):'';
return '<section class="card"><h3>'+(i+1)+'. '+j.question_id+' · 内容档位 '+j.content_band+' / 6</h3><div class="pair"><div><img src="'+j.image_url+'" alt="'+j.question_id+'">'+(j.audio_url?'<audio controls preload="none" src="'+j.audio_url+'" style="width:100%;margin-top:8px"></audio>':'')+'</div><div><p><b>转写</b></p><blockquote>'+esc(j.transcript||'（空）')+'</blockquote>'+line('covered','覆盖',j.covered)+line('inaccurate','不准确',j.inaccurate)+line('missed','遗漏',j.missed.map(id=>({point_id:id})))+'<div class="opts" data-judgement="'+j.id+'">'+radios('j-'+j.id,[['agree','同意'],['disagree','不同意']],s.verdict)+'</div><textarea data-judgement-note="'+j.id+'" placeholder="不同意时写原因">'+esc(s.note)+'</textarea></div></div></section>'}).join('');
document.addEventListener('change',e=>{const box=e.target.closest('.opts');if(!box)return;if(box.dataset.img){(state.images[box.dataset.img]??={})[box.dataset.point]=e.target.value}else{(state.judgements[box.dataset.judgement]??={}).verdict=e.target.value}save()});
document.addEventListener('input',e=>{if(e.target.dataset.imgNote)(state.images[e.target.dataset.imgNote]??={}).note=e.target.value;if(e.target.dataset.judgementNote)(state.judgements[e.target.dataset.judgementNote]??={}).note=e.target.value;save()});
function progress(){const total=DATA.images.reduce((n,i)=>n+i.points.length,0)+DATA.judgements.length;const done=DATA.images.reduce((n,i)=>n+i.points.filter(p=>state.images[i.id]?.[p.id]).length,0)+DATA.judgements.filter(j=>state.judgements[j.id]?.verdict).length;document.getElementById('progress').textContent='已完成 '+done+' / '+total}
document.getElementById('export').onclick=()=>{const blob=new Blob([JSON.stringify({generated_at:DATA.generated_at,exported_at:new Date().toISOString(),...state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='di-review-'+new Date().toISOString().slice(0,10)+'.json';a.click()};progress();</script></body></html>
`;
}

// Groq allows 8000 tokens/minute for this model; pace the evaluation and repeat a run that was
// rate-limited, so the gates measure judgement quality. Rate limits are reported separately.
export async function judgePaced({ answerKey, transcript, intervalMs, rateLimited, judge = judgeDIContent, wait = ms => new Promise(r => setTimeout(r, ms)), maxRateLimitRetries = 3 }) {
  for (let retry = 0; ; retry++) {
    const result = await judge({ answerKey, transcript });
    await wait(intervalMs);
    if (!(result.reason === 'model_error' && result.status_code === 429) || retry >= maxRateLimitRetries) return result;
    rateLimited.count += 1;
    await wait(60_000);
  }
}

async function run({ runs, transcribeOnly = false, intervalMs = 30_000 }) {
  const rateLimited = { count: 0 };
  const env = process.env;
  const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const dir of ['audio', 'cache', 'review']) await mkdir(join(DATA_DIR, dir), { recursive: true });
  if (transcribeOnly) {
    for (const sample of await loadSamples(db)) console.log(`${sample.id} ${sample.question_id} ${JSON.stringify((await ensureTranscript(db, sample)).text.slice(0, 80))}`);
    return;
  }
  const keys = indexAnswerKey(JSON.parse(await readFile(KEY_PATH, 'utf8')));
  const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
  const imageUrl = id => `/public${catalog.questions.find(question => question.id === id)?.imageUrl}`;
  const samples = [], excluded = [];
  for (const sample of await loadSamples(db)) {
    const answerKey = keys.get(sample.question_id);
    if (!answerKey) { excluded.push({ id: sample.id, question_id: sample.question_id, reason: 'no_answer_key' }); continue; }
    const transcript = await ensureTranscript(db, sample);
    if (wordCount(transcript.text) < MIN_TRANSCRIPT_WORDS) {
      excluded.push({ id: sample.id, question_id: sample.question_id, reason: 'too_short_transcript', transcript: transcript.text });
      continue;
    }
    const results = [];
    for (let i = 0; i < runs; i++) results.push(await judgePaced({ answerKey, transcript: transcript.text, intervalMs, rateLimited }));
    console.log(`${sample.id} ${sample.question_id} bands=${results.map(r => r.status === 'scored' ? r.content_band : 'x').join(',')}`);
    samples.push({ id: sample.id, question_id: sample.question_id, transcript: transcript.text, audio_file: transcript.audio_file, runs: results });
  }
  const summary = { ...summarizeRuns(samples), rate_limited_retries: rateLimited.count, interval_ms: intervalMs };
  const generated_at = new Date().toISOString();
  await writeFile(REPORT_PATH, `${JSON.stringify({ generated_at, runs_per_sample: runs, summary, excluded, samples }, null, 2)}\n`);
  for (const entry of excluded) console.log(`${entry.id} excluded: ${entry.reason}`);
  const reviewIds = pickSamples(samples.filter(sample => sample.runs.some(r => r.status === 'scored') && sample.transcript.trim()).map(sample => sample.id), 5);
  const judgements = reviewIds.map(id => samples.find(sample => sample.id === id)).map(sample => {
    const scored = sample.runs.filter(r => r.status === 'scored');
    const counts = scored.reduce((map, r) => map.set(r.content_band, (map.get(r.content_band) || 0) + 1), new Map());
    const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const shown = scored.find(r => r.content_band === modal);
    return { id: sample.id, question_id: sample.question_id, image_url: imageUrl(sample.question_id), audio_url: `/${sample.audio_file}`,
      transcript: sample.transcript, points: keys.get(sample.question_id).points, content_band: shown.content_band,
      covered: shown.covered, inaccurate: shown.inaccurate, missed: shown.missed };
  });
  const images = selectReviewImages(catalog, keys).map(id => ({ id, image_type: keys.get(id).image_type, image_url: imageUrl(id), points: keys.get(id).points }));
  await writeFile(join(DATA_DIR, 'review/index.html'), reviewPage({ generated_at, images, judgements }));
  console.log(JSON.stringify({ ...summary, per_sample: undefined }, null, 2));
}

async function applyReview(file) {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const review = JSON.parse(await readFile(resolve(file), 'utf8'));
  const result = evaluateGates({ summary: report.summary, review });
  await writeFile(join(DATA_DIR, 'gates.json'), `${JSON.stringify({ review_file: file, ...result, summary: { ...report.summary, per_sample: undefined } }, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const reviewIndex = argv.indexOf('--apply-review');
  if (reviewIndex >= 0) await applyReview(argv[reviewIndex + 1]);
  else await run({ runs: Number(argv[argv.indexOf('--runs') + 1]) || 5, transcribeOnly: argv.includes('--transcribe-only'),
    intervalMs: argv.includes('--interval-ms') ? Number(argv[argv.indexOf('--interval-ms') + 1]) : 30_000 });
}
