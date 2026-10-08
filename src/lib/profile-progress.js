import { useRTSData } from "@/composables/useRTSData";
import { getDIQuestionCatalog } from "@/lib/di-data";
import { fetchQuestions } from "@/lib/questions";
import { supabase } from "@/lib/supabase";

const PROFILE_PROGRESS_TASKS = ["RA", "WFD", "RTS", "DI", "RS", "WE"];
const PROFILE_PROGRESS_PAGE_SIZE = 1000;

export function createEmptyProfileProgress() {
  return {
    loading: true,
    completedCounts: buildTaskCounterSeed(),
    totalCounts: buildTaskCounterSeed()
  };
}

export async function loadProfileProgressSnapshotForAuth(authStore) {
  const totalCounts = await fetchTaskTotals();
  const userId = await resolveCurrentUserId(authStore);

  if (!userId) {
    return {
      loading: false,
      completedCounts: buildTaskCounterSeed(),
      totalCounts
    };
  }

  try {
    const rows = await fetchProfileProgressRows(userId);
    return {
      loading: false,
      completedCounts: buildCompletedCounts(rows),
      totalCounts
    };
  } catch (error) {
    console.warn("Profile progress load failed:", error);
    return {
      loading: false,
      completedCounts: buildTaskCounterSeed(),
      totalCounts
    };
  }
}

function buildTaskCounterSeed() {
  return PROFILE_PROGRESS_TASKS.reduce((acc, taskType) => {
    acc[taskType] = 0;
    return acc;
  }, {});
}

function buildCompletedCounts(rows) {
  const questionSets = PROFILE_PROGRESS_TASKS.reduce((acc, taskType) => {
    acc[taskType] = new Set();
    return acc;
  }, {});

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!taskType || !questionSets[taskType]) return;

    const questionId = normalizeQuestionId(row?.question_id);
    if (!questionId) return;

    questionSets[taskType].add(questionId);
  });

  return PROFILE_PROGRESS_TASKS.reduce((acc, taskType) => {
    acc[taskType] = questionSets[taskType].size;
    return acc;
  }, buildTaskCounterSeed());
}

async function fetchTaskTotals() {
  const [raQuestions, wfdQuestions, rtsQuestions, diQuestions, rsQuestions, weQuestions] = await Promise.all([
    fetchQuestions("RA"),
    fetchQuestions("WFD"),
    fetchRTSQuestions(),
    fetchDIQuestions(),
    fetchQuestions("RS"),
    fetchQuestions("WE")
  ]);

  return {
    RA: countItems(raQuestions),
    WFD: countItems(wfdQuestions),
    RTS: countItems(rtsQuestions),
    DI: countItems(diQuestions),
    RS: countItems(rsQuestions),
    WE: countItems(weQuestions)
  };
}

async function fetchRTSQuestions() {
  try {
    const { loadQuestions } = useRTSData();
    const list = await loadQuestions();
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.warn("RTS question total fallback failed:", error);
    return [];
  }
}

async function fetchDIQuestions() {
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("id, is_active")
      .eq("task_type", "DI")
      .order("id", { ascending: true });

    if (error) throw error;

    const activeRows = (Array.isArray(data) ? data : []).filter((row) => row?.is_active !== false);
    if (activeRows.length) {
      return activeRows;
    }
  } catch (error) {
    console.warn("DI question total fallback failed:", error);
  }

  return getDIQuestionCatalog();
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function resolveCurrentUserId(authStore) {
  const authUserId = `${authStore?.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function fetchProfileProgressRows(userId) {
  const normalizedUserId = `${userId || ""}`.trim();
  if (!normalizedUserId) return [];

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PROFILE_PROGRESS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, question_id")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;

    rows.push(...chunk);

    if (chunk.length < PROFILE_PROGRESS_PAGE_SIZE) break;
    from = to + 1;
  }

  return rows;
}

function normalizeTaskType(value) {
  const normalized = `${value || ""}`.trim().toUpperCase();
  return PROFILE_PROGRESS_TASKS.includes(normalized) ? normalized : "";
}

function normalizeQuestionId(value) {
  const normalized = `${value || ""}`.trim();
  if (!normalized) return "";

  const lowered = normalized.toLowerCase();
  if (lowered === "unknown" || lowered === "null" || lowered === "undefined") {
    return "";
  }

  return normalized;
}
