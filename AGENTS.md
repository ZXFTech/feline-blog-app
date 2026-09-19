# feline-blog-app

## Stack

- **Language / Runtime**: TypeScript, React 19, Node.js 22.21.1 in CI
- **Framework**: Next.js 16 App Router with Turbopack
- **Key dependencies**: Prisma 7 with Supabase PostgreSQL (legacy MariaDB retained for migration tooling), custom JWT authentication, Tailwind CSS 4, Sass, Radix UI, OpenAI SDK, Vitest, Testing Library, Playwright
- **Package manager**: pnpm 10.28.1 in CI

## Build approach

Tracer Bullet（每次把一个真实功能从界面、权限、数据到实际使用完整打通）。

## Commands

```bash
# Install
pnpm install --frozen-lockfile

# Dev server
pnpm dev

# Generate the development Prisma client
pnpm prisma-generate:dev

# Check and build
pnpm lint
pnpm build

# Test
pnpm test
pnpm test:e2e
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Rules

- 请用 `@/*` 导入 `src` 中的模块，并保持 TypeScript 严格类型。
- 请把页面和路由放在 `src/app`，默认使用服务端组件，只有浏览器状态或事件需要时才添加 `"use client"`。
- 请把数据库操作放在 `src/db` 的服务端操作或 `src/app/api` 中，不要让客户端组件直接访问 Prisma。
- 请用 `requireAuth`、`hasTodoRoles` 或 `hasBlogRoles` 保护写操作，并沿用 `token` HttpOnly Cookie 的 JWT 认证流程。
- 请不要编辑 `generated/prisma-postgres` 或 `generated/prisma`，修改模式后重新生成客户端。
- 请复用 `src/components/ui` 中的基础组件、`NeuSurface`、`NeuPanel`、`cn` 和主题变量，不要另建平行的组件体系。
- 请把本地配置放在被忽略的环境文件中，不要提交或复制密钥。
- 提交前请运行 lint、build、Vitest 和需要安全测试账号环境变量的 Playwright；Husky 的推送脚本仍含旧工作区路径，不要把它当作完整验证。

## Agent skills

- [typescript-react-patterns](.agents/skills/typescript-react-patterns/): `asyrafhussin/agent-skills`, React 组件、Hook 和类型安全约定
- [migrate-radix-to-base](.agents/skills/migrate-radix-to-base/): `shadcn-ui/ui`, Radix UI 到 Base UI 的迁移约定
- [react-hook-form](.agents/skills/react-hook-form/): `pproenca/dot-skills`, React Hook Form 配置、订阅、校验与组件集成约定
- [tailwind-css](.agents/skills/tailwind-css/): `paulrberg/agent-skills`, Tailwind CSS 4 样式、配置与验证约定

Declined: Vitest、React Testing Library、Playwright 和 jsdom 的额外 Agent Skills；继续使用现有 `/test` 技能与 Browser 控制。

MCP servers: `next-devtools` (recommended, connection pending)

## Context files

- [src/AGENTS.md](src/AGENTS.md): App Router、认证、服务端操作和界面约定
- [prisma/AGENTS.md](prisma/AGENTS.md): Prisma 模式、迁移和生成客户端约定
- [design.md](design.md): 全站界面设计系统、交互与可访问性方向

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database migration boundary

- 所有业务模块已切换到 PostgreSQL，统一从 `src/db/client.ts` 或 `src/db/postgres` 进入。
- 业务代码禁止导入 `src/db/legacy-mysql/client.ts`、`generated/prisma` 或 MySQL/MariaDB 驱动，也禁止双写或失败后自动回退。
- legacy MySQL 仅供精确允许名单中的连接检查和显式迁移工具使用；修改这些工具时不得改变业务数据源归属。
- 新表和 schema 变更只加入 `prisma/postgres`；旧 MySQL schema 仅保留审计和必要的迁移源维护。
- 连接、迁移、权限、切换和回滚操作遵循 `docs/database/README.md` 与 `docs/database/migration-plan.md`。
