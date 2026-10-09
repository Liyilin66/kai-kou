import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alignWords } from '../backend/speech/align.js';
import { extractFeatures } from '../backend/speech/features.js';
import { labelIndex, predictedErrors, validateManifest } from './eval-speech.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_HYPOTHESES = ['browser_asr', 'groq_whisper'];
export const MIXED_TYPES = ['omission', 'substitution', 'repetition', 'pause'];
const METRIC_TYPES = [...MIXED_TYPES, 'insertion'];
const PAUSE_TYPES = new Set(['hesitation', 'long_pause']);
const TOLERANT_TYPES = new Set(['pause', 'repetition', 'insertion']);

function mixedType(type) {
  return PAUSE_TYPES.has(type) ? 'pause' : type;
}

function referenceWord(sample, refIndex) {
  return alignWords(sample.reference_text, '').reference[refIndex]?.text ?? '';
}

function normalizePrediction(prediction, index) {
  return {
    id: `p${index + 1}`,
    type: prediction.type,
    match_type: mixedType(prediction.type),
    ref_index: prediction.ref_index,
    ref_text: prediction.ref_text ?? '',
    hyp_text: prediction.hyp_text ?? '',
    start_ms: prediction.start_ms,
    end_ms: prediction.end_ms,
  };
}

function normalizeLabel(sample, label, index) {
  const refIndex = labelIndex(sample.reference_text, label);
  return {
    id: `l${index + 1}`,
    type: label.type,
    match_type: mixedType(label.type),
    ref_index: refIndex,
    word: label.word,
    occurrence: label.occurrence,
    expected_spoken_as: label.spoken_as,
    duration_ms: label.duration_ms,
  };
}

function candidateDistance(prediction, label) {
  if (prediction.match_type !== label.match_type) return null;
  const tolerance = TOLERANT_TYPES.has(prediction.match_type) ? 1 : 0;
  const distance = Math.abs(prediction.ref_index - label.ref_index);
  return distance <= tolerance ? distance : null;
}

export function matchMixedEvents(predictions, labels) {
  const owners = new Map();
  function assign(predictionIndex, visited) {
    const prediction = predictions[predictionIndex];
    const candidates = labels.map((label, index) => ({ label, index, distance: candidateDistance(prediction, label) }))
      .filter(candidate => candidate.distance !== null)
      .sort((a, b) => a.distance - b.distance || a.index - b.index);
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
  const matchedPredictionIndexes = new Set(owners.values());
  const matched_labels = [...owners.entries()].sort((a, b) => a[0] - b[0]).map(([labelIndexValue, predictionIndex]) => {
    const label = labels[labelIndexValue];
    const prediction = predictions[predictionIndex];
    return { ...label, matched_prediction: prediction };
  });
  return {
    matched_labels,
    missed_labels: labels.filter((_, index) => !owners.has(index)),
    extra_predictions: predictions.filter((_, index) => !matchedPredictionIndexes.has(index)),
  };
}

export function predictionsForSample(sample, hypothesis) {
  const entry = sample.hypotheses?.[hypothesis];
  if (!entry) throw new Error(`${sample.id}: missing hypothesis ${hypothesis}`);
  const alignment = alignWords(sample.reference_text, entry.words ?? entry.text);
  const predictions = predictedErrors(alignment);
  const features = Array.isArray(entry.words) && Array.isArray(entry.silences)
    ? extractFeatures({ alignment, ...entry, referenceText: sample.reference_text }) : null;
  if (features) {
    predictions.push(...features.pauses
      .filter(pause => PAUSE_TYPES.has(pause.type))
      .map(pause => ({ type: pause.type, ref_index: pause.ref_index, ref_text: referenceWord(sample, pause.ref_index),
        start_ms: pause.start_ms, end_ms: pause.end_ms })));
  }
  return { alignment, features, predictions: predictions.map(normalizePrediction) };
}

function summarizeProvider(rows) {
  const by_type = METRIC_TYPES.map(type => ({ type, known_labels: 0, matched_labels: 0, missed_labels: 0,
    extra_predictions: 0, recall: null, provisional_precision: null }));
  for (const row of rows) {
    for (const typeRow of by_type) {
      typeRow.known_labels += row.labels.filter(label => label.match_type === typeRow.type).length;
      typeRow.matched_labels += row.matched_labels.filter(label => label.match_type === typeRow.type).length;
      typeRow.missed_labels += row.missed_labels.filter(label => label.match_type === typeRow.type).length;
      typeRow.extra_predictions += row.extra_predictions.filter(prediction => prediction.match_type === typeRow.type).length;
    }
  }
  for (const row of by_type) {
    row.recall = row.known_labels ? row.matched_labels / row.known_labels : null;
    const predicted = row.matched_labels + row.extra_predictions;
    row.provisional_precision = predicted ? row.matched_labels / predicted : null;
  }
  const totals = by_type.reduce((acc, row) => {
    for (const key of ['known_labels', 'matched_labels', 'missed_labels', 'extra_predictions']) acc[key] += row[key];
    return acc;
  }, { known_labels: 0, matched_labels: 0, missed_labels: 0, extra_predictions: 0 });
  const textKnown = by_type.filter(row => ['omission', 'substitution', 'repetition'].includes(row.type))
    .reduce((sum, row) => sum + row.known_labels, 0);
  const textMatched = by_type.filter(row => ['omission', 'substitution', 'repetition'].includes(row.type))
    .reduce((sum, row) => sum + row.matched_labels, 0);
  const pauseRow = by_type.find(row => row.type === 'pause');
  return {
    ...totals,
    recall: totals.known_labels ? totals.matched_labels / totals.known_labels : null,
    text_recall: textKnown ? textMatched / textKnown : null,
    pause_recall: pauseRow?.known_labels ? pauseRow.matched_labels / pauseRow.known_labels : null,
    provisional_precision: totals.matched_labels + totals.extra_predictions
      ? totals.matched_labels / (totals.matched_labels + totals.extra_predictions) : null,
    by_type,
  };
}

export function evaluateMixedManifest(manifest, { hypotheses = DEFAULT_HYPOTHESES } = {}) {
  for (const hypothesis of hypotheses) validateManifest(manifest, hypothesis);
  const samples = manifest.filter(sample => sample.source === 'constructed' && /-mixed-4$/.test(sample.script_id || ''));
  const sampleRows = samples.map(sample => {
    const labels = sample.labels.errors.map((label, index) => normalizeLabel(sample, label, index));
    const providers = hypotheses.map(hypothesis => {
      const { alignment, features, predictions } = predictionsForSample(sample, hypothesis);
      const matched = matchMixedEvents(predictions, labels);
      return {
        hypothesis,
        labels,
        predictions,
        matched_labels: matched.matched_labels,
        missed_labels: matched.missed_labels,
        extra_predictions: matched.extra_predictions,
        summary: summarizeProvider([{ labels, ...matched }]),
        alignment_summary: alignment.summary,
        features_summary: features ? {
          wpm: features.metrics.wpm,
          hesitation_count: features.metrics.hesitation_count,
          long_pause_count: features.metrics.long_pause_count,
          pause_count: features.pauses.filter(pause => PAUSE_TYPES.has(pause.type)).length,
        } : null,
      };
    });
    return { id: sample.id, question_id: sample.question_id, script_id: sample.script_id, labels, providers };
  });
  const reports = hypotheses.map(hypothesis => {
    const rows = sampleRows.map(sample => {
      const provider = sample.providers.find(item => item.hypothesis === hypothesis);
      return { id: sample.id, question_id: sample.question_id, script_id: sample.script_id, ...provider };
    });
    return { hypothesis, ...summarizeProvider(rows), samples: rows };
  });
  return {
    generated_at: new Date().toISOString(),
    sample_count: sampleRows.length,
    hypotheses,
    notes: [
      'hesitation and long_pause are merged as pause for mixed-script matching only.',
      'extra_predictions are pending listening review and are not final false positives.',
      'provisional_precision is matched_labels / (matched_labels + extra_predictions).',
      'browser_asr has no timed pauses; compare text_recall separately from pause_recall.',
    ],
    providers: reports.map(({ samples: _samples, ...summary }) => summary),
    reports,
    samples: sampleRows,
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = { hypotheses: DEFAULT_HYPOTHESES, output: null };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--hypotheses', '--output'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag}: missing value`);
    if (flag === '--hypotheses') options.hypotheses = value.split(',').map(item => item.trim()).filter(Boolean);
    if (flag === '--output') options.output = value;
  }
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'eval/speech/manifest.json'), 'utf8'));
  const report = evaluateMixedManifest(manifest, { hypotheses: options.hypotheses });
  if (options.output) {
    const target = path.resolve(root, options.output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
    console.log(target);
  } else {
    console.log(JSON.stringify({
      sample_count: report.sample_count,
      providers: report.providers.map(({ hypothesis, by_type, ...summary }) => ({ hypothesis, ...summary })),
    }, null, 2));
  }
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Mixed speech evaluation failed: ${error.message}`); process.exitCode = 1; });
}
