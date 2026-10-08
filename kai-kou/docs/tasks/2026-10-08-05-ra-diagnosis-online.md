# 任务 5：RA 录音诊断上线（第一版，功能开关后）

- 日期：2026-10-08
- 分支：`lyl`（改动线上代码，**必须 Claude 审查后才能合并 `main`**）
- 关联：`docs/improvement-plan.md` 第 3.3、3.7–3.10 节；任务 4 的离线链路
- 预计工作量：中到大

## 目标

把任务 4 的离线链路接入网站：用户读完 RA → 服务端用 Whisper 识别、对齐、结合停顿生成证据 → 结果页逐词标注、点击回听。**放在功能开关后面**，先在预览环境验证，再对生产开放。

LLM 文字反馈**不在本任务**（任务 6）。本任务的结果页只展示证据和指标。

## 关键设计（已确定）

1. **停顿在浏览器端计算。** 录音组件已经把录音解码成 PCM（`useRecorder.js` 中 `decodeAudioDataCompat` → `computeAudioAmplitudeStatsFromFloatSamples`）。在同一处调用 `backend/speech/silence.js` 的 `detectSilences`，把结果随请求提交。服务端没有 ffmpeg，不在服务端解码。`silence.js` 必须保持不依赖 Node API，前端直接 import。
2. **先存录音，再分析。** 现在的流程是"评分成功后才在后台上传录音"，评分失败录音就丢了。新流程：上传录音到 `practice-audio/ra/{uid}/...` 成功 → 调用分析接口；上传失败直接提示重录。
3. **结果由服务端写库。** 分析结果写入新表 `speech_analyses`；同时由服务端插入 `practice_logs` 记录（`score_json` 带 `analysis_id`、`diagnosis_version`、`metrics`），**不再由前端插入**。
4. **不显示发音分，也不显示 10–90 总分**（方案 A，计划 3.6 / 3.9 节）。展示：内容完整度、语速、犹豫次数、长停顿次数、开口延迟。
5. **旧评分影子运行。** 开关打开时，前端在后台并行调用一次旧的 `/api/score`，结果写入 `speech_analyses.legacy_score`，**只存不显示**，用于新旧对比。旧接口失败不影响新流程。

## 交付

### 1. 数据库：`db/speech-analyses.sql`

按计划 3.8 节建表 `public.speech_analyses`，并补充：

- `legacy_score jsonb`（影子运行的旧评分）
- `client_silences jsonb`（浏览器提交的静音区间，原样留存，便于复查）
- `unique (user_id, attempt_id)`；RLS：用户只能读自己的记录，写入只走服务端 service role。

**此 SQL 需要用户在 Supabase 执行**——交付时把执行步骤写成一句话给用户，执行后由你用只读查询验证。

### 2. 接口：`api/ra/analyze.js`

- `POST`，Bearer 登录校验；复用现有的访问权限判断（与 `/api/score` 一致）。
- 请求：`{ attempt_id, question_id, audio_path, silences, speech_onset_ms, speech_offset_ms, duration_ms }`。
- 校验 `audio_path` 必须以 `ra/{当前用户 id}/` 开头且不含 `..`；`silences` 数量和数值范围做上限校验。
- 流程：查 `attempt_id` 是否已有结果（有则直接返回，不重复调用）→ 从存储桶下载录音 → `transcribeWithGroqWhisper` → `alignWords`（原文从 `questions` 表取，不信任前端传入的原文）→ `extractFeatures` → `buildEvidence` → 写 `speech_analyses` 与 `practice_logs` → 返回。
- 记录版本：`provider`、`model`、`rules_version`；记录各步骤耗时 `timings_ms`。
- 失败：识别失败返回明确错误码，`speech_analyses.status = 'failed'`，**不回退到 LLM 猜分**。
- 本地 `server.js` 注册同一路由。
- Vercel 函数数量：加上本接口为 10 个，仍在 Hobby 的 12 个上限内。

### 3. 前端

- 功能开关 `VITE_RA_DIAGNOSIS`：`on` / `off`（默认 `off`）。**Vercel 中先只给 Preview 环境设为 `on`**，生产保持 `off`。
- `RAView.vue` 提交流程：开关打开时走新流程（生成 `attempt_id` → 上传录音 → 计算静音 → 调用 `/api/ra/analyze` → 跳转结果页）；关闭时完全保持现状。
- `RAResultView.vue`：开关打开且结果来自新流程时，显示新版内容：
  - 原文逐词上色：漏读、替换（文案"可能读错或识别不清"）、重复/多读、犹豫、长停顿；`homophone`、`low_confidence` 不标红。
  - 点击任意标注 → 录音播放器跳到对应时间播放（停顿类跳到停顿前 1 秒）。
  - 指标卡片：内容完整度、语速、犹豫次数、长停顿次数、开口延迟。
  - 页面底部小字：`识别：Groq whisper-large-v3 · 规则 ra-diag-0.1 · 发音未评估`。
  - 手机优先：375 宽度下可用（沿用任务 3 的手机断点做法）。
- 旧版结果页保留，开关关闭时显示旧版。

### 4. 读取 `practice_logs` 的地方要兼容新记录

新记录的 `score_json` 没有 `overall` 和三项分数。逐个检查 RA 相关的读取方，确保新记录不会显示 `NaN`、`undefined`、0 分，也不会被算进平均分：

`src/lib/ra-history.js`、`src/views/RAHomeView.vue`、`src/views/RAListView.vue`、`src/lib/home-analytics.js`、`src/lib/home-desktop-dashboard.js`、`src/lib/profile-portrait.js`、`src/lib/agent.js`、`backend/agent/build-agent-context.js`、`backend/agent/daily-suggestion-service.js`、`api/agent/chat.js`

处理原则：平均分、趋势只统计有分数的记录；历史列表对新记录显示"诊断：完整度 xx%"。**只做兼容，不改其他题型的逻辑。**

### 5. 顺手修正

`align.js` 的拼写表加入 `sizeable`→`sizable`（真实样本 `ra-real-0003` 中出现的误报）。

## 不做

- 不接 LLM 文字反馈（任务 6）。
- 不改其他题型。
- 不新增依赖。

## 测试

- `tests/api/ra-analyze.test.js`：模拟 Supabase 与 Groq——正常流程；重复 `attempt_id` 不重复调用识别；`audio_path` 指向别人目录 → 403；识别失败 → 明确错误且不写分数；原文取自数据库而不是请求体。
- 读取方兼容：至少为 `ra-history.js`、`home-analytics.js`、`build-agent-context.js` 各加一条"新记录无分数"的测试。
- 原有测试全部通过；`npm run build` 通过。

## 验收

1. 测试和构建通过。
2. 推送 `lyl` 后，Vercel 会生成预览地址。在预览地址（开关为 `on`）用手机完整做一次 RA：结果页能看到逐词标注，点击能回听，指标合理。
3. 用只读查询确认：`speech_analyses` 有记录，含版本和耗时；`legacy_score` 有影子评分；`practice_logs` 有对应记录；首页、个人中心、RA 历史、私教页面打开不报错。
4. 生产环境开关仍为 `off`，线上用户不受影响。

## 交付说明需附

- 预览地址
- 需要用户执行的 SQL 步骤（一句话）
- 一次真实分析的 `timings_ms`

## 实施记录

- [x] 任务4经用户确认Claude审查通过，已推送main（d7e45fa）；任务5在同步后的lyl开发。
- [x] 新分析接口、独占attempt_id、用户路径校验、服务端取原文、静音请求上限与原子保存RPC。
- [x] 浏览器PCM静音、上传先于分析、提交重试复用ID和上传、诊断结果页与证据回听。
- [x] 指定读取方兼容诊断记录；练习次数保留，分数均值/趋势/弱项排除无分数记录。
- [x] sizeable/sizable拼写回归修复。
- [x] 223项测试通过；默认关闭及开启构建通过；内部审查未发现阻塞提交问题（不替代Claude审查）。
- [x] Vercel `VITE_RA_DIAGNOSIS=on`已设置且仅选Preview；Production未设on，默认off。
- [x] 隔离浏览器模拟375/390/1440宽度无溢出，结果无总分/发音分，真实音频回放跳转可用；此项不替代真机录音验收。
- [x] 新诊断服务使用现存RA_024录音完成真实Groq分析，返回done且没有overall：下载682ms、识别999ms、对齐12ms、特征证据2ms、total1695ms。此total不包括最终数据库事务保存。
- [ ] 用户执行`db/speech-analyses.sql`后，只读验证表已存在。
- [ ] Preview真实手机录音→分析→结果，验证speech_analyses、practice_logs、legacy_score保存。
- [ ] Claude独立审查通过后用户确认合并main。

SQL步骤：在当前Supabase项目的SQL Editor粘贴并执行`kai-kou/db/speech-analyses.sql`全文，然后通知Codex进行只读验证。

### 影子评分实现取舍

前端在诊断成功后后台POST同一分析接口`{action:'legacy_score',attempt_id}`；服务端读取已保存原文/识别文本，调用原`/api/score`处理函数并写入真实旧结果。没有接受客户端传入分数，也没有新增第二个Serverless Function。影子失败只标记legacy_status，不影响新诊断；重复影子请求有条件占用保护。

### 待验收边界

当前Supabase尚未创建speech_analyses表，不能宣称实际持久化或影子评分已通过。保存失败/请求中断可能保留processing占用；不会自动重新识别收费，需要运营排查恢复。客户端静音属于浏览器观测值，服务端校验范围并原样保存，不将其作为官方分数。录音签名链接在浏览器按用户权限生成，不公开存储桶。

本地手机截图：仓库忽略目录`output/playwright/ra-diagnosis/`。真实分析详情：`kai-kou/output/qa/task5-real-analysis.json`。两者均不提交。
