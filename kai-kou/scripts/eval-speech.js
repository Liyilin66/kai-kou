import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alignWords, normalizeTokens } from '../backend/speech/align.js';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ERROR_TYPES = ['omission', 'substitution', 'insertion', 'repetition', 'hesitation', 'long_pause'];
const TOLERANT_TYPES = new Set(['insertion', 'repetition', 'hesitation', 'long_pause']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireField(condition, context, field, message) {
  if (!condition) throw new Error(`${context}.${field}: ${message}`);
}

export function labelIndex(referenceText, label) {
  const target = normalizeTokens(label.word);
  if (target.length !== 1) throw new Error('word must normalize to exactly one token');
  const matches = normalizeTokens(referenceText).filter((token) => token.norm === target[0].norm);
  const token = matches[label.occurrence - 1];
  if (!token) throw new Error(`word ${JSON.stringify(label.word)} occurrence ${label.occurrence} not found in reference_text`);
  return token.index;
}

export function validateManifest(manifest, hypothesis = 'browser_asr') {
  const samples = Array.isArray(manifest) ? manifest : manifest?.samples;
  requireField(Array.isArray(samples), 'manifest', 'samples', 'expected sample array');
  const ids = new Set();
  const speakers = new Map();
  samples.forEach((sample, position) => {
    const ctx = `sample[${position}]${sample?.id ? ` (${sample.id})` : ''}`;
    requireField(object(sample), ctx, 'sample', 'expected object');
    for (const field of ['id', 'question_id', 'reference_text', 'speaker_id', 'device']) {
      requireField(typeof sample[field] === 'string' && sample[field].trim().length > 0, ctx, field, 'expected nonempty string');
    }
    requireField(!ids.has(sample.id), ctx, 'id', 'duplicate sample id');
    ids.add(sample.id);
    requireField(sample.task_type === 'RA', ctx, 'task_type', 'expected RA');
    requireField(['real', 'constructed', 'tts'].includes(sample.source), ctx, 'source', 'expected real, constructed or tts');
    requireField(['dev', 'test'].includes(sample.split), ctx, 'split', 'expected dev or test');
    requireField(!speakers.has(sample.speaker_id) || speakers.get(sample.speaker_id) === sample.split, ctx, 'split', `speaker ${sample.speaker_id} occurs in both dev and test`);
    speakers.set(sample.speaker_id, sample.split);
    requireField(typeof sample.consent === 'boolean', ctx, 'consent', 'expected boolean');
    requireField(sample.source !== 'real' || sample.consent === true, ctx, 'consent', 'real samples require consent');
    requireField(sample.script_id === null || typeof sample.script_id === 'string', ctx, 'script_id', 'expected string or null');
    requireField(object(sample.audio), ctx, 'audio', 'expected object');
    for (const field of ['local_file', 'storage_path']) {
      requireField(sample.audio[field] === null || typeof sample.audio[field] === 'string', ctx, `audio.${field}`, 'expected string or null');
    }
    requireField(object(sample.hypotheses), ctx, 'hypotheses', 'expected object');
    for (const [name, entry] of Object.entries(sample.hypotheses)) {
      requireField(object(entry), ctx, `hypotheses.${name}`, 'expected object');
      requireField(typeof entry.text === 'string', ctx, `hypotheses.${name}.text`, 'expected string (empty is allowed)');
    }
    requireField(object(sample.hypotheses[hypothesis]), ctx, `hypotheses.${hypothesis}`, 'requested hypothesis is missing');
    requireField(object(sample.old_scores), ctx, 'old_scores', 'expected object');
    for (const [name, score] of Object.entries(sample.old_scores)) {
      requireField(score === null || (typeof score === 'number' && Number.isFinite(score)), ctx, `old_scores.${name}`, 'expected finite number or null');
    }
    requireField(object(sample.labels), ctx, 'labels', 'expected object');
    requireField(['labeled', 'unlabeled'].includes(sample.labels.status), ctx, 'labels.status', 'expected labeled or unlabeled');
    requireField(Array.isArray(sample.labels.errors), ctx, 'labels.errors', 'expected array');
    for (const field of ['labeled_by', 'notes']) {
      requireField(typeof sample.labels[field] === 'string', ctx, `labels.${field}`, 'expected string');
    }
    sample.labels.errors.forEach((label, index) => {
      const field = `labels.errors[${index}]`;
      requireField(object(label), ctx, field, 'expected object');
      requireField(ERROR_TYPES.includes(label.type), ctx, `${field}.type`, 'unknown error type');
      requireField(typeof label.word === 'string' && label.word.trim().length > 0, ctx, `${field}.word`, 'expected nonempty string');
      requireField(Number.isInteger(label.occurrence) && label.occurrence >= 1, ctx, `${field}.occurrence`, 'expected positive integer');
      try { labelIndex(sample.reference_text, label); } catch (error) {
        throw new Error(`${ctx}.${field}.word: ${error.message}`);
      }
    });
  });
  return samples;
}

export function predictedErrors(alignment) {
  return alignment.ops.flatMap((op, index, ops) => {
    if (op.type === 'match' || op.tag === 'low_confidence' || op.tag === 'homophone') return [];
    let refIndex = op.ref_index;
    if (refIndex === null) {
      // Insertions occupy a boundary: use the next reference word, or last word at the end.
      refIndex = ops.slice(index + 1).find((item) => item.ref_index !== null)?.ref_index
        ?? [...ops.slice(0, index)].reverse().find((item) => item.ref_index !== null)?.ref_index
        ?? 0;
    }
    return [{ type: op.tag === 'repetition' ? 'repetition' : op.type, ref_index: refIndex,
      ref_text: op.ref_text, hyp_text: op.hyp_text }];
  });
}

export function matchErrors(predictions, labels) {
  // Maximum one-to-one matching avoids double credit and greedy ambiguity within ±1.
  const owners = new Map();
  function assign(predictionIndex, visited) {
    const prediction = predictions[predictionIndex];
    const tolerance = TOLERANT_TYPES.has(prediction.type) ? 1 : 0;
    const candidates = labels.map((label, index) => ({ label, index }))
      .filter(({ label }) => label.type === prediction.type && Math.abs(label.ref_index - prediction.ref_index) <= tolerance)
      .sort((a, b) => Math.abs(a.label.ref_index - prediction.ref_index) - Math.abs(b.label.ref_index - prediction.ref_index) || a.index - b.index);
    for (const { index } of candidates) {
      if (visited.has(index)) continue;
      visited.add(index);
      if (!owners.has(index) || assign(owners.get(index), visited)) {
        owners.set(index, predictionIndex);
        return true;
      }
    }
    return false;
  }
  predictions.forEach((_, index) => assign(index, new Set()));
  return ERROR_TYPES.map((type) => {
    const tp = [...owners.keys()].filter((index) => labels[index].type === type).length;
    const fp = predictions.filter((item) => item.type === type).length - tp;
    const fn = labels.filter((item) => item.type === type).length - tp;
    return { type, tp, fp, fn };
  });
}

export function evaluateManifest(manifest, { split = 'all', hypothesis = 'browser_asr' } = {}) {
  if (!['dev', 'test', 'all'].includes(split)) throw new Error('--split: expected dev, test or all');
  const samples = validateManifest(manifest, hypothesis).filter((sample) => split === 'all' || sample.split === split);
  const metrics = ERROR_TYPES.map((type) => ({ type, tp: 0, fp: 0, fn: 0 }));
  const noErrorSamples = { count: 0, false_positives: 0 };
  const results = samples.map((sample) => {
    const alignment = alignWords(sample.reference_text, sample.hypotheses[hypothesis].text);
    const predictions = predictedErrors(alignment);
    const labeled = sample.labels.status === 'labeled';
    const labels = labeled ? sample.labels.errors.map((label) => ({ ...label, ref_index: labelIndex(sample.reference_text, label) })) : [];
    if (labeled) {
      matchErrors(predictions, labels).forEach((row, index) => {
        for (const field of ['tp', 'fp', 'fn']) metrics[index][field] += row[field];
      });
      if (labels.length === 0) {
        noErrorSamples.count++;
        noErrorSamples.false_positives += predictions.length;
      }
    }
    return { id: sample.id, split: sample.split, label_status: sample.labels.status, included_in_metrics: labeled, predictions, labels, alignment };
  });
  return {
    generated_at: new Date().toISOString(), split, hypothesis,
    sample_count: samples.length, labeled_count: results.filter((sample) => sample.included_in_metrics).length,
    unlabeled_count: results.filter((sample) => !sample.included_in_metrics).length,
    notes: ['Precision is TP/(TP+FP); recall is TP/(TP+FN). Undefined denominators are null.',
      'This baseline evaluates transcript alignment, not acoustic pronunciation accuracy.',
      'No hesitation or long_pause predictions are inferred from transcript text.'],
    metrics: metrics.map((row) => ({ ...row, precision: row.tp + row.fp ? row.tp / (row.tp + row.fp) : null,
      recall: row.tp + row.fn ? row.tp / (row.tp + row.fn) : null })),
    no_error_samples: noErrorSamples, samples: results,
  };
}

const percent = (value) => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
export function markdownReport(report) {
  return `# Speech alignment baseline\n\nGenerated: ${report.generated_at}\n\nHypothesis: ${report.hypothesis}; split: ${report.split}\n\nSamples: ${report.sample_count}; labeled: ${report.labeled_count}; unlabeled (excluded): ${report.unlabeled_count}\n\n| Error type | TP | FP | FN | Precision | Recall |\n| --- | ---: | ---: | ---: | ---: | ---: |\n`
    + report.metrics.map((row) => `| ${row.type} | ${row.tp} | ${row.fp} | ${row.fn} | ${percent(row.precision)} | ${percent(row.recall)} |`).join('\n')
    + `\n\nNo-error labeled samples: ${report.no_error_samples.count}; false positives: ${report.no_error_samples.false_positives}.\n\n`
    + report.notes.map((note) => `- ${note}`).join('\n')
    + '\n\n## Per-sample alignment\n\n'
    + report.samples.map((sample) => `### ${sample.id}\n\nStatus: ${sample.label_status}; included in metrics: ${sample.included_in_metrics}\n\n\`\`\`json\n${JSON.stringify({ predictions: sample.predictions, alignment: sample.alignment }, null, 2)}\n\`\`\``).join('\n\n') + '\n';
}

export async function main(args = process.argv.slice(2)) {
  const options = { split: 'all', hypothesis: 'browser_asr' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--split', '--hypothesis'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag}: missing value`);
    options[flag.slice(2)] = value;
  }
  const manifestPath = resolve(APP_ROOT, 'eval/speech/manifest.json');
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) {
    throw new Error(`${manifestPath}: ${error.message}`);
  }
  const report = evaluateManifest(manifest, options);
  const outputDir = resolve(APP_ROOT, 'output/eval');
  await mkdir(outputDir, { recursive: true });
  const stem = resolve(outputDir, `speech-${report.generated_at.replace(/[:.]/g, '-')}`);
  await writeFile(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${stem}.md`, markdownReport(report));
  console.table(report.metrics.map((row) => ({ ...row, precision: percent(row.precision), recall: percent(row.recall) })));
  console.log(`Samples: ${report.sample_count}; labeled: ${report.labeled_count}; unlabeled excluded: ${report.unlabeled_count}`);
  console.log(`No-error samples: ${report.no_error_samples.count}; false positives: ${report.no_error_samples.false_positives}`);
  console.log(`Reports: ${stem}.json\n${stem}.md`);
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(`Speech evaluation failed: ${error.message}`); process.exitCode = 1; });
}
