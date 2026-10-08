import { callOpenAICompatibleChat, getOpenAICompatibleConfig } from "../llm/providers/openai-compatible.js";

const DEFAULT_BASE_URL = "https://testvideo.site/v1";
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.6;

const GREETING_PATTERN = /^(?:\s*(?:hi|hello|hey|你好|您好|哈喽|嗨|在吗|在嘛|早上好|下午好|晚上好)[!！。？?\s]*)$/i;
const THANKS_PATTERN = /^(?:\s*(?:谢谢|谢了|感谢|多谢|辛苦了|thank you|thanks|thx)[!！。？?\s]*)$/i;
const CASUAL_PATTERN = /^(?:\s*(?:好|好的|可以|行|嗯|嗯嗯|收到|明白|知道了|ok|okay|好的呀|可以的)[!！。？?，,\s]*)$/i;
const IDENTITY_PATTERN = /(你是谁|你是什么|你是干嘛的|你叫什么|你是做什么的|你是什么模型|你用的什么模型|你是gpt吗|你是不是大模型|你是谁开发的)/i;
const CAPABILITY_PATTERN = /(你能做什么|你有什么功能|你可以帮我什么|你会什么|你能帮我什么)/i;
const UNRELATED_SYMBOL_ONLY_PATTERN = /^[\s\p{P}\p{S}]+$/u;
const UNRELATED_INSULT_OR_FRUSTRATION_PATTERN = /(你有病|有病吧|神经病|傻逼|傻子|蠢|脑子有问题|垃圾|废物|烦死|烦死了|气死|崩溃|无语|服了|滚|烂透|sb|shit|fuck)/i;
const UNRELATED_VIOLENT_OR_SELF_HARM_PATTERN = /(杀人|杀了(?:他|她|它|他们|她们|别人|对方|人)|杀掉(?:他|她|它|他们|她们|别人|对方|人)|打死(?:他|她|它|他们|她们|别人|对方|人)|弄死(?:他|她|它|他们|她们|别人|对方|人)|捅死|砍死|伤害别人|伤害他人|伤害对方|报复社会|放火|爆炸|炸掉|自杀|想死|伤害自己|(?:我想|我要|想去|准备|打算)(?:杀|打死|弄死|伤害|捅|砍|揍|报复)|\b(?:kill|murder|hurt|stab|shoot|beat)\s+(?:someone|somebody|people|him|her|them|others)\b)/i;
const DATA_ANALYSIS_PATTERN = /(我最近怎么样|我最近的(?:练习|表现)|最近记录|最近练得怎么样|哪项最弱|分析我的薄弱项|复盘最近|最近有没有退步|我的分数怎么样|我的练习记录|我的练习情况|最近表现|帮我分析|为什么这次.*分低|这次.*为什么.*分低|这次.*哪里有问题|主要问题|改进方向|最近一次.*分数|最新一次.*分数|上一次.*分数|最后一次.*分数|最近一条.*分数|具体分数|最近一次练习|最新一次练习|上一次练习|最后一次练习|完成了多少|做了多少|练了多少|多少道题|做题数量|练习数量|总共|累计|到现在|目前一共|均分|平均分|总平均|我的成绩|统计一下|数据统计|历史记录)/i;
const PLAN_PATTERN = /(计划|规划|今天练什么|给我安排|学习安排|训练安排|7天计划|7 天计划|七天计划|冲刺计划|冲分计划|提分计划|备考计划|每天练什么|帮我制定计划|给我.*计划|下一步练什么|今日计划|训练计划|今天该练什么|今天该怎么练|安排训练)/i;
const REGENERATE_PLAN_PATTERN = /(重新生成|换一版|再来一版|不满意|这个计划不好|换个计划|重新安排|再生成一份|不要这个|换一种安排|再换一版|重新来一份|换份计划)/i;
const PTE_QA_PATTERN = /\b(pte|ra|rs|rl|rts|wfd|we|swt)\b|(PTE|RA|RS|RL|RTS|WFD|WE|SWT|DI|口语|写作|听力|阅读|发音|流利度|模板|题型|考试技巧|备考|提分)/i;
const RECORD_AWARE_PATTERN = /(结合我的记录|按我的记录|根据我的记录|结合练习记录|根据练习记录|按练习记录|结合我的练习记录|根据我最近的记录|结合我最近的记录)/i;

const DATA_ANALYSIS_KEYWORDS = [
  "平均评分",
  "平均分",
  "均分",
  "平均成绩",
  "平均得分",
  "总平均",
  "总均分",
  "完成了多少",
  "做了多少",
  "练了多少",
  "多少道题",
  "做题数量",
  "练习数量",
  "总共",
  "累计",
  "到现在",
  "目前一共",
  "统计",
  "练习记录",
  "历史记录",
  "各题型平均分",
  "题型平均分",
  "各题型均分",
  "各题型平均得分"
];
const CONTINUATION_PATTERN = /^(?:好|好的|可以|行|嗯|继续|就这个|那就做|按这个来|帮我弄|给我做|都帮我做|两个都做|全都要|都帮我完成|开始吧|来吧|没问题|可以的)[!！。？?，,\s]*$/i;
const PLAN_TABLE_CONTEXT_PATTERN = /(7天计划|7 天计划|训练计划|学习计划|今日计划|今天练什么|表格)/i;
const FOLLOWUP_CONTEXT_PATTERN = /(7天计划|7 天计划|训练计划|表格|扣分点|分析|复盘|学习计划|今日计划|今天练什么|薄弱项)/i;
const PRACTICE_CONTEXT_PATTERN = /(练习记录|根据我最近的记录|结合我的记录|平均分|均分|完成了多少|哪项最弱|薄弱项|复盘|分析|最近表现|当前.{0,12}水平|47\.3|分数|成绩)/i;
const PURE_STATISTICS_PATTERN = /(平均评分|平均分|均分|平均成绩|平均得分|总平均|总均分|做了多少题|完成多少题|做了多少|完成了多少|多少道题|练习数量|做题数量|总共练了多少题|总共做了多少题|练习统计|统计|各题型平均分|题型平均分|各题型均分|各题型平均得分)/i;
const ANALYSIS_OR_PLAN_PATTERN = /(为什么|原因|建议|分析|复盘|计划|提高|怎么|如何|训练|安排|扣分点|薄弱项|改进|帮我做|表格)/i;
const DEFAULT_MAX_RECENT_MESSAGES = 6;
const DEFAULT_MAX_RECENT_MESSAGE_LENGTH = 500;
const ANALYSIS_TASK_META = {
  RA: {
    title: "RA 朗读句子",
    reason: "常见扣分点是停顿过长、断句不稳和发音清晰度不够。",
    focus: "连续开口不断句，卡顿超过 3 秒就重读一遍。",
    count: 4,
    minutes: 12
  },
  WFD: {
    title: "WFD 写作填空",
    reason: "常见扣分点是主干听准了，但冠词、复数、时态和小词漏掉。",
    focus: "先听主干，再逐句补冠词、复数和时态细节。",
    count: 6,
    minutes: 15
  },
  WE: {
    title: "WE 学术短文写作",
    reason: "常见扣分点是结构先后不清、观点展开不足或语法错误拖累整体分。",
    focus: "先列结构和主题句，再限时写正文。",
    count: 1,
    minutes: 18
  },
  DI: {
    title: "DI 描述图表",
    reason: "常见扣分点是主图信息没先说清，细节堆叠但缺少顺序。",
    focus: "先说主图信息，再补 2 个关键细节，最后总结一句。",
    count: 3,
    minutes: 15
  },
  RTS: {
    title: "RTS 复述句子",
    reason: "常见扣分点是只记住零散词，漏掉场景、动作和对象之间的关系。",
    focus: "先抓场景和任务，再复述关键动作。",
    count: 5,
    minutes: 12
  }
};

export class AgentChatServiceError extends Error {
  constructor(reasonCode, message, details = {}) {
    super(message || reasonCode || "agent_chat_failed");
    this.name = "AgentChatServiceError";
    this.reason_code = `${reasonCode || "agent_chat_failed"}`.trim() || "agent_chat_failed";
    this.status = Number.isFinite(Number(details.status)) ? Number(details.status) : 500;
    this.raw_error_type = `${details.raw_error_type || ""}`.trim();
    this.provider = `${details.provider || "openai_compatible"}`.trim() || "openai_compatible";
    this.latency_ms = Number.isFinite(Number(details.latency_ms)) ? Math.round(Number(details.latency_ms)) : 0;
    this.debug_timing = isPlainObject(details.debug_timing) ? details.debug_timing : null;
    this.error_name = `${details.error_name || ""}`.trim();
    this.error_message_safe = `${details.error_message_safe || ""}`.trim();
    this.model = `${details.model || ""}`.trim();
  }
}

export function detectAgentIntent(message, { recentMessages = [] } = {}) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return "pte_qa";

  if (classifyUnrelatedMessage(normalizedMessage) === "violent_intent_or_threat") return "unrelated";
  if (IDENTITY_PATTERN.test(normalizedMessage)) return "identity";
  if (CAPABILITY_PATTERN.test(normalizedMessage)) return "capability";
  if (isRegeneratePlanIntentMessage(normalizedMessage, recentMessages)) return "regenerate_plan";
  if (looksLikeContinuationFromRecentMessages(normalizedMessage, recentMessages)) return "continuation";
  if (matchesDataAnalysisIntent(normalizedMessage)) return "data_analysis";
  if (PLAN_PATTERN.test(normalizedMessage)) return "plan";
  if (PTE_QA_PATTERN.test(normalizedMessage)) return "pte_qa";
  if (GREETING_PATTERN.test(normalizedMessage)) return "greeting";
  if (THANKS_PATTERN.test(normalizedMessage)) return "thanks";
  if (CASUAL_PATTERN.test(normalizedMessage) || isContinuationIntentMessage(normalizedMessage)) return "casual";
  return "unrelated";
}

export function classifyUnrelatedMessage(message = "") {
  const normalizedMessage = normalizeText(message);

  if (isViolentIntentOrThreat(normalizedMessage)) return "violent_intent_or_threat";
  if (isInsultOrFrustration(normalizedMessage)) return "insult_or_frustration";
  if (isEmptyOrSymbolMessage(normalizedMessage)) return "empty_or_symbol";
  return "normal_offtopic";
}

export function shouldUsePracticeData({ intent, message, recentMessages = [] } = {}) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  const normalizedMessage = normalizeText(message);

  if (normalizedIntent === "data_analysis" || normalizedIntent === "plan" || normalizedIntent === "regenerate_plan") {
    return true;
  }

  if (normalizedIntent === "continuation") {
    return recentMessagesNeedPracticeData(recentMessages);
  }

  if (normalizedIntent === "pte_qa" && RECORD_AWARE_PATTERN.test(normalizedMessage)) {
    return true;
  }

  return false;
}

export function sanitizeRecentMessages(recentMessages, options = {}) {
  const maxItems = toPositiveInt(options.maxItems, DEFAULT_MAX_RECENT_MESSAGES) || DEFAULT_MAX_RECENT_MESSAGES;
  const maxContentLength = toPositiveInt(options.maxContentLength, DEFAULT_MAX_RECENT_MESSAGE_LENGTH) || DEFAULT_MAX_RECENT_MESSAGE_LENGTH;

  return (Array.isArray(recentMessages) ? recentMessages : [])
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content).slice(0, maxContentLength),
      metadata: isPlainObject(item?.metadata) ? item.metadata : {},
      plan_suggestion: isPlainObject(item?.plan_suggestion) ? item.plan_suggestion : null,
      planSuggestion: isPlainObject(item?.planSuggestion) ? item.planSuggestion : null
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-maxItems);
}

export function getAgentTokenBudget({ intent = "pte_qa", message = "", recentMessages = [] } = {}) {
  const config = getAgentChatConfig();
  const globalMaxTokens = config.maxOutputTokens;
  const selectedMaxTokens = Math.min(
    resolveIntentMaxTokens(intent, message, recentMessages),
    globalMaxTokens || DEFAULT_MAX_OUTPUT_TOKENS
  );

  return {
    selected_max_tokens: Math.max(0, Math.round(Number(selectedMaxTokens || 0))),
    global_max_tokens: Math.max(0, Math.round(Number(globalMaxTokens || DEFAULT_MAX_OUTPUT_TOKENS)))
  };
}

export function tryBuildFastPathAgentReply({ intent = "pte_qa", message = "", context = null } = {}) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  const normalizedMessage = normalizeText(message);
  const summary = context?.summary || context?.lifetime_summary || null;

  if (normalizedIntent === "greeting") {
    return "你好，我在。你可以直接问我 PTE 练习、薄弱项分析或今日训练安排。";
  }

  if (normalizedIntent === "thanks") {
    return "不客气。需要继续看练习记录、拆训练计划，或者解释某次低分时，直接发给我就行。";
  }

  if (normalizedIntent === "casual") {
    return "收到。你可以继续问我具体题型、最近表现，或者让我帮你安排下一组训练。";
  }

  if (normalizedIntent === "identity") {
    return "我是“开口”的 PTE AI 私教，主要帮你做 PTE 练习复盘、薄弱项分析和训练规划。";
  }

  if (normalizedIntent === "capability") {
    return "我可以帮你分析最近练习表现、定位薄弱题型、解释低分原因，也可以把训练拆成今天可执行的任务。";
  }

  if (normalizedIntent === "unrelated") {
    return buildUnrelatedFastPathReply(normalizedMessage);
  }

  if (normalizedIntent !== "data_analysis") return null;
  if (!summary || !isPureStatisticsQuestion(normalizedMessage)) return null;

  return buildStatisticsFastPathReply(summary, normalizedMessage);
}

function buildUnrelatedFastPathReply(message) {
  switch (classifyUnrelatedMessage(message)) {
    case "violent_intent_or_threat":
      return "我不能帮助伤害自己或别人。如果你现在很激动，先离开现场、不要靠近对方或危险物品，联系身边可信的人或当地紧急服务。等你冷静下来，我可以继续帮你回到 PTE 训练。";
    case "insult_or_frustration":
      return "可以骂，但别浪费训练时间。你可以直接说：分析弱项、生成计划，或者问某个题型怎么提分。";
    case "empty_or_symbol":
      return "我没看懂你的问题。你可以直接问：今天练什么、分析弱项、安排 20 分钟练习。";
    case "normal_offtopic":
    default:
      return "这个问题不属于 PTE 备考范围。你可以让我分析练习记录、讲题型技巧，或生成训练计划。";
  }
}

function isViolentIntentOrThreat(message) {
  return Boolean(message) && UNRELATED_VIOLENT_OR_SELF_HARM_PATTERN.test(message);
}

function isInsultOrFrustration(message) {
  return Boolean(message) && UNRELATED_INSULT_OR_FRUSTRATION_PATTERN.test(message);
}

function isEmptyOrSymbolMessage(message) {
  return !message || UNRELATED_SYMBOL_ONLY_PATTERN.test(message);
}

export function buildPracticeAnalysisReplyFromSummary(summary, message = "") {
  const totalAttempts = toNonNegativeNumber(summary?.total_attempts);
  const recent7DaysAttempts = toNonNegativeNumber(summary?.recent_7_days_attempts);
  const recent30DaysAttempts = toNonNegativeNumber(summary?.recent_30_days_attempts);
  const recent7DaysAverage = normalizeNumeric(summary?.recent_7_days_average_score);
  const requestedTaskType = extractRequestedTaskType(message);
  const weakestTaskType = normalizeTaskType(summary?.weakest_task_type);
  const latestTaskType = normalizeTaskType(summary?.latest_task_type);
  const mainTaskType = requestedTaskType || weakestTaskType || latestTaskType || "DI";
  const mainMeta = ANALYSIS_TASK_META[mainTaskType] || ANALYSIS_TASK_META.DI;
  const taskStats = isPlainObject(summary?.task_stats) ? summary.task_stats : {};
  const mainStats = isPlainObject(taskStats?.[mainTaskType]) ? taskStats[mainTaskType] : {};
  const weakTop3 = Array.isArray(summary?.weak_top_3) ? summary.weak_top_3 : [];
  const weakList = weakTop3
    .filter((item) => normalizeTaskType(item?.task_type))
    .slice(0, 3)
    .map((item) => {
      const taskType = normalizeTaskType(item.task_type);
      const averageScore = normalizeNumeric(item.average_score);
      const attempts = toNonNegativeNumber(item.attempts);
      return `${taskType}${averageScore === null ? "" : ` ${formatScore(averageScore)}/90`}${attempts ? `（${attempts} 次）` : ""}`;
    });

  if (totalAttempts <= 0) {
    return [
      "我现在还没有看到足够的练习记录，所以不能判断真实弱项。",
      "",
      "建议先完成一轮测温：RA 2 道、DI 2 道、WFD 5 道。做完后我再按真实分数告诉你最低分题型、主要原因和当天训练顺序。"
    ].join("\n");
  }

  const sampleInsufficient = Boolean(summary?.sample_insufficient) || totalAttempts < 5;
  const lines = [
    sampleInsufficient
      ? `目前样本还偏少：我只看到 ${totalAttempts} 次练习，先按已有记录给你一个临时判断。`
      : `我先按最近练习记录给你结论：当前最该优先看的题型是 ${mainTaskType}（${mainMeta.title}）。`
  ];

  lines.push("");
  lines.push("**当前判断**");
  lines.push(`- 最近 7 天练习 ${recent7DaysAttempts} 次，最近 30 天练习 ${recent30DaysAttempts} 次。`);
  if (recent7DaysAverage !== null) {
    lines.push(`- 最近 7 天均分约 ${formatScore(recent7DaysAverage)}/90。`);
  }
  if (weakList.length) {
    lines.push(`- 低分优先级：${weakList.join("，")}。`);
  }
  if (normalizeNumeric(mainStats?.average_score) !== null) {
    lines.push(`- ${mainTaskType} 当前均分约 ${formatScore(mainStats.average_score)}/90，练习 ${toNonNegativeNumber(mainStats.attempts)} 次。`);
  }

  lines.push("");
  lines.push("**可能原因**");
  lines.push(`- ${mainMeta.reason}`);
  if (requestedTaskType && requestedTaskType !== weakestTaskType && weakestTaskType) {
    lines.push(`- 你问的是 ${requestedTaskType}，但整体最低分信号更偏 ${weakestTaskType}；今天可以先把 ${requestedTaskType} 做短复盘，再补 ${weakestTaskType}。`);
  }

  lines.push("");
  lines.push("**今天建议**");
  lines.push(`- ${mainTaskType}：${mainMeta.count} 组，约 ${mainMeta.minutes} 分钟。${mainMeta.focus}`);
  lines.push("- RA：2 组，约 6 分钟。用来稳定开口节奏。");
  lines.push("- 复盘：约 5 分钟，只记一个最高频错误，下一组立即修正。");

  if (sampleInsufficient) {
    lines.push("");
    lines.push("数据不足时先不要急着下长期结论；连续完成 2-3 天后，我会更准确地判断趋势。");
  }

  return lines.join("\n");
}

function isContinuationIntentMessage(message) {
  return CONTINUATION_PATTERN.test(normalizeText(message));
}

function isRegeneratePlanIntentMessage(message, recentMessages) {
  const normalizedMessage = normalizeText(message);
  if (!REGENERATE_PLAN_PATTERN.test(normalizedMessage)) return false;
  return PLAN_PATTERN.test(normalizedMessage) || recentMessagesContainPlanContext(recentMessages);
}

function recentMessagesContainPlanContext(recentMessages) {
  return (Array.isArray(recentMessages) ? recentMessages : []).some((item) => {
    const role = normalizeText(item?.role).toLowerCase();
    if (role !== "assistant") return false;
    if (isPlainObject(item?.metadata?.plan_suggestion) || isPlainObject(item?.plan_suggestion) || isPlainObject(item?.planSuggestion)) {
      return true;
    }

    const content = normalizeText(item?.content);
    return PLAN_TABLE_CONTEXT_PATTERN.test(content) && /(\|.*题型.*\||\|.*预计时间.*\||一键接入可执行计划)/i.test(content);
  });
}

function looksLikeContinuationFromRecentMessages(message, recentMessages) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return false;
  if (PTE_QA_PATTERN.test(normalizedMessage) || PLAN_PATTERN.test(normalizedMessage) || matchesDataAnalysisIntent(normalizedMessage)) {
    return false;
  }

  const recentText = getRecentMessagesText(recentMessages);
  if (!recentText) return false;
  return isContinuationIntentMessage(normalizedMessage) && FOLLOWUP_CONTEXT_PATTERN.test(recentText);
}

function recentMessagesNeedPracticeData(recentMessages) {
  const recentText = getRecentMessagesText(recentMessages);
  if (!recentText) return false;

  return matchesDataAnalysisIntent(recentText)
    || RECORD_AWARE_PATTERN.test(recentText)
    || PRACTICE_CONTEXT_PATTERN.test(recentText);
}

function getRecentMessagesText(recentMessages) {
  return sanitizeRecentMessages(recentMessages)
    .map((item) => item.content)
    .join("\n");
}

function resolveIntentMaxTokens(intent, message, recentMessages) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  const normalizedMessage = normalizeText(message);
  const recentText = getRecentMessagesText(recentMessages);
  const continuationNeedsLongPlanOutput = normalizedIntent === "continuation"
    && PLAN_TABLE_CONTEXT_PATTERN.test(`${normalizedMessage}\n${recentText}`);

  switch (normalizedIntent) {
    case "greeting":
      return 200;
    case "identity":
      return 250;
    case "capability":
      return 350;
    case "unrelated":
      return 250;
    case "pte_qa":
      return 600;
    case "data_analysis":
      return 800;
    case "plan":
    case "regenerate_plan":
      return 1000;
    case "continuation":
      return continuationNeedsLongPlanOutput ? 1000 : 800;
    default:
      return 600;
  }
}

function getLatestUserMessage(messages) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    const item = normalizedMessages[index];
    if (normalizeText(item?.role).toLowerCase() !== "user") continue;
    const content = normalizeText(item?.content);
    if (content) return content;
  }
  return "";
}

function isPureStatisticsQuestion(message) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return false;
  if (!PURE_STATISTICS_PATTERN.test(normalizedMessage)) return false;
  return !ANALYSIS_OR_PLAN_PATTERN.test(normalizedMessage);
}

function buildStatisticsFastPathReply(summary, message) {
  const totalAttempts = toNonNegativeNumber(summary?.total_attempts);
  const scoredAttempts = toNonNegativeNumber(summary?.scored_attempts);
  const overallAverageScore = normalizeNumeric(summary?.overall_average_score);
  const recent7DaysAttempts = toNonNegativeNumber(summary?.recent_7_days_attempts);
  const recent30DaysAttempts = toNonNegativeNumber(summary?.recent_30_days_attempts);
  const averageScoreByTaskType = isPlainObject(summary?.average_score_by_task_type)
    ? summary.average_score_by_task_type
    : {};
  const normalizedMessage = normalizeText(message);

  if (totalAttempts <= 0) {
    return "目前还没有练习记录。";
  }

  const lines = [
    `你目前一共完成了 ${totalAttempts} 次练习。`
  ];

  if (scoredAttempts > 0 && overallAverageScore !== null) {
    lines[0] = `你目前一共完成了 ${totalAttempts} 次练习，其中 ${scoredAttempts} 次有可计算分数，整体平均分约 ${overallAverageScore}/90。`;
  } else {
    lines.push("有练习记录，但暂时没有可计算均分的评分记录。");
  }

  lines.push(`最近 7 天完成 ${recent7DaysAttempts} 次，最近 30 天完成 ${recent30DaysAttempts} 次。`);

  if (/各题型平均分|题型平均分|各题型均分|各题型平均得分/i.test(normalizedMessage)) {
    const taskTypeAverages = formatTaskTypeAverages(averageScoreByTaskType);
    if (taskTypeAverages.length) {
      lines.push(`各题型平均分：${taskTypeAverages.join("，")}。`);
    }
  }

  return lines.join(" ");
}

function formatTaskTypeAverages(averageScoreByTaskType) {
  return Object.entries(averageScoreByTaskType || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([taskType, value]) => `${taskType} ${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}/90`);
}

function matchesDataAnalysisIntent(message) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return false;

  return DATA_ANALYSIS_PATTERN.test(normalizedMessage)
    || DATA_ANALYSIS_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword));
}

export function getAgentChatConfig() {
  const providerConfig = getOpenAICompatibleConfig();
  const configuredMaxTokens = toPositiveInt(providerConfig.maxTokens, 0);

  return {
    baseUrl: normalizeText(providerConfig.baseUrl) || DEFAULT_BASE_URL,
    apiKey: normalizeText(providerConfig.apiKey),
    model: normalizeText(providerConfig.model) || DEFAULT_MODEL,
    timeoutMs: toPositiveInt(providerConfig.timeoutMs, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    maxOutputTokens: configuredMaxTokens > 0 ? configuredMaxTokens : DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: DEFAULT_TEMPERATURE
  };
}

export async function requestAgentChatCompletion({ messages, intent = "pte_qa", recentMessages = [] } = {}) {
  const config = getAgentChatConfig();
  const tokenBudget = getAgentTokenBudget({ intent, message: getLatestUserMessage(messages), recentMessages });

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AgentChatServiceError("invalid_request", "请输入你想问的问题。", {
      status: 400,
      raw_error_type: "messages_missing",
      provider: "openai_compatible",
      model: config.model,
      error_name: "InvalidRequest",
      error_message_safe: "invalid_request"
    });
  }

  if (!config.apiKey) {
    throw new AgentChatServiceError("missing_api_key", "AI 私教服务暂未配置，请稍后再试。", {
      status: 503,
      raw_error_type: "missing_api_key",
      provider: "openai_compatible",
      model: config.model,
      error_name: "ConfigurationError",
      error_message_safe: "missing_api_key"
    });
  }

  try {
    const result = await requestAgentChatWithRetry({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      messages,
      maxTokens: tokenBudget.selected_max_tokens,
      timeoutMs: config.timeoutMs,
      temperature: resolveTemperature(intent, config.temperature)
    });

    return {
      reply: normalizeReplyByIntent(result?.raw_text, intent, recentMessages),
      model: config.model,
      provider: "openai_compatible",
      usage: normalizeUsage(result?.usage),
      latency_ms: Math.max(0, Math.round(Number(result?.latency_ms || 0))),
      debug_timing: {
        provider_request_ms: toTimingValue(result?.provider_request_ms),
        provider_parse_ms: toTimingValue(result?.provider_parse_ms)
      },
      selected_max_tokens: tokenBudget.selected_max_tokens,
      global_max_tokens: tokenBudget.global_max_tokens
    };
  } catch (error) {
    const agentError = mapProviderErrorToAgentError(error);
    agentError.model = config.model;
    agentError.selected_max_tokens = tokenBudget.selected_max_tokens;
    agentError.global_max_tokens = tokenBudget.global_max_tokens;
    throw agentError;
  }
}

async function requestAgentChatWithRetry(options = {}) {
  try {
    return await callOpenAICompatibleChat(options);
  } catch (error) {
    if (!shouldRetryProviderCall(error)) {
      throw error;
    }

    await waitMs(250);
    return await callOpenAICompatibleChat(options);
  }
}

function resolveTemperature(intent, fallback = DEFAULT_TEMPERATURE) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_TEMPERATURE;

  if (normalizedIntent === "greeting" || normalizedIntent === "identity" || normalizedIntent === "capability") {
    return Math.max(base, 0.65);
  }

  if (normalizedIntent === "data_analysis" || normalizedIntent === "plan" || normalizedIntent === "regenerate_plan" || normalizedIntent === "continuation") {
    return Math.min(base, 0.55);
  }

  return base;
}

function normalizeReplyByIntent(reply, intent, recentMessages = []) {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply) return normalizedReply;

  const normalizedIntent = normalizeText(intent).toLowerCase();
  if (normalizedIntent === "plan" || normalizedIntent === "regenerate_plan") {
    return ensurePlanTableReply(normalizedReply);
  }

  if (normalizedIntent === "continuation" && recentMessagesSuggestPlanTable(recentMessages)) {
    return ensurePlanTableReply(normalizedReply);
  }

  return normalizedReply;
}

function recentMessagesSuggestPlanTable(recentMessages) {
  const recentText = getRecentMessagesText(recentMessages);
  if (!recentText) return false;
  return PLAN_TABLE_CONTEXT_PATTERN.test(recentText) && /(表格|table)/i.test(recentText);
}

function ensurePlanTableReply(reply) {
  if (containsMarkdownTable(reply)) {
    return reply;
  }

  const rows = extractPlanTableRows(reply);
  if (rows.length < 2) {
    return reply;
  }

  const intro = extractPlanIntro(reply) || "可以，下面是整理后的训练计划：";
  const table = buildMarkdownTable(
    ["阶段", "重点", "任务", "时长"],
    rows.map((row) => [row.stage, row.focus, row.task, row.duration])
  );
  const notes = extractPlanNotes(reply);

  return [
    intro,
    "",
    table,
    ...(notes.length ? ["", ...notes] : [])
  ].join("\n");
}

function containsMarkdownTable(text) {
  const lines = `${text || ""}`.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (isTableLikeHeader(lines[index]) && isTableLikeDivider(lines[index + 1])) {
      return true;
    }
  }
  return false;
}

function extractPlanTableRows(text) {
  const lines = `${text || ""}`.split(/\r?\n/);
  const rows = [];

  for (const line of lines) {
    const parsed = parsePlanLine(line);
    if (parsed) {
      rows.push(parsed);
    }
  }

  return rows;
}

function parsePlanLine(line) {
  const normalizedLine = `${line || ""}`.trim();
  if (!/^(?:\d+[\.\)、]|[-•])\s*/.test(normalizedLine)) {
    return null;
  }

  const content = normalizedLine.replace(/^(?:\d+[\.\)、]|[-•])\s*/, "").trim();
  if (!content) return null;

  const durationMatch = content.match(/(\d+(?:\s*[-~—]\s*\d+)?\s*(?:分钟|小时|min|mins|hour|hours))/i);
  const duration = durationMatch ? durationMatch[1].replace(/\s+/g, "") : "待定";
  const segments = content.split(/[：:]/);
  const left = `${segments[0] || ""}`.trim();
  const right = `${segments.slice(1).join("：") || ""}`.trim();

  const cleanedStage = left
    .replace(durationMatch?.[1] || "", "")
    .replace(/\s+/g, " ")
    .trim();

  const stage = truncateCell(cleanedStage || inferStageFromText(content) || "训练");
  const focus = truncateCell(inferFocusFromText(content) || stage);
  const task = truncateCell(
    right
      || content.replace(left, "").replace(/^[:：]\s*/, "").trim()
      || content
  );

  return {
    stage,
    focus,
    task,
    duration: truncateCell(duration)
  };
}

function extractPlanIntro(text) {
  const paragraphs = `${text || ""}`
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const firstLine = paragraph.split(/\r?\n/)[0]?.trim() || "";
    if (firstLine && !/^(?:\d+[\.\)、]|[-•])\s*/.test(firstLine) && !containsPipe(firstLine)) {
      return firstLine;
    }
  }

  return "";
}

function extractPlanNotes(text) {
  const lines = `${text || ""}`.split(/\r?\n/);
  const notes = [];

  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) continue;
    if (/^(?:\d+[\.\)、]|[-•])\s*/.test(normalized)) continue;
    if (containsPipe(normalized)) continue;
    if (/^可以[，,]/.test(normalized)) continue;
    if (normalized.length <= 8) continue;
    notes.push(normalized);
  }

  return [...new Set(notes)].slice(0, 3);
}

function buildMarkdownTable(headers, rows) {
  const headerRow = `| ${headers.join(" | ")} |`;
  const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map((cell) => sanitizeTableCell(cell)).join(" | ")} |`);
  return [headerRow, dividerRow, ...bodyRows].join("\n");
}

function inferStageFromText(text) {
  const normalized = `${text || ""}`;
  const candidates = ["热身", "正式练", "复盘", "听力", "口语", "阅读", "写作", "冲刺"];
  return candidates.find((item) => normalized.includes(item)) || "";
}

function inferFocusFromText(text) {
  const normalized = `${text || ""}`.toUpperCase();
  const tags = ["DI", "RA", "RS", "RL", "RTS", "WFD", "WE", "SWT", "FIB-RW", "RO", "SST", "HIW"];
  const matched = tags.filter((item) => normalized.includes(item));
  if (matched.length) {
    return matched.slice(0, 2).join(" / ");
  }
  return "";
}

function sanitizeTableCell(value) {
  return `${value || ""}`
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateCell(value, maxLength = 28) {
  const normalized = sanitizeTableCell(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function containsPipe(value) {
  return `${value || ""}`.includes("|");
}

function isTableLikeHeader(line) {
  const normalized = `${line || ""}`.trim();
  return containsPipe(normalized) && normalized.split("|").filter((cell) => cell.trim()).length >= 2;
}

function isTableLikeDivider(line) {
  const normalized = `${line || ""}`.trim();
  if (!containsPipe(normalized)) return false;
  const cells = normalized.split("|").map((cell) => cell.trim()).filter(Boolean);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function shouldRetryProviderCall(error) {
  const rawErrorType = normalizeText(error?.raw_error_type || error?.code || error?.message).toLowerCase();
  return rawErrorType.includes("timeout")
    || rawErrorType.includes("network_error")
    || rawErrorType.includes("connect_timeout")
    || rawErrorType.includes("response_timeout")
    || rawErrorType.includes("http_5");
}

function mapProviderErrorToAgentError(error) {
  const rawErrorType = normalizeText(error?.raw_error_type || error?.code || error?.message).toLowerCase();
  const reasonCode = resolveProviderReasonCode(error, rawErrorType);
  const debugTiming = extractProviderDebugTiming(error);
  const errorName = resolveErrorName(error);
  const errorMessageSafe = resolveSafeErrorMessage(error, rawErrorType, reasonCode);
  const provider = normalizeText(error?.provider) || "openai_compatible";

  if (
    rawErrorType.includes("api_key_missing")
    || rawErrorType.includes("base_url_missing")
    || rawErrorType.includes("model_missing")
  ) {
    return new AgentChatServiceError("missing_api_key", "AI 私教服务暂未配置，请稍后再试。", {
      status: 503,
      raw_error_type: rawErrorType,
      provider,
      latency_ms: error?.latency_ms,
      debug_timing: debugTiming,
      error_name: errorName,
      error_message_safe: errorMessageSafe
    });
  }

  if (reasonCode === "provider_connect_timeout") {
    return new AgentChatServiceError(reasonCode, "AI 私教当前连接模型服务失败，请稍后再试。", {
      status: 502,
      raw_error_type: rawErrorType,
      provider,
      latency_ms: error?.latency_ms,
      debug_timing: debugTiming,
      error_name: errorName,
      error_message_safe: errorMessageSafe
    });
  }

  if (reasonCode === "provider_response_timeout") {
    return new AgentChatServiceError(reasonCode, "AI 私教当前连接或响应超时了，请稍后再试，或换个更短的问题。", {
      status: 504,
      raw_error_type: rawErrorType,
      provider,
      latency_ms: error?.latency_ms,
      debug_timing: debugTiming,
      error_name: errorName,
      error_message_safe: errorMessageSafe
    });
  }

  if (reasonCode === "provider_http_5xx") {
    return new AgentChatServiceError(reasonCode, "AI 私教当前连接模型服务失败，请稍后再试。", {
      status: 502,
      raw_error_type: rawErrorType,
      provider,
      latency_ms: error?.latency_ms,
      debug_timing: debugTiming,
      error_name: errorName,
      error_message_safe: errorMessageSafe
    });
  }

  if (reasonCode === "provider_empty_content" || reasonCode === "provider_parse_failed") {
    return new AgentChatServiceError(reasonCode, "AI 私教暂时没有拿到可用回复，请稍后再试。", {
      status: 502,
      raw_error_type: rawErrorType,
      provider,
      latency_ms: error?.latency_ms,
      debug_timing: debugTiming,
      error_name: errorName,
      error_message_safe: errorMessageSafe
    });
  }

  return new AgentChatServiceError(reasonCode || "provider_error", "AI 私教暂时不可用，请稍后再试。", {
    status: 502,
    raw_error_type: rawErrorType || "provider_error_unknown",
    provider,
    latency_ms: error?.latency_ms,
    debug_timing: debugTiming,
    error_name: errorName,
    error_message_safe: errorMessageSafe
  });
}

function normalizeUsage(usage) {
  return {
    prompt_tokens: toPositiveInt(usage?.prompt_tokens, 0),
    completion_tokens: toPositiveInt(usage?.completion_tokens, 0),
    total_tokens: toPositiveInt(usage?.total_tokens, 0)
  };
}

function extractProviderDebugTiming(error) {
  return {
    provider_request_ms: toTimingValue(error?.provider_request_ms),
    provider_parse_ms: toTimingValue(error?.provider_parse_ms)
  };
}

function resolveProviderReasonCode(error, rawErrorType = "") {
  const status = Number(error?.status);
  if (
    rawErrorType.includes("api_key_missing")
    || rawErrorType.includes("base_url_missing")
    || rawErrorType.includes("model_missing")
  ) {
    return "missing_api_key";
  }
  if (rawErrorType.includes("connect_timeout") || rawErrorType.includes("und_err_connect_timeout")) return "provider_connect_timeout";
  if (rawErrorType.includes("network_error")) return "provider_connect_timeout";
  if (rawErrorType.includes("response_timeout") || rawErrorType.includes("timeout")) return "provider_response_timeout";
  if ((Number.isFinite(status) && status >= 500 && status <= 599) || /http_5\d\d/.test(rawErrorType)) return "provider_http_5xx";
  if (rawErrorType.includes("empty_content")) return "provider_empty_content";
  if (rawErrorType.includes("parse_failed") || rawErrorType.includes("invalid_json")) return "provider_parse_failed";
  return "provider_error";
}

function resolveErrorName(error) {
  return normalizeText(error?.cause?.name || error?.name || "Error");
}

function resolveSafeErrorMessage(error, rawErrorType = "", reasonCode = "") {
  if (reasonCode) return reasonCode;
  const normalizedRawErrorType = normalizeText(rawErrorType).toLowerCase();
  if (normalizedRawErrorType.includes("timeout")) return "provider_timeout";
  if (normalizedRawErrorType.includes("network_error") || normalizedRawErrorType.includes("connect_timeout")) {
    return "provider_network_error";
  }
  if (normalizedRawErrorType.includes("api_key_missing")) return "missing_api_key";
  return "provider_error";
}

function toTimingValue(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

function toNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric);
}

function normalizeNumeric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number.isInteger(numeric) ? Math.round(numeric) : Number(numeric.toFixed(1));
}

function formatScore(value) {
  const numeric = normalizeNumeric(value);
  if (numeric === null) return "暂无";
  return Number(numeric).toFixed(Number.isInteger(Number(numeric)) ? 0 : 1);
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return Object.prototype.hasOwnProperty.call(ANALYSIS_TASK_META, normalized) ? normalized : "";
}

function extractRequestedTaskType(message) {
  const normalizedMessage = normalizeText(message).toUpperCase();
  return Object.keys(ANALYSIS_TASK_META).find((taskType) => normalizedMessage.includes(taskType)) || "";
}

function waitMs(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(durationMs) || 0));
  });
}

function toPositiveInt(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  }
  return 0;
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
