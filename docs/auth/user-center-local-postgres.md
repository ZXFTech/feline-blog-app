# SDK 本地 PostgreSQL TLS 目标

2026-11-05，操作者先授权创建独立本地 TLS 实例、新空库、运行与维护身份，随后明确授权“直接执行迁移，不要动线上”。16:07（北京时间）仅在此新实例完成 8 个 Prisma 迁移和运行身份权限；安装状态 awaiting_root、用户数 0。未执行备份、恢复、ROOT 初始化、开放或真实登录。详细证据见 [本地迁移记录](../reviews/2026-11-05-sdk-local-migration.md)。

## 已创建资源

| 项目 | 实际值 |
| --- | --- |
| Compose project | feline-blog-sdk-local |
| Container | feline-blog-sdk-postgres |
| 数据卷 | feline_blog_sdk_postgres_data |
| 主机与端口 | 127.0.0.1:54331，仅本机绑定 |
| 新数据库 | feline_blog_sdk_dev |
| 应用运行身份 | blog_sdk_runtime |
| 独立维护身份及库 owner | blog_sdk_migrator |
| 镜像 | 复用工程已固定的 PostgreSQL 17 bookworm 镜像摘要，未升级既有实例 |

镜像完整引用：

```text
postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652
```

所有新资源都有独立项目归属及随机实例标签。创建前核对名称、卷和端口空闲，创建后核对容器/镜像/卷标签/挂载/端口。原有容器 ID、数据卷名称和受保护配置文件均核对保留，没有向已有数据库发送 SQL。

Compose 和部署脚本只保存在受限忽略目录 `.feline-blog/auth-rebuild/local-0.1.6/postgres/`。可用以下只读命令查看此实例：

```powershell
docker compose --project-name feline-blog-sdk-local --file .feline-blog/auth-rebuild/local-0.1.6/postgres/compose.yaml ps
```

## TLS 与身份

复用现有本机 mkcert 根 CA，为数据库新签发独立叶证书，覆盖 `127.0.0.1` 和 `localhost`。没有复用博客服务私钥，也没有将 CA 私钥复制进工程或挂载进容器。

运行时证书位于容器 tmpfs，实际私钥 owner 为 postgres、权限 0600。数据库开启 TLS，最低版本 1.2，实际两种身份连接均协商 TLS 1.3。HBA 拒绝明文 TCP，仅允许目标库运行/维护身份通过 TLS 和 SCRAM 认证。容器内 PostgreSQL OS 身份通过限定 peer map 进行集群初始化与健康检查，不开放网络管理登录。

初次实际测试发现 Node PG 对流式 TLS 默认使用 localhost 做名称核验，已将数据库证书同时覆盖 IP 与 localhost，再仅重启这个新容器加载证书。严格证书校验始终开启，复测确认明文连接与错误证书名称都被拒绝。

应用与维护角色均为 LOGIN、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOINHERIT、NOREPLICATION、NOBYPASSRLS，没有额外角色成员关系。运行身份只有目标库 CONNECT 与 public schema USAGE，没有数据库/schema CREATE 或 TEMP 权限，也不能切换到维护身份。维护身份拥有这个新库，用于后续单独授权的表结构与数据维护。

另有仅用于新集群初始化的 blog_sdk_admin 身份，其密码独立保存，不进入应用或维护 env。容器配置使用密码文件路径，核对 Docker Config.Env 没有明文 POSTGRES_PASSWORD/PGPASSWORD。

创建资源时没有业务表，也未授予表 DML 或 RLS policy。后续依据新增的迁移授权，已安装标准认证表、业务表与限定运行权限。运行身份不是 owner，没有 BYPASSRLS，不能修改角色、旧密码模式、安装状态或恢复回执，也不能运行旧认证与清理函数。

## 本地模板

| 文件 | 已填写内容 |
| --- | --- |
| `local-0.1.6/integration.profiles.json` | development 的数据库 host、port、database、runtime username 与 URL 变量名 |
| `local-0.1.6/.env.blog.local` | PLATFORM_DEVELOPMENT_DATABASE_URL、PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA |
| `local-0.1.6/.env.maintenance.local` | 独立 POSTGRES_MIGRATION_URL、POSTGRES_SSL_CA；不能加载进 Next |
| `local-0.1.6/postgres/maintenance.binding.json` | 维护 URL 的非敏感精确绑定，用户名与运行身份不同 |
| `local-0.1.6/postgres/secrets/` | 自动生成的独立密码文件，权限限定当前用户与 SYSTEM |

上述路径相对于 `.feline-blog/auth-rebuild/`。密码没有进入命令参数、聊天、报告或 Docker 配置环境值。现有 Client ID、Client Secret、session secret、issuer、origin 和回调保持不变；生产、来源、旧本地运行及中心配置的受保护文件摘要也保持一致。

维护 URL 只指向同一个新空目标的维护角色，不能拿它替代运行连接。原 prepare 生成的生产/来源/维护模板没有覆盖。本地更新前的配置副本位于新资源受限目录，只是本地配置留档，没有数据库备份。

## 创建资源阶段验证结果

| 检查 | 结果 |
| --- | --- |
| 新容器 | running / healthy |
| 运行/维护精确身份 | 目标库、角色、owner 均匹配 |
| TLS | 两种身份 TLS 1.3；明文和错误证书名称均拒绝 |
| 角色权限 | 运行角色无 DDL/TEMP/维护成员关系；双方非 superuser、不可建库/建角色/绕过 RLS |
| 空库 | 用户关系 0、用户函数 0、自定义类型 0、大对象 0；仅 public 用户 schema，扩展仅内建 plpgsql |
| Prisma 迁移历史 | `_prisma_migrations` 不存在 |
| 原资源 | 原容器 ID、卷和配置摘要保持 |
| 密码和私钥 | 主机受限 ACL；活动数据库私钥 postgres:postgres 0600；无 CA 私钥挂载 |
| 离线 SDK 配置 | exit 0，selectedConfiguration=PASS、runtimeConfiguration=PASS，databaseMissing=[] |
| 离线 doctor | 配置、命名空间、跳转和秘密检查 PASS；overall BLOCKED、exit 2 / COMBINATION_UNVERIFIED |

doctor 使用宿主选择后导出的单 Manifest，没有 network 参数；未验证 Client 的中心有效性或真实 OAuth 流程。候选版本组合仍需正式集成验收，不能把其状态手动改成通过。本次创建资源时对新数据库做了明确的连接/TLS/只读目录验证；后续离线检查没有联网或连接数据库，两类证据分别记录。

最新结果均在受限忽略目录：

| 记录 | 范围 |
| --- | --- |
| `postgres/resource.json` | 资源归属、阶段与配置保护摘要 |
| `postgres/verification.json` | 新目标 TLS、身份、权限、空关系与函数 |
| `postgres/empty-catalog-verification.json` | 扩展、类型、大对象及无迁移表 |
| `postgres/isolation-verification.json` | 健康、原容器/卷保留、秘密文件与配置摘要 |
| `offline-review-latest.json` | 最新纯离线配置与 doctor 结果 |

## 最新迁移结果

16:07 在维护身份下完成同一 Prisma 链的 7 个历史迁移和 1 个 SDK 迁移，历史 SQL 的摘要与落库记录一致。已有空迁移占位目录没有 SQL，原样保留；执行器只把真实迁移按原名、原字节复制到受限执行目录。未使用 shadow 库、reset、Prisma seed 或旧开发编排器。受保护生产/中心/旧本地配置摘要未变，原容器 ID 和卷均保留。

运行权限位于 `docs/database/plans/0019-sdk-local-runtime.sql`。User 使用列级 UPDATE 和触发器保护权限字段；标准认证表使用服务器角色限定 RLS；旧认证资产无运行访问。安装状态与恢复回执只有 SELECT，资料填写通过无参数的受控函数锁定固定安装行，不授予安装表写权限。auth_ops 只开放原去敏摘要函数，未启用时按既有规则返回 CLEANUP_NOT_ACTIVE，清理和 Cron 执行仍拒绝。

实际 Better Auth 1.7.12 Prisma adapter、Profile 所需存储路径、跨用户 Account 全局唯一、Session token 唯一、合法外键、锁等待、越权拒绝及事务回滚共 30 项检查通过。测试数据全部回滚，User/Account/Session/Verification/Rate/Receipt 最终均为 0。安装状态为 awaiting_root、revision 0，没有 ROOT、恢复回执或开放时间。

Prisma status 没有待执行项。全库 diff 仍有 7 个旧认证外键的历史差异，SDK 新表没有差异。执行器只接受该已审阅差异的精确摘要，其他差异或 Prisma 错误会失败，详见迁移记录。

新增证据保存在 `postgres/migration-execution/` 的 `apply.json`、`status.json`、`storage-verification.json` 和受限 CLI 日志中。原空库验证记录保留作创建阶段证据，不能再用于描述当前表结构。离线配置检查仍通过，doctor 保持 COMBINATION_UNVERIFIED。

本地存储已具备继续真实认证联调的条件，尚未启动博客 SDK 服务或验证真实回调。ROOT/恢复/开放工具及目标真实认证回归仍待完成，不代表普通业务已经开放。

实现依据包括项目既有数据库隔离约定、[PostgreSQL 17 TLS 文档](https://www.postgresql.org/docs/17/ssl-tcp.html)、[角色属性文档](https://www.postgresql.org/docs/17/sql-createrole.html)与 [Postgres 官方镜像说明](https://hub.docker.com/_/postgres)。
