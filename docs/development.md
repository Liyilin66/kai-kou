# 开发与部署

README 只放项目说明。本地开发、环境变量、数据库和部署的细节都在这一页。

## 本地运行

```bash
npm install
npm run dev        # 前端（Vite），默认 http://localhost:5173
npm run dev:api    # 本地 API 服务（server.js），默认端口 3000
npm test           # 全部 node:test 测试
```

需要评分的题型（RA、RS、RL、RTS、WE）要求前端和本地 API 同时运行。出现 `Score API failed with status 404` 时，通常是 `/api` 被代理到了别的服务，可以用下面的命令检查：

```bash
npm run check:score-api
```

端口 3000 被占用时，在 `.env` 里改成 3001：

```bash
API_PORT=3001
VITE_DEV_API_TARGET=http://localhost:3001
VITE_API_BASE=
```

`VITE_API_BASE` 只在本地调试时使用；预览和生产环境必须留空，不能指向 localhost。

`ffmpeg` 只有评测脚本需要（`scripts/eval-run-provider.js`、`scripts/eval-build-labeling-kit.js`），应用本身不依赖。

## 环境变量

以 `.env.example` 为模板，在仓库根目录建一个 `.env.local`（或 `.env.development.local`）。

- 前端只读取 `VITE_*` 变量，这些值会打包进浏览器代码，**不能放任何密钥**。
- 本地 API 服务读取 `.env`、`.env.local`、`.env.development`、`.env.development.local`。
- Vercel 上的接口读取项目设置里的环境变量。

| 变量 | 位置 | 用途 |
|---|---|---|
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` | 前端 | Supabase 客户端 |
| `VITE_RA_DIAGNOSIS`、`VITE_RS_DIAGNOSIS` | 前端 | RA、RS 录音诊断开关（`on` / `off`） |
| `VITE_ENABLE_DI` | 前端 | DI 题型开关；生产环境关闭 |
| `VITE_APP_URL`、`VITE_ADMIN_CONTACT_EMAIL` | 前端 | 站点地址、联系邮箱 |
| `VITE_API_BASE`、`VITE_DEV_API_TARGET`、`API_PORT` | 前端 / 本地 | 本地 API 地址与代理 |
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | 服务端 | 服务端写库（诊断结果、注册、订单） |
| `GROQ_API_KEY` | 服务端 | Whisper 转写；同时是评分 LLM 的备用模型 |
| `GEMINI_API_KEY` | 服务端 | 评分 LLM 主模型 |
| `LLM_GROQ_MODEL`、`LLM_PRIMARY_TIMEOUT_MS`、`LLM_FALLBACK_TIMEOUT_MS` | 服务端 | 备用模型名与超时 |
| `AGENT_OPENAI_BASE_URL`、`AGENT_OPENAI_API_KEY` | 服务端 | AI 私教使用的 OpenAI 兼容接口 |
| `BREVO_API_KEY`、`REGISTER_OTP_FROM_EMAIL`、`REGISTER_OTP_FROM_NAME` | 服务端 | 注册验证码邮件 |
| `SITE_URL`、`ALIPAY_*` | 服务端 | 支付宝会员支付（当前暂停） |
| `CRON_SECRET` | 服务端 | 每日健康检查（数据库保活）的鉴权 |

服务端变量一律不能改名为 `VITE_*`。`GROP_API_KEY` 是历史拼写错误，只为兼容保留，新配置请用 `GROQ_API_KEY`。

## 评分模型主备切换

只作用于旧评分接口 `/api/score`（RL、RTS、WE 等仍走"识别文字 + LLM"评分的题型）。RA、RS 的录音诊断不经过 LLM 打分。

- 主模型 Gemini，备用 Groq，前端请求格式不变。
- 以下情况切到备用：超时；网络错误（如 `fetch failed`、`ETIMEDOUT`、`ECONNRESET`、`ENOTFOUND`）；除下一条以外的所有 HTTP 错误，包括 401、402、403、404、429 和 5xx。规则见 `backend/llm/provider-error.js`。
- 以下情况**不**切换：HTTP 400、413、422（请求本身有问题，换模型也一样）；提示词构造或本地代码错误；JSON 解析或归一化错误。

本地验证：把 `LLM_PRIMARY_TIMEOUT_MS` 临时设为 `1` 强制主模型超时，提交一次评分，返回里应有 `provider_used: "groq"` 和非空的 `fallback_reason`。

## 数据库

在 Supabase SQL Editor 执行。先建基础表（`db/schema.sql` 是早期版本，已不对应线上结构，不要用）：

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

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own logs" ON practice_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own logs" ON practice_logs FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

然后执行 `db/` 下的功能脚本。录音诊断相关：

| 脚本 | 内容 |
|---|---|
| `speech-analyses.sql` | 诊断结果表与服务端写入函数 |
| `ra-practice-audio.sql` | 练习录音私有存储桶与读写权限 |
| `ra-feedback.sql` | 练习建议的存储 |
| `ra-reference-scores.sql` | 参考分写入与历史回填 |
| `rs-diagnosis.sql` | 诊断扩展到 RS |
| `practice-events.sql` | 试用行为事件 |

其余脚本对应注册验证码、头像、AI 私教记忆、会员支付（`alipay-vip-billing.sql`）等功能，按需执行。

## 部署（Vercel）

- `main` 分支推送即自动部署生产环境，仓库根目录就是部署根目录。
- 日常开发在 `lyl` 分支；改动线上行为的提交须经独立审查后才合并 `main`（见 `AGENTS.md` 的 Release Gate）。
- 环境变量在 Vercel 项目设置中分别配置 Production 和 Preview；修改后需要重新部署。
- `vercel.json` 配置了每天一次的健康检查（Vercel Cron），防止 Supabase 免费项目因无活动被暂停。

部署后检查：首页能打开；注册能收到验证码；手机上 RA 能请求麦克风权限；录音提交后结果页显示诊断结果。

## WFD 音频

WFD 音频的生成和上传流程见 `docs/wfd/audio-workflow.md`。生成的音频、表格和运行报告只留在本地，不提交。
