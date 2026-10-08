# 开口（Kai-Kou）整体提升方案

- 编写日期：2026-10-07
- 适用分支：`lyl`
- 状态：草案，第一轮未开始
- 约束：2026 年 11 月下旬入职实习，入职前可投入约 7 周

---

## 0. 摘要

开口已经是一个功能完整、已上线的 PTE 练习产品：7 类题型、录音、历史、学习统计、模型容灾、AI 私教和每日计划都已具备。它目前的短板不在功能数量，而在**核心 AI 能力的可信度和效果证据**：

- 口语题的发音、流利度分数由 LLM 读取浏览器转写文字后给出，输入里没有足够的声音证据。
- 没有评分质量评测，也没有核心逻辑的自动化测试，无法证明改动是改好了还是改坏了。
- 私教计划按题型均分排序，不针对具体错误；缺少"练习 → 复测 → 是否改善"的闭环。

本方案的总目标：

> **把开口从"能评分的练习工具"升级为"基于真实录音、证据可核验、能针对错误安排训练并验证效果"的训练产品。**

路线总览：

| 轮次 | 内容 | 时间 | 性质 |
|---|---|---|---|
| 第一轮 | RA 录音诊断 + 评测体系 | 入职前 7 周 | **必做主线** |
| 第二轮 | 推广到 RS / RL / DI / RTS | RS 入职前有余力可做；其余入职后 | 推荐 |
| 第三轮 | 学习者错误模型 + 私教针对性训练 + 延迟复测 | 入职后 | 推荐 |
| 第四轮 | 全平台工程与可观测性 | 随前三轮逐步补 | 伴随 |
| 第五轮 | README、演示视频、评测报告、简历 | 第一轮完成后立即做 | 必做 |

只完成第一轮 + 第五轮，就已经是一段完整、可面试展示的成果。

---

## 1. 现状评估

### 1.1 已有基础（不需要推倒重来）

| 能力 | 位置 |
|---|---|
| 多题型练习、录音、历史与统计 | `src/views/*`、`src/stores/practice.js`、`src/lib/*-history.js` |
| 录音已上传私有存储桶 `practice-audio`（RA） | `src/stores/practice.js` `uploadPracticeAudioForRA`、`db/ra-practice-audio.sql` |
| 模型主备切换、超时、错误归一 | `backend/llm/score-llm-service.js`、`backend/llm/providers/*` |
| 各题型结果归一化 | `backend/{di,rts,we}/normalize-*-score.js` |
| WE 格式检查（确定性规则） | `backend/we/form-gate-rules.js` |
| WFD 逐词比对（确定性） | `src/views/WFDView.vue` |
| 私教：会话持久化、读取练习数据、每日计划与完成进度 | `backend/agent/*`、`db/agent-memory-v1.sql`、`db/agent-daily-plans.sql` |
| 调用日志 | `agent_usage_logs` |

### 1.2 核心差距

| 差距 | 证据 | 影响 |
|---|---|---|
| 口语"发音/流利度"由文字推断 | `useRecorder.js` 使用浏览器 `SpeechRecognition`；`api/score.js` RA 提示词要求模型输出 pronunciation / fluency | 浏览器识别会把念错的词"纠正"成正确单词，模型看不到停顿和发音，分数缺少依据 |
| 没有评分质量评测 | 仓库无评测集、无评测脚本 | 改提示词、改阈值都无法判断好坏，容易陷入反复调参 |
| 核心逻辑没有自动化测试 | `scripts/test-*.js` 只是 TTS 连通性检查 | 评分归一化（上千行纯函数）改动风险高 |
| 计划不针对具体错误 | `agent-plan-service.js` `selectTaskTypesFromSummary` 按题型均分排序 | 两个均分相同但错误类型不同的用户得到同样的计划 |
| 练习结果由前端写库 | `practice.js` 中前端直接 `insert` 到 `practice_logs` | 结果没有版本信息，也无法保证与服务端评分一致 |
| 评分结果没有版本记录 | `score_json` 中无规则/提示词/模型版本 | 历史结果无法解释，新旧方案无法对比 |

---

## 2. 定位与设计原则

### 2.1 产品定位

做**可靠的训练诊断**，不承诺复刻 PTE 官方评分。所有分数和指标在界面上标明来源，不称为"PTE 官方分"。

### 2.2 设计原则

1. **代码出数，LLM 解释。** 对齐、停顿、语速、错误类型由确定性代码或专业语音服务给出；LLM 只把证据翻译成可执行的建议。
2. **每条反馈可核验。** 反馈必须引用证据编号，证据对应原文位置和录音时间段，用户可以点击回听。引用不存在的证据就打回重写。
3. **评测先行。** 先有评测集和基线，再开发；每次改动都跑评测。
4. **一次做透一个题型。** RA 跑通并验证后，再推广。
5. **识别不确定时不下结论。** 识别置信度低的词标为"不确定"，不当作用户错误。
6. **旧链路保留开关。** 新旧方案可切换，可对比，可回退。

---

## 3. 第一轮：RA 录音诊断（主线）

### 3.1 目标体验

```
读一段 RA
 → 系统逐词标出：漏读、读错/替换、多读、重复、句中犹豫、超长停顿
 → 点击任意标注，回听对应录音片段
 → 看到 2–3 条最重要的改进建议（每条都能展开证据）
 → 重录同一题，对比两次的问题数和停顿变化
```

### 3.2 范围

包含：RA 的录音处理、对齐、特征计算、证据生成、LLM 反馈、结果页、重录对比、评测、版本记录。

不包含：其他题型、私教改造、10–90 综合预估分的校准（见 3.9）。

### 3.3 新链路架构

```
前端 RAView
  │ 录音结束
  │ ① Web Audio 解码 → 重采样为 16kHz 单声道 PCM WAV
  │ ② 上传到 practice-audio/ra/{uid}/...（复用现有路径规则）
  ▼
POST /api/ra/analyze  { question_id, audio_path, attempt_id }
  │ ③ 校验登录、配额、幂等键（attempt_id）
  │ ④ 读取录音（service role）
  │ ⑤ 录音质量检查：时长、静音比例、截断、削波
  │ ⑥ speech-provider：词级时间戳 + 置信度（方案 B 时附音素准确度）
  │ ⑦ align：参考原文 ↔ 识别结果逐词对齐
  │ ⑧ features：停顿分类、语速、开口延迟、有效发声比例
  │ ⑨ evidence：生成带编号、带时间段的证据列表
  │ ⑩ feedback：LLM 根据证据写建议 → 校验器检查引用
  │ ⑪ 写入 speech_analyses（服务端写库，含版本信息、耗时、成本）
  ▼
前端 RAResultView：逐词标注 + 点击回听 + 建议 + 重录对比
```

### 3.4 后端模块

新建 `backend/speech/`（不叫 `ra/`，因为第二轮要复用）：

| 文件 | 职责 | 输入 → 输出 |
|---|---|---|
| `audio-quality.js` | 录音可用性判断 | WAV → `{ duration_ms, speech_ratio, clipped, truncated, status }` |
| `providers/*.js` | 语音服务适配层，沿用 `backend/llm/providers` 的写法 | 音频 + 参考文本 → 统一的 `words[]` |
| `align.js` | 词级对齐（纯函数） | `reference_text`, `words[]` → `aligned[]` |
| `features.js` | 时序特征（纯函数） | `aligned[]` → `metrics`, `pauses[]` |
| `evidence.js` | 证据整理与排序（纯函数） | `aligned[]`, `pauses[]`, `metrics` → `evidence[]` |
| `feedback.js` | LLM 生成建议 + 引用校验 | `evidence[]` → `feedback[]` |
| `config.js` | 所有阈值集中配置，带 `RULES_VERSION` | — |

统一的识别结果格式：

```json
{
  "words": [
    { "text": "environment", "start_ms": 5120, "end_ms": 5890, "confidence": 0.93, "accuracy": 71 }
  ],
  "provider": "xxx",
  "provider_version": "xxx"
}
```

`accuracy` 仅方案 B 存在。

### 3.5 关键算法

**对齐（`align.js`）**

1. 归一化：小写、去标点、统一撇号与连字符、展开常见缩写；数字按读法展开（如 `1990` → `nineteen ninety`），无法确定读法的数字词做宽松匹配。
2. 词级编辑距离对齐（替换/插入/删除），记录每个参考词的状态：`ok` / `omitted` / `substituted` / `low_confidence`。
3. 插入词二次分类：与前后参考词相同 → `repetition`；常见填充词（um / uh / er）→ `filler`；其余 → `inserted`。
4. 置信度低于阈值的替换，标为 `low_confidence`，不计为错误。

**停顿与时序（`features.js`）**

| 指标 | 定义 |
|---|---|
| 开口延迟 | 录音开始到第一个词的时间 |
| 词间停顿 | 相邻两词 `start - prev.end` |
| 自然停顿 | 停顿位于标点处且未超过阈值 |
| 句中犹豫 | 停顿不在标点处且 ≥ 犹豫阈值（初始 0.5s，开发集上校准） |
| 超长停顿 | ≥ 长停顿阈值；如果停顿长到考试中会触发录音自动结束，则单独标出（具体秒数以 Pearson 官方说明为准，阶段 0 核实） |
| 语速 | 有效词数 / 总发声时长（WPM） |
| 发音语速 | 有效词数 / 去除停顿后的时长 |
| 有效发声比例 | 发声时长 / 录音总时长 |

所有阈值写在 `config.js`，只在开发集上调整，不在测试集上调。

**证据（`evidence.js`）**

```json
{
  "id": "E3",
  "type": "hesitation",
  "ref_span": [12, 13],
  "text": "significantly",
  "time_ms": [8420, 9650],
  "detail": { "pause_ms": 1230, "at_punctuation": false },
  "severity": 2
}
```

按严重程度和出现次数排序，取前若干条交给 LLM，避免反馈泛泛而谈。

**反馈（`feedback.js`）**

- 提示词只提供证据和原文，要求输出 2–3 条建议，每条带 `evidence_ids` 和一个可执行的练习动作。
- 校验：引用的证据编号必须存在；不得出现证据里没有的错误类型；不通过就重写一次，仍不通过则退回模板化反馈（由证据直接生成），不让 LLM 编造。

### 3.6 发音：阶段 0 决定方案 A 或 B

| | 方案 A | 方案 B |
|---|---|---|
| 做法 | 只用带词级时间戳的识别；去掉没有证据的发音分 | 接入有参考文本模式的发音评估服务，提供音素/单词准确度 |
| 界面 | 只展示内容与流利度诊断 | 额外展示"单词准确度（来自某服务商）" |
| 优点 | 成本低，无新供应商 | 发音有真实声学依据；对齐时间戳同时获得 |
| 风险 | 发音维度缺失 | 成本、延迟、国内访问稳定性 |

**判定方式：** 阶段 0 用 10 条录音实测 → 延迟、单次成本、国内访问三项都可接受选 B，否则选 A。不在讨论中决定。

注意：如果使用通用识别模型（例如 Whisper 一类），这类模型倾向于省略填充词和重复，不利于检测犹豫和重复，评测时要专门看这一项。

**决定（2026-10-08）：选方案 A。** 识别使用 Groq 托管的 `whisper-large-v3`（已有密钥）。发音维度本版本**不评估**：界面不显示发音分，反馈中对替换词只说"可能读错或识别不清，请回听"，不下发音结论。若以后改为 B，适配层可替换。

实测（`ra-real-0001`，Groq `whisper-large-v3`）：

- 直接接受 webm 录音，0.7 秒返回，含词级时间戳；前端无需转 WAV。
- 浏览器识别错出的 known、water first、sea trade、became、when、sailing boats，Whisper 全部识别正确；spices、perfumes 两种识别都没识别对。说明 RA_024 的大部分"错误"来自浏览器识别，而不是用户朗读——待用户回听确认。
- `whisper-large-v3-turbo` 准确度明显较差（sea trees become），不使用。
- **Whisper 的词级时间戳会把停顿吸收进相邻词**（例如 `of` 0.64 秒、`between` 1.1 秒），全篇没有一处词间空隙超过 0.3 秒。因此**停顿必须由音频能量检测得到**，不能从词时间戳推算。

### 3.7 前端改动

| 文件 | 改动 |
|---|---|
| `src/composables/useRecorder.js` | 增加导出 16k 单声道 WAV 的函数（Web Audio 解码 + 重采样），统一 Safari mp4 和 Chrome webm |
| `src/views/RAView.vue` | 提交时调用 `/api/ra/analyze`；保留旧链路开关 |
| `src/views/RAResultView.vue` | 原文逐词上色；点击跳转到对应录音时间播放；建议卡片可展开证据；重录对比面板 |
| `src/lib/ra-history.js` | 历史记录读取 `speech_analyses` |

结果页标注颜色约定：漏读、替换、重复、犹豫、超长停顿、不确定，各用一种颜色并配图例。

### 3.8 数据模型

```sql
create table if not exists public.speech_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null,                 -- 幂等键，前端每次录音生成
  task_type text not null,                  -- 'RA'，第二轮扩展
  question_id text,
  audio_path text not null,
  status text not null default 'pending',   -- pending / processing / done / failed / unusable_audio
  provider text,
  provider_version text,
  rules_version text,
  prompt_version text,
  llm_model text,
  metrics jsonb default '{}'::jsonb,
  aligned jsonb default '[]'::jsonb,
  evidence jsonb default '[]'::jsonb,
  feedback jsonb default '[]'::jsonb,
  timings_ms jsonb default '{}'::jsonb,     -- 各步骤耗时
  cost_estimate numeric,
  error_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, attempt_id)
);
-- RLS：用户只读自己的记录；写入只走服务端 service role
```

`practice_logs` 保留，增加一列 `analysis_id` 关联，历史统计逻辑不需要大改。

### 3.9 关于"分数"的产品决策

- **第一版展示：** 内容完成度（由对齐结果直接计算）、语速、犹豫次数、超长停顿次数，方案 B 再加单词准确度。全部是可解释的原始指标。
- **10–90 综合预估分：** 暂时放在开关后面。只有评测证明它与参考评价有合理一致性时才开放，并标明"训练参考，非官方分"。
- 旧链路的 LLM 分数在影子模式下继续计算并记录，只用于对比，不展示。

### 3.10 异常处理

| 情况 | 处理 |
|---|---|
| 静音 / 纯噪声 | `unusable_audio`，提示重录，不出分 |
| 录音被截断 | 标注截断位置，只诊断已读部分 |
| 语音服务超时 / 失败 | 重试一次；仍失败则返回 `failed`，明确提示，不回退到 LLM 猜分 |
| LLM 失败 | 证据和指标照常返回，反馈用模板生成 |
| 重复提交 | 由 `attempt_id` 幂等，返回已有结果，不重复计费 |
| 函数超时 | 先返回证据与指标，LLM 反馈异步补上（前端轮询 `status`）；同时核实 Vercel 函数时长配置 |

### 3.11 阶段与验收

| 阶段 | 周 | 任务 | 验收标准 |
|---|---|---|---|
| 0 建标准 | 1 | 评测集、旧方案基线、发音服务技术验证、现有数据查询 | 评测脚本一条命令跑完；A/B 决定有数据依据 |
| 1 后端链路 | 2–3 | `backend/speech/*`、`/api/ra/analyze`、`speech_analyses` 表 | 构造集上漏读和长停顿定位明显优于旧方案；三类坏录音都返回正确状态；纯函数有单元测试 |
| 2 前端与闭环 | 4 | 结果页逐词标注、回听、建议、重录对比 | 一段录音能完整演示"发现 → 回听 → 重录 → 看到变化" |
| 3 评测报告 | 5 | 新旧对比、延迟/成本/失败率统计、版本记录、CI | `docs/ra-diagnosis-eval.md` 完成 |
| 4 用户试用 | 6–7 | 5–10 人试用，访谈，做一次调整 | 试用记录与调整说明写入文档 |

---

## 4. 评测体系（各轮共用）

### 4.1 目录结构

```
eval/
  speech/
    manifest.json        # 每条样本：id、task_type、question_id、reference_text、
                         # speaker_id、device、source(real|constructed|tts)、split(dev|test)、
                         # labels（错误位置与类型）
    fixtures/            # 语音服务响应的录制结果（JSON），供 CI 回放，不调用付费接口
scripts/
  eval-speech.js         # 读取 manifest，运行链路，输出指标与报告
```

音频文件不进 Git（存 Supabase 私有存储桶或本地忽略目录），`manifest.json` 和 `fixtures/` 进 Git。

### 4.2 样本来源

| 类型 | 做法 | 用途 | 标注方式 |
|---|---|---|---|
| 构造录音 | 照原文朗读，但故意漏读指定词、在指定位置停顿、重复指定词 | 定位准确率、召回率 | 构造时即已知，无需人工打分 |
| TTS 合成 + 剪辑 | 标准朗读后插入静音、截断、叠加噪声 | 异常处理 | 构造时即已知 |
| 真实录音 | 自己、朋友、取得同意的用户录音 | 真实场景下诊断是否成立 | 人工听一遍核对系统标出的问题是否存在 |

规则：

- 按说话人划分开发集和测试集，同一人的录音不能同时出现在两边。
- 阈值和提示词只在开发集上调整。
- 真实录音中抽一部分由两人独立核对，记录人工之间的分歧。
- 不拿整场模考成绩当单条录音的标准答案。

### 4.3 指标

| 维度 | 指标 |
|---|---|
| 问题定位 | 按错误类型分别计算准确率、召回率；时间位置误差 |
| 真实可用性 | 真实录音中，人工确认"确实存在"的比例 |
| 稳定性 | 同一录音重复分析 N 次的结果差异（辅助指标，不单独作为可靠性证据） |
| 异常处理 | 坏录音正确识别率 |
| 成本与性能 | 延迟 P50/P90、失败率、单次成本 |
| 反馈质量 | 引用校验通过率；人工抽查"建议是否具体可执行" |

### 4.4 报告模板（`docs/ra-diagnosis-eval.md`）

1. 评测目的与样本构成
2. 新旧方案在同一测试集上的对比表
3. 做得好的地方
4. 做得不好的地方与原因
5. 关键取舍（例如为什么选 A/B、为什么阈值定在这里）
6. 成本与延迟
7. 下一步

结果有好有坏都如实写，不追求单一漂亮数字。

---

## 5. 第二轮：推广到其他口语题型

### 5.1 RS（复述句子）——复用约八成

- 参考文本 = 题目原句，`align.js`、`features.js`、`evidence.js` 直接复用。
- 差异：RS 更看重完整复述，证据排序侧重漏词和顺序错误。
- 工作量：主要是接入现有 RS 页面、加评测样本。

### 5.2 RL / DI / RTS——复用约一半

这三类是自由表达，没有逐字参考文本：

| 维度 | 做法 |
|---|---|
| 流利度 | `features.js` 照样适用：开口延迟、犹豫、长停顿、语速 |
| 内容 | 仍由 LLM 判断，但输入改为带时间戳的转写和题目信息，要求引用转写原句 |
| 发音 | 只能用无参考文本模式，精度更低，界面如实标注 |
| 现有资产 | `normalize-di-score.js`、`normalize-rts-score.js`、`di-prompt.js`、`rts-prompt.js` 保留，改为接收新的证据输入 |

### 5.3 统一

完成后，所有口语题走同一条链路：`录音 → 质量检查 → 识别 → 对齐/特征 → 证据 → 反馈 → speech_analyses`。`api/score.js` 中口语相关的分支逐步迁出。

---

## 6. 第三轮：学习者错误模型与私教升级

### 6.1 错误分类

| 题型 | 错误类型 | 来源 |
|---|---|---|
| RA / RS | 漏读、替换、重复、句中犹豫、超长停顿、长单词处卡顿、数字读法 | `speech_analyses.evidence` |
| WFD | 漏冠词/介词、复数/时态词形、拼写、整词遗漏 | WFD 逐词比对结果 |
| WE | 字数不足、段落结构、格式问题 | `form-gate-rules.js` |
| DI / RTS / RL | 开口延迟、长停顿、内容覆盖不足 | 第二轮证据 |

### 6.2 数据结构

```sql
-- 每次练习产生的错误事件
create table public.learner_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null,
  question_id text,
  source_id uuid,          -- speech_analyses.id 或 practice_logs.id
  error_type text not null,
  token text,              -- 相关单词或片段
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 按技能聚合的学习者状态
create table public.learner_skill_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_key text not null,       -- 例如 'wfd.article_omission'、'ra.hesitation_long_word'
  recent_error_rate numeric,
  trend text,                    -- improving / stable / worsening
  sample_count integer,
  last_seen_at timestamptz,
  next_review_at timestamptz,
  primary key (user_id, skill_key)
);
```

练习结束后，服务端写入错误事件并更新技能状态。

### 6.3 题目特征标注

离线脚本为题库打标签（确定性规则即可，不需要模型），例如：

- RA：长单词（音节数多）密度、数字个数、句长
- WFD：冠词/介词个数、复数和时态词形个数、长单词个数

推荐时用"用户弱项 × 题目特征"匹配，优先选近期没练过的题。

### 6.4 计划与私教

- `agent-plan-service.js`：从"按题型均分选题型"改为"按技能状态选具体题目"，每题附推荐理由（引用错误事件）。
- 延迟复测：按 1 天 / 3 天 / 7 天安排 `next_review_at`，复测题选相同弱项、未练过的题。
- 私教对话：上下文中加入最主要的 3 个弱项及证据；路由仍以规则为主。只有用户提出开放式查询（例如"我最近 RA 老在哪种词上卡"）时，才考虑增加一个查询工具，不为了"像 Agent"而改架构。

### 6.5 成功标准

- 复测题上，同一弱项的错误率是否下降（对比首次练习，题目难度相近、未练过）。
- 用户是否完成推荐练习和复测。
- 样本量小时只作为方向性观察，不宣称"提分"。

---

## 7. 第四轮：全平台工程与可观测性（伴随进行）

| 项目 | 内容 | 时机 |
|---|---|---|
| 评分版本化 | 所有题型结果记录服务商、规则、提示词、模型版本 | 第一轮起，新链路默认带；旧题型迁移时补 |
| 服务端写库 | 新链路的结果由服务端写入，前端只读 | 第一轮起 |
| 幂等与重试 | 每次提交带 `attempt_id`，重试不重复写、不重复计费 | 第一轮起 |
| 调用日志 | 参照 `agent_usage_logs`，记录所有 AI 调用的耗时、状态、成本 | 第一轮 |
| 简易看板 | 一条 SQL 视图或脚本：延迟分布、失败率、日成本 | 第一轮阶段 3 |
| 单元测试 | 用 Node 自带 `node:test`（不新增依赖）测试 `align`、`features`、`evidence`、`normalize-*-score` | 第一轮起，随写随测 |
| CI | GitHub Actions：运行单元测试 + 用录制的服务响应回放评测 | 第一轮阶段 3 |
| 功能开关 | 新旧链路切换、综合预估分开关 | 第一轮 |

不做：大文件拆分重构、微服务、Kubernetes。

---

## 8. 产品验证

### 8.1 现有数据（第 1 周）

在 Supabase 中查询，作为起点记录：

- 注册用户数、近 30 天活跃用户数
- 各题型练习次数占比
- RA 练习次数、平均每人练习次数
- 7 日留存（首次练习后 7 天内是否再次练习）
- 评分接口的失败率与平均耗时（如日志可得）

### 8.2 埋点

新增一张简单的事件表，记录关键行为：

`practice_started` → `recording_submitted` → `analysis_viewed` → `evidence_played`（回听）→ `rerecord_started` → `rerecord_submitted`

第三轮加：`plan_item_started`、`review_completed`。

用于回答：用户看不看结果、会不会回听、会不会重录。

### 8.3 第一轮试用方案

- 对象：5–10 名正在备考的人。
- 流程：
  1. 第 1 天：做 3 道 RA 作为基线。
  2. 3–5 天内自由使用新版 RA。
  3. 最后一天：做 3 道难度相近、未练过的 RA。
  4. 10 分钟访谈。
- 访谈问题：
  1. 看到结果后，你知道下一步该练什么吗？
  2. 有没有哪条反馈你觉得不对？（让对方回听核对）
  3. 你会因为什么原因不看结果或不重录？
  4. 等待时间能否接受？
  5. 和你用过的其他练习工具比，差别在哪？
- 记录：每条反馈问题、每个放弃原因，整理成"发现 → 调整"的记录。
- 结论只写方向性观察，不宣称普遍提分。

---

## 9. 第五轮：对外呈现

### 9.1 README 重写

1. 一句话产品定位 + 线上地址
2. 演示 GIF / 视频链接
3. 核心问题：为什么不能只靠文字评分
4. 架构图（第 3.3 节）
5. 设计取舍：代码出数、LLM 解释、证据可核验、识别不确定时不下结论
6. 评测结果摘要 + 报告链接
7. 本地运行（保留现有内容）

### 9.2 仓库结构扁平化

仓库已于 2026-10-07 从 `PTE` 改名为 `kai-kou`，应用目录现已在任务 8 分支移至仓库根，待 Claude 审查后与生产设置同步发布：

- 将旧应用子目录下的内容移到仓库根目录，合并根目录与子目录的 `README.md`、`AGENTS.md`、`.gitignore`。
- **同步修改 Vercel 项目的 Root Directory 设置**（待发布时由 `kai-kou` 改为空），否则线上部署会失败。
- 用 `git mv` 保留文件历史；迁移后验证本地 `npm run dev`、`npm run dev:api` 和一次预览部署。

### 9.3 演示视频（2–3 分钟）

读一段 RA → 逐词标注 → 点击回听 → 看建议 → 重录对比 → 简要展示评测报告。

### 9.4 简历描述模板

等评测和试用数据出来后填写，数据未出来之前不写具体数字：

> **录音诊断：** 将 RA 从"浏览器转写 + LLM 打分"重构为"录音对齐 + 时序特征 + 证据约束的 LLM 反馈"，每条反馈可定位到原文和录音片段；在 [N] 条构造与真实录音上，漏读定位召回率 [X]、长停顿定位准确率 [Y]，单次分析 P90 延迟 [Z] 秒。
>
> **效果验证：** [N] 名备考者试用 [D] 天，[发现的问题] → [做出的调整] → [观察到的变化]。

同时修改现有"跨会话记忆的 AI 私教 Agent"措辞：第三轮完成前，如实描述为"读取练习数据生成建议与每日计划的 AI 私教"。

---

## 10. 不做清单

| 不做 | 原因 |
|---|---|
| 新增题型、模板库 | 增加功能数量，不提升可信度 |
| 换更大的模型 | 输入里没有声音证据，换模型解决不了根本问题 |
| 为了"有 RAG"加知识库 | 当前问题与检索无关 |
| 多 Agent、全面工具调用 | 规则能稳定完成的事不需要；只在开放查询处按需引入 |
| 重构 3000–5000 行的 Vue 文件 | 用户和面试官都看不到，仅在功能需要时局部改 |
| 开通支付 | 支付接口已归档到 `archived-api/`，资金与合规风险不值得 |
| 没有评测就反复调提示词和阈值 | 无法判断改好还是改坏 |
| 宣称"PTE 官方分"或预设准确率目标 | 不诚实，也经不起追问 |

---

## 11. 风险与应对

| 风险 | 应对 |
|---|---|
| 语音服务成本高或国内访问不稳 | 阶段 0 实测；不行选方案 A 或更换服务商；适配层保证可替换 |
| Vercel 函数超时 | 先返回证据与指标，LLM 反馈异步补；核实并配置函数时长 |
| 识别错误被当成用户错误 | 低置信度标"不确定"；评测中单独统计这类误报 |
| Safari / 部分设备录音格式差异 | 前端统一转 WAV；评测集覆盖不同设备 |
| 评测样本太少 | 构造录音可低成本扩充；结论如实标注样本量 |
| 用户隐私 | 录音存私有桶；评测使用他人录音需事先取得同意；可删除 |
| 进度拖延 | 砍掉"单句重录练习"和第二轮；主线做到阶段 3 即有完整成果 |
| 陷入反复调参 | 每次调整必须跑评测并记录结果；没有评测支持的改动不合入 |

---

## 12. 时间表

| 周 | 日期 | 内容 |
|---|---|---|
| 1 | 10/08 – 10/14 | 阶段 0：评测集、旧方案基线、发音服务验证（决定 A/B）、现有数据查询 |
| 2 | 10/15 – 10/21 | 阶段 1：WAV 导出、音频质量检查、语音服务适配、`align.js` + 单元测试 |
| 3 | 10/22 – 10/28 | 阶段 1：`features.js`、`evidence.js`、`feedback.js`、`/api/ra/analyze`、`speech_analyses` 表 |
| 4 | 10/29 – 11/04 | 阶段 2：结果页逐词标注、回听、建议、重录对比；埋点 |
| 5 | 11/05 – 11/11 | 阶段 3：评测报告、版本记录、调用日志、CI；README 与演示视频 |
| 6 | 11/12 – 11/18 | 阶段 4：用户试用 |
| 7 | 11/19 – 11/25 | 阶段 4：访谈整理、一次调整、更新简历；有余力启动 RS |
| 入职后 | — | 第二轮其余题型、第三轮学习者模型与私教 |

---

## 13. 进度追踪

### 第一轮
- [ ] 评测集目录与 `manifest.json` 格式
- [ ] 构造录音 ≥ 30 条，TTS 异常样本 ≥ 10 条，真实录音 ≥ 15 条
- [ ] 旧方案基线报告
- [ ] 发音服务技术验证，A/B 决定并记录理由
- [ ] 现有用户数据记录
- [ ] 前端 WAV 导出
- [ ] `backend/speech/` 各模块及单元测试
- [ ] `/api/ra/analyze` 与 `speech_analyses` 表
- [ ] 结果页逐词标注、回听、建议、重录对比
- [ ] 埋点
- [ ] 评测报告 `docs/ra-diagnosis-eval.md`
- [ ] CI
- [ ] 用户试用与调整记录

### 第二轮
- [ ] RS 接入
- [ ] RL / DI / RTS 接入
- [ ] `api/score.js` 口语分支迁出

### 第三轮
- [ ] 错误事件与技能状态表
- [ ] 题库特征标注脚本
- [ ] 计划按技能选题 + 推荐理由
- [ ] 延迟复测
- [ ] 私教上下文接入弱项证据

### 第五轮
- [ ] 仓库结构扁平化（`` 移到根目录 + 改 Vercel Root Directory）
- [ ] README 重写
- [ ] 演示视频
- [ ] 简历更新
