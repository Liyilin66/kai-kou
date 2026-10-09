import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { alignWords } from '../backend/speech/align.js';
import { mixedExtraItems } from './eval-build-mixed-extras-kit.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_LABELS = path.join(root, 'eval/speech/labels/user-listening-mixed-extras-2026-10-09.json');
const DEFAULT_MANIFEST = path.join(root, 'eval/speech/manifest.json');
const DEFAULT_ITEMS = path.join(root, 'eval/speech/labeling/mixed-extras-2026-10-09/items.json');
const VALID_CHOICES = new Set(['wrong', 'correct', 'unclear']);

function referenceWord(sample, refIndex) {
  return alignWords(sample.reference_text, '').reference[refIndex]?.text ?? '';
}

function parseExtraId(id) {
  const match = /^mixed-extra:([^:]+):([^:]+):(\d+):(\d+)$/.exec(id || '');
  if (!match) throw new Error(`Invalid mixed-extra id: ${id}`);
  return {
    sample_id: match[1],
    type: match[2],
    ref_index: Number(match[3]),
    ordinal: Number(match[4]),
  };
}

function validateKitItems(manifest, kitItems) {
  if (!Array.isArray(kitItems)) throw new Error('items.json must contain an array');
  const bySample = new Map(manifest.map(sample => [sample.id, sample]));
  const seen = new Set();
  const events = kitItems.map(item => {
    const parsed = parseExtraId(item.id);
    if (seen.has(item.id)) throw new Error(`duplicate mixed-extra item: ${item.id}`);
    seen.add(item.id);
    if (parsed.sample_id !== item.sample_id || parsed.type !== item.type || parsed.ref_index !== item.ref_index) {
      throw new Error(`drifted mixed-extra item fields: ${item.id}`);
    }
    const sample = bySample.get(item.sample_id);
    if (!sample || sample.source !== 'constructed') throw new Error(`Unknown constructed sample for ${item.id}`);
    const word = referenceWord(sample, item.ref_index);
    if (item.word !== word) throw new Error(`drifted mixed-extra word: ${item.id}`);
    return { sample_id: item.sample_id, type: item.type, ref_index: item.ref_index };
  });
  const rebuilt = mixedExtraItems(manifest, events);
  for (let index = 0; index < kitItems.length; index++) {
    const expected = rebuilt[index];
    const actual = kitItems[index];
    for (const key of ['id', 'sample_id', 'type', 'ref_index', 'word', 'clip']) {
      if (actual[key] !== expected[key]) throw new Error(`drifted mixed-extra mapping: ${actual.id}`);
    }
  }
}

export function applyMixedExtraLabels(manifest, exported, kitItems) {
  if (exported?.version !== 1 || !Array.isArray(exported.items)) throw new Error('Unsupported mixed-extra labeling export');
  validateKitItems(manifest, kitItems);
  const byItemId = new Map(kitItems.map(item => [item.id, item]));
  const choices = new Map();
  for (const label of exported.items) {
    const item = byItemId.get(label.id);
    if (!item) throw new Error(`Unknown or stale mixed-extra label: ${label.id}`);
    if (choices.has(label.id)) throw new Error(`duplicate mixed-extra label: ${label.id}`);
    if (item.sample_id !== label.sample_id || item.ref_index !== label.ref_index) {
      throw new Error(`stale mixed-extra label: ${label.id}`);
    }
    if (!VALID_CHOICES.has(label.choice)) throw new Error(`Invalid mixed-extra choice: ${label.choice}`);
    choices.set(label.id, label.choice);
  }
  const bySample = new Map();
  for (const item of kitItems) {
    const choice = choices.get(item.id);
    if (!choice) continue;
    const reviewItem = {
      id: item.id,
      type: item.type,
      ref_index: item.ref_index,
      word: item.word,
      choice,
    };
    if (!bySample.has(item.sample_id)) bySample.set(item.sample_id, []);
    bySample.get(item.sample_id).push(reviewItem);
  }
  return manifest.map(sample => {
    const reviewed = bySample.get(sample.id);
    if (!reviewed?.length) return sample;
    const supplemental = reviewed
      .filter(item => item.choice === 'wrong')
      .map(item => ({
        source: 'mixed-extra-review',
        id: item.id,
        type: item.type,
        ref_index: item.ref_index,
        word: item.word,
        choice: item.choice,
      }));
    return {
      ...sample,
      labels: {
        ...sample.labels,
        extra_review: {
          version: 1,
          source: 'mixed-extras-2026-10-09',
          labeled_by: 'user-listening',
          counts: reviewed.reduce((acc, item) => {
            acc[item.choice] += 1;
            return acc;
          }, { wrong: 0, correct: 0, unclear: 0 }),
          items: reviewed,
          notes: 'Script-planned labels stay in labels.errors; these reviewed extras are not mixed-script ground truth.',
        },
        supplemental_errors: supplemental,
      },
    };
  });
}

export async function main(args = process.argv.slice(2)) {
  const labelsPath = path.resolve(args[0] || DEFAULT_LABELS);
  const manifestPath = path.resolve(args[1] || DEFAULT_MANIFEST);
  const itemsPath = path.resolve(args[2] || DEFAULT_ITEMS);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const exported = JSON.parse(await fs.readFile(labelsPath, 'utf8'));
  const kitItems = JSON.parse(await fs.readFile(itemsPath, 'utf8'));
  const result = applyMixedExtraLabels(manifest, exported, kitItems);
  await fs.copyFile(manifestPath, `${manifestPath}.bak`);
  await fs.writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`);
  const totals = result.reduce((acc, sample) => {
    const counts = sample.labels?.extra_review?.counts;
    if (!counts) return acc;
    acc.samples += 1;
    for (const key of ['wrong', 'correct', 'unclear']) acc[key] += counts[key] || 0;
    return acc;
  }, { samples: 0, wrong: 0, correct: 0, unclear: 0 });
  console.log(JSON.stringify({ ...totals, backup: `${manifestPath}.bak` }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
