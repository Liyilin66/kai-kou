# 任务 12：试用支撑（行为埋点 + 开通脚本 + 统计脚本）

- 日期：2026-10-09
- 分支：`lyl`（埋点改线上代码，**Claude 审查后才能合并 `main`**）
- 关联：`docs/user-trial-plan.md`

## 目标

试用期间不让参与者填表，行为数据由系统自动记录；开通权限和统计结果由脚本完成，用户只负责招募和访谈。

## A. 行为埋点（最小集合）

1. 新表 `public.practice_events`（SQL 文件 `db/practice-events.sql`，**需要用户在 Supabase 执行一次**）：
   - `id`、`user_id`、`event`（文本）、`analysis_id`（可空）、`question_id`（可空）、`props jsonb`、`created_at`
   - RLS：登录用户只能插入 `user_id = auth.uid()` 的记录、只能读自己的；不允许更新和删除。
   - 索引：`(user_id, created_at)`。
2. 只记 5 个事件，前端在对应位置插入一行（失败静默，不影响功能）：

| 事件 | 时机 | props |
|---|---|---|
| `ra_result_viewed` | RA 诊断结果页加载完成 | `total` |
| `ra_evidence_played` | 点击任一证据或标注回听 | `evidence_type` |
| `ra_rules_opened` | 打开"评分规则"弹窗 | — |
| `ra_retry_started` | 点击"再练一次这题" | — |
| `ra_compare_viewed` | 重录对比卡片出现在页面上 | `improved`、`ongoing`、`new` 三组的数量 |

3. 不记录任何文本内容、录音内容或个人信息。

## B. 开通试用权限脚本

`scripts/trial-grant.js --email <邮箱> [--days 7] [--apply]`：

- 用本地 service role 按邮箱查到用户，设置 `profiles.trial_days` 和 `trial_granted_at = now()`（与 `backend/auth/access-status.js` 的判断方式一致）。
- 默认只打印将要修改的内容；加 `--apply` 才写入。邮箱不存在时提示"对方还没注册"。
- 不修改 VIP 字段。

## C. 试用统计脚本

`scripts/trial-report.js --since <日期> --emails a@x.com,b@y.com`：只读，输出到 `output/trial/`（不进 Git）：

- 每人：练习次数、练习天数、结果页打开次数、**回听过证据的结果页占比**、规则弹窗打开次数、重练次数、首日之后是否回访。
- 汇总：上述指标的人数分布，以及"最后一天未做过的题"相对第一天的总分变化（只作参考，不作结论）。
- 输出中用"参与者 1、2、3……"代替邮箱。

## 测试

- 埋点调用失败不抛错、不阻塞页面（模拟 Supabase 失败）。
- 开通脚本：dry-run 不写入；邮箱不存在的提示；`--days` 校验。
- 统计脚本：用构造数据验证各项指标计算，以及邮箱被替换为编号。

## 验收

1. 测试与两种构建通过，CI 绿。
2. 用户执行 SQL 后，在预览环境做一次 RA：点回听、打开规则、点重练，用只读查询确认 5 类事件中至少 4 类已写入。
3. 交付说明附：需要用户执行的 SQL（一句话说明）和两个脚本的用法示例。

## 实施记录

- 五类事件接入 RA 结果页；事件属性使用白名单，鉴权及写库失败静默，调用不等待网络。
- `db/practice-events.sql` 创建事件表和仅可读写本人记录的 RLS；客户端无更新、删除权限。
- `trial-grant.js` 默认 dry-run，只有 `--apply` 更新试用天数和起始时间，不修改 VIP。
- `trial-report.js` 只读，输出用参与者编号；回听占比分母为去重后的已查看结果，分子只计其中有证据回听的结果。
- 待用户执行事件表 SQL 后，验证预览环境真实操作与事件入库。本轮停留 `lyl`，不合并生产。

### 使用方式

```sh
node scripts/trial-grant.js --email participant@example.com
node scripts/trial-grant.js --email participant@example.com --days 7 --apply
node scripts/trial-report.js --since 2026-10-09 --emails participant@example.com,another@example.com
```

SQL：在 Supabase SQL Editor 执行 `db/practice-events.sql` 全文。

### 本地验证（2026-10-09）

- `npm test`：388 项通过，0 失败。
- `VITE_RA_DIAGNOSIS=on npm run build` 和 off 构建均通过。
- 开通脚本真实 dry-run：未注册邮箱返回“对方还没注册”，未写入。
- 统计脚本真实运行：未注册参与者匿名输出到忽略目录；只读分数 JSON 路径查询成功，不读取文本与音频字段。
- 统计仅限 RA，日期按 UTC 划分；重复邮箱去重，无打开结果时回听占比为 null，首末同一天时分数变化为 null。
- 当前事件表查询为 PGRST205（尚未执行 SQL），因此真实预览事件写入验收待迁移完成，不能视为已通过。
