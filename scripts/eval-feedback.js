import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignWords } from '../backend/speech/align.js';
import { extractFeatures } from '../backend/speech/features.js';
import { buildEvidence } from '../backend/speech/evidence.js';
import { generateEvidenceFeedback, validateFeedback, buildTemplateFeedback } from '../backend/speech/feedback.js';
import { selectFeedbackEvidence } from '../backend/speech/feedback-rules.js';

const normalizeAction = action => String(action ?? '').replace(/[\p{P}\p{S}\s]/gu, '');
const root = fileURLToPath(new URL('../', import.meta.url));
export async function evaluateFeedbackSamples(manifest, generate = generateEvidenceFeedback) {
  if (!Array.isArray(manifest)) throw new Error('manifest must be an array');
  const results = [];
  for (const sample of manifest.filter(sample => sample.hypotheses?.groq_whisper)) {
    const entry = sample.hypotheses.groq_whisper;
    const alignment = alignWords(sample.reference_text, entry.words ?? entry.text);
    const features = extractFeatures({ alignment, ...entry, referenceText: sample.reference_text });
    const evidence = buildEvidence({ alignment, ...features });
    const result = await generate({ evidence, metrics: features.metrics, referenceText: sample.reference_text });
    const validation = validateFeedback(result.feedback, selectFeedbackEvidence(evidence), sample.reference_text);
    const templateActions = new Map(evidence.map(item => [item.id,
      normalizeAction(buildTemplateFeedback({ evidence: [item] }).suggestions[0]?.action)]));
    const actions = Array.isArray(result.feedback?.suggestions) ? result.feedback.suggestions : [];
    const identical = actions.filter(suggestion => suggestion.evidence_ids?.some(id =>
      templateActions.has(id) && normalizeAction(suggestion.action) === templateActions.get(id))).length;
    results.push({ suggestion_count: actions.length, template_identical_count: identical, id: sample.id, evidence, metrics: features.metrics, ...result, validation, model_eligible: selectFeedbackEvidence(evidence).length > 0 });
  }
  const eligible = results.filter(result => result.model_eligible);
  const first = eligible.filter(result => result.validation.ok && !result.meta.template && result.meta.attempts === 1).length;
  const retry = eligible.filter(result => result.validation.ok && !result.meta.template && result.meta.attempts === 2).length;
  const template = eligible.filter(result => result.meta.template).length;
  const rate = value => eligible.length ? value / eligible.length : null;
  const suggestion_count = results.reduce((sum, result) => sum + result.suggestion_count, 0);
  const template_identical_count = results.reduce((sum, result) => sum + result.template_identical_count, 0);
  const template_identical_rate = suggestion_count ? template_identical_count / suggestion_count : null;
  const first_pass_rate = rate(first), final_model_pass_rate = rate(first + retry);
  return { generated_at: new Date().toISOString(), sample_count: results.length, model_eligible_count: eligible.length,
    no_evidence_count: results.length - eligible.length, first_pass_count: first, retry_pass_count: retry, template_count: template,
    first_pass_rate, retry_pass_rate: rate(retry), final_model_pass_rate, template_rate: rate(template),
    suggestion_count, template_identical_count, template_identical_rate,
    gate_passed: eligible.length > 0 && first_pass_rate >= 0.8 && final_model_pass_rate >= 0.95 && template_identical_rate !== null && template_identical_rate <= 0.2 && results.every(result => result.validation.ok),
    notes: ['Model pass rates use only samples with evidence; no-evidence deterministic summaries are reported separately.',
      'Template identical rate compares punctuation-stripped actions against templates for any cited evidence; fallback suggestions are included.',
      'Template fallback does not count as model validation success. This measures feedback constraints, not diagnostic or pronunciation accuracy.'], results };
}
export async function evaluateFeedbackRounds(manifest, generate = generateEvidenceFeedback) {
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    rounds.push(await evaluateFeedbackSamples(manifest, generate));
    console.log(`Feedback round ${i + 1}/3 complete`);
  }
  const metrics = Object.fromEntries(['first_pass_rate', 'final_model_pass_rate', 'template_identical_rate'].map(key => {
    const values = rounds.map(round => round[key]);
    return [key, values.every(value => Number.isFinite(value))
      ? { mean: values.reduce((sum, value) => sum + value, 0) / 3, min: Math.min(...values), max: Math.max(...values) }
      : { mean: null, min: null, max: null }];
  }));
  const use_llm = metrics.final_model_pass_rate.mean !== null && metrics.final_model_pass_rate.mean >= 0.8
    && metrics.template_identical_rate.mean !== null && metrics.template_identical_rate.mean <= 0.3
    && rounds.every(round => round.results.every(result => result.validation.ok));
  return { generated_at: new Date().toISOString(), metrics, use_llm, rounds };
}
const percent = value => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
export async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'eval/speech/manifest.json'), 'utf8'));
  const report = await evaluateFeedbackRounds(manifest);
  const directory = path.join(root, 'output/eval');await fs.mkdir(directory, { recursive: true });
  const stem = path.join(directory, `feedback-three-rounds-${report.generated_at.replace(/[:.]/g, '-')}`);
  const markdown = '# Three serial feedback rounds\n\n' + Object.entries(report.metrics).map(([key, value]) =>
    `${key}: mean ${percent(value.mean)}; range ${percent(value.min)}–${percent(value.max)}`).join('\n')
    + `\n\nDecision: ${report.use_llm ? 'LLM with template fallback' : 'template only'}\n\n`
    + report.rounds.map((round, index) => `## Round ${index + 1}\n\nFirst: ${percent(round.first_pass_rate)}; final: ${percent(round.final_model_pass_rate)}; identical: ${percent(round.template_identical_rate)}.\n\n`
      + round.results.map(result => `### ${result.id}\n\n${JSON.stringify(result.feedback, null, 2)}\n\nMetadata: ${JSON.stringify(result.meta)}\n`).join('\n')).join('\n');
  await fs.writeFile(stem + '.json', JSON.stringify(report, null, 2)+'\n');await fs.writeFile(stem + '.md', markdown);
  console.log(JSON.stringify({ metrics: report.metrics, use_llm: report.use_llm, reports: [stem+'.json',stem+'.md'] }, null, 2));
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(`Feedback evaluation failed: ${error.message}`);process.exitCode=1;});
