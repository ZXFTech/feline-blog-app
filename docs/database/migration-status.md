# 数据库迁移状态与证据

更新日期：2026-09-19

## 当前归属

本地开发与 Supabase staging 已完成全量切换。所有业务模块只读写 PostgreSQL；旧 MySQL 仅保留为迁移源和人工回退资产，不参与业务双写或失败回退。

| 模块或实体 | 当前读库 | 当前写库 | 状态 |
| --- | --- | --- | --- |
| 身份、User、Session、VerificationToken、Role | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移，保留原 JWT Cookie、密码哈希与权限流程 |
| Blog、Like、Favorite、Tag、TagsOnBlogs | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移，并发计数与归属检查已验证 |
| Todo、TagsOnTodos、Tag | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移，共享 Tag 一并切换 |
| DailyStat、WorkoutItem、WorkoutSet、Exercise | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移 |
| Prompt | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移 |
| PomodoroRecord | Supabase PostgreSQL staging | Supabase PostgreSQL staging | 已迁移，幂等、冲突及离线同步已验证 |

`src/db/client.ts` 是业务唯一默认入口。`src/db/legacy-mysql/client.ts` 只允许连接检查和显式数据迁移工具使用；业务代码不得重新导入旧客户端、`generated/prisma` 或 MariaDB driver。

## 数据迁移结果

迁移时源库共 3,835 条记录。导入保留主键、关系、业务时间、密码哈希及关联表，并在显式 ID 导入后重置 PostgreSQL sequence。

| 数据集 | 行数 |
| --- | ---: |
| users | 3 |
| sessions | 0 |
| verificationTokens | 0 |
| blogs | 12 |
| tags | 43 |
| todos | 104 |
| tagsOnTodos | 150 |
| tagsOnBlogs | 6 |
| blogLikes | 2 |
| blogFavorites | 1 |
| dailyStats | 4 |
| workoutItems | 0 |
| workoutSets | 0 |
| exercises | 2 |
| prompts | 3,257 |
| pomodoroRecords | 251 |

`db:migrate:data:verify` 已对上述 16 个数据集逐表比较行数与规范化 SHA-256，源端与目标端全部一致。首次 apply 已提交数据，但客户端在提交后的验证阶段因 10 秒查询超时退出；再次 apply 被“目标非空”保护正确拒绝，随后使用更长的迁移专用超时执行 verify-only 并通过。没有用 upsert 覆盖目标数据。

## 已执行验证

- PostgreSQL 三个迁移均已部署，`postgres:migrate:status` 显示 schema 最新。
- runtime、migration 与独立 shadow 连接的 TLS、角色隔离和最小权限审计已通过；runtime pool 为 5，以支持并发事务。
- `db:check:postgres` 真实只读连接通过；探针 CRUD/rollback smoke 通过且无残留。
- `prisma:validate`、`prisma:generate`、`typecheck`、`lint`、`build` 均通过；build 在没有生产数据库凭证时保持离线可执行。
- `pnpm test`：80 个文件、335 项测试通过；数据库依赖边界检查覆盖 301 个源文件并通过。
- Supabase staging 数据库专项 Playwright 在 desktop 与 mobile 共 28 项全部通过，包括私有数据隔离、事务回滚、并发点赞、API 安全投影、番茄钟落库、幂等、冲突与离线恢复；离线同步用例现使用固定事件 ID 并在 `finally` 清理，重复运行不会留下数据。
- 旧 MySQL 未删除，未替换现有认证系统，未向 `feline-blog-production` 发布。
- Vercel `feline-blog-staging` 已关联并完成部署；Framework Preset 明确设为 Next.js，Vercel 检查状态为 `Ready`，稳定别名为 `https://feline-blog-staging.vercel.app`。该 staging 项目的 Preview 与 Production target 均已配置最小 PostgreSQL runtime/JWT 变量，未上传 migration/admin/shadow 数据库凭证。在重新启用保护前，首页与 `/blog` 已实际访问成功，后者已读取 Supabase staging 中的迁移数据。当前 SSO Deployment Protection 已重新开启，生产部署 URL 与所有 Preview 均要求通过 Vercel 身份验证。

## 尚未验证或本轮不处理

- Supabase Data API：用户已确认在 staging 控制台关闭；本会话没有控制台读取权限，因此未独立复核该控制台状态。
- Vercel `feline-blog-production` 以及真正的 Preview/Production PostgreSQL 连接、迁移、权限和数据：**未配置、未迁移、未验证**。
- `dbBackup.sh` 与旧备份归档：按本轮要求暂不处理；旧 MySQL 继续保留，不授权删除。
- 最近一次全量 Playwright 为 63 通过、2 跳过、5 失败；其中两项是既有 `new-theme-regressions.spec.ts` 的“清空输入”UI 用例，另外三项远程数据库时延失败随后已通过串行夹具与 30 秒收敛窗口修正，并由独立数据库专项 28/28 复验。修正后未再次运行整个 70 项套件，因此全量最终状态明确标记为**未全量复验**。
