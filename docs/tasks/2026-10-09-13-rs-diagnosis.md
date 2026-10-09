# 任务 13：RS（复述句子）接入录音诊断

- 日期：2026-10-09
- 分支：`lyl`（改线上代码，**Claude 审查后才能合并 `main`**）
- 关联：RA 诊断链路（任务 4–7、11）；`docs/ra-scoring-rules.md`

## 现状（2026-10-09 核实）

- 数据库 `questions` 表里**没有任何 RS 题目**（只有 RA 50、WFD 173），RS 页面一直在用 `src/data/questions.js` 里写死的 **15 句**，播放的是**浏览器自带的机器朗读**（没有 `audio_url`）。
- 评分仍是"浏览器转写 + LLM 读文字打分"（`/api/score` 的 RS 提示词）。
- 因此本任务分两部分：先把题库和音频补齐，再接入诊断链路。

## A. 题库与音频

1. **自编 60 句 RS 题目**，写入 `seeds/rs/questions.json`：学术场景（讲座、课程、校园、研究），每句 8–20 个英文单词，按长度分三档难度。
   - **不得从第三方题库、"机经"或预测网站复制或改写**（包括仓库里的 `scripts/scrape-firefly-rs-predictions.mjs`，不要使用）。
2. **用 Azure 语音合成生成音频**（复用本地已配置的 `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`，REST 接口，不新增依赖）：
   - 混用美式、英式、澳式的神经语音，接近 PTE 考试的口音分布；语速正常。
   - 生成后上传到现有公开桶 `question-audio` 的 `rs/` 目录，写入 `questions` 表（`task_type = 'RS'`、`content`、`audio_url`、`difficulty`、`is_active = true`）。脚本：`scripts/rs-build-question-bank.js`，默认 dry-run，`--apply` 才上传和写库，可重复执行（按题号去重）。
   - 生成前先查 Azure 官方文档确认 F0 的语音合成免费额度，在交付说明里记录用量。
3. `src/data/questions.js` 中的 15 句保留为离线兜底，不删除。

## B. 诊断链路扩展到 RS

1. **数据库**（`db/rs-diagnosis.sql`，**需要用户在 Supabase 执行一次**）：
   - `speech_analyses.task_type` 的检查约束改为允许 `'RA'`、`'RS'`；
   - `complete_ra_analysis`、`backfill_ra_score` 中写死的 `'RA'` 改为使用记录自身的 `task_type`（函数名可保留，避免改调用方）。
2. **接口**：沿用 `/api/ra/analyze`（Vercel 函数数量已接近上限，不新增文件），请求增加 `task_type`（默认 `RA`）；参考原文按 `task_type` 从 `questions` 表读取并校验题目类型。
3. **评分**：在 `docs/ra-scoring-rules.md` 增加 RS 一节（或改名为 `speaking-scoring-rules.md` 并更新所有引用）：
   - 查 Score Guide 中 RS 的官方评分项与 Content 规则，**逐条注明页码**；RS 的 Content 规则与 RA 不同时，按官方 RS 规则实现，不要照搬 RA。
   - 流利度沿用 `ra-score-0.1` 的分档判定；发音显示"本版本未评估"。
   - 10–90 换算沿用"内容与流利度各半"，在规则页写明 RS 版本号（如 `rs-score-0.1`）。
4. **前端**：
   - 功能开关 `VITE_RS_DIAGNOSIS`（默认 `off`，先只在 Preview 打开）。
   - `RSView.vue` 提交走新流程：上传录音 → 浏览器端停顿检测（复用 `silence.js`）→ 调用分析接口 → 结果页。关闭开关时保持现状。
   - 结果页复用 RA 的诊断结果组件（逐词标注、回听、评分卡、规则入口、重录对比），标题和题型文字改为 RS；**原文默认折叠**，点击后展开（RS 是听后复述，先看原文没有意义）。
   - 埋点沿用 5 类事件，`props` 加 `task_type`（白名单同步更新）。
5. **兼容读取方**：首页、历史、私教中 RS 记录的分数显示与 RA 相同处理，`pronunciation: null` 不显示为 0。

## 不做

- 不改 RA 的任何规则与行为（回归测试必须全部通过）。
- 不改 DI / RTS / RL。
- 不新增依赖。

## 测试

- RS 评分：按官方 RS Content 规则的各档边界各一个用例；流利度复用现有用例。
- 接口：`task_type` 缺省为 RA；RS 题目用 RA 类型提交会被拒绝；参考原文取自数据库。
- 题库脚本：dry-run 不写入；重复执行不产生重复题目。
- 原有测试全部通过；两种开关组合构建通过。

## 验收

1. 题库：`questions` 表有 60 道 RS 题，抽 5 道确认音频可播放、与原文一致。
2. 用户执行 SQL 后，在预览环境完整做一次 RS：听音频 → 复述 → 结果页显示逐词标注、评分卡（发音未评估）、可回听。
3. RA 在预览环境照常工作，分数与之前一致。
4. 交付说明列出：需要用户执行的 SQL、Azure 语音合成用量、`lyl` 上未合并的提交。

## 实施记录

- 复用 `/api/ra/analyze`；缺省 RA，RS 明确提交 `task_type`。参考句从对应题型的数据库题目读取，已有诊断请求不可跨题型复用。
- RS 参考分 `rs-score-0.1`：Content 为 0–3 档，流利度复用原有分档，发音不评估。官方规则来源及项目近似见 `docs/ra-scoring-rules.md` RS 一节。
- RS 结果复用诊断组件，原文与逐词标注默认折叠；同题重练保留题号，对比仅取同题型历史。
- 录音仍存现有 `practice-audio/ra/{user}/` 前缀，以复用本人读写 RLS；业务题型由数据库记录和接口验证，而非目录名决定。
- 五类事件在 props 标注 RA/RS；RA 试用报告排除 RS 事件。首页、历史、私教与画像读取 RS 参考分，发音 null 不推算为 0。
- Preview 已设置 `VITE_RS_DIAGNOSIS=on`；Production 未打开。CI 两组覆盖 RA/RS 同时 on 和同时 off，旧本地 15 句兜底保留。
- 数据库：在 Supabase SQL Editor 执行 `db/rs-diagnosis.sql` 全文，修改题型约束及评分、反馈、回填函数。迁移有事务且可重复执行。

### 实现验证

- 本地 412 项测试通过，RA/RS 同时 on、同时 off 两种构建通过；题库脚本 dry-run 不调用服务，重复 apply 测试复用缓存且题号始终 60 个。
- 低置信度不作为已确认正确，不制造满档；全部只有不确定识别时总分待确认。同音词作为语音等价兼容。
- 题库实际生成与上传进行中，真实 RS 预览写库还需用户执行上方 SQL。不得将这两项视为已完成。

### 实际结果（2026-10-09，更新前述进行中状态）

- 原创 60 道 RS 题及公开音频已生成、上传并按题号写库；实际合成 60 次、5,437 字符。5 道抽样 HTTP 200 且转写与原文归一化后相同，详见 `docs/rs-question-bank.md`。
- 实现提交 `8981733` 已推送 lyl；CI 两组 success，预览 Ready：`https://kai-1qygughwe-yli71641-9949s-projects.vercel.app`。RS 开关只在 Preview 开启。
- 预览 RS_001 实际播放题目并进入录音阶段；数据库尚未放开 RS 约束（23514），所以完整“提交→诊断→评分→回听”验收仍待用户执行 `db/rs-diagnosis.sql`，不能算通过。
- RA 预览完成诊断，发音未评估，当前新转写得 88 分。与前次 80 分的流利度差异来自这次录制/转写特征（D=0 而非 1），不宣称在线分数一致。另对 7 条存量 RA 同输入重放 main 与本分支评分函数，JSON 输出 7/7 完全相同，证明 RA 评分规则未改。
- 最新 412 项测试通过；生成音频、缓存和运行报告只留忽略目录，不进 Git。本轮不合并 main。
- 实际第二次 apply：0 次合成、0 新字符、60 次缓存命中，数据库仍 60 道 RS 题；测试账号与测试练习/音频已清理。
