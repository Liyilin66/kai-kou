# 任务 7：CI + 重录对比

- 日期：2026-10-08
- 分支：`lyl`（A、B 分两个提交；B 改动线上代码，**Claude 审查后才能合并 `main`**）
- 关联：`docs/improvement-plan.md` 第 3.11 节阶段 2（重录对比）、阶段 3（CI）

## A. CI（先做，很小）

新增仓库根目录 `.github/workflows/test.yml`：

- 触发：推送到 `lyl` / `main`，以及指向这两个分支的 Pull Request。
- 工作目录 `kai-kou`；Node 版本与本机一致（24）；`npm ci` → `npm test`。
- 构建矩阵：`VITE_RA_DIAGNOSIS=on` 和 `off` 各跑一次 `npm run build`。
- 不需要任何密钥（现有测试全部离线）。如果某个测试依赖本机 `.env.local`，修测试，不要往 CI 里加密钥。
- 验收：推送后 GitHub Actions 页面两种构建都为绿色。

## B. 重录对比

### 目标

用户对同一道题再读一次后，结果页告诉他"和上次比，哪些问题改好了、哪些还在、有没有新问题"。这是第一轮"发现问题 → 回听 → 重练 → 看到变化"闭环的最后一环。

### 设计

1. **取上一次结果**：结果页用当前用户的登录身份直接读 `speech_analyses`（已有"只能读自己的记录"权限）：同一 `question_id`、`status = 'done'`、`created_at` 早于本次的最近一条。没有上一次时，不显示对比卡片。
2. **比较逻辑**：新增纯函数 `compareDiagnoses(previous, current)`，放在 `src/lib/ra-compare.js`，不依赖浏览器 API：
   - 指标变化：内容完整度、犹豫次数、长停顿次数、语速。
   - 证据按"类型 + 原文位置（`ref_span[0]`）"匹配，分为三组：
     - **已改善**：上次有、这次没有
     - **仍需练习**：两次都有
     - **新出现**：上次没有、这次有
   - `homophone`、`low_confidence` 不参与比较（与诊断规则一致）。
3. **结果页卡片"和上次比"**，放在指标卡片下方：
   - 一行指标变化（例如"完整度 92% → 98%，犹豫 2 → 0"），变好用绿色、变差用橙色。
   - 三组词语标签；点击"仍需练习""新出现"里的标签 → 播放器跳到本次录音对应位置（复用 `evidencePlaybackSeconds`）。
   - 手机 375 宽度可用。
4. **"再练一次这题"按钮**：确认点击后进入同一道题的练习，提交后结果页自动出现对比卡片。

### 不做

- 不改诊断规则、证据格式、反馈逻辑；不改其他题型；不新增依赖。

### 测试

- `tests/frontend/ra-compare.test.js`：三组分类正确；同类型同位置算"仍需练习"；类型不同不算同一问题；`homophone` 被忽略；没有上一次时返回空；指标变化计算正确。
- 原有测试全部通过；两种开关构建通过。

### 验收

1. 在预览地址对同一道题连续做两次，第二次结果页出现对比卡片，三组分类和实际标注一致。
2. 用浏览器手机视口检查 375 宽度布局。
3. 交付说明附：一次真实对比的截图或数据。

## 实施记录（2026-10-08）

### 前置头像发布

浏览器本地环境连接真实 Supabase，以临时测试用户检查 `/home`、`/profile`、`/agent`。三页均显示真实 Storage 头像，decode 成功，原图 256×256；截图保存在本机 `output/playwright/avatar-{home,profile,agent}.png`，不提交图片。私教后端在本地未启动导致其会话恢复失败，与头像加载无关。检查后将审查通过的 `bfe6eb9` 合并并推送 main，随后切回 lyl 同步。

### A：CI

新增根目录 `.github/workflows/test.yml`，push 和 PR 覆盖 lyl/main，Node 24，工作目录 kai-kou，npm 缓存依据 app lockfile，npm ci / npm test / on-off 矩阵构建，不配置密钥。测试现有数据和服务调用均走本地 fixture 或 mock。

GitHub Actions 的实际运行状态待推送后验证并记录，不以本地构建替代远端绿色检查。
