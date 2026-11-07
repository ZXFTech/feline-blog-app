# 本地连接线上中心准备记录

2026-11-05。用户授权新增独立配置、本地空库、独立命令并准备线上中心联调；是否部署博客改动留待验证后决定。本轮未创建线上 Client、发信或执行线上数据库操作，没有 ROOT 初始化、业务恢复、提交、推送或部署。

配置与登记的实际填写步骤见 [接入操作说明](../auth/user-center-online-local.md)。SDK/CLI 保持已核验 0.1.6，Better Auth 1.7.12、Node 22.21.1、pnpm 10.28.1、Prisma 7.3.0、Next 16.3.3 未升级。

## 已执行

新模式 runtime=development、target=production；origin 为本地 https://blog.user-center.test:3445，issuer 为 https://auth.zhaosie.com/api/auth。另建 .env.blog.local、profiles、registration、维护 env；生成独立 session secret 和数据库密码，不复制任何现有 Client Secret。

新 Compose project feline-blog-sdk-online-local，容器 feline-blog-sdk-online-postgres，卷 feline_blog_sdk_online_postgres_data，端口仅 127.0.0.1:54332，数据库 feline_blog_sdk_online_dev。运行/维护角色分别 blog_sdk_online_runtime、blog_sdk_online_migrator。集群标识 7704632939846848554，镜像固定为此前相同 PostgreSQL 17 bookworm digest。创建前检查端口、名称空闲，并锁定 Docker Desktop 本机 npipe endpoint，拒绝 DOCKER_HOST 覆盖、远端 context/endpoint。

18:34 完成原 Prisma 链 8 迁移和仅新角色的 ACL。原历史 SQL 未变，空占位目录保留；执行 snapshot 精确封闭到已审阅目录并核对摘要，不执行残留迁移。无 shadow/reset/Prisma seed。ACL SHA256 为 `178672127fd00a84bc3f8dd95c06491ddc6651b71aa717a2d36c655b3e6fd367`，标准 SDK migration SHA256 仍为 `a8344cd36ff8cadcf25c520921db4ab49a533f94038eb995ffce47341ea611c9`。

运行角色非 owner/superuser/BYPASSRLS、无建库/建角色/角色成员/DDL/TEMP，维护角色只拥有此新目标。TLS 1.3、明文拒绝、错误证书名称拒绝、真实 database/username/owner 匹配；Docker inspect 确认只挂公共 CA/独立叶证书，没有 CA 私钥或明文密码环境变量。

安装锁、用户插入/行锁、Account 插入、Session 插入/删除及角色/安装状态/cleanup/legacy session 越权拒绝共 9 项检查通过，fixture 全部回滚。最终 users=0、awaiting_root、revision=0，ROOT/恢复/开放字段为空。auth_ops 仍 disabled、Cron 未启用。全链并非整体原子事务，失败时保留有限诊断供前向修复，不自动删除旧资源或新卷。

共享 Next 启动 helper 保留旧模式，并对新模式固定 3445、独立 .next-online-center、线上 issuer、本地 DB 54332 及新凭据变量。DNS 仅许 127.0.0.1，显式传 hostname/cert/key/CA，屏蔽旧维护及平铺 DB 环境回退。新启动前核对实际本地存储并做公开 metadata 预检，启动不执行迁移。Cookie 命名空间不同已通过 SDK 公共 helper 合成测试，不依赖 Cookie 按端口隔离。

## 实际阻断项

离线配置只缺新 Client ID 和 LOCAL_TO_PRODUCTION_CLIENT_SECRET，数据库/CA/session 配置已填，session secret 与原本地模式不同。真实运行新 dev 命令在该处列缺项并退出，未监听 3445，没有用假 Client 启动。

18:26 线上公开 Discovery 可达且 issuer 匹配，但 user_center_environment 缺失；18:54 最终代码复核仍相同，metadata preflight 返回 BLOCKED / ENVIRONMENT_MISMATCH。该检测仅公开 GET、严格 TLS、无 Secret/Cookie，不是完整 SDK 初始化或 Client 验证；缺声明时停止，没有继续获取 JWKS或发起授权。没有删除 environment 或降低校验绕过。

## 检查结果

| 检查 | 本轮结果 |
| --- | --- |
| 新本地数据库 | 创建、迁移、owner/权限/TLS及9项回滚验证通过 |
| 独立资源 | 新实例/卷/角色；原博客/中心受保护容器ID、全部原卷与生产/中心/旧模式配置摘要保持；非本任务容器变化单独记录 |
| 新配置 | BLOCKED，明确只缺专用 Client ID/Secret；值未打印 |
| 线上公开 metadata | BLOCKED，声明缺失；不宣称 JWKS/Client/真实登录通过 |
| 定向回归 | 最终4文件34项通过，含工作目录保护及并发无关容器变化分类；不与全量或早先重叠批次相加 |
| 全量 Vitest | 142文件通过、2文件跳过；972项通过、35项跳过（随后新增的工作目录保护另以定向批次验证） |
| lint / 类型 | 全量lint、独立tsc通过；最终CLI路径保护改动也通过定向lint与tsc |
| 构建 | pnpm build通过，含513源文件边界检查、Next编译和类型；保留既有动态文件追踪及工程外package-lock提示 |

私有证据位于 .feline-blog/auth-rebuild/local-to-production-0.1.6/ 的 offline-check.json、metadata-check.json、postgres/resource.json、postgres/verification.json 和 postgres/migration-execution/result.json/受限CLI日志。公开登记信息可由专用 registration 命令重算；未记录任何密码、Client ID/Secret、token 或旧用户资料。

仍待：线上中心补齐 production 声明，用户创建并填写本地专用 Client，随后真实授权/回调/会话/退出回归。旧本地中心已通过的真实认证证据不替代新 target 的验收。生产兼容组合、ROOT/恢复/开放与博客上线均未宣称通过。

同会话只读审阅发现并已修正：Docker remote endpoint 风险、snapshot 额外迁移风险、独立 owner 核对、PASS 报告写入时序及新角色 INSERT 的初始 authVersion 限制。部分初始化失败时仍采用保留本地证据、人工审阅前向修复的边界，未增加自动 reset/删卷或远端维护能力。本记录不是 fresh model 正式合并前 review。

18:59 最终复核观察到一个非博客/非中心项目容器被替换，初始全 daemon 容器比较因此报告差异。已将该事实单独记录为 unrelatedContainerChanges=1，不把它写成“全部容器未变”。博客/中心容器缺失或任何原卷缺失仍会失败，回归已覆盖两种拒绝；没有尝试恢复、删除或操作无关项目。最终 db-check 通过、protectedResourcesPreserved=true、protectedConfigurationsUnchanged=true。
