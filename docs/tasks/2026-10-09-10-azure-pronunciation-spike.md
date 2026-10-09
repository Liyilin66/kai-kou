# 任务 10：方案 B 技术验证（Azure 发音评估）+ 官方评分规则整理

- 日期：2026-10-09
- 分支：`lyl`（离线验证，不改线上）
- 关联：`docs/improvement-plan.md` 第 3.6 节；`docs/ra-diagnosis-eval.md`

## 背景

用户决定 RA 恢复 10–90 分，并要求**按 PTE 官方评分标准**计算、三项（内容、流利度、发音）齐全。构造样本已证明方案 A（Whisper 文本）对刻意读错和重复的检出为 0/5，无法支撑发音评分，因此验证方案 B：Azure AI Speech 的按原文发音评估（Pronunciation Assessment，scripted 模式）。

本任务**只做验证和规则整理**，结论达标后再另开任务接入线上和计算分数。

## A. 官方评分规则整理 → `docs/ra-scoring-rules.md`

1. 查阅 Pearson 官方公开资料（PTE Academic Score Guide 当前版本、官方 Read Aloud 题型说明），**逐条引用原文并注明文档名称、版本、页码或网址**。
2. 需要写清：
   - RA 的评分项（内容、发音、口语流利度）各自的评分依据与分档描述（逐档摘录）。
   - 内容项的计分规则（官方关于替换、漏读、插入如何计为错误的说明）。
   - RA 各项对口语、阅读分数的贡献方式中**官方公开了什么、没有公开什么**。
3. 明确列出"官方未公开、需要我们自行确定"的部分（例如分档到 10–90 的换算），后续实现时每一处都要在规则页说明。
4. 禁止凭记忆或第三方培训网站的说法补全官方没有公开的内容。

## B. Azure 发音评估验证

### 前置（用户提供）

用户在 Azure 创建 Speech 资源后，会把密钥和区域发给你。写入本地 `.env.local`：`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`。**暂不配置 Vercel。**

### 要做的

1. 先查 Azure 官方文档确认并记录在任务文档中：
   - 发音评估支持的接口（REST 短音频 / Speech SDK）、单段音频时长上限、支持的音频格式。RA 录音最长 40 秒，若 REST 有更短的上限，写明应对方式。
   - scripted 模式下可返回的字段：整体与逐词 AccuracyScore、FluencyScore、CompletenessScore、ProsodyScore（如适用语言区域可用）、逐词 ErrorType（Omission / Insertion / Mispronunciation 等）、音素级结果、时间偏移。
   - 免费额度与超出后单价。
   - **若需要新增 npm 依赖（例如官方 Speech SDK），先停下来在交付说明中说明理由，等用户同意；不要自行安装。**
2. 本机 ffmpeg 把现有 12 条录音（`ra-real-0001`～`0007`、5 条 `ra-con-*`）转成 Azure 支持的格式，调用发音评估（`en-US`，原文为参考文本，开启 miscue），结果缓存到 `eval/speech/cache/<id>.azure_pa.json`（不进 Git）。
3. 新增 `scripts/eval-azure-pa.js`，对照已有人工标注输出：
   - **构造样本（脚本错误）**：4 类各 5 处——刻意读错是否被标为 Mispronunciation 或逐词 AccuracyScore 明显偏低（阈值写明）；漏读、重复（插入）是否被标为 Omission / Insertion；约 2 秒停顿是否在返回中可见。
   - **真实样本**：13 处人工确认的读错中命中多少（召回），以及在 35 处"读对了"位置上误标多少（误报）——与 Whisper 的 38.5% / 2 次误报直接对比。
   - 每次调用的延迟、按免费额度计的可用次数、超出后单次成本。
4. 访问稳定性：从本机连续调用 12 次，记录失败次数与延迟分布。资源区域为 **East Asia（`eastasia`）**——Azure for Students 订阅只允许 newzealandnorth / japaneast / eastasia / malaysiawest 等少数区域，East US 和 Australia East 均被策略拒绝。线上服务端运行在 Vercel `iad1`（美国东部），在交付说明中注明跨区域调用对延迟的影响；如影响过大，评估把 `/api/ra/analyze` 的 Vercel 函数区域改到 `hkg1`。

## 达标门槛（现在定好，按结果执行）

全部满足才进入接入任务：

- 构造样本中刻意读错 **≥ 3/5** 被检出；
- 真实样本中 13 处人工确认读错的检出 **> 5**（优于 Whisper）；
- 在人工确认"读对了"的位置上误标 **≤ 5**；
- 单次延迟 P90 ≤ 6 秒，12 次调用无失败。

不达标：在报告中写明实际数字，RA 分数改为内容与流利度两项、发音显示"未评估"（即用户选项 A），不再继续调参。

## 交付

- `docs/ra-scoring-rules.md`（含官方引用）
- 任务文档末尾的验证记录：表格 + 门槛判定 + 结论
- 不改线上代码，推送 `lyl` 等审查

## 官方接口核对与验证记录（2026-10-09）

### 接口、格式与限制

- [Microsoft REST 短音频文档](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short)：普通转写最多 60 秒，但**发音评估最多 30 秒**；支持 16 kHz 单声道 PCM WAV，亦支持规定格式的 OGG/Opus。
- [Microsoft 发音评估说明](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment)：Speech SDK 可流式／连续处理长录音；连续模式不支持自动 EnableMiscue，需要自行比对文本补 Omission/Insertion。Prosody 适用于 en-US。
- 本轮**没有安装任何 SDK 或新 npm 依赖**。以 Node 自带 fetch 调 REST，将超过 30 秒的 7 条录音拆成两个不超过 29.5 秒的分段，短录音整段提交；因此是 **12 条串行样本任务、19 次串行 HTTP 请求**，不是 12 次单段 HTTP 调用。
- 分段边界由已有 Whisper 词时间戳选择，避开已知脚本／人工错误附近两词；参考原文按对应边界分开，音频按清单时长覆盖，不丢弃后半段。结果偏移再映射回原文与原录音。分段可能影响整句语境、跨段韵律，**分段分数没有合成为整条发音分**；这只能验证本次 REST 路径，不能断言 SDK 连续模式也不达标。

固定请求：region=eastasia，language=en-US，ReferenceText=对应分段原文，GradingSystem=HundredMark，Granularity=Phoneme，Dimension=Comprehensive，EnableMiscue=True，EnableProsodyAssessment=True。发音异常预先固定为 ErrorType=Mispronunciation 或非漏读／插入词的 AccuracyScore<60；Omission 的零分不冒充 Mispronunciation。停顿观察使用相邻 Azure 词时间间隔≥500 ms 或 UnexpectedBreak 标签，容许原文位置±1；不使用浏览器停顿数据假装 Azure 检出。跨切片的间隔不计，避免人为切分制造停顿。

### 实际返回字段与稳定性

有效返回实际包含整体 AccuracyScore、FluencyScore、CompletenessScore、PronScore，以及逐词 AccuracyScore、ErrorType、音素、音节、Offset/Duration。REST 此次返回是 NBest 内的平铺字段，不是只接受 SDK 的嵌套结构；脚本兼容两种。Offset/Duration 单位是 100 ns，映射时除以 10000 得到 ms。11 段有效 PA 响应均有音素数据，其中 10 段有 ProsodyScore。

19 次请求均 HTTP 200，但其中 **8 段没有有效 PA 整体评分及 ErrorType，只返回零分词项**；按评分失败记录，不能把零分当作读错。完整可评估样本为 5/12，另外 7 条至少一个分段无效。没有自动重试、没有调阈值、没有重复跑整批挑选更好结果。此异常原因目前未定位，不能直接归因于区域、限流或用户发音。

| 样本 | HTTP 段数 | 有效 PA 段数 | 整条调用耗时 ms |
|---|---:|---:|---:|
| ra-real-0001 | 1 | 0 | 15700 |
| ra-real-0002 | 1 | 1 | 13818 |
| ra-real-0003 | 1 | 1 | 18383 |
| ra-real-0004 | 1 | 0 | 17072 |
| ra-real-0005 | 2 | 2 | 16128 |
| ra-real-0006 | 1 | 1 | 15609 |
| ra-real-0007 | 2 | 1 | 15464 |
| ra-con-0001 | 2 | 1 | 26691 |
| ra-con-0002 | 2 | 1 | 23313 |
| ra-con-0003 | 2 | 2 | 17560 |
| ra-con-0004 | 2 | 0 | 26710 |
| ra-con-0005 | 2 | 1 | 23278 |

整条样本：min 13.82 s，P50 17.07 s，**P90 26.69 s**，max 26.71 s。单段 HTTP：min 5.24 s，P50 12.17 s，P90 17.07 s，max 18.38 s。分位数用 nearest-rank，包含无效评分返回的实际等待时间，不通过排除失败样本美化延迟。

### 构造样本：计划标签上的检出

| 类型 | 计划数 | 本次成功检出 | 有效 PA 未检出 | 无有效评分，不能判断 |
|---|---:|---:|---:|---:|
| 刻意换词（Mispronunciation / Accuracy<60） | 5 | **1** | 2 | 2 |
| 漏读（Omission） | 5 | 2 | 2 | 1 |
| 重复（Insertion，±1 词） | 5 | 2 | 2 | 1 |
| 约 2 秒停顿（返回间隔／Break，±1 词） | 5 | 3 | 1 | 1 |

刻意换词检出的是 RA_002 的 cars→cards，AccuracyScore=46，ErrorType=Mispronunciation。RA_003 的 formed→farmed 返回 formed，AccuracyScore=70、ErrorType=None；RA_041 的 retail→retain 返回 retail，AccuracyScore=97、ErrorType=None。RA_024 的 sailing 和 RA_016 的 force 所在分段没有有效 PA，不能声称它们都被模型判断为读对。

漏读标签异常的一个例子：RA_024 按脚本漏掉 Not，Azure 给该词 AccuracyScore=12 / Mispronunciation，而不是 Omission；按指定标签检出标准不计作正确漏读分类。计划标签仍保留，不为了对齐 Azure 结果修改。

### 真实样本：13 个读错与 35 个读对位置

8 段无效响应使这套完整标注有 **3 个正类、11 个负类位置不可评估**。不能给出完整 13/35 覆盖下可靠的 Azure 召回或误报率。

- 全部目标仍为 13 个正类、35 个负类；本次成功标出 **3 个词位错误**，包括 2 个发音标记及 1 个 Omission。其余 7 个有效位置未标出，3 个没有评分。
- 在 24 个可评估“读对”位置上，**6 个误标**：4 个 Mispronunciation、1 个 Insertion、1 个 Omission。其余 11 个“读对”位置无效，不能当作 true negative。
- 仅看发音标记：2 个确认读错命中、4 个确认读对被标发音异常；不通过缩窄错误类型来改写既定门槛。

| 可比口径 | Azure 词位错误命中 | Whisper 同位置命中 | Azure 误标 | Whisper 误报 |
|---|---:|---:|---:|---:|
| 同一可评估子集：10 个正类 + 24 个负类 | 3/10（30.0%） | 4/10（40.0%） | 6/24 | 1/24 |
| 原完整基线：13 个正类 + 35 个负类 | 本次缺失评分，不给完整比例 | 5/13（38.5%） | 11 个负类不可评估 | 2/35 |

Azure 命中的正类是 agrarian、becoming、neutral，其中 neutral 返回合并词 net-neutral 的 Omission。误标位置：modern、direct、bankrupt、positively、a、unusually。以上只是该单人候选标注集上的一致性检查，不是专家发音质量标准，也不是 Pearson 单题分验证。

### 费用与可用次数

[Azure 官方价格页](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)列出 F0 转写基础额度每月 5 小时；[发音评估价格说明](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/pronunciation-assessment-tool)说明 Accuracy/Fluency/Completeness/Miscue 属于基础 STT，Prosody 是附加收费。

2026-10-09 查询 [Microsoft East Asia USD Retail Prices API](https://prices.azure.com/api/retail/prices?$filter=armRegionName%20eq%20%27eastasia%27%20and%20contains%28productName%2C%20%27Speech%27%29)：`S1 Speech To Text` 为 **USD 1.00/音频小时**，`S1 Speech to Text Enhanced Feature Audio` 为 **USD 0.30/音频小时**。按该增强项作为 Prosody 预算，合计 USD 1.30/h；具体账单仍以资源 SKU、优惠和 Azure 计费页为准，本轮没有查询资源的 F0/S1 SKU，不声称实际消费为零。

- 基础 F0 的 18000 秒额度，可容纳约 **450 次 40 秒**录音，或 **600 次 30 秒**录音；按本批平均 31.96 秒约 563 次。不是 F0 自动获得免费 Prosody 或 S1 自动有这项额度的承诺。
- 超出免费基础额度／使用 S1：40 秒基础约 **USD 0.0111**，含 Prosody 预算约 **USD 0.0144**；30 秒分别约 USD 0.00833 / 0.01083。
- 本批参考音频时长合计 **383.562 秒**，基础预算约 USD 0.1065，含 Prosody 约 **USD 0.1385**；平均每条约 USD 0.01154（含 Prosody）。是按音频时长估算，未把延迟当计费时长，也不是实际发票金额。

### 区域评估

本次只测试本机→eastasia，未测 Vercel iad1→eastasia。[Vercel 官方区域表](https://vercel.com/docs/regions)确认 iad1 是美国东部、hkg1 是香港。美国东部跨区调用 East Asia 可能增加传输与往返时间，但当前 17–27 秒等待不能仅凭距离归因。若将来经许可验证 SDK，应对同一组录音实测 iad1/hkg1 两种服务端路径，再决定是否迁移该函数；不能把改到 hkg1 当成本次达标的保证。**本轮未改任何 Vercel 区域或环境变量。**

### 门槛判定与结论

| 门槛 | 实际结果 | 判定 |
|---|---|---|
| 刻意换词 ≥3/5 | 成功检出 1/5，2 个不可评估 | 未达到 |
| 真实正类成功检出 >5 | 3 个（仅发音为 2 个），3 个不可评估 | 未达到 |
| 读对位置误标 ≤5 | 已发现 6 个，另外 11 个不可评估 | 未达到 |
| 单次 P90≤6 s、12 次无失败 | 整条 P90 26.69 s，19 段中 8 段无有效 PA | 未达到 |

**不进入 Azure 线上接入，不继续调参。后续评分方案选 A：内容与流利度，发音标“未评估”。** 本任务禁止修改线上代码，因此这里只记录决定；恢复分数及自定 10–90 换算需要另开接入任务，并遵循 `docs/ra-scoring-rules.md` 的官方／自定边界。本结论针对本次无 SDK、分段 REST 的验证路径，不证明官方 SDK 连续评估也不适用；尝试 SDK 须先获得新增依赖授权。

复现：`node scripts/eval-azure-pa.js` 只回放缓存；`--live` 才会再次发请求，本轮没有第二批。单个缓存 `eval/speech/cache/<id>.azure_pa.json` 保留原响应、时长、原文分段、音频 hash 和有效性标记，不含密钥且不入 Git。批次 `2026-10-09T04:16:14.104Z`，JSON 报告本机 `output/eval/azure-pa-2026-10-09.json`。报告里的 8 次失败含义是“发音评分响应无效”，HTTP／网络失败数为 0。

## 额外标注写回

输入归档 `eval/speech/labels/user-listening-mixed-extras-2026-10-09.json`：35 条，22 确认有问题、9 确认误报、4 听不清。新增导入脚本 `eval-apply-mixed-extra-labels.js`，清单写入 `labels.extra_review` 与 `labels.supplemental_errors`；原 20 个脚本计划标签不动，听不清没有当成正确或错误。结果也追加到 `docs/ra-diagnosis-eval.md`，不混入 Azure 本轮 13/35 真实样本的门槛分母。

## 工程验证与交付范围

`npm test`：349 项通过、0 失败；`git diff --check` 通过。新增测试覆盖 REST 参数与密钥不外泄、30 秒分段完整性、平铺字段与插入标签映射、无评分响应不能充当零分、原响应保留，以及额外标注的幂等／漂移校验。backend/、src/、api/、package.json 和 lockfile 均未修改，没有新增依赖，没有设置 Vercel Azure 密钥。Azure 服务返回未包含可固定引用的模型版本，报告以接口、区域、请求配置、批次与原始缓存追溯，不伪造模型版本号。

仅推送 lyl 等 Claude 审查，不合并 main。`.env.local` 保持本地并被 Git 忽略，缓存及转换音频也均忽略。
