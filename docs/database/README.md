# 数据库开发与连接

本文是数据库开发手册。当前运行状态、已验证证据和未完成边界见 [migration-status.md](./migration-status.md)，架构决策和验收合同见 [spec 0009](../specs/0009-local-postgres-isolation/index.md)。

## 快速开始

首次拉取项目后，推荐按下面顺序初始化。本地密码会自动生成到 Git 忽略文件，不需要手工填写。

```powershell
pnpm install --frozen-lockfile
pnpm db:local:up
pnpm db:local:setup
pnpm db:local:migrate -- --name verify-local-setup
pnpm db:local:status
pnpm dev
```

`db:local:migrate` 在 schema 没有变化时不会创建空迁移，但仍会重新生成 Prisma client，并在 `feline_blog_verify` 从空库重放全部 PostgreSQL migrations。

## 当前架构

日常开发使用 Docker 中的本地 PostgreSQL。Supabase PostgreSQL staging 只允许显式状态检查、迁移部署和只读数据导出。现有认证、博客、Todo、日常健身、Prompt 和番茄钟均从 `src/db/client.ts` 进入 PostgreSQL，不再运行时读取或写入 MySQL。旧 MySQL 保留为迁移源和人工回退资产，不提供业务自动 fallback。

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

`pnpm db:local:up` 会在首次启动前生成三组独立本地密码，并写入被 Git 忽略的 `.feline-blog/local-postgres.env`、`.env.development` 和 `.env.shadow`。staging 配置只放在 `.env.staging`。安全占位格式见 `.env.development.example`、`.env.shadow.example` 和 `.env.staging.example`。不要提交连接串、密码、证书或 Supabase key。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL`、`DATABASE_HOST/PORT/USER/PASSWORD/NAME` | 仅 legacy 检查和显式数据迁移源 |
| `POSTGRES_DATABASE_URL` | 本地应用 runtime 或 staging runtime 连接，各文件互不合并 |
| `POSTGRES_MIGRATION_URL` | 本地 dev migration 或 staging deploy 连接 |
| `POSTGRES_SHADOW_DATABASE_URL` | 本地 `migrate dev` 的独立 shadow database |
| `POSTGRES_VERIFY_DATABASE_URL` | 从空库重放全部迁移的本地 verify database |
| `POSTGRES_ADMIN_URL` | 本地维护或显式 staging 角色配置连接 |
| `POSTGRES_EXPORTER_URL` | staging 只读导出角色连接 |
| `POSTGRES_SSL_CA` | staging 的 PEM 根证书，本地 loopback 不使用 TLS |
| `POSTGRES_POOL_MAX` | 每个应用进程的连接池上限，默认 5 |
| `POSTGRES_CONNECT_TIMEOUT_MS` | 建连超时，默认 10000 |
| `POSTGRES_IDLE_TIMEOUT_MS` | 空闲连接超时，默认 10000 |
| `POSTGRES_QUERY_TIMEOUT_MS` | 普通查询超时，默认 10000 |

运行时角色与迁移角色必须分离。`app_runtime` 只拥有应用表所需 DML 权限，`app_migrator` 拥有本地 schema 变更权限，`local_admin` 只用于 loopback 运维。远程连接必须启用 CA 校验，不得使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`、`rejectUnauthorized=false`、`sslmode=disable` 或 `sslmode=no-verify`。

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

# 本地生命周期与状态
pnpm db:local:up
pnpm db:local:setup
pnpm db:local:status
pnpm db:local:down

# 本地开发迁移和空库重放
pnpm db:local:migrate -- --name <name>

# staging 状态和受保护部署
pnpm db:staging:status
STAGING_MIGRATION_ALLOW_WRITE=true pnpm db:staging:deploy

# staging 只读数据刷新
STAGING_DATA_COPY_ALLOW=true STAGING_DATA_COPY_TRUSTED_WORKSTATION=feline-blog-local-sensitive-copy pnpm db:local:refresh

# 独立 Docker 集成测试
pnpm db:local:test

# 数据迁移
pnpm db:migrate:data:dry-run
pnpm db:migrate:data:apply
pnpm db:migrate:data:verify
```

PowerShell 中的当前进程门禁写法如下。不要把这些门禁保存到任何 `.env` 文件。

```powershell
# 只读复制 staging 数据到本地
$env:STAGING_DATA_COPY_ALLOW = "true"
$env:STAGING_DATA_COPY_TRUSTED_WORKSTATION = "feline-blog-local-sensitive-copy"
pnpm db:local:refresh
Remove-Item Env:STAGING_DATA_COPY_ALLOW
Remove-Item Env:STAGING_DATA_COPY_TRUSTED_WORKSTATION

# 只部署已提交 migration，不运行 migrate dev、reset 或 db push
$env:STAGING_MIGRATION_ALLOW_WRITE = "true"
pnpm db:staging:deploy
Remove-Item Env:STAGING_MIGRATION_ALLOW_WRITE
```

## 标准开发流程

### 日常启动与停止

1. 运行 `pnpm db:local:up`，等待 PostgreSQL health check 通过。
2. 运行 `pnpm db:local:status`，确认 `database` 为 `feline_blog_dev`、`roleClass` 为 `app_runtime`、`migrationState` 为 `current`。
3. 运行 `pnpm dev`。该命令只接受经过校验的本地 runtime 配置。
4. 工作结束后可运行 `pnpm db:local:down`。该命令保留 `feline_blog_postgres_data` 卷。

### 修改 PostgreSQL schema

1. 只编辑 `prisma/postgres/schema.prisma`，不要编辑 generated client。
2. 使用 1 到 64 位的小写字母、数字和单连字符命名 migration。
3. 运行 `pnpm db:local:migrate -- --name <name>`。
4. 检查新生成的 `prisma/postgres/migrations/<timestamp>_<name>/migration.sql`。
5. 运行 `pnpm prisma:validate`、`pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm db:local:test`。

迁移命令只允许 `--name <name>`。`--create-only`、`--url`、`--schema`、`--config`、reset 和其他透传参数都会被拒绝。

### 从 staging 刷新本地数据

刷新只适用于可信开发工作站。它通过 `app_exporter` 打开 read only repeatable read snapshot，将应用表数据流式恢复到已重放本地 migration 的临时数据库，核对外键、sequence 和逐表行数后再切换 `feline_blog_dev`。

刷新前先停止 `pnpm dev`，避免活动连接阻止数据库切换。成功后运行：

```powershell
pnpm db:local:status
pnpm dev
```

状态应显示 `operationState` 为 `complete`、`recoveryRequired` 为 `false`。刷新不会复制 staging 的 `_prisma_migrations`，本地 migration metadata 始终来自工作树迁移重放。

### staging schema 部署

staging 只接受 direct Supabase endpoint、`app_migrator`、严格 CA 校验和当前进程门禁。推荐先运行：

```powershell
pnpm db:staging:status
pnpm db:staging:exporter:verify
```

确认 migration state 为 current 或明确知道待部署内容后，再使用上面的 PowerShell 门禁执行 `db:staging:deploy`。该命令只运行 `prisma migrate deploy`。

### 失败恢复

refresh 在 commit point 前失败时会保留或恢复旧的 `feline_blog_dev`。先运行：

```powershell
pnpm db:local:status
pnpm db:local:recover
```

如果状态返回 `OWNERSHIP_AMBIGUOUS`，不要手工删除数据库、卷或 lock。请按错误中给出的 lock、进程、数据库 OID 和 ledger 检查命令确认归属。

## 数据库与角色矩阵

| 环境 | 数据库 | 角色 | 用途 | 允许的主要能力 |
| --- | --- | --- | --- | --- |
| local | `feline_blog_dev` | `app_runtime` | Next.js runtime | 应用表 DML 与 sequence 使用，不可建库、建角色或改 schema |
| local | `feline_blog_dev` | `app_migrator` | `migrate dev` | 拥有 migration 对象，不可建角色或任意建库 |
| local | `feline_blog_shadow` | `app_migrator` | Prisma shadow | 仅 migration 开发流程 |
| local | `feline_blog_verify` | `app_migrator` | 空库 migration 重放 | 可清空重建，不承载日常数据 |
| local | `postgres` | `local_admin` | 维护、切换和恢复 | 仅 loopback 运维，不供业务使用 |
| staging | `postgres` | `app_runtime` | staging runtime | 应用运行权限 |
| staging | `postgres` | `app_migrator` | guarded deploy | 已提交 migration 部署 |
| staging | `postgres` | `app_exporter` | 本地 refresh 源 | 应用表和必要 metadata 的只读权限 |
| staging | `postgres` | `postgres` | exporter setup | 仅显式角色创建或轮换，不供日常使用 |

## 常见问题

| 现象 | 含义与处理 |
| --- | --- |
| `TARGET_REJECTED` | URL、角色、数据库、端口、环境标记或当前进程门禁不符合 allowlist。先运行对应 status，不要绕过检查。 |
| `MIGRATION_DRIFT` | 工作树 migration 与目标 `_prisma_migrations` 不一致。停止 refresh 或 deploy，先确认缺失、额外或 checksum 不一致的 migration。 |
| `ACTIVE_CONNECTIONS` | refresh 切换前仍有应用连接。停止 `pnpm dev` 和其他连接池后重试，工具不会强制终止它们。 |
| `RECOVERY_REQUIRED` | 存在未完成 ledger 或另一数据库操作持有 advisory lock。运行 status 与 recover。 |
| `OWNERSHIP_AMBIGUOUS` | 工具无法证明数据库、Docker volume、container 或 host lock 的所有权。保持现场并按提示人工检查。 |
| `RESTORE_FAILED` | staging dump 或本地 restore 失败。当前实现使用连续无进展超时，慢但持续的数据流不会因总时长被误杀。 |
| staging 域名只能解析 IPv6 | Windows、路由器、DNS 和代理都需要支持 IPv6。主机和 Docker 必须都能连接 direct endpoint 的 5432 端口。 |

旧命令只保留为提示别名。`postgres:migrate:dev` 会转到本地迁移参数白名单。`postgres:migrate:deploy`、旧角色配置和旧 smoke 命令会拒绝执行，并指向受保护的新命令。

`db:migrate:data:apply` 是 legacy MySQL 的显式迁移工具。它从 `.env.development` 读取 MySQL 源，从 `.env.staging` 读取 PostgreSQL 目标，并要求 direct Supabase allowlist 与当前进程的 `POSTGRES_MIGRATION_ALLOW_WRITE=true`。它不会进入本地数据库 dispatcher。

删除本地卷需要两个当前进程输入，且只允许本地 Docker context 和带项目所有权标签的卷：

```powershell
$env:LOCAL_DATABASE_DESTROY_ALLOW = "true"
pnpm db:local:destroy -- --confirm feline-blog-local:feline_blog_postgres_data
Remove-Item Env:LOCAL_DATABASE_DESTROY_ALLOW
```

## 开发边界

`config/database-legacy-allowlist.json` 仅允许 legacy 连接检查、数据迁移工具和 legacy client 自身引用旧数据库。`pnpm db:boundaries` 会检查静态与动态 import、require 和测试 mock；任何业务代码重新引入 legacy client、旧生成类型或 MariaDB driver 都会失败。

`pnpm dev` 只读取经过校验的 `.env.development`，并拒绝进程继承的数据库变量及 `.env`、`.env.local`、`.env.development.local` 中的受保护键。Prisma generation 与 validation 不加载数据库环境文件。Playwright 若要访问 staging，仍需自己的显式测试配置和单 worker 清理纪律。

## 控制台状态

- 用户已确认在 Supabase staging 控制台关闭 Data API；本会话没有控制台读取权限，因此未独立复核该控制台状态。
- Vercel `feline-blog-staging` 已关联当前工作区，Framework Preset 明确设为 Next.js，Preview 与该 staging 项目的 Production target 均配置了最小 PostgreSQL runtime/JWT 环境变量；部署已由 Vercel 标记为 `Ready`，稳定别名为 `https://feline-blog-staging.vercel.app`。在重新启用保护前，首页与 `/blog` 已实际访问成功，后者确认 Vercel Function 能读取 Supabase staging 数据。当前 SSO Deployment Protection 已重新开启，生产部署 URL 与所有 Preview 均要求通过 Vercel 身份验证。
- Vercel `feline-blog-production`、真正的 Production 数据库环境与 `dbBackup.sh` 未处理，均不得视为已验证。
