# 0010. CI、Staging 发布与版本管理：决策记录

## Context

仓库已有一个在 PR 和 `master` push 上运行的 Verify workflow。它执行依赖安装、Prisma 检查、typecheck、lint、Vitest 和 build，但没有迁移历史重放、staging 发布、真实 smoke test 或版本管理。Vercel 项目 `feline-blog-staging` 已经链接，Supabase `feline_blog_staging` 已经由规格 0009 建立 direct endpoint、TLS、角色、allowlist 和受保护的 `db:staging:deploy` 命令。

旧规格 0004 假设本地 `pnpm release` 在开发者机器上修改版本、生成 changelog、构建、部署、提交并打标签。这会让发布结果依赖本机状态和交互登录，也无法保证数据库 migration、远程应用和版本标签属于同一个已经验证的 commit。旧规格尚未实现，因此可以被新设计直接取代，不需要兼容它的命令接口。

这是一个个人项目，当前只需要可靠的 staging，不需要新的部署平台、制品仓库或通知服务。最重要的约束是 secrets 不进入 PR、migration 不自动回滚、稳定 staging 随时指向一份可识别的 READY deployment，以及版本标签只代表已经通过真实 staging 验证的 commit。发布编排代码始终来自可信 `master`，候选源码由 immutable SHA 单独选择。Vercel Git Integration 不得绕过这条路径改变稳定环境。

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

## Rationale

Option 1 最符合现有系统。GitHub Actions 已经承担 Verify，规格 0009 已经提供安全 staging migration 命令，Vercel 项目也已经存在。把这些步骤放进一个依赖链，可以用最少的新基础设施解决真正的问题，也能让 migration、candidate deployment、promotion、smoke 和 release 共享同一个 immutable commit。Candidate first promotion 比直接覆盖稳定环境多一个步骤，但失败候选不会先暴露给稳定域名。Release Please 负责版本 PR 和 changelog，finalize job 负责把已经验证的 release commit 精确变成 tag 和 GitHub Release，这个拆分避免工具在 `master` 前进时给未验证 SHA 打标签。

Option 2 的表面配置更少，但它把最重要的数据库与应用顺序交给两个相互独立的触发器。Option 3 能完成一次发布，却不能建立持续集成和受保护的仓库状态。统一编排的成本是更复杂的 workflow 和几项长 lived secrets。job scoped permissions、GitHub Environment、完整 SHA action pins、provider target checks 和定期轮换让这个成本保持可控。
