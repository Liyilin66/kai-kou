# 任务 6：基于证据的 AI 练习建议

- 日期：2026-10-08
- 分支：`lyl`（改动线上代码，**Claude 审查后才能合并 `main`**）
- 关联：`docs/improvement-plan.md` 第 3.5 节"反馈"、第 2.2 节原则 1–2
- 预计工作量：中

## 目标

结果页在证据和指标之外，给出 1–3 条**能执行的练习建议**。每条建议都必须引用具体证据（可以点开回听），不允许出现证据里没有的问题。

原则：**代码负责判断，LLM 只负责把证据说成人话。**

## 设计

### 1. 生成时机：异步，不拖慢诊断

`/api/ra/analyze` 现在约 3 秒返回证据，保持不变。结果页拿到证据后，再调用同一接口的新动作：

```
POST /api/ra/analyze  { action: 'feedback', attempt_id }
```

沿用影子评分的写法：按 `attempt_id` 查记录 → 条件更新占位（防止并发重复生成）→ 生成 → 保存 → 返回。已有结果时直接返回，不重复调用模型。

### 2. 模型

- 主：Groq `openai/gpt-oss-120b`（实测约 1 秒）；备：现有 OpenAI 兼容中转。复用 `backend/llm/provider-error.js` 的切换规则。
- 记录实际使用的 `provider`、`model`、`prompt_version`（`ra-feedback-0.1`）。

### 3. 新模块 `backend/speech/feedback.js`

输入：证据列表（按严重程度取前 6 条）、指标、原文。**不传识别文本全文**，避免模型绕过证据自行发挥。

输出 JSON：

```json
{
  "summary": "一句话总体情况（中文，≤ 60 字）",
  "suggestions": [
    { "evidence_ids": ["E1", "E3"], "issue": "问题描述（≤ 40 字）", "action": "具体练习动作（≤ 60 字）" }
  ]
}
```

提示词要求：

- 中文，教练口吻；1–3 条建议，按重要性排序。
- 每条建议至少引用 1 个证据编号。
- 替换类证据只能说"可能读错或识别不清，建议回听"，**禁止**下发音结论。
- 不出现任何分数、"PTE 分"、"发音分"。
- 没有证据时：`suggestions` 为空数组，`summary` 根据指标给出一句肯定 + 一个保持方向（例如语速是否合适）。

### 4. 校验器（同文件导出，纯函数）

逐项检查，不通过就把具体原因附在提示词后**重试一次**；仍不通过则使用**模板反馈**（由证据直接生成，不调用模型）：

- JSON 结构与字段长度
- 建议数量 0–3；有证据时至少 1 条
- 引用的证据编号全部存在
- 文本不含禁用词：`发音错误`、`发音不准`、`分数`、`分`（紧跟数字时）、`PTE`
- `issue` 提到的问题类型与所引用证据的类型一致（例如引用的是停顿证据，`issue` 里不能说成漏读）

模板反馈示例：漏读 → "第 N 句漏读了 X，回听后放慢该处重读一遍"；长停顿 → "在 X 前停顿了 2.3 秒，先把这一句连读三遍"。

### 5. 存储

追加 SQL（用户在 Supabase 执行一次）：

```sql
alter table public.speech_analyses
  add column if not exists feedback jsonb,
  add column if not exists feedback_status text check (feedback_status in ('processing','done','failed')),
  add column if not exists feedback_meta jsonb;
```

`feedback_meta` 存 `provider`、`model`、`prompt_version`、`attempts`（第几次通过 / 是否用了模板）、`latency_ms`。

同时把 `summary` 写入对应 `practice_logs.feedback`，让 AI 私教读取练习历史时能看到。

### 6. 结果页

- 在指标卡片下方新增"练习建议"卡片：加载中显示占位；失败时显示模板反馈，不显示报错。
- 每条建议下方列出引用的证据小标签，点击 → 播放器跳到对应位置（复用 `evidencePlaybackSeconds`）。
- 页面底部的版本小字加上反馈模型。

## 评测

新增 `scripts/eval-feedback.js`：对清单里有 Whisper 结果的样本（目前 7 条真实样本 + 后续新增），离线生成反馈，输出：

- 首次通过校验的比例、重试后通过比例、退回模板的比例
- 每条样本的建议全文（写入 `output/eval/`，供人工阅读）

**验收门槛：首次通过率 ≥ 80%，最终（含重试）≥ 95%。** 达不到就先改提示词，不要放宽校验。

## 测试

- `tests/speech/feedback.test.js`：校验器每条规则各至少一条正例、一条反例；引用不存在的编号被拒；含"发音错误"被拒；重试后通过；两次都失败时退回模板；无证据时建议为空。
- `tests/api/ra-analyze.test.js`：`action: 'feedback'` 的幂等、并发占位、记录不存在 404、诊断未完成 409。
- 原有测试全部通过；开关开 / 关两种构建通过。

## 不做

- 不改诊断规则、证据格式、对齐算法。
- 不改其他题型、不新增依赖。

## 交付说明需附

- 需要用户执行的 SQL（就是上面那一段）。
- `eval-feedback.js` 在现有样本上的通过率，以及 2 条样本的建议全文。

## 实施与验证记录（2026-10-08）

- [x] 独立的反馈请求与并发占位；诊断结果先展示，建议随后加载。
- [x] Groq 主模型、现有兼容服务备用、一次校验重试及证据模板兜底。
- [x] 纯函数校验：结构、长度、数量、引用编号、禁用结论、证据类型匹配；额外阻止建议捏造英文词语或时长。
- [x] 结果页练习建议、引用证据回听、实际反馈模型标记。
- [x] 服务端通过原子函数同时保存建议与对应练习历史摘要。
- [x] 评测脚本、模拟测试、功能开关开关两种构建。
- [ ] Supabase 执行新增迁移；线上真实反馈存储与手机回听验收。
- [ ] Claude 独立审查通过后再合并 main。

### 验证结果

`npm test`：301 项通过、0 项失败。`npm run build` 与 `VITE_RA_DIAGNOSIS=on npm run build` 均成功，`git diff --check` 通过。

本地页面在 375、390、1440 像素宽度下无横向溢出，验证了建议展示、证据跳转回听和模型标记。该检查使用真实录音及模拟反馈接口，不作为线上数据库已保存的证明。

真实 Groq 评测：7 条有 Whisper 结果且含证据的真实样本，首次通过率 100%（7/7），最终模型通过率 100%（7/7），模板回退率 0%。报告保存在本机 `output/eval/feedback-2026-10-08T05-44-48-068Z.json` 和同名 Markdown 文件，不纳入 Git。首次试跑首次通过率为 57.1%，随后加强提示词和校验器再达到门槛；没有放宽校验。通过率衡量输出是否符合证据约束，不等于诊断准确率；7 条样本的覆盖仍有限。

### 必须执行的完整迁移

在 Supabase SQL Editor 执行 **`kai-kou/db/ra-feedback.sql` 全文**。除三个字段外，文件还创建 `complete_ra_feedback` 原子函数并限制为 service_role 调用。仅执行原任务上面的三字段 SQL 不足以启用持久化。

函数仅更新同一用户、同一 analysis_id 的 RA 历史记录，匹配数异常时整笔回滚。保存失败时保留 processing 占位，避免重试导致重复模型调用；这种异常需要检查数据库并人工恢复状态。当前尚未取得本次迁移执行成功的确认，完整线上存储验收待迁移后进行。

### 样本建议全文

**ra-real-0001**（Groq / `openai/gpt-oss-120b`，首次通过，1604 ms）

```json
{
  "summary": "先回听标记位置，再按下面的建议练习。",
  "suggestions": [
    {
      "evidence_ids": ["E1"],
      "issue": "“spices”处可能读错或识别不清",
      "action": "先回听这一处，确认是否读错或识别不清，再对照原文重读。"
    },
    {
      "evidence_ids": ["E2"],
      "issue": "“perfumes”处可能读错或识别不清",
      "action": "先回听这一处，确认是否读错或识别不清，再对照原文重读。"
    }
  ]
}
```

**ra-real-0002**（Groq / `openai/gpt-oss-120b`，首次通过，782 ms）

```json
{
  "summary": "先回听标记位置，再按下面的建议练习。",
  "suggestions": [
    {
      "evidence_ids": ["E1"],
      "issue": "“street”处识别到额外词语",
      "action": "回听标记位置，对照原文确认后再读一遍。"
    },
    {
      "evidence_ids": ["E2"],
      "issue": "“streetlights”处可能读错或识别不清",
      "action": "先回听这一处，确认是否读错或识别不清，再对照原文重读。"
    }
  ]
}
```
