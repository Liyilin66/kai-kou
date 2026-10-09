# Read Aloud 官方评分规则整理

本页只整理 Pearson 官方公开资料中可以查证的 Read Aloud（RA）评分规则。中文分档描述是对官方英文的归纳，不是逐字翻译；原文只保留必要的短档名和术语，避免把官方文档整段搬进仓库。

## 官方来源与版本语境

1. Pearson 官方评分页：[官方评分页](https://www.pearsonpte.com/pte-academic/scoring/)，页面提供当前 PTE Academic Score Guide 下载入口；访问日期：2026-10-09。
2. Pearson 官方 PDF：`PTE Academic Test Taker Score Guide`，URL：[Score Guide PDF](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf)。PDF 共 46 页，文件响应头 `Last-Modified: Wed, 18 Feb 2026 07:47:17 GMT`；本机 `pdfinfo` 显示 `CreationDate: Thu Aug 14 18:54:59 2025 AEST`、`ModDate: Wed Feb 18 18:47:17 2026 AEDT`。PDF 页脚版权为 2025。
3. Pearson 官方 RA 题型页：[官方 RA 说明](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/)，Read Aloud 小节；访问日期：2026-10-09。

可复核页码：

- Score Guide 第 15 页：RA 的题量、计分方式、评分项、Content 规则、Pronunciation 档名。
- Score Guide 第 16 页：RA 的 Oral Fluency 档名。
- Score Guide 第 45 页：Pronunciation 0-5 详细标准。
- Score Guide 第 46 页：Oral Fluency 0-5 详细标准。
- 官方 RA 题型页：题型任务、准备时间、作答方式和“如何评分”说明。

## RA 题型与公开计分项

官方 RA 题型页说明：屏幕上出现文本，考生朗读出来；文本长度最高 60 词；麦克风打开前有 30-40 秒阅读和准备时间；作答时长随题目文本长度而变；只能录一次。

Score Guide 第 15 页公开的 RA 评分配置是：

- 题量：6-7 题。
- 计分方式：Partial credit。
- 公开评分项：Content、Pronunciation、Oral Fluency。
- Score Guide 表格中的 communicative skill 是 Speaking。

需要注意：官方 RA 题型页的 Notes 另写 RA 会影响 reading、speaking、pronunciation、oral fluency；但当前 Score Guide 第 15 页表格只写 Speaking。两处都是 Pearson 官方公开材料，存在表述不一致。后续实现不能自行声称“官方给出了 Content 到 Reading、Pronunciation/Fluency 到 Speaking 的具体拆分公式”。

## Content 规则

官方核心问题是：回答是否包含阅读文本中的全部单词，并且只包含这些单词。官方 RA 题型页说明 Content 通过统计回答中的正确单词来评分，替换、插入、漏读会降低分数。Score Guide 第 15 页进一步明确：每一次 replacement、omission、insertion 都算 1 个错误；最高分取决于题目文本长度。

实现口径：

- `replacement`：参考文本某个位置应该读 A，识别/对齐结果是另一个词 B，按 1 个 Content 错误计。
- `omission`：参考文本中有词，但回答中没有对应词，按 1 个 Content 错误计。
- `insertion`：回答中多出参考文本没有的词，按 1 个 Content 错误计。
- 同一处不要重复计错：例如一个参考词既被替换又被后续算法标成漏读时，应在对齐层归并成单一错误。
- Content 的原始最高分随题目长度变化；Pearson 没有公开“错误数如何映射到 10-90”的公式。

官方没有在 RA 条目里公开停顿、犹豫、填充音、开头/结尾多余材料是否从 Content 错误中排除。Repeat Sentence 条目有类似说明，但不能直接当作 RA 官方规则套用。RA 实现如需忽略非词语停顿，应在本项目规则中单独标注为产品判定，不写成 Pearson 官方规则。

## Pronunciation 0-5 分档

以下为 Score Guide 第 45 页 Pronunciation 标准的中文归纳。括号中的英文为官方短档名。

| 分数 | 官方档名 | 中文归纳 |
| --- | --- | --- |
| 5 | Highly proficient | 元音和辅音对普通英语使用者来说容易理解；连读中的同化、省音自然；单词重音和句子重音都放置得当。 |
| 4 | Advanced | 元音和辅音清楚、不含糊；少量辅音、元音或重音偏差不影响理解；所有词容易听懂；常见词重音正确，句子重音基本合理。 |
| 3 | Good | 大多数元音和辅音正确；有些持续性错误会让少数词不清楚；特定语境下少量辅音可能被扭曲、省略或读错；少数词可能出现受重音影响的弱读问题。 |
| 2 | Intermediate | 一些辅音和元音持续读错；至少约三分之二语音可懂，但听者可能需要适应口音；部分辅音常被省略，辅音串可能被简化；部分单词重音可能错误或不清楚。 |
| 1 | Intrusive | 大量辅音和元音读错，外语口音强烈；听者可能听不懂约三分之一词语；许多辅音可能变形或省略，辅音串可能不像英语；重音方式偏非英语，可能增减音节。 |
| 0 | Non-English | 发音整体像另一种语言；大量音素读错、顺序错误或省略；超过一半语音可能难以理解；重读/非重读音节方式不像英语，多个词可能音节数错误。 |

实现口径：

- Pronunciation 不能由文本相似度或 LLM 仅看转写文本推断。
- 官方标准关注音素、重音、可懂度和英语语音实现方式；如果用 Azure Pronunciation Assessment，只能说它提供这些维度的可观测证据，不能声称等同 Pearson 专有 Versant 评分。
- Pearson 明确接受可被普通英语使用者理解的地区/国家英语变体；实现中不应把所有非美式/非英式口音自动当错。

## Oral Fluency 0-5 分档

以下为 Score Guide 第 46 页 Oral Fluency 标准的中文归纳。括号中的英文为官方短档名。

| 分数 | 官方档名 | 中文归纳 |
| --- | --- | --- |
| 5 | Highly proficient | 节奏和短语划分平滑；没有犹豫、重复、假开头，也没有语音简化问题。 |
| 4 | Advanced | 节奏可接受，短语划分和词重音合适；最多出现一次犹豫、一次重复或一次假开头；没有明显语音简化。 |
| 3 | Good | 语速可接受但可能不均匀；可有一次以上犹豫，但多数词处在连续短语中；重复或假开头较少；没有长停顿，听感不应是断续逐字读。 |
| 2 | Intermediate | 可能不均匀或断续；若回答不少于 6 词，至少有一个流畅的三词连续片段；犹豫、重复或假开头不超过两三处；可以有一个长停顿，但不能有两个或更多。 |
| 1 | Limited | 短语划分或句子节奏不规律；糟糕的短语划分、断续/按音节读、多个犹豫/重复/假开头让表现明显不连贯；长回答可能有一两个长停顿，句子层面的词重音不合适。 |
| 0 | Disfluent | 语速慢且费力，几乎没有可辨认的短语组合；多次犹豫、停顿、假开头，或严重语音简化；多数词孤立发出，可能有超过一个长停顿。 |

实现口径：

- 可观测特征应包括语速、连续短语、犹豫、重复、假开头、长停顿和断续程度。
- “hesitation”和“long pause”都属于 Oral Fluency 的负面证据，但官方分档没有给出秒级阈值；本项目如设置 0.5 秒、1.0 秒或 2.0 秒阈值，必须标成项目自定阈值。
- Fluency 不能只看总时长或 WPM；官方标准同时看节奏、短语划分、重复/假开头和停顿。

## 公开与未公开的贡献方式

官方公开了：

- RA 是 partial credit。
- RA 公开评分项包括 Content、Pronunciation、Oral Fluency。
- Content 错误类型是 replacement、omission、insertion，且每个词级错误计 1 次。
- Pronunciation 与 Oral Fluency 的 0-5 分档描述公开在 Score Guide 第 45-46 页。
- 当前 Score Guide 第 15 页表格把 RA 的 communicative skill 写为 Speaking。
- 官方 RA 题型页同时写 RA 影响 reading、speaking、pronunciation、oral fluency。
- 官方评分页说明最终 Score Report 有 10-90 总分和各 communicative skills 分数，并按 GSE 评分。

官方没有公开：

- 单题 RA 的 Content、Pronunciation、Oral Fluency 如何合成为一个题目分。
- 0-5 档如何映射到 10-90。
- Content 错误数与原始 Content 分之间的完整公式；公开材料只说最高分取决于文本长度。
- RA 中 Content、Pronunciation、Oral Fluency 各自对 Speaking 或 Reading 的权重。
- 官方网页所说 reading 贡献与当前 Score Guide 表格所说 Speaking 之间如何协调。
- Pearson 专有 Versant 模型的音素、重音、流利度特征权重。
- “长停顿”的精确秒级定义。

## 本项目后续实现必须显式声明的自定规则

后续如果恢复 10-90 分，必须在本页追加以下项目规则，不能把它们写成官方规则：

- Content 原始分计算公式：例如 `max(0, referenceWords - errors) / referenceWords`，或其他长度归一化方式。
- Pronunciation 证据到 0-5 档的映射：例如 Azure `AccuracyScore`、词级/音素级错误、重音证据如何组合。
- Oral Fluency 证据到 0-5 档的映射：包括语速区间、犹豫阈值、长停顿阈值、重复/假开头检测。
- 三项原始分到 10-90 展示分的换算。
- RA 对 Reading 的处理：若产品显示 Reading 贡献，必须说明这是基于官方题型页的表述和项目推断；若产品只显示 Speaking 诊断，也必须说明依据当前 Score Guide 表格。
- Azure 或其他第三方发音评估与 Pearson 专有评分之间的差异提示。

## 产品文案边界

可以说：

- “按 Pearson 官方公开评分项整理：内容、发音、流利度。”
- “内容按替换、漏读、插入做词级对齐诊断。”
- “发音和流利度使用可观测语音证据估计，并给出练习反馈。”
- “10-90 为项目自定换算，不代表 Pearson 官方单题分。”

不要说：

- “官方 RA 单题分。”
- “完全复刻 Pearson / Versant 评分。”
- “Azure 分数就是 PTE 发音分。”
- “官方公开了 RA 对 Reading/Speaking 的精确权重。”
