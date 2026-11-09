# 新账号权益与服务故障修复

日期：2026-11-09。工作分支：lyl。

## 范围与实现

1. 新注册账号获得7天VIP：db/signup-vip.sql 在已有 auth.users 触发器事务里写 week 和 expires_at；注册资料兜底插入采用 ignoreDuplicates，避免重复初始化延长期限。现有用户不回填、不改变权益。第7天精确到期不再有VIP。
2. 找回密码：修复 Supabase 自定义 SMTP 配置，沿用原找回密码流程，不新增认证接口。SMTP Key 仅本机与Supabase配置，不入Git。已在Supabase保存用户提供的可用SMTP Key及对应登录名；Brevo仅增加本次Supabase实际发信IP白名单，未关闭IP限制。找回密码接口从500恢复成功，用户已确认163邮箱实际收到找回密码邮件。
3. RTS：复用现有OpenAI兼容主通道，Groq备用；不改提示词或分数规则。RA和其它题型路由保留。
4. 收藏：db/di-favorites.sql 是历史文件名，实际创建RA/DI/RTS及个人中心共用的favorites表；增加权限显式授权、身份序列授权、新表用户外键级联清理和RLS所有权约束。
5. 私教统计：纳入RS、RL，支持版本化参考分，未评分诊断不计入均分；总练习数与首页一致。

## SQL上线顺序

Claude审查通过后执行以下全文，随后再发布应用代码：

- db/signup-vip.sql
- db/di-favorites.sql

这两份SQL尚未在生产应用。新VIP只针对迁移生效后新建的账号，已有账号不会自动补发。

## 验证

- npm test：586/586通过。
- RA/RS开关同时on、同时off：两种构建通过。
- 真实线上评测将在预览部署和SQL审查后完成；不要把mock测试当作已上线证据。
- SMTP配置为已授权的线上配置修复，不改代码。
- RTS新主通道真实请求成功：provider=openai、fallback_reason=null，约2.4秒；不是通过备用掩盖主通道故障。

## 回滚

- 应用回滚：回到main当前已审查版本。
- VIP停止赠送：把handle_new_user恢复为只插入id和email、冲突不覆盖；不撤销已赠送权益。
- 收藏表保持不删除，避免丢失用户收藏数据。
