# SDK 0.1.6 生产接入

2026-11-05，操作者授权先备份指定账号、跳过恢复演练并上线，随后确认复用原博客 Supabase 的同一数据库，新增隔离 schema。该选择见规格 0019 的 [生产补充](../specs/0019-user-center-sdk-rebuild/production-schema.md)。

## 实际目标

正式地址为 `https://blog.zhaosie.com`，中心为 `https://auth.zhaosie.com/api/auth`，平台 runtime 和 target 均为 production。公开 Discovery 已通过严格 HTTPS 返回 production 声明。

域名当前绑定现有 Vercel 项目 `feline-blog-staging` 的 Production 部署。项目 ID 为 `prj_4H4cwmCHz3e4xEtoaA7YIHKXAGOA`，旧 deployment 为 `dpl_7iU7krvMQaZxU3F23nJEcHRWRVHQ`。项目名称中的 staging 不代表本次 SDK runtime。

SDK 生成的正式回调为：

```text
https://blog.zhaosie.com/api/auth/callback/user-center-98a220d64f4ba02e7d0780514ee6f98826f535588d30df723782aaf659ed0529
```

2026-11-05 首次正式授权被中心以 `invalid_client / client not found` 拒绝。2026-11-06 操作者已补填正式博客专用 Client，并明确授权更新其 SDK 专用 Secret 和发布；新部署 `dpl_AhwxpWkdeEbmd1bNGkmeojNpP4Hd` 已生效，一轮真实登录、回调、刷新和博客平台退出通过，退出后 User/Account 各 1、Session 0。证据及后续业务开放状态见 [Client 更新验证](../reviews/2026-11-06-sdk-production-client-refresh.md)，不能复用 3445 本地回调 Client。

## 同库隔离

Supabase 项目固定为 `zjnjjzgxiltulkuhrjng`，原 public 和旧用户保留。新目标为 `feline_sdk_prod`，使用新生成密码的 `blog_sdk_prod_runtime` 与 `blog_sdk_prod_migrator`。新运行身份没有 schema CREATE、可切换角色或旧 public 表列权限。它不连接中心数据库。

宿主生产变量 `PLATFORM_PRODUCTION_POSTGRES_SCHEMA` 必须精确为 `feline_sdk_prod`。PrismaPg 和限定原生 SQL 使用同一服务端配置快照。development 与 staging 继续使用 public，不更换已验证的本地存储。

生产迁移使用独立的 `prisma.sdk-production.config.mjs` 和 `prisma/postgres/sdk-production/migrations`，只读取受控 launcher 提供的 `SDK_PRODUCTION_MIGRATION_URL`。不能用默认 public 迁移链、reset 或 db push 替代。2026-11-05 23:08 北京时间迁移状态与隔离权限核验通过，用户数为 0，安装状态 awaiting_root、revision 0，尚未初始化 ROOT、恢复或开放业务。

初次空目标检查误把 Prisma 迁移记录表的主键索引视为业务对象，事务完整回滚。确认仅有迁移记录对象、没有业务表或枚举后，用 Prisma 显式记录回滚，再应用修正的检查。失败与成功历史均保留。旧 public 的用户数、ID/角色与表列 ACL 摘要前后一致。

## 配置与发布输入

受限且忽略的 `.feline-blog/auth-rebuild/production-0.1.6/` 保存以下文件，不提交秘密：

| 文件 | 用途 |
| --- | --- |
| integration.profiles.json | 真实 production profiles，中心、Client ID、origin 和数据库绑定 |
| .env.runtime.local | 独立 Client Secret、session secret、运行连接、可信 CA 与 schema |
| .env.maintenance.local | 专用维护连接与 CA，只供维护进程读取 |
| .env.provision.local | 资源创建身份，只供本次限定创建及只读对照，不加载到 Next |
| namespace-resource.json | 目标标记、状态与来源对照摘要 |
| source-backup.json | 已完成备份的标识及摘要 |
| package-manifest.json | 隔离发布输入及 SHA256 清单 |
| upload/ | 经扫描的部署输入，不含真实 env、备份和维护秘密 |

SDK/CLI 固定 0.1.6，Better Auth 1.7.12。本机构建使用 Node 22.21.1 和 pnpm 10.28.1，Vercel 项目为 Node 22.x。两个 tgz、release-manifest.json 和 SHA256SUMS 再次核验，不公开分发私有归档。

根 `.vercelignore` 拒绝上传 `.feline-blog` 和真实 env，因此发布使用单独的受限 upload 目录，其忽略文件仅允许经过核验的 SDK 归档。Vercel link 自动产生的本地 env 已删除。新 SDK 服务端变量单独添加，原生产变量保留，维护及来源连接不发送给 Vercel。

`next.config.mjs` 为固定非敏感 production JSON 设置普通路由文件追踪，并固定 Turbopack 根。Proxy 使用独立追踪，因此配置加载器静态导入 `config/user-center.production.profiles.json`；仅当环境变量精确选择该路径时使用打包对象，其他配置路径仍明确读取，不回退。秘密仍仅由选定变量提供。Tailwind 明确只扫描 src，避免隔离发布目录中的默认扫描挂起。发布配置不执行迁移、不启用 Cron。运行连接池在创建后挂载 `@vercel/functions` 的 `attachDatabasePool`，让 idle 连接在 Vercel 挂起前正常释放。

## 来源备份与开放前提

指定账号业务备份于 2026-11-05 22:10 北京时间完成，清单与内容摘要校验通过。包含 Blog 13、Todo 117、PomodoroRecord 307，以及关系闭包和共享表白名单，完整清单留在受限备份目录。

备份实际使用 REPEATABLE READ READ ONLY，并验证 transaction_read_only。来源唯一元数据写权限是 pg_cron 默认 PUBLIC DELETE 的本人历史；工具严格核对扩展成员、RLS、唯一策略、非 owner、无额外写权后记录这个例外，绝不执行 Cron 删除，也不改变来源 ACL。其余写权限仍拒绝，不能称该凭据全库零写权限。

原备份保留为时间点快照。2026-11-06 已补齐 [维护命令](user-center-maintenance.md)，通过来源 owner 持锁、独立只读最终快照和完整内容校验，完成指定新账号 ROOT 初始化与单账号业务恢复，目标数据库 ready、revision 3。新账号取得新 User ID，不按邮箱认领旧 ID。开放后曾发现会话池耗尽导致维护响应，修复后正式 HTTP 只读冒烟通过，13 篇文章及归属匹配；部署为 `dpl_AdfHeDB9Xx71LyMMPfVsTuBrTXLo`。结果及登录浏览器验收状态见 [本次恢复记录](../reviews/2026-11-06-sdk-production-restoration.md)，不能只凭数据库 ready 宣称页面已开放。

## 验证边界

本次维护与修复的最终全量 Vitest 为 1042 通过、35 跳过，另 2 项本机 HTTP 测试被沙箱端口权限阻止，单独在沙箱外重跑均通过；不把原全量命令记为退出 0。相关 lint、526 个源文件的数据库依赖边界和最终 Vercel 生产构建/类型检查通过。本轮 Windows 最终本地 build 遇到 Turbopack 子进程启动失败，保留为未通过；详细批次与证据见恢复报告。

doctor 配置 schema、namespace、导航和两项秘密检查通过；依赖组合保持 BLOCKED / COMBINATION_UNVERIFIED，因为 SDK 交付没有这组精确 Next/React 版本的正式证据。真实登记、存储和运行不属于 doctor 验证范围。不能把本机构建或历史本地登录结果称为正式兼容组合或生产验收通过。

操作者跳过恢复演练，记录为未运行。生产登录、回调、资料确认、刷新与平台退出结果见 [认证报告](../reviews/2026-11-06-sdk-production-client-refresh.md)；ROOT、最终快照恢复、来源保留、后续业务开放检查见 [恢复报告](../reviews/2026-11-06-sdk-production-restoration.md)。初次发布及备份记录保留在 [2026-11-05 报告](../reviews/2026-11-05-sdk-production-preparation.md)。

## 当前 Client 补齐方法

在 `https://auth.zhaosie.com/developer/apps` 核对当前登录账号的应用。正式博客使用 confidential 服务端 Web Client，环境选择生产，origin 为 `https://blog.zhaosie.com`，scope 为 `openid profile email`，精确回调使用本文上方的 SDK 派生地址。应用名可用 `zhaosie-blog-production`，不要选择本地开发或填写 3443/3445 回调。创建资格、邮箱要求及必要授权沿用中心规则。

只在受限本地文件填写：`integration.profiles.json` 的 `runtimes.production.clients.production.clientId`，以及 `.env.runtime.local` 的 `PRODUCTION_USER_CENTER_CLIENT_SECRET`。其他运行连接、CA、schema 和 session secret 保持。秘密不贴聊天，也不要改旧平铺生产模板来代替新配置。随后重新导出非敏感 JSON、检查、更新这次 SDK 专用 Vercel 变量并重新发布，再进行真实生产授权。Client 创建和中心授权由操作者在中心完成，本次没有自动创建 Client 或访问中心数据库。
