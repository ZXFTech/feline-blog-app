# 生产 Client 更新与真实认证验证

后续 ROOT 初始化、最终快照恢复和业务开放检查另见 [本次恢复记录](2026-11-06-sdk-production-restoration.md)。本文保留本次认证批次结束时 awaiting_root 的历史状态。

2026-11-06，北京时间。操作者补填新的正式博客 Client，明确授权将对应 Secret 发送到 Vercel `feline-blog-staging` 项目的 Production，仅更新 `PRODUCTION_USER_CENTER_CLIENT_SECRET`，继续发布并验证正式登录、回调和退出。旧 public 与现有业务数据保持。

## 已完成

新配置保持 production → production，issuer 为 `https://auth.zhaosie.com/api/auth`，origin 为 `https://blog.zhaosie.com`，schema 为 `feline_sdk_prod`。本地配置严格校验通过，数据库、CA、session secret 与其他生产变量没有因 Client 更新而更换。公开 Discovery 的 production 声明与严格 HTTPS 核验通过。

CLI 在操作者完成设备授权后核实登录账号为 `zhaosie-practice`。Secret 只经 stdin 更新到 SDK 专用变量，不进入命令参数、源码、发布输入或报告。先前自动审批对具体秘密传输的拒绝已由操作者明确确认后重新执行成功。

隔离发布输入为 610 个文件，清单 SHA256 为 `c113bc778735204b883c40c138e950d3ba35af0fc8552b440ad4a649462c3e7c`。本机 Node 22.21.1 / pnpm 10.28.1 生产 build 通过，认证路由、api/me、profile 和资料页的追踪清单包含非敏感 production profiles。SDK/CLI 固定 0.1.6，Better Auth 1.7.12。

Vercel 新部署 `dpl_AhwxpWkdeEbmd1bNGkmeojNpP4Hd` 已 READY，远程生产 build 与 TypeScript、数据库依赖边界检查通过。正式域名已指向此部署，旧部署 `dpl_FyErprNK4W1ejwkdSGmErBEWu28R` 保留。

候选域名的 HTTP 检查未完成：Vercel CLI 59.23.2 的 curl 子命令把 global-config 透传给系统 curl，返回参数错误。没有把这次工具失败记录成应用通过。正式域名切换后的实际匿名 HTTPS 检查为：health、login、SDK get-session 均 200，api/me 为 401，todo 为 503 维护，没有配置或认证依赖故障标记。

发布前只读核对：旧 public 用户 3，ID/角色摘要与表 ACL 摘要同前；新 schema User、Account、Session 均为 0，安装状态 awaiting_root、revision 0。本轮不执行迁移、ROOT 初始化、业务恢复或 activate，也不启用 Cron。

## 真实认证证据

操作者已从正式登录页自行完成中心登录与授权，并返回博客。只读存储核对得到 User、Account、有效 Session 各 1；用户 ID 与旧 public 的三个账号均不同，Provider 与正式 issuer 派生值匹配，会话期限为 86400 秒。用户已完成博客资料确认，emailVerified 为 true，角色仍为 USER，密码为空、authMode 为 sdk。

本次部署去敏 SDK 事件已观测到 login/OK、callback/OK 和 business/OK，版本均为 0.1.6。没有保存请求 URL、授权码或原始日志。安装状态仍为 awaiting_root、revision 0，ROOT 和恢复收据均为 0；没有按相同邮箱合并旧账号。

操作者确认刷新后仍保持登录，并只点击一次平台退出后返回登录页。后续只读核对 User/Account 仍各 1，Session 从 1 降为 0，SDK 记录 logout/OK。至此，本轮一次真实 production 登录、回调、刷新和博客本地退出通过。平台退出不表示撤销中心或其他平台会话；未人为注入 SIGN_OUT_UNCONFIRMED，不能把正常退出结果当作该故障分支已验收。

最终旧 public 用户仍为 3，User ID/角色、表 ACL、列 ACL 摘要与发布前和此前备份阶段一致；指定来源账号 Blog 13、Todo 117、PomodoroRecord 307。自动化操作没有写入旧 public。新目标 USER 1、ROOT 0，恢复 Blog/Todo 和 BusinessRestoreRun 均为 0，安装状态仍 awaiting_root、revision 0。新业务资料只属于此次认证的新用户，没有导入旧业务数据。

doctor 的配置及秘密检查通过，依赖组合仍为 BLOCKED / COMBINATION_UNVERIFIED。本轮只更新配置，没有重复全量单元测试；前一轮 1017 项通过属于历史独立批次，不算作本轮新增测试数。当前结果仅证明这个部署的一轮实际认证流程，不能替代完整兼容组合、并发、恢复或业务开放验收。

本机受限记录位于 `.feline-blog/auth-rebuild/production-0.1.6/`，包括 client-refresh-check.json、client-refresh-deployment.json、release-validation.json、production-probe.json 和 package-manifest.json。报告不包含 Secret、完整连接串、认证码、Cookie、会话令牌或业务行。
