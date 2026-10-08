export function buildDailySuggestionMessages(summary) {
  return [
    {
      role: "system",
      content: [
        "你是“开口”的 PTE AI 私教。",
        "请根据用户真实练习摘要，生成一条今天最值得执行的短建议，适合放在首页卡片里。",
        "不要长篇分析，不要承诺保过，不要编造摘要里没有的数据。",
        "建议不能只说做多少题，必须包含一个具体训练方法。",
        "只输出 JSON，不要输出 Markdown。",
        "JSON 字段必须包含 title, main_task_type, headline, reason, advice, tasks, cta_text。",
        "main_task_type 只能是 RA, WFD, WE, DI, RTS。",
        "tasks 最多 3 项，每项格式为 {\"task_type\":\"DI\",\"count\":3}。",
        "所有文字保持简短：headline 18 字以内，reason 36 字以内，advice 52 字以内。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "generate_home_daily_ai_suggestion",
        summary
      })
    }
  ];
}
