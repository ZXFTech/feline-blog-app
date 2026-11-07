# 本地 SDK 登录入口故障修复

2026-11-05，北京时间。本轮针对用户截图中的登录按钮禁用、导航身份不可用、重试/本地退出无效，实际复现、定位并修复。仅操作本地博客 development 环境，SDK/CLI 保持 0.1.6、Better Auth 1.7.12、Node 22.21.1、pnpm 10.28.1、Next 16.3.3，没有修改 SDK 产物、中心私有源码、中心或线上数据库。

此前启动检查仅证明登录 HTML 返回 200、包含按钮，未验证浏览器 hydration 和 SDK 路由。该证据不足以宣称登录可用，本记录补充实际运行结果，不覆盖真实回调尚待验证的边界。

## 已确认的原因

1. `blog.user-center.test` 未加入 Next 的 allowedDevOrigins。真实服务器日志明确拒绝 JS chunk、HMR 和字体请求，浏览器中的登录和主题按钮都保持 SSR 禁用状态。ButtonControl 的原设计是等客户端事件处理器准备后启用，认证 unavailable 并不直接禁用该按钮。修复是在 next.config.mjs 精确许可此开发域名，没有加入通配符。
2. 启动入口设置 NODE_EXTRA_CA_CERTS 并传 HTTPS cert/key，却漏传 `--experimental-https-ca`。当前安装的 Next CLI 在使用自签证书时会用 certificate.rootCA 重写 worker 的 NODE_EXTRA_CA_CERTS，未传 CA 时原环境值丢失。独立 Node 的公开 SDK ready/getPrincipal 正常，而 Next 记录 CENTER_UNAVAILABLE，修复后 `/api/me` 从 503 变为正常匿名 401。已给现有启动入口补齐明确 CA 参数，严格证书校验保持开启。
3. 启动使用 IP hostname，Next 传给 SDK 的请求 origin 实际是 `https://localhost:3443`。去敏临时定位明确记录了这一值；同一公开 SDK handler 在独立 Node 的固定博客 URL 下返回 200/null，Next 中却返回 404/NOT_FOUND。入口改为博客域名作为 hostname，启动前要求全部 DNS 结果只为 127.0.0.1。复测请求 origin 正确、受控会话接口 200/null，实际监听仍只有 127.0.0.1:3443。没有改写任意传入 Host、绕过 origin 检查或暴露原 Better Auth handler，临时定位日志已移除。
4. UserMenu 的“重试或本地退出”只是 `/profile` 链接。该页依赖故障时提前渲染错误，原本不含退出控件；未完成资料阶段也没有可达退出。现已改为实际重新核验和 SDK signOut 操作，并在 setup/profile 的未完成资料或依赖失败分支保留安全会话控件。配置本身不可用时不显示必然失败的退出按钮，提示联系维护者。

## 页面与协议边界

导航的“重新核验”只显式重做 no-store `/api/me`，不会隐式重放授权、换码或退出。依赖故障、未完成资料与匿名保持区别。退出仅在 SDK 确认后清客户端状态和导航；SIGN_OUT_UNCONFIRMED 保留错误，并允许主动核验，不显示成功，也不自动重复 signOut。

当前 SDK 在初始化中心 metadata 不可用时仍可能无法确认 signOut。这是保留的失败语义，本轮没有自行删除 Cookie、回退旧接口或绕过 SDK。配置和凭据变更仍需要重启，重新核验不宣称能修复配置错误。普通业务、用户角色与安装门禁保持原规则，未初始化 ROOT 或恢复业务。

## 证据与验证

| 检查 | 本轮观察 |
| --- | --- |
| 浏览器复现 | 用户原标签页中登录和 4 个主题按钮禁用，导航显示身份不可用 |
| 修复后浏览器 | 登录、主题按钮可用；导航显示正常匿名登录入口；实际点击登录成功跳至本地中心 `/sign-in`，显示对应本地专用应用 |
| 开发资源 origin | 允许的博客 origin 返回 200，未许可 canary origin 返回 403 |
| SDK 匿名会话 | GET /api/auth/get-session 返回 200/null；GET /api/me 返回 401 |
| 中心公开元数据 | Discovery/JWKS 均 200，issuer 正确，development 声明匹配，严格 TLS；没有跟随到其他 origin |
| 安装与用户 | 17:24 只读核对 awaiting_root、revision 0，ROOT/恢复/开放字段为空，用户与 ROOT 数均为 0 |
| 定向回归 | 5 文件、31 项通过，包括真实 retry/logout 操作、未确认退出不自动重试、setup/profile 依赖故障及未映射状态仍可退出 |
| 全量 Vitest | 降低并发后 138 文件通过、2 文件跳过；940 项通过、35 项跳过 |
| 数据源边界 | 502 源文件通过；精确登记此前新增的两个本地迁移/存储验证脚本，不扩大其他路径权限 |
| lint / 类型 | 全量 lint、独立 tsc 通过；新增回归文件也通过定向 lint |
| 构建 | pnpm build 通过，含 Prisma 生成、502 文件边界检查、Next 编译和类型检查；保留既有动态文件追踪与工程外 package-lock 警告 |

首次全量套件与构建并行时，既有 Windows prestate ACL 测试超出默认 5 秒；该文件隔离复测 15 项通过，全量以 maxWorkers=4 复测通过，没有改变测试超时或断言。首次构建也暴露此前两个本地维护脚本从 mts 更名 ts 后未登记精确数据源允许名单，本轮补齐对应两个路径；没有改变扫描器或默认拒绝规则。

修复后截图和去敏记录保存在忽略目录 `.feline-blog/auth-rebuild/local-0.1.6/`：login-fixed.jpg、login-diagnosis.json、login-fix-verification.json 及受限启动日志。17:24 核对生产、来源、中心及旧本地受保护配置摘要未变。本轮没有迁移、备份、恢复、ROOT 初始化、部署、提交或推送。

真实中心密码/验证码由用户自行输入。当前已到本地中心登录页等待用户完成，尚未观察真实回调、稳定身份、同意授权或已认证退出，不能把本轮匿名会话探测、组件测试或登录入口成功记作完整 OAuth 通过。用户标签页保留用于继续；原授权操作有期限，用户继续时可从博客登录页重新发起新的操作，普通业务仍关闭。

17:48 至 17:53 后续验证：用户已完成真实登录、资料确认并退出，服务端确认 callback:OK、logout:OK 和 Session 从 1 变为 0；安装状态保持 awaiting_root，未初始化 ROOT 或恢复数据。详见 [真实认证往返验证](2026-11-05-sdk-local-auth-roundtrip.md)。上述“等待用户”是本记录较早阶段的状态，不覆盖后续证据。
