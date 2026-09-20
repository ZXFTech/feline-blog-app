# MySQL 到 PostgreSQL 迁移计划

## 不变规则

每个环境只有一个业务权威写入库。不得双写，不得在 PostgreSQL 失败或无数据时自动回退 MySQL。保留旧库不等于允许旧代码继续写入；生产切换、反向同步和删除旧库都需要单独授权。

## staging 已完成

2026-09-19 已在 Supabase staging 完成以下工作：

1. 建立独立 PostgreSQL Prisma schema、config、migration history、generated client 和严格 TLS runtime。
2. 迁入身份、博客/标签、Todo、番茄钟、日常健身和 Prompt 的全部模型及约束。
3. 从 legacy MySQL 单事务导入 3,835 条测试数据，保留 ID、关系、时间和密码哈希，并修复 sequence。
4. 对 16 个数据集逐表执行行数与 SHA-256 校验，结果一致。
5. 将所有业务数据库入口切到 `src/db/client.ts`；legacy MySQL 仅由连接检查和迁移工具访问。
6. 通过静态检查、构建、单元测试、边界检查和 desktop/mobile 数据库专项 E2E。

## 当前运行与回退边界

日常本地开发现在以 `feline_blog_dev` 为本地权威库。Prisma shadow 工作只使用 `feline_blog_shadow`，从空库重放只使用 `feline_blog_verify`。Supabase staging 仍是远程 staging 环境的权威库，但本地应用不会隐式连接它。若 staging 出现问题，应保持 PostgreSQL 权威并向前修复；任何回切都必须先设计并验证反向增量对账。

旧 MySQL、legacy schema/client 和迁移脚本暂时保留，用于审计与人工恢复准备。不得删除旧数据库、备份或凭证，也不得由普通业务代码访问它们。

## 后续阶段（不在本轮执行）

1. staging Data API 已由用户确认关闭；后续如取得控制台读取权限，再独立复核关闭状态、暴露 schema、grants 与 RLS。
2. 观察 staging 连接池、慢查询、错误率与真实使用；当前 runtime pool 上限为每进程 5。
3. 为 Preview/Production 分别准备角色、CA、runtime/migration/shadow 连接与备份恢复演练。
4. 在独立批准的生产切换窗口重新执行源数据快照、停写、导入、校验和应用切换；不得复用 staging 的“已验证”结论代替生产验证。
5. 只有生产稳定期结束、恢复证据充分且再次获得授权后，才考虑移除 legacy 代码、配置和旧数据库。

本地生命周期命令只管理 Compose project `feline-blog-local` 和卷 `feline_blog_postgres_data`。它们不授权 `feline-blog-production` 发布、`dbBackup.sh` 修改或任何远程数据库删除。
