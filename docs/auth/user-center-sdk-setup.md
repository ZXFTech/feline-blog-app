# User Center SDK 本地接线

当前开发依赖已于 2026-11-07 升级为官方 registry 的 SDK/CLI 0.1.10，安装及干净验证方式见 [registry/CI 接线](user-center-registry-ci.md)。下文保留 0.1.6 初次接线及旧归档的历史证据，不再作为新工作站准备 tgz 的要求；本次代码升级不代表现网版本已升级。

2026-11-05，本轮使用 SDK/CLI 0.1.6，沿用规格 0019 的新空目标、新认证账号与单账号业务恢复方案。源库、旧 User ID 和其他旧账号保持不动。代码接线不代表真实登录与存储验收已经完成。

SDK 接线和只读检查阶段未直接连接数据库；后续按操作者明确授权启动本地中心，并另建独立的本地 PostgreSQL TLS 实例、新空博客库及运行/维护身份。16:07（北京时间）按新增的“直接执行迁移，不要动线上”授权，仅迁移 `127.0.0.1:54331/feline_blog_sdk_dev` 并安装最小运行权限。17:50 已确认一次本地真实登录、回调、资料完成与退出，普通 USER 和 Account 保留，Session 为 0。未执行备份、恢复、ROOT 初始化、开放、发信或部署。原生产配置与先前 `local/` 配置保留，新增博客配置位于 `local-0.1.6/`。详情见 [本地迁移记录](../reviews/2026-11-05-sdk-local-migration.md) 和 [真实认证往返验证](../reviews/2026-11-05-sdk-local-auth-roundtrip.md)；完整目标验收仍待完成。

## 工程与交付

目标工程为 `C:\Users\Feline\Desktop\vibeCoding\feline-blog-app`，只读交付根为相邻的 `C:\Users\Feline\Desktop\vibeCoding\user-center`。读取公开交付说明、SDK 指南、环境说明、支持矩阵与独立样例，不依赖中心私有运行源码或数据库。

按交付 `docs/releases/0.1.6.md` 核对两个 tgz、release-manifest.json 及 SHA256SUMS。固定摘要在 `scripts/auth-rebuild/contracts.ts`：

| 文件 | SHA256 |
| --- | --- |
| user-center-next-better-auth-0.1.6.tgz | 71d123c06eafa96f44af0271a6cb1d272bfdd73d0bd9a9e4fd93859c01e62686 |
| user-center-cli-0.1.6.tgz | 4042cdee4e090abdcfdf5cf6989976ab9c3d833667acefeb0b4493ec5ecc8f35 |
| release-manifest.json | 9d4a2ee9f84e0e6e1a7834c45a744d0f112e63d24e638638369848cf51eaaef7 |

SDK/CLI 已固定安装 0.1.6，并更新锁文件。Better Auth 1.7.12、server-only 0.0.1、Zod 4.6.5 为宿主直接依赖。Next 16.3.3、React 19.2.4、Prisma 7.3.0 保持不变。归档位于忽略的 `.feline-blog/auth-rebuild/release/0.1.6/`，没有覆盖旧版本。

制品未获公开分发许可，不能提交归档。新工作站与 CI 安装前，需要从受信私有渠道准备锁文件所指的相同归档并核验摘要。没有配置制品仓库、CI 凭据或发布归档。安装关闭生命周期脚本。

固定工具链入口 `.feline-blog/auth-rebuild/toolchain/pnpm.cmd` 使用项目本地 Node 22.21.1、pnpm 10.28.1。系统全局版本不作为本轮证据。

## 本地配置

当前 `runtime=development`，`target=development`，`authBasePath=/api/auth`，`authUserPolicy=allow-new`。

| 文件 | 用途 |
| --- | --- |
| `.feline-blog/auth-rebuild/local-0.1.6/integration.profiles.json` | 本地公开 JSON，Client ID 和新空目标数据库绑定均已填写 |
| `.feline-blog/auth-rebuild/local-0.1.6/.env.blog.local` | 服务端秘密与选择器，Client Secret、运行 URL/CA 已填，独立 session secret 保持 |
| `.feline-blog/auth-rebuild/local-0.1.6/.env.maintenance.local` | 同一新空目标的独立维护 URL/CA，不注入 Next |
| `.feline-blog/auth-rebuild/local-0.1.6/registration.json` | 0.1.6 公开 helper 生成的登记信息 |
| `.feline-blog/auth-rebuild/local-0.1.6/offline-check.json` | 去敏离线检查，不是联网或数据库结果 |
| `config/user-center.profiles.example.json` | 可审阅的无秘密示例，空值有意无效 |
| `config/user-center.local.env.example` | 可审阅的变量名示例，不含真实秘密 |

宿主服务端显式读取 USER_CENTER_CONFIG_FILE，以 USER_CENTER_RUNTIME_ENVIRONMENT 和可选 USER_CENTER_TARGET_ENVIRONMENT 调用 `resolveEnvironmentConfig`。这是宿主约定，SDK 不会自行读取变量或文件。当前实现只接 profiles，不回退旧 Manifest 或另一环境的平铺变量。

页面与服务端实例使用同一份只读配置快照，凭据和连接池选项也一同捕获。修改配置需要重启。只有 development 能显式跨环境；staging/production 跨环境拒绝。未来本地改连远端时，origin、会话密钥和数据库仍取 development，另登记本地回调专用 Client 并加入 `development.clients[target]`。当前模板只保留本地 Client，没有空白的生产 Client 项，也没有复制生产凭据。

## 登记信息

新增的“本地平台 → 线上中心”模式使用独立 3445 origin、54332 新本地库、配置与命令，保留本页原本地中心模式。其专用 Client 和 production 声明已补齐，一次真实授权、回调和退出通过，见 [联调报告](../reviews/2026-11-05-sdk-online-local-auth-roundtrip.md)。填写位置、完整回调和独立命令见 [本地对接线上中心](user-center-online-local.md)。正式博客改用独立 production profiles 和同库新 schema，当前发布与验证进展见 [生产接入](user-center-production.md)。不通过更改 target 自动切数据库或复用其他 origin 的 Client。

| 项目 | 值 |
| --- | --- |
| Issuer | `https://auth.user-center.test:3000/api/auth` |
| 平台 HTTPS origin | `https://blog.user-center.test:3443` |
| 表单环境 | 本地开发 |
| Client 类型 | confidential 服务端 Web |
| Scope | `openid profile email` |

精确回调：

```text
https://blog.user-center.test:3443/api/auth/callback/user-center-51bef208206f514b143fc56cb4362f26b5612b162bb7da0d7acc47c2d01e0bb8
```

Provider ID 由 issuer 派生，不能写回旧固定 `user-center`。回调与此前同 issuer 的哈希一致，不表示可以复用生产平台 Client。

在本地中心 `/developer/apps` 创建满足原有资格与邮箱规则的“本地开发”“服务端 Web”应用，登记以上 origin 和完整回调。表单环境不会切换中心，因此要在本地中心操作。Client ID 填到 `runtimes.development.clients.development.clientId`，Secret 只填本地 env 的 LOCAL_TO_DEVELOPMENT_CLIENT_SECRET，不贴到聊天。

生产 issuer、origin、Client 及模板仍在上一层 `integration.template.json` 与 `runtime.env.template`，应用不会自动加载。本轮没有创建 Client。

## 仍需准备

2026-11-05 后续 HTTPS 检查已复用现有中心证书与本机受信任 mkcert CA，并生成博客独立证书。博客 hosts 映射已成功追加，原文件字节完整备份。按操作者后续授权，13:53（北京时间）仅启动本地中心官方 HTTPS 开发入口；13:54 复核中心 Discovery 为 HTTP 200、development 声明正确，两个本地域名真实解析及中心/博客 Node/Chromium 严格 TLS 均通过。没有执行数据库迁移、备份或恢复。详情、证据边界与本地 Client 创建步骤见 [本地 HTTPS 与专用 Client](user-center-local-https.md)。

博客需要真实的 `local/tls/blog.pem`、`blog-key.pem`、`rootCA.pem`，相对于 `.feline-blog/auth-rebuild/`。证书覆盖 blog.user-center.test，中心证书覆盖 auth.user-center.test；浏览器与 Node 都要信任公共 CA，不复制 CA 私钥。中心预期路径仍记录在先前 `local/https.config.json`。NODE_EXTRA_CA_CERTS 必须在 Node 启动前设置。

中心 Discovery 须返回 `user_center_environment=development`，最新启动后真实公开请求已确认相符。后续缺失、不符或未知声明仍保留 ENVIRONMENT_MISMATCH，不省略 environment 或降低 TLS 校验继续。

新空博客目标的公开绑定填写到 `runtimes.development.database`，包括 urlEnv、实际 hostname、port、database、username。urlEnv 已指向 PLATFORM_DEVELOPMENT_DATABASE_URL；5432 只是待核实的 PostgreSQL 默认端口。真实 URL 和可信 CA 只填本地 env 的 PLATFORM_DEVELOPMENT_DATABASE_URL 与 PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA。

Pool 创建前调用 `assertPostgresBinding`，核对主机、端口、库名和身份，拒绝查询参数覆盖路由。此接入要求可信 CA 的 TLS 存储，旧 POSTGRES_ENVIRONMENT=local 不能关闭 TLS。不自动复用旧无 TLS 本地库、现有业务库、生产库或中心库。Better Auth 使用同一个宿主 Prisma 客户端与连接池工厂。

来源和维护配置仍分开保存。来源配置不进入 Next；维护连接只显式读取 POSTGRES_MIGRATION_URL 和可信 CA，不回退应用连接。

## 已接线行为

`/api/auth/[...all]` 仅挂 SDK GET/POST，runtime 为 Node。浏览器只收到 publicConfig，登录 DTO 只有可选 returnTo。state、nonce、PKCE、换码和验签由 SDK/Better Auth 处理。旧密码、JWT、旧会话、POST bridge 与绑定 API 停用为 404，SDK 失败不回退。

只读业务 resolver 按当前新 authUserId 读取同一 User，不按邮箱合并旧账号，不跨 issuer 关联 subject。资料缺失保持 unmapped。资料事务锁安装状态及当前 User，复查派生 Provider、subject、认证邮箱和展示摘要，拒绝浏览器 userId/role/email。重复完成不覆盖既有资料，显式邮箱确认只改业务快照与时间。ROOT 没有网页提升入口。

角色仍来自博客 User，Todo、Blog、ROOT 和资源归属规则保持。页面/API/Action 受统一维护门禁保护，初始化期账号操作按候选或指定 ROOT 限制。缺状态、中心不符或收据归属不符都不开放业务。页面直接返回 503 维护文档，避免 Next rewrite 将状态重置成 200。未完成资料用户的合法原目标保留到 setup，并再次校验。

退出只在 SDK 确认后清除客户端状态并导航。SIGN_OUT_UNCONFIRMED 不显示成功、不自动重试，可主动检查会话。平台退出不宣称撤销中心或其他平台会话。按 0019 使用 86400 秒且不自动续期的标准平台会话，不承诺旧逐请求 introspection 的即时撤销语义。

## 离线检查与后续启动

本轮可运行的无数据库、无网络检查：

```powershell
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:check-local --env-file .feline-blog/auth-rebuild/local-0.1.6/.env.blog.local
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:test-env
```

第一条缺资源时返回 2 并列明缺项。第二条直接调用已安装 SDK，使用内存适配器及合成 Discovery/JWKS，不是实际中心或存储验证。

配置完整后，宿主导出所选单 Manifest，再运行离线 doctor：

```powershell
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:profiles export --env-file .feline-blog/auth-rebuild/local-0.1.6/.env.blog.local
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:profiles doctor --env-file .feline-blog/auth-rebuild/local-0.1.6/.env.blog.local
```

显式 env 文件覆盖同名继承环境变量，NODE_ENV 未设置时使用 development，不自动加载 .env.staging。doctor 只接导出的单 Manifest，没有 profiles/runtime/target CLI 参数。无 network 参数，不验证 Client、真实登录或存储，也不替代 environment 严格检查。15:25 最新离线复核已补齐 Client 与新目标数据库配置，宿主配置检查 exit 0；实际 CLI 的配置与秘密项 PASS，整体 exit 2 / COMBINATION_UNVERIFIED，候选组合仍待正式集成验收。这是本次 0.1.6 的实际结果，未沿用历史版本结果。详情见 [本地 PostgreSQL TLS 目标](user-center-local-postgres.md)。

经授权准备存储与 HTTPS 后，下面入口只启动 Next，不调用原 pnpm dev 的数据库编排器，也不自动迁移或 seed：

```powershell
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:dev --env-file .feline-blog/auth-rebuild/local-0.1.6/.env.blog.local
```

本地博客现已使用此入口启动。17:07 后修正开发域名许可、Next HTTPS 子进程 CA 参数和请求 hostname。随后用户完成一次真实登录、回调、资料确认和退出；17:50 核对 SDK logout:OK、Session 从 1 变为 0，用户与 Account 保留，状态仍为 awaiting_root，普通业务保持维护门禁。详情见 [真实认证往返验证](../reviews/2026-11-05-sdk-local-auth-roundtrip.md) 和 [登录入口故障修复](../reviews/2026-11-05-sdk-local-login-fix.md)。安全界面回归 `pnpm test:sdk:ui` 另用不存在的配置，在 3444 启动本机 HTTP 预览，只测维护门禁与 Album fixture，不代表 HTTPS 或真实登录通过。

此入口使用固定博客域名作为 Next hostname，启动前核对所有 DNS 结果仅为 127.0.0.1；使用 IP hostname 会使 Next 交给 SDK 的 Request.url 被规范为 localhost，从而被 SDK 的严格 origin 校验拒绝。Next 配置只许可 blog.user-center.test 请求开发资源；启动命令同时传 `--experimental-https-ca`，因为启用 HTTPS 时仅在父进程设置 NODE_EXTRA_CA_CERTS 不足以保留子进程的 CA 信任。没有关闭 SDK origin/environment 校验或 TLS 校验。

## 数据库与验收门槛

标准认证模型、资料字段、AuthInstallState 与 BusinessRestoreRun 已登记为 `prisma/postgres/migrations/20261105090000_user_center_sdk_016/migration.sql`。历史 SQL 草案只留作设计记录，不是执行入口。本地新目标实际应用了同一 Prisma 迁移链的 7 个历史迁移与 1 个 SDK 迁移，历史文件字节未改，未使用 shadow/reset/seed。安装状态初值是 awaiting_root、revision 0，所有认证和业务用户均为空。

本地角色授权位于 `docs/database/plans/0019-sdk-local-runtime.sql`，仅由固定本机、端口、库、身份、TLS CA、容器/卷标签及集群标识的 `scripts/auth-rebuild/migrate-sdk-local.ts` 执行。运行身份不是 owner，没有 BYPASSRLS；不能改角色/旧密码模式、写安装状态/恢复回执、执行旧认证或清理函数。固定安装锁函数让资料填写能取得共享行锁，而不授予安装表 UPDATE。真实 Better Auth 适配器读写、跨用户 Account 全局唯一、Session token、外键、权限拒绝、锁等待与事务回滚已在本地验证。旧认证外键仍有已审阅的历史 schema 差异，详见迁移记录；未宣称全库 diff 为零。

bootstrap、restore、activate CLI 尚未提供，不能手改角色或状态替代。已有备份工具仅提供准备、只读来源检查、一致业务导出及离线验证，未运行真实备份。恢复时才显式映射源用户到新 ROOT，认证字段与权限不从旧数据恢复。

本次结果见 `docs/reviews/2026-11-05-sdk-0.1.6-local.md`。0019 正文仍有 0.1.4/平铺配置及设计时授权，scope 和根/嵌套 AGENTS 仍有旧认证描述，需后续收口；这些历史文字不代表本轮数据库授权。真实注册/邮件、consent、回调换码、稳定身份、页面/API、刷新/退出、存储与恢复均须目标环境独立留证，未宣称生产或 M2/blog 已通过。
