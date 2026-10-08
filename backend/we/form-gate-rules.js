const WORD_REGEX = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g;
const PUNCTUATION_REGEX = /[.!?,;:]/g;
const BULLET_LINE_REGEX = /^\s*(?:[-*•]|\d+[.)])\s+/;

const PLACEHOLDER_PATTERNS = [
  /\[[^\]]*(?:fill|insert|your|opinion|idea|example)[^\]]*\]/i,
  /\bfill\s+in\b/i,
  /\bto\s+be\s+filled\b/i,
  /\b(?:tbd|todo)\b/i,
  /\bxxx+\b/i
];

const FORM_BAND_FULL_MIN = 200;
const FORM_BAND_FULL_MAX = 300;
const FORM_BAND_PARTIAL_MIN = 120;
const FORM_BAND_PARTIAL_MID_MAX = 199;
const FORM_BAND_PARTIAL_MID_MIN = 301;
const FORM_BAND_PARTIAL_MAX = 380;

const MIN_PUNCTUATION_DENSITY = 0.005;
const FRAGMENTED_SHORT_SENTENCE_RATIO = 0.65;
const FRAGMENTED_BULLET_LINE_RATIO = 0.35;
const MAX_REPEATED_TOKEN_RATIO = 0.22;
const MIN_UNIQUE_WORD_COUNT_FOR_MEANING = 18;
const MIN_ALPHA_TOKEN_RATIO = 0.6;
const MIN_LETTER_COUNT_FOR_ALL_CAPS_CHECK = 20;
const ALL_CAPS_RATIO_THRESHOLD = 0.95;

export function analyzeWEEssayForm(essayText = "") {
  const text = `${essayText || ""}`.trim();
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const paragraphCount = text ? text.split(/\n\s*\n+/).map((chunk) => chunk.trim()).filter(Boolean).length : 0;

  const wordTokens = extractWordTokens(text);
  const wordCount = wordTokens.length;
  const uniqueWordCount = new Set(wordTokens).size;
  const maxRepeatedTokenRatio = calculateMaxRepeatedTokenRatio(wordTokens);
  const alphaTokenRatio = calculateAlphaTokenRatio(wordTokens);

  const sentenceWordCounts = splitSentenceWordCounts(text);
  const veryShortSentenceCount = sentenceWordCounts.filter((count) => count <= 4).length;
  const veryShortSentenceRatio = sentenceWordCounts.length
    ? veryShortSentenceCount / sentenceWordCounts.length
    : 1;

  const bulletLineCount = nonEmptyLines.filter((line) => BULLET_LINE_REGEX.test(line)).length;
  const bulletLineRatio = nonEmptyLines.length ? bulletLineCount / nonEmptyLines.length : 0;
  const hasBullets = bulletLineCount > 0;

  const punctuationCount = (text.match(PUNCTUATION_REGEX) || []).length;
  const hasPunctuation = punctuationCount > 0;
  const punctuationDensity = punctuationCount / Math.max(1, wordCount);

  const isAllCaps = detectAllCaps(text);
  const placeholderDetected = PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));

  const isFragmented =
    veryShortSentenceRatio >= FRAGMENTED_SHORT_SENTENCE_RATIO
    || (hasBullets && bulletLineRatio >= FRAGMENTED_BULLET_LINE_RATIO);
  const hasMissingPunctuation = !hasPunctuation || punctuationDensity < MIN_PUNCTUATION_DENSITY;

  const formZeroReasonCodes = [];
  let formScore = calculateBaseFormScore(wordCount);

  if (wordCount < FORM_BAND_PARTIAL_MIN) {
    formZeroReasonCodes.push("form_zero_word_count_too_short");
  }
  if (wordCount > FORM_BAND_PARTIAL_MAX) {
    formZeroReasonCodes.push("form_zero_word_count_too_long");
  }
  if (isAllCaps) {
    formZeroReasonCodes.push("form_zero_all_caps");
  }
  if (hasMissingPunctuation) {
    formZeroReasonCodes.push("form_zero_missing_punctuation");
  }
  if (isFragmented) {
    formZeroReasonCodes.push("form_zero_bullets_or_fragmented_sentences");
  }

  if (formZeroReasonCodes.length) {
    formScore = 0;
  }

  const isMeaningfulResponse = Boolean(
    wordCount >= 20
    && uniqueWordCount >= MIN_UNIQUE_WORD_COUNT_FOR_MEANING
    && maxRepeatedTokenRatio <= MAX_REPEATED_TOKEN_RATIO
    && alphaTokenRatio >= MIN_ALPHA_TOKEN_RATIO
    && !placeholderDetected
  );

  return {
    word_count: wordCount,
    paragraph_count: paragraphCount,
    form_score: formScore,
    is_all_caps: isAllCaps,
    has_punctuation: hasPunctuation,
    has_bullets: hasBullets,
    very_short_sentence_ratio: roundMetric(veryShortSentenceRatio),
    punctuation_density: roundMetric(punctuationDensity),
    bullet_line_ratio: roundMetric(bulletLineRatio),
    placeholder_detected: placeholderDetected,
    unique_word_count: uniqueWordCount,
    max_repeated_token_ratio: roundMetric(maxRepeatedTokenRatio),
    is_meaningful_response: isMeaningfulResponse,
    form_zero_reason_codes: dedupe(formZeroReasonCodes)
  };
}

function calculateBaseFormScore(wordCount) {
  if (wordCount >= FORM_BAND_FULL_MIN && wordCount <= FORM_BAND_FULL_MAX) {
    return 2;
  }

  if (
    (wordCount >= FORM_BAND_PARTIAL_MIN && wordCount <= FORM_BAND_PARTIAL_MID_MAX)
    || (wordCount >= FORM_BAND_PARTIAL_MID_MIN && wordCount <= FORM_BAND_PARTIAL_MAX)
  ) {
    return 1;
  }

  return 0;
}

function extractWordTokens(text) {
  const matches = `${text || ""}`.toLowerCase().match(WORD_REGEX);
  return Array.isArray(matches) ? matches : [];
}

function splitSentenceWordCounts(text) {
  const sentences = `${text || ""}`
    .split(/[.!?]+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) return [];

  return sentences
    .map((sentence) => extractWordTokens(sentence).length)
    .filter((count) => count > 0);
}

function calculateMaxRepeatedTokenRatio(tokens) {
  if (!tokens.length) return 1;

  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  let maxCount = 0;
  for (const value of counts.values()) {
    if (value > maxCount) maxCount = value;
  }

  return maxCount / tokens.length;
}

function calculateAlphaTokenRatio(tokens) {
  if (!tokens.length) return 0;
  let alphaTokenCount = 0;
  for (const token of tokens) {
    if (/[a-z]/i.test(token)) {
      alphaTokenCount += 1;
    }
  }
  return alphaTokenCount / tokens.length;
}

function detectAllCaps(text) {
  const letters = `${text || ""}`.match(/[A-Za-z]/g) || [];
  if (letters.length < MIN_LETTER_COUNT_FOR_ALL_CAPS_CHECK) return false;

  const upperLetters = `${text || ""}`.match(/[A-Z]/g) || [];
  return upperLetters.length / letters.length >= ALL_CAPS_RATIO_THRESHOLD;
}

function dedupe(list) {
  return [...new Set(list)];
}

function roundMetric(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
