# WE Phase 1 Data Contract

## Goal

WE Phase 1 sets a clean seed-first data foundation for Write Essay.

This phase focuses on:
- correct 39-question catalog,
- stable classification fields,
- reusable content-bank structure,
- 10 universal full-essay templates shared by all WE questions.

This phase does not include:
- database migration,
- Supabase upsert,
- heavy AI scoring,
- complex UI rebuild.

## Why `promptText` Is the Primary Field

`promptText` is the full official question statement and must be the single canonical text.

Reasons:
1. The left short title is not a full question, so it cannot drive matching logic safely.
2. Template matching and opinion sentence matching need full semantic meaning.
3. History replay must reflect the real prompt users answered, not only a short label.
4. Variant prompts (for example Tourism) require full-text tracking.

## Role of `sourceNumberLabel` and `sourceRefId`

- `sourceNumberLabel` keeps the original source numbering (for example `#35`) for human mapping and QA checks.
- `sourceRefId` stores optional source-side reference IDs when available from source images/materials.

These two fields are traceability fields, not semantic matching fields.

## Phase 1 Seed Files and Their Responsibilities

- `seeds/we/we-question-catalog.phase1.json`  
  Main source of the 39 official WE questions and metadata.

- `seeds/we/we-taxonomy.phase1.json`  
  Controlled vocab for `promptType`, `primaryTopic`, and difficulty semantics.

- `seeds/we/we-related-overrides.phase1.json`  
  Manual related-question map (2-3 IDs each) for phase1.

- `seeds/we/we-template-bank.phase1.json`  
  Universal 10-template bank for all WE questions (seed + adapter).

- `seeds/we/we-opinion-sentences.phase1.json`  
  Opinion sentence bank (seed + adapter) with `topicKey / subTopicKey / questionIds` mapping.

- `seeds/we/we-linker-bank.phase1.json`  
  Connector phrases for intro/body/contrast/example/conclusion.

- `seeds/we/we-example-bank.phase1.json`  
  Reusable short examples grouped by primary topic.

## Canonical Question Record Shape

Each question record includes:
- `id`
- `sourceNumberLabel`
- `sourceRefId` (optional)
- `displayTitle`
- `promptText`
- `promptType`
- `primaryTopic`
- `secondaryTopics`
- `relatedQuestionIds`
- `variants`
- `difficulty`

## Runtime Wiring Status

Current WE runtime now uses seed-driven adapter reads:

- Adapter entry: `src/lib/we-data.js`
- Old WE mock source in `src/data/questions.js` is disabled (`WE: []`).
- WE routes:
1. `/we` (random practice)
2. `/we/select` (select from full 39-question catalog)
3. `/we/practice/:id` (single-question practice)
4. `/we/templates` (universal template library)
5. `/we/opinions` (opinion sentence library)

Adapter access points:
1. `getWEQuestionCatalog()`
2. `getWEQuestionById(id)`
3. `getWEQuestionsByTopic(topic)`
4. `getRelatedWEQuestions(id)`
5. `getWETemplates()`
6. `getUniversalWETemplates()`
7. `getDefaultWETemplate()`
8. `getWETemplateById(id)`
9. `getWETemplatesByPromptType(promptType)` (compat path, now returns universal templates)
10. `getRecommendedWETemplates(question)` (compat path, now returns universal templates)
11. `getWEOpinionSentences()`
12. `getWEOpinionSentencesByTopic(topicKey)`
13. `getWEOpinionSentencesByQuestionId(questionId)`
14. `getWEOpinionSentencesGroupedByStance(questionId)`
15. `getWELinkers()`
16. `getWEExamplesByTopic(topic)`

Template runtime behavior:
- All 39 WE questions share the same 10 universal templates.
- Single-question page shows one current template by default (template 1).
- Users can switch current template manually and one-click import to body editor.
- WE main entry now includes a template library page (`/we/templates`) with view/copy/use actions.
- This phase does not include AI template generation or AI scoring.

Opinion sentence runtime behavior:
- Opinion sentence seed keeps 6 top-level topic buckets:
  `education_learning`, `technology_media`, `work_business_economy`,
  `government_law_environment`, `city_building_tourism_living`, `family_society_growth`.
- Each sentence record includes: `id`, `topicKey`, `subTopicKey`, `stance`, `text`, `questionIds`, `sortOrder`.
- Each sentence record includes: `id`, `topicKey`, `subTopicKey`, `stance`, `text`, `translationZh`, `questionIds`, `sortOrder`.
- The opinion library page (`/we/opinions`) supports topic-group viewing, search, copy, and \"go use in practice\".
- Single-question page loads recommended opinion sentences by `questionId` and groups them by `support / against / balanced`.
- Users can copy or insert a sentence directly into the essay body input.

## Current Storage Decision

- Question catalog, template bank, opinion sentences, linker bank, and example bank all stay in repo seeds.
- Runtime reads continue through `src/lib/we-data.js` adapter.
- Supabase migration for template/question/opinion storage is intentionally postponed.

## Integration Path for Later Phases

Phase 2 (data quality + small capability increments):
1. Add formal seed validation script and CI checks.
2. Expand template/opinion/linker/example banks with more entries.
3. Introduce lightweight WE history linkage by canonical `promptText` and `id`.

Phase 3 (backend materialization, optional):
1. Build transform/upsert pipeline from seed to DB.
2. Add DB reads only after seed schema is stable.
3. Keep existing WFD and RA paths untouched.

## Safety Notes

- Do not modify WFD production audio chain.
- Do not change `question-audio/wfd/*` assumptions.
- Do not perform large RA flow changes in WE data work.
- Keep English bank content simple and high-school friendly.
