# 任务 4：RA 录音诊断核心（离线可评测）

- 日期：2026-10-08
- 分支：`lyl`（本任务不接入线上页面和接口；按发布规则审查后合并）
- 关联：`docs/improvement-plan.md` 第 3.3–3.6、3.10 节；方案 A 决定与实测见第 3.6 节
- 预计工作量：中

## 目标

在**不改线上**的前提下，把"录音 → 识别 → 对齐 → 停顿与语速 → 证据"这条链路做出来，并能在评测集上跑出结果，与浏览器识别基线对比。界面和线上接口放到下一个任务。

## 已确定的事实（2026-10-08 实测，见计划 3.6 节）

- Groq `whisper-large-v3`：直接接受 webm，约 0.7 秒返回，`verbose_json` + `timestamp_granularities[]=word` 返回词级时间戳。
- **Whisper 的词时间戳会把停顿吸收进相邻词**，词间几乎没有空隙。停顿必须用**音频能量**检测。
- `whisper-large-v3-turbo` 准确度较差，不用。

## 交付

### 1. `backend/speech/providers/groq-whisper.js`

```js
export async function transcribeWithGroqWhisper({ audio, filename, mimeType, prompt } = {})
// audio: Buffer | Blob
// → { words: [{ text, start_ms, end_ms, confidence: null }], text, duration_ms,
//     provider: 'groq', model: 'whisper-large-v3', latency_ms }
```

- 参数：`model=whisper-large-v3`、`response_format=verbose_json`、`timestamp_granularities[]=word`、`temperature=0`、`language=en`。
- **不要把 RA 原文作为 `prompt` 传入。** 这样会让识别结果向原文靠拢，掩盖漏读和读错，等于自己骗自己。
- `prompt` 参数保留为可选项，默认不传。用于后面实验"带口语化提示能否让 Whisper 保留 um/uh 和重复"——是否启用由评测结果决定。
- 错误处理复用 `backend/llm/provider-error.js` 的 `createProviderError` / `toProviderError`（provider 名 `groq_whisper`），超时默认 15 秒，可用 `SPEECH_GROQ_TIMEOUT_MS` 覆盖。
- 使用现有 `GROQ_API_KEY`，不新增环境变量名（超时除外）。

### 2. `backend/speech/silence.js`（纯函数）

```js
export function detectSilences(samples, sampleRate, options = {})
// samples: Float32Array 单声道 PCM（-1..1）
// → { silences: [{ start_ms, end_ms }], speech_onset_ms, speech_offset_ms, noise_floor_db, speech_level_db }
```

- 按 20 毫秒分帧算 RMS（dB）。
- **自适应阈值**：噪声底 = 帧能量第 10 百分位，语音电平 = 第 90 百分位，阈值 = 噪声底 + 0.3 ×（语音电平 − 噪声底）。不同手机、不同环境音量差异很大，不能写死分贝值。
- 低于阈值且连续不短于 `minSilenceMs`（默认 250）的区间记为静音；开头和结尾的静音单独给出 `speech_onset_ms` / `speech_offset_ms`，不放进 `silences`。
- 这个函数之后也会在浏览器端用（Web Audio 解码后调用），所以**不能依赖 Node API**。

### 3. `backend/speech/features.js`（纯函数）

```js
export function extractFeatures({ alignment, silences, speech_onset_ms, speech_offset_ms, referenceText })
// → { pauses: [...], metrics: {...} }
```

- **停顿定位**：把每段静音映射到它中点所在的词边界（第 i 个词与第 i+1 个词之间；Whisper 时间戳偏差用"最近的边界"处理）。
- 停顿分类（阈值放在 `config.js`，带 `RULES_VERSION`）：
  - 位于原文标点处且短于 1.2 秒 → `natural`（不算问题）
  - 不在标点处且 ≥ 0.5 秒 → `hesitation`
  - 任意位置 ≥ 2.0 秒 → `long_pause`
- 指标：`speech_onset_ms`（开口延迟）、`wpm`（有效词数 / 发声总时长）、`articulation_wpm`（去掉静音后）、`speech_ratio`、`hesitation_count`、`long_pause_count`、`completeness`（来自对齐）。

### 4. `backend/speech/evidence.js`（纯函数）

- 输入对齐结果和停顿，输出带编号的证据列表，格式见计划 3.5 节（`id`、`type`、`ref_span`、`text`、`time_ms`、`detail`、`severity`）。
- 证据类型：`omission`、`substitution`、`repetition`、`insertion`、`hesitation`、`long_pause`、`late_start`。
- `substitution` 的描述固定为"可能读错或识别不清"，**不使用"发音错误"字样**（方案 A 不评发音）。`homophone`、`low_confidence` 标签不产生证据。
- 按严重程度、再按出现位置排序。

### 5. `backend/speech/config.js`

集中放所有阈值和 `RULES_VERSION = 'ra-diag-0.1'`。

### 6. 评测接入

- 新增 `scripts/eval-run-provider.js`：对 `manifest.json` 中每条有录音的样本：
  1. 调用 Groq Whisper，结果缓存到 `eval/speech/cache/<id>.groq_whisper.json`（不进 Git），已有缓存时不重复调用；
  2. 用本机 `ffmpeg` 把录音解码为 16k 单声道 PCM，调用 `detectSilences`；
  3. 写回 `manifest.json` 的 `hypotheses.groq_whisper`：`{ text, words, silences, speech_onset_ms, speech_offset_ms, model, rules_version }`。
- `ffmpeg` 只作为**本机开发工具**（`brew install ffmpeg`），不加入项目依赖。脚本检测不到时给出安装提示并退出。
- 修改 `scripts/eval-speech.js`：当识别结果带 `words` 和 `silences` 时，用 `features.js` 产出 `hesitation` / `long_pause` 预测，参与评测；浏览器基线保持原逻辑。
- `eval-speech.js` 增加 `--compare browser_asr,groq_whisper`：在同一批已标注样本上并排输出两种识别的各类指标。
- `.gitignore` 增加 `eval/speech/cache/`。

## 不做

- 不改 RA 页面、`/api/score`、结果页；不新增线上接口。
- 不接 LLM 反馈（下一个任务）。
- 不新增依赖。

## 测试

`tests/speech/` 下新增，全部离线：

| 文件 | 至少覆盖 |
|---|---|
| `silence.test.js` | 用代码生成的 PCM（正弦波语音段 + 指定长度静音 + 低噪声）：静音区间检出误差 ≤ 40 毫秒；整体音量放大或缩小 20 dB 时结果不变；短于 `minSilenceMs` 的空隙不算；全静音和全语音两种极端输入不报错 |
| `features.test.js` | 静音在标点处 → natural；句中 0.8 秒 → hesitation；2.5 秒 → long_pause；静音中点落在 Whisper 拉长的词内部时，仍映射到正确的词边界；指标计算正确 |
| `evidence.test.js` | 类型映射、排序、homophone 不产生证据、substitution 文案不含"发音错误" |
| `groq-whisper.test.js` | 模拟 `fetch`：请求参数正确且**不包含原文 prompt**；返回解析为统一格式；429 / 401 / 超时转为 ProviderError |

## 验收标准

1. `npm test`、`npm run build` 通过；不新增依赖。
2. 用户本机安装 `ffmpeg` 后，`node scripts/eval-run-provider.js` 在当前 7 条真实样本上跑通，产出缓存和 `groq_whisper` 结果。
3. 抽查 `ra-real-0001`：开头静音和句末停顿被检出；`ra-real-0001` 的 Whisper 文本与计划 3.6 节记录一致。
4. 用户录完 10 条构造样本后，`node scripts/eval-speech.js --compare browser_asr,groq_whisper` 输出对比表——这就是第一轮的第一份正式对比数据。
5. diff 只涉及上述文件。

## 交付说明需附

- 7 条真实样本上 Groq 调用的平均与最大延迟。
- `ra-real-0001` 检出的停顿列表（时间、位置、分类）。

## 实施与验收记录（2026-10-08）

- [x] 本机 Homebrew/ffmpeg 可用，ffmpeg 9.0.2；仅作为本机开发工具，未增加项目依赖。
- [x] Groq Whisper 适配、能量静音检测、停顿与语速、证据与版本化规则完成；不修改线上页面或接口，不接 LLM。
- [x] 7 条真实录音全部识别、解码成功；词级结果写入清单，响应缓存与录音不进 Git。
- [x] 重复运行 7 条全部命中内容哈希绑定的缓存，没有再次调用 Groq。
- [x] 全项目 195 项测试、构建通过；比较命令可运行，浏览器转写不推断停顿。
- [ ] 10 条构造样本录制及人工确认后生成正式对比指标。目前只有 7 条未标注样本，Precision/Recall 均为 N/A，不能据此宣称准确度提升。
- [ ] 独立 Claude 审查，用户确认后才允许合并 main。

### 真实调用耗时

| 样本 | 首次 Groq 耗时（ms） |
| --- | ---: |
| ra-real-0001 | 728 |
| ra-real-0002 | 661 |
| ra-real-0003 | 949 |
| ra-real-0004 | 643 |
| ra-real-0005 | 762 |
| ra-real-0006 | 646 |
| ra-real-0007 | 844 |

平均 **747.6ms**，最大 **949ms**。仅为识别请求耗时，不包括本机 ffmpeg 解码、特征计算和报告生成。缓存命中输出保留原调用耗时，不将其冒充本次网络延迟。

### ra-real-0001 抽查

- 开头无声 0–0.800s；语音结束 27.320s；录音总长 27.740s，尾部无声 27.320–27.740s。
- 14.000–14.280s：`ago` 后，280ms，natural（标点边界）。
- 21.120–21.480s：最近边界为 `between` 后，360ms，short_pause（未达到犹豫阈值）。
- 24.160–24.780s：最近边界为 `spices` 后，620ms，natural（标点边界）。
- 本条未检测到达到阈值的 hesitation 或 long_pause。
- Whisper 识别出 known、water first、sea trade、became、when、sailing boats；输出 `5000`、`traveled`，尾部为 `specious performs`。与计划中的描述一致：spices/perfumes 仍未正确识别，但不因此断言发音错误。

时间位置是能量区间与最近识别词边界的算法定位，尚未完成人工逐段回听校准。恒定非零噪声与连续发声仅靠能量无法区分；默认保守处理。`late_start` 初始阈值 3000ms 是开发规则，不是 PTE 自动结束录音规则。

运行（在  下）：

```bash
node scripts/eval-run-provider.js
node scripts/eval-speech.js --compare browser_asr,groq_whisper
```

报告写入 `output/eval/`，缓存位于 `eval/speech/cache/`，两者均被忽略。首次运行调用已有 Groq 配置；之后录音内容和模型不变时复用缓存。
