# 本地博客连接线上中心的认证联调

2026-11-05，北京时间。用户授权重新核验线上 production 声明，通过后启动 3445，并继续真实登录、回调和当前平台退出。保留生产配置，不初始化 ROOT、不恢复数据、不部署。

## 启动与实际结果

20:07:12 公开 Discovery/JWKS 严格 TLS 检查通过，issuer 为 `https://auth.zhaosie.com/api/auth`，根级 `user_center_environment` 为 `production`，JWKS 有 1 个公钥。20:07:28 SDK 0.1.6 public ready 返回 OK。此前缺声明的阻断已解除。首次受限网络请求未能连接，明确放行后的同一公开地址检查通过，没有降低 TLS 或环境校验。

20:08:51 启动独立本地服务，实际监听 `127.0.0.1:3445`。Runtime 为 development，target 为 production，origin 为 `https://blog.user-center.test:3445`，Next 输出为 `.next-online-center`。使用 Node 22.21.1、SDK/CLI 0.1.6、Better Auth 1.7.12 和既有固定依赖，没有安装或升级包。

20:09:26 登录前 READ ONLY 核对：实际存储为 `127.0.0.1:54332 / feline_blog_sdk_online_dev`，运行身份 `blog_sdk_online_runtime`，TLS 开启。User、Account、Session 均为 0。安装仍为 awaiting_root、revision 0，ROOT、恢复和开放字段为空。受保护配置摘要保持。

20:11:55 严格 HTTPS 无 Cookie 请求结果：

| 请求 | 结果 |
| --- | --- |
| GET /api/health | 200 |
| GET /api/auth/get-session | 200、JSON null |
| GET /api/me | 401 |
| GET /login?returnTo=%2Fprofile | 200，包含登录入口 |
| GET /api/blog | 503，维护门禁保持 |

浏览器登录页已正常显示可用的“使用用户中心登录”按钮。实际点击后进入线上中心的 `zhaosie-local-blog` 首次授权页，申请身份、基础资料、邮箱及验证状态。中心已有用户会话，此次没有要求 Agent 输入密码。用户两次反馈授权已过期后，Agent 均从博客重新发起新流程，没有重用过期 flow 或重放授权码。第三次用户亲自确认授权，实际返回 `/auth/setup`。

20:24:23 READ ONLY 核对：SDK 记录 1 次 callback:OK；新本地库有 1 个已验证普通 USER、1 个属于所选派生 provider 的 Account、1 个有效 Session，资料完成数为 0。这支持本次真实 Client 配置、回调及本地会话建立成功。密码、授权码和 token 未被 Agent 读取；协议校验由官方库和 SDK 处理，没有另行解码或导出 token。

浏览器点击“检查会话状态”显示“当前平台会话仍有效”。同一浏览器会话打开 `/api/me`，实际正文为“请完成博客资料”；之后重新访问 `/profile`，仍转到 `/auth/setup`，昵称为空、邮箱确认未选、完成按钮禁用。这是认证成功但业务资料尚未完成的门禁，本轮没有提交表单或宣称业务映射已完成。本次 returnTo 配置为 `/profile`，最终资料门禁和再次访问结果已观察；没有保存原始回调网络轨迹。

Agent 随后在该资料页点击一次“退出当前平台”，页面返回 `/login`。同一浏览器查询 `/api/auth/get-session`，正文为 JSON null；访问 `/api/me` 显示“请使用用户中心登录”；再次访问 `/profile` 返回 `/login`。没有出现退出未确认提示，没有自动重试退出或手工删除 Cookie。

20:26:30 READ ONLY 复核新增 1 次 logout:OK，Session 总数和有效数都由 1 降至 0，User 和 Account 保留。界面、SDK 有限事件和数据库结果互相吻合。

| 本地状态 | 退出前 | 退出后 |
| --- | --- | --- |
| User / 普通 USER / ROOT | 1 / 1 / 0 | 1 / 1 / 0 |
| 已验证用户 / 已完成资料 | 1 / 0 | 1 / 0 |
| Account / 所选 Provider / 不同本地用户 | 1 / 1 / 1 | 1 / 1 / 1 |
| Session 总数 / 有效数 | 1 / 1 | 0 / 0 |
| 安装状态 | awaiting_root，revision 0 | awaiting_root，revision 0 |
| ROOT / 恢复 / 开放字段 | 全为空 | 全为空 |

事件累计 login:OK 3、callback:OK 1、logout:OK 1。前三次发起不等于三次成功认证，只计本次一次成功回调和退出。Next 已关闭 incoming request 日志，未保存浏览器 HTTP 状态/响应头轨迹，因此不把 API 正文观察冒充带 Cookie 的 403/401 网络状态记录。启动时无 Cookie 的实际 HTTP 状态见上表，与此次浏览器会话证据分开。

## 证据与边界

详细去敏证据在忽略且受限目录 `.feline-blog/auth-rebuild/local-to-production-0.1.6/`：offline-check.json、metadata-check.json、sdk-readiness.json、postgres/verification.json、blog-process.json、startup-verification.json、auth-roundtrip-before-login.json、auth-roundtrip-before-signout.json、auth-roundtrip-after-signout.json、callback-session.png、signout-confirmed.png 和受限服务日志。公开报告不包含 Client ID、Secret、密码、用户 ID、subject、Cookie、token、授权码或授权 flow 标识。受保护的生产、来源、中心及旧本地配置摘要在退出后仍保持。

离线 doctor 的配置、命名空间、导航及秘密配置项通过，组合仍标记 COMBINATION_UNVERIFIED。它不验证真实 Client、存储或登录，不能将这一候选组合状态改成正式兼容认证。

本轮未改应用代码或依赖。Next 首次启动此独立 distDir 时自动向 tsconfig.json 增加 `.next-online-center/types/**/*.ts` 和 `.next-online-center/dev/types/**/*.ts`；保留这两项，并去掉自动附带的无关排版变化。未重复或累加此前自动测试计数。没有执行迁移、备份、恢复、ROOT 初始化、业务开放、提交、推送或部署。仅通过已授权的正常认证流程向这个独立本地库写入新账号和会话，Agent 的数据库核对为 READ ONLY；线上中心仅参与用户明确确认的正常授权与换码，不直连中心或线上博客数据库。退出只验证当前博客会话，不宣称中心及其他平台会话均撤销。3445 继续保持运行，浏览器保留在退出后的登录页。

为上述独立目录类型配置运行固定工具链的 `pnpm exec tsc --noEmit`，退出 0；`git diff --check` 通过。没有将这次类型检查算入此前 Vitest 或浏览器用例数，也没有因文档更新重跑全量构建。

## 待验

本次一次真实授权、受控回调、本地会话建立、未完成资料门禁、刷新读取和当前平台退出通过。资料完成提交及业务映射、再次登录后的身份稳定性、跨用户隔离、注册/邮件、其他 consent 与故障分支、ROOT/恢复/开放和上线验收仍未覆盖。SDK 候选组合与整个规格 0019 的完整验收没有因此标为通过，不能据此直接上线。
