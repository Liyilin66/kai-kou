export function buildWEPrompt({ essayText = "", questionContent = "", formAnalysis } = {}) {
  const wordCount = Number(formAnalysis?.word_count || 0);
  const paragraphCount = Number(formAnalysis?.paragraph_count || 0);
  const placeholderDetected = Boolean(formAnalysis?.placeholder_detected);

  return `
你是 PTE Academic 写作任务（Write Essay）的 AI 评阅助手。
注意：你输出的是“估分”，不是官方精确分。

题目：
"${questionContent}"

学生作文：
"${essayText}"

规则层信号（仅供参考）：
- word_count: ${wordCount}
- paragraph_count: ${paragraphCount}
- placeholder_detected: ${placeholderDetected}

请只评这 6 个 trait，并返回整数分：
- content: 0-6
- development_structure_coherence: 0-6
- grammar: 0-2
- general_linguistic_range: 0-6
- vocabulary_range: 0-2
- spelling: 0-2

评分要求：
- 简单但结构清楚、逻辑完整的作文，不要因为词汇普通而给过低分。
- 只有在明显离题、模板未填写、或没有有效内容时才给 content=0。
- form 由规则层处理，你不要给 form 分。

输出要求：
- 只输出严格 JSON。
- 不要输出 markdown。
- 不要输出 schema 之外的字段。
- 不要生成整篇改写作文。
- 不要长篇解释。
- 所有用户可见文案使用中文。

请严格按下列结构输出：
{
  "traits": {
    "content": <0-6 integer>,
    "development_structure_coherence": <0-6 integer>,
    "grammar": <0-2 integer>,
    "general_linguistic_range": <0-6 integer>,
    "vocabulary_range": <0-2 integer>,
    "spelling": <0-2 integer>
  },
  "visible_summary": {
    "level": "<中文等级，例如：较强/中等/需提升>",
    "strengths": ["<中文优点1>", "<中文优点2>"],
    "improvements": ["<中文改进建议1>", "<中文改进建议2>"],
    "final_comment": "<中文总评，1句>"
  },
  "feedback": "<中文简短反馈，1段>"
}
`.trim();
}
