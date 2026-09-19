# 数据库开发与连接

## 当前架构

本地业务已完整切换到 Supabase PostgreSQL staging。现有认证、博客、Todo、日常健身、Prompt 和番茄钟均从 `src/db/client.ts` 进入 PostgreSQL，不再运行时读取或写入 MySQL。旧 MySQL 保留为迁移源和人工回退资产，不提供业务自动 fallback。

两套 Prisma 仍隔离保存，以便审计和必要的人工回查：

| 用途 | legacy MySQL | 当前 PostgreSQL |
| --- | --- | --- |
| Schema | `prisma/schema.prisma` | `prisma/postgres/schema.prisma` |
| CLI config | `prisma.config.mjs` | `prisma.postgres.config.ts` |
| Migration history | `prisma/migrations` | `prisma/postgres/migrations` |
| Generated client | `generated/prisma` | `generated/prisma-postgres` |
| Runtime entry | `src/db/legacy-mysql/client.ts`（仅工具） | `src/db/client.ts`（全部业务） |

PostgreSQL schema 已包含全部业务模型。时间点使用 `timestamptz(3)`；需要保持 MySQL 大小写不敏感语义的字段使用 `citext`；原有唯一约束、外键、枚举、关联表和自增 ID 均已保留。

## 环境变量

复制 `.env.example` 到被 Git 忽略的本地环境文件。不要提交连接串、密码、证书或 Supabase key。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL`、`DATABASE_HOST/PORT/USER/PASSWORD/NAME` | 仅 legacy 检查和显式数据迁移源 |
| `POSTGRES_DATABASE_URL` | 应用 runtime 连接 |
| `POSTGRES_MIGRATION_URL` | schema migration 与数据迁移目标连接 |
| `POSTGRES_SHADOW_DATABASE_URL` | `migrate dev` 的独立空 shadow database |
| `POSTGRES_SSL_CA` | runtime、迁移和审计的 PEM 根证书 |
| `POSTGRES_POOL_MAX` | 每个应用进程的连接池上限，默认 5 |
| `POSTGRES_CONNECT_TIMEOUT_MS` | 建连超时，默认 10000 |
| `POSTGRES_IDLE_TIMEOUT_MS` | 空闲连接超时，默认 10000 |
| `POSTGRES_QUERY_TIMEOUT_MS` | 普通查询超时，默认 10000 |

运行时角色与迁移角色必须分离。runtime 只拥有应用表所需 DML 权限；migration 才拥有 schema CREATE。连接必须启用 CA 校验，不得使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`、`rejectUnauthorized=false`、`sslmode=disable` 或 `sslmode=no-verify`。

## 常用命令

```bash
# 离线结构、生成、静态检查与测试
pnpm prisma:validate
pnpm prisma:generate
pnpm db:boundaries
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# staging 真实连接与 schema 状态
pnpm db:check:postgres
pnpm db:audit:postgres
pnpm postgres:migrate:status

# PostgreSQL schema 迁移（必须经 CA 包装器）
pnpm postgres:migrate:dev -- --name <name>
pnpm postgres:migrate:deploy

# 数据迁移
pnpm db:migrate:data:dry-run
pnpm db:migrate:data:apply
pnpm db:migrate:data:verify
```

`db:migrate:data:apply` 仅允许 local/development/test，且要求当前进程显式设置 `POSTGRES_MIGRATION_ALLOW_WRITE=true`。工具会先检查源端关系完整性、目标为空、runtime 与 migration 属于同一 Supabase 项目，然后在单事务中导入并校验。目标非空时拒绝再次 apply；已完成迁移后只运行 verify-only。

回滚 smoke 同样需要一次性显式开关：

```bash
pnpm exec cross-env POSTGRES_ENVIRONMENT=development POSTGRES_SMOKE_ALLOW_WRITE=true pnpm db:smoke:postgres
```

## 开发边界

`config/database-legacy-allowlist.json` 仅允许 legacy 连接检查、数据迁移工具和 legacy client 自身引用旧数据库。`pnpm db:boundaries` 会检查静态与动态 import、require 和测试 mock；任何业务代码重新引入 legacy client、旧生成类型或 MariaDB driver 都会失败。

本地开发启动前应确保 `.env.development` 的 runtime URL、CA 和 JWT/test account 配置齐全。Playwright 的数据库场景会真实读写 staging 并在 `finally` 中清理，因此固定为单 worker；远程数据库断言使用 30 秒收敛窗口，但仍严格验证最终数据状态。

## 控制台状态

- 用户已确认在 Supabase staging 控制台关闭 Data API；本会话没有控制台读取权限，因此未独立复核该控制台状态。
- Vercel `feline-blog-staging` 已关联当前工作区，Framework Preset 明确设为 Next.js，Preview 与该 staging 项目的 Production target 均配置了最小 PostgreSQL runtime/JWT 环境变量；部署已由 Vercel 标记为 `Ready`，稳定别名为 `https://feline-blog-staging.vercel.app`。在重新启用保护前，首页与 `/blog` 已实际访问成功，后者确认 Vercel Function 能读取 Supabase staging 数据。当前 SSO Deployment Protection 已重新开启，生产部署 URL 与所有 Preview 均要求通过 Vercel 身份验证。
- Vercel `feline-blog-production`、真正的 Production 数据库环境与 `dbBackup.sh` 未处理，均不得视为已验证。
