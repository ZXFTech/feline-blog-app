# SDK 生产备份、隔离存储与发布记录

2026-11-05，北京时间。操作者授权先备份指定账号、跳过恢复演练、上线，并确认原博客 Supabase 同库新增隔离 schema。未创建新 Supabase 项目、购买或升级资源。

| 项目 | 实际结果 |
| --- | --- |
| 来源备份 | 22:10 完成并校验，Blog 13、Todo 117、PomodoroRecord 307，完整清单在受限目录 |
| 来源保护 | 实际只读事务；精准记录 pg_cron 本人历史 DELETE 例外，没有执行来源写入或修改既有 ACL |
| 新目标 | 同一博客项目的 feline_sdk_prod；独立 runtime / migrator 身份与新密码 |
| TLS 与路由 | 严格 CA 验证、session pooler 项目限定、后端身份和资源标记均通过 |
| 隔离 | 新 runtime 无 schema CREATE、可切换角色或旧 public 表列权限 |
| 迁移 | 独立迁移链 deploy/status 通过；首轮检查错误完整回滚并留历史，修正后成功 |
| 初始状态 | awaiting_root、revision 0、用户 0，没有 ROOT、恢复或 activate |
| 旧 public | 用户数、ID/角色与表列 ACL 摘要前后一致 |
| SDK | SDK/CLI 0.1.6、Better Auth 1.7.12，可信归档摘要复核通过 |
| 构建工具 | 本机 Node 22.21.1 / pnpm 10.28.1；Vercel 项目 Node 22.x |
| 测试 | 全量 1017 通过、35 跳过，144 个文件通过、2 个跳过；不叠加前面重叠批次 |
| 静态检查 | tsc、lint、数据库依赖边界通过 |
| 生产构建 | 隔离输入 build 通过；Tailwind 收紧 src 扫描修复原扫描挂起 |
| 文件追踪 | 认证路由、api/me、profile、资料页均包含固定非敏感 production profiles |
| doctor | 配置与秘密检查通过；COMBINATION_UNVERIFIED 保留，不声称正式兼容 |
| 公开中心 | 严格 HTTPS Discovery 返回匹配 issuer 和 production 声明 |
| Vercel | 正式域名属于既有 feline-blog-staging 项目的 Production；旧部署 ID 已记录 |
| 发布状态 | READY，正式域名已切到 dpl_FyErprNK4W1ejwkdSGmErBEWu28R；独立添加八项 SDK 变量，原生产变量保留 |
| 正式匿名探测 | health/login/get-session 均 200，api/me 401，todo 503 维护；未出现配置或认证依赖故障标记 |
| 浏览器 | 正式登录页 1280×720 light 显示正常，hydration 后登录按钮可用；点击成功跳到线上中心 |
| 真实生产认证 | 中心返回 invalid_client / client not found，未进入回调；需要正式博客专用 Client |
| 未运行项 | 恢复演练按指令跳过；生产真实认证、ROOT、业务恢复、activate 未完成 |

生产迁移 SHA256 为 `3d74dd968cac88b3e6590ea0bbf9f5ca229babbe5f80a623d5166aa12ea0c137`。来源备份和新目标记录均在忽略目录 `.feline-blog/auth-rebuild/production-0.1.6/`，包括 source-backup.json、namespace-resource.json、namespace-migration-apply.json、release-validation.json 和 package-manifest.json。秘密、完整连接串和业务行不进入此报告。

正式版本于约 23:25 北京时间切换，旧 deployment 保留。新 schema 用户、账号、会话和恢复收据均为 0，保持 awaiting_root。没有把失败的真实授权记为通过，也没有声称业务已经开放。内部旧 auth_ops 状态接口未适配新身份，不能授予旧 schema 权限绕过；本次没有启用外部监测。

旧 public 没有执行数据库级写入冻结，当前备份不能冒充最终截止快照。维护状态发布后仍需完成 Client 补齐、真实生产认证与单账号恢复，才能开放业务。没有提交、推送或启用 Cron。详情及 Client 填写位置见 [生产接入说明](../auth/user-center-production.md)。

后续：2026-11-06 已补填正式 Client 并发布新部署，一轮真实登录、回调、刷新与平台退出通过。该结果见 [独立记录](2026-11-06-sdk-production-client-refresh.md)，不改写本报告的首次发布失败历史。ROOT、业务恢复与开放仍未完成。
