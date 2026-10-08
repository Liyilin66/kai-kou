# Kai-Kou（开口）

Kai-Kou (开口) is an AI practice platform for the PTE Academic speaking and writing tasks.

## Main App

The product source lives at the repository root.

```bash
npm install
npm run dev
```

For the local scoring API:

```bash
npm run dev:api
```

App setup, environment variables, deployment notes and verification steps follow below.

## Repository Layout

```text
src/          Frontend routes, views, stores, and components
api/          Vercel serverless API entrypoints
backend/      Shared backend services and scoring logic
db/           Database SQL files
seeds/        Seed data
scripts/      Operational scripts
docs/         Product and operations documentation
```

## Local Artifacts

The following are local-only and should not be committed:

```text
.agents/
.claude/
.codex/
.omx/
.omc/
output/
wfd/
dist/
node_modules/
```

WFD audio generation docs live at `docs/wfd/audio-workflow.md`.

---

# Kai-Kou (PTE Coach)

## Local Development

```bash
npm install
npm run dev
npm run dev:api
```

`WE/RA/RS/RL` scoring needs both the Vite app and local API service running at the same time.
If you see `Score API failed with status 404`, it usually means `/api/score` was proxied to a different app.

## Environment Variables

Create one local env file in project root, for example `.env.local` or `.env.development.local`.

- Vite frontend reads public `VITE_*` variables from these files.
- The local Node API server (`npm run dev:api`) now reads `.env`, `.env.local`, `.env.development`, and `.env.development.local`.
- Vercel serverless API routes read `process.env` from the Vercel project settings.

Example:

```bash
GEMINI_API_KEY=your_real_gemini_api_key
GROQ_API_KEY=your_real_groq_api_key
LLM_GROQ_MODEL=llama-3.3-70b-versatile
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

### Local API Routing Checks

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

## LLM Fallback Architecture (Scoring API)

### Strategy

- Primary provider: `Gemini`
- Fallback provider: `Groq`
- Fallback only applies in backend scoring flow (`/api/score`)
- Frontend request protocol remains unchanged

### Fallback Trigger Rules

Gemini will fallback to Groq only for:

1. HTTP `429`
2. timeout
3. HTTP `502` / `503` / `504`
4. provider network errors (e.g. `fetch failed`, `ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`)

The following do **not** trigger fallback:

1. HTTP `400` / `401` / `403`
2. prompt construction/local code errors
3. JSON parse/normalize errors

### Scoring LLM Environment Variables

Server-side only (never expose to frontend):

- `GEMINI_API_KEY`: required, primary provider key
- `GROQ_API_KEY`: recommended Groq key name
- `LLM_GROQ_MODEL`: default `llama-3.3-70b-versatile`
- `LLM_PRIMARY_TIMEOUT_MS`: Gemini timeout (ms), default `8000`
- `LLM_FALLBACK_TIMEOUT_MS`: Groq timeout (ms), default `8000`

Compatibility note:

- `GROP_API_KEY` is a legacy typo and is only kept for compatibility.
- New setup should always use `GROQ_API_KEY`.

### Register / Email Verification Environment Variables

Server-side only:

- `SUPABASE_URL`: required by `POST /api/auth/send-register-code` and `POST /api/auth/register-with-code`
- `SUPABASE_SERVICE_ROLE_KEY`: required by `POST /api/auth/send-register-code` and `POST /api/auth/register-with-code`
- `BREVO_API_KEY`: required by `POST /api/auth/send-register-code`
- `REGISTER_OTP_FROM_EMAIL`: required by `POST /api/auth/send-register-code`
- `REGISTER_OTP_FROM_NAME`: optional display name for the sender, defaults to `开口`

Do not put `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, or `REGISTER_OTP_FROM_EMAIL` into any `VITE_*` variable.

### Billing / Alipay Environment Variables

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

### Local Verification

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

### Preview Verification (Vercel)

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

## WFD Audio Workflow

WFD audio generation and upload notes live in `docs/wfd/audio-workflow.md`.
Generated WFD audio, exported workbooks, and run reports are local artifacts and should not be committed.

## Supabase Setup

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

## Deploy to Vercel

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

## Verify After Deployment

- Home page loads correctly.
- Register can receive confirmation email and sign in successfully.
- Login page has "忘记密码"入口 and reset flow works.
- `/ra` can request microphone permission on mobile.
- After recording and submit, result page shows real AI scoring output.
