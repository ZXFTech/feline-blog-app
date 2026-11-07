# 本地真实认证往返验证

2026-11-05，北京时间。覆盖一次本地真实登录、成功回调、资料完成与当前博客退出。用户在自己的浏览器中输入中心凭据并操作退出；Agent 未读取或输入密码、验证码，没有复制 Cookie、令牌或授权码。

本次只证明下述单次真实路径，不代表 SDK 候选组合已正式认证、完整功能验收或生产接入通过。

## 环境与证据来源

| 项目 | 本次值 |
| --- | --- |
| Runtime / target | development / development |
| 中心 issuer | https://auth.user-center.test:3000/api/auth |
| 博客 origin | https://blog.user-center.test:3443 |
| 博客存储 | 127.0.0.1:54331 / feline_blog_sdk_dev，运行身份 blog_sdk_runtime |
| 版本 | SDK/CLI 0.1.6、Better Auth 1.7.12、Node 22.21.1、pnpm 10.28.1、Next 16.3.3、Prisma 7.3.0 |
| 浏览器操作证据 | Agent 先前实际点击登录进入本地中心；用户确认登录后到 /profile，并确认点击退出后返回登录页 |
| 服务端独立核验 | 运行身份下 READ ONLY 事务、SDK 有限事件与无 Cookie HTTP 探测 |

Agent 当前可控制的内置浏览器没有用户此次会话，新开 /profile 会回到登录页，因此没有把该匿名浏览器的状态当作用户退出证据。真实凭据输入和退出点击由用户完成，服务端记录独立核对结果。

## 观察结果

17:48:04 只读核对：SDK 有 1 个 `callback:OK`，本地有 1 个已验证用户、1 个已完成资料的普通 USER、1 个属于所选派生 Provider 的 Account、1 个有效 Session。`business:OK` 表明宿主业务映射已实际被调用并成功；用户同时反馈成功返回 /profile。

用户随后在原登录窗口点击一次“退出当前平台”，确认已返回登录页。17:50:38 再次只读核对：新增 1 个 `logout:OK`，Session 总数和有效数都变成 0；User 和 Account 仍各为 1。

| 事实 | 退出前 | 退出后 |
| --- | --- | --- |
| User | 1，已验证、资料已完成 | 1，保留 |
| 用户角色 | USER 1、ROOT 0 | USER 1、ROOT 0 |
| 所选 Provider 的 Account | 1，只属于一个本地用户 | 1，保留 |
| Session 总数 / 有效数 | 1 / 1 | 0 / 0 |
| 安装状态 | awaiting_root、revision 0 | awaiting_root、revision 0 |
| ROOT / 恢复 / 开放字段 | 均为空 | 均为空 |

日志累计有 3 个 login:OK、1 个 callback:OK、16 个 business:OK、1 个 logout:OK。多次发起请求和页面读取不算多次成功认证，只有本次 1 个成功回调作为真实登录结果，没有重放授权码或自动重试换码。

17:53:08 无 Cookie 本地 HTTP 探测：

| 请求 | 结果 |
| --- | --- |
| GET /api/auth/get-session | 200、JSON null |
| GET /api/me | 401 |
| GET /api/blog | 503，业务维护门禁仍关闭 |
| GET /profile | 200 的流式响应内含 NEXT_REDIRECT 到 /login，不是已认证资料页 |

这组请求是匿名服务端探测，不冒充用户浏览器携 Cookie 的网络记录。用户退出成功由用户操作反馈、SDK logout:OK 和真实 Session 消失共同支持。未把单独的 HTTP 200、匿名结果或组件测试当作已认证退出证据。

## 操作边界

Agent 对新博客库只执行固定绑定、严格 TLS 的 READ ONLY 审计，没有执行迁移、备份、恢复、ROOT 初始化或状态开放。用户完成资料和认证会话由已授权的本地应用正常流程产生，退出由 SDK 受控 handler 撤销会话，没有手工删除数据库行或 Cookie。

生产、来源、中心及旧本地受保护配置的最终 SHA256 全部保持，没有向线上或旧源数据库发送 SQL。中心仅参与用户正常的本地认证流程，不依赖其私有源码或直接查询中心库。本次退出只说明博客会话已撤销，不代表中心或其他应用的会话也已退出。

详细去敏证据保存在忽略目录 `.feline-blog/auth-rebuild/local-0.1.6/`：`auth-roundtrip-before-signout.json`、`auth-roundtrip-after-signout.json`、`auth-roundtrip-final.json`，以及受限启动日志。公开记录不包含 Client ID、Secret、密码、用户 ID、subject、Cookie 或 token。

## 仍未验证

本轮不覆盖再次登录后的身份稳定性、跨用户隔离、注册/真实邮件、全部 consent 分支、故障注入或生产环境。ROOT、恢复和开放工具仍待实施，普通业务保持维护门禁。doctor 的 COMBINATION_UNVERIFIED 状态没有因单次成功登录被改写；原开发修复的 lint、构建和 940 项测试结果见 [登录入口修复记录](2026-11-05-sdk-local-login-fix.md)，本轮未重跑或叠加这些计数。
