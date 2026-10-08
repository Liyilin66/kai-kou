import questionCatalogSeed from "../../seeds/di/di-question-catalog.phase1.json";
import templateBankSeed from "../../seeds/di/di-template-bank.phase1.json";
import taxonomySeed from "../../seeds/di/di-taxonomy.phase1.json";
import rescuePhraseSeed from "../../seeds/di/di-rescue-phrases.phase1.json";

const VALID_HINT_LEVELS = new Set(["strong", "medium", "light"]);
const VALID_FUNCTION_TYPES = new Set([
  "opening",
  "overview",
  "detail",
  "trend",
  "comparison",
  "extreme",
  "closing",
  "rescue"
]);
const VALID_IMAGE_TYPES = new Set(["line", "bar", "pie", "table", "process", "map", "mixed"]);
const VALID_TEMPLATE_CATEGORY_KEYS = new Set([
  "data_graphs",
  "flowcharts_life_cycles",
  "maps_floor_plans"
]);
const IMAGE_TYPE_TO_TEMPLATE_CATEGORY = {
  bar: "data_graphs",
  line: "data_graphs",
  pie: "data_graphs",
  table: "data_graphs",
  mixed: "data_graphs",
  process: "flowcharts_life_cycles",
  map: "maps_floor_plans"
};
const IMAGE_TYPE_TO_TOPIC_PREFIX = {
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
  table: "Table",
  process: "Process diagram",
  map: "Map",
  mixed: "Mixed chart"
};
const GENERIC_TOPIC_WORDS = new Set([
  "trend",
  "comparison",
  "stage",
  "sequence",
  "data",
  "chart",
  "graph",
  "diagram",
  "table",
  "map",
  "figure",
  "category",
  "number",
  "numbers",
  "amount",
  "value",
  "rate",
  "percent",
  "percentage",
  "year",
  "years",
  "period"
]);

const usedQuestionIdsByPool = new Map();

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeHintLevel(value, fallback = "strong") {
  const normalized = normalizeText(value).toLowerCase();
  if (VALID_HINT_LEVELS.has(normalized)) return normalized;
  return fallback;
}

function normalizeHintLevelNullable(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";
  if (VALID_HINT_LEVELS.has(normalized)) return normalized;
  return "";
}

function normalizeFunctionType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (VALID_FUNCTION_TYPES.has(normalized)) return normalized;
  return "";
}

function normalizeImageType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (VALID_IMAGE_TYPES.has(normalized)) return normalized;
  return "";
}

function normalizeTemplateCategoryKey(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (VALID_TEMPLATE_CATEGORY_KEYS.has(normalized)) return normalized;
  return "";
}

function normalizeDifficulty(value, fallback = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num <= 1) return 1;
  if (num >= 3) return 3;
  return 2;
}

function normalizeHighFrequencyWordEntry(item) {
  const word = normalizeText(item?.word);
  if (!word) return null;
  return {
    word,
    partOfSpeech: normalizeText(item?.partOfSpeech || item?.pos),
    chinese: normalizeText(item?.chinese || item?.definitionZh || item?.defZh),
    note: normalizeText(item?.note || item?.definitionEn || item?.defEn),
    example: normalizeText(item?.example)
  };
}

function normalizeHighFrequencyWords(value) {
  return toArray(value)
    .map((item) => normalizeHighFrequencyWordEntry(item))
    .filter(Boolean);
}

function normalizeTopicToken(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function isPlaceholderDisplayTitle(value) {
  const normalized = normalizeTopicToken(value);
  if (!normalized) return true;
  return /^di\s*image\s*\d+$/.test(normalized) || /^image\s*\d+$/.test(normalized);
}

function pickQuestionTopicKeywords(words, limit = 2) {
  const picked = [];
  const seen = new Set();

  toArray(words).forEach((entry) => {
    const raw = normalizeText(entry?.word ?? entry);
    if (!raw) return;

    const token = normalizeTopicToken(raw);
    if (!token || seen.has(token) || GENERIC_TOPIC_WORDS.has(token)) return;

    seen.add(token);
    picked.push(raw);
  });

  return picked.slice(0, limit);
}

function buildQuestionTopicTitle({ imageType = "", highFrequencyWords = [], fallbackTitle = "" } = {}) {
  const normalizedImageType = normalizeImageType(imageType);
  const prefix = IMAGE_TYPE_TO_TOPIC_PREFIX[normalizedImageType] || "Image";
  const topicKeywords = pickQuestionTopicKeywords(highFrequencyWords, 2);

  if (topicKeywords.length >= 2) {
    return `${prefix}: ${topicKeywords[0]} vs ${topicKeywords[1]}`;
  }

  if (topicKeywords.length === 1) {
    return `${prefix}: ${topicKeywords[0]}`;
  }

  const normalizedFallbackTitle = normalizeText(fallbackTitle);
  if (normalizedFallbackTitle && !isPlaceholderDisplayTitle(normalizedFallbackTitle)) {
    return normalizedFallbackTitle;
  }

  return `${prefix} overview`;
}

function resolveQuestionDisplayTitle(rawDisplayTitle, topicTitle) {
  const normalizedRawTitle = normalizeText(rawDisplayTitle);
  if (normalizedRawTitle && !isPlaceholderDisplayTitle(normalizedRawTitle)) {
    return normalizedRawTitle;
  }
  return normalizeText(topicTitle) || normalizedRawTitle;
}

function resolveTemplateCategoryByImageType(imageType) {
  const normalized = normalizeImageType(imageType);
  if (!normalized) return "";
  return IMAGE_TYPE_TO_TEMPLATE_CATEGORY[normalized] || "";
}

function normalizeQuestion(item) {
  const id = normalizeText(item?.id);
  const imageType = normalizeImageType(item?.imageType);
  const keyPoints = toArray(item?.keyPoints).map((value) => normalizeText(value)).filter(Boolean);
  const highFrequencyWords = normalizeHighFrequencyWords(item?.highFrequencyWords || item?.vocab || item?.keyTerms);
  const keyTerms = highFrequencyWords.map((entry) => entry.word).filter(Boolean);
  const rawDisplayTitle = normalizeText(item?.displayTitle);
  const topicTitle = buildQuestionTopicTitle({
    imageType,
    highFrequencyWords,
    fallbackTitle: rawDisplayTitle
  });
  const displayTitle = resolveQuestionDisplayTitle(rawDisplayTitle, topicTitle);

  return {
    id,
    sourceNumberLabel: normalizeText(item?.sourceNumberLabel),
    displayTitle,
    topicTitle,
    rawDisplayTitle,
    content: normalizeText(item?.promptText || "Describe the image in detail."),
    promptText: normalizeText(item?.promptText || "Describe the image in detail."),
    imageUrl: normalizeText(item?.imageUrl),
    imageAlt: normalizeText(item?.imageAlt || displayTitle || id),
    imageType,
    subType: normalizeText(item?.subType),
    difficulty: normalizeDifficulty(item?.difficulty, 2),
    tags: toArray(item?.tags).map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean),
    isHighFrequency: Boolean(item?.isHighFrequency),
    isActive: item?.isActive !== false,
    recommendedTemplateIds: toArray(item?.recommendedTemplateIds).map((value) => normalizeText(value)).filter(Boolean),
    keyPoints,
    keyTerms,
    highFrequencyWords,
    visualFeatures: {
      hasTrend: Boolean(item?.visualFeatures?.hasTrend),
      hasComparison: Boolean(item?.visualFeatures?.hasComparison),
      hasExtreme: Boolean(item?.visualFeatures?.hasExtreme),
      hasNumbers: Boolean(item?.visualFeatures?.hasNumbers)
    }
  };
}

function normalizeTemplateCategory(item) {
  const categoryKey = normalizeTemplateCategoryKey(item?.categoryKey);
  return {
    categoryKey,
    categoryLabel: normalizeText(item?.categoryLabel),
    applicableImageTypes: toArray(item?.applicableImageTypes).map((value) => normalizeImageType(value)).filter(Boolean),
    applicableNote: normalizeText(item?.applicableNote),
    fillTips: normalizeText(item?.fillTips),
    templates: toArray(item?.templates)
  };
}

function normalizeTemplate(item, category = null) {
  const id = normalizeText(item?.id);
  const categoryKey = normalizeTemplateCategoryKey(item?.categoryKey || category?.categoryKey);
  const categoryLabel = normalizeText(item?.categoryLabel || category?.categoryLabel);
  const applicableImageTypes = toArray(item?.applicableImageTypes || item?.imageTypes || category?.applicableImageTypes)
    .map((value) => normalizeImageType(value))
    .filter(Boolean);
  const hintLevel = normalizeHintLevelNullable(item?.hintLevel);
  const notes = normalizeText(item?.notes);
  const fillTips = normalizeText(item?.fillTips || category?.fillTips);

  return {
    id,
    categoryKey,
    categoryLabel,
    title: normalizeText(item?.title),
    shortLabel: normalizeText(item?.shortLabel),
    applicableImageTypes,
    imageTypes: [...applicableImageTypes],
    templateIndex: Number.isFinite(Number(item?.templateIndex)) ? Number(item.templateIndex) : 0,
    sentence: normalizeText(item?.sentence),
    functionType: normalizeFunctionType(item?.functionType),
    hintLevel,
    skeleton: normalizeText(item?.skeleton),
    keywords: toArray(item?.keywords).map((value) => normalizeText(value)).filter(Boolean),
    slots: toArray(item?.slots).map((value) => normalizeText(value)).filter(Boolean),
    exampleFilled: normalizeText(item?.exampleFilled),
    difficulty: normalizeDifficulty(item?.difficulty, 1),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 9999,
    isActive: item?.isActive !== false,
    source: normalizeText(item?.source),
    notes,
    fillTips
  };
}

function normalizeRescuePhrase(item) {
  const id = normalizeText(item?.id);
  return {
    id,
    text: normalizeText(item?.text),
    functionType: normalizeFunctionType(item?.functionType || "rescue") || "rescue",
    hintLevel: normalizeHintLevel(item?.hintLevel, "strong"),
    tags: toArray(item?.tags).map((value) => normalizeText(value).toLowerCase()).filter(Boolean),
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 999
  };
}

const questionCatalog = toArray(questionCatalogSeed?.questions)
  .map((item) => normalizeQuestion(item))
  .filter((item) => item.id && item.imageType && item.isActive);
const questionMap = new Map(questionCatalog.map((item) => [item.id, item]));

const rawTemplateCategories = toArray(templateBankSeed?.categories)
  .map((item) => normalizeTemplateCategory(item))
  .filter((item) => item.categoryKey);

const hasCategoryStructuredTemplates = rawTemplateCategories.length > 0;

const templateCategoryCatalog = [];
const templateCatalog = [];

if (hasCategoryStructuredTemplates) {
  rawTemplateCategories.forEach((category) => {
    const normalizedTemplates = toArray(category.templates)
      .map((item) => normalizeTemplate(item, category))
      .filter((item) => item.id && item.sentence && item.categoryKey && item.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (!normalizedTemplates.length) return;

    templateCategoryCatalog.push({
      categoryKey: category.categoryKey,
      categoryLabel: category.categoryLabel || category.categoryKey,
      applicableImageTypes: [...category.applicableImageTypes],
      applicableNote: category.applicableNote,
      fillTips: category.fillTips,
      templates: normalizedTemplates
    });

    normalizedTemplates.forEach((item) => templateCatalog.push(item));
  });
} else {
  const fallbackTemplates = toArray(templateBankSeed?.blocks)
    .map((item) => normalizeTemplate(item, {
      categoryKey: "data_graphs",
      categoryLabel: "Data Graphs",
      applicableImageTypes: toArray(item?.imageTypes).map((value) => normalizeImageType(value)).filter(Boolean)
    }))
    .filter((item) => item.id && item.sentence && item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (fallbackTemplates.length) {
    templateCategoryCatalog.push({
      categoryKey: "data_graphs",
      categoryLabel: "Data Graphs",
      applicableImageTypes: ["bar", "line", "pie", "table", "mixed"],
      applicableNote: "",
      fillTips: "",
      templates: fallbackTemplates
    });
    fallbackTemplates.forEach((item) => templateCatalog.push(item));
  }
}

templateCatalog.sort((a, b) => a.sortOrder - b.sortOrder);
const templateMap = new Map(templateCatalog.map((item) => [item.id, item]));

const rescuePhraseCatalog = toArray(rescuePhraseSeed?.phrases)
  .map((item) => normalizeRescuePhrase(item))
  .filter((item) => item.id && item.text)
  .sort((a, b) => a.sortOrder - b.sortOrder);

const taxonomy = {
  version: normalizeText(taxonomySeed?.version || "phase1"),
  taskType: normalizeText(taxonomySeed?.taskType || "DI"),
  imageTypes: toArray(taxonomySeed?.imageTypes).map((item) => ({
    id: normalizeImageType(item?.id),
    label: normalizeText(item?.label || item?.id),
    description: normalizeText(item?.description)
  })).filter((item) => item.id),
  functionTypes: toArray(taxonomySeed?.functionTypes).map((item) => ({
    id: normalizeFunctionType(item?.id),
    label: normalizeText(item?.label || item?.id)
  })).filter((item) => item.id),
  difficultyScale: toArray(taxonomySeed?.difficultyScale).map((item) => ({
    value: normalizeDifficulty(item?.value, 2),
    label: normalizeText(item?.label || "Medium"),
    description: normalizeText(item?.description)
  })),
  hintLevels: toArray(taxonomySeed?.hintLevels).map((value) => normalizeHintLevel(value, "")).filter(Boolean),
  editorialRules: toArray(taxonomySeed?.editorialRules).map((value) => normalizeText(value)).filter(Boolean),
  templateCategories: templateCategoryCatalog.map((category) => ({
    categoryKey: category.categoryKey,
    categoryLabel: category.categoryLabel,
    applicableImageTypes: [...category.applicableImageTypes],
    applicableNote: category.applicableNote,
    fillTips: category.fillTips
  }))
};

function cloneQuestion(item) {
  return {
    ...item,
    tags: [...item.tags],
    recommendedTemplateIds: [...item.recommendedTemplateIds],
    keyPoints: [...toArray(item?.keyPoints)],
    keyTerms: [...toArray(item?.keyTerms)],
    highFrequencyWords: toArray(item?.highFrequencyWords).map((word) => ({ ...word })),
    visualFeatures: { ...item.visualFeatures }
  };
}

function cloneTemplate(item) {
  return {
    ...item,
    applicableImageTypes: [...item.applicableImageTypes],
    imageTypes: [...item.imageTypes],
    keywords: [...item.keywords],
    slots: [...item.slots]
  };
}

function cloneTemplateCategory(item) {
  return {
    categoryKey: item.categoryKey,
    categoryLabel: item.categoryLabel,
    applicableImageTypes: [...item.applicableImageTypes],
    applicableNote: item.applicableNote,
    fillTips: item.fillTips,
    templates: item.templates.map((template) => cloneTemplate(template))
  };
}

function cloneRescuePhrase(item) {
  return {
    ...item,
    tags: [...item.tags]
  };
}

function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))];
  }
  const text = normalizeText(value).toLowerCase();
  return text ? [text] : [];
}

function normalizeBooleanFilter(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

function normalizeDifficultyFilter(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeDifficulty(value, 0);
  if (normalized >= 1 && normalized <= 3) return normalized;
  return null;
}

function createPoolKey({ imageType = "", difficulty = null, tags = [], highFreq = null } = {}) {
  return JSON.stringify({
    imageType: normalizeImageType(imageType),
    difficulty: normalizeDifficultyFilter(difficulty),
    tags: normalizeTagList(tags).sort(),
    highFreq: normalizeBooleanFilter(highFreq)
  });
}

function isTemplateHintMatched(item, normalizedHintLevel) {
  if (!normalizedHintLevel) return true;
  if (!item.hintLevel) return true;
  return item.hintLevel === normalizedHintLevel;
}

export function normalizeDIHintLevel(value, fallback = "strong") {
  return normalizeHintLevel(value, fallback);
}

export function getDITaxonomy() {
  return {
    ...taxonomy,
    imageTypes: taxonomy.imageTypes.map((item) => ({ ...item })),
    functionTypes: taxonomy.functionTypes.map((item) => ({ ...item })),
    difficultyScale: taxonomy.difficultyScale.map((item) => ({ ...item })),
    hintLevels: [...taxonomy.hintLevels],
    editorialRules: [...taxonomy.editorialRules],
    templateCategories: taxonomy.templateCategories.map((item) => ({
      ...item,
      applicableImageTypes: [...item.applicableImageTypes]
    }))
  };
}

export function getDIQuestionCatalog() {
  return questionCatalog.map((item) => cloneQuestion(item));
}

export function getDIQuestionById(id) {
  const key = normalizeText(id);
  if (!key) return null;
  const found = questionMap.get(key);
  return found ? cloneQuestion(found) : null;
}

export function getDIQuestionsByFilters(filters = {}) {
  const normalizedImageType = normalizeImageType(filters?.imageType);
  const normalizedDifficulty = normalizeDifficultyFilter(filters?.difficulty);
  const normalizedTags = normalizeTagList(filters?.tags);
  const highFreq = normalizeBooleanFilter(filters?.highFreq);
  const practicedOnly = normalizeBooleanFilter(filters?.practiced) === true;
  const weakOnly = normalizeBooleanFilter(filters?.weakOnly) === true;
  const practicedQuestionIds = new Set(
    toArray(filters?.practicedQuestionIds).map((item) => normalizeText(item)).filter(Boolean)
  );
  const weakImageTypeSet = new Set(
    toArray(filters?.weakImageTypes).map((item) => normalizeImageType(item)).filter(Boolean)
  );

  return questionCatalog
    .filter((item) => {
      if (normalizedImageType && item.imageType !== normalizedImageType) return false;
      if (normalizedDifficulty && item.difficulty !== normalizedDifficulty) return false;
      if (highFreq !== null && item.isHighFrequency !== highFreq) return false;
      if (normalizedTags.length && !normalizedTags.every((tag) => item.tags.includes(tag))) return false;
      if (practicedOnly && !practicedQuestionIds.has(item.id)) return false;
      if (weakOnly && weakImageTypeSet.size && !weakImageTypeSet.has(item.imageType)) return false;
      return true;
    })
    .map((item) => cloneQuestion(item));
}

export function getRandomDIQuestion({ excludedId = "", filters = {} } = {}) {
  const normalizedExcludedId = normalizeText(excludedId);
  const filteredQuestions = getDIQuestionsByFilters(filters).filter((item) => item.id !== normalizedExcludedId);
  if (!filteredQuestions.length) return null;

  const poolKey = createPoolKey(filters);
  let usedSet = usedQuestionIdsByPool.get(poolKey);
  if (!usedSet) {
    usedSet = new Set();
    usedQuestionIdsByPool.set(poolKey, usedSet);
  }

  if (usedSet.size >= filteredQuestions.length) {
    usedSet.clear();
  }

  const available = filteredQuestions.filter((item) => !usedSet.has(item.id));
  const pool = available.length ? available : filteredQuestions;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (picked?.id) {
    usedSet.add(picked.id);
  }
  return picked ? cloneQuestion(picked) : null;
}

export function clearDIQuestionCycle(filters = null) {
  if (!filters) {
    usedQuestionIdsByPool.clear();
    return;
  }
  const key = createPoolKey(filters);
  usedQuestionIdsByPool.delete(key);
}

export function getDITemplateCategories({ imageType = "", hintLevel = "" } = {}) {
  const normalizedImageType = normalizeImageType(imageType);
  const normalizedHintLevel = normalizeHintLevel(hintLevel, "");
  const categoryByImageType = resolveTemplateCategoryByImageType(normalizedImageType);

  return templateCategoryCatalog
    .filter((category) => !categoryByImageType || category.categoryKey === categoryByImageType)
    .map((category) => {
      const templates = category.templates
        .filter((item) => {
          if (normalizedImageType && !item.applicableImageTypes.includes(normalizedImageType)) return false;
          if (categoryByImageType && item.categoryKey !== categoryByImageType) return false;
          if (!isTemplateHintMatched(item, normalizedHintLevel)) return false;
          return true;
        })
        .map((item) => cloneTemplate(item));

      return {
        ...cloneTemplateCategory(category),
        templates
      };
    })
    .filter((category) => category.templates.length > 0);
}

export function getDITemplates() {
  return templateCatalog.map((item) => cloneTemplate(item));
}

export function getDITemplateById(id) {
  const key = normalizeText(id);
  if (!key) return null;
  const found = templateMap.get(key);
  return found ? cloneTemplate(found) : null;
}

export function getDITemplatesByImageType(imageType) {
  const normalizedImageType = normalizeImageType(imageType);
  if (!normalizedImageType) return getDITemplates();
  const categoryByImageType = resolveTemplateCategoryByImageType(normalizedImageType);
  return templateCatalog
    .filter((item) => {
      if (!item.applicableImageTypes.includes(normalizedImageType)) return false;
      if (categoryByImageType && item.categoryKey !== categoryByImageType) return false;
      return true;
    })
    .map((item) => cloneTemplate(item));
}

export function getDITemplatesByFunctionType(functionType) {
  const normalizedFunctionType = normalizeFunctionType(functionType);
  if (!normalizedFunctionType) return getDITemplates();
  return templateCatalog
    .filter((item) => item.functionType === normalizedFunctionType)
    .map((item) => cloneTemplate(item));
}

export function getDITemplatesByHintLevel(hintLevel) {
  const normalizedHintLevel = normalizeHintLevel(hintLevel, "");
  if (!normalizedHintLevel) return getDITemplates();
  return templateCatalog
    .filter((item) => isTemplateHintMatched(item, normalizedHintLevel))
    .map((item) => cloneTemplate(item));
}

export function getDITemplatesByFilters({ imageType = "", functionType = "", hintLevel = "", categoryKey = "" } = {}) {
  const normalizedImageType = normalizeImageType(imageType);
  const normalizedFunctionType = normalizeFunctionType(functionType);
  const normalizedHintLevel = normalizeHintLevel(hintLevel, "");
  const normalizedCategoryKey = normalizeTemplateCategoryKey(categoryKey);
  const categoryByImageType = resolveTemplateCategoryByImageType(normalizedImageType);
  const effectiveCategoryKey = normalizedCategoryKey || categoryByImageType;

  return templateCatalog
    .filter((item) => {
      if (normalizedImageType && !item.applicableImageTypes.includes(normalizedImageType)) return false;
      if (normalizedFunctionType && item.functionType !== normalizedFunctionType) return false;
      if (effectiveCategoryKey && item.categoryKey !== effectiveCategoryKey) return false;
      if (!isTemplateHintMatched(item, normalizedHintLevel)) return false;
      return true;
    })
    .map((item) => cloneTemplate(item));
}

export function getDIRescuePhrases({ hintLevel = "" } = {}) {
  const normalizedHintLevel = normalizeHintLevel(hintLevel, "");
  return rescuePhraseCatalog
    .filter((item) => !normalizedHintLevel || item.hintLevel === normalizedHintLevel)
    .map((item) => cloneRescuePhrase(item));
}

export function getDIRescuePhrasesByHintLevel(hintLevel) {
  return getDIRescuePhrases({ hintLevel });
}
