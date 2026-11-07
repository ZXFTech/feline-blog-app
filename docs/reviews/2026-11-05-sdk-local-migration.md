# SDK 本地迁移记录

2026-11-05，北京时间。此记录覆盖新增授权“可以了，相信你，直接执行迁移，不要动线上”，沿用 0019 的新空目标、新认证账号和单账号业务恢复方案。

## 实际范围

仅连接 `127.0.0.1:54331/feline_blog_sdk_dev`，Compose project 为 feline-blog-sdk-local，容器为 feline-blog-sdk-postgres，卷为 feline_blog_sdk_postgres_data。维护身份 blog_sdk_migrator，运行身份 blog_sdk_runtime。Runtime 和 target 均为 development，issuer 与 origin 沿用本地专用配置。

使用本地固定 Node 22.21.1、pnpm 10.28.1、SDK/CLI 0.1.6、Better Auth 1.7.12 和 Prisma 7.3.0。SDK/CLI 交付摘要沿用 [接线记录](2026-11-05-sdk-0.1.6-local.md)，本轮未安装或覆盖其他版本产物。

执行前核对固定 endpoint、库名/角色、严格 TLS、现有 CA、Docker 镜像/容器/卷标签、loopback 端口绑定和集群 system identifier 7704583393095794729。空关系及无迁移历史检查通过后才执行。未连接线上、中心库或旧本地库；未进行备份、恢复、ROOT 初始化、激活、真实登录、发信、提交、推送或部署。

## 迁移及权限

16:07 成功执行 Prisma 7.3.0 migrate deploy，7 个历史迁移加 1 个 SDK 迁移，共 8 个。迁移记录名称、checksum 与工程真实 SQL 逐一匹配，没有未完成或回滚的迁移，没有待执行项。

- 正式 SDK SQL：`prisma/postgres/migrations/20261105090000_user_center_sdk_016/migration.sql`，SHA256 `a8344cd36ff8cadcf25c520921db4ab49a533f94038eb995ffce47341ea611c9`。
- 本地运行 ACL：`docs/database/plans/0019-sdk-local-runtime.sql`，实际安装 SHA256 `054b899449768129cc1f53a37cbc0e702a7430b85901a30b8056efa2437e5a3c`。
- 固定目标执行器：`scripts/auth-rebuild/migrate-sdk-local.ts`。维护 URL 仅由受限 `.env.maintenance.local` 读取，不回退应用/生产连接，也不进入命令参数。

原目录 `20261026000000_center_only_environment` 没有 migration.sql。未补造历史、删除占位或修改旧迁移；只将 8 个真实迁移原名、原字节复制到受限执行目录，以等价的显式 Prisma config 执行。该配置没有 shadow URL。Prisma CLI 的临时 URL 只增加 strict TLS 与公共 CA 文件参数，原 env 不改。没有运行 reset、db push、Prisma seed 或原开发编排器。

User/Session/Account/Verification 具备标准模型、Session token 唯一、全局 Account(providerId,accountId) 唯一及合法 FK。保留旧认证表作为停用资产，不授予新运行身份访问。用户权限字段由列级 UPDATE 和触发器共同保护，运行身份无 User DELETE、无安装状态/恢复回执 DML、无维护成员资格、无 DDL 或 BYPASSRLS。

安装行共享锁通过固定 `feline_sdk_lock_installation()` SECURITY DEFINER 函数取得，无参数、不写状态、固定 search_path，PUBLIC 无权。宿主资料路径改为调用该函数，避免为了 SELECT FOR SHARE 给运行身份安装表 UPDATE。此锁实际阻塞并超时拒绝了并行维护 UPDATE，双方事务随后回滚。

auth_ops 清理仍为 disabled，Cron job 和 activated_at 为空，history_mode=disabled。运行身份只能调用原去敏摘要；未激活时该函数按原规则拒绝 CLEANUP_NOT_ACTIVE。清理/Cron 执行均拒绝，没有安装或启用 pg_cron。

迁移链不是一个整体事务，ACL 另有事务。若未来执行失败，已完成的迁移不会自动撤销；执行器会记录 deploy 结果、migrationExecuted/runtimeAclInstalled 与有限错误码，拒绝对非空目标再次 apply。应先用 status 查看历史和受限失败记录，按实际失败点单独审阅前向修复或 ACL 安装，禁止 reset、伪造 migrate resolve 或切换线上目标。本次 deploy、ACL 与验证均成功，没有执行恢复路径。

## 结构比对边界

Prisma 全库 diff exit 2，仅涉及 7 个旧认证外键：identity.user、flow.browser/legacyUser、session.user/identity/browser 的 ON UPDATE 与 schema 的 CASCADE 差异，以及 browser.currentFlow 的约束名。它们来自旧迁移与既有 schema，不影响新 SDK 表，保留停用资产没有为此改动历史或在线库。

已审阅 SQL 差异的规范化 SHA256 为 `3ed9b3ab644b2947795a072ad55c3f9f7fbbdb4d9274690168295cb18babad84`。执行器明确标为 KNOWN_LEGACY_FK_DRIFT，只允许这一精确差异；其他差异、非零 status 或 Prisma 错误均拒绝。未宣称全库 schema diff 为零。旧 SECURITY DEFINER 注册流程不再向新身份授权，它也不适配新的 required updatedAt，不能复用旧入口。

## 本轮验证

| 验证 | 结果及实际边界 |
| --- | --- |
| migrate deploy / 后续 status | exit 0 / exit 0，8 个迁移，checksum 全部匹配 |
| 真实存储验证 | 30 项通过，最终 16:17 完成；用实际 Better Auth 1.7.12 公开 Prisma adapter，全部 fixture 回滚 |
| Adapter CRUD | User、Account、Verification、Session；Prisma updatedAt 自动维护、会话退出所需删除、事务回滚通过 |
| Profile 存储 | 安装锁、安装/回执读取、User 行锁与业务资料更新、Rate upsert 通过 |
| 约束 | 不同用户的同 provider/subject 被全局唯一拒绝，大小写邮箱、Session token 唯一及 Account/Session FK 通过 |
| 越权拒绝 | role/authMode/password/authVersion、User DELETE、安装/回执写入、旧认证存储、清理/Cron 执行、DDL、SET ROLE 均拒绝；插入 ROOT 或 legacy 用户被触发器拒绝 |
| 最终状态 | awaiting_root、revision 0；User/Account/Session/Verification/Rate/Receipt 均为 0，无 ROOT/恢复/开放 |
| 配置离线检查 | exit 0，selected/runtime PASS，databaseMissing=[]；不联网或连接 DB |
| CLI doctor | 配置与秘密项 PASS；overall BLOCKED / exit 2 / COMBINATION_UNVERIFIED；未验证真实 Client 或回调 |
| 工程验证 | lint 通过；Vitest 137 文件通过、2 文件跳过，930 项通过、35 项跳过；边界检查 499 个源文件通过；build 通过，独立 tsc 检查通过 |

首次沙箱内定向 Vitest 因 Windows 临时缓存 rename EPERM 未加载测试；改用工程临时目录后，全量套件通过。构建保留既有动态文件追踪警告及工程外 package-lock 提示，未扩大本轮改动。未重跑真实安全账号 Playwright，也未把先前 4 项离线 UI 结果累加为本轮或真实登录结果。

最后再次核对原容器 ID、卷和受保护配置摘要，均保留。私有证据位于 `.feline-blog/auth-rebuild/local-0.1.6/postgres/migration-execution/`；其中 apply.json、status.json、storage-verification.json 以及 CLI 日志不含对外披露用途，秘密仍只在忽略模板中。公开报告不记录 Client ID、Secret、密码或会话密钥。

本地存储门槛已补齐，可以进入真实认证联调；尚未实际验证 consent、回调换码验签、稳定身份、资料完成后的页面/API、刷新或退出。ROOT 初始化、业务恢复、开放工具也未完成。普通业务继续保持维护门禁，未宣称生产兼容、MVP 或 blog 已通过。
