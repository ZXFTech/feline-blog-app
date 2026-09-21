# 0010. CI、Staging 发布与版本管理：决策记录

## Context

仓库已经实现 PR Verify、`master` staging workflow、迁移重放与对账、Vercel candidate 发布和 smoke 编排。当前发布运行停在 migration reconciliation，尚未进入数据库写入或应用发布。Supabase `feline_blog_staging` 由规格 0009 建立 Direct endpoint、TLS、角色、allowlist 和受保护的 `db:staging:deploy` 命令。实际运行证明 Direct endpoint 只有 IPv6 地址，本地连接成功，但 GitHub hosted runner 的 IPv4 网络无法到达它；CA 序列化修复后故障仍发生，说明阻塞点是连接路径而不是 migration 内容或 TLS secret 格式。

旧规格 0004 假设本地 `pnpm release` 在开发者机器上修改版本、生成 changelog、构建、部署、提交并打标签。这会让发布结果依赖本机状态和交互登录，也无法保证数据库 migration、远程应用和版本标签属于同一个已经验证的 commit。旧规格尚未实现，因此可以被新设计直接取代，不需要兼容它的命令接口。

这是一个个人项目，当前只需要可靠的 staging，不需要新的部署平台、制品仓库或通知服务。最重要的约束是 secrets 不进入 PR、migration 不自动回滚、稳定 staging 随时指向一份可识别的 READY deployment，以及版本标签只代表已经通过真实 staging 验证的 commit。发布编排代码始终来自可信 `master`，候选源码由 immutable SHA 单独选择。Vercel Git Integration 不得绕过这条路径改变稳定环境。Vercel 项目当前对 Production 和 Preview URL 开启 SSO Deployment Protection；本流程只使用 Production target，所以真实 smoke 必须为 staged Production candidate 与稳定域名证明自动化身份，而不能通过关闭保护来换取可访问性。

Session Pooler 的真实连接探针进一步证明，Supavisor 接受 qualified migrator username 并正确映射到 `current_user=app_migrator`，但会忽略 PostgreSQL startup `options`。把 `lock_timeout` 和 `statement_timeout` 编码进 Prisma URL 因而不能建立有效策略。当前角色没有显式 `rolconfig`，所以需要先完成一次受控角色默认值配置，再让 CI 对每个新会话验证实际值。

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

## Staging migration 连接选项

### Option A: Supavisor Shared Pooler Session mode

Migration URL 使用 Supabase Connect 面板给出的 Session mode endpoint、端口 `5432` 和 qualified username `app_migrator.<project-ref>`。Committed config 精确 allowlist 一个 pooler hostname，TLS 继续 verify-full。

**Pros**:

* 为 GitHub hosted runner 提供 IPv4 路径，不需要购买额外网络能力。
* 保留 session 语义和 prepared statement 支持，适合 Prisma migration 命令。
* 仍可复用现有 migrator role、CA、advisory lock、redaction 和 reconciliation 边界。

**Cons**:

* 增加 Supavisor 这一托管中间层，pooler 故障会阻塞 migration。
* 用户名必须带 project ref，安全分类器与 secret 都需要同步切换。

### Option B: Direct endpoint 加 IPv4 add-on

保留 `db.<project-ref>.supabase.co:5432`，通过 Supabase IPv4 add-on 为 GitHub runner 提供 A record。

**Pros**:

* 连接语义与当前本地验证路径完全一致。
* 不增加 pooler hop。

**Cons**:

* 为低频 migration 持续增加付费网络配置。
* 连接可用性依赖 add-on 状态，仍需额外的基础设施配置与监控。

### Option C: Supavisor Transaction mode

使用 transaction endpoint 和端口 `6543`，每个 transaction 后归还后端连接。

**Pros**:

* 对高并发短事务应用有更高连接复用率。

**Cons**:

* 连接级状态与 prepared statement 行为受限，不适合作为 migration 工具的默认路径。
* 低频串行 migration 不需要它的连接密度收益。

## Migration timeout 策略选项

### Option A: `app_migrator` role defaults，CI 只读验证

维护者通过独立管理员连接一次性设置 `lock_timeout=5s` 和 `statement_timeout=120s`。CI 不持有管理员凭据，只在 fresh Session Pooler connections 上验证两个有效值，然后运行 Prisma `migrate status`。

**Pros**:

* PostgreSQL 在角色登录时应用默认值，所以 node-postgres controller 与 Prisma migration child 使用同一策略。
* 不依赖 Supavisor 已证明会忽略的 startup `options`。
* 配置 mutation 与日常 CI 权限分离，CI 只能检测漂移并 fail closed。

**Cons**:

* 首次启用和回滚需要维护者显式运行管理员命令。
* 角色默认值是数据库中的持久状态，必须由 probe 检测 out-of-band drift。
* 默认值只在新会话登录时生效，配置后必须丢弃旧连接并重连验证。

### Option B: Database defaults

通过 `ALTER DATABASE postgres SET` 为所有连接设置 timeout。

**Pros**:

* 所有客户端自动继承，不依赖 URL 或单个工具行为。

**Cons**:

* 影响 application、exporter、admin 和其他角色，权限范围远大于 migration 需求。
* 一个角色的发布安全需求不应改变整个数据库的默认行为。

### Option C: 每个 migration session 执行 `SET`

Controller 在连接后执行 `SET`，Prisma 则通过 migration SQL 或额外 wrapper 尝试设置 session state。

**Pros**:

* 不增加持久角色配置。

**Cons**:

* Prisma CLI 不暴露一个可靠的 migration-session 初始化钩子。
* 修改历史 migration 来注入 `SET` 违反 migration immutable 约束，新 migration 也不能保护 Prisma 在执行首条 SQL 前的行为。
* Controller 的 `SET` 无法影响 Prisma 的独立连接。

### Option D: Direct endpoint with IPv4 add-on

放弃 pooler，购买 IPv4 add-on 后继续使用 startup `options`。

**Pros**:

* 可以继续使用客户端 startup parameter。

**Cons**:

* 引入持续成本，并放弃已经验证可达的 Session Pooler 路径。
* 仍需要 CI probe，且没有比角色默认值提供更小的数据库权限边界。

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

Staging migration 连接选择 Option A。当前失败是明确的网络兼容问题，不是数据库负载问题，因此购买 Direct IPv4 add-on 没有足够收益，Transaction mode 的连接复用也解决了错误的问题。Session mode 是最小的修复：它保留 Prisma migration 需要的 PostgreSQL 会话行为，同时提供 GitHub Actions 可达的 IPv4 endpoint。切换必须同时修改 secret 与精确 allowlist；若只放宽为 `*.pooler.supabase.com` 或只检查 username 的 role 前缀，会把其他 Supabase tenant 误纳入可写边界。

Migration timeout 选择 Option A。PostgreSQL 明确定义 `ALTER ROLE ... SET` 是新登录会话的角色默认值，`RESET` 会移除角色覆盖；这与 Session Pooler 下每个 migration connection 都需继承同一策略的要求一致。配置命令保留管理员目标分类、专用写入确认、transaction、advisory lock 和 pre-state capture，CI 则只持有 migrator secret。Pre-state 同时记录 catalog 中每项 explicit 或 absent 状态，以及修改前由 fresh migrator Session Pooler connection 看到的 effective milliseconds；前者决定如何精确恢复，后者证明继承 database 或 system default 后的真实行为。Configure 与 rollback 都只接受 recorded original state 或 desired state，并拒绝第三种 drift，所以在 ALTER ROLE commit 后进程消失或验证失败时仍可安全重跑。Probe 把 PostgreSQL 可能返回的 `5s`、`2min` 等显示形式规范化为毫秒比较，避免字符串格式造成误判。因为角色默认值只在 backend 登录时应用，而 Supavisor Session mode 的 fresh client 仍可能获得先前建立的 backend，配置和回滚后必须关闭本工具连接并以 bounded reconnection 的实际 effective values 为准。若仍不匹配，发布停止并进入 provider diagnosis，而不是在 URL 中恢复 `options`、自动重启 pooler 或切换 Direct endpoint。

本次实现只替换 migrator 的连接策略并补齐 node-postgres 与 Prisma 两条 hosted-runner 证据。Exporter、admin、legacy import 和其余发布编排保持现状。Migration-only classifier 与 probe 避免共享分类器把 `app_exporter` 或 `postgres` 误当成 qualified migrator，也避免 CI status 因可选 exporter 检查失败。真实 deploy 同时使用一条 advisory-lock controller session 和一条 Prisma session，所以两连接容量、锁存活监控和子进程终止属于切换条件，而不是后续优化。

## References

**Project sources**:

* `AGENTS.md`，CI runtime、pnpm 与 staging migration 约束
* `prisma/AGENTS.md`，PostgreSQL migration 与数据源边界
* `config/database-targets.json`，当前 staging project、database 与 role allowlist
* `scripts/database/local-postgres/target.ts`，当前 Direct endpoint 目标分类器
* `.github/workflows/staging.yml`，GitHub hosted runner 的 migration job 与 secret surface
* `supabase-postgres-best-practices`，连接池模式与连接管理约定
* `prisma-cli-migrate-deploy`，CI 中使用 `migrate deploy` 的约定

**Practices & standards**:

* 精确目标 allowlist 与 fail closed 配置验证
* TLS hostname verification and separate CA trust
* Least privilege database migration role
* Read-only probe before remote mutation

**Links**:

* Supabase Connect to your database: https://supabase.com/docs/guides/database/connecting-to-postgres
* Supabase IPv4 and IPv6 compatibility: https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP
* Supabase connection pooling and limits: https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
* Supabase Prisma guide: https://supabase.com/docs/guides/database/prisma
* PostgreSQL `ALTER ROLE`: https://www.postgresql.org/docs/current/sql-alterrole.html
* PostgreSQL client connection defaults: https://www.postgresql.org/docs/current/runtime-config-client.html
* Supavisor pool modes: https://supabase.github.io/supavisor/configuration/pool_modes/
