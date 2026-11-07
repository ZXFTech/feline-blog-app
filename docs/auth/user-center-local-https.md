# 本地 HTTPS 与专用 Client

2026-11-05，生产配置和原中心证书保持不变。操作者后续授权启动本地中心，本次仅以现有 development 配置启动 HTTPS 应用，没有执行数据库迁移、备份、恢复或其他数据库维护工具，没有代为登录、创建 Client 或发信。中心运行时沿用现有本地存储配置，不把应用启动与公开 metadata 检查当作数据库验收。

## 当前结果

| 项目 | 结果 |
| --- | --- |
| 中心 | 13:53（北京时间）按授权启动，使用 Node 22.21.1 与官方 scripts/auth-dev.mjs，监听 127.0.0.1:3000；启动入口不调用迁移、备份或恢复 |
| 中心证书 | 复用现有 certs/local.pem，覆盖 auth.user-center.test；证书与私钥匹配 |
| 公共 CA | 复用本机 mkcert CA，现有 Windows CurrentUser Root 已信任，没有新建或重复安装根 CA |
| 博客证书 | 独立签发给 blog.user-center.test，签名、SAN、有效期和私钥匹配检查通过 |
| Windows 浏览器信任 | 13:54 重新检查，Chromium 对中心 Discovery 和博客临时静态服务均通过严格 TLS，ignoreHTTPSErrors=false |
| Node 信任 | 独立 Node 设置 NODE_EXTRA_CA_CERTS 后严格 TLS 通过；实际 Next HTTPS 启动还需传 --experimental-https-ca，17:07 已修正，详见登录入口故障修复记录 |
| 中心环境声明 | 13:54 的真实 Discovery 为 HTTP 200、issuer 正确、user_center_environment=development |
| hosts | 第二次管理员确认成功，新增博客映射；两个本地域名均实际解析到 127.0.0.1，原 hosts 字节完整备份并保留 |

公共 CA 的 SHA256 指纹：

```text
A1:25:2A:6C:05:06:DB:30:56:A6:10:0E:1D:07:8E:36:90:7C:5C:58:2C:3A:30:BE:54:FB:0C:8F:CC:BF:B6:6B
```

博客证书文件均位于被 Git 忽略、权限限定为当前用户与 SYSTEM 的目录：

```text
.feline-blog/auth-rebuild/local/tls/blog.pem
.feline-blog/auth-rebuild/local/tls/blog-key.pem
.feline-blog/auth-rebuild/local/tls/rootCA.pem
```

博客证书有效至 2029-02-05，CA 有效至 2036-11-05。只复制了公共 CA，CA 私钥仍保留在原本机 mkcert 目录，没有进入工程。本地启动入口 `auth:sdk:dev` 已在子进程创建前设置该公共 CA，不改变系统或生产的 Node 环境变量。

证书与前次中心检查证据保存在忽略的 `local-0.1.6/tls-preparation.json` 与 `tls-and-discovery.json`。最新 DNS、Node、Chromium 结果在 `https-check.json`，hosts 结果及备份路径在 `hosts-update-result.json`。中心启动 PID、独立日志位置在 `user-center-start.json`，启动范围及配置核对在 `startup-verification.json`。博客仍仅用临时静态 HTTPS fixture 验证真实域名，测试后已关闭，未启动博客 Next；中心 HTTPS 服务继续运行。

## hosts 完成记录

管理员确认后已追加这一条映射，未改变生产域名：

```text
127.0.0.1 blog.user-center.test
```

已执行 `.feline-blog/auth-rebuild/local-0.1.6/hosts-update.ps1`。脚本在管理员权限下锁定并读取 hosts，先备份原始字节，再只追加上述本地域名，保留 Docker、中心和其他全部条目。核对备份/当前文件摘要、原字节前缀及唯一追加内容均通过。脚本不访问数据库或证书私钥。

以下命令仅保留为维护参考，当前无需重复执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .feline-blog/auth-rebuild/local-0.1.6/hosts-update.ps1
```

成功结果及备份路径已写入同目录 `hosts-update-result.json`。本次 `check-https.mjs` 已验证两个本地域名实际解析、中心 Discovery 以及中心/博客 Node/Chromium 严格 TLS，整体记录为 PASS。它临时占用 3443，退出后关闭博客静态服务，不启动博客或数据库工具。该检查直接读取中心公开 metadata，不直接连接数据库，也不声称中心应用运行无需存储。原 `auth:sdk:dev` 仍需 Client 和新空目标数据库准备完成后才能用于真实联调。

## 中心环境声明

实际检查地址：

```text
https://auth.user-center.test:3000/api/auth/.well-known/openid-configuration
```

13:54 最新结果为 HTTP 200，`issuer=https://auth.user-center.test:3000/api/auth`，`user_center_environment=development`。启动前只读核对中心 `.env.local` 的 AUTH_ENVIRONMENT 与本地 BETTER_AUTH_URL，数据库 URL 仅检查 PostgreSQL 和 loopback 属性，不输出值。启动器显式加载现有本地文件，阻止继承的生产 selector 覆盖它；没有改写该文件。13:38 曾记录的 ECONNREFUSED 属于启动前历史状态，现已重新核验通过。

中心选择器是 AUTH_ENVIRONMENT，博客选择器是 USER_CENTER_RUNTIME_ENVIRONMENT；不要混用。博客 runtime/target 仍为 development/development。该结果只证明本次公开 metadata 与信任检查通过，不证明 Client、账号、回调换码或存储可用。

## 本地专用 Client 创建与填写

现在可由你在本地中心登录，打开 `https://auth.user-center.test:3000/developer/apps`，选择“创建应用”。需要已验证邮箱，以及有效普通白名单资格或中心管理员自动准入资格；注册或验证邮箱本身不授予创建资格。资格未开通时由中心管理员处理，本任务没有修改权限或名单。

| 表单字段 | 填写值 |
| --- | --- |
| 名称 | neon cat Blog 本地联调（名称可自行调整） |
| 类型 | 服务端 Web / Confidential，client_secret_basic |
| 运行环境 | 本地开发 |
| 应用地址 / Origin | https://blog.user-center.test:3443 |
| Scope | openid、profile、email |
| 登录回调 | 下方完整地址，原样登记 |
| 可选登出回调 | 暂留空，当前 SDK 只做平台本地退出 |

```text
https://blog.user-center.test:3443/api/auth/callback/user-center-51bef208206f514b143fc56cb4362f26b5612b162bb7da0d7acc47c2d01e0bb8
```

运行环境字段不会切换中心，务必在本地 auth.user-center.test 创建。不能复制生产平台的 Client 或旧 Generic OAuth 固定 `/callback/user-center`。授权码与 S256 PKCE 交给官方库/SDK，不手动构造协议参数。

创建成功后，Client Secret 只展示一次，请直接保存到忽略文件，不发到聊天：

| 数据 | 本地填写位置 |
| --- | --- |
| Client ID | `.feline-blog/auth-rebuild/local-0.1.6/integration.profiles.json` → `runtimes.development.clients.development.clientId` |
| Client Secret | 同目录 `.env.blog.local` → `LOCAL_TO_DEVELOPMENT_CLIENT_SECRET` |

已有 PLATFORM_DEVELOPMENT_SESSION_SECRET 保持不变，不用 Client Secret 替代。丢失 Secret 时通过中心正规轮换，不尝试从详情页读取旧 Secret。修改配置后需重启博客，当前不启动真实联调。

2026-11-05 14:43（北京时间）重跑离线检查后，已检测到本地 Client ID 和 Secret，均与生产模板不同；session secret 至少 32 字符且独立，env 无重复键。证书有效期、博客域名、CA 签名、私钥匹配和 Node 公共 CA 文件路径检查均通过。该结果只证明本地输入与文件检查，未在线验证 Client 登记或 Secret 有效性。

当时仍缺以下新空博客数据库配置，后续 15:25 已按明确授权全部补齐，最新状态见本节末及 [本地 PostgreSQL TLS 目标](user-center-local-postgres.md)：

| 位置 | 缺少的值 |
| --- | --- |
| profiles 的 `runtimes.development.database` | hostname、database、username |
| 本地 env | PLATFORM_DEVELOPMENT_DATABASE_URL |
| 本地 env | PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA |

urlEnv 已指向 PLATFORM_DEVELOPMENT_DATABASE_URL，port 当前为 5432，仍需与实际新空目标核对。这里的 mkcert CA 仅用于本机 HTTPS，不能替代数据库服务的 CA；没有把中心或生产连接复制给博客。

离线配置检查返回 2，selected/runtime configuration 均为 BLOCKED；doctor 入口在 profiles 选择阶段返回 3 / ENVIRONMENT_MISMATCH，未调用 CLI，也没有回退生产配置。5 份现有受保护配置的检查前后摘要一致，本地输入在检查期间保持不变。去敏结果保存在 `.feline-blog/auth-rebuild/local-0.1.6/offline-review-latest.json`，本次没有联网、连接数据库、迁移、备份或恢复。

此前 13:54 的真实 HTTPS/Discovery PASS 证据继续保留，离线检查不重新核验其在线状态。

15:25 后续结果：独立 TLS 实例 `127.0.0.1:54331`、新空库 `feline_blog_sdk_dev`、运行/维护身份已创建并填好本地模板。新数据库使用现有 CA 签发的独立证书，CA 内容匹配其真实签发链；运行及维护连接均已通过 TLS 1.3 和权限检查。宿主离线配置 exit 0、缺项为空；CLI doctor 配置/秘密项 PASS，整体 exit 2 / COMBINATION_UNVERIFIED。已有 Client 和 session secret、生产与旧库配置保持，未执行数据库迁移、备份或恢复。

上述为创建空库阶段的结果。16:07 操作者另行授权后，仅向此新本地库应用 8 个 Prisma 迁移并安装最小表列权限/RLS。适配器、唯一约束、外键、安装锁与越权拒绝已做回滚验证；库仍没有用户，状态 awaiting_root，ROOT/恢复/开放与真实认证流程继续待实施和独立验收。生产配置、中心数据库及旧本地数据库均未操作，见 [本地迁移记录](../reviews/2026-11-05-sdk-local-migration.md)。

mkcert 的 Windows 信任、公共 CA 与 Node 额外 CA 用法以其 [官方说明](https://github.com/FiloSottile/mkcert) 为依据。
