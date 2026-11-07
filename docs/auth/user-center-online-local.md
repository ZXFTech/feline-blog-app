# 本地博客对接线上 User Center

2026-11-05。独立的 development 平台连接 production 中心，保留此前 development → development 配置、数据库、账号和服务。此文不是生产部署操作手册；博客改动是否上线留待独立验收和授权。

20:26 后续结果：本地专用 Client 配置 PASS、missing=[]，线上 production 声明、JWKS 和 SDK public ready 均通过。独立 3445 已启动，一次真实授权、回调、本地会话建立及退出已通过；新库保留 1 个普通用户和 1 个 Account，退出后 Session 为 0。业务资料尚未提交，ROOT/恢复/开放均未执行。详见 [本地连接线上认证联调记录](../reviews/2026-11-05-sdk-online-local-auth-roundtrip.md)。此前缺声明的结果保留在 [启动前复核记录](../reviews/2026-11-05-sdk-online-local-recheck.md)，已不是当前阻断。

## 已准备资源

| 项目 | 此新模式 | 原本地中心模式 |
| --- | --- | --- |
| Runtime / target | development / production | development / development |
| Issuer | https://auth.zhaosie.com/api/auth | https://auth.user-center.test:3000/api/auth |
| 平台 HTTPS origin | https://blog.user-center.test:3445 | https://blog.user-center.test:3443 |
| PostgreSQL | 127.0.0.1:54332 / feline_blog_sdk_online_dev | 127.0.0.1:54331 / feline_blog_sdk_dev |
| 运行身份 | blog_sdk_online_runtime | blog_sdk_runtime |
| 维护身份 | blog_sdk_online_migrator | blog_sdk_migrator |
| Next 输出目录 | .next-online-center | .next |
| 私有配置目录 | .feline-blog/auth-rebuild/local-to-production-0.1.6/ | .feline-blog/auth-rebuild/local-0.1.6/ |

新 PostgreSQL 实例、卷、网络、运行/维护密码和 session secret 均独立。镜像复用此前固定的 PostgreSQL 17 bookworm 摘要，没有升级旧实例。复用现有 blog.user-center.test hosts 和博客证书，证书不受端口变化影响；新数据库使用同一受信任 CA 签发的独立叶证书，没有复制 CA 私钥。SDK 公共 helper 的测试确认同 hostname 不同平台端口得到不同 Cookie 前缀。Cookie 本身不按端口隔离，这里的隔离来自 SDK 命名空间、不同会话密钥和不同数据库。

新的本地库已应用原链的 8 个迁移和新角色最小 ACL，用户/业务为空，只有安装及关闭的运维初始状态。安装阶段 awaiting_root、revision 0，没有 ROOT、恢复或开放。测试插入全部回滚。旧用户、源库和生产配置没有迁移或复制到此库。

切换 target 不会自动切数据库。这里通过另一份 profiles 文件显式绑定另一套本地资源；SDK 始终把 runtime 决定的 origin/库/会话密钥与 target 决定的中心分开。

## 专用 Client 登记与填写位置

本次已由用户完成创建和填写，下列步骤保留供核对；不需要重复创建或重新填入已有 Secret。离线检查通过不代表中心已验证凭据有效性。

1. 在**线上中心**的开发者控制台创建一个专供此本地博客的 Client。表单选择“本地开发”、confidential 服务端 Web，scope 为 `openid profile email`。创建资格与邮箱要求沿用线上中心规则，不复用线上正式博客或本地中心的 Client。
2. 将新 Client ID 写入：`.feline-blog/auth-rebuild/local-to-production-0.1.6/integration.profiles.json` 的 `runtimes.development.clients.production.clientId`。
3. 将新 Secret 只写入：`.feline-blog/auth-rebuild/local-to-production-0.1.6/.env.blog.local` 的 `LOCAL_TO_PRODUCTION_CLIENT_SECRET`。不要贴入聊天、JSON、命令参数或 NEXT_PUBLIC。

需要登记的实际 origin：

```text
https://blog.user-center.test:3445
```

SDK 0.1.6 describeRegistration 生成的完整回调，原样填写：

```text
https://blog.user-center.test:3445/api/auth/callback/user-center-98a220d64f4ba02e7d0780514ee6f98826f535588d30df723782aaf659ed0529
```

不要填写旧的固定 `/callback/user-center`，也不要使用 `https://blog.zhaosie.com` 的回调。表单的“本地开发”描述平台，不会把线上中心切换为 development。

数据库运行 URL、可信 CA、独立 session secret 已自动填写。`.env.maintenance.local` 只保存这个新本地库的维护 URL/CA，不能加载到 Next。公开示例是 `config/user-center.online.profiles.example.json` 和 `config/user-center.online.env.example`，实际运行读取的是忽略目录内的文件。

## 线上中心环境声明

此前 18:26 至 19:11（北京时间）的线上 Discovery 缺失声明，曾阻止启动。用户重新部署后，20:07 实际 Discovery/JWKS 和 SDK ready 已通过。实际响应必须继续包含：

```json
{
  "issuer": "https://auth.zhaosie.com/api/auth",
  "user_center_environment": "production"
}
```

后续若再次出现 ENVIRONMENT_MISMATCH，可由中心操作者核对实际部署、域名对应版本与该公开路径。不要把线上中心改成 development，不删去宿主 environment，不降低 TLS 校验。线上中心部署由中心操作者完成，本工程没有执行。

## 独立命令

以下命令在工程根运行，使用此前固定的 Node 22.21.1 / pnpm 10.28.1 入口。

```powershell
# 离线核对，已填写后的本次结果为 PASS
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:online:check

# 输出可复制的公开登记信息
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:online:registration

# 只 GET 明确线上中心的公开 Discovery/JWKS，无 Cookie/Client Secret
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:online:metadata

# 对所选单 Manifest 做离线 doctor，需先填写 Client
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:online:doctor

# 配置、实际本地存储和公开 metadata 预检通过后才启动 Next
.\.feline-blog\auth-rebuild\toolchain\pnpm.cmd auth:sdk:online:dev
```

新启动命令不会借用旧凭据。缺 Client、数据库绑定不符/表未准备、DNS 非回环或线上环境声明缺失时停止；不自动建库、迁移、seed 或修复线上中心。20:08 本次已启动 3445，20:26 一次登录回调与退出验证完成，服务继续运行。

条件补齐后打开：`https://blog.user-center.test:3445/login?returnTo=%2Fprofile`。改 Client 或配置后重启。旧模式继续使用 `auth:sdk:dev --env-file .feline-blog/auth-rebuild/local-0.1.6/.env.blog.local`，不会加载新文件。

资源初始化命令 `auth:sdk:online:prepare`、`auth:sdk:online:db:setup`、`auth:sdk:online:db:migrate` 已在本轮执行，**不需要重复**；它们固定只准操作此新本地资源，遇到已有配置/对象会停止，不覆盖秘密、不 reset、不删除卷。日常只读核验用 `auth:sdk:online:db:check`。如果初始化或迁移中途失败，应先查看本地 resource.json/受限 failure.json 和实际迁移历史，审阅具体前向修复；各阶段不是整体原子事务，不能自动删库回滚或伪造迁移记录。

## 同邮箱与后续验收

线上中心与本地中心即使邮箱相同，也属于不同 issuer 的身份。独立库会创建独立 User，不与原本地账号合并，不继承 ROOT。当前仍沿用只允许初始化候选账号完成资料的 awaiting_root 规则；普通业务未开放。本轮不初始化 ROOT 或恢复旧业务。

本轮已复查线上声明和所选单 Manifest，并完成用户亲自确认的首次授权、受控回调、本地会话、未完成资料门禁、刷新读取和退出。重新登录后仍需用户填写昵称并确认联系邮箱，本轮没有提交业务资料。注册邮件、完整 consent 分支、跨用户隔离、再次登录的身份稳定性、恢复/开放及上线评审仍需相应环境留证，doctor 的 COMBINATION_UNVERIFIED 不能改成正式兼容认证。上线前需另行审阅完整博客变更、生产存储/权限计划和回归，不自动提交、推送或部署。
