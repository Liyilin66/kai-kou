# 任务 1：Supabase 保活定时任务

- 日期：2026-10-08
- 分支：`lyl` → 审查通过后合并 `main`（推送 `main` 即上线，**必须先审查**）
- 预计工作量：小

## 背景

2026-10-07 发现 Supabase 免费项目因长时间无活动被自动暂停，项目域名直接无法解析，线上登录、练习、评分全部不可用。手动恢复后，需要防止再次发生。

## 方案

使用 **Vercel Cron**，每天调用一次新的健康检查接口，接口内对数据库做一次轻量查询。

为什么不用 GitHub Actions：仓库是公开的，GitHub 会在仓库 60 天无提交后自动停用定时工作流——又是一个"长时间不活动就失效"的机制。Vercel Cron 只要项目在部署状态就会持续运行。

## 要做的内容

### 1. 新增 `api/health.js`

- 只接受 `GET`。
- 鉴权：环境变量 `CRON_SECRET` 存在时，要求请求头 `Authorization: Bearer <CRON_SECRET>`，否则返回 401。Vercel Cron 会自动带上这个请求头。
- 用 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 创建客户端（Vercel 已配置这两个变量），执行一次真实的数据库读取：`questions` 表 `select id limit 1`。
- 返回 `{ ok: true, db_ms }`；数据库失败时返回 500 和 `{ ok: false, error_code }`，**不返回任何数据内容和密钥信息**。
- 打一行结构化日志，例如 `[health] { ok, db_ms }`，方便在 Vercel Logs 中确认每天都执行了。

### 2. `vercel.json` 增加定时任务

```json
"crons": [{ "path": "/api/health", "schedule": "0 3 * * *" }]
```

- Hobby 套餐的定时任务只能每天一次，执行时间会在指定小时内浮动，这里够用。
- 注意现有 `rewrites` 规则不要影响 `/api/health`（`/api/(.*)` → `/api/$1` 是透传，应无影响，需验证）。

### 3. 顺手修改

根目录 `.gitignore` 加入 `.playwright-cli/`（浏览器测试工具产生的本地日志，不应提交）。

## 约束

- 不新增依赖（项目已有 `@supabase/supabase-js`）。
- Vercel Hobby 套餐每次部署最多 12 个 Serverless Functions。当前 `api/` 下 8 个，加上本任务 9 个，第一轮计划还会再加 1 个，仍在限额内。**不要为本任务拆出多个函数文件。**

## 需要用户完成

- 在 Vercel 项目的环境变量中新增 `CRON_SECRET`（一串随机字符串，所有环境）。

## 测试

`tests/health.test.js`（`node:test`，模拟 Supabase 客户端或 `fetch`，不连真实数据库）：

1. 设置了 `CRON_SECRET`，请求不带或带错误的 token → 401。
2. token 正确、数据库查询成功 → 200，`ok: true`，包含 `db_ms`。
3. 数据库查询失败 → 500，`ok: false`，响应体中没有错误原文和密钥。
4. 非 GET 请求 → 405。

## 验收标准

1. `npm test`、`npm run build` 通过。
2. 本地 `npm run dev:api` 后请求 `/api/health`（带正确 token）返回 200。
3. 部署后，Vercel 项目 → Settings → Cron Jobs 中能看到这条任务，手动触发一次（Run）成功。
4. 次日在 Vercel Logs 中能看到一条自动执行的 `[health]` 日志。

## 已知不确定性

Supabase 判定"无活动"的具体规则以官方说明为准。本方案用真实数据库查询而不只是 HTTP ping，以尽量确保被计为活动。若之后仍被暂停，再考虑提高频率或升级付费版。

## 实施记录

- [x] 新增 `api/health.js`：GET、Cron token 校验、真实数据库轻量查询、脱敏日志、禁止缓存。
- [x] `vercel.json` 每日 Cron 与根 `.gitignore` 配置。
- [x] `server.js` 注册本地健康检查路由（用于本地 API 验收）。
- [x] 自动化测试：8 条 health 测试，全项目 71 条通过；构建通过。
- [x] 本地真实数据库验收：带正确 token 返回 200；无 token 返回 401；POST 返回 405。
- [x] 独立代码审查通过。
- [x] Vercel 所有环境配置 `CRON_SECRET`（用户确认完成）。
- [x] 生产部署 `84d0ff2` Ready；Cron Jobs 已注册，手动 Run 返回 HTTP 200。
  - 实测日志：`[health] {"ok":true,"db_ms":760}`；User Agent 为 `vercel-cron/1.0`。
  - 日程 `0 3 * * *` 使用 UTC；墨尔本当前夏令时约 14:00–15:00 执行。
- [ ] 次日确认自动执行日志（未来验收，不以手动执行替代）。
