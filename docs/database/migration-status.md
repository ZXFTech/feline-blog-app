# 数据库迁移状态与证据

更新日期：2026-09-20

本文记录已观察到的数据库状态与验证证据。日常命令、环境变量和故障处理见 [README.md](./README.md)。

## 当前归属

本地开发已切换到 Docker PostgreSQL，远程 staging 继续使用 Supabase PostgreSQL。所有业务模块只读写当前环境的 PostgreSQL；旧 MySQL 仅保留为迁移源和人工回退资产，不参与业务双写或失败回退。

| 模块或实体 | 当前读库 | 当前写库 | 状态 |
| --- | --- | --- | --- |
| 身份、User、Session、VerificationToken、Role | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地为 `feline_blog_dev`，staging 为 Supabase，保留原 JWT Cookie、密码哈希与权限流程 |
| Blog、Like、Favorite、Tag、TagsOnBlogs | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地与 staging 命令边界隔离 |
| Todo、TagsOnTodos、Tag | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地与 staging 命令边界隔离 |
| DailyStat、WorkoutItem、WorkoutSet、Exercise | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地与 staging 命令边界隔离 |
| Prompt | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地与 staging 命令边界隔离 |
| PomodoroRecord | 当前环境 PostgreSQL | 当前环境 PostgreSQL | 本地与 staging 命令边界隔离 |

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

## 当前基础设施

| 项目 | 当前状态 |
| --- | --- |
| 本地 PostgreSQL | PostgreSQL 17 固定镜像，Compose project `feline-blog-local`，service `postgres` |
| 本地监听 | 仅 `127.0.0.1:54329`，不监听局域网地址 |
| 本地 volume | `feline_blog_postgres_data`，带项目、owner 和 purpose 标签 |
| 本地数据库 | `feline_blog_dev`、`feline_blog_shadow`、`feline_blog_verify`、维护库 `postgres` |
| 本地角色 | `app_runtime`、`app_migrator`、`local_admin`，权限已隔离 |
| staging PostgreSQL | Supabase direct endpoint，数据库 `postgres`，TLS `verify-full` |
| staging 角色 | `app_runtime`、`app_migrator`、`app_exporter`，exporter 已验证为只读 |
| PostgreSQL migration | 3 条，local dev、local verify 和 staging 的名称及 checksum 一致 |
| 最新 refresh | 状态 `complete`，`recoveryRequired=false` |

当前 PostgreSQL migrations：

1. `20260919000000_init_connection_probe`
2. `20260919070056_migrate_legacy_models`
3. `20260919070822_verify_legacy_schema`

## 2026-09-20 验证结果

### 本地开发与迁移

- `db:local:up`、`db:local:setup`、`db:local:migrate`、`db:local:status`、`db:local:down` 均已实际运行通过。
- `db:local:migrate` 在 `feline_blog_dev` 检查 schema，在独立 `feline_blog_shadow` 执行 Prisma shadow 工作，并重建 `feline_blog_verify` 重放全部 migration。
- 本地 status 显示 `app_runtime` 没有 `CREATEDB`、`CREATEROLE` 或 superuser 能力，migration state 为 `current`。
- 停止本地服务后 volume 保留，重新启动后 SQL readiness、migration 和 refresh ledger 状态仍正常。

### staging 与 refresh

- `.env.staging` 已使用 allowlisted direct Supabase endpoint，连接角色为 `app_migrator`，TLS 为 `verify-full`。
- `db:staging:status` 已实际连接成功，migration state 为 `current`，三条 migration checksum 与工作树一致。
- `app_exporter` 角色确定存在，能读取全部支持的应用表，不能写表、改 schema、使用 sequence 或执行应用函数。扩展拥有的函数不计为应用函数。
- 无门禁的 staging deploy 与 local refresh 会在执行前返回 `TARGET_REJECTED`。门禁没有保存到 `.env.staging`。
- 带当前进程门禁的 `db:staging:deploy` 已运行，结果为没有待执行 migration。
- 带两个可信工作站门禁的 `db:local:refresh` 已真实完成。刷新账本记录 17 张应用表、3,849 行，状态为 `complete`。
- refresh 使用本地 migration 重建 `_prisma_migrations`，未从 staging 复制该表。本地完成 migration 数为 3。
- 刷新后的应用使用测试账号成功登录并创建唯一 Todo 标记。本地计数为 1，staging 对同一标记的只读查询计数为 0，证明应用写入没有越过本地边界。标记随后已清理。
- 早期真实 refresh 因把 120 秒误用为总时限而失败。现已改为连续 120 秒无数据进展才超时，修复后的真实 refresh 通过，并有 Vitest 回归测试保护。

### 自动化测试

| 检查 | 结果 |
| --- | --- |
| `pnpm prisma:validate` | 通过 |
| `pnpm prisma:generate` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 85 个文件、397 项测试通过 |
| `pnpm db:boundaries` | 320 个源文件通过 |
| `pnpm db:local:test` | 连续两次通过，使用不同随机 Compose project，测试资源全部清理 |

Docker integration harness 已覆盖数据库与角色隔离、migration replay、repeatable read snapshot、一致性行数、循环外键、sequence 修复、连接 fence、共享 host lock、恢复窗口、生产者和消费者清理、不支持对象拒绝、volume 持久化与受保护 destroy。

## 安全边界

- 日常业务不得导入 legacy MySQL client、legacy generated Prisma client 或 MariaDB driver。
- `.env.development`、`.env.shadow`、`.env.staging`、`.feline-blog/`、CA、dump 和复制数据都不得提交。
- staging refresh 会在本机保存 staging 的用户、session 和 verification token 数据，只能在可信工作站运行。
- staging 只允许 direct endpoint 与严格 CA。pooler endpoint、错误 project ref、错误角色、弱 TLS 和保存的写门禁都会被拒绝。
- 本地 destroy 只能删除带精确项目标签和 mount 的 `feline_blog_postgres_data`，并要求当前进程门禁和完整确认字符串。
- refresh 在 commit point 前失败会恢复或保留旧 dev；commit point 后只允许保留新 dev 并把旧库标为 cleanup pending，不会删除唯一可用数据库。

## 尚未完成或未独立验证

- 功能的 Design、Build、Verify 和 Test 均已完成，但 scope 仍为 `in-progress`，等待人工确认是否标记 `done`，spec 仍为 `In Progress`。
- Supabase Data API 由用户确认已关闭，但当前工具没有控制台读取权限，因此没有独立复核。
- `feline-blog-production`、真正的 Production PostgreSQL、生产迁移窗口、权限、备份与恢复演练均未配置或验证。
- `dbBackup.sh` 和旧备份归档未处理。旧 MySQL 继续保留为审计与人工恢复资产，不授权删除。
- 本轮数据库隔离验证没有重新运行整个 Playwright 套件。数据库专项路径与刷新后的真实认证写入已通过，但不能据此宣称全部 UI E2E 当前为绿色。
