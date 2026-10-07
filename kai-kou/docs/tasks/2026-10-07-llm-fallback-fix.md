# 任务：修复评分模型的主备切换

- 日期：2026-10-07
- 分支：`lyl`
- 关联：`docs/improvement-plan.md` 第 7 节（工程与可观测性）

## 背景（线上实际发生的问题）

2026-10-07 线上一次 RA 评分的 Vercel 日志：

```
provider_used: 'gemini'
raw_error_type: 'gemini_http_402'
provider_attempts: [ { provider: 'gemini', stage: 'primary', status: 'failed' } ]   // 没有尝试 Groq
response_status: 500
```

主模型 Gemini 返回 402（欠费），系统没有切换到备用 Groq，直接失败。原因是 `backend/llm/provider-error.js` 只在 429 / 502 / 503 / 504 / 超时 / 网络错误时允许切换，而一家服务商最常见的失效方式——密钥失效（401）、欠费（402）、被拒（403）、模型下线（404）、服务商内部错误（500）——都不会切换。

同时发现：

- Groq 默认模型 `llama-3.3-70b-versatile` 已被 Groq 下线，请求返回 404，备用本身也不可用。
- 主模型的密钥、地址或模型名未配置时，`fallback_allowed: false`，即使 Groq 已配置也不会使用。
- 主模型返回空内容时，`fallback_allowed: false`（`gemini.js`、`groq.js` 中的 `*_empty_content`）。

## 目标

只要主模型这一次不可用、而换一家有可能成功，就切换到备用；两家都失败时明确报错，不编造分数。

## 要改的内容

### 1. `backend/llm/provider-error.js`

把"列出允许切换的状态码"改为"列出不允许切换的状态码"：

- **不切换**：`400`、`413`、`422`。这些是请求本身的问题，换一家大概率同样失败。
- **其余全部切换**：包括 401、402、403、404、408、409、429、5xx、超时、网络错误。
- 保持 `createProviderError` 的接口不变，调用方显式传入的 `fallback_allowed` 仍然优先。

### 2. 各 provider 中显式写死 `fallback_allowed: false` 的地方

逐一检查 `backend/llm/providers/gemini.js`、`groq.js`、`openai-compatible.js`：

| 情况 | 改为 |
|---|---|
| 主模型 API key / base URL / model 未配置 | `fallback_allowed: true`（这是这一家的配置问题，备用可能可用） |
| 返回空内容 `*_empty_content` | `fallback_allowed: true` |
| messages 为空等请求构造错误 | 保持 `false` |

### 3. `backend/llm/providers/groq.js`

- `DEFAULT_GROQ_MODEL` 改为 `openai/gpt-oss-120b`（已于 2026-10-07 实测可用，约 1 秒返回，能输出合法 JSON）。
- 仍然允许 `LLM_GROQ_MODEL` 环境变量覆盖。

### 4. 日志

确认切换成功时，返回结果和 `[score:llm]` 日志中仍保留主模型失败原因（`fallback_reason` = 主模型的 `raw_error_type`，`provider_attempts` 包含两次尝试）。现有代码大概率已满足，只需验证，不要重写日志结构。

## 不要做的事

- 不改 `api/score.js` 的评分逻辑、提示词、分数归一化。
- 不改 AI 私教（`backend/agent/*`）的调用链路。
- 不新增依赖。
- 不重构 provider 文件结构。

## 测试

新建 `tests/llm/fallback.test.js`，使用 Node 自带的 `node:test` 和 `node:assert`，通过替换 `globalThis.fetch` 模拟服务商响应，不发真实请求。在 `package.json` 增加 `"test": "node --test tests/"`。

必须覆盖：

| # | 主模型 | 备用 | 期望 |
|---|---|---|---|
| 1 | 402 | 成功 | 返回备用结果；`provider_used` 为备用；`fallback_reason` 含 `http_402` |
| 2 | 401 | 成功 | 同上，`http_401` |
| 3 | 403 | 成功 | 同上，`http_403` |
| 4 | 404（模型不存在） | 成功 | 同上，`http_404` |
| 5 | 500 | 成功 | 同上，`http_500` |
| 6 | 超时 | 成功 | 同上（回归，原本就支持） |
| 7 | 429 | 成功 | 同上（回归） |
| 8 | 400 | — | 不调用备用，直接抛错 |
| 9 | 返回空内容 | 成功 | 切换到备用 |
| 10 | 402 | 也失败 | 抛错，`provider_attempts` 有两条，没有任何分数字段 |
| 11 | 主模型 key 未配置 | 成功 | 切换到备用 |

RA 路径（OpenAI 兼容为主、Groq 为备）和其他题型路径（Gemini 为主、Groq 为备）各至少覆盖 #1、#8、#10。

## 验收标准

1. `npm test` 全部通过。
2. 本地用真实配置跑一次 RA 评分成功（可参考：主模型为 `gpt-5.6-luna`，备用为 `openai/gpt-oss-120b`）。
3. 本地临时把主模型 key 改错，跑一次 RA 评分，确认切换到 Groq 并成功，日志里能看到主模型失败原因；验证完改回。
4. diff 只涉及上面列出的文件和新增测试文件。

## 完成后

把 diff 交给审查。审查通过后再进行：合并 `lyl` → `main`、Vercel 连接 Git（Root Directory 填 `kai-kou`，生产分支 `main`）、部署、线上再做一次 RA 练习验证。
