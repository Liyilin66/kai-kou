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
