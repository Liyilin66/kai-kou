# 任务 2：评测集骨架 + `align.js` 逐词对齐

- 日期：2026-10-08
- 分支：`lyl`（本任务不改线上页面和接口，可以在审查后正常合并）
- 关联：`docs/improvement-plan.md` 第 3.5 节（对齐算法）、第 4 节（评测体系）、第 3.11 节阶段 0
- 预计工作量：中

## 背景

第一轮要把 RA 从"浏览器转写 + LLM 猜分"升级为"录音对齐 + 证据诊断"。开发前必须先有**评测集**和**旧方案基线**，否则无法判断改动是否更好。

2026-10-07 的真实练习 `RA_024` 已经暴露了旧方案的问题，将作为第一条真实样本和测试用例：

| 原文 | 浏览器识别结果 |
|---|---|
| known | knowing |
| water first | waterfront |
| five thousand | 5000（结果页把它误判为"未命中"） |
| sea trade | sea tree |
| became | become |
| when | with |
| sailing boats | selling boat |
| travelled | traveled（英美拼写差异，不应算错） |
| spices, perfumes | species performance |

## 本任务交付

1. `backend/speech/align.js`：参考原文与识别结果的逐词对齐（纯函数）
2. `tests/speech/align.test.js`：单元测试
3. `eval/speech/` 评测集目录与标注格式
4. `scripts/eval-import-practice-log.js`：把线上练习记录导入评测集
5. `scripts/eval-speech.js`：跑评测、输出指标
6. 根目录 `.gitignore` 增加 `kai-kou/eval/speech/audio/`

**不做**：接入任何语音服务、修改 RA 页面或 `/api/score`、修改旧的结果页本地对齐逻辑（它将被替换）。

---

## 1. `backend/speech/align.js`

### 接口

```js
export function normalizeTokens(text)
// → [{ index, text, norm }]  text 为原词，norm 为归一化后的比较用形式

export function alignWords(referenceText, hypothesis, options = {})
// hypothesis: string | Array<{ text, start_ms?, end_ms?, confidence? }>
// options.lowConfidenceThreshold: 默认 0.6
```

返回：

```js
{
  reference: [{ index, text, norm }],
  hypothesis: [{ index, text, norm, start_ms, end_ms, confidence }],
  ops: [{
    type: "match" | "substitution" | "omission" | "insertion",
    ref_index, hyp_index,          // 不适用时为 null
    ref_text, hyp_text,
    start_ms, end_ms, confidence,  // 来自识别结果，没有则为 null
    tag: null | "repetition" | "filler" | "low_confidence",
    similarity                     // 字符级相似度 0–1，仅 substitution 有
  }],
  summary: {
    ref_count, matched, substituted, omitted, inserted,
    repetitions, fillers, low_confidence,
    completeness                   // matched / ref_count
  }
}
```

要求：纯函数、ESM、零依赖、输入相同则输出完全相同。

### 归一化规则（两边同样处理）

1. **字符**：弯引号、各类破折号统一为普通字符；转小写；去掉标点，保留词内撇号。
2. **连字符**：`well-known` 拆成 `well` `known`。
3. **缩写展开**：使用固定小表（如 `hadn't→had not`、`it's→it is`、`don't→do not`、`can't→can not`、`won't→will not`、`i'm→i am`、`they're→they are`）。所有格 `'s`（如 `earth's`）不展开，归一为 `earth's`。
4. **数字统一为数值记号**（两边都做，比较时按数值）：
   - 阿拉伯数字：`5000`、`5,000` → `#5000`；小数 `3.5` → `#3.5`；序数 `19th` → `#19th`；百分号 `40%` → `#40` `percent`。
   - 英文数字词组：`five thousand`、`a thousand`、`two thousand and five`、`one hundred and twenty` 解析为对应数值记号。
   - 年份读法：`nineteen ninety` → `#1990`，`twenty twenty` → `#2020`（仅在两个 10–99 的数词连读时按年份解析）。
   - 由多个识别词合并成的数值记号，时间范围取第一个词的开始和最后一个词的结束。
5. **英美拼写**：规则 + 小表统一，至少覆盖：`-our/-or`（colour/color）、`-ise/-ize`、`-yse/-yze`、`-tre/-ter`（centre/center）、双写 l（travelled/traveled、modelling/modeling）。

### 对齐算法

- 在归一化后的记号序列上做编辑距离动态规划。
- 代价：匹配 0；插入、删除 1；替换代价随字符相似度降低（建议 `1 - 0.5 × similarity`，范围 0.5–1），使 `water`↔`waterfront` 优先于 `first`↔`waterfront`。
- 平局时按"匹配 > 替换 > 删除 > 插入"选择，保证结果确定。
- 插入词的标签：
  - 与相邻参考词或前一个识别词相同 → `repetition`
  - 属于填充词表（`um uh er erm ah hmm`）→ `filler`
- 替换且识别置信度低于阈值 → `low_confidence`（表示"不确定，可能是识别错误"，不计入用户错误）。

---

## 2. 测试 `tests/speech/align.test.js`

使用 `node:test`，至少覆盖：

| # | 情况 | 期望 |
|---|---|---|
| 1 | 完全一致 | 全部 match，completeness = 1 |
| 2 | 漏读中间一个词 | 一个 omission，ref_index 正确 |
| 3 | 重复一个词（`the the`） | 一个 insertion，tag = repetition |
| 4 | 填充词（`um`） | insertion，tag = filler |
| 5 | `5000` ↔ `five thousand` | match |
| 6 | `5,000` / `two thousand and five` / `nineteen ninety` / `19th` / `40%` | 分别与对应写法 match |
| 7 | `travelled` ↔ `traveled`、`colour` ↔ `color`、`centre` ↔ `center` | match |
| 8 | `hadn't` ↔ `had not` | match |
| 9 | `well-known` ↔ `well known` | match |
| 10 | 标点、大小写、弯引号差异 | 不影响 |
| 11 | 替换且 confidence 0.3 | tag = low_confidence，不计入 substituted |
| 12 | 输入带时间戳 | ops 中携带正确的 start_ms / end_ms |
| 13 | 空的识别结果 | 全部 omission，completeness = 0 |
| 14 | 同一输入运行两次 | 结果完全相同 |
| 15 | **真实样本 RA_024**（原文与识别文本见下） | 未匹配的参考词恰好是：known、water、first、trade、became、when、sailing、boats、spices、perfumes；`five thousand` 与 `travelled` 判为 match |

RA_024 测试数据：

```
原文：Not a lot is known about how the transportation of goods by water first began. Large cargo boats were being used in some parts of the world up to five thousand years ago. However, sea trade became more widespread when large sailing boats travelled between ports, carrying spices, perfumes and objects made by hand.

识别：Not a lot is knowing about how the transportation of goods by waterfront began large cargo boats were being used in some parts of the world up to 5000 years ago however sea tree become more widespread with large selling boat traveled between ports carrying species performance and objects made by hand
```

---

## 3. 评测集 `eval/speech/`

```
eval/speech/
  manifest.json      # 样本清单与标注（进 Git）
  scripts.json       # 构造录音脚本：每条脚本规定故意制造的错误（进 Git）
  audio/             # 录音文件（不进 Git）
```

### `manifest.json` 中每条样本

```json
{
  "id": "ra-real-0001",
  "task_type": "RA",
  "question_id": "RA_024",
  "reference_text": "...",
  "source": "real",
  "script_id": null,
  "speaker_id": "spk01",
  "device": "iphone-chrome",
  "split": "dev",
  "consent": true,
  "audio": { "local_file": "ra-real-0001.webm", "storage_path": "ra/<uid>/....webm" },
  "hypotheses": {
    "browser_asr": { "text": "...", "practice_log_id": "..." }
  },
  "old_scores": { "pronunciation": 55, "fluency": 50, "content": 55, "overall": 53 },
  "labels": {
    "status": "unlabeled",
    "errors": [
      { "type": "omission", "word": "first", "occurrence": 1, "note": "" }
    ],
    "labeled_by": "",
    "notes": ""
  }
}
```

- `source`：`real` / `constructed` / `tts`
- `split`：`dev` / `test`。**同一 `speaker_id` 的样本只能在同一侧。**
- 错误类型：`omission` / `substitution` / `insertion` / `repetition` / `hesitation` / `long_pause`
- 标注用 `word` + `occurrence`（该词在原文中第几次出现）定位，脚本负责换算成索引，方便人工填写。

### `scripts.json` 中每条构造脚本

```json
{
  "id": "ra024-omit-2",
  "question_id": "RA_024",
  "instruction": "朗读时跳过 first 和 cargo，其余正常读",
  "errors": [
    { "type": "omission", "word": "first", "occurrence": 1 },
    { "type": "omission", "word": "cargo", "occurrence": 1 }
  ]
}
```

**请先为 5 道 RA 题各写 5 条脚本**（共 25 条）：

1. 正常朗读（无错误）
2. 漏读 2 个指定词
3. 在 2 处句子中间停顿约 2 秒
4. 重复 2 个指定词
5. 把 1 个指定词故意读成近音词（例如 sailing 读成 selling）

选题时覆盖：含数字的、含长单词的、含专有名词的。

---

## 4. `scripts/eval-import-practice-log.js`

```
node scripts/eval-import-practice-log.js --log-id <practice_logs.id> [--script <script_id>] [--speaker spk01] [--device iphone-chrome] [--split dev]
node scripts/eval-import-practice-log.js --latest 5 --user-id <uid> ...
```

- 使用本地 `.env.local` 的 service role，只读查询 `practice_logs`，取识别文本、题目原文、录音路径和旧分数。
- 从存储桶下载录音到 `eval/speech/audio/`。
- 追加或更新 `manifest.json` 中对应样本；带 `--script` 时把脚本里的错误复制为标注，`labels.status` 设为 `labeled`。
- 只允许导入操作者本人或已取得同意的用户的记录：未加 `--consent` 参数且 `user_id` 不是 `--user-id` 指定的账号时拒绝导入。

## 5. `scripts/eval-speech.js`

```
node scripts/eval-speech.js [--split dev|test|all] [--hypothesis browser_asr]
```

- 校验 `manifest.json` 格式，格式错误时报出具体样本和字段并退出。
- 对每条样本：用 `align.js` 对齐原文和指定的识别结果，得到预测的错误。
- 与 `labels.status = labeled` 的样本比较，按错误类型分别计算 TP、FP、FN、准确率、召回率。匹配规则：类型相同，且参考词位置相同（insertion / repetition / hesitation / long_pause 允许 ±1 个词的位置误差）。
- 另外统计：无错误样本上的误报数量。
- 未标注样本只输出对齐结果，不计入指标。
- 输出：终端表格摘要 + `output/eval/speech-<时间>.json` 和 `.md`（`output/` 已被忽略，不进 Git）。

**预期**：旧方案（`browser_asr`）没有时间信息，`hesitation` / `long_pause` 的召回率会是 0。这是正常结果，正是基线要记录的事实。

---

## 验收标准

1. `npm test` 全部通过，包括 15 条对齐测试。
2. 用导入脚本把 `RA_024` 那次练习导入为 `ra-real-0001`（状态为未标注）。
3. `scripts.json` 中有 25 条构造脚本。
4. `node scripts/eval-speech.js` 能在当前清单上运行，输出报告；未标注样本被正确跳过。
5. 不新增依赖；diff 只涉及上面列出的文件。

## 完成后由用户进行

按 `scripts.json` 在线上网站录制 25 条构造样本（每条录完记下练习时间），再用导入脚本带 `--script` 参数逐条导入，然后运行一次评测，得到旧方案的基线报告。

## 实施记录（2026-10-08）

- [x] `align.js` 与 30 条对齐测试，覆盖本文全部案例；RA_024 的未匹配原词恰好为指定的十个词。
- [x] 25 条构造脚本，覆盖 RA_024、RA_002、RA_003、RA_016、RA_041；每条包含原文和具体录制指令，全部标注锚点已验证。
- [x] 只读导入工具：归属／同意校验在下载前执行，保留旧评分，录音放在忽略目录；重复导入更新既有样本。
- [x] 真实练习记录 407 导入为 `ra-real-0001`，录音已下载（785271 字节），仍为 `unlabeled`。
- [x] 评测工具和指标验证；当前报告：1 条样本、0 条标注、1 条排除，指标 N/A；没有伪造准确率。
- [x] 全项目 117 项测试通过（对齐 30、评测 9、导入 7，加原有 71）；构建及语法检查通过。
- [x] 录音、运行报告被 Git 忽略，无依赖或线上页面／接口变化。
- [ ] 用户按 25 条脚本完成真人录制、确认实际执行的错误并导入，生成正式标注基线。
- [ ] 独立 Claude 审查通过后，由用户确认可以合并 `main`。

### 操作示例与数据边界

在 `kai-kou/` 下运行：

```bash
node scripts/eval-import-practice-log.js --log-id <id> --user-id <本人账号UUID> --speaker spk01 --device iphone-chrome --split dev
node scripts/eval-import-practice-log.js --log-id <id> --user-id <本人账号UUID> --speaker spk01 --device iphone-chrome --split dev --script ra024-omit-2
node scripts/eval-speech.js --split dev --hypothesis browser_asr
```

`--user-id` 是操作者对本人账号的声明，不是脚本自动验证的登录身份。导入其他同意者时必须明确加 `--consent`。同一说话人保持同一个 `speaker_id`，不能跨开发／测试集。脚本标注表示计划制造的错误，录制后应回听确认；不将识别错误直接称为发音错误。

本次报告属于**浏览器转写 + 新对齐算法的诊断基线**，不代表旧页面对齐实现，也不衡量声学发音评分。录音位于 `eval/speech/audio/`；报告位于 `output/eval/`，两者不提交。
