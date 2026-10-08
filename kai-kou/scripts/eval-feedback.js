import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignWords } from '../backend/speech/align.js';
import { extractFeatures } from '../backend/speech/features.js';
import { buildEvidence } from '../backend/speech/evidence.js';
import { generateEvidenceFeedback, validateFeedback } from '../backend/speech/feedback.js';
import { selectFeedbackEvidence } from '../backend/speech/feedback-rules.js';

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
    const validation = validateFeedback(result.feedback, selectFeedbackEvidence(evidence));
    results.push({ id: sample.id, evidence, metrics: features.metrics, ...result, validation, model_eligible: selectFeedbackEvidence(evidence).length > 0 });
  }
  const eligible = results.filter(result => result.model_eligible);
  const first = eligible.filter(result => result.validation.ok && !result.meta.template && result.meta.attempts === 1).length;
  const retry = eligible.filter(result => result.validation.ok && !result.meta.template && result.meta.attempts === 2).length;
  const template = eligible.filter(result => result.meta.template).length;
  const rate = value => eligible.length ? value / eligible.length : null;
  const first_pass_rate = rate(first), final_model_pass_rate = rate(first + retry);
  return { generated_at: new Date().toISOString(), sample_count: results.length, model_eligible_count: eligible.length,
    no_evidence_count: results.length - eligible.length, first_pass_count: first, retry_pass_count: retry, template_count: template,
    first_pass_rate, retry_pass_rate: rate(retry), final_model_pass_rate, template_rate: rate(template),
    gate_passed: eligible.length > 0 && first_pass_rate >= 0.8 && final_model_pass_rate >= 0.95 && results.every(result => result.validation.ok),
    notes: ['Model pass rates use only samples with evidence; no-evidence deterministic summaries are reported separately.',
      'Template fallback does not count as model validation success. This measures feedback constraints, not diagnostic or pronunciation accuracy.'], results };
}
const percent = value => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
export async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'eval/speech/manifest.json'), 'utf8'));
  const report = await evaluateFeedbackSamples(manifest);
  const directory = path.join(root, 'output/eval');await fs.mkdir(directory, { recursive: true });
  const stem = path.join(directory, `feedback-${report.generated_at.replace(/[:.]/g, '-')}`);
  const markdown = `# Evidence feedback evaluation\n\nSamples: ${report.sample_count}; model-eligible: ${report.model_eligible_count}; no-evidence summaries: ${report.no_evidence_count}.\n\nFirst pass: ${percent(report.first_pass_rate)}; retry pass: ${percent(report.retry_pass_rate)}; final model pass: ${percent(report.final_model_pass_rate)}; template: ${percent(report.template_rate)}.\n\nGate: ${report.gate_passed ? 'PASS' : 'FAIL'}\n\n${report.notes.map(note => '- ' + note).join('\n')}\n\n` + report.results.map(result => `## ${result.id}\n\nProvider/model: ${result.meta.provider}/${result.meta.model}; attempts: ${result.meta.attempts}; template: ${result.meta.template}\n\n${result.feedback.summary}\n\n${result.feedback.suggestions.map(s => `- [${s.evidence_ids.join(', ')}] ${s.issue}：${s.action}`).join('\n')}\n`).join('\n');
  await fs.writeFile(stem + '.json', JSON.stringify(report, null, 2)+'\n');await fs.writeFile(stem + '.md', markdown);
  console.log(JSON.stringify({ samples: report.sample_count, model_eligible: report.model_eligible_count, no_evidence: report.no_evidence_count, first_pass: report.first_pass_rate, retry_pass: report.retry_pass_rate, final_pass: report.final_model_pass_rate, template: report.template_rate, gate_passed: report.gate_passed, reports: [stem+'.json',stem+'.md'] }, null, 2));
  if (!report.gate_passed) process.exitCode = 1;
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(`Feedback evaluation failed: ${error.message}`);process.exitCode=1;});
