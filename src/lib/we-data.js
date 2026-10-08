import questionCatalogSeed from "../../seeds/we/we-question-catalog.phase1.json";
import taxonomySeed from "../../seeds/we/we-taxonomy.phase1.json";
import templateBankSeed from "../../seeds/we/we-template-bank.phase1.json";
import opinionSentenceSeed from "../../seeds/we/we-opinion-sentences.phase1.json";
import linkerBankSeed from "../../seeds/we/we-linker-bank.phase1.json";
import exampleBankSeed from "../../seeds/we/we-example-bank.phase1.json";
import relatedOverridesSeed from "../../seeds/we/we-related-overrides.phase1.json";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeQuestion(rawQuestion) {
  return {
    id: String(rawQuestion?.id || "").trim(),
    sourceNumberLabel: String(rawQuestion?.sourceNumberLabel || "").trim(),
    sourceRefId: rawQuestion?.sourceRefId ? String(rawQuestion.sourceRefId).trim() : null,
    displayTitle: String(rawQuestion?.displayTitle || "").trim(),
    promptText: String(rawQuestion?.promptText || "").trim(),
    promptType: String(rawQuestion?.promptType || "").trim(),
    primaryTopic: String(rawQuestion?.primaryTopic || "").trim(),
    secondaryTopics: toArray(rawQuestion?.secondaryTopics).map((item) => String(item || "").trim()).filter(Boolean),
    relatedQuestionIds: toArray(rawQuestion?.relatedQuestionIds).map((item) => String(item || "").trim()).filter(Boolean),
    variants: toArray(rawQuestion?.variants).map((item) => ({
      variantId: String(item?.variantId || "").trim(),
      promptText: String(item?.promptText || "").trim()
    })),
    difficulty: Number(rawQuestion?.difficulty || 2)
  };
}

function normalizeTemplate(rawTemplate) {
  const sections = rawTemplate?.sections || {};
  return {
    id: String(rawTemplate?.id || "").trim(),
    title: String(rawTemplate?.title || "").trim(),
    shortLabel: String(rawTemplate?.shortLabel || "").trim(),
    promptTypes: toArray(rawTemplate?.promptTypes).map((item) => String(item || "").trim()).filter(Boolean),
    stance: String(rawTemplate?.stance || "").trim(),
    usageMode: String(rawTemplate?.usageMode || "").trim(),
    structureLabel: String(rawTemplate?.structureLabel || "").trim(),
    content: String(rawTemplate?.content || "").trim(),
    sections: {
      intro: String(sections?.intro || "").trim(),
      body1: String(sections?.body1 || "").trim(),
      body2: String(sections?.body2 || "").trim(),
      conclusion: String(sections?.conclusion || "").trim()
    },
    difficulty: Number(rawTemplate?.difficulty || 2),
    sortOrder: Number(rawTemplate?.sortOrder || 999),
    isUniversal: Boolean(rawTemplate?.isUniversal)
  };
}

function normalizeStance(value) {
  const stance = String(value || "").trim().toLowerCase();
  if (stance === "oppose") return "against";
  if (stance === "support" || stance === "against" || stance === "balanced") return stance;
  return "balanced";
}

function normalizeOpinionSentence(rawSentence) {
  return {
    id: String(rawSentence?.id || "").trim(),
    topicKey: String(rawSentence?.topicKey || "").trim(),
    subTopicKey: String(rawSentence?.subTopicKey || "").trim(),
    subTopicLabel: String(rawSentence?.subTopicLabel || "").trim(),
    stance: normalizeStance(rawSentence?.stance),
    text: String(rawSentence?.text || "").trim(),
    translationZh: String(rawSentence?.translationZh || "").trim(),
    questionIds: toArray(rawSentence?.questionIds).map((item) => String(item || "").trim()).filter(Boolean),
    sortOrder: Number(rawSentence?.sortOrder || 999),
    source: String(rawSentence?.source || "").trim()
  };
}

const questionCatalog = toArray(questionCatalogSeed?.questions).map((item) => normalizeQuestion(item));
const questionMap = new Map(questionCatalog.map((item) => [item.id, item]));
const relatedOverrideMap = new Map(
  toArray(relatedOverridesSeed?.overrides).map((item) => [
    String(item?.id || "").trim(),
    toArray(item?.relatedQuestionIds).map((id) => String(id || "").trim()).filter(Boolean)
  ])
);
const templateCatalog = toArray(templateBankSeed?.templates)
  .map((item) => normalizeTemplate(item))
  .sort((a, b) => a.sortOrder - b.sortOrder);
const templateMap = new Map(templateCatalog.map((item) => [item.id, item]));
const opinionTopicOrder = toArray(opinionSentenceSeed?.topicOrder).map((item) => String(item || "").trim()).filter(Boolean);
const opinionTopics = toArray(opinionSentenceSeed?.topics).map((item) => ({
  topicKey: String(item?.topicKey || "").trim(),
  label: String(item?.label || "").trim(),
  subTopics: toArray(item?.subTopics).map((subItem) => ({
    subTopicKey: String(subItem?.subTopicKey || "").trim(),
    subTopicLabel: String(subItem?.subTopicLabel || "").trim()
  }))
}));
const opinionSentenceCatalog = toArray(opinionSentenceSeed?.sentences)
  .map((item) => normalizeOpinionSentence(item))
  .filter((item) => item.id && item.topicKey && item.text)
  .sort((a, b) => a.sortOrder - b.sortOrder);
const LEGACY_OPINION_TOPIC_ALIAS = {
  society_law_policy: ["government_law_environment", "family_society_growth"],
  environment_global_issues: ["government_law_environment"],
  city_infrastructure_housing: ["city_building_tourism_living"]
};

function cloneQuestion(question) {
  if (!question) return null;
  return {
    ...question,
    secondaryTopics: [...question.secondaryTopics],
    relatedQuestionIds: [...question.relatedQuestionIds],
    variants: question.variants.map((item) => ({ ...item }))
  };
}

function cloneTemplate(template) {
  if (!template) return null;
  return {
    ...template,
    promptTypes: [...template.promptTypes],
    sections: { ...template.sections }
  };
}

function cloneOpinionSentence(sentence) {
  if (!sentence) return null;
  return {
    ...sentence,
    questionIds: [...sentence.questionIds]
  };
}

export function getWEQuestionCatalog() {
  return questionCatalog.map((item) => cloneQuestion(item));
}

export function getWEQuestionById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return cloneQuestion(questionMap.get(key));
}

export function getWEQuestionsByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return getWEQuestionCatalog();
  return questionCatalog.filter((item) => item.primaryTopic === normalizedTopic).map((item) => cloneQuestion(item));
}

export function getWEQuestionsByPromptType(promptType) {
  const normalizedPromptType = String(promptType || "").trim();
  if (!normalizedPromptType) return getWEQuestionCatalog();
  return questionCatalog
    .filter((item) => item.promptType === normalizedPromptType)
    .map((item) => cloneQuestion(item));
}

export function getRelatedWEQuestions(id) {
  const question = getWEQuestionById(id);
  if (!question) return [];

  const overrideIds = relatedOverrideMap.get(question.id);
  const relatedIds = overrideIds && overrideIds.length ? overrideIds : question.relatedQuestionIds;

  return relatedIds.map((itemId) => getWEQuestionById(itemId)).filter(Boolean);
}

export function getWETemplatesByPromptType(promptType) {
  void promptType;
  return getUniversalWETemplates();
}

export function getWETemplates() {
  return templateCatalog.map((item) => cloneTemplate(item));
}

export function getUniversalWETemplates() {
  const universalTemplates = templateCatalog.filter((item) => item.isUniversal);
  if (universalTemplates.length) {
    return universalTemplates.map((item) => cloneTemplate(item));
  }
  return getWETemplates();
}

export function getDefaultWETemplate() {
  const templates = getUniversalWETemplates();
  return templates.length ? templates[0] : null;
}

export function getWETemplateById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return cloneTemplate(templateMap.get(key));
}

export function getRecommendedWETemplates(question) {
  void question;
  return getUniversalWETemplates();
}

export function getWEOpinionSentences() {
  return opinionSentenceCatalog.map((item) => cloneOpinionSentence(item));
}

export function getWEOpinionSentencesByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return getWEOpinionSentences();

  const topicKeys = LEGACY_OPINION_TOPIC_ALIAS[normalizedTopic] || [normalizedTopic];
  const topicKeySet = new Set(topicKeys);

  return opinionSentenceCatalog
    .filter((item) => topicKeySet.has(item.topicKey))
    .map((item) => cloneOpinionSentence(item));
}

export function getWEOpinionSentencesByQuestionId(questionId) {
  const normalizedQuestionId = String(questionId || "").trim();
  if (!normalizedQuestionId) return [];
  return opinionSentenceCatalog
    .filter((item) => item.questionIds.includes(normalizedQuestionId))
    .map((item) => cloneOpinionSentence(item));
}

export function getWEOpinionSentencesGroupedByStance(questionId) {
  const grouped = {
    support: [],
    against: [],
    balanced: []
  };

  const sentences = getWEOpinionSentencesByQuestionId(questionId);
  sentences.forEach((item) => {
    const stance = normalizeStance(item?.stance);
    if (!grouped[stance]) {
      grouped.balanced.push(item);
      return;
    }
    grouped[stance].push(item);
  });
  return grouped;
}

export function getWEOpinionTopics() {
  if (opinionTopics.length) {
    return opinionTopics.map((item) => ({
      ...item,
      subTopics: item.subTopics.map((subItem) => ({ ...subItem }))
    }));
  }

  const derivedTopicKeys = opinionTopicOrder.length
    ? opinionTopicOrder
    : [...new Set(opinionSentenceCatalog.map((item) => item.topicKey).filter(Boolean))];

  return derivedTopicKeys.map((topicKey) => ({
    topicKey,
    label: topicKey,
    subTopics: []
  }));
}

export function getWELinkers() {
  return toArray(linkerBankSeed?.groups).map((item) => ({
    ...item,
    phrases: [...toArray(item?.phrases)]
  }));
}

export function getWEExamplesByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return [];

  const groups = toArray(exampleBankSeed?.groups);
  const found = groups.find((item) => String(item?.primaryTopic || "").trim() === normalizedTopic);
  return toArray(found?.examples).map((item) => ({
    ...item,
    useForPromptTypes: [...toArray(item?.useForPromptTypes)]
  }));
}

export function getWERelatedQuestionIds(id) {
  const question = getWEQuestionById(id);
  if (!question) return [];

  const overrideIds = relatedOverrideMap.get(question.id);
  return overrideIds && overrideIds.length ? [...overrideIds] : [...question.relatedQuestionIds];
}

export function getWETaxonomy() {
  return {
    ...taxonomySeed,
    primaryTopics: toArray(taxonomySeed?.primaryTopics).map((item) => ({ ...item })),
    promptTypes: toArray(taxonomySeed?.promptTypes).map((item) => ({ ...item })),
    difficultyScale: toArray(taxonomySeed?.difficultyScale).map((item) => ({ ...item }))
  };
}

export function getRandomWEQuestion(excludedId = "") {
  const normalizedExcludedId = String(excludedId || "").trim();
  const pool = normalizedExcludedId ? questionCatalog.filter((item) => item.id !== normalizedExcludedId) : questionCatalog;
  if (!pool.length) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return cloneQuestion(picked);
}
