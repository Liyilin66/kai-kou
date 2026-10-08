import { supabase } from "@/lib/supabase";
import { questions as fallbackQuestions } from "@/data/questions";
import { getWEQuestionCatalog } from "@/lib/we-data";

const cache = {};
const usedQuestionIdsByTask = new Map();

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

function getSupabaseBaseUrl() {
  return String(import.meta.env.VITE_SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
}

function normalizeTaskType(taskType) {
  return String(taskType || "")
    .trim()
    .toUpperCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function getPublicAudioUrlByPath(audioPath) {
  const supabaseUrl = getSupabaseBaseUrl();
  const normalizedPath = String(audioPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalizedPath) return "";
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  if (!supabaseUrl) return "";

  return `${supabaseUrl}/storage/v1/object/public/question-audio/${normalizedPath}`;
}

// Build public audio URL for WFD items from question id.
export function getWFDAudioUrl(questionId) {
  const id = String(questionId || "").trim();
  if (!id) return "";
  return getPublicAudioUrlByPath(`wfd/${id}.mp3`);
}

export function getQuestionAudioUrl(row, taskType) {
  const normalizedTaskType = normalizeTaskType(taskType || row?.task_type || row?.taskType);
  const rawAudioPath = row?.audio_path ?? row?.audioPath ?? "";
  const rawAudioUrl = String(row?.audio_url ?? row?.audioUrl ?? "").trim();
  const audioPath = String(rawAudioPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const audioUrlFromPath = getPublicAudioUrlByPath(audioPath);

  // WFD should always prefer audio_path so new storage objects are used first.
  if (normalizedTaskType === "WFD") {
    return audioUrlFromPath || rawAudioUrl || getWFDAudioUrl(row?.id) || "";
  }

  return rawAudioUrl || audioUrlFromPath || "";
}

function normalizeQuestion(row, taskType) {
  const normalizedTaskType = normalizeTaskType(taskType || row?.task_type || row?.taskType);
  const keyPoints = toArray(row?.key_points ?? row?.keyPoints);
  const audioScript = row?.audio_script ?? row?.audioScript ?? "";
  const rawAudioPath = row?.audio_path ?? row?.audioPath ?? "";
  const audioPath = String(rawAudioPath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const audioUrl = getQuestionAudioUrl({ ...(row || {}), audio_path: audioPath }, normalizedTaskType);
  const imageUrl = row?.image_url ?? row?.imageUrl ?? "";
  const imageKeyword = row?.image_keyword ?? row?.imageKeyword ?? "";
  const wordCount = row?.word_count ?? row?.wordCount ?? null;

  return {
    ...(row || {}),
    taskType: normalizedTaskType,
    task_type: normalizedTaskType,
    audioScript,
    audio_script: audioScript,
    audioPath,
    audio_path: audioPath,
    audioUrl,
    audio_url: audioUrl,
    imageUrl,
    image_url: imageUrl,
    imageKeyword,
    image_keyword: imageKeyword,
    keyPoints,
    key_points: keyPoints,
    wordCount,
    word_count: wordCount
  };
}

function getFallbackList(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return getWEQuestionCatalog().map((item) =>
      normalizeQuestion(
        {
          id: item.id,
          topic: item.displayTitle,
          content: item.promptText,
          difficulty: item.difficulty,
          source_number_label: item.sourceNumberLabel,
          source_ref_id: item.sourceRefId,
          prompt_type: item.promptType,
          primary_topic: item.primaryTopic,
          secondary_topics: item.secondaryTopics,
          related_question_ids: item.relatedQuestionIds,
          variants: item.variants
        },
        normalizedTaskType
      )
    );
  }

  const list = fallbackQuestions[normalizedTaskType] || [];
  return list.map((item) => normalizeQuestion(item, normalizedTaskType));
}

function setCache(taskType, list) {
  const normalizedTaskType = normalizeTaskType(taskType);
  cache[normalizedTaskType] = list;
  usedQuestionIdsByTask.delete(normalizedTaskType);
}

export async function fetchQuestions(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (!normalizedTaskType) return [];

  if (cache[normalizedTaskType]) {
    return cache[normalizedTaskType];
  }

  if (!hasSupabaseConfig) {
    const fallback = getFallbackList(normalizedTaskType);
    setCache(normalizedTaskType, fallback);
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("task_type", normalizedTaskType)
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error || !Array.isArray(data) || data.length === 0) {
      const fallback = getFallbackList(normalizedTaskType);
      setCache(normalizedTaskType, fallback);
      return fallback;
    }

    const normalizedList = data.map((item) => normalizeQuestion(item, normalizedTaskType));
    setCache(normalizedTaskType, normalizedList);
    return normalizedList;
  } catch (error) {
    console.warn("fetchQuestions fallback:", error);
    const fallback = getFallbackList(normalizedTaskType);
    setCache(normalizedTaskType, fallback);
    return fallback;
  }
}

export async function getRandomQuestion(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const list = await fetchQuestions(normalizedTaskType);
  if (!list.length) return null;

  let usedSet = usedQuestionIdsByTask.get(normalizedTaskType);
  if (!usedSet) {
    usedSet = new Set();
    usedQuestionIdsByTask.set(normalizedTaskType, usedSet);
  }

  if (usedSet.size >= list.length) {
    usedSet.clear();
  }

  const available = list.filter((item) => !usedSet.has(item.id));
  const pool = available.length ? available : list;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  if (picked?.id) {
    usedSet.add(picked.id);
  }

  return picked || null;
}

export async function getQuestionById(taskType, id) {
  const list = await fetchQuestions(taskType);
  return list.find((item) => item.id === id) || null;
}

export function clearQuestionCache(taskType) {
  if (!taskType) {
    Object.keys(cache).forEach((key) => delete cache[key]);
    usedQuestionIdsByTask.clear();
    return;
  }

  const normalizedTaskType = normalizeTaskType(taskType);
  delete cache[normalizedTaskType];
  usedQuestionIdsByTask.delete(normalizedTaskType);
}
