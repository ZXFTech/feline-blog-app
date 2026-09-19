# Prisma 数据层

## Overview

这里同时保存 legacy MariaDB 与当前 Supabase PostgreSQL 的独立模型和迁移历史。业务已全部切换到 PostgreSQL；legacy 资产只供迁移与审计。两个 Prisma 客户端与配置不得互相覆盖。

## Key files

| File                   | Owns                                 |
| ---------------------- | ------------------------------------ |
| `prisma/schema.prisma` | 模型、关系、枚举、索引和生成器配置   |
| `prisma/migrations/`   | 必须提交的数据库迁移历史             |
| `prisma.config.mjs`    | 模式、迁移目录和 `DATABASE_URL` 配置 |
| `prisma/postgres/schema.prisma` | PostgreSQL 模型与独立生成目录 |
| `prisma/postgres/migrations/` | PostgreSQL 独立迁移历史 |
| `prisma.postgres.config.ts` | PostgreSQL CLI 与迁移连接配置 |
| `src/db/legacy-mysql/client.ts` | MariaDB 客户端单例 |
| `src/db/client.ts` | 新开发默认的 PostgreSQL 客户端入口 |

## Commands

```bash
# Generate the development client
pnpm prisma-generate:dev

# Generate and validate both isolated clients
pnpm prisma:generate
pnpm prisma:validate

# Create and apply a named development migration
pnpm prisma:dev migrate dev --name <descriptive-name>

# Apply committed migrations in production
pnpm prisma-migrate-build
```

## Conventions

- 请先修改 `schema.prisma`，再生成并检查迁移。不要手工修改 `generated/prisma`。
- PostgreSQL 只修改 `prisma/postgres/schema.prisma`，并显式使用 `prisma.postgres.config.ts`。不要把 legacy migration SQL 用到 PostgreSQL。
- 所有业务模型与后续变更只加到 PostgreSQL。旧 MySQL schema 只允许迁移源的必要维护和安全修复。
- 请提交迁移目录，生产部署会在服务器上运行 `prisma migrate deploy`。
- 涉及计数器、关联表或多个模型的一致性修改时，请使用 Prisma 事务。
- 请保留用户范围内的唯一约束，例如标签的 `userId + content` 和番茄记录的 `userId + eventId` 组合。

## Gotchas

- 业务数据源 provider 是 `postgresql`，运行时适配器是 `@prisma/adapter-pg`。legacy `mysql` provider 与 `@prisma/adapter-mariadb` 仅由迁移工具使用。
- `generated/prisma` 被 Git 忽略，并且位于 `src` 外。缺少生成客户端时，请先运行生成命令。
- `dbBackup.sh` 是含敏感本地假设的旧脚本。请不要复制其中的凭据，新脚本应从环境变量读取秘密。

## Agent skills

- [prisma-orm-v7-skills](../.agents/skills/prisma-orm-v7-skills/): `gocallum/nextjs16-agent-skills`, Prisma ORM 7 的破坏性变更和排错约定

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
