import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { RTS_FALLBACK_QUESTIONS } from "@/data/rtsFallbackQuestions";

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

const RTS_AUDIO_BUCKET = "question-audio";
const RTS_AUDIO_FOLDER = "rts";
const PRACTICE_AUDIO_BUCKET = "practice-audio";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 30;
const DYNAMIC_TEMPLATE_GENERATOR_VERSION = "v5";
const DYNAMIC_TEMPLATE_CACHE_KEY = "RTS_DYNAMIC_TEMPLATE_CACHE_V5";
const LEGACY_DYNAMIC_TEMPLATE_CACHE_KEYS = ["RTS_DYNAMIC_TEMPLATE_CACHE_V4", "RTS_DYNAMIC_TEMPLATE_CACHE_V3"];
const RTS_HISTORY_DEBUG_ENABLED = Boolean(import.meta.env.DEV);
const RTS_RETENTION_KEEP_COUNT = 20;
const RTS_RETENTION_PAGE_SIZE = 200;
const RTS_RETENTION_DEBUG_ENABLED = Boolean(import.meta.env.DEV);

const TONE_LABEL_MAP = {
  formal: "正式语气",
  informal: "非正式语气",
  "semi-formal": "半正式语气"
};

export const RTS_TOPIC_META = {
  work: {
    key: "work",
    label: "学业事务",
    shortLabel: "学业",
    tag: "Academic",
    emoji: "📗",
    badgeClass: "bg-[#E1F5EE] text-[#085041]"
  },
  daily: {
    key: "daily",
    label: "日常安排",
    shortLabel: "日常",
    tag: "Daily",
    emoji: "🗓",
    badgeClass: "bg-[#EEF2FF] text-[#2F3C8F]"
  },
  service: {
    key: "service",
    label: "服务沟通",
    shortLabel: "服务",
    tag: "Service",
    emoji: "🛎️",
    badgeClass: "bg-[#FAEEDA] text-[#633806]"
  },
  social: {
    key: "social",
    label: "社交协作",
    shortLabel: "社交",
    tag: "Social",
    emoji: "🤝",
    badgeClass: "bg-[#EEEDFE] text-[#3C3489]"
  }
};

const RTS_TOPIC_ORDER = ["work", "daily", "service", "social"];
const MOCK_RTS_QUESTIONS = RTS_FALLBACK_QUESTIONS;

const FORMAL_HINTS = [
  "professor",
  "teacher",
  "tutor",
  "lecturer",
  "librarian",
  "manager",
  "officer",
  "inspector",
  "staff",
  "accommodation",
  "maintenance"
];

const INFORMAL_HINTS = [
  "friend",
  "classmate",
  "roommate",
  "flatmate",
  "neighbor",
  "wife",
  "tom",
  "lisa",
  "sam",
  "guys"
];

const DYNAMIC_INTENT_HINTS = {
  advice: ["advice", "recommend", "suggest", "calm down", "encourage"],
  report: ["report", "not working", "broken", "damaged", "missing", "locked", "run out of battery", "repair"],
  reschedule: ["alternative arrangement", "extension", "change the time", "double booked", "late", "missed the deadline", "at the same time"],
  boundary: ["too noisy", "disappearing", "copy your", "dirty common areas", "keeps talking", "without asking"],
  initiative: ["volunteer", "interested in", "participating", "enroll", "research project"],
  decline: ["cannot attend", "cannot join", "can't attend", "can't join", "cannot commit"],
  correction: ["made a mistake", "correct this information", "wrong address", "actually at"],
  coordination: ["group assignment", "what you can do", "switch rooms", "hasn't sent", "has not finished", "check back"],
  help: ["help", "borrow", "lend", "guidance", "notes"]
};

const TEMPLATE_OPENER_BANK = {
  formal: [
    "Hello, could I talk to you for a minute?",
    "Excuse me, may I explain my situation briefly?",
    "Hi, I need to discuss a small problem with you."
  ],
  informal: [
    "Hi [name], can we talk for a minute?",
    "Hey [name], do you have a minute?",
    "Hi, I need your help with something."
  ],
  "semi-formal": [
    "Hi [name], could we talk for a minute?",
    "Hello, I need to explain this situation.",
    "Hi, could I explain this quickly?"
  ]
};

const TEMPLATE_REQUEST_BANK = {
  advice: "Could you try one small step first and see how it goes?",
  report: "Could you please check this and tell me what I should do next?",
  reschedule: "Could we change to another time, or can I have a short extension?",
  boundary: "Could we set one clear rule so this does not happen again?",
  initiative: "Could you tell me the start time and what I need to prepare?",
  decline: "I cannot join this time. Can I help in another way?",
  correction: "Please use the correct information and ignore my last message.",
  coordination: "Can we confirm the new plan and who will do each part?",
  help: "Could you please help me with this when you have a moment?",
  general: "Could we talk about the best next step?"
};

const TEMPLATE_SUPPORT_BANK = {
  advice: "I hope this can help you feel more confident.",
  report: "This is affecting my study, so I hope it can be fixed soon.",
  reschedule: "I still want to finish the task well and on time.",
  boundary: "I want to solve this politely and keep a good relationship.",
  initiative: "I am ready to join and do my part.",
  decline: "I really appreciate the invitation and hope you understand.",
  correction: "I wanted to fix this right away so there is no confusion.",
  coordination: "I want us to stay on the same plan and finish on time.",
  help: "I am asking early so we can solve this faster.",
  general: "I am happy to follow any reasonable arrangement."
};

const TEMPLATE_CLOSING_BANK = {
  formal: "Thank you for your understanding and support.",
  informal: "Thanks a lot for understanding.",
  "semi-formal": "Thank you for understanding and helping out."
};

const EN_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "to",
  "of",
  "for",
  "from",
  "in",
  "on",
  "at",
  "by",
  "with",
  "without",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "done",
  "can",
  "could",
  "would",
  "should",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
  "i",
  "you",
  "your",
  "yours",
  "my",
  "me",
  "we",
  "our",
  "ours",
  "he",
  "she",
  "they",
  "them",
  "it",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "just",
  "very",
  "really",
  "about",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "how",
  "into",
  "also",
  "still",
  "much",
  "more",
  "most",
  "some",
  "any",
  "all",
  "few",
  "many",
  "lot"
]);

let cachedQuestions = null;
let cachedSource = "mock";
let dynamicTemplateCache = null;
let lastRTSRecentAudioHistoryDebug = {
  fetchedCount: 0,
  validRemoteAudioCount: 0,
  topAudioMeta: []
};

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toSafeString(value) {
  return `${value || ""}`.trim();
}

function toSafeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => `${item || ""}`.trim()).filter(Boolean);
}

function parseJsonLike(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return toObject(value);
}

function normalizeTaskType(value) {
  return toSafeString(value).toUpperCase();
}

function resolveHistoryRecordTaskType(record) {
  const source = toObject(record) || {};
  const direct = normalizeTaskType(source?.taskType || source?.task_type);
  if (direct) return direct;
  const scoreJson = parseScoreJson(source?.score_json);
  return normalizeTaskType(scoreJson?.taskType || scoreJson?.task_type);
}

function summarizeHistoryAudioMeta(record) {
  const source = toObject(record) || {};
  const audioMeta = normalizeAudioMeta(
    source?.audioMeta
    || source?.audio
    || source?.score_json?.audio
  );
  return {
    id: toSafeString(source?.id),
    questionId: toSafeString(source?.questionId || source?.question_id),
    bucket: toSafeString(audioMeta?.bucket),
    path: toSafeString(audioMeta?.path)
  };
}

function updateRecentAudioHistoryDebug({ fetchedCount = 0, validRemoteAudioCount = 0, topAudioMeta = [] } = {}) {
  lastRTSRecentAudioHistoryDebug = {
    fetchedCount: Math.max(0, Number(fetchedCount || 0)),
    validRemoteAudioCount: Math.max(0, Number(validRemoteAudioCount || 0)),
    topAudioMeta: Array.isArray(topAudioMeta) ? topAudioMeta.slice(0, 3) : []
  };
}

export function getLastRTSRecentAudioHistoryDebug() {
  return {
    fetchedCount: Math.max(0, Number(lastRTSRecentAudioHistoryDebug?.fetchedCount || 0)),
    validRemoteAudioCount: Math.max(0, Number(lastRTSRecentAudioHistoryDebug?.validRemoteAudioCount || 0)),
    topAudioMeta: Array.isArray(lastRTSRecentAudioHistoryDebug?.topAudioMeta)
      ? [...lastRTSRecentAudioHistoryDebug.topAudioMeta]
      : []
  };
}

function normalizeWhitespace(text) {
  return toSafeString(text).replace(/\s+/g, " ");
}

function toLower(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function sentenceCase(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";
  return normalized.replace(/(^|[.!?]\s+)([a-z])/g, (matched, lead, ch) => `${lead}${ch.toUpperCase()}`);
}

function polishGeneratedEnglish(text) {
  return sentenceCase(text)
    .replace(/\bfollow the schedule to complete housework\b/gi, "follow the cleaning schedule")
    .replace(/\bfor making this call\b/gi, "for this call")
    .replace(/\bone of them are\b/gi, "one of them is")
    .replace(/\bmy phone run out of battery\b/gi, "my phone ran out of battery")
    .replace(/\bin fridge\b/gi, "in the fridge")
    .replace(/\btwo pages has been\b/gi, "two pages have been")
    .replace(/\binfluences my sleep\b/gi, "affects my sleep")
    .replace(/\bsome saving\b/gi, "some savings")
    .replace(/\bvisitor of my roommate\b/gi, "my roommate's visitor");
}

function normalizeTopic(value) {
  const normalized = toSafeString(value).toLowerCase();
  if (RTS_TOPIC_META[normalized]) return normalized;
  return "daily";
}

function normalizeTone(value) {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === "formal" || normalized === "informal" || normalized === "semi-formal") return normalized;
  return "semi-formal";
}

function normalizeDirections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source = toObject(item) || {};
      return {
        head: toSafeString(source.head),
        body: toSafeString(source.body),
        eg: toSafeString(source.eg)
      };
    })
    .filter((item) => item.head || item.body || item.eg)
    .slice(0, 3);
}

function normalizePhrases(value) {
  const source = toObject(value) || {};
  return {
    opening: toSafeArray(source.opening),
    request: toSafeArray(source.request),
    closing: toSafeArray(source.closing)
  };
}

function normalizeKeyPoints(value) {
  const source = parseJsonLike(value) || {};
  const tone = normalizeTone(source.tone);
  const directions = normalizeDirections(source.directions);
  return {
    role: toSafeString(source.role),
    tone,
    toneLabel: toSafeString(source.toneLabel) || TONE_LABEL_MAP[tone],
    directions,
    templateOpener: toSafeString(source.templateOpener),
    templateFull: toSafeString(source.templateFull),
    phrases: normalizePhrases(source.phrases),
    tips: toSafeArray(source.tips).slice(0, 8)
  };
}

function normalizeDifficulty(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(3, Math.round(number)));
}

function splitSentences(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureSentence(text) {
  const normalized = polishGeneratedEnglish(text);
  if (!normalized) return "";
  if (/[.!?]$/.test(normalized)) return normalized;
  return `${normalized}.`;
}

function truncateWords(text, maxWords = 20) {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function uniqueList(list, limit = 4) {
  const seen = new Set();
  const output = [];
  for (const item of list) {
    const normalized = normalizeWhitespace(item).replace(/[,.!?;:\-\s]+$/, "");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function stripQuestionTail(content) {
  return normalizeWhitespace(content)
    .replace(/\s*what would you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what should you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what will you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what do you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what are you going to say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how would you(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how do you(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what would i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what should i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what do i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how would i(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how do i(?:[^.?!]*)?\??\s*$/i, "")
    .trim();
}

function toFirstPersonNarration(text) {
  return normalizeWhitespace(text)
    .replace(/\b[Yy]ou\'ve\b/g, "I've")
    .replace(/\b[Yy]ou\'re\b/g, "I'm")
    .replace(/\b[Yy]ou are\b/g, "I am")
    .replace(/\b[Yy]ou were\b/g, "I was")
    .replace(/\b[Yy]ou have\b/g, "I have")
    .replace(/\b[Yy]ou need to\b/g, "I need to")
    .replace(/\b[Yy]ou need\b/g, "I need")
    .replace(/\b[Yy]ou want to\b/g, "I want to")
    .replace(/\b[Yy]ou want\b/g, "I want")
    .replace(/\b[Yy]ou can\b/g, "I can")
    .replace(/\b[Yy]ou cannot\b/g, "I cannot")
    .replace(/\b[Yy]ou should\b/g, "I should")
    .replace(/\b[Yy]ou must\b/g, "I must")
    .replace(/\b[Yy]ou just\b/g, "I just")
    .replace(/\b[Yy]our\b/g, "my")
    .replace(/\bhelp you\b/gi, "help me")
    .replace(/\bfor you\b/gi, "for me")
    .replace(/\bwith you\b/gi, "with me")
    .replace(/\bto you\b/gi, "to me")
    .replace(/^you\b/i, "I")
    .replace(/^I and my ([a-z][a-z\s'-]+?) have\b/i, "My $1 and I have")
    .replace(/\b[Ii]\s+decide to\b/g, "I decide to")
    .replace(/\b[Ii]\s+want to\s+ask\b/g, "I want to ask")
    .replace(/\b[Ii]\s+need to\s+call\b/g, "I need to call")
    .replace(/^i\b/, "I");
}

function isInstructionSentence(text) {
  const lower = toLower(text);
  return /what would (you|i) say|what should (you|i) say|what will (you|i) say|what do (you|i) say|what are (you|i) going to say|how would (you|i)|how do (you|i)|what should you say to|how do you ask|how would you explain/.test(lower);
}

function cleanScenarioLines(lines = []) {
  return lines
    .map((line) => polishGeneratedEnglish(line))
    .map((line) => line.replace(/\bI and my ([a-z][a-z\s'-]+?)\b/gi, "my $1 and I"))
    .map((line) => line.replace(/^[,;:\-\s]+/, "").replace(/[,:;-\s]+$/, ""))
    .filter(Boolean)
    .filter((line) => !isInstructionSentence(line));
}

function normalizeSentenceKey(text) {
  return normalizeWhitespace(text).toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function sentenceTokenSet(text) {
  return new Set(normalizeSentenceKey(text).split(/\s+/).filter(Boolean));
}

function sentenceSimilarity(a, b) {
  const aTokens = sentenceTokenSet(a);
  const bTokens = sentenceTokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function dedupeSentences(list, limit = 5) {
  const output = [];
  for (const line of list) {
    const sentence = ensureSentence(line);
    if (!sentence) continue;
    const key = normalizeSentenceKey(sentence);
    if (!key) continue;
    if (output.some((existing) => sentenceSimilarity(existing, sentence) >= 0.84)) continue;
    output.push(sentence);
    if (output.length >= limit) break;
  }
  return output;
}

function splitScenarioClauses(text) {
  const normalized = normalizeWhitespace(text)
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[!?]+/g, ".")
    .replace(/\s*;\s*/g, ". ")
    .replace(/\s*,\s*(but|and|so|because|while|however|which)\b/gi, ". ");

  return normalized
    .split(/(?<=[.])\s+|\.\s+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function inferIntent(content) {
  const lower = toLower(content);
  for (const [intent, hints] of Object.entries(DYNAMIC_INTENT_HINTS)) {
    if (hints.some((hint) => lower.includes(hint))) return intent;
  }
  return "general";
}

function buildTemplateSeed(content, tone, intent) {
  const source = `${normalizeWhitespace(content)}|${tone}|${intent}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0; // keep 32-bit integer
  }
  return Math.abs(hash);
}

function pickBySeed(list, seed = 0) {
  if (!Array.isArray(list) || !list.length) return "";
  const safeSeed = Math.abs(Number(seed || 0));
  return list[safeSeed % list.length];
}

function buildOpenerLine(tone, seed) {
  return pickBySeed(TEMPLATE_OPENER_BANK[tone] || TEMPLATE_OPENER_BANK["semi-formal"], seed)
    || TEMPLATE_OPENER_BANK["semi-formal"][0];
}

function buildContextLine(scenarioLines, intent) {
  const preferMatchers = {
    report: /\b(broken|not working|damaged|missing|locked|battery|problem)\b/i,
    reschedule: /\b(conflict|double booked|late|deadline|same time|meeting|competition)\b/i,
    boundary: /\b(noisy|talking|dirty|without asking|copy|disappearing)\b/i,
    correction: /\b(mistake|wrong|correct|actually)\b/i,
    initiative: /\b(interested|volunteer|join|project|enroll)\b/i,
    decline: /\b(cannot|can't|cannot attend|cannot join|final year)\b/i,
    coordination: /\b(group|deadline|hasn'?t sent|not finished|switch rooms)\b/i,
    help: /\b(help|borrow|lend|notes|guidance)\b/i
  };

  const matcher = preferMatchers[intent];
  const picked = scenarioLines.find((line) => matcher && matcher.test(line))
    || scenarioLines[0]
    || "I have a situation that needs a quick solution";

  const normalized = normalizeWhitespace(picked)
    .replace(/^(and|but|so|because)\s+/i, "")
    .replace(/^I\s+am\s+calling\s+to\s+say\s+/i, "I am calling because ");

  return normalized.startsWith("I ") || normalized.startsWith("I'm")
    ? normalized
    : `I am calling because ${normalized}`;
}

function buildSecondContextLine(scenarioLines, primaryLine = "") {
  const candidate = scenarioLines.find((line) => sentenceSimilarity(line, primaryLine) < 0.7 && line.split(/\s+/).length >= 4);
  if (!candidate) return "";

  const normalized = normalizeWhitespace(candidate).replace(/^(and|but|so|because)\s+/i, "");
  if (!normalized) return "";

  if (normalized.startsWith("I ") || normalized.startsWith("I'm")) return normalized;
  return `Also, ${normalized}`;
}

function buildRequestLine(intent) {
  return TEMPLATE_REQUEST_BANK[intent] || TEMPLATE_REQUEST_BANK.general;
}

function buildSupportLine(intent) {
  return TEMPLATE_SUPPORT_BANK[intent] || TEMPLATE_SUPPORT_BANK.general;
}

function buildActionLine(content) {
  const source = normalizeWhitespace(content);
  const patterns = [
    /\byou need to\s+([^.!?]+)/i,
    /\byou want to\s+([^.!?]+)/i,
    /\byou have to\s+([^.!?]+)/i,
    /\byou decide to\s+([^.!?]+)/i,
    /\byou are planning to\s+([^.!?]+)/i,
    /\byou are interested in\s+([^.!?]+)/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;

    const phrase = toFirstPersonNarration(match[1])
      .replace(/^I\s+/i, "")
      .replace(/\s*[,;:]\s*$/g, "")
      .trim();

    if (!phrase) continue;
    return ensureSentence(truncateWords(`I need to ${phrase}`, 20));
  }

  return "";
}

function inferAudience(content, fallbackRole = "") {
  const combined = `${toLower(content)} ${toLower(fallbackRole)}`;
  if (combined.includes("professor") || combined.includes("teacher") || combined.includes("tutor") || combined.includes("lecturer")) return "your professor or teacher";
  if (combined.includes("librarian") || combined.includes("library staff")) return "library staff";
  if (combined.includes("manager") || combined.includes("officer") || combined.includes("inspector") || combined.includes("maintenance team")) return "the relevant staff member";
  if (combined.includes("roommate") || combined.includes("flatmate") || combined.includes("neighbor")) return "your roommate or neighbor";
  if (combined.includes("friend") || combined.includes("classmate")) return "your friend or classmate";
  return "the other person";
}

function inferTone(content, topic, fallbackTone = "") {
  const explicit = normalizeTone(fallbackTone);
  if (explicit !== "semi-formal") return explicit;

  const lower = toLower(content);
  if (FORMAL_HINTS.some((item) => lower.includes(item)) || topic === "service") return "formal";
  if (INFORMAL_HINTS.some((item) => lower.includes(item)) || topic === "social") return "informal";
  return "semi-formal";
}

function extractKeywords(content, limit = 6) {
  const words = (normalizeWhitespace(content).toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [])
    .filter((word) => !EN_STOPWORDS.has(word));
  return uniqueList(words, limit);
}

function buildTemplateFromQuestion(content, tone) {
  const intent = inferIntent(content);
  const scenarioText = stripQuestionTail(content);
  const firstPersonText = toFirstPersonNarration(scenarioText);
  const scenarioLines = cleanScenarioLines(splitScenarioClauses(firstPersonText));
  const seed = buildTemplateSeed(content, tone, intent);
  const opener = ensureSentence(buildOpenerLine(tone, seed));
  const detail = buildContextLine(scenarioLines, intent);
  const detailTwo = buildSecondContextLine(scenarioLines, detail);
  const action = buildActionLine(content);
  const request = buildRequestLine(intent);
  const support = buildSupportLine(intent);
  const closing = TEMPLATE_CLOSING_BANK[tone] || TEMPLATE_CLOSING_BANK["semi-formal"];

  const full = dedupeSentences([
    opener,
    detail,
    detailTwo,
    action,
    request,
    support,
    closing
  ], 6).join(" ");

  return {
    opener,
    full,
    scenarioLines,
    intent
  };
}

function buildDynamicPhrases(templatePayload, fallbackPhrases = {}) {
  const sentences = splitSentences(templatePayload.full);
  const requestLike = sentences.filter((item) => /\b(could|would|can|please|may)\b/i.test(item));
  const closingLike = sentences.filter((item) => /\b(thank|thanks|appreciate|sorry|promise)\b/i.test(item));

  return {
    opening: uniqueList([
      templatePayload.opener,
      sentences[0],
      ...(fallbackPhrases.opening || [])
    ], 4),
    request: uniqueList([
      ...requestLike,
      ...(fallbackPhrases.request || []),
      sentences[1],
      sentences[2]
    ], 4),
    closing: uniqueList([
      ...closingLike,
      ...(fallbackPhrases.closing || []),
      sentences[sentences.length - 1]
    ], 4)
  };
}

function buildDynamicDirections(content, templatePayload, fallbackDirections = []) {
  const scenarioSnippet = truncateWords(templatePayload.scenarioLines[0] || stripQuestionTail(content), 18);
  const requestSentence = splitSentences(templatePayload.full).find((item) => /\b(could|would|can|please|may)\b/i.test(item)) || "Could you please help me with this situation?";

  const generated = [
    {
      head: "先复述题目情景",
      body: `直接用题目关键词说明场景：${scenarioSnippet}。`,
      eg: ensureSentence(truncateWords(templatePayload.opener, 18))
    },
    {
      head: "再表达核心需求",
      body: "说明你的困难，再提出一个明确请求。",
      eg: ensureSentence(truncateWords(requestSentence, 18))
    },
    {
      head: "最后礼貌收尾",
      body: "确认后续安排并表达感谢。",
      eg: ensureSentence("Thank you for understanding and helping me.")
    }
  ];

  return generated.map((item, index) => ({
    head: item.head,
    body: item.body,
    eg: item.eg || fallbackDirections[index]?.eg || ""
  }));
}

function buildDynamicTips(content, fallbackTips = []) {
  const keywords = extractKeywords(content, 6);
  const keywordLabel = keywords.length ? keywords.join(", ") : "key scenario words";

  return uniqueList([
    `尽量复用题干关键词：${keywordLabel}`,
    "把题目里的 You/Your 改成 I/My 来作答。",
    "先交代情况，再给出请求，最后礼貌收尾。",
    "避免泛泛表达，优先说题目里出现的具体细节。",
    ...(fallbackTips || [])
  ], 6);
}

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function purgeLegacyDynamicTemplateCaches(storage) {
  if (!storage) return;
  for (const key of LEGACY_DYNAMIC_TEMPLATE_CACHE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage removal errors
    }
  }
}

function loadDynamicTemplateCache() {
  if (dynamicTemplateCache && typeof dynamicTemplateCache === "object") return dynamicTemplateCache;
  dynamicTemplateCache = {};

  const storage = getLocalStorage();
  if (!storage) return dynamicTemplateCache;
  purgeLegacyDynamicTemplateCaches(storage);

  try {
    const raw = storage.getItem(DYNAMIC_TEMPLATE_CACHE_KEY);
    if (!raw) return dynamicTemplateCache;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      dynamicTemplateCache = parsed;
    }
  } catch {
    dynamicTemplateCache = {};
  }

  return dynamicTemplateCache;
}

function persistDynamicTemplateCache(cache) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(DYNAMIC_TEMPLATE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

function buildTemplateSignature(content) {
  return `${DYNAMIC_TEMPLATE_GENERATOR_VERSION}:${toLower(content)}`;
}

function getCachedDynamicKeyPoints(questionId, signature) {
  const key = toSafeString(questionId);
  if (!key || !signature) return null;
  const cache = loadDynamicTemplateCache();
  const item = toObject(cache[key]);
  if (!item) return null;
  if (toSafeString(item.signature) !== signature) return null;
  if (toSafeString(item.generatorVersion) !== DYNAMIC_TEMPLATE_GENERATOR_VERSION) return null;
  return toObject(item.keyPoints);
}

function saveDynamicKeyPoints(questionId, signature, keyPoints) {
  const key = toSafeString(questionId);
  if (!key || !signature || !toObject(keyPoints)) return;
  const cache = loadDynamicTemplateCache();
  cache[key] = {
    signature,
    generatorVersion: DYNAMIC_TEMPLATE_GENERATOR_VERSION,
    updatedAt: new Date().toISOString(),
    keyPoints
  };
  dynamicTemplateCache = cache;
  persistDynamicTemplateCache(cache);
}

function buildDynamicKeyPoints({ questionId, content, topic, baseKeyPoints }) {
  const signature = buildTemplateSignature(content);
  const cached = getCachedDynamicKeyPoints(questionId, signature);
  if (cached) return cached;

  const tone = inferTone(content, topic, baseKeyPoints?.tone);
  const role = toSafeString(baseKeyPoints?.role) || `You are a student speaking to ${inferAudience(content, baseKeyPoints?.role)}.`;
  const templatePayload = buildTemplateFromQuestion(content, tone);

  const phrases = buildDynamicPhrases(templatePayload, baseKeyPoints?.phrases || {});
  const directions = buildDynamicDirections(content, templatePayload, baseKeyPoints?.directions || []);
  const tips = buildDynamicTips(content, baseKeyPoints?.tips || []);

  const result = {
    role,
    tone,
    toneLabel: toSafeString(baseKeyPoints?.toneLabel) || TONE_LABEL_MAP[tone],
    directions: directions.length ? directions : (baseKeyPoints?.directions || []),
    templateOpener: templatePayload.opener,
    templateFull: templatePayload.full,
    phrases,
    tips,
    templateSource: "dynamic-question",
    templateSignature: signature
  };

  saveDynamicKeyPoints(questionId, signature, result);
  return result;
}

function buildRTSAudioPath(questionId) {
  const normalizedId = toSafeString(questionId);
  if (!normalizedId) return "";
  return `${RTS_AUDIO_FOLDER}/${normalizedId}.mp3`;
}

function buildRTSAudioUrl(questionId) {
  const storagePath = buildRTSAudioPath(questionId);
  if (!storagePath || !hasSupabaseConfig) return "";

  try {
    const { data } = supabase.storage.from(RTS_AUDIO_BUCKET).getPublicUrl(storagePath);
    return toSafeString(data?.publicUrl);
  } catch (error) {
    console.warn("RTS audio url resolve failed:", error, { questionId: toSafeString(questionId), storagePath });
    return "";
  }
}

function normalizeQuestion(raw, index = 0) {
  const source = toObject(raw) || {};
  const id = toSafeString(source.id) || `RTS_MOCK_${index + 1}`;
  const content = toSafeString(source.content);
  const topic = normalizeTopic(source.topic);
  const audioPath = buildRTSAudioPath(id);
  const audioUrl = buildRTSAudioUrl(id);

  const baseKeyPoints = normalizeKeyPoints(source.key_points);
  const dynamicKeyPoints = buildDynamicKeyPoints({
    questionId: id,
    content,
    topic,
    baseKeyPoints
  });

  return {
    id,
    task_type: "RTS",
    taskType: "RTS",
    content,
    audio_path: audioPath,
    audio_url: audioUrl,
    topic,
    key_points: dynamicKeyPoints,
    difficulty: normalizeDifficulty(source.difficulty),
    is_active: source.is_active !== false
  };
}

function getMockQuestions() {
  return MOCK_RTS_QUESTIONS.map((item, index) => normalizeQuestion(item, index));
}

function resolveQuestionSummary(content, maxLength = 82) {
  const normalized = toSafeString(content).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function parseScoreJson(rawValue) {
  const parsed = parseJsonLike(rawValue);
  return toObject(parsed) || {};
}

function normalizeRTSAudioPath(pathValue) {
  const raw = toSafeString(pathValue);
  if (!raw) return "";

  const withoutHash = raw.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  const normalized = withoutQuery.replace(/^\/+/, "");
  if (!normalized) return "";

  if (normalized.startsWith(`${PRACTICE_AUDIO_BUCKET}/`)) {
    return normalized.slice(PRACTICE_AUDIO_BUCKET.length + 1);
  }

  if (/^https?:\/\//i.test(normalized)) {
    const rtsMarkerIndex = normalized.toLowerCase().indexOf("/rts/");
    if (rtsMarkerIndex >= 0) {
      return normalized.slice(rtsMarkerIndex + 1);
    }
  }

  return normalized;
}

function resolveRTSAudioBucket(bucketValue, pathValue) {
  const direct = toSafeString(bucketValue);
  if (direct) return direct;

  const path = normalizeRTSAudioPath(pathValue);
  if (path.startsWith("rts/")) return PRACTICE_AUDIO_BUCKET;
  return "";
}

function normalizeAudioMeta(audio) {
  if (typeof audio === "string") {
    const pathFromString = normalizeRTSAudioPath(audio);
    const inferredBucket = resolveRTSAudioBucket("", pathFromString);
    if (!inferredBucket || !pathFromString) return null;
    return {
      bucket: inferredBucket,
      path: pathFromString,
      mimeType: "",
      size: 0,
      uploadedAt: "",
      attemptId: 0,
      status: ""
    };
  }

  const value = toObject(audio);
  if (!value) return null;

  const path = normalizeRTSAudioPath(
    value?.path
    || value?.storagePath
    || value?.storage_path
    || value?.objectPath
    || value?.object_path
    || value?.filePath
    || value?.file_path
  );
  const bucket = resolveRTSAudioBucket(
    value?.bucket
    || value?.bucketId
    || value?.bucket_id
    || value?.storageBucket
    || value?.storage_bucket,
    path
  );
  if (!bucket || !path) return null;

  return {
    bucket,
    path,
    mimeType: toSafeString(value?.mimeType || value?.mime_type || value?.contentType || value?.content_type),
    size: Math.max(0, Number(value?.size || value?.bytes || value?.fileSize || value?.file_size || 0)),
    uploadedAt: toSafeString(value?.uploadedAt || value?.uploaded_at || value?.createdAt || value?.created_at),
    attemptId: Math.max(0, Number(value?.attemptId || value?.attempt_id || 0)),
    status: toSafeString(value?.status || value?.uploadStatus || value?.upload_status)
  };
}

function extractRTSAudioMeta(scoreJson) {
  return normalizeAudioMeta(
    scoreJson?.audio
    || scoreJson?.audio_meta
    || scoreJson?.audioMeta
    || scoreJson?.recording
    || scoreJson?.recording_audio
  );
}

export function hasRTSHistoryAudioMeta(itemOrAudioMeta) {
  const normalizedAudio = normalizeAudioMeta(
    itemOrAudioMeta?.audioMeta
    || itemOrAudioMeta?.audio
    || itemOrAudioMeta?.score_json?.audio
    || itemOrAudioMeta
  );
  return Boolean(normalizedAudio?.bucket && normalizedAudio?.path);
}

export function isValidRTSRemoteHistoryRecord(record) {
  const source = toObject(record);
  if (!source) return false;
  if (resolveHistoryRecordTaskType(source) !== "RTS") return false;
  const normalizedAudio = normalizeAudioMeta(
    source?.audioMeta
    || source?.audio
    || source?.score_json?.audio
  );
  return Boolean(normalizedAudio?.bucket && normalizedAudio?.path);
}

function isReplayableRTSAudioMeta(audioMeta) {
  const normalizedAudio = normalizeAudioMeta(audioMeta);
  if (!hasRTSHistoryAudioMeta(normalizedAudio)) return false;
  if (normalizedAudio.bucket !== PRACTICE_AUDIO_BUCKET) return false;
  return normalizedAudio.path.startsWith("rts/");
}

function sanitizePathSegment(value) {
  const cleaned = toSafeString(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || "unknown";
}

function sanitizeAttemptId(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "0";
  return `${Math.floor(parsed)}`;
}

function normalizeMimeType(value) {
  return toSafeString(value).toLowerCase();
}

function getAudioExtByMimeType(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function normalizeSignedUrlTtl(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SIGNED_URL_TTL_SECONDS;
  return Math.max(30, Math.min(60 * 60 * 24, Math.floor(parsed)));
}

function normalizeRecentLimit(value, fallback = 20, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function resolveSelfRating(scoreJson) {
  const value = Number(scoreJson?.self_rating);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function resolveDurationSec(scoreJson) {
  const direct = Number(scoreJson?.duration_sec);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  return 0;
}

function resolveDateKey(dateValue) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildQuestionMap(list) {
  const map = new Map();
  list.forEach((item) => {
    map.set(item.id, item);
  });
  return map;
}

function buildRecentLog(row, questionMap) {
  const scoreJson = parseScoreJson(row?.score_json);
  const questionId = toSafeString(row?.question_id);
  const matched = questionMap.get(questionId) || null;
  const content = toSafeString(matched?.content || row?.transcript || "");
  const topic = normalizeTopic(matched?.topic || scoreJson?.topic || "daily");
  const audioMeta = extractRTSAudioMeta(scoreJson);
  const taskType = normalizeTaskType(row?.task_type || "RTS") || "RTS";
  const hasAudioMeta = isValidRTSRemoteHistoryRecord({
    task_type: taskType,
    audio: audioMeta
  });
  return {
    id: `${row?.id || ""}`.trim(),
    taskType,
    questionId,
    topic,
    summary: resolveQuestionSummary(content),
    rating: resolveSelfRating(scoreJson),
    durationSec: resolveDurationSec(scoreJson),
    createdAt: toSafeString(row?.created_at),
    audioMeta,
    hasAudioMeta,
    hasAudio: hasAudioMeta,
    canLoadPlayback: isReplayableRTSAudioMeta(audioMeta),
    playbackUrl: ""
  };
}

function buildRecentLogs(logRows, questionMap, limit = 3) {
  return logRows.slice(0, limit).map((row) => buildRecentLog(row, questionMap));
}

function buildRecentAudioHistory(logRows, questionMap, limit = 20) {
  const safeRows = Array.isArray(logRows) ? logRows : [];
  const safeLimit = normalizeRecentLimit(limit, 20, 200);
  return safeRows
    .map((row) => buildRecentLog(row, questionMap))
    .filter((item) => isValidRTSRemoteHistoryRecord(item))
    .slice(0, safeLimit);
}

function buildCurrentQuestionLatestLog(logRows, questionMap, currentQuestionId = "") {
  const normalizedQuestionId = toSafeString(currentQuestionId);
  if (normalizedQuestionId) {
    const targetRow = logRows.find((row) => toSafeString(row?.question_id) === normalizedQuestionId);
    if (targetRow) return buildRecentLog(targetRow, questionMap);
    return null;
  }
  const fallbackRow = logRows[0] || null;
  if (!fallbackRow) return null;
  return buildRecentLog(fallbackRow, questionMap);
}

function getLatestQuestionId(logRows) {
  const latest = logRows[0];
  return toSafeString(latest?.question_id);
}

async function getCurrentUserId() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("RTS session read failed:", error);
      return "";
    }
    return toSafeString(data?.session?.user?.id);
  } catch (error) {
    console.warn("RTS session read failed:", error);
    return "";
  }
}

async function createRTSPlaybackUrlForUser(audioMeta, userId, expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const normalizedUserId = toSafeString(userId);
  if (!normalizedUserId) return "";

  const normalizedAudio = normalizeAudioMeta(audioMeta);
  if (!normalizedAudio) return "";
  if (normalizedAudio.bucket !== PRACTICE_AUDIO_BUCKET) return "";
  if (!normalizedAudio.path.startsWith(`rts/${normalizedUserId}/`)) return "";

  const ttl = normalizeSignedUrlTtl(expiresIn);
  const { data, error } = await supabase
    .storage
    .from(normalizedAudio.bucket)
    .createSignedUrl(normalizedAudio.path, ttl);

  if (error) {
    console.warn("RTS playback signed URL failed:", error, {
      bucket: normalizedAudio.bucket,
      path: normalizedAudio.path
    });
    return "";
  }

  return toSafeString(data?.signedUrl);
}

async function enrichRecentLogsWithPlaybackUrls(logs, userId, playbackUrlTtl = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const normalizedUserId = toSafeString(userId);
  if (!safeLogs.length || !normalizedUserId) return safeLogs;

  const enriched = await Promise.all(
    safeLogs.map(async (item) => {
      if (!item?.hasAudioMeta) return { ...item, playbackUrl: "" };
      const playbackUrl = await createRTSPlaybackUrlForUser(item.audioMeta, normalizedUserId, playbackUrlTtl);
      return {
        ...item,
        playbackUrl
      };
    })
  );

  return enriched;
}

function buildQuestionPracticeCountMap(logRows) {
  return logRows.reduce((acc, row) => {
    const key = toSafeString(row?.question_id);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function fetchUserLogs(userId, { limit = 300, questionId = "" } = {}) {
  const normalizedUserId = toSafeString(userId);
  if (!normalizedUserId) return [];
  const normalizedQuestionId = toSafeString(questionId);

  try {
    let query = supabase
      .from("practice_logs")
      .select("id, task_type, question_id, score_json, transcript, created_at")
      .eq("user_id", normalizedUserId)
      .eq("task_type", "RTS")
      .order("created_at", { ascending: false });

    if (normalizedQuestionId) {
      query = query.eq("question_id", normalizedQuestionId);
    }

    const { data, error } = await query
      .limit(Math.max(1, Math.min(1000, Number(limit || 300))));

    if (error) {
      console.warn("RTS logs load failed:", error);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("RTS logs load failed:", error);
    return [];
  }
}

function normalizeRetentionKeepCount(value) {
  return normalizeRecentLimit(value, RTS_RETENTION_KEEP_COUNT, 200);
}

function isStorageObjectMissingError(error) {
  const code = toSafeString(error?.statusCode || error?.status || error?.code).toLowerCase();
  const message = toSafeString(error?.message).toLowerCase();
  return (
    code === "404"
    || code === "not_found"
    || message.includes("not found")
    || message.includes("does not exist")
    || message.includes("no such")
  );
}

async function fetchAllRTSLogsForRetention(userId) {
  const normalizedUserId = toSafeString(userId);
  if (!normalizedUserId) return [];

  const rows = [];
  let from = 0;
  while (true) {
    const to = from + RTS_RETENTION_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, question_id, score_json, created_at")
      .eq("user_id", normalizedUserId)
      .eq("task_type", "RTS")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.warn("RTS retention logs load failed:", error, { userId: normalizedUserId, from, to });
      break;
    }

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;
    rows.push(...chunk);
    if (chunk.length < RTS_RETENTION_PAGE_SIZE) break;
    from += RTS_RETENTION_PAGE_SIZE;
  }

  return rows;
}

function buildRTSRemoteAudioRecordsForRetention(logRows) {
  const safeRows = Array.isArray(logRows) ? logRows : [];
  return safeRows
    .map((row) => {
      const scoreJson = parseScoreJson(row?.score_json);
      const audioMeta = extractRTSAudioMeta(scoreJson);
      if (!isValidRTSRemoteHistoryRecord({
        task_type: row?.task_type || "RTS",
        audio: audioMeta
      })) {
        return null;
      }
      return {
        id: toSafeString(row?.id),
        questionId: toSafeString(row?.question_id),
        scoreJson,
        audioMeta
      };
    })
    .filter(Boolean);
}

function buildRetentionClearedScoreJson(scoreJson) {
  const base = toObject(scoreJson) || {};
  return {
    ...base,
    audio: {
      status: "deleted_by_retention"
    }
  };
}

export async function applyRTSAudioRetentionForUser(
  userId,
  { keepCount = RTS_RETENTION_KEEP_COUNT } = {}
) {
  const normalizedUserId = toSafeString(userId);
  const safeKeepCount = normalizeRetentionKeepCount(keepCount);

  const emptySummary = {
    totalRemoteAudioCount: 0,
    keepCount: safeKeepCount,
    deleteCount: 0,
    deletedStorageCount: 0,
    clearedLogCount: 0,
    failedCount: 0
  };
  if (!normalizedUserId || !hasSupabaseConfig) return emptySummary;

  const allLogs = await fetchAllRTSLogsForRetention(normalizedUserId);
  const remoteAudioLogs = buildRTSRemoteAudioRecordsForRetention(allLogs);
  const staleAudioLogs = remoteAudioLogs.slice(safeKeepCount);
  const summary = {
    totalRemoteAudioCount: remoteAudioLogs.length,
    keepCount: safeKeepCount,
    deleteCount: staleAudioLogs.length,
    deletedStorageCount: 0,
    clearedLogCount: 0,
    failedCount: 0
  };

  if (RTS_RETENTION_DEBUG_ENABLED) {
    console.info("[rts-retention:start]", {
      userId: normalizedUserId,
      totalRemoteAudioCount: summary.totalRemoteAudioCount,
      keepCount: summary.keepCount,
      deleteCount: summary.deleteCount
    });
  }

  for (const item of staleAudioLogs) {
    const logId = toSafeString(item?.id);
    const questionId = toSafeString(item?.questionId);
    const audioBucket = toSafeString(item?.audioMeta?.bucket);
    const audioPath = toSafeString(item?.audioMeta?.path);

    if (RTS_RETENTION_DEBUG_ENABLED) {
      console.info("[rts-retention:delete-item]", {
        logId,
        questionId,
        audioBucket,
        audioPath
      });
    }

    let shouldClearLog = false;
    let storageRemoved = false;
    try {
      const { error: removeError } = await supabase.storage
        .from(audioBucket)
        .remove([audioPath]);

      if (removeError) {
        if (isStorageObjectMissingError(removeError)) {
          shouldClearLog = true;
        } else {
          summary.failedCount += 1;
          console.warn("RTS retention storage remove failed:", removeError, {
            userId: normalizedUserId,
            logId,
            questionId,
            audioBucket,
            audioPath
          });
          continue;
        }
      } else {
        storageRemoved = true;
        shouldClearLog = true;
        summary.deletedStorageCount += 1;
      }
    } catch (removeException) {
      if (isStorageObjectMissingError(removeException)) {
        shouldClearLog = true;
      } else {
        summary.failedCount += 1;
        console.warn("RTS retention storage remove failed:", removeException, {
          userId: normalizedUserId,
          logId,
          questionId,
          audioBucket,
          audioPath
        });
        continue;
      }
    }

    if (!shouldClearLog) continue;

    const nextScoreJson = buildRetentionClearedScoreJson(item?.scoreJson);
    try {
      const { error: updateError } = await supabase
        .from("practice_logs")
        .update({ score_json: nextScoreJson })
        .eq("id", logId)
        .eq("user_id", normalizedUserId)
        .eq("task_type", "RTS");

      if (updateError) {
        summary.failedCount += 1;
        const warnMessage = storageRemoved
          ? "RTS retention log clear failed after storage remove:"
          : "RTS retention log clear failed:";
        console.warn(warnMessage, updateError, {
          userId: normalizedUserId,
          logId,
          questionId,
          audioBucket,
          audioPath
        });
        continue;
      }
      summary.clearedLogCount += 1;
    } catch (updateException) {
      summary.failedCount += 1;
      const warnMessage = storageRemoved
        ? "RTS retention log clear failed after storage remove:"
        : "RTS retention log clear failed:";
      console.warn(warnMessage, updateException, {
        userId: normalizedUserId,
        logId,
        questionId,
        audioBucket,
        audioPath
      });
    }
  }

  if (RTS_RETENTION_DEBUG_ENABLED) {
    console.info("[rts-retention:end]", {
      deletedStorageCount: summary.deletedStorageCount,
      clearedLogCount: summary.clearedLogCount,
      failedCount: summary.failedCount
    });
  }

  return summary;
}

export async function uploadRTSAudio({ userId, questionId, attemptId, blob } = {}) {
  const normalizedUserId = toSafeString(userId);
  if (!normalizedUserId) return null;
  if (!blob || Number(blob?.size || 0) <= 0) return null;

  const mimeType = normalizeMimeType(blob?.type);
  const ext = getAudioExtByMimeType(mimeType);
  const safeQuestionId = sanitizePathSegment(questionId || "unknown");
  const safeAttemptId = sanitizeAttemptId(attemptId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `rts/${normalizedUserId}/${safeQuestionId}/${safeAttemptId}-${timestamp}.${ext}`;

  try {
    const { error } = await supabase.storage.from(PRACTICE_AUDIO_BUCKET).upload(path, blob, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

    if (error) {
      console.warn("RTS audio upload failed:", error, {
        path,
        mimeType,
        size: Number(blob?.size || 0)
      });
      return null;
    }

    return {
      bucket: PRACTICE_AUDIO_BUCKET,
      path,
      mimeType: mimeType || "",
      size: Number(blob?.size || 0),
      uploadedAt: new Date().toISOString(),
      attemptId: Number(safeAttemptId),
      status: "ready"
    };
  } catch (error) {
    console.warn("RTS audio upload error:", error, {
      path,
      mimeType,
      size: Number(blob?.size || 0)
    });
    return null;
  }
}

export async function getRTSPlaybackUrl(logOrAudioMeta, expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const userId = await getCurrentUserId();
  if (!userId) return "";

  const audioMeta = normalizeAudioMeta(
    logOrAudioMeta?.audioMeta
    || logOrAudioMeta?.audio
    || logOrAudioMeta?.score_json?.audio
    || logOrAudioMeta
  );
  if (!audioMeta) return "";

  return createRTSPlaybackUrlForUser(audioMeta, userId, expiresIn);
}

export function useRTSData() {
  const questions = ref([]);
  const loading = ref(false);
  const dataSource = ref("mock");

  async function loadQuestions({ force = false } = {}) {
    if (!force && Array.isArray(cachedQuestions) && cachedQuestions.length) {
      questions.value = cachedQuestions;
      dataSource.value = cachedSource;
      return cachedQuestions;
    }

    loading.value = true;
    try {
      const fallback = getMockQuestions();
      cachedQuestions = fallback;
      cachedSource = "mock";
      questions.value = fallback;
      dataSource.value = "mock";
      return fallback;
    } finally {
      loading.value = false;
    }
  }

  async function getQuestionById(questionId) {
    const normalizedId = toSafeString(questionId);
    if (!normalizedId) return null;
    const list = await loadQuestions();
    return list.find((item) => item.id === normalizedId) || null;
  }

  async function getRandomQuestion(excludedId = "") {
    const list = await loadQuestions();
    if (!list.length) return null;
    const normalizedExcludedId = toSafeString(excludedId);
    const pool = list.filter((item) => item.id !== normalizedExcludedId);
    const candidates = pool.length ? pool : list;
    return candidates[Math.floor(Math.random() * candidates.length)] || null;
  }

  function getTopicStats(sourceList = questions.value) {
    const list = Array.isArray(sourceList) ? sourceList : [];
    return RTS_TOPIC_ORDER.map((topicKey) => {
      const topicMeta = RTS_TOPIC_META[topicKey];
      const count = list.filter((item) => item.topic === topicKey).length;
      return {
        ...topicMeta,
        count
      };
    });
  }

  async function getUserRTSStats(
    userId,
    {
      recentLimit = 3,
      logsLimit = 300,
      currentQuestionId = "",
      includePlaybackUrls = false,
      playbackUrlTtl = DEFAULT_SIGNED_URL_TTL_SECONDS
    } = {}
  ) {
    const normalizedUserId = toSafeString(userId);
    const list = await loadQuestions();
    const questionMap = buildQuestionMap(list);
    const logs = await fetchUserLogs(normalizedUserId, {
      limit: logsLimit
    });
    const nowDateKey = resolveDateKey(new Date().toISOString());
    const todayLogs = logs.filter((item) => resolveDateKey(item?.created_at) === nowDateKey);
    const ratingValues = logs
      .map((item) => resolveSelfRating(parseScoreJson(item?.score_json)))
      .filter((rating) => rating > 0);
    const todayDurationSec = todayLogs.reduce((sum, item) => sum + resolveDurationSec(parseScoreJson(item?.score_json)), 0);
    let recentLogs = buildRecentLogs(logs, questionMap, recentLimit);
    let currentQuestionLatestLog = buildCurrentQuestionLatestLog(logs, questionMap, currentQuestionId);

    if (includePlaybackUrls && normalizedUserId) {
      recentLogs = await enrichRecentLogsWithPlaybackUrls(recentLogs, normalizedUserId, playbackUrlTtl);
      if (currentQuestionLatestLog?.hasAudio) {
        const playbackUrl = await createRTSPlaybackUrlForUser(
          currentQuestionLatestLog.audioMeta,
          normalizedUserId,
          playbackUrlTtl
        );
        currentQuestionLatestLog = {
          ...currentQuestionLatestLog,
          playbackUrl
        };
      }
    }

    return {
      todayPracticed: todayLogs.length,
      todayMinutes: Math.round(todayDurationSec / 60),
      averageRating: ratingValues.length
        ? Number((ratingValues.reduce((sum, rating) => sum + rating, 0) / ratingValues.length).toFixed(1))
        : 0,
      totalQuestions: list.length,
      recentLogs,
      currentQuestionLatestLog,
      latestQuestionId: getLatestQuestionId(logs),
      questionPracticeCountMap: buildQuestionPracticeCountMap(logs)
    };
  }

  async function getRTSCurrentQuestionLatestPractice(
    userId,
    questionId,
    {
      includePlaybackUrl = false,
      playbackUrlTtl = DEFAULT_SIGNED_URL_TTL_SECONDS
    } = {}
  ) {
    const normalizedUserId = toSafeString(userId);
    const normalizedQuestionId = toSafeString(questionId);
    if (!normalizedUserId || !normalizedQuestionId) return null;

    const list = await loadQuestions();
    const questionMap = buildQuestionMap(list);
    const logs = await fetchUserLogs(normalizedUserId, {
      limit: 1,
      questionId: normalizedQuestionId
    });
    const latest = logs[0] || null;
    if (!latest) return null;

    let output = buildRecentLog(latest, questionMap);
    if (includePlaybackUrl && output?.hasAudio) {
      const playbackUrl = await createRTSPlaybackUrlForUser(
        output.audioMeta,
        normalizedUserId,
        playbackUrlTtl
      );
      output = {
        ...output,
        playbackUrl
      };
    }
    return output;
  }

  async function getRTSRecentAudioHistory(
    userId,
    {
      limit = 20,
      includePlaybackUrls = false,
      playbackUrlTtl = DEFAULT_SIGNED_URL_TTL_SECONDS
    } = {}
  ) {
    const normalizedUserId = toSafeString(userId);
    if (!normalizedUserId) {
      updateRecentAudioHistoryDebug({
        fetchedCount: 0,
        validRemoteAudioCount: 0,
        topAudioMeta: []
      });
      return [];
    }

    const safeLimit = normalizeRecentLimit(limit, 20, 200);
    const queryLimit = Math.max(safeLimit, Math.min(1000, Math.max(120, safeLimit * 12)));
    const list = await loadQuestions();
    const questionMap = buildQuestionMap(list);
    const logs = await fetchUserLogs(normalizedUserId, {
      limit: queryLimit
    });
    let historyLogs = buildRecentAudioHistory(logs, questionMap, safeLimit);

    if (includePlaybackUrls) {
      historyLogs = await enrichRecentLogsWithPlaybackUrls(
        historyLogs,
        normalizedUserId,
        playbackUrlTtl
      );
    }

    const debugPayload = {
      fetchedCount: logs.length,
      validRemoteAudioCount: historyLogs.length,
      topAudioMeta: historyLogs.slice(0, 3).map((item) => summarizeHistoryAudioMeta(item))
    };
    updateRecentAudioHistoryDebug(debugPayload);
    if (RTS_HISTORY_DEBUG_ENABLED) {
      console.info("[rts-data:recent-history]", debugPayload);
    }

    return historyLogs;
  }

  return {
    questions,
    loading,
    dataSource,
    loadQuestions,
    getQuestionById,
    getRandomQuestion,
    getTopicStats,
    getUserRTSStats,
    getRTSCurrentQuestionLatestPractice,
    getRTSRecentAudioHistory,
    resolveQuestionSummary
  };
}
