<script setup>
import { computed, reactive, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { buildPracticeAnalytics } from "@/lib/practice-analytics";
import {
  buildDIAudioSignalsPayload,
  getDIFallbackReasonMessage,
  buildDIQuestionMetaPayload,
  buildDIQuestionSnapshot,
  createPendingDIAiReviewJob
} from "@/lib/di-ai-review";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";
import { useDIRecorder } from "@/composables/useDIRecorder";
import { getDIQuestionsByFilters, getDITemplateById, getDITemplatesByFilters } from "@/lib/di-data";
import { uploadDIAudio } from "@/lib/di-history";
import {
  DI_IMAGE_TYPE_FILTERS,
  getDIImageTypeMeta,
  inferDIImageTypeFromText,
  normalizeDIImageType
} from "@/composables/useDITemplate";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const uiStore = useUIStore();

const SESSION_TOTAL = 6;
const DI_FOCUS_STOP_WORDS = new Set([
  "chart",
  "graph",
  "image",
  "picture",
  "diagram",
  "data",
  "table",
  "map",
  "process",
  "mixed",
  "line",
  "bar",
  "pie",
  "trend",
  "comparison",
  "layout",
  "location",
  "figure",
  "value",
  "values",
  "number",
  "numbers",
  "title"
]);
const DI_COLOR_WORDS = [
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "black",
  "white",
  "gray",
  "grey",
  "brown",
  "pink",
  "gold",
  "silver",
  "navy",
  "teal",
  "cyan",
  "红",
  "蓝",
  "绿",
  "黄",
  "橙",
  "紫",
  "黑",
  "白",
  "灰"
];
const HISTORY_END_SNAP_SECONDS = 0.25;

const loadingQuestions = ref(true);
const loadingStats = ref(false);
const submittingRound = ref(false);
const allQuestions = ref([]);
const selectedImageType = ref("map");
const sessionQuestions = ref([]);
const currentQuestionIndex = ref(0);
const activeTab = ref("structure");
const templatePickerOpen = ref(false);
const templateMode = ref("random");
const usedPhraseFlags = ref({});
const selectedTemplateId = ref("");
const carriedTemplateBlockIds = ref([]);
const isFavorite = ref(false);
const favoriteBusy = ref(false);
const favoriteSource = ref("checking");
const playbackTimeSec = ref(0);
const playbackDurationSec = ref(0);
const historyAudioRefs = reactive({});
const historyPlaybackTimes = reactive({});
const historyPlaybackDurations = reactive({});
const historyPlayingId = ref("");
const summaryStats = ref({
  practicedCount: 0,
  totalMinutes: 0,
  averageOverall: 0
});

const diRecorder = useDIRecorder({
  prepareSeconds: 25,
  recordingSeconds: 40
});
const recorderPhase = computed(() => `${diRecorder.phase.value || ""}`.trim());
const recorderTimerLabel = computed(() => `${diRecorder.timerLabel.value || ""}`.trim());
const recorderTimerRemaining = computed(() => Number(diRecorder.timerRemaining.value || 0));
const recorderTimerProgress = computed(() => Number(diRecorder.timerProgress.value || 0));
const canSkipPrepare = computed(() => Boolean(diRecorder.canSkipPrepare.value));
const canFinishRecording = computed(() => Boolean(diRecorder.canFinishRecording.value));
const recorderPreviewUrl = computed(() => `${diRecorder.previewUrl.value || ""}`.trim());

const currentQuestion = computed(() => sessionQuestions.value[currentQuestionIndex.value] || null);
const currentImageMeta = computed(() => getDIImageTypeMeta(currentQuestion.value?.imageType || selectedImageType.value));
const templateCandidates = computed(() => {
  if (carriedTemplateBlockIds.value.length) {
    const carriedTemplates = carriedTemplateBlockIds.value
      .map((templateId) => getDITemplateById(templateId))
      .filter(Boolean);
    if (carriedTemplates.length) {
      return carriedTemplates;
    }
  }

  const imageType = currentQuestion.value?.imageType || selectedImageType.value;
  return getDITemplatesByFilters({
    imageType
  });
});
const selectedTemplate = computed(() => {
  const templates = templateCandidates.value;
  if (!templates.length) return null;
  const selectedId = `${selectedTemplateId.value || ""}`.trim();
  if (selectedId) {
    const matched = templates.find((item) => item.id === selectedId);
    if (matched) return matched;
  }
  return templates[0] || null;
});
const templateCountLabel = computed(() => templateCandidates.value.length);
const questionHighFrequencyWords = computed(() => normalizeQuestionHighFrequencyWords(currentQuestion.value?.highFrequencyWords));
const progressDots = computed(() => {
  const total = sessionQuestions.value.length || SESSION_TOTAL;
  return Array.from({ length: total }, (_, index) => index);
});
const currentStageIndex = computed(() => {
  if (diRecorder.phase.value === "prepare") return 0;
  if (diRecorder.phase.value === "recording") return 1;
  return 2;
});
const stageItems = [
  { key: "prepare", label: "看图准备" },
  { key: "recording", label: "开口描述" },
  { key: "playback", label: "听回放" }
];
const playbackTimeLabel = computed(() => `${formatSeconds(playbackTimeSec.value)} / ${formatSeconds(playbackDurationSec.value)}`);
const recentRecordings = computed(() => practiceStore.diRecentRecordings.slice(0, 3));
const hasRecordedRound = computed(() => Boolean(diRecorder.stopResult.value?.blob));
const canSubmitAiReview = computed(() => hasRecordedRound.value && !submittingRound.value);
const recorderErrorText = computed(() => `${diRecorder.recorder.error.value || ""}`.trim());
const diLiveContext = computed(() => buildDILiveContext(currentQuestion.value, questionHighFrequencyWords.value));
const diLiveSentences = computed(() => buildDILiveSentences(diLiveContext.value));
const diLiveTips = computed(() => buildDILiveTips(diLiveContext.value));
const emptySessionMessage = computed(() => {
  if (allQuestions.value.length && selectedImageType.value) {
    return `当前暂无 ${getDIImageTypeMeta(selectedImageType.value).label} 题目，请切换其他图题。`;
  }
  return "当前没有可用 DI 题目，请先在 Supabase `questions` 表添加 `task_type = DI` 的题目。";
});
const templateSlotSuggestions = computed(() =>
  toArray(selectedTemplate.value?.slots).map((slot) => ({
    slot: `${slot || ""}`.trim(),
    suggestion: resolveSlotSuggestion(slot, diLiveContext.value)
  }))
);
const imagePreviewOpen = ref(false);
const imagePreviewUrl = ref("");
const imagePreviewAlt = ref("");
const imagePreviewLoading = ref(false);
const imagePreviewFailed = ref(false);
const imagePreviewErrorText = ref("");
const activeImageUrl = ref("");
const displayedImageUrl = ref("");
const currentImageRenderKey = ref("di-image-empty");
const isImageLoading = ref(false);
const imageLoadFailed = ref(false);
const imageErrorText = ref("");
const imageLoadCache = new Map();
let currentImageLoadToken = 0;
let currentPreviewLoadToken = 0;

function normalizeQuestionImageUrl(question) {
  return `${question?.imageUrl || ""}`.trim();
}

function buildQuestionImageKey(question, url, suffix = "main") {
  return `${suffix}:${question?.id || "di-question"}:${url || "empty"}`;
}

function createImageLoadError(url = "") {
  return new Error(url ? `image_load_failed:${url}` : "image_load_failed");
}

function preloadImageUrl(url) {
  const normalizedUrl = `${url || ""}`.trim();
  if (!normalizedUrl) {
    return Promise.reject(createImageLoadError(""));
  }

  const cached = imageLoadCache.get(normalizedUrl);
  if (cached?.status === "loaded") {
    return Promise.resolve(normalizedUrl);
  }
  if (cached?.status === "loading" && cached?.promise) {
    return cached.promise;
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      resolve(normalizedUrl);
      return;
    }

    const loader = new Image();
    const cleanup = () => {
      loader.onload = null;
      loader.onerror = null;
    };

    loader.decoding = "async";
    loader.onload = () => {
      imageLoadCache.set(normalizedUrl, { status: "loaded", promise: Promise.resolve(normalizedUrl) });
      cleanup();
      resolve(normalizedUrl);
    };
    loader.onerror = () => {
      imageLoadCache.delete(normalizedUrl);
      cleanup();
      reject(createImageLoadError(normalizedUrl));
    };
    loader.src = normalizedUrl;
  });

  imageLoadCache.set(normalizedUrl, { status: "loading", promise });
  return promise;
}

function resolveUpcomingQuestionImageUrl(currentQuestionId = "") {
  const total = sessionQuestions.value.length;
  if (total <= 1) return "";

  for (let offset = 1; offset < total; offset += 1) {
    const candidate = sessionQuestions.value[(currentQuestionIndex.value + offset) % total];
    if (!candidate || candidate.id === currentQuestionId) continue;
    const candidateUrl = normalizeQuestionImageUrl(candidate);
    if (candidateUrl) return candidateUrl;
  }

  return "";
}

function preloadUpcomingQuestionImage(currentQuestionId = "") {
  const nextUrl = resolveUpcomingQuestionImageUrl(currentQuestionId);
  if (!nextUrl || nextUrl === activeImageUrl.value) return;
  void preloadImageUrl(nextUrl).catch(() => {
    // no-op: preloading should not surface errors ahead of user action
  });
}

async function syncCurrentQuestionImage(question) {
  const targetUrl = normalizeQuestionImageUrl(question);
  const requestToken = ++currentImageLoadToken;
  const currentKey = buildQuestionImageKey(question, targetUrl);

  activeImageUrl.value = targetUrl;
  currentImageRenderKey.value = currentKey;
  displayedImageUrl.value = "";
  imageLoadFailed.value = false;
  imageErrorText.value = "";
  isImageLoading.value = Boolean(targetUrl);

  if (!targetUrl) {
    isImageLoading.value = false;
    imageLoadFailed.value = true;
    imageErrorText.value = "当前题目缺少 image_url，请在题库补充图片地址。";
    return;
  }

  try {
    const loadedUrl = await preloadImageUrl(targetUrl);
    if (requestToken !== currentImageLoadToken) return;
    displayedImageUrl.value = loadedUrl;
    isImageLoading.value = false;
    imageLoadFailed.value = false;
    preloadUpcomingQuestionImage(question?.id || "");
  } catch {
    if (requestToken !== currentImageLoadToken) return;
    displayedImageUrl.value = "";
    isImageLoading.value = false;
    imageLoadFailed.value = true;
    imageErrorText.value = "新图片加载失败，请稍后重试或检查图片地址。";
  }
}

function retryCurrentQuestionImage() {
  if (!currentQuestion.value) return;
  void syncCurrentQuestionImage(currentQuestion.value);
}

async function openImagePreview() {
  const question = currentQuestion.value;
  const url = normalizeQuestionImageUrl(question);
  if (!url) return;

  const requestToken = ++currentPreviewLoadToken;
  imagePreviewAlt.value = `${question?.topic || question?.id || "DI image"}`.trim();
  imagePreviewOpen.value = true;
  imagePreviewLoading.value = true;
  imagePreviewFailed.value = false;
  imagePreviewErrorText.value = "";
  imagePreviewUrl.value = "";

  try {
    const loadedUrl = displayedImageUrl.value === url ? url : await preloadImageUrl(url);
    if (requestToken !== currentPreviewLoadToken || !imagePreviewOpen.value) return;
    imagePreviewUrl.value = loadedUrl;
    imagePreviewLoading.value = false;
  } catch {
    if (requestToken !== currentPreviewLoadToken || !imagePreviewOpen.value) return;
    imagePreviewLoading.value = false;
    imagePreviewFailed.value = true;
    imagePreviewErrorText.value = "图片预览加载失败，请稍后重试。";
  }
}

function closeImagePreview() {
  currentPreviewLoadToken += 1;
  imagePreviewOpen.value = false;
  imagePreviewLoading.value = false;
  imagePreviewFailed.value = false;
  imagePreviewErrorText.value = "";
}

function handleImagePreviewMaskClick(event) {
  if (event?.target !== event?.currentTarget) return;
  closeImagePreview();
}

function handleWindowKeydown(event) {
  if (event?.key === "Escape" && imagePreviewOpen.value) {
    closeImagePreview();
  }
}

watch(
  () => diRecorder.phase.value,
  (value) => {
    practiceStore.setPhase(value);
  },
  { immediate: true }
);

watch(
  () => diRecorder.stopResult.value,
  (value) => {
    practiceStore.setAudioBlob(value?.blob || null);
    practiceStore.setTranscript(value?.transcript || "");
    playbackTimeSec.value = 0;
    playbackDurationSec.value = Math.max(0, Number(value?.playableDurationSec || diRecorder.recordingDurationSec.value || 0));
  }
);

watch(
  () => currentQuestion.value?.id,
  () => {
    closeImagePreview();
  }
);

watch(
  () => imagePreviewOpen.value,
  (opened) => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = opened ? "hidden" : "";
    if (!opened) {
      imagePreviewUrl.value = "";
      imagePreviewAlt.value = "";
      imagePreviewLoading.value = false;
      imagePreviewFailed.value = false;
      imagePreviewErrorText.value = "";
    }
  }
);

function clampDifficulty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // no-op
    }
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQueryArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => `${item || ""}`.trim()).filter(Boolean))];
  }
  const text = `${value || ""}`.trim();
  return text ? [text] : [];
}

function syncTemplateCarryFromRoute() {
  carriedTemplateBlockIds.value = normalizeQueryArray(route.query?.tb);
}

function normalizeQuestionHighFrequencyWords(value) {
  return toArray(value)
    .map((item) => {
      const word = `${item?.word || ""}`.trim();
      if (!word) return null;
      return {
        word,
        partOfSpeech: `${item?.partOfSpeech || item?.pos || ""}`.trim(),
        chinese: `${item?.chinese || item?.definitionZh || item?.defZh || ""}`.trim(),
        note: `${item?.note || item?.definitionEn || item?.defEn || ""}`.trim(),
        example: `${item?.example || ""}`.trim()
      };
    })
    .filter(Boolean);
}

function inferVisualFeaturesByImageType(imageType = "") {
  if (["bar", "line", "pie", "table", "mixed"].includes(imageType)) {
    return {
      hasTrend: true,
      hasComparison: true,
      hasExtreme: true,
      hasNumbers: true
    };
  }

  if (imageType === "process") {
    return {
      hasTrend: false,
      hasComparison: false,
      hasExtreme: false,
      hasNumbers: false
    };
  }

  if (imageType === "map") {
    return {
      hasTrend: false,
      hasComparison: true,
      hasExtreme: false,
      hasNumbers: false
    };
  }

  return {
    hasTrend: false,
    hasComparison: false,
    hasExtreme: false,
    hasNumbers: false
  };
}

function normalizeVisualFeatures(value, imageType = "") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const inferred = inferVisualFeaturesByImageType(`${imageType || ""}`.trim().toLowerCase());
  const sourceAllTrue = ["hasTrend", "hasComparison", "hasExtreme", "hasNumbers"].every((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    return Boolean(source?.[key] ?? source?.[snakeKey]);
  });
  const normalizedImageType = `${imageType || ""}`.trim().toLowerCase();
  if (sourceAllTrue && (normalizedImageType === "process" || normalizedImageType === "map")) {
    return { ...inferred };
  }
  return {
    hasTrend: Boolean(source?.hasTrend ?? source?.has_trend ?? inferred.hasTrend),
    hasComparison: Boolean(source?.hasComparison ?? source?.has_comparison ?? inferred.hasComparison),
    hasExtreme: Boolean(source?.hasExtreme ?? source?.has_extreme ?? inferred.hasExtreme),
    hasNumbers: Boolean(source?.hasNumbers ?? source?.has_numbers ?? inferred.hasNumbers)
  };
}

function countTranscriptWords(text) {
  return (`${text || ""}`.trim().match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
}

function normalizeDIContextText(value) {
  return `${value || ""}`
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[,./\\\-|:;]+/, "")
    .replace(/[,./\\\-|:;]+$/, "");
}

function stripDITypePrefix(text) {
  const normalized = normalizeDIContextText(text);
  return normalized.replace(/^(map|line chart|bar chart|pie chart|table|process diagram|mixed chart)\s*:\s*/i, "").trim();
}

function extractTermsFromTopic(topic) {
  const core = stripDITypePrefix(topic);
  if (!core) return [];

  const splitByVs = core.split(/\s+vs\.?\s+/i).map((item) => normalizeDIContextText(item));
  const splitByPunc = core.split(/[|,/]/).map((item) => normalizeDIContextText(item));
  const splitByAnd = core.split(/\s+and\s+/i).map((item) => normalizeDIContextText(item));
  return [core, ...splitByVs, ...splitByPunc, ...splitByAnd].filter(Boolean);
}

function extractVsPair(topic) {
  const core = stripDITypePrefix(topic);
  const matched = core.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (!matched) return [];
  return [normalizeDIContextText(matched[1]), normalizeDIContextText(matched[2])].filter(Boolean);
}

function extractNumberTokens(texts = []) {
  const source = texts
    .map((item) => normalizeDIContextText(item))
    .filter(Boolean)
    .join(" | ");
  if (!source) return [];

  const pattern = /\b\d+(?:\.\d+)?(?:\s?(?:%|percent|m|km|cm|mm|m2|m²|°c|°f|years?|months?|days?|hours?|minutes?|mins?|seconds?|kg|g|tons?|million|billion|miles?|meters?|metres?))?\b/gi;
  const matched = source.match(pattern) || [];
  return uniqueDIContextTerms(matched, 6);
}

function extractColorTokens(texts = []) {
  const source = texts
    .map((item) => normalizeDIContextText(item).toLowerCase())
    .filter(Boolean)
    .join(" | ");
  if (!source) return [];

  const found = DI_COLOR_WORDS.filter((color) => {
    if (/[\u4e00-\u9fa5]/.test(color)) return source.includes(color);
    return new RegExp(`\\b${color}\\b`, "i").test(source);
  });
  return uniqueDIContextTerms(found, 4);
}

function uniqueDIContextTerms(values = [], limit = 8) {
  const output = [];
  const seen = new Set();

  values.forEach((item) => {
    const value = normalizeDIContextText(item);
    if (!value) return;

    const lower = value.toLowerCase();
    if (!/[\u4e00-\u9fa5a-z]/i.test(value)) return;
    if (value.length < 2) return;
    if (value.length > 48) return;
    if (DI_FOCUS_STOP_WORDS.has(lower)) return;
    if (seen.has(lower)) return;

    seen.add(lower);
    output.push(value);
  });

  return output.slice(0, limit);
}

function buildDILiveContext(question, highFrequencyWords = []) {
  const imageType = normalizeDIImageType(question?.imageType) || "mixed";
  const topic = normalizeDIContextText(question?.topic || "");
  const topicCore = stripDITypePrefix(topic);
  const keyPoints = uniqueDIContextTerms(
    toArray(question?.keyPoints).map((item) => (typeof item === "string" ? item : item?.text || item?.point || "")),
    6
  );
  const vocabTerms = uniqueDIContextTerms(
    toArray(highFrequencyWords).map((item) => item?.word || item),
    8
  );
  const vsPair = extractVsPair(topic);
  const topicTerms = extractTermsFromTopic(topic);
  const focusTerms = uniqueDIContextTerms([...vsPair, ...topicTerms, ...vocabTerms, ...keyPoints], 10);

  const textSources = [
    topic,
    normalizeDIContextText(question?.content || ""),
    ...keyPoints,
    ...vocabTerms
  ];

  const numbers = extractNumberTokens(textSources);
  const colors = extractColorTokens(textSources);

  return {
    imageType,
    topic,
    topicCore: topicCore || topic || "the image",
    focusTerms,
    keyPoints,
    numbers,
    colors,
    vsPair,
    mainA: focusTerms[0] || "the main feature",
    mainB: focusTerms[1] || "another feature"
  };
}

function buildDILiveSentences(context) {
  const subject = context?.topicCore || "the image";
  const mainA = context?.mainA || "the main feature";
  const mainB = context?.mainB || "another feature";
  const numA = context?.numbers?.[0] || "one key figure";
  const numB = context?.numbers?.[1] || "another figure";
  const colorA = context?.colors?.[0] || "a dominant color";
  const pairLeft = context?.vsPair?.[0] || mainA;
  const pairRight = context?.vsPair?.[1] || mainB;
  const imageType = context?.imageType || "mixed";

  const opening = [
    `This image is mainly about ${subject}.`,
    `At a glance, the visual focuses on ${mainA} and ${mainB}.`
  ];

  let detail = [
    `A clear comparison can be made between ${pairLeft} and ${pairRight}.`,
    `I can also mention specific figures such as ${numA} and ${numB}.`,
    `Besides numbers, one visible color cue is ${colorA}.`
  ];

  if (imageType === "map") {
    detail = [
      `The map compares ${pairLeft} and ${pairRight} in terms of location or layout.`,
      `I can describe position words like top, bottom, left and right around ${mainA}.`,
      context?.numbers?.length
        ? `The diagram also includes measurements like ${numA}${context?.numbers?.[1] ? ` and ${numB}` : ""}.`
        : `I can mention at least one labelled place, for example ${mainA}.`
    ];
  } else if (imageType === "process") {
    detail = [
      `The process starts from ${mainA} and then moves to ${mainB}.`,
      `I can describe the middle steps in sequence using first, then and finally.`,
      context?.numbers?.length
        ? `If there are figures, I can cite values like ${numA} to support the description.`
        : `I should mention one input, one transition and one output stage.`
    ];
  } else if (imageType === "line") {
    detail = [
      `The line chart shows how ${mainA} changes over time compared with ${mainB}.`,
      `I can state the trend direction first, then describe peaks and lows.`,
      `A quick numeric reference can be ${numA}${context?.numbers?.[1] ? ` and ${numB}` : ""}.`
    ];
  } else if (imageType === "bar" || imageType === "pie" || imageType === "table" || imageType === "mixed") {
    detail = [
      `The chart highlights differences between ${pairLeft} and ${pairRight}.`,
      `I can first mention the highest and lowest parts, then give one comparison.`,
      `One useful data point to quote is ${numA}.`
    ];
  }

  const closing = [
    `Overall, this visual clearly explains ${subject}.`
  ];

  return {
    opening,
    detail,
    closing
  };
}

function buildDILiveTips(context) {
  const imageType = context?.imageType || "mixed";
  let steps = [
    "先一句总述（主题）。",
    "再说最高/最低或最明显差异。",
    "最后补一个数字并总结。"
  ];

  if (imageType === "map") {
    steps = [
      "先说整体对象（地图/平面图讲什么）。",
      "再按方位说位置关系（上/下/左/右/中间）。",
      "最后补尺寸或标注信息并总结。"
    ];
  } else if (imageType === "process") {
    steps = [
      "先说流程主题和起点。",
      "再按顺序串联中间步骤。",
      "最后说终点结果并做总结。"
    ];
  } else if (imageType === "line") {
    steps = [
      "先说时间范围和对象。",
      "再说总体趋势（上升/下降/波动）。",
      "最后补高点低点或关键年份。"
    ];
  } else if (imageType === "pie") {
    steps = [
      "先说饼图主题。",
      "再说最大占比和最小占比。",
      "最后补其余部分并总结。"
    ];
  }

  return {
    steps,
    mustMention: context?.focusTerms?.slice(0, 6) || [],
    numbers: context?.numbers?.slice(0, 6) || []
  };
}

function resolveSlotSuggestion(slot, context) {
  const label = `${slot || ""}`.trim();
  if (!label) return context?.mainA || "one key item";

  if (label.includes("标题") || /title/i.test(label)) return context?.topicCore || context?.topic || "the topic";
  if (label.includes("最大") || label.includes("最高") || /maximum|highest|top/i.test(label)) return context?.focusTerms?.[0] || context?.mainA || "the highest item";
  if (label.includes("最小") || label.includes("最低") || /minimum|lowest|bottom/i.test(label)) return context?.focusTerms?.[1] || context?.mainB || "the lowest item";
  if (label.includes("颜色") || /color|colour/i.test(label)) return context?.colors?.[0] || "one visible color";
  if (label.includes("数字") || label.includes("年份") || /number|year|figure|value/i.test(label)) return context?.numbers?.[0] || "one key figure";
  if (label.includes("上方") || label.includes("左") || /start|beginning/i.test(label)) return context?.focusTerms?.[0] || context?.mainA || "the starting point";
  if (label.includes("下方") || label.includes("右") || /end|ending/i.test(label)) return context?.focusTerms?.[1] || context?.mainB || "the ending point";
  return context?.focusTerms?.[2] || context?.mainA || "one important detail";
}

function normalizeQuestionRow(row) {
  const content = `${row?.content || row?.promptText || ""}`.trim();
  const topic = `${row?.topic || row?.topicTitle || row?.displayTitle || row?.sourceNumberLabel || ""}`.trim();
  const imageUrl = `${row?.image_url || row?.imageUrl || ""}`.trim();
  const normalizedType = normalizeDIImageType(row?.image_type || row?.imageType);
  const inferredType = normalizedType || inferDIImageTypeFromText(
    topic,
    content,
    toArray(row?.key_points).join(" "),
    toArray(row?.high_frequency_words || row?.highFrequencyWords || row?.vocab || row?.key_terms || row?.keyTerms)
      .map((item) => (typeof item === "string" ? item : item?.word || ""))
      .join(" ")
  );

  const baseQuestion = {
    id: `${row?.id || ""}`.trim(),
    taskType: "DI",
    content,
    topic,
    displayTitle: `${row?.displayTitle || row?.display_title || topic || row?.sourceNumberLabel || ""}`.trim(),
    sourceNumberLabel: `${row?.sourceNumberLabel || row?.source_number_label || ""}`.trim(),
    imageUrl,
    keyPoints: toArray(row?.key_points || row?.keyPoints),
    keyTerms: toArray(row?.key_terms || row?.keyTerms),
    difficulty: clampDifficulty(row?.difficulty),
    imageType: inferredType,
    visualFeatures: normalizeVisualFeatures(row?.visual_features || row?.visualFeatures, inferredType),
    highFrequencyWords: normalizeQuestionHighFrequencyWords(
      row?.high_frequency_words || row?.highFrequencyWords || row?.vocab || row?.key_terms || row?.keyTerms
    )
  };

  const derivedMeta = buildDIQuestionMetaPayload(baseQuestion);

  return {
    ...baseQuestion,
    keyPoints: [...derivedMeta.key_points],
    keyTerms: [...derivedMeta.key_terms],
    keyElements: [...derivedMeta.key_elements],
    relations: [...derivedMeta.relations],
    implicationsOrConclusion: [...derivedMeta.implications_or_conclusion],
    numbersOrExtremes: [...derivedMeta.numbers_or_extremes],
    sequenceOrTrend: [...derivedMeta.sequence_or_trend],
    comparisonAxes: [...derivedMeta.comparison_axes]
  };
}

function getLocalFallbackQuestions() {
  const local = getDIQuestionsByFilters({});
  return (Array.isArray(local) ? local : [])
    .map((item) =>
      normalizeQuestionRow({
        id: item.id,
        content: item.promptText || item.content || item.displayTitle,
        topic: item.topicTitle || item.displayTitle || item.sourceNumberLabel,
        displayTitle: item.topicTitle || item.displayTitle || item.sourceNumberLabel,
        sourceNumberLabel: item.sourceNumberLabel,
        image_url: item.imageUrl,
        key_points: item.keyPoints || [],
        key_terms: item.keyTerms || [],
        difficulty: item.difficulty,
        image_type: item.imageType,
        visualFeatures: item.visualFeatures,
        highFrequencyWords: item.highFrequencyWords || []
      })
    )
    .filter((item) => item.id && item.content);
}

function getQuestionImageType(question) {
  return normalizeDIImageType(question?.imageType);
}

function getQuestionsForImageType(type) {
  const normalizedType = normalizeDIImageType(type);
  if (!normalizedType) return [];
  return allQuestions.value.filter((item) => getQuestionImageType(item) === normalizedType);
}

function findFirstAvailableImageType(preferredType = "") {
  const candidates = [normalizeDIImageType(preferredType), ...DI_IMAGE_TYPE_FILTERS.map((item) => item.id)];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (getQuestionsForImageType(candidate).length) {
      return candidate;
    }
  }
  return "";
}

function shuffle(list) {
  const cloned = [...list];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[swapIndex]] = [cloned[swapIndex], cloned[i]];
  }
  return cloned;
}

function formatSeconds(value) {
  const sec = Math.max(0, Math.round(Number(value || 0)));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function resolveStartOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function resolveEndOfTodayIso() {
  const now = new Date();
  now.setHours(24, 0, 0, 0);
  return now.toISOString();
}
function resolveDurationFromScoreJson(scoreJson) {
  const score = scoreJson && typeof scoreJson === "object" ? scoreJson : {};
  const fromFlat = Number(score?.duration_sec || 0);
  if (Number.isFinite(fromFlat) && fromFlat > 0) return fromFlat;
  const fromMetrics = Number(score?.metrics?.speech_duration_sec || 0);
  if (Number.isFinite(fromMetrics) && fromMetrics > 0) return fromMetrics;
  return 0;
}

function resolveOverallFromScoreJson(scoreJson) {
  const score = scoreJson && typeof scoreJson === "object" ? scoreJson : {};
  const aiReview = score?.ai_review && typeof score.ai_review === "object" ? score.ai_review : {};
  const displayScores = aiReview?.display_scores && typeof aiReview.display_scores === "object" ? aiReview.display_scores : {};
  const overall = Number(displayScores?.overall ?? aiReview?.overall ?? score?.overall ?? 0);
  if (!Number.isFinite(overall) || overall <= 0) return 0;
  return Math.max(10, Math.min(90, Math.round(overall)));
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadQuestions() {
  loadingQuestions.value = true;
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("task_type", "DI")
      .order("id", { ascending: true });

    if (error) throw error;

    const normalized = (Array.isArray(data) ? data : [])
      .filter((row) => row?.is_active !== false)
      .map((row) => normalizeQuestionRow(row))
      .filter((row) => row.id && row.content);

    if (normalized.length) {
      allQuestions.value = normalized;
      return;
    }

    const fallback = getLocalFallbackQuestions();
    allQuestions.value = fallback;
    if (fallback.length) {
      console.info("DI questions fallback: Supabase has no active DI rows, using local seed catalog.");
    } else {
      uiStore.showToast("DI 题库为空，请先在 Supabase questions 表添加 DI 题目。", "warning");
    }
  } catch (error) {
    console.warn("DI questions load failed:", error);
    const fallback = getLocalFallbackQuestions();
    allQuestions.value = fallback;
    if (fallback.length) {
      console.warn("DI questions fallback: Supabase read failed, using local seed catalog.");
    } else {
      uiStore.showToast("DI 题库加载失败，请检查 Supabase 配置。", "warning");
    }
  } finally {
    loadingQuestions.value = false;
  }
}

function resetTemplatePanelState() {
  activeTab.value = "structure";
  usedPhraseFlags.value = {};
  templatePickerOpen.value = false;
  templateMode.value = carriedTemplateBlockIds.value.length ? "manual" : "random";
}

function chooseRandomTemplate() {
  const templates = templateCandidates.value;
  templateMode.value = "random";
  templatePickerOpen.value = false;
  if (!templates.length) {
    selectedTemplateId.value = "";
    return;
  }
  const randomItem = templates[Math.floor(Math.random() * templates.length)];
  selectedTemplateId.value = randomItem?.id || "";
}

function applyCarriedTemplateForCurrentQuestion() {
  const templates = templateCandidates.value;
  if (!templates.length) {
    selectedTemplateId.value = "";
    templateMode.value = "random";
    return false;
  }

  if (!carriedTemplateBlockIds.value.length) return false;

  const matchedTemplateId = carriedTemplateBlockIds.value.find((templateId) =>
    templates.some((item) => item.id === templateId)
  );
  if (!matchedTemplateId) return false;

  selectedTemplateId.value = matchedTemplateId;
  templateMode.value = "manual";
  templatePickerOpen.value = false;
  return true;
}

function selectTemplate(templateId) {
  const normalized = `${templateId || ""}`.trim();
  if (!normalized) return;
  const exists = templateCandidates.value.some((item) => item.id === normalized);
  if (!exists) return;
  templateMode.value = "manual";
  selectedTemplateId.value = normalized;
  templatePickerOpen.value = false;
}

function toggleTemplatePicker() {
  const next = !templatePickerOpen.value;
  templatePickerOpen.value = next;
  if (next) {
    templateMode.value = "manual";
  }
}

async function applyQuestionState() {
  const question = currentQuestion.value;
  if (!question) return;
  practiceStore.setQuestion(question);
  practiceStore.setTranscript("");
  practiceStore.setAudioBlob(null);
  playbackTimeSec.value = 0;
  playbackDurationSec.value = 0;
  resetTemplatePanelState();
  const appliedCarriedTemplate = applyCarriedTemplateForCurrentQuestion();
  if (!appliedCarriedTemplate) {
    chooseRandomTemplate();
  }
  void syncCurrentQuestionImage(question);
  await Promise.allSettled([
    loadFavoriteState(question.id),
    diRecorder.enterPreparePhase()
  ]);
}

async function buildSession(type, preferredQuestionId = "", excludedQuestionId = "") {
  const normalizedRequestedType = normalizeDIImageType(type);
  const normalizedPreferred = `${preferredQuestionId || ""}`.trim();
  const normalizedExcluded = `${excludedQuestionId || ""}`.trim();
  const preferredQuestion = normalizedPreferred
    ? allQuestions.value.find((item) => item.id === normalizedPreferred)
    : null;
  const resolvedType = normalizedRequestedType
    || getQuestionImageType(preferredQuestion)
    || findFirstAvailableImageType(selectedImageType.value || "map")
    || selectedImageType.value
    || "map";

  selectedImageType.value = normalizeDIImageType(resolvedType) || "map";
  let sameTypePool = getQuestionsForImageType(selectedImageType.value);
  if (!sameTypePool.length && preferredQuestion) {
    sameTypePool = [preferredQuestion];
  }

  if (!sameTypePool.length) {
    sessionQuestions.value = [];
    currentQuestionIndex.value = 0;
    return;
  }

  let sourcePool = normalizedExcluded
    ? sameTypePool.filter((item) => item.id !== normalizedExcluded)
    : [...sameTypePool];
  if (!sourcePool.length) {
    sourcePool = [...sameTypePool];
  }

  const shuffled = shuffle(sourcePool);
  const sessionSize = Math.min(SESSION_TOTAL, shuffled.length);
  let session = shuffled.slice(0, sessionSize);
  if (normalizedPreferred) {
    const preferred = sameTypePool.find((item) => item.id === normalizedPreferred);
    if (preferred) {
      session = [preferred, ...session.filter((item) => item.id !== preferred.id)].slice(0, sessionSize);
    }
  }

  sessionQuestions.value = session;
  currentQuestionIndex.value = 0;
  await applyQuestionState();
}

async function initializeSessionFromRoute() {
  const preferredQuestionId = `${route.query?.qid || route.query?.questionId || route.params?.id || ""}`.trim();
  const routeType = normalizeDIImageType(route.query?.type || route.query?.imageType);
  const questionMatchedType = preferredQuestionId
    ? allQuestions.value.find((item) => item.id === preferredQuestionId)?.imageType
    : "";
  const preferredType = routeType || normalizeDIImageType(questionMatchedType) || findFirstAvailableImageType("map") || "map";
  await buildSession(preferredType, preferredQuestionId);
}

async function switchImageType(type) {
  const normalizedType = normalizeDIImageType(type);
  if (!normalizedType || normalizedType === selectedImageType.value) return;
  await buildSession(normalizedType);
  if (!sessionQuestions.value.length) {
    uiStore.showToast(`当前暂无 ${getDIImageTypeMeta(normalizedType).label} 题目。`, "warning", 1800);
  }
}

async function activateRandomQuestion() {
  if (!sessionQuestions.value.length) return;
  if (sessionQuestions.value.length === 1) {
    await buildSession(selectedImageType.value, "", currentQuestion.value?.id || "");
    return;
  }

  let nextIndex = currentQuestionIndex.value;
  while (nextIndex === currentQuestionIndex.value) {
    nextIndex = Math.floor(Math.random() * sessionQuestions.value.length);
  }
  currentQuestionIndex.value = nextIndex;
  await applyQuestionState();
}

async function startRecordingNow() {
  const ok = await diRecorder.skipPreparePhase();
  if (!ok && recorderErrorText.value) {
    uiStore.showToast(recorderErrorText.value, "warning");
  }
}

async function jumpToNextQuestionFromPrepare() {
  if (recorderPhase.value !== "prepare") return;
  if (!sessionQuestions.value.length) return;

  diRecorder.timer.stop();
  diRecorder.recorder.stopRecording();

  if (currentQuestionIndex.value >= sessionQuestions.value.length - 1) {
    await buildSession(selectedImageType.value, "", currentQuestion.value?.id || "");
    return;
  }

  currentQuestionIndex.value += 1;
  await applyQuestionState();
}

function togglePhraseUsage(phrase) {
  const key = `${phrase || ""}`.trim().toLowerCase();
  if (!key) return;
  const next = { ...usedPhraseFlags.value };
  next[key] = !next[key];
  usedPhraseFlags.value = next;
}

function isPhraseUsed(phrase) {
  const key = `${phrase || ""}`.trim().toLowerCase();
  return Boolean(usedPhraseFlags.value[key]);
}

function onPlaybackTimeUpdate(event) {
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  playbackTimeSec.value = Number(audio.currentTime || 0);
}

function onPlaybackLoadedMetadata(event) {
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  playbackDurationSec.value = Number(audio.duration || diRecorder.recordingDurationSec.value || 0);
}

function bindHistoryAudioRef(recordId, element) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  if (element) {
    historyAudioRefs[id] = element;
    if (!historyPlaybackTimes[id]) historyPlaybackTimes[id] = 0;
  } else {
    delete historyAudioRefs[id];
    delete historyPlaybackTimes[id];
    delete historyPlaybackDurations[id];
    if (historyPlayingId.value === id) historyPlayingId.value = "";
  }
}

function pauseAllHistoryAudio(exceptId = "") {
  const keepId = `${exceptId || ""}`.trim();
  Object.entries(historyAudioRefs).forEach(([id, audio]) => {
    if (!(audio instanceof HTMLAudioElement)) return;
    if (id === keepId) return;
    audio.pause();
  });
}

function getHistoryCurrentTime(recordId) {
  const id = `${recordId || ""}`.trim();
  const time = Number(historyPlaybackTimes[id] || 0);
  return Number.isFinite(time) && time >= 0 ? time : 0;
}

function getHistoryDuration(record) {
  const id = `${record?.id || ""}`.trim();
  const fromMeta = Number(historyPlaybackDurations[id] || 0);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  const fallback = Number(record?.durationSec || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function getHistoryProgressPercent(record) {
  const duration = getHistoryDuration(record);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const current = getHistoryCurrentTimeForRecord(record);
  const ratio = current / duration;
  return Math.max(0, Math.min(100, ratio * 100));
}

function getHistoryCurrentTimeForRecord(record) {
  const duration = getHistoryDuration(record);
  const current = getHistoryCurrentTime(record?.id);
  if (!Number.isFinite(duration) || duration <= 0) return current;
  if (duration - current <= HISTORY_END_SNAP_SECONDS) return duration;
  return Math.max(0, Math.min(current, duration));
}

function onHistoryLoadedMetadata(recordId, event) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  const duration = Number(audio.duration || 0);
  if (Number.isFinite(duration) && duration > 0) {
    historyPlaybackDurations[id] = duration;
  }
}

function onHistoryTimeUpdate(recordId, event) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  historyPlaybackTimes[id] = Math.max(0, Number(audio.currentTime || 0));
}

function onHistoryPlay(recordId) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  pauseAllHistoryAudio(id);
  historyPlayingId.value = id;
}

function onHistoryPause(recordId, event) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const audio = event?.target;
  if (audio instanceof HTMLAudioElement) {
    const duration = Number(audio.duration || historyPlaybackDurations[id] || 0);
    const current = Number(audio.currentTime || historyPlaybackTimes[id] || 0);
    if (Number.isFinite(duration) && duration > 0) {
      historyPlaybackDurations[id] = duration;
      historyPlaybackTimes[id] = duration - current <= HISTORY_END_SNAP_SECONDS ? duration : Math.max(0, current);
    }
  }
  if (historyPlayingId.value === id) {
    historyPlayingId.value = "";
  }
}

function onHistoryEnded(recordId, event) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const audio = event?.target;
  const endedDuration = Number(
    (audio instanceof HTMLAudioElement ? audio.duration : 0) || historyPlaybackDurations[id] || 0
  );
  if (Number.isFinite(endedDuration) && endedDuration > 0) {
    historyPlaybackDurations[id] = endedDuration;
    historyPlaybackTimes[id] = endedDuration;
  }
  if (historyPlayingId.value === id) {
    historyPlayingId.value = "";
  }
}

function onHistorySeek(recordId, event) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const audio = historyAudioRefs[id];
  if (!(audio instanceof HTMLAudioElement)) return;

  const next = Number(event?.target?.value || 0);
  if (!Number.isFinite(next) || next < 0) return;

  audio.currentTime = next;
  historyPlaybackTimes[id] = next;
}

function playHistoryRecord(record) {
  const id = `${record?.id || ""}`.trim();
  const audio = historyAudioRefs[id];
  if (!(audio instanceof HTMLAudioElement)) return;

  const isPlaying = historyPlayingId.value === id && !audio.paused;
  if (isPlaying) {
    audio.pause();
    historyPlayingId.value = "";
    return;
  }

  pauseAllHistoryAudio(id);

  if (audio.ended) {
    audio.currentTime = 0;
    historyPlaybackTimes[id] = 0;
  }

  try {
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        // no-op
      });
    }
    historyPlayingId.value = id;
  } catch {
    // no-op
  }
}
function favoriteLocalStorageKey(userId) {
  return `kai_kou_di_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  const key = favoriteLocalStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((item) => `${item || ""}`.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFavorites(userId, favoriteSet) {
  const key = favoriteLocalStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify([...favoriteSet]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

function isDuplicateInsertError(error) {
  return `${error?.code || ""}` === "23505";
}

async function loadFavoriteState(questionIdInput = "") {
  const userId = await resolveCurrentUserId();
  const questionId = `${questionIdInput || currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) {
    isFavorite.value = false;
    return;
  }

  const localFavorites = readLocalFavorites(userId);
  if (`${currentQuestion.value?.id || ""}`.trim() === questionId) {
    isFavorite.value = localFavorites.has(questionId);
  }

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("task_type", "DI")
      .eq("question_id", questionId)
      .limit(1);

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        if (`${currentQuestion.value?.id || ""}`.trim() === questionId) {
          favoriteSource.value = "local";
        }
        return;
      }
      throw error;
    }

    if (`${currentQuestion.value?.id || ""}`.trim() !== questionId) {
      return;
    }

    favoriteSource.value = "remote";
    isFavorite.value = Array.isArray(data) && data.length > 0;
    if (isFavorite.value) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
  } catch (error) {
    console.warn("DI favorite load fallback to local:", error);
    if (`${currentQuestion.value?.id || ""}`.trim() === questionId) {
      favoriteSource.value = "local";
    }
  }
}

async function toggleFavorite() {
  if (favoriteBusy.value) return;
  const userId = await resolveCurrentUserId();
  const questionId = `${currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) return;

  favoriteBusy.value = true;
  try {
    const nextState = !isFavorite.value;
    const localFavorites = readLocalFavorites(userId);
    if (nextState) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
    isFavorite.value = nextState;

    if (favoriteSource.value !== "local") {
      if (nextState) {
        const { error } = await supabase.from("favorites").insert({
          user_id: userId,
          task_type: "DI",
          question_id: questionId
        });
        if (error && !isDuplicateInsertError(error)) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("task_type", "DI")
          .eq("question_id", questionId);
        if (error) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      }
    }

    uiStore.showToast(nextState ? "已收藏本题" : "已取消收藏", "success", 1200);
  } catch (error) {
    console.warn("DI favorite toggle failed:", error);
    uiStore.showToast("收藏操作失败，请稍后重试。", "warning");
  } finally {
    favoriteBusy.value = false;
  }
}

function stopSpeechSynthesis() {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

function playModelReading() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    uiStore.showToast("当前浏览器不支持范文朗读。", "warning");
    return;
  }
  stopSpeechSynthesis();
  const text = `${selectedTemplate.value?.sentence || ""}`.trim();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-AU";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function loadTodayStats() {
  const userId = await resolveCurrentUserId();
  if (!userId) return;

  loadingStats.value = true;
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("score_json, created_at")
      .eq("user_id", userId)
      .eq("task_type", "DI")
      .gte("created_at", resolveStartOfTodayIso())
      .lt("created_at", resolveEndOfTodayIso())
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const practicedCount = rows.length;
    const totalDurationSec = rows.reduce((sum, row) => sum + resolveDurationFromScoreJson(row?.score_json), 0);
    const overallValues = rows
      .map((row) => resolveOverallFromScoreJson(row?.score_json))
      .filter((value) => value > 0);
    const totalOverall = overallValues.reduce((sum, value) => sum + value, 0);

    summaryStats.value = {
      practicedCount,
      totalMinutes: Math.round(totalDurationSec / 60),
      averageOverall: overallValues.length ? Number((totalOverall / overallValues.length).toFixed(1)) : 0
    };
  } catch (error) {
    console.warn("DI today stats load failed:", error);
    summaryStats.value = {
      practicedCount: 0,
      totalMinutes: 0,
      averageOverall: 0
    };
  } finally {
    loadingStats.value = false;
  }
}
async function persistCurrentRound({ userId = "" } = {}) {
  if (submittingRound.value) return null;
  const question = currentQuestion.value;
  const result = diRecorder.stopResult.value;
  if (!question || !result?.blob) {
    return {
      ok: false,
      reason: "audio_upload_failed"
    };
  }

  const resolvedUserId = `${userId || await resolveCurrentUserId()}`.trim();
  if (!resolvedUserId) {
    return {
      ok: false,
      reason: "auth_session_failed"
    };
  }

  submittingRound.value = true;
  try {
    const transcript = `${result?.transcript || practiceStore.transcript || ""}`.trim();
    const durationSec = Math.max(0, Number(diRecorder.recordingDurationSec.value || 0));
    const prepareSec = Math.max(0, Number(diRecorder.prepareDurationSec.value || 0));
    const questionMeta = buildDIQuestionMetaPayload(question);
    const questionSnapshot = buildDIQuestionSnapshot(question, questionMeta);
    const audioSignals = buildDIAudioSignalsPayload(result, diRecorder.recordingDurationSec.value);
    const speechSec = Math.max(0, Number(audioSignals?.duration_sec || durationSec || 0));
    const analytics = buildPracticeAnalytics({
      source: "computed_client_flow",
      totalActiveSec: prepareSec + speechSec,
      breakdown: {
        prepare_sec: prepareSec,
        record_sec: speechSec,
        speech_sec: speechSec
      }
    });
    const audioMeta = await uploadDIAudio({
      userId: resolvedUserId,
      questionId: question.id,
      blob: result.blob
    });

    if (!audioMeta?.bucket || !audioMeta?.path) {
      return {
        ok: false,
        reason: `${audioMeta?.reasonCode || "audio_upload_failed"}`.trim() || "audio_upload_failed",
        detail: `${audioMeta?.errorMessage || ""}`.trim()
      };
    }

    const payload = {
      user_id: resolvedUserId,
      task_type: "DI",
      question_id: question.id,
      transcript,
      score_json: {
        duration_sec: durationSec,
        image_type: question.imageType,
        question_content: questionMeta.question_content,
        question_meta: questionMeta,
        question: questionSnapshot,
        metrics: {
          speech_duration_sec: durationSec,
          transcript_word_count: countTranscriptWords(transcript)
        },
        analytics,
        audio_signals: audioSignals,
        ai_review_job: createPendingDIAiReviewJob(),
        audio: {
          ...audioMeta,
          status: "ready"
        }
      },
      feedback: "",
      created_at: new Date().toISOString()
    };

    const { data: insertedRow, error } = await supabase
      .from("practice_logs")
      .insert(payload)
      .select("id, task_type, score_json, transcript, feedback")
      .single();
    if (error) {
      try {
        const { error: removeError } = await supabase.storage.from(audioMeta.bucket).remove([audioMeta.path]);
        if (removeError) {
          console.warn("DI uploaded audio compensation remove failed:", removeError, {
            questionId: question.id,
            path: audioMeta.path
          });
        }
      } catch (removeException) {
        console.warn("DI uploaded audio compensation remove failed:", removeException, {
          questionId: question.id,
          path: audioMeta.path
        });
      }
      console.warn("DI practice_logs insert failed:", error);
      return {
        ok: false,
        reason: resolveDIInsertFailureReason(error),
        detail: `${error?.message || error?.details || error?.hint || ""}`.trim()
      };
    }

    let blobUrl = "";
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        blobUrl = URL.createObjectURL(result.blob);
      } catch {
        blobUrl = "";
      }
    }

    if (blobUrl) {
      practiceStore.pushDIRecentRecording({
        questionId: question.id,
        blobUrl,
        durationSec,
        createdAt: new Date().toISOString()
      });
    }

    await loadTodayStats();
    return {
      ok: true,
      logId: `${insertedRow?.id || ""}`.trim()
    };
  } catch (error) {
    console.warn("DI submit persist unexpected error:", error);
    return {
      ok: false,
      reason: resolveDIInsertFailureReason(error),
      detail: `${error?.message || ""}`.trim()
    };
  } finally {
    submittingRound.value = false;
  }
}

function buildDIReviewRouteQuery({
  logId = "",
  questionId = "",
  startedAt = "",
  pendingSubmit = false,
  submitFailed = false,
  submitReason = ""
} = {}) {
  const query = {};
  const normalizedLogId = `${logId || ""}`.trim();
  const normalizedQuestionId = `${questionId || ""}`.trim();
  const normalizedStartedAt = `${startedAt || ""}`.trim();
  const normalizedSubmitReason = `${submitReason || ""}`.trim();
  if (normalizedLogId) query.logId = normalizedLogId;
  if (normalizedQuestionId) query.id = normalizedQuestionId;
  if (normalizedStartedAt) query.startedAt = normalizedStartedAt;
  if (pendingSubmit) query.pendingSubmit = "1";
  if (submitFailed) query.submitFailed = "1";
  if (normalizedSubmitReason) query.submitReason = normalizedSubmitReason;
  return query;
}

async function submitCurrentRound() {
  if (submittingRound.value) return;
  const question = currentQuestion.value;
  const result = diRecorder.stopResult.value;
  if (!question || !result?.blob) {
    uiStore.showToast("请先完成录音。", "warning");
    return;
  }

  const userId = await resolveCurrentUserId();
  if (!userId) {
    uiStore.showToast("登录状态失效，请重新登录。", "warning");
    return;
  }

  const analyzeStartedAtMs = Date.now();
  const outcome = await persistCurrentRound({ userId });
  if (!outcome?.ok || !outcome?.logId) {
    const failureReason = `${outcome?.reason || "practice_log_insert_failed"}`.trim() || "practice_log_insert_failed";
    console.warn("DI submit failed before analyzing route:", {
      reason: failureReason,
      detail: `${outcome?.detail || ""}`.trim(),
      questionId: question.id
    });
    uiStore.showToast(getDIFallbackReasonMessage(failureReason), "warning", 3600);
    return;
  }

  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(`kai_kou_di_analyzing_started_at_${outcome.logId}`, String(analyzeStartedAtMs));
    } catch {
      // no-op
    }
  }

  await router.push({
    path: "/di/analyzing",
    query: buildDIReviewRouteQuery({
      logId: outcome.logId,
      questionId: question.id,
      startedAt: analyzeStartedAtMs
    })
  });
}

async function restartCurrentAttempt() {
  if (!currentQuestion.value || submittingRound.value) return;
  practiceStore.setTranscript("");
  practiceStore.setAudioBlob(null);
  playbackTimeSec.value = 0;
  playbackDurationSec.value = 0;
  await diRecorder.enterPreparePhase();
}

function resolveDIInsertFailureReason(error) {
  const text = `${error?.message || error?.details || error?.hint || error?.code || error || ""}`.trim().toLowerCase();
  if (!text) return "practice_log_insert_failed";
  if (
    text.includes("auth")
    || text.includes("jwt")
    || text.includes("token")
    || text.includes("session")
    || text.includes("unauthorized")
  ) {
    return "auth_session_failed";
  }
  if (
    text.includes("row-level security")
    || text.includes("policy")
    || text.includes("permission")
    || text.includes("forbidden")
    || text.includes("not allowed")
    || text.includes("access denied")
  ) {
    return "practice_log_policy_failed";
  }
  return "practice_log_insert_failed";
}

async function handleBackHome() {
  stopSpeechSynthesis();
  router.push("/home");
}

onMounted(async () => {
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleWindowKeydown);
  }

  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  syncTemplateCarryFromRoute();
  await loadQuestions();
  await initializeSessionFromRoute();
  await loadTodayStats();
});

watch(
  () => route.query?.tb,
  () => {
    syncTemplateCarryFromRoute();
    const appliedCarriedTemplate = applyCarriedTemplateForCurrentQuestion();
    if (!appliedCarriedTemplate && !selectedTemplateId.value) {
      chooseRandomTemplate();
    }
  }
);

onUnmounted(() => {
  pauseAllHistoryAudio();
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleWindowKeydown);
  }
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
  }
  closeImagePreview();
  stopSpeechSynthesis();
});
</script>

<template>
  <div class="min-h-screen bg-[#F0F4F8] text-[#1E293B] di-font">
    <header class="bg-[#1B3A6B] px-4 py-3 text-white">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div class="min-w-0">
          <button
            type="button"
            class="mb-1 inline-flex items-center gap-1 text-sm text-white/90 transition-opacity hover:opacity-80"
            @click="handleBackHome"
          >
            <span>← 返回</span>
          </button>
          <h1 class="truncate text-lg font-bold">DI 图表描述</h1>
          <p class="text-xs text-white/70">第 {{ currentQuestionIndex + 1 }} 题 / 共 {{ sessionQuestions.length || SESSION_TOTAL }} 题</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <span
              v-for="dot in progressDots"
              :key="dot"
              class="h-2 w-2 rounded-full border border-white/60"
              :class="dot < currentQuestionIndex ? 'border-[#E8845A] bg-[#E8845A]' : dot === currentQuestionIndex ? 'border-white bg-white' : 'bg-transparent'"
            />
          </div>

          <button
            type="button"
            class="rounded-full border border-white/30 px-3 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/10"
            :disabled="favoriteBusy || !currentQuestion"
            @click="toggleFavorite"
          >
            <span :class="isFavorite ? 'text-[#FFD166]' : 'text-white/70'">{{ isFavorite ? "♥" : "♡" }}</span>
            收藏
          </button>

          <button
            type="button"
            class="rounded-full border border-white/30 px-3 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/10"
            :disabled="!sessionQuestions.length"
            @click="activateRandomQuestion"
          >
            随机
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl px-4 py-4">
      <section class="mb-4 overflow-x-auto">
        <div class="inline-flex min-w-full gap-2">
          <button
            v-for="item in DI_IMAGE_TYPE_FILTERS"
            :key="item.id"
            type="button"
            class="rounded-[20px] px-4 py-2 text-sm font-semibold transition-colors"
            :class="selectedImageType === item.id ? 'bg-[#1B3A6B] text-white' : 'bg-white text-[#1B3A6B] border border-[#E8EDF5]'"
            @click="switchImageType(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <div v-if="loadingQuestions" class="rounded-[14px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#8CA0C0]">
        DI 题库加载中...
      </div>
      <div v-else-if="!currentQuestion" class="rounded-[14px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#8CA0C0]">
        {{ emptySessionMessage }}
      </div>

      <template v-else>
        <section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-[#8CA0C0]">{{ currentQuestion.id || "DI-UNK" }} · {{ currentQuestion.topic || "Mixed" }}</p>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="currentImageMeta.badgeClass">{{ currentImageMeta.label }}</span>
            </div>

            <div class="mb-3 flex h-[190px] items-center justify-center overflow-hidden rounded-[10px] bg-[#F4F7FB]">
              <div v-if="isImageLoading" class="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
                <div class="h-[120px] w-full max-w-[220px] animate-pulse rounded-[10px] bg-white/80" />
                <p class="text-xs font-medium text-[#5B6F90]">正在加载新图片...</p>
              </div>
              <div v-else-if="imageLoadFailed" class="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                <p class="text-sm font-semibold text-[#5B6F90]">图片暂时不可用</p>
                <p class="text-xs text-[#8CA0C0]">{{ imageErrorText }}</p>
                <button
                  v-if="activeImageUrl"
                  type="button"
                  class="rounded-full border border-[#D7E2F0] px-3 py-1 text-xs font-semibold text-[#1B3A6B] transition-colors hover:bg-white"
                  @click="retryCurrentQuestionImage"
                >
                  重新加载
                </button>
              </div>
              <button
                v-else-if="displayedImageUrl"
                type="button"
                class="h-full w-full cursor-zoom-in focus:outline-none"
                @click="openImagePreview"
              >
                <img
                  :key="currentImageRenderKey"
                  :src="displayedImageUrl"
                  :alt="currentQuestion.topic || currentQuestion.id"
                  class="h-full w-full object-contain"
                />
              </button>
              <p v-else class="px-4 text-center text-xs text-[#8CA0C0]">当前题目缺少 image_url，请在题库补充图片地址。</p>
            </div>

            <div class="mb-3 grid grid-cols-3 rounded-[11px] bg-[#F8FAFD] p-1 text-center text-xs">
              <div
                v-for="(stage, stageIndex) in stageItems"
                :key="stage.key"
                class="rounded-[9px] px-2 py-1.5"
                :class="stageIndex === currentStageIndex ? 'bg-white text-[#1B3A6B] shadow-sm font-semibold' : 'text-[#8CA0C0]'"
              >
                {{ stage.label }}
              </div>
            </div>

            <div class="mb-4">
              <div class="mb-1 flex items-center justify-between text-xs text-[#8CA0C0]">
                <span>{{ recorderTimerLabel }}</span>
                <span class="text-base font-bold text-[#1B3A6B]">{{ recorderTimerRemaining }}</span>
              </div>
              <div class="h-2 rounded-full bg-[#E8EDF5]">
                <div class="h-2 rounded-full bg-[#1B3A6B] transition-all duration-300" :style="{ width: `${recorderTimerProgress}%` }" />
              </div>
            </div>
            <div v-if="recorderPhase === 'prepare'" class="space-y-2">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  :disabled="!canSkipPrepare"
                  @click="startRecordingNow"
                >
                  跳过准备，立即录音
                </button>
                <button
                  type="button"
                  class="w-full rounded-[11px] border border-[#1B3A6B] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B] transition-colors hover:bg-[#F4F7FB]"
                  :disabled="!canSkipPrepare"
                  @click="jumpToNextQuestionFromPrepare"
                >
                  下一题 →
                </button>
              </div>
              <p class="text-center text-xs text-[#8CA0C0]">准备阶段会在 25 秒后自动进入录音。</p>
              <p v-if="recorderErrorText" class="text-center text-xs text-red-500">{{ recorderErrorText }}</p>
            </div>

            <div v-else-if="recorderPhase === 'recording'" class="space-y-2">
              <button
                type="button"
                class="wave-btn w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                :disabled="!canFinishRecording"
                @click="diRecorder.stopRecordingPhase({ reason: 'manual_end' })"
              >
                <span class="wave-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                正在录音，点击结束
              </button>
              <p class="text-center text-xs text-[#8CA0C0]">录音阶段会在 40 秒后自动结束。</p>
            </div>

            <div v-else-if="recorderPhase === 'processing'" class="space-y-2">
              <button
                type="button"
                class="w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white opacity-80"
                disabled
              >
                正在结束录音...
              </button>
              <p class="text-center text-xs text-[#8CA0C0]">请稍候，正在整理音频。</p>
            </div>

            <div v-else class="space-y-3">
              <audio
                class="w-full"
                controls
                :src="recorderPreviewUrl"
                @timeupdate="onPlaybackTimeUpdate"
                @loadedmetadata="onPlaybackLoadedMetadata"
              />
              <p class="text-right text-xs text-[#8CA0C0]">{{ playbackTimeLabel }}</p>

              <div class="rounded-[12px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-sm text-[#52627A]">
                <p class="font-semibold text-[#1B3A6B]">提交后会进入独立分析页</p>
                <p class="mt-1 text-xs text-[#8CA0C0]">
                  练习页不再直接展示完整 AI 评分结果，结果会在独立页面呈现。
                </p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="flex-1 rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!canSubmitAiReview"
                  @click="submitCurrentRound()"
                >
                  {{ submittingRound ? "正在提交作答..." : "提交 AI评分" }}
                </button>
                <button
                  type="button"
                  class="rounded-[11px] border border-[#E8EDF5] px-3 py-3 text-xs text-[#8CA0C0] transition-colors hover:text-[#1B3A6B]"
                  :disabled="submittingRound"
                  @click="restartCurrentAttempt()"
                >
                  重录本题
                </button>
              </div>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-end justify-between gap-2 border-b border-[#E8EDF5] pb-2">
              <div>
                <h2 class="text-base font-bold text-[#1B3A6B]">{{ currentImageMeta.label }}模板</h2>
                <p class="text-xs text-[#8CA0C0]">仅使用你提供的 30 条 DI 模板 · 当前 {{ templateCountLabel }} 条可选</p>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'structure' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'structure'"
                >
                  结构
                </button>
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'phrases' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'phrases'"
                >
                  句型
                </button>
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'tips' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'tips'"
                >
                  要点
                </button>
              </div>
            </div>

            <div class="mb-3 flex items-center gap-2">
              <button
                type="button"
                class="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-[#F4F7FB]"
                :class="templateMode === 'random'
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white hover:bg-[#16335E] hover:text-white'
                  : 'border-[#E8EDF5] bg-white text-[#1B3A6B] hover:text-[#1B3A6B] hover:border-[#C9D4E5]'"
                @click="chooseRandomTemplate"
              >
                随机模板
              </button>
              <button
                type="button"
                class="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-[#F4F7FB]"
                :class="templateMode === 'manual'
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white hover:bg-[#16335E] hover:text-white'
                  : 'border-[#E8EDF5] bg-white text-[#1B3A6B] hover:text-[#1B3A6B] hover:border-[#C9D4E5]'"
                @click="toggleTemplatePicker"
              >
                选择模板
              </button>
            </div>

            <div v-if="templatePickerOpen" class="mb-3 rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-2">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  v-for="item in templateCandidates"
                  :key="item.id"
                  type="button"
                  class="rounded-[9px] border px-2 py-2 text-left text-xs transition-colors"
                  :class="selectedTemplate?.id === item.id ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1B3A6B]'"
                  @click="selectTemplate(item.id)"
                >
                  <p class="font-semibold">{{ item.shortLabel || item.title || item.id }}</p>
                  <p class="mt-1 opacity-80">{{ item.id }}</p>
                </button>
              </div>
            </div>

            <div v-if="!selectedTemplate" class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-xs text-[#8CA0C0]">
              当前题型暂无可用模板。
            </div>

            <template v-else>
              <div v-if="activeTab === 'structure'" class="space-y-3">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#F4F7FB] px-3 py-2 text-left"
                  @click="playModelReading"
                >
                  <p class="text-xs text-[#8CA0C0]">模板朗读 · Native · en-AU</p>
                  <p class="mt-1 text-sm text-[#1B3A6B]">{{ selectedTemplate.sentence }}</p>
                </button>

                <div class="rounded-[11px] bg-[#F8FAFD] p-3">
                  <p class="text-xs text-[#8CA0C0]">当前模板</p>
                  <p class="mt-1 text-sm font-semibold text-[#1B3A6B]">{{ selectedTemplate.shortLabel || selectedTemplate.title || selectedTemplate.id }}</p>
                  <p class="mt-1 text-xs text-[#8CA0C0]">{{ selectedTemplate.id }} · {{ selectedTemplate.categoryLabel || selectedTemplate.categoryKey }}</p>
                </div>

                <div v-if="selectedTemplate.exampleFilled" class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2 text-sm leading-relaxed text-[#334155]">
                  {{ selectedTemplate.exampleFilled }}
                </div>
              </div>

              <div v-else-if="activeTab === 'phrases'" class="space-y-3">
                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                  <p class="text-xs font-semibold text-[#8CA0C0]">开场句（实时）</p>
                  <p
                    v-for="sentence in diLiveSentences.opening"
                    :key="`opening-${sentence}`"
                    class="mt-1 text-sm text-[#1B3A6B]"
                  >
                    {{ sentence }}
                  </p>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                  <p class="text-xs font-semibold text-[#8CA0C0]">主体句（实时）</p>
                  <p
                    v-for="sentence in diLiveSentences.detail"
                    :key="`detail-${sentence}`"
                    class="mt-1 text-sm text-[#1B3A6B]"
                  >
                    {{ sentence }}
                  </p>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                  <p class="text-xs font-semibold text-[#8CA0C0]">收尾句（实时）</p>
                  <p
                    v-for="sentence in diLiveSentences.closing"
                    :key="`closing-${sentence}`"
                    class="mt-1 text-sm text-[#1B3A6B]"
                  >
                    {{ sentence }}
                  </p>
                </article>

                <div>
                  <p class="mb-2 text-xs font-semibold text-[#8CA0C0]">模板槽位（建议填法）</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in templateSlotSuggestions"
                      :key="item.slot"
                      type="button"
                      class="rounded-[20px] border px-3 py-1.5 text-left text-xs transition-colors"
                      :class="isPhraseUsed(item.slot) ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1B3A6B]'"
                      @click="togglePhraseUsage(item.slot)"
                    >
                      <span class="font-semibold">{{ item.slot }}</span>
                      <span class="ml-1 opacity-85">→ {{ item.suggestion }}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <p class="mb-2 text-xs font-semibold text-[#8CA0C0]">本题关键词（实时）</p>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="keyword in (diLiveContext.focusTerms.length ? diLiveContext.focusTerms : (selectedTemplate.keywords || []))"
                      :key="keyword"
                      class="rounded-[20px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#1B3A6B]"
                    >
                      {{ keyword }}
                    </span>
                    <span
                      v-if="!(diLiveContext.focusTerms.length || (selectedTemplate.keywords || []).length)"
                      class="text-xs text-[#8CA0C0]"
                    >
                      当前题目暂无关键词，建议优先描述标题、方位和对比关系。
                    </span>
                  </div>
                </div>
              </div>

              <div v-else class="space-y-2">
                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2">
                  <p class="text-sm font-semibold text-[#1B3A6B]">本题观察顺序（实时）</p>
                  <ul class="mt-1 list-disc space-y-1 pl-5 text-xs text-[#64748B]">
                    <li v-for="step in diLiveTips.steps" :key="step">{{ step }}</li>
                  </ul>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2">
                  <p class="text-sm font-semibold text-[#1B3A6B]">本题必提词（实时）</p>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <span
                      v-for="term in diLiveTips.mustMention"
                      :key="`must-${term}`"
                      class="rounded-[20px] border border-[#E8EDF5] bg-white px-3 py-1 text-xs text-[#1B3A6B]"
                    >
                      {{ term }}
                    </span>
                    <span v-if="!diLiveTips.mustMention.length" class="text-xs text-[#8CA0C0]">当前题目词汇较少，建议优先读图标题和图例词。</span>
                  </div>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2">
                  <p class="text-sm font-semibold text-[#1B3A6B]">可引用数字/单位（实时）</p>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <span
                      v-for="number in diLiveTips.numbers"
                      :key="`num-${number}`"
                      class="rounded-[20px] border border-[#E8EDF5] bg-white px-3 py-1 text-xs text-[#1B3A6B]"
                    >
                      {{ number }}
                    </span>
                    <span v-if="!diLiveTips.numbers.length" class="text-xs text-[#8CA0C0]">这一题可先用方位、趋势、对比词替代具体数字。</span>
                  </div>
                </article>

                <article
                  v-if="selectedTemplate.fillTips"
                  class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2"
                >
                  <p class="text-sm font-semibold text-[#1B3A6B]">填充提示</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.fillTips }}</p>
                </article>

                <article
                  v-if="selectedTemplate.notes"
                  class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2"
                >
                  <p class="text-sm font-semibold text-[#1B3A6B]">备注</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.notes }}</p>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2">
                  <p class="text-sm font-semibold text-[#1B3A6B]">适用题型</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.imageTypes.join(" / ") }}</p>
                </article>
              </div>
            </template>
          </article>
        </section>
        <section class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <p class="mb-3 text-sm font-semibold text-[#1B3A6B]">📊 今日练习</p>
            <div v-if="loadingStats" class="text-xs text-[#8CA0C0]">统计加载中...</div>
            <div v-else class="grid grid-cols-3 gap-2">
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.practicedCount }}</p>
                <p class="text-xs text-[#8CA0C0]">已练题数</p>
              </div>
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.totalMinutes }}</p>
                <p class="text-xs text-[#8CA0C0]">分钟</p>
              </div>
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.averageOverall.toFixed(1) }}</p>
                <p class="text-xs text-[#8CA0C0]">平均 Overall</p>
              </div>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <p class="mb-3 text-sm font-semibold text-[#1B3A6B]">💡 历史录音</p>
            <div v-if="recentRecordings.length" class="space-y-2">
              <div
                v-for="record in recentRecordings"
                :key="record.id"
                class="rounded-[12px] border border-[#E5ECF5] bg-white p-3 shadow-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    class="history-play-btn rounded-full px-3 py-1.5 text-xs font-semibold"
                    @click="playHistoryRecord(record)"
                  >
                    {{ historyPlayingId === record.id ? "⏸ 暂停" : "▶ 播放" }}
                  </button>
                  <p class="text-xs font-semibold text-[#6F86AD]">
                    {{ formatSeconds(getHistoryCurrentTimeForRecord(record)) }} / {{ formatSeconds(getHistoryDuration(record)) }}
                  </p>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    class="history-slider h-2 w-full cursor-pointer appearance-none rounded-full"
                    min="0"
                    :max="Math.max(getHistoryDuration(record), 1)"
                    :value="Math.min(getHistoryCurrentTimeForRecord(record), Math.max(getHistoryDuration(record), 1))"
                    :style="{ '--progress': `${getHistoryProgressPercent(record)}%` }"
                    step="0.1"
                    @input="onHistorySeek(record.id, $event)"
                  />
                </div>
                <p class="mt-2 text-xs text-[#8CA0C0]">{{ formatDateTime(record.createdAt) }}</p>
                <audio
                  :ref="(el) => bindHistoryAudioRef(record.id, el)"
                  class="hidden"
                  preload="metadata"
                  :src="record.blobUrl"
                  @loadedmetadata="onHistoryLoadedMetadata(record.id, $event)"
                  @timeupdate="onHistoryTimeUpdate(record.id, $event)"
                  @play="onHistoryPlay(record.id)"
                  @pause="onHistoryPause(record.id, $event)"
                  @ended="onHistoryEnded(record.id, $event)"
                />
              </div>
            </div>
            <p v-else class="text-xs text-[#8CA0C0]">暂无历史录音，完成一题后会出现在这里。</p>
          </article>
        </section>

        <section class="mt-4 rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-[#1B3A6B]">📚 本题高频词汇</p>
            <p class="text-xs text-[#8CA0C0]">{{ questionHighFrequencyWords.length }} 个词</p>
          </div>

          <div v-if="questionHighFrequencyWords.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <article
              v-for="(word, index) in questionHighFrequencyWords"
              :key="`${word.word}-${index}`"
              class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3"
            >
              <div class="flex items-baseline gap-2">
                <p class="text-sm font-semibold text-[#1B3A6B]">{{ word.word }}</p>
                <span v-if="word.partOfSpeech" class="text-xs text-[#8CA0C0]">{{ word.partOfSpeech }}</span>
              </div>
              <p v-if="word.chinese" class="mt-1 text-xs text-[#475569]">{{ word.chinese }}</p>
              <p v-if="word.note" class="mt-1 text-xs text-[#64748B]">{{ word.note }}</p>
              <p v-if="word.example" class="mt-1 text-xs italic text-[#8CA0C0]">{{ word.example }}</p>
            </article>
          </div>
          <p v-else class="text-xs text-[#8CA0C0]">当前题目暂无词汇数据。</p>
        </section>
      </template>

      <Teleport to="body">
        <div
          v-if="imagePreviewOpen"
          class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4"
          @click="handleImagePreviewMaskClick"
        >
          <div class="relative w-full max-w-5xl">
            <div v-if="imagePreviewLoading" class="flex min-h-[320px] items-center justify-center rounded-[12px] bg-white px-6 text-sm text-[#5B6F90] shadow-2xl">
              正在加载图片预览...
            </div>
            <div v-else-if="imagePreviewFailed" class="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[12px] bg-white px-6 text-center shadow-2xl">
              <p class="text-sm font-semibold text-[#1B3A6B]">图片预览加载失败</p>
              <p class="text-xs text-[#64748B]">{{ imagePreviewErrorText }}</p>
              <button
                type="button"
                class="rounded-full border border-[#D7E2F0] px-3 py-1 text-xs font-semibold text-[#1B3A6B] transition-colors hover:bg-[#F8FAFD]"
                @click.stop="openImagePreview"
              >
                重试预览
              </button>
            </div>
            <img
              v-else
              :key="`preview-${imagePreviewUrl}`"
              :src="imagePreviewUrl"
              :alt="imagePreviewAlt"
              class="max-h-[90vh] w-full rounded-[12px] bg-white object-contain shadow-2xl"
            />
            <p class="mt-2 text-center text-xs text-white/85">点击空白处关闭</p>
          </div>
        </div>
      </Teleport>
    </main>
  </div>
</template>

<style scoped>
.di-font {
  font-family: "DM Sans", -apple-system, "PingFang SC", sans-serif;
}

.wave-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.wave-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 12px;
}

.wave-bars span {
  width: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  animation: wave 1.1s ease-in-out infinite;
}

.wave-bars span:nth-child(1) {
  animation-delay: 0s;
}

.wave-bars span:nth-child(2) {
  animation-delay: 0.14s;
}

.wave-bars span:nth-child(3) {
  animation-delay: 0.28s;
}

.wave-bars span:nth-child(4) {
  animation-delay: 0.42s;
}

.history-play-btn {
  background: #1b3a6b;
  color: #ffffff;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.history-play-btn:hover {
  background: #16335e;
}

.history-play-btn:active {
  transform: translateY(1px);
}

.history-slider {
  --progress: 0%;
  background: linear-gradient(
    to right,
    #1b3a6b 0%,
    #1b3a6b var(--progress),
    #d7dee9 var(--progress),
    #d7dee9 100%
  );
}

.history-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid #ffffff;
  background: #1b3a6b;
  box-shadow: 0 1px 6px rgba(27, 58, 107, 0.35);
}

.history-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid #ffffff;
  background: #1b3a6b;
  box-shadow: 0 1px 6px rgba(27, 58, 107, 0.35);
}

.history-slider::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: transparent;
}

@keyframes wave {
  0%,
  100% {
    height: 4px;
    opacity: 0.55;
  }
  50% {
    height: 12px;
    opacity: 1;
  }
}
</style>
