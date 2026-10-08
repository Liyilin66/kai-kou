# 任务 3：头像改存到存储桶

- 日期：2026-10-08
- 分支：`lyl` → 审查通过后合并 `main`（推送 `main` 即上线，**必须先审查**）
- 期限：第一轮第 4 阶段邀请真实用户试用之前完成
- 预计工作量：小到中

## 背景（隐患，目前未触发）

当前上传头像时，`ProfileView.vue` 的 `createAvatarDataUrl` 把图片压成 256×256 的 JPEG，转成 base64 文本，`auth.js` 的 `updateAvatarDataUrl` / `updateProfileDetails` 再把它写进 Supabase 的 `user_metadata.avatar_url`。

问题：`user_metadata` 会被写进用户的登录令牌（JWT），令牌在之后的每个请求中都会被携带（Supabase REST、`/api/score` 等）。一张头像约 20–40KB 文本，令牌会因此变得非常大，可能超过服务器允许的请求头大小，导致该用户的**所有请求失败**。

2026-10-07 检查：目前没有用户上传过头像（所有 `user_metadata` 都在 400 字节以内），所以尚未触发。

## 目标

头像文件存到 Supabase Storage，`user_metadata.avatar_url` 只保存一个短链接。

## 要做的内容

### 1. 数据库：新增 `db/avatars-storage.sql`

- 创建存储桶 `avatars`，**公开读**（头像需要直接用 `<img>` 显示）。
- 文件路径规则：`{user_id}/avatar-{时间戳}.jpg`。
- RLS：已登录用户只能在自己的 `{user_id}/` 文件夹下新增、修改、删除；写法参考 `db/ra-practice-audio.sql`。
- 限制：只允许 `image/jpeg`、`image/png`、`image/webp`，单个文件不超过 1MB（在存储桶设置或策略中限制）。

**这个 SQL 需要用户在 Supabase SQL Editor 中执行。** 交付时提醒用户，并说明执行后如何验证。

### 2. 上传流程

- `ProfileView.vue`：保留现有的裁剪和压缩（256×256 JPEG），但产出 **Blob**，不再转成 data URL。预览可以用 `URL.createObjectURL`。
- `auth.js`：
  - 新增上传函数：把 Blob 上传到 `avatars/{user_id}/avatar-{时间戳}.jpg`，获取公开链接，再把这个链接写入 `user_metadata.avatar_url`。
  - 上传成功后，尽量删除该用户文件夹下的旧头像文件；删除失败只记录警告，不影响本次保存。
  - `updateAvatarDataUrl` 和 `updateProfileDetails` 里的 `avatarDataUrl` 参数改为接收 Blob（或改名为 `avatarBlob`），不再向 `user_metadata` 写入任何 data URL。
- `normalizeAvatarUrl`：**不再接受 `data:` 开头的值**，只接受 `https://` 链接。这样即使旧数据里存在 data URL，也不会被继续使用和写回。

### 3. 不要改的

- 不改昵称、目标分、考试日期等其他资料的保存方式。
- 不新增依赖。
- 不改首页、私教等页面读取头像的方式（它们都通过 `authStore.avatarUrl` 读取，链接格式变了但读取方式不变）。

## 测试

`tests/profile/avatar.test.js`（`node:test`）：

1. `normalizeAvatarUrl` 拒绝 `data:image/...`，接受 `https://...`。
2. 上传函数调用存储接口时，路径符合 `{user_id}/avatar-*.jpg`，`contentType` 为 `image/jpeg`（模拟 Supabase 客户端）。
3. 上传失败时抛出中文友好错误，**且不写入 `user_metadata`**。
4. 写入 `user_metadata` 的 `avatar_url` 长度小于 300 字符。

如果 `auth.js` 里相关函数是模块内私有的，可以把纯函数部分（路径生成、URL 校验）抽到 `src/lib/avatar.js` 再测试，不要为了测试大改 store 结构。

## 验收标准

1. `npm test`、`npm run build` 通过。
2. 本地或预览环境实际上传一张头像：
   - Supabase `avatars` 桶中出现对应文件；
   - 首页、个人中心、私教页面都能正确显示新头像；
   - 浏览器开发者工具中查看当前 access token，长度与上传前相比基本不变（增加不超过几百字节）。
3. 再次更换头像后，旧文件被删除。
4. diff 只涉及上述文件。

## 交付

- diff 交审查。
- 附上：执行 SQL 后的验证截图或查询结果、上传前后 access token 长度对比。

## 实施记录（2026-10-08）

- 任务 6 已合并并推送 main：`fb26666`，Vercel Production 部署 Ready；随后切回 lyl 并同步 main。
- 头像压缩结果改为 Blob，草稿预览使用 object URL 并在替换、关闭、卸载时释放。
- 上传 JPEG 至当前用户文件夹，元数据只保存长度小于 300 的 HTTPS 公开链接。上传失败不改元数据；元数据保存失败清理新文件，保存成功后清理上传前列出的旧头像文件，清理失败只警告。
- `normalizeAvatarUrl` 拒绝 data URL 和 HTTP；更新元数据时将历史头像字段里的 data URL 清空，避免再次写回令牌。其他资料保存方式不变。
- 新增 SQL：`db/avatars-storage.sql`。该迁移与任务 6 的 SQL 不同，需要单独执行全文。

### SQL 执行后的验证

在 Supabase SQL Editor 查询：

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'avatars';
-- 预期 public=true，file_size_limit=1048576，JPEG/PNG/WebP 三种 MIME。
select policyname, cmd from pg_policies
where schemaname='storage' and tablename='objects' and policyname like 'avatars-%';
-- 预期一项公开 SELECT，三项本人文件夹写入策略：INSERT、UPDATE、DELETE。
```

在预览环境登录并更换两次头像，检查当前用户文件夹仅留下新头像，首页、个人中心和私教正常显示。仅比较 access token 的字符长度，勿粘贴完整令牌；新头像只增加一个短 URL，预计增幅不超过几百字符。

当前数据库读取结果：`avatars` 桶尚不存在（Bucket not found）。真实上传、旧文件删除及 access token 长度对比待头像迁移后验收；没有用模拟结果冒充真实验收。

工程验证：`npm test` 320/320 通过，`npm run build` 成功，`git diff --check` 通过；源码已无旧 `avatarDataUrl` 上传入口。当前交付为代码及迁移完成、真实验收待 SQL 执行，并未宣称任务的所有线上验收标准已通过。头像改动只推送 lyl 等 Claude 审查，不合并 main。

### SQL 后真实验收（用户确认执行后）

已使用临时测试账号、真实 JPEG、普通 authenticated 客户端完成两次上传与元数据保存；测试账号和文件已清理，未修改真实用户头像。

- 桶查询：public=true；file_size_limit=1048576；allowed_mime_types 为 image/jpeg、image/png、image/webp。
- 连续上传 2 次后，文件夹只保留新文件；旧文件已删除；公开图片请求 HTTP 200。
- 元数据 avatar_url 为 HTTPS，长度 135 字符。
- 登录 access token 长度：上传前 827，保存并 refreshSession 后 1028，增加 **201 字符**，符合增幅不超过几百字符的验收要求。未记录完整令牌。
- 本节取代上方“桶尚不存在”和存储验收待迁移的时间点状态。首页、个人中心、私教的真实浏览器视觉验收尚未完成；头像读取仍统一走原 authStore.avatarUrl，没有改动这些页面的读取方式。
