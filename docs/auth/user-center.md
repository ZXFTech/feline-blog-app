# 用户中心与旧账号绑定

本轮按 user-center 的 `0003-feline-blog-integration` 规格实现。备份恢复不在本轮。默认关闭新入口，部署方须先完成兼容代码和数据库权限切换，再开放绑定。

## 配置

生产固定 `FELINE_PUBLIC_ORIGIN=https://blog.zhaosie.com`、`USER_CENTER_ISSUER=https://auth.zhaosie.com/api/auth`、`USER_CENTER_CLIENT_ID=feline-blog`。回调固定为博客 origin 加 `/api/auth/callback/user-center`。中心使用独立数据库，显式配置 `AUTH_APPLICATION_PROFILE=feline-blog` 与本应用专用机密。

`APP_ENV=staging` 时允许显式配置的规范 HTTPS `FELINE_PUBLIC_ORIGIN`，即使使用生产构建也保留 Secure 与 host Cookie。自动 staging 部署将其设为固定 `STAGING_BASE_URL` 的 origin；随机 candidate 域不属于认证来源。此调整适配现有旧账号登录，不启用完整用户中心接入；issuer、client、回调登记和运维部署身份约束未扩展。

`USER_CENTER_CLIENT_SECRET` 与中心 `FELINE_OAUTH_CLIENT_SECRET` 使用同一个本应用专用值。`FELINE_SESSION_SECRET` 是至少 32 随机字节的 base64。`FELINE_GRANT_KEYRING` 格式为 `{"active":"key-id","keys":{"key-id":"32-byte-base64"}}`，值由部署机密注入，不放入文档或 Git。三个机密不复用。

`USER_CENTER_LOGIN_ENABLED`、`USER_CENTER_BINDING_ENABLED`、`USER_CENTER_ONBOARDING_ENABLED` 只接受 `true` 或 `false`，缺省关闭。`FELINE_REGISTRATION_MODE` 只接受 `closed` 或 `center`，缺省 `closed`。本地注册 API 始终拒绝创建用户。

继续使用项目 PostgreSQL URL、TLS CA 和有限查询超时。`FELINE_TRUSTED_PROXY` 缺省关闭，此时缺少可信连接 IP 的请求共享一个保守桶。只有 Node 入口被网络规则限制为可信反向代理、代理覆盖客户端 `X-Real-IP` 时，才能配置为 `true`。不读取 XFF。生产代理不得记录认证 query、请求正文、cookie 或 Authorization。

## 发布顺序

1. 确认目标库与实例，只应用 `prisma/postgres` 的新增迁移。关闭原本地注册，三个新入口开关保持关闭。
2. 部署认识 `authMode/authVersion` 的全部实例，退出旧实例和旧任务。核对原用户均为 legacy，业务 ID 与关系保持不变。
3. 使用维护连接执行 `node --import tsx scripts/auth/install-permissions.ts --apply`。默认运行角色为 `app_runtime`，如需其他专用角色，通过 `FELINE_DATABASE_RUNTIME_ROLE` 明确指定。维护 URL 不得进入 Next 进程。脚本只改 feline 的 users、新认证表和明确白名单函数，不调整共享项目其他对象或全局 Data API。
4. 核对运行角色不是对象所有者、超级用户、BYPASSRLS 或所有者成员。入口在权限检查失败时返回 503。分别验证 anon/authenticated 无认证字段、表和函数权限。
5. 在隔离库和测试账号完成浏览器验收后，开启 LOGIN、新用户入口，再小范围开启 BINDING。生产 HTTPS、邮件送达、权限和调度仍须按目标环境另行验收。

首次 center 用户出现后不能回到只认旧 JWT 的代码。异常时保持兼容鉴权与 LOGIN，关闭 BINDING/ONBOARDING，注册设为 closed。原密码散列已被清除，不通过开关或删除映射恢复旧密码。

## 会话与清理

新 cookie 为随机凭据，生产使用各自的 host cookie。中心 grant 逐会话加密，不续写、不静默刷新。每次受保护读取在线核验 active、sub、sid、client、到期和 scope。中心或认证查询故障返回可重试 503。已确认失效撤销本地凭据，后续新登录不能恢复旧会话。

退出在本地事务递增浏览器 epoch，撤销本浏览器会话和流程，下一次登录要求中心新密码认证。退出不需要中心在线，本地数据库失败时明确失败。流程有效期始终为 300 秒。

部署调度每 5 分钟执行 `node --import tsx scripts/auth/cleanup.ts`，同一实例不重叠运行。每笔事务按 100 个浏览器和 100 个限流桶的有界批次处理，脚本连续排空，最多执行 500 批或在 30 秒预算后停止发起下一批，已开始的查询仍受数据库查询超时约束。日志分别返回 flows、sessions、browsers、rates 的实际删除数量及 pending。只有 pending 为 false 才返回 success 为 true 和退出码 0；预算耗尽、锁竞争无进展或数据库故障均返回非零退出码，调度应在 1 分钟内续跑。单次预算可处理最多 50,000 个限流桶，不把预算耗尽误报为清理完成。

调度须监测每次退出码、pending、success 及最近一次成功时间，连续三次失败或超过 15 分钟没有完成记录时告警并扩容或处理锁竞争，最迟在到期后 24 小时内排空。目标环境应以实际峰值流量验证吞吐和故障重试，保留安全余量，不能只证明定时器已触发。不因清理失败延长授权。生产调度接线、告警和峰值验收仍为 NOT RUN，仓库不会修改其他项目的计划任务。

grant keyring 轮换先加入新密钥并切换 active，保留旧密钥至会话到期。签名密钥轮换先关闭新流程并取消未完成流程，再全实例更换；不接受旧 CSRF/flowProof 签名。浏览器 epoch 和 requireFreshAuth 保留。

## 本地验证

从 user-center 仓库运行 `node scripts/feline-integration-env.mjs` 和 `node tests/helpers/feline-runtime-seed.mjs`，建立独立容器、库、角色与随机脱敏夹具。脚本遇到已有同名夹具会停止，不默认重置数据库。私有环境写入 user-center 的 ignored artifacts 与本工作树 ignored `.env.local`。

Next 的 `.env.local` 只包含运行连接和应用密钥。测试维护连接放在 ignored `.feline-blog/test.env` 与夹具清单，只有 Vitest 或 E2E 测试进程读取；中心初始化也仅在维护 CLI 进程注入迁移连接。两个应用实例均不持有维护连接。验证时使用 CI 指定的 Node 22.21.1，不切换其他项目的默认 Node。

在本工作树直接运行 Next 测试实例，避免原 `pnpm dev` 数据库包装。`node scripts/auth/run-e2e.mjs` 使用 `playwright.isolated.config.ts` 和专用端口，不启动或复用 3000 上的旧应用。数据库集成测试只允许 127.0.0.1:54341 的 feline_blog_dev。真实库不能传给该测试入口。

本轮结束后临时容器和应用测试进程均已停止，夹具清单更名为 ignored `environment.completed.json`，失效的运行与测试环境文件已移除。复跑请先从 user-center 重新执行上面两个初始化命令，生成新夹具后分别启动中心 18080 和博客 13000；旧清单仅供私有执行记录查阅。
