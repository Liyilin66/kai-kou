import { isRADiagnosis, diagnosisLabel, hasNumericScore } from "../../src/lib/ra-diagnosis-score.js";
import { getAccessStatus } from "../auth/access-status.js";

const MAX_RECENT_LOGS = 60;
const MAX_SCORE_SAMPLE_LIMIT = 1000;
const MAX_FEEDBACK_ITEMS = 6;
const MAX_RECENT_RECORDS = 8;
const MAX_QUESTION_REFS = 8;
const TREND_WINDOW_SIZE = 3;
const TASK_LABELS = {
  RA: "RA",
  RS: "RS",
  RL: "RL",
  WE: "WE",
  WFD: "WFD",
  DI: "DI",
  RTS: "RTS"
};

export async function buildAgentContext({
  supabase,
  user,
  intent = "pte_qa",
  usePracticeData = false,
  logLimit = MAX_RECENT_LOGS,
  diagnostics = null
} = {}) {
  const baseContext = createBaseContext(user, intent);
  const userId = normalizeText(user?.id);
  const timing = getDiagnosticsBucket(diagnostics);
  const startedAt = nowMs();

  try {
    if (!usePracticeData || !supabase || !userId) {
      assignContextTiming(timing, {
        profile_query_ms: 0,
        practice_logs_query_ms: 0,
        lifetime_summary_ms: 0
      });
      return baseContext;
    }

    const includeDetailedPractice = shouldIncludeDetailedPractice(intent);
    const [profileResult, recentLogsResult, lifetimeSummaryResult] = await Promise.all([
      timeAsync(() => fetchProfile(supabase, userId)),
      includeDetailedPractice
        ? timeAsync(() => fetchRecentPracticeLogs(supabase, userId, logLimit))
        : Promise.resolve({ value: [], ms: 0 }),
      timeAsync(() => buildLifetimeSummary(supabase, userId))
    ]);

    assignContextTiming(timing, {
      profile_query_ms: profileResult.ms,
      practice_logs_query_ms: recentLogsResult.ms,
      lifetime_summary_ms: lifetimeSummaryResult.ms
    });

    const profile = profileResult.value;
    const recentLogs = recentLogsResult.value;
    const lifetimeSummary = lifetimeSummaryResult.value;
    const normalizedLogs = includeDetailedPractice ? normalizePracticeLogs(recentLogs) : [];
    const questionRefs = includeDetailedPractice
      ? await fetchQuestionRefs(supabase, normalizedLogs)
      : [];
    const access = getAccessStatus(user, profile || {});
    const practiceSummary = includeDetailedPractice
      ? buildPracticeSummary(normalizedLogs, questionRefs)
      : null;

    return {
      ...baseContext,
      context_scope: includeDetailedPractice ? "practice_summary" : "practice_stats_summary",
      user: {
        ...baseContext.user,
        display_name: resolveUserDisplayName(user, profile),
        has_profile: Boolean(profile)
      },
      access: {
        access_status: access.accessStatus,
        is_premium: access.isPremium,
        is_in_trial: access.isInTrial,
        trial_days_left: access.trialDaysLeft,
        vip_plan: access.vipPlan || null,
        vip_expires_at: access.vipExpiresAt || null
      },
      practice: practiceSummary,
      summary: lifetimeSummary,
      lifetime_summary: lifetimeSummary
    };
  } finally {
    assignContextTiming(timing, {
      build_context_ms: elapsedMs(startedAt)
    });
  }
}

function shouldIncludeDetailedPractice(intent) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  return normalizedIntent === "pte_qa";
}

function createBaseContext(user, intent) {
  return {
    app: {
      name: "开口",
      role: "PTE AI 私教",
      focus: "PTE 练习、备考、复盘和训练规划"
    },
    user: {
      id: normalizeText(user?.id),
      display_name: resolveUserDisplayName(user, null),
      is_logged_in: Boolean(user?.id),
      has_profile: false
    },
    intent: normalizeText(intent) || "pte_qa",
    context_scope: "light",
    practice: null,
    summary: null,
    lifetime_summary: null
  };
}

async function fetchProfile(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, username, display_name, name, full_name, trial_days, trial_granted_at, is_premium, vip_plan, vip_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function fetchRecentPracticeLogs(supabase, userId, limit = MAX_RECENT_LOGS) {
  const normalizedLimit = Math.max(1, Math.min(MAX_RECENT_LOGS, Number(limit || MAX_RECENT_LOGS)));

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, question_id, score_json, feedback, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(normalizedLimit);

    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

async function buildLifetimeSummary(supabase, userId) {
  const [totalAttempts, attemptsByTaskType, recent7DaysAttempts, recent30DaysAttempts, scoreRows, firstPracticeAt, latestPracticeAt] = await Promise.all([
    fetchExactAttemptCount(supabase, userId),
    fetchAttemptCountMap(supabase, userId),
    fetchWindowAttemptCount(supabase, userId, 7),
    fetchWindowAttemptCount(supabase, userId, 30),
    fetchScoreSampleRows(supabase, userId),
    fetchBoundaryPracticeAt(supabase, userId, true),
    fetchBoundaryPracticeAt(supabase, userId, false)
  ]);

  const normalizedScoreRows = normalizePracticeLogs(scoreRows);
  const averageScoreByTaskType = buildAverageScoreMap(normalizedScoreRows);
  const scoredAttempts = normalizedScoreRows.filter((item) => hasNumericScore(item?.score?.comparable)).length;
  const comparableScores = normalizedScoreRows
    .map((item) => item?.score?.comparable)
    .filter((value) => Number.isFinite(value));
  const scoreSampleSize = normalizedScoreRows.length;
  const scoreSampleIsLimited = scoreSampleSize >= MAX_SCORE_SAMPLE_LIMIT;

  return {
    total_attempts: totalAttempts,
    recent_7_days_attempts: recent7DaysAttempts,
    recent_30_days_attempts: recent30DaysAttempts,
    scored_attempts: scoredAttempts,
    overall_average_score: comparableScores.length
      ? roundToOne(comparableScores.reduce((sum, value) => sum + value, 0) / comparableScores.length)
      : null,
    attempts_by_task_type: attemptsByTaskType,
    average_score_by_task_type: averageScoreByTaskType,
    first_practice_at: firstPracticeAt,
    latest_practice_at: latestPracticeAt,
    is_exact_total_count: true,
    score_sample_size: scoreSampleSize,
    score_sample_limit: MAX_SCORE_SAMPLE_LIMIT,
    score_sample_basis: comparableScores.length
      ? (
        scoreSampleIsLimited
          ? `average scores are calculated from the most recent ${MAX_SCORE_SAMPLE_LIMIT} score-bearing practice logs`
          : `average scores are calculated from ${scoreSampleSize} score-bearing practice logs`
      )
      : "no score-bearing practice logs available for average calculation",
    note: comparableScores.length
      ? `均分基于最近最多 ${MAX_SCORE_SAMPLE_LIMIT} 条可评分记录计算。`
      : "目前还没有可用于计算均分的评分记录。"
  };
}

async function fetchAttemptCountMap(supabase, userId) {
  const taskTypes = Object.keys(TASK_LABELS);
  const counts = await Promise.all(
    taskTypes.map(async (taskType) => {
      const count = await fetchExactAttemptCountByTaskType(supabase, userId, taskType);
      return [taskType, count];
    })
  );

  return counts.reduce((acc, [taskType, count]) => {
    acc[taskType] = count;
    return acc;
  }, createTaskCounterSeed(0));
}

async function fetchExactAttemptCount(supabase, userId) {
  try {
    const { count, error } = await supabase
      .from("practice_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) return 0;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  } catch {
    return 0;
  }
}

async function fetchExactAttemptCountByTaskType(supabase, userId, taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (!normalizedTaskType) return 0;

  try {
    const { count, error } = await supabase
      .from("practice_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("task_type", normalizedTaskType);

    if (error) return 0;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  } catch {
    return 0;
  }
}

async function fetchWindowAttemptCount(supabase, userId, days) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - Math.max(0, Number(days || 0)) + 1);

  try {
    const { count, error } = await supabase
      .from("practice_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());

    if (error) return 0;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  } catch {
    return 0;
  }
}

async function fetchScoreSampleRows(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, score_json, created_at")
      .eq("user_id", userId)
      .not("score_json", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MAX_SCORE_SAMPLE_LIMIT);

    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

async function fetchBoundaryPracticeAt(supabase, userId, ascending = true) {
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return normalizeText(data?.created_at) || null;
  } catch {
    return null;
  }
}

async function fetchQuestionRefs(supabase, logs) {
  const questionIds = [...new Set(
    (Array.isArray(logs) ? logs : [])
      .map((item) => normalizeText(item?.questionId))
      .filter(Boolean)
      .slice(0, MAX_QUESTION_REFS)
  )];

  if (!questionIds.length) return [];

  try {
    const { data, error } = await supabase
      .from("questions")
      .select("id, task_type, topic, display_title, source_number_label, content")
      .in("id", questionIds)
      .limit(MAX_QUESTION_REFS);

    if (error || !Array.isArray(data)) return [];

    return data
      .map((row) => ({
        id: normalizeText(row?.id),
        task_type: normalizeTaskType(row?.task_type),
        title: resolveQuestionTitle(row)
      }))
      .filter((item) => item.id && item.title);
  } catch {
    return [];
  }
}

function normalizePracticeLogs(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const taskType = normalizeTaskType(row?.task_type);
      const scoreJson = toObject(row?.score_json);
      const score = resolveComparableScore(taskType, scoreJson);
      const feedback = extractFeedbackText(row?.feedback, scoreJson);

      return {
        id: normalizeText(row?.id),
        taskType,
        questionId: normalizeText(row?.question_id),
        createdAt: normalizeText(row?.created_at),
        createdDateKey: toDateKey(row?.created_at),
        score,
        diagnosisLabel: taskType === "RA" ? diagnosisLabel(scoreJson) : "",
        feedback,
        questionTitle: "",
        transcriptWordCount: resolveTranscriptWordCount(row?.transcript, scoreJson)
      };
    })
    .filter((item) => item.taskType && item.createdAt);
}

function buildPracticeSummary(logs, questionRefs) {
  const normalizedLogs = Array.isArray(logs) ? logs.map((item) => ({ ...item })) : [];
  const questionTitleMap = new Map(
    (Array.isArray(questionRefs) ? questionRefs : [])
      .map((item) => [normalizeText(item?.id), normalizeText(item?.title)])
      .filter(([id, title]) => id && title)
  );

  normalizedLogs.forEach((item) => {
    item.questionTitle = questionTitleMap.get(item.questionId) || "";
  });

  const attemptsByTaskType = {};
  const scoreBuckets = {};
  const scoredLogs = [];

  normalizedLogs.forEach((item) => {
    attemptsByTaskType[item.taskType] = (attemptsByTaskType[item.taskType] || 0) + 1;

    if (!hasNumericScore(item?.score?.comparable)) return;

    if (!scoreBuckets[item.taskType]) {
      scoreBuckets[item.taskType] = {
        totalDisplay: 0,
        totalComparable: 0,
        count: 0,
        scale: item.score.scale
      };
    }

    scoreBuckets[item.taskType].totalDisplay += Number(item.score.display || 0);
    scoreBuckets[item.taskType].totalComparable += Number(item.score.comparable || 0);
    scoreBuckets[item.taskType].count += 1;
    scoredLogs.push(item);
  });

  const averageScoreByTaskType = {};
  const weakTaskTypes = Object.entries(scoreBuckets)
    .map(([taskType, bucket]) => {
      const averageDisplay = bucket.count ? roundToOne(bucket.totalDisplay / bucket.count) : null;
      const averageComparable = bucket.count ? roundToOne(bucket.totalComparable / bucket.count) : null;
      averageScoreByTaskType[taskType] = averageDisplay;

      return {
        task_type: taskType,
        label: TASK_LABELS[taskType] || taskType,
        average_score: averageDisplay,
        comparable_score: averageComparable,
        attempts: bucket.count,
        score_scale: bucket.scale
      };
    })
    .sort((left, right) => Number(left.comparable_score || 0) - Number(right.comparable_score || 0))
    .slice(0, 3);

  const recentAverageScore = scoredLogs.length
    ? roundToOne(scoredLogs.reduce((sum, item) => sum + Number(item.score.comparable || 0), 0) / scoredLogs.length)
    : null;

  const latestRecord = normalizedLogs[0] || null;
  const latestScoredRecord = normalizedLogs.find((item) => hasNumericScore(item?.score?.display)) || null;

  return {
    sample_insufficient: normalizedLogs.length < 5 || scoredLogs.length < 3,
    total_recent_attempts: normalizedLogs.length,
    scored_recent_attempts: scoredLogs.length,
    recent_average_score_90_scale: recentAverageScore,
    attempts_by_task_type: attemptsByTaskType,
    average_score_by_task_type: averageScoreByTaskType,
    weak_task_types: weakTaskTypes,
    recent_7_days_activity: buildRecent7DaysActivity(normalizedLogs),
    current_streak_days: calculateCurrentStreak(normalizedLogs),
    latest_feedback_summary: normalizedLogs
      .filter((item) => item.feedback)
      .slice(0, MAX_FEEDBACK_ITEMS)
      .map((item) => ({
        task_type: item.taskType,
        created_at: item.createdAt,
        question_title: item.questionTitle || null,
        feedback_excerpt: truncateText(item.feedback, 140)
      })),
    latest_records: normalizedLogs
      .slice(0, MAX_RECENT_RECORDS)
      .map((item) => buildAttemptSummary(item)),
    latest_attempt_summary: latestRecord ? buildAttemptSummary(latestRecord) : null,
    latest_scored_attempt_summary: latestScoredRecord ? buildAttemptSummary(latestScoredRecord) : null,
    recent_question_refs: (Array.isArray(questionRefs) ? questionRefs : []).slice(0, MAX_QUESTION_REFS),
    trend_summary: buildTrendSummary(scoredLogs)
  };
}

function buildAttemptSummary(item) {
  return {
    task_type: item.taskType,
    created_at: item.createdAt,
    question_title: item.questionTitle || null,
    question_id: item.questionId || null,
    display_score: item?.score?.display ?? null,
    diagnosis_label: item.diagnosisLabel || null,
    score_scale: item?.score?.scale || null,
    feedback_excerpt: item.feedback ? truncateText(item.feedback, 100) : null
  };
}

function buildAttemptCountMap(logs) {
  const seed = createTaskCounterSeed(0);
  (Array.isArray(logs) ? logs : []).forEach((item) => {
    if (!item?.taskType || !Object.prototype.hasOwnProperty.call(seed, item.taskType)) return;
    seed[item.taskType] += 1;
  });
  return seed;
}

function buildAverageScoreMap(logs) {
  const totals = createTaskCounterSeed(0);
  const counts = createTaskCounterSeed(0);

  (Array.isArray(logs) ? logs : []).forEach((item) => {
    if (!item?.taskType || !hasNumericScore(item?.score?.comparable)) return;
    const score = Number(item.score.comparable);
    if (!Object.prototype.hasOwnProperty.call(totals, item.taskType)) return;

    totals[item.taskType] += score;
    counts[item.taskType] += 1;
  });

  return Object.keys(totals).reduce((acc, taskType) => {
    acc[taskType] = counts[taskType] > 0 ? roundToOne(totals[taskType] / counts[taskType]) : null;
    return acc;
  }, createTaskCounterSeed(null));
}

function createTaskCounterSeed(initialValue) {
  return Object.keys(TASK_LABELS).reduce((acc, taskType) => {
    acc[taskType] = initialValue;
    return acc;
  }, {});
}

function buildRecent7DaysActivity(logs) {
  const buckets = new Map();
  const today = new Date();
  const dateKeys = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const targetDate = new Date(today);
    targetDate.setHours(0, 0, 0, 0);
    targetDate.setDate(targetDate.getDate() - offset);
    const key = toDateKey(targetDate);

    dateKeys.push(key);
    buckets.set(key, {
      attempts: 0,
      comparableScoreTotal: 0,
      comparableScoreCount: 0
    });
  }

  logs.forEach((item) => {
    const bucket = buckets.get(item.createdDateKey);
    if (!bucket) return;

    bucket.attempts += 1;
    if (hasNumericScore(item?.score?.comparable)) {
      bucket.comparableScoreTotal += Number(item.score.comparable || 0);
      bucket.comparableScoreCount += 1;
    }
  });

  return dateKeys.map((key) => {
    const bucket = buckets.get(key);
    return {
      date: key,
      attempts: bucket?.attempts || 0,
      average_score_90_scale: bucket?.comparableScoreCount
        ? roundToOne(bucket.comparableScoreTotal / bucket.comparableScoreCount)
        : null
    };
  });
}

function buildTrendSummary(scoredLogs) {
  const recentWindow = scoredLogs.slice(0, TREND_WINDOW_SIZE);
  const previousWindow = scoredLogs.slice(TREND_WINDOW_SIZE, TREND_WINDOW_SIZE * 2);
  const recentAverage = averageComparableScore(recentWindow);
  const previousAverage = averageComparableScore(previousWindow);
  const delta = recentAverage !== null && previousAverage !== null
    ? roundToOne(recentAverage - previousAverage)
    : null;

  return {
    recent_window_attempts: recentWindow.length,
    previous_window_attempts: previousWindow.length,
    recent_average_score_90_scale: recentAverage,
    previous_average_score_90_scale: previousAverage,
    delta_90_scale: delta,
    direction: resolveTrendDirection(delta)
  };
}

function averageComparableScore(items) {
  const comparableItems = (Array.isArray(items) ? items : []).filter((item) => hasNumericScore(item?.score?.comparable));
  if (!comparableItems.length) return null;

  const total = comparableItems.reduce((sum, item) => sum + Number(item.score.comparable || 0), 0);
  return roundToOne(total / comparableItems.length);
}

function resolveTrendDirection(delta) {
  if (!hasNumericScore(delta)) return "unknown";
  if (Number(delta) >= 3) return "up";
  if (Number(delta) <= -3) return "down";
  return "flat";
}

function resolveComparableScore(taskType, scoreJson) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const score = toObject(scoreJson);
  if (normalizedTaskType === "RA" && isRADiagnosis(score)) return null;

  if (normalizedTaskType === "WFD") {
    const accuracy = normalizePercent(score?.score)
      ?? normalizePercent(score?.overall)
      ?? resolveWfdAccuracy(score)
      ?? resolveWfdAccuracyFromCorrectCount(score);

    if (!Number.isFinite(Number(accuracy))) return null;

    return {
      display: accuracy,
      comparable: roundToOne(10 + (accuracy / 100) * 80),
      scale: "accuracy_percent"
    };
  }

  const candidates = [
    score?.overall,
    score?.score_overall,
    score?.overall_score,
    score?.overall_estimated,
    score?.total_score,
    score?.score,
    score?.display_scores?.overall,
    score?.scores?.overall,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.ai_review?.product?.overall,
    score?.ai_review?.overall,
    score?.product?.overall,
    score?.diagnostics?.display_scores?.overall
  ];

  for (const candidate of candidates) {
    const normalized = normalizeScore90(candidate);
    if (normalized !== null) {
      return {
        display: normalized,
        comparable: normalized,
        scale: "score_90"
      };
    }
  }

  if (normalizedTaskType === "RS" || normalizedTaskType === "RL") {
    const fallbackOverall = resolveLegacySpeechOverall(score);
    if (fallbackOverall !== null) {
      return {
        display: fallbackOverall,
        comparable: fallbackOverall,
        scale: "score_90"
      };
    }
  }

  return null;
}

function resolveLegacySpeechOverall(scoreJson) {
  const score = toObject(scoreJson);
  const nestedScores = toObject(score?.scores);
  const pronunciation = normalizeScore90(score?.pronunciation ?? nestedScores?.pronunciation);
  const fluency = normalizeScore90(
    score?.fluency
    ?? score?.oral_fluency
    ?? score?.oralFluency
    ?? nestedScores?.fluency
    ?? nestedScores?.oral_fluency
    ?? nestedScores?.oralFluency
  );
  const content = normalizeScore90(
    score?.content
    ?? score?.appropriacy
    ?? nestedScores?.content
    ?? nestedScores?.appropriacy
  );

  const validScores = [pronunciation, fluency, content].filter((item) => item !== null);
  if (validScores.length < 2) return null;

  return roundToOne(validScores.reduce((sum, item) => sum + Number(item || 0), 0) / validScores.length);
}

function resolveWfdAccuracy(scoreJson) {
  const score = toObject(scoreJson);
  const correct = Number(score?.correct);
  const total = Number(score?.total);

  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return roundToOne((Math.max(0, correct) / total) * 100);
}

function resolveWfdAccuracyFromCorrectCount(scoreJson) {
  const score = toObject(scoreJson);
  const correct = Number(score?.correct_count ?? score?.correctCount);
  const total = Number(score?.total_count ?? score?.totalCount ?? score?.word_count ?? score?.wordCount);

  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return roundToOne((Math.max(0, correct) / total) * 100);
}

function extractFeedbackText(feedback, scoreJson) {
  const directFeedback = normalizeText(feedback);
  if (directFeedback) return directFeedback;

  const score = toObject(scoreJson);
  const candidates = [
    score?.visible_summary?.final_comment,
    score?.visible_summary?.finalComment,
    score?.feedback,
    joinTextArray(score?.product?.feedback_zh),
    joinTextArray(score?.ai_review?.product?.feedback_zh),
    joinTextArray(score?.gate_reason_messages_zh),
    joinTextArray(score?.ai_review?.gate_reason_messages_zh)
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function resolveTranscriptWordCount(transcript, scoreJson) {
  const directCount = countWords(transcript);
  if (directCount > 0) return directCount;

  const score = toObject(scoreJson);
  const scoreCount = Number(
    score?.submitted_word_count
    ?? score?.metrics?.transcript_word_count
    ?? score?.diagnostics?.transcript_metrics?.word_count
  );

  if (Number.isFinite(scoreCount) && scoreCount > 0) return Math.round(scoreCount);
  return 0;
}

function calculateCurrentStreak(logs) {
  const dateSet = new Set(
    (Array.isArray(logs) ? logs : [])
      .map((item) => item.createdDateKey)
      .filter(Boolean)
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = toDateKey(cursor);
    if (!dateSet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function resolveUserDisplayName(user, profile) {
  const candidates = [
    user?.user_metadata?.username,
    user?.user_metadata?.display_name,
    user?.user_metadata?.name,
    profile?.username,
    profile?.display_name,
    profile?.name,
    profile?.full_name,
    normalizeText(user?.email).split("@")[0]
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) return normalized;
  }

  return "同学";
}

function resolveQuestionTitle(row) {
  const candidates = [
    row?.display_title,
    row?.topic,
    row?.source_number_label,
    row?.content
  ];

  for (const candidate of candidates) {
    const normalized = truncateText(normalizeText(candidate), 60);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return TASK_LABELS[normalized] ? normalized : "";
}

function normalizeScore90(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return roundToOne(Math.max(0, Math.min(90, numeric)));
}

function normalizePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return roundToOne(Math.max(0, Math.min(100, numeric)));
}

function toObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function roundToOne(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(1));
}

function truncateText(value, maxLength = 120) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function joinTextArray(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => normalizeText(item)).filter(Boolean).join(" ");
}

function countWords(value) {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function getDiagnosticsBucket(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) {
    return null;
  }

  if (!diagnostics.timing || typeof diagnostics.timing !== "object" || Array.isArray(diagnostics.timing)) {
    diagnostics.timing = {};
  }

  return diagnostics.timing;
}

function assignContextTiming(timing, values = {}) {
  if (!timing) return;

  Object.entries(values).forEach(([key, value]) => {
    timing[key] = Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  });
}

async function timeAsync(callback) {
  const startedAt = nowMs();
  const value = await callback();
  return {
    value,
    ms: elapsedMs(startedAt)
  };
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - startedAt));
}
