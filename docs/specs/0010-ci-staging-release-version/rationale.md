# 0010. CI、Staging 发布与版本管理：决策记录

## Context

仓库已有一个在 PR 和 `master` push 上运行的 Verify workflow。它执行依赖安装、Prisma 检查、typecheck、lint、Vitest 和 build，但没有迁移历史重放、staging 发布、真实 smoke test 或版本管理。Vercel 项目 `feline-blog-staging` 已经链接，Supabase `feline_blog_staging` 已经由规格 0009 建立 direct endpoint、TLS、角色、allowlist 和受保护的 `db:staging:deploy` 命令。

旧规格 0004 假设本地 `pnpm release` 在开发者机器上修改版本、生成 changelog、构建、部署、提交并打标签。这会让发布结果依赖本机状态和交互登录，也无法保证数据库 migration、远程应用和版本标签属于同一个已经验证的 commit。旧规格尚未实现，因此可以被新设计直接取代，不需要兼容它的命令接口。

这是一个个人项目，当前只需要可靠的 staging，不需要新的部署平台、制品仓库或通知服务。最重要的约束是 secrets 不进入 PR、migration 不自动回滚、稳定 staging 随时指向一份可识别的 READY deployment，以及版本标签只代表已经通过真实 staging 验证的 commit。发布编排代码始终来自可信 `master`，候选源码由 immutable SHA 单独选择。Vercel Git Integration 不得绕过这条路径改变稳定环境。Vercel 项目当前对 Production 和 Preview URL 开启 SSO Deployment Protection；本流程只使用 Production target，所以真实 smoke 必须为 staged Production candidate 与稳定域名证明自动化身份，而不能通过关闭保护来换取可访问性。

## Options considered

### Option 1: GitHub Actions 统一编排的分阶段发布

GitHub Actions 在同一条受保护的依赖链中运行验证、migration、Vercel 发布、smoke test、恢复和 Release Please。

**Pros**:

* 一个 commit、一次运行和一份日志覆盖完整发布路径。
* 可以把数据库和应用发布严格排序，并把 release 建立在 staging 成功之上。
* 复用现有 Verify workflow、数据库保护命令和 GitHub 权限模型。

**Cons**:

* workflow 更长，需要明确拆分 job 权限、outputs、timeouts 和恢复逻辑。
* GitHub 需要持有 staging migration、Vercel 和 synthetic test 凭据。
* 远程 mutation 需要额外的 GitHub deployment status 与 immutable checkpoint，恢复路径比单次脚本更复杂。

### Option 2: GitHub 迁移数据库，Vercel Git Integration 发布应用

GitHub Actions 负责 migration，Vercel 在收到 Git push 后独立构建和发布。

**Pros**:

* 应用发布配置较少，沿用 Vercel 的原生 Git 体验。
* GitHub 不需要显式运行 Vercel deploy 命令。

**Cons**:

* 数据库 migration 和应用发布会形成竞态，无法可靠保证先后顺序。
* 两套独立运行记录让失败恢复和 release gate 难以证明属于同一个 commit。

### Option 3: 本地发布脚本直接执行全部步骤

继续扩展旧规格 0004，让维护者从本机运行版本、migration、build、Vercel deploy 和 Git 操作。

**Pros**:

* 初始 workflow 文件较少，人工控制直观。
* 可以复用本机已经存在的登录和环境文件。

**Cons**:

* 发布依赖本机状态、网络、凭据和未提交文件，重复性较差。
* 无法成为 `master` 的自动质量门，也无法为每个 commit 提供统一的远程证据。

## Deployment Protection 身份选项

### Option A: GitHub OIDC Trusted Source

GitHub Actions 为 candidate、stable 和 recovery verification smoke job 分别即时签发短期 OIDC token。Vercel 按仓库、分支、GitHub Environment、workflow ref、audience 和 Production target 核验后放行请求。

**Pros**:

* 不共享或轮换长期 bypass secret，token 泄露窗口短。
* SSO 可以持续保护所有人工访问，自动化身份仍有精确权限边界。
* Candidate 与 stable smoke 可以各自即时签发 token，失败后不留下持久凭据。

**Cons**:

* Vercel 项目需要一次控制台 trusted source 配置，并且配置漂移会让 smoke 失败。
* Smoke job 需要 `id-token: write`，请求层必须防止认证头跨 origin 泄露。
* Token 可能在长阶段中过期，请求层必须检查 `exp`、按安全余量刷新并避免借刷新重放 mutation。

### Option B: Protection Bypass for Automation secret

在 Vercel 项目生成静态 bypass secret，并作为 GitHub Environment secret 通过请求头发送。

**Pros**:

* 支持面广，工具接入简单。
* 不依赖 OIDC claim 配置。

**Cons**:

* secret 可访问项目内所有部署，必须复制到 GitHub、定期轮换并处理泄露。
* 旧部署和失败运行中的凭据生命周期更难证明，query 参数还可能进入代理或日志。

### Option C: 为 smoke 关闭 Deployment Protection

把 candidate 或稳定 staging 设为公开 URL，让 smoke 直接访问。

**Pros**:

* 测试工具不需要额外认证协议。

**Cons**:

* staging 内容和登录入口暴露给公众，违背当前 SSO 边界。
* 保护状态会成为发布前后的额外可变步骤，失败时容易留下公开环境。

## Rationale

Option 1 最符合现有系统。GitHub Actions 已经承担 Verify，规格 0009 已经提供安全 staging migration 命令，Vercel 项目也已经存在。把这些步骤放进一个依赖链，可以用最少的新基础设施解决真正的问题，也能让 migration、candidate deployment、promotion、smoke 和 release 共享同一个 immutable commit。Candidate 使用 `vercel deploy --prod --skip-domain` 创建 staged Production deployment，因而在 promote 前已经使用与稳定 staging 相同的 Production build 和 runtime variables；`vercel promote` 只把同一个 deployment 绑定到稳定域名，不重建。若用 Preview 作为 candidate 再把 Production 重新构建，会破坏“测过的就是上线的”这一核心保证。

远程 mutation 不能只记录在 runner 内存或最终日志中。GitHub deployment payload 提供稳定 record identity，mutation 前后的 deployment statuses 提供 intent 与 result，逐阶段 immutable checkpoint artifact 保存恢复所需的完整脱敏状态。三者共同覆盖 runner 在 deploy、promote 或 restore 返回前消失的情况；下一次运行必须先按 correlation metadata 对账，不能因为本地没有 result 就重放操作。

Release Please 负责版本 PR 和 changelog，finalize job 负责把已经验证的 release commit 精确变成 tag 和 GitHub Release。维护前后检查 `master` HEAD，可以把并发前进降级为 deferred；版本 PR 的独立 verified-base required check 则关闭检查后的竞态窗口。Release-only workflow 只接受能重建可信 record key 的输入，不接受任意 ref，因此幂等补做 bookkeeping 不会绕过 staging gate。

Option 2 的表面配置更少，但它把最重要的数据库与应用顺序交给两个相互独立的触发器。Option 3 能完成一次发布，却不能建立持续集成和受保护的仓库状态。统一编排的成本是更复杂的 workflow 和几项长 lived secrets。job scoped permissions、GitHub Environment、完整 SHA action pins、provider target checks 和定期轮换让这个成本保持可控。

Deployment Protection 选择 Option A。GitHub OIDC Trusted Source 把访问权绑定到本仓库受保护的 `master`、GitHub Environment `staging`、指定 workflow 和 Production target，同时保持 Vercel SSO 对其他请求生效。它比静态 bypass secret 少一个长期凭据，也不需要在发布期间改变保护状态。代价是三个 smoke job 必须分别申请 `id-token: write`，并在请求层严格限制 header 的目标 origin。Restore job 不需要读取受保护页面，因此不持有 OIDC；恢复后由独立 job 验证。自动化只使用请求头，不使用 query 参数或持久化 bypass cookie，Playwright 也不使用全局认证 header 或保留 trace、HAR、截图、视频、storage state，因为 URL、重定向、service worker、测试媒体和代理日志都是不必要的泄露面。
