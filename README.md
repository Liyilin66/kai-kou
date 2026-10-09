# 开口（Kai-Kou）

[![Test and build](https://github.com/Liyilin66/kai-kou/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/Liyilin66/kai-kou/actions/workflows/test.yml)

> Kai-Kou is a PTE Academic speaking practice app that diagnoses Read Aloud recordings word by word, with every flagged issue linked back to the audio so learners can verify it.

开口是一个 PTE 口语练习平台。RA（朗读）题基于**真实录音**逐词诊断，每个标出的问题都能点击回听核验。

线上地址：<https://www.yli.cc.cd>

<p align="center">
  <img src="docs/images/ra-diagnosis-result-mobile.png" width="320" alt="RA 诊断结果页（手机）：指标卡、练习建议、原文逐词标注与可回听证据">
</p>
<p align="center"><sub>RA_024 一条真实录音的诊断结果：指标 → 练习建议 → 原文标注 → 可回听证据。截图由当前代码在本地渲染，不含账号信息。</sub></p>

## 问题：文字评分看不到声音

旧方案是"浏览器语音识别 → LLM 读识别文字打分"。模型看不到停顿和发音，只能根据一段可能已经出错的文字推测。

- **同一段录音，结论差很多。** RA_023 的同一条录音：浏览器识别的完整度 84%、标出 9 处问题；Groq Whisper 识别完整度 98%、标出 1 处。旧方案据浏览器文字给出内容分 58。
- **分数随模型变化。** 同水平的朗读，因主备模型不同，总分相差约 20 分（6 次练习的观察，样本很小，仅作现象记录）。

问题不在提示词，而在输入：分数缺少可以核验的依据。

## 方案：代码出证据，用户回听核验

```mermaid
flowchart LR
    A["录音"] --> B["浏览器端<br/>能量检测停顿"]
    B --> C["上传私有存储<br/>Supabase Storage"]
    C --> D["Groq Whisper<br/>词级时间戳"]
    D --> E["与原文逐词对齐<br/>数字 / 同音词 / 复合词 / 英美拼写归一化"]
    E --> F["停顿分类与语速"]
    F --> G["证据列表<br/>原文位置 + 录音时间段"]
    G --> H["结果页标注<br/>点击回听"]
    H --> I["重录同一题<br/>与上次对比"]
```

每条证据记录原文位置、识别到的词和录音时间段。结果页上的标注、练习建议和"可回听的证据"都指向同一组编号，点击即跳到对应录音片段。

## 设计取舍

- **代码负责判断，模型不打分。** 对齐、停顿、语速、问题类型都由确定性代码计算。诊断页不再展示发音分和 10–90 总分：没有可靠依据的数字，宁可不给。
- **识别不确定时不下结论。** 同音词、低置信度的位置不算用户错误。替换类问题只写"可能读错或识别不清，请回听"，因为"识别结果不同"不等于"用户读错"（评测中 Whisper 的 2 处误报正是这种情况）。
- **选通用识别（方案 A），而不是按原文做发音评估。** 通用识别成本和外部依赖更低，接入快。代价是识别模型会按语境"纠正"读错的词，文本对齐就看不到这些问题，评测中的低召回率正来自这里。
- **停顿改由音频能量检测。** Whisper 的词级时间戳会把停顿吸收进相邻词的时长，按时间戳算停顿不可靠。因此停顿和开口延迟在浏览器端按音频能量计算，再与词对齐结果合并。
- **LLM 练习建议按预定规则退回模板。** 先定好门槛（首次通过率 ≥ 80%，最终 ≥ 95%，与模板相同 ≤ 20%），连续 3 轮评测未达标：最终通过率 33%，与模板相同的建议 78%。按事先约定改为由证据直接生成的确定性模板；模型生成和校验代码保留，可随时重新评测。

## 评测：浏览器识别 vs Whisper

7 条真实 RA 录音、48 个人工听音确认的明确位置；"报错"指原文位置被文本对齐标记为有问题。

| 识别来源 | 报错精确率 Precision | 召回率 Recall | 误报 FP | 位置准确率 Accuracy |
|---|---:|---:|---:|---:|
| 浏览器 Web Speech API | 27.7%（13/47） | 100.0%（13/13） | 34 | 29.2%（14/48） |
| Groq Whisper large-v3 | 71.4%（5/7） | 38.5%（5/13） | 2 | 79.2%（38/48） |

**结论：** 误报 34 → 2，精确率 27.7% → 71.4%。召回率只有 38.5%：漏报的 8 处，Whisper 转写都与原文相同，文本对齐无法发现。

**局限：** 只有 1 位说话人、48 个位置；候选位置由两套识别结果挑出，会富集浏览器的错误，表中数字不是全文词准确率，也不能推广到其他用户。完整口径、逐样本数据和漏报分析见 [RA 诊断评测报告](docs/ra-diagnosis-eval.md)。

**停顿检测：** 在 5 条混合构造录音上，合并“犹豫／长停顿”后命中 4/5 个脚本停顿（召回率 **80%**）；另有 9 次未匹配脚本的停顿待听音核验，尚不能报告最终误报数或精确率。该结果来自音频能量与词位对齐链路，样本仅一位说话人。[评测口径与结果](docs/ra-diagnosis-eval.md)

## 工程

- **模型主备切换：** 修复切换规则，主模型 401 / 402 / 403 / 404 / 500 都会切到备用，此前欠费（402）会直接失败。
- **结果服务端写库：** 诊断结果由服务端保存，`attempt_id` 作幂等键，重复提交直接返回已有结果，不重复调用识别服务。
- **版本记录：** 每条结果记录识别模型、诊断规则版本和反馈版本，历史结果可解释、新旧方案可对比。
- **发布流程：** 新诊断由功能开关控制，先在 Vercel 预览部署用真实录音验收，再经独立审查后合并 `main` 上线。
- **CI 双构建：** GitHub Actions 运行全部测试，并分别在功能开关开、关两种状态下构建。
- **数据库保活：** Vercel Cron 每天调用健康检查做一次轻量查询，防止 Supabase 免费项目因无活动被暂停。

## 技术栈

Vue 3 · Vite · Tailwind CSS · Vercel Serverless · Supabase（Postgres / Storage / RLS）· Groq Whisper · Node `node:test`

## 局限与下一步

- **召回率偏低** → 引入按原文的发音评估，捕捉被识别模型"纠正"掉的问题。
- **只覆盖 RA** → 推广到 RS / DI / RTS。
- **建议还不针对个人** → 建立学习者错误模型，按反复出现的问题安排练习和复测。

## 本地运行

```bash
npm install
npm run dev
npm run dev:api
npm test
```

`ffmpeg` 只有评测脚本需要（`scripts/eval-run-provider.js`、`scripts/eval-build-labeling-kit.js`），应用本身不依赖。

### 仓库结构

```text
src/          前端路由、页面、状态和组件
api/          Vercel Serverless 接口
backend/      后端服务、评分与语音诊断逻辑
db/           数据库 SQL
seeds/        种子数据
scripts/      运维与评测脚本
tests/        node:test 测试
docs/         方案、评测报告和任务记录
```

以下目录只在本地使用，不提交：`.agents/`、`.claude/`、`.codex/`、`.omx/`、`.omc/`、`output/`、`wfd/`、`dist/`、`node_modules/`。

## 开发与部署细节

### Local Development

```bash
npm install
npm run dev
npm run dev:api
```

`WE/RA/RS/RL` scoring needs both the Vite app and local API service running at the same time.
If you see `Score API failed with status 404`, it usually means `/api/score` was proxied to a different app.

### Environment Variables

Create one local env file in project root, for example `.env.local` or `.env.development.local`.

- Vite frontend reads public `VITE_*` variables from these files.
- The local Node API server (`npm run dev:api`) now reads `.env`, `.env.local`, `.env.development`, and `.env.development.local`.
- Vercel serverless API routes read `process.env` from the Vercel project settings.

Example:

```bash
GEMINI_API_KEY=your_real_gemini_api_key
GROQ_API_KEY=your_real_groq_api_key
LLM_GROQ_MODEL=openai/gpt-oss-120b
LLM_PRIMARY_TIMEOUT_MS=8000
LLM_FALLBACK_TIMEOUT_MS=8000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_APP_URL=http://localhost:5173
VITE_ADMIN_CONTACT_EMAIL=admin@example.com
VITE_API_BASE=
VITE_DEV_API_TARGET=http://localhost:3000
API_PORT=3000

# Server-only register / verification env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_real_supabase_service_role_key
SITE_URL=https://your-app-domain.example.com
ALIPAY_APP_ID=your_alipay_app_id
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do
ALIPAY_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
ALIPAY_SELLER_ID=your_alipay_seller_id
ALIPAY_TIMEOUT_EXPRESS=15m
BREVO_API_KEY=your_real_brevo_api_key
REGISTER_OTP_FROM_EMAIL=noreply@your-domain.com
# Optional, defaults to "开口"
REGISTER_OTP_FROM_NAME=开口
```

You can use `.env.example` as a template.

#### Local API Routing Checks

```bash
npm run check:score-api
```

If port `3000` is occupied by another project, switch to `3001`:

```bash
# .env
API_PORT=3001
VITE_DEV_API_TARGET=http://localhost:3001
# Keep this empty for public/preview/production builds
VITE_API_BASE=
```

For production/preview deployment, do not set `VITE_API_BASE` to any localhost address.

### LLM Fallback Architecture (Scoring API)

#### Strategy

- Primary provider: `Gemini`
- Fallback provider: `Groq`
- Fallback only applies in backend scoring flow (`/api/score`)
- Frontend request protocol remains unchanged

#### Fallback Trigger Rules

Gemini falls back to Groq for timeouts, provider network errors (e.g. `fetch failed`, `ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`), and every HTTP error status except the request-shape errors below — including `401` / `402` / `403` / `404` / `429` / `5xx` (see `backend/llm/provider-error.js`).

The following do **not** trigger fallback:

1. HTTP `400` / `413` / `422`
2. prompt construction/local code errors
3. JSON parse/normalize errors

#### Scoring LLM Environment Variables

Server-side only (never expose to frontend):

- `GEMINI_API_KEY`: required, primary provider key
- `GROQ_API_KEY`: recommended Groq key name
- `LLM_GROQ_MODEL`: default `openai/gpt-oss-120b`
- `LLM_PRIMARY_TIMEOUT_MS`: Gemini timeout (ms), default `8000`
- `LLM_FALLBACK_TIMEOUT_MS`: Groq timeout (ms), default `8000`

Compatibility note:

- `GROP_API_KEY` is a legacy typo and is only kept for compatibility.
- New setup should always use `GROQ_API_KEY`.

#### Register / Email Verification Environment Variables

Server-side only:

- `SUPABASE_URL`: required by `POST /api/auth/send-register-code` and `POST /api/auth/register-with-code`
- `SUPABASE_SERVICE_ROLE_KEY`: required by `POST /api/auth/send-register-code` and `POST /api/auth/register-with-code`
- `BREVO_API_KEY`: required by `POST /api/auth/send-register-code`
- `REGISTER_OTP_FROM_EMAIL`: required by `POST /api/auth/send-register-code`
- `REGISTER_OTP_FROM_NAME`: optional display name for the sender, defaults to `开口`

Do not put `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, or `REGISTER_OTP_FROM_EMAIL` into any `VITE_*` variable.

#### Billing / Alipay Environment Variables

Server-side only:

- `SITE_URL`: public app base URL used to build `notify_url` and `return_url`
- `ALIPAY_APP_ID`: Alipay Open Platform app id
- `ALIPAY_GATEWAY_URL`: production or sandbox gateway URL for the current environment
- `ALIPAY_APP_PRIVATE_KEY`: merchant app private key in PEM format
- `ALIPAY_PUBLIC_KEY`: Alipay public key in PEM format
- `ALIPAY_SELLER_ID`: expected seller id for notify/query verification
- `ALIPAY_TIMEOUT_EXPRESS`: order timeout, defaults to `15m`

For billing routes, the browser bearer token is only used to identify the current user.
All order writes, profile updates, and SQL RPC calls use `SUPABASE_SERVICE_ROLE_KEY` on the server.

#### Local Verification

1. Start app and API:
   - `npm run dev`
   - `npm run dev:api`
   - `npm run check:score-api` (expect route reachable or `401` JSON without token)
2. Verify Gemini normal path:
   - keep valid `GEMINI_API_KEY`
   - submit RA/RL/RS scoring request
   - expect response includes `provider_used: "gemini"` and `fallback_reason: null`
3. Verify fallback path:
   - keep valid `GROQ_API_KEY`
   - temporarily set `LLM_PRIMARY_TIMEOUT_MS=1` to force primary timeout
   - submit scoring request again
   - expect `provider_used: "groq"` and non-null `fallback_reason`
4. Verify parse error does not fallback:
   - run a controlled dev-only test that makes model output invalid JSON
   - ensure error stage is parse/normalize and no additional fallback is attempted

#### Preview Verification (Vercel)

1. Configure env vars in Vercel for `Preview`:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `LLM_GROQ_MODEL`
   - `LLM_PRIMARY_TIMEOUT_MS`
   - `LLM_FALLBACK_TIMEOUT_MS`
2. Deploy Preview.
3. Run one normal scoring request and confirm `provider_used: "gemini"`.
4. Temporarily reduce `LLM_PRIMARY_TIMEOUT_MS` in Preview and redeploy.
5. Re-test scoring and confirm fallback to Groq.
6. Check runtime logs for fallback fields: `provider_used`, `fallback_reason`, `raw_error_type`, `latency_*`.

### WFD Audio Workflow

WFD audio generation and upload notes live in `docs/wfd/audio-workflow.md`.
Generated WFD audio, exported workbooks, and run reports are local artifacts and should not be committed.

### Supabase Setup

Run these SQL statements in Supabase SQL Editor:

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_since TIMESTAMPTZ,
  trial_days INTEGER DEFAULT 0,
  trial_granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE practice_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  question_id TEXT NOT NULL,
  transcript TEXT,
  score_json JSONB,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own logs"
  ON practice_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own logs"
  ON practice_logs FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

If `profiles` already exists, run:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_granted_at TIMESTAMPTZ;
```

For the Alipay VIP billing flow, also run the SQL in:

- `db/alipay-vip-billing.sql`

That file creates `vip_orders`, adds the timed VIP profile fields, and installs the RPC functions used for:

- payment confirmation + entitlement grant idempotency
- order query throttling

### Deploy to Vercel

1. Install and log in:

```bash
npm install -g vercel
vercel login
```

1. Deploy from project root:

```bash
vercel
```

1. In Vercel project settings, add environment variables:

- `GEMINI_API_KEY` (Production + Preview + Development)
- `GROQ_API_KEY` (Production + Preview + Development)
- `LLM_GROQ_MODEL` (Production + Preview + Development)
- `LLM_PRIMARY_TIMEOUT_MS` (Production + Preview + Development)
- `LLM_FALLBACK_TIMEOUT_MS` (Production + Preview + Development)
- `VITE_SUPABASE_URL` (Production + Preview + Development)
- `VITE_SUPABASE_ANON_KEY` (Production + Preview + Development)
- `VITE_ADMIN_CONTACT_EMAIL` (optional, Production + Preview + Development)
- `SUPABASE_URL` (Production + Preview + Development)
- `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview + Development)
- `SITE_URL` (Production + Preview + Development)
- `ALIPAY_APP_ID` (Production + Preview + Development)
- `ALIPAY_GATEWAY_URL` (Production + Preview + Development)
- `ALIPAY_APP_PRIVATE_KEY` (Production + Preview + Development)
- `ALIPAY_PUBLIC_KEY` (Production + Preview + Development)
- `ALIPAY_SELLER_ID` (Production + Preview + Development)
- `ALIPAY_TIMEOUT_EXPRESS` (Production + Preview + Development)
- `BREVO_API_KEY` (Production + Preview + Development)
- `REGISTER_OTP_FROM_EMAIL` (Production + Preview + Development)
- `REGISTER_OTP_FROM_NAME` (optional, Production + Preview + Development)

1. Redeploy after saving env vars.

### Verify After Deployment

- Home page loads correctly.
- Register can receive confirmation email and sign in successfully.
- Login page has "忘记密码"入口 and reset flow works.
- `/ra` can request microphone permission on mobile.
- After recording and submit, result page shows real AI scoring output.
