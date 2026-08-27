# Prisma 数据层

## Overview

这里定义 MariaDB 使用的数据模型和迁移历史。Prisma 7 客户端生成到仓库根目录的 `generated/prisma`，运行时由 MariaDB 适配器创建客户端。

## Key files

| File                   | Owns                                 |
| ---------------------- | ------------------------------------ |
| `prisma/schema.prisma` | 模型、关系、枚举、索引和生成器配置   |
| `prisma/migrations/`   | 必须提交的数据库迁移历史             |
| `prisma.config.mjs`    | 模式、迁移目录和 `DATABASE_URL` 配置 |
| `src/db/client.ts`     | MariaDB 连接参数和 Prisma 客户端单例 |

## Commands

```bash
# Generate the development client
pnpm prisma-generate:dev

# Create and apply a named development migration
pnpm prisma:dev migrate dev --name <descriptive-name>

# Apply committed migrations in production
pnpm prisma-migrate-build
```

## Conventions

- 请先修改 `schema.prisma`，再生成并检查迁移。不要手工修改 `generated/prisma`。
- 请提交迁移目录，生产部署会在服务器上运行 `prisma migrate deploy`。
- 涉及计数器、关联表或多个模型的一致性修改时，请使用 Prisma 事务。
- 请保留用户范围内的唯一约束，例如标签的 `userId + content` 和番茄记录的 `userId + eventId` 组合。

## Gotchas

- 数据源 provider 是 `mysql`，运行时适配器是 `@prisma/adapter-mariadb`。生成和迁移使用 `DATABASE_URL`，应用连接还需要独立的数据库主机、用户、密码和库名变量。
- `generated/prisma` 被 Git 忽略，并且位于 `src` 外。缺少生成客户端时，请先运行生成命令。
- `dbBackup.sh` 是含敏感本地假设的旧脚本。请不要复制其中的凭据，新脚本应从环境变量读取秘密。

## Agent skills

- [prisma-orm-v7-skills](../.agents/skills/prisma-orm-v7-skills/): `gocallum/nextjs16-agent-skills`, Prisma ORM 7 的破坏性变更和排错约定

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
