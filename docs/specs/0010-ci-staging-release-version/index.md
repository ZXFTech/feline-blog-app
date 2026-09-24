# 0010. CI、Staging 发布与版本管理

**Date**: 2026-09-20
**Status**: In Progress

## Summary

GitHub Actions 将成为 staging 发布的唯一编排入口。每次进入 `master` 的变更都先完成代码与迁移检查，再通过 IPv4 可达的 Supavisor Session Pooler 把已提交的 PostgreSQL migration 应用到 Supabase `feline_blog_staging`，随后发布到 Vercel `feline-blog-staging` 并运行真实 smoke test。Vercel SSO 保持开启，smoke 通过 GitHub Actions 的短期 OIDC 身份访问受保护部署，不共享长期绕过 secret。Release Please 只在 staging 验证成功后维护版本 PR、changelog、Git 标签和 GitHub Release。

## Requirements

**User stories**:

* 作为维护者，我希望每个拉取请求都经过一致的代码和迁移检查，以便错误不会进入 `master`。
* 作为维护者，我希望进入 `master` 的 commit 自动、安全地发布到隔离的 staging 环境，以便我能及时验证真实行为。
* 作为维护者，我希望版本、changelog、commit、数据库迁移和部署记录可以互相追踪，以便我能确认某个版本实际包含什么。
* 作为维护者，我希望失败的发布停在明确状态并提供安全恢复入口，以便重试不会扩大故障。

**Acceptance criteria**:

* **AC-1**: 每个 `pull_request` 都在无 staging secrets 的 GitHub hosted runner 上执行冻结安装、两个 Prisma schema 的 validate 与 generate、TypeScript typecheck、ESLint、Vitest、边界检查、生产构建，以及从空本地 PostgreSQL 重放 `prisma/postgres/migrations` 的迁移历史检查。任一步失败都会阻止合并。
* **AC-2**: `master` 禁止直接推送，只允许通过 PR squash merge。PR 标题必须符合 Conventional Commits。`master` 所需检查至少包含 AC-1 的验证工作。
* **AC-3**: `master` 的每个通过验证的 HEAD commit 都进入同一个 staging concurrency group。自动运行不取消已经进入发布临界区的运行。获得临界区后，运行重新读取 `master` HEAD。不是当前 HEAD 的候选标记为 superseded，不能迁移、部署或更新版本。临界区从 migration reconciliation 开始，直到 smoke、cleanup、promote、恢复和 release bookkeeping 结束。
* **AC-4**: PR 检查以 PR merge base 为基线，拒绝修改或删除基线中已有的 PostgreSQL migration。staging 发布把 candidate 仓库 migration 清单与数据库 `_prisma_migrations` 对账，验证已成功记录的名称和 SHA256 checksum，拒绝 missing、divergent 或 failed 状态，并对所有实际 pending migration SQL 执行向前兼容检查。检查拒绝 `DROP`、`TRUNCATE`、直接改名、缩窄类型、无法安全分析的动态 SQL 和其他已知破坏性操作。通过后才可运行 `pnpm db:staging:migration:probe`、migration reconciliation 和 `pnpm db:staging:deploy`。工作流不得运行 `migrate dev`、`migrate reset`、`db push` 或 legacy MariaDB migration。
* **AC-5**: migration 失败时发布立即停止。连接失败和 migration 尚未开始可以在状态重新对账后重跑。部分执行、已有 failed migration 或未知状态必须进入人工修复流程，不自动调用 `prisma migrate resolve`，不自动标记 applied 或 rolled back。输出只包含脱敏目标、migration 名称、状态枚举、安全错误码和人工检查命令。
* **AC-6**: migration 成功后，GitHub Actions 从 candidate commit 的 clean Git archive 创建无秘密上传目录，使用 lockfile 固定的 Vercel CLI 和环境变量中的 token、组织 ID 与项目 ID，以 `vercel deploy --prod --skip-domain` 创建使用 Production build 与 runtime 变量、但尚未绑定稳定域名的 staged Production candidate。部署 metadata 必须包含 candidate SHA、`master` ref、run ID 和 attempt。工作流确认上传目录不含 `.env.staging`、CA 临时文件或其他未跟踪文件。Vercel Git Integration 不得独立改变该项目的稳定主环境。Vercel 保存应用 build 与 runtime 变量，GitHub 不复制这些变量。
* **AC-7**: candidate READY 后，工作流为 candidate smoke 和 stable smoke 分别即时签发 GitHub Actions OIDC token。Vercel Trusted Sources 必须把 token 限定到仓库 `ZXFTech/feline-blog-app`、`master`、GitHub Environment `staging`、受信 workflow ref，以及项目 `feline-blog-staging` 的 Production 环境。工作流只把 token 作为 `x-vercel-trusted-oidc-idp-token` 请求头发送给本阶段核验后的 exact origin，禁止 query 参数、跨 origin 转发和持久化 cookie。Candidate 运行完整 public、login 和 Todo smoke，并在 promote 前完成本轮数据清理；stable 只运行 public identity smoke。登录 smoke 通过 `/login`，再以 `/api/auth/me` 核验 synthetic user ID 与 email，在 `/todo` 创建、更新、完成并软删除一个带 `e2e-staging-<run-id>-<attempt>-<sha7>` 前缀的 Todo，并从受限 cleanup API 读取和记录服务端 ID。本轮结束时按记录 ID 立即清理，不受 24 小时条件限制。下一次运行只可清理同一账号拥有、带规定前缀、服务端 `createAt` 超过 24 小时的数据，单次最多 100 条。未知写入结果先按完整前缀查询再清理。任何 cleanup 失败都会在 promote 前使发布失败。
* **AC-8**: candidate smoke 与 cleanup 成功后才把同一 staged Production deployment promote 为稳定 staging，不触发重建。发布前从稳定域名当前 alias 映射读取 previous deployment，并验证组织、项目、READY 状态和 commit metadata。应用发布、smoke、promote 或稳定域名验证在数据库已迁移后失败时，不自动降级数据库。Restore job 不持有 OIDC；它只在 stable alias 仍指向本轮 candidate 时恢复已记录的 previous deployment。随后独立的 `recovery-verification` job 绑定 GitHub Environment `staging`、获得 `id-token: write`，核验 alias 精确指回 previous deployment 和 previous SHA，再运行 protected public smoke。没有可验证 previous deployment、alias 已被外部改变或恢复验证失败时停止并显示带目标 ID 的人工恢复命令，不继续版本发布。
* **AC-9**: `workflow_dispatch` 只允许具有仓库 write 权限并可使用 GitHub Environment `staging` 的成员重跑当前 `master` HEAD。输入必须是完整 commit SHA，必须等于可信 workflow 从 `master` 读取的 HEAD。人工运行执行与自动发布相同的验证、migration reconciliation、部署、smoke、promote 和恢复逻辑，不能发布任意历史 SHA，也不能用输入 SHA 选择 privileged workflow 代码。
* **AC-10**: 每次运行在第一次远程 mutation 前创建一个绑定 candidate SHA 的显式 GitHub Environment deployment，deployment payload 保存 schema version、run ID、attempt 和 record key。每个 mutation 前写入 intent deployment status，每个 phase 后上传一份完整且脱敏的不可变 JSON checkpoint artifact，再写入 result status。runner 丢失后，新运行以 `(candidateSha, runId, attempt)` 查询 deployment、statuses 和 artifacts；有 intent 但无 result 时先按 provider correlation metadata 对账，不能猜测成功或盲目重放。最终执行记录写入 job summary，并包含固定 phase map、migration 摘要、previous、candidate 和 stable deployment identity、三个脱敏 host、cleanup、promote、recovery、release 和 failure code。日志、step output、artifact、Playwright trace、HAR、截图和视频不得包含 OIDC token、请求认证头、secrets、完整数据库 URL、Cookie、密码或 CA 内容。
* **AC-11**: Release Please 使用独立 GitHub App 的短期 installation token 维护一个版本 PR，使机器人创建或更新的 PR 正常触发 required checks。维护前后都重新读取 `master` HEAD；只有前后都等于本轮 verified candidate 时才把结果标记成功，HEAD 前进则标记 deferred。版本 PR 的 `Release eligibility / verified-base` required check 必须证明其当前 base SHA 有成功 staging record，避免竞态更新被提前合并。版本 PR 合并后的当前 HEAD 也必须先通过 staging。`finalize-release` 只接受由指定 GitHub App 创建、目标为 `master`、带 `autorelease: pending` label、manifest version 匹配且 merge SHA 等于 candidate 的唯一 PR，再从已提交的 `package.json`、`.release-please-manifest.json` 和 `CHANGELOG.md` 首个版本段读取同一版本，创建精确指向该 verified SHA 的 `v<version>` tag 与 GitHub Release。重复运行时，相同 tag、release 和 SHA 视为成功；名称相同但 SHA 不同立即失败。`.github/workflows/release-bookkeeping.yml` 提供 `workflow_dispatch` 的 release only 幂等重跑，输入 operation、candidate SHA、source run ID 和 attempt，并只消费可信 staging deployment 与 checkpoint。当前版本为 `0.1.0`，`fix` 增加 patch，`feat` 增加 minor，`0.x` 的破坏性变更增加 minor并写明迁移说明，不产生 prerelease，也不发布 npm package。
* **AC-12**: GitHub workflow 默认 `permissions: {}`，每个 job 只获得所需权限。只有紧邻 candidate smoke、stable smoke 或 recovery verification 的 job 使用 `id-token: write`，并同时绑定 GitHub Environment `staging`；PR、verify、migration、deploy、promote、restore 和 release job 均不得请求 OIDC 权限。Checkpoint coordinator 只使用 `deployments: write`，跨运行读取只使用 `deployments: read` 与 `actions: read`，release finalization 单独使用 `contents: write`。所有 action 固定到完整 commit SHA并保留版本注释，Dependabot 每周检查 GitHub Actions 更新。每个 job 只注入它明确列出的变量，禁止把整个 `secrets` context 传给 reusable workflow。PR job 不接收 secrets，`VERCEL_TOKEN` 只通过 deploy、promote 或 restore job 的环境变量传给 CLI。
* **AC-13**: CI 和 staging 发布的配置、检查器与编排逻辑具有不访问外部服务的 Vitest 覆盖。测试覆盖触发条件、可信 workflow 与 candidate SHA 分离、乱序候选、superseded 判断、migration 判定表和 SQL 拒绝规则、deployment correlation 零或多匹配、intent 后 runner 丢失、远程成功但本地 timeout、无 previous deployment、alias 被外部改变、OIDC claim、token 过期刷新、目标 origin 与 redirect 拒绝、service worker 禁用、认证头不跨 origin、checkpoint 与秘密脱敏、阶段短路、即时 cleanup、孤儿 cleanup、release HEAD 竞态、release PR 身份、tag collision 和恢复选择。
* **AC-14**: 本规格不创建或修改业务数据模型，不发布 production 环境，也不在 CI 中执行 Supabase 角色管理、数据复制、数据库 reset 或 destructive cleanup。`app_migrator` 的两个 timeout 默认值只通过维护者显式运行、具有专用写入确认的单次管理员配置命令设置或回滚。
* **AC-15**: staging migration 的唯一自动化连接入口是 Supavisor Shared Pooler 的 Session mode。目标必须同时匹配 `config/database-targets.json` 中精确记录的 pooler hostname、端口 `5432`、数据库 `postgres` 和用户名 `app_migrator.<stagingProjectRef>`；TLS 继续使用独立 `POSTGRES_SSL_CA` 做 `verify-full`。Migration probe、reconciliation 与 deploy 在任何网络连接前拒绝 Direct endpoint、Transaction mode `6543`、通配 pooler host、裸 `app_migrator` 用户名、错误 project ref、URL TLS 参数和未知 query 参数，并消费同一条已验证 URL。Supavisor 会忽略 PostgreSQL startup `options`，因此 Prisma URL 不承载 timeout。每个新建 migration session 必须继承 `app_migrator` 的角色默认 `lock_timeout=5s` 与 `statement_timeout=120s`。GitHub hosted runner 在 reconciliation 和任何写入前，必须通过 Session Pooler 证明 node-postgres 身份、双会话能力和两个有效 timeout，再证明 Prisma `migrate status` 的 TLS 与 Session Pooler 兼容性；任何值不匹配都阻断发布。Exporter、admin 与 legacy import 使用规格 0009 的独立角色策略，不进入 CI migration job，也不因本次改动自动切换连接。

## Decision

**Chosen option**: Option 1: GitHub Actions 统一编排的分阶段发布

扩展现有 Verify 工作流，以 GitHub Actions 串联验证、staging migration、Vercel 发布、smoke test、恢复和 Release Please。Staging migration 固定走 Supavisor Session Pooler `5432`，保留会话语义与 prepared statement 兼容性，同时为 GitHub hosted runner 提供 IPv4 路径。GitHub Environment `staging` 是发布权限与 secrets 边界。Vercel `feline-blog-staging` 的主环境是稳定 staging，不代表博客的正式 production。

**Implementation skills**: `release-please` (`bmad-labs/skills`, `.agents/skills/release-please/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `prisma-cli-migrate-deploy` (`prisma/cursor-plugin`, `.agents/skills/prisma-cli-migrate-deploy/`) · `github-actions-hardening` (`openai/skills`, `~/.codex/skills/github-actions-hardening/`) · `vercel-cli-with-tokens` (`vercel-labs/agent-skills`, `~/.codex/skills/vercel-cli-with-tokens/`)

## Feature design

### Data model

没有新的业务实体或表。部署状态由 GitHub Actions、GitHub Environment deployment、Vercel deployment、Git 标签和 GitHub Release 保存。Supabase 只接收 `prisma/postgres/migrations` 中已经提交的 schema migration。

### Pipeline state transitions

```text
candidate: queued -> verifying -> waiting for staging lock -> current head checked -> checkpoint created -> migrations reconciled -> migrating -> previous captured -> staged Production candidate deploying -> candidate public smoke -> candidate authenticated smoke -> candidate cleanup -> promoting -> stable public smoke -> release bookkeeping -> succeeded
candidate before migration: queued or verifying -> superseded
candidate failure before migration: current staging unchanged -> failed
candidate failure after migration but before promote: stable alias unchanged -> candidate cleanup -> failed and repair required
candidate failure during or after promote: restore previous -> recovery verification of previous SHA -> failed and repair required
unknown remote result: intent checkpoint -> provider reconciliation by record key -> result checkpoint or manual repair
release: no release change -> verified base gate -> release PR updated or deferred -> release PR merged -> exact SHA staging verified -> exact SHA tag and GitHub Release created
```

发布临界区一旦开始，当前运行不得被新 commit 自动取消。GitHub runner 仍可能因为平台故障、人工取消或 timeout 消失，所以每次新运行先对账数据库状态、GitHub deployment 状态和稳定 alias。无法证明上一次运行结束状态时停止并给出人工检查步骤。migration 保持向前应用。任何失败都只能通过修复后的当前 HEAD 或在 HEAD 未改变时重跑同一 SHA 继续。

### Workflow surface

| Surface | Trigger or input | Output | Authorization | Key failures |
| --- | --- | --- | --- | --- |
| PR verify | `pull_request` commit | required check result | fork 使用 read only token 且无 secrets | install、schema、type、lint、test、build 或 migration replay 失败 |
| Automatic staging | `push` to `master` HEAD | candidate deployment、promote、Environment deployment、execution record | GitHub Environment `staging` | stale candidate、unsafe migration、target mismatch、migration、deploy、smoke、cleanup、promote 或 recovery 失败 |
| Manual staging rerun | `workflow_dispatch`, current HEAD full SHA | 与 automatic staging 相同 | write 权限、Environment 可用、input SHA 等于当前 HEAD | actor、workflow ref、SHA 或任何发布阶段失败 |
| Release PR maintenance | verified staging success for current HEAD | release PR number and head SHA | short lived GitHub App token | token、PR update 或 required check trigger 失败 |
| Release finalization | verified release PR merge SHA | exact tag、GitHub Release URL | job scoped `contents: write` | version mismatch、tag collision、release collision |
| Release only rerun | `workflow_dispatch`, operation、candidate SHA、source run ID、attempt | release PR reconciliation or exact tag and Release | write actor、Environment `staging`、trusted successful staging record | untrusted record、HEAD drift、PR identity、version or collision failure |

### Value sourcing

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| Select candidate | immutable commit SHA | automatic run 使用 `github.sha`，manual run 使用经过完整格式检查且精确等于 GitHub API 当时返回的 `master` HEAD 的 input |
| Select database | project ref、exact Session Pooler host、port、database、qualified role、TLS mode | committed `config/database-targets.json` 加由 GitHub secrets 临时构造的 `.env.staging`；pooler host 从 Supabase Connect 面板复制并经评审提交，不从 region 猜测 |
| Check PR migrations | added、modified、deleted migration paths | PR merge base and candidate tree |
| Check deploy migrations | applied、pending、failed names and checksums | candidate migration tree plus structured staging status and `_prisma_migrations` |
| Report migration state | applied、pending、failed migration | `pnpm db:staging:migration:probe` 与 reconciliation 的结构化脱敏输出，以及 Prisma `_prisma_migrations` |
| Select Vercel project | organization ID、project ID、project name | GitHub Environment variables 与已知项目 `feline-blog-staging`，两者必须一致 |
| Select previous app | stable alias、previous deployment ID、URL、commit metadata | Vercel alias inspection for `STAGING_BASE_URL`, validated against org and project; first run also must match `STAGING_BASELINE_DEPLOYMENT_ID` and `STAGING_BASELINE_COMMIT_SHA` |
| Deploy candidate | unique deployment URL、deployment ID、Production target、correlation metadata | `vercel deploy --prod --skip-domain` output plus metadata `githubCommitSha`、`githubCommitRef`、`felineRunId`、`felineRunAttempt` and `felineRecordKey` |
| Reconcile unknown deploy | zero、one or many candidate matches | Vercel list or deployment API filtered by all correlation metadata, org、project、Production target and run start time; exactly one is reusable, zero is absent, many is blocking ambiguity |
| Promote candidate | stable deployment ID and alias mapping | candidate ID after smoke plus Vercel promote result and follow up alias inspection |
| Select stable URL | staging base URL | GitHub Environment variable `STAGING_BASE_URL` |
| Authenticate protected deployment | short lived OIDC token | smoke job 以 `id-token: write` 调用 GitHub OIDC provider，使用默认 audience `https://github.com/ZXFTech`，每个 smoke phase 即时签发 |
| Select allowed smoke origin | one exact HTTPS origin | candidate from verified deployment URL; stable from normalized `STAGING_BASE_URL`; recovery from the same stable origin after alias identity check; wildcard hosts are forbidden |
| Check public marker | expected page identity | `/` and `/blog` must return HTML with `<title>neon cat</title>`、`html[lang="zh-cn"]` and same origin navigation links for `/blog` and `/todo`; deployment binding comes from verified deployment or alias inspection, not page content |
| Authenticate smoke test | synthetic identity | GitHub Environment secrets `E2E_USER_EMAIL`、`E2E_USER_PASSWORD`; expected ID from variable `E2E_USER_ID`; actual ID and email from `/api/auth/me` |
| Scope smoke data | exact created IDs、unique prefix、server `createAt`、expiry cutoff | authenticated `/api/v1/staging-smoke/todos`, GitHub run ID、attempt、candidate SHA、`SMOKE_DATA_RETENTION_HOURS` and server current time |
| Record release eligibility | exact verified base SHA | successful final staging checkpoint and GitHub deployment status for the release PR current base SHA |
| Identify release PR | one trusted merged PR | GitHub commits associated PR lookup filtered by base `master`、merge SHA、`RELEASE_APP_LOGIN`、`autorelease: pending` label and committed manifest version |
| Compute version | next SemVer、tag、changelog entries | Release Please config、current manifest version、Conventional Commit history |
| Authenticate release PR | short lived installation token | GitHub App ID and private key secrets scoped to this repository |
| Bind release | verified SHA、version、tag target、release URL | trusted final checkpoint plus matching versions from committed `package.json`、`.release-please-manifest.json` and first `CHANGELOG.md` version section, then Git ref and Release lookup |
| Publish evidence | fixed record schema and durable phase history | explicit GitHub deployment payload and statuses plus immutable per phase checkpoint artifacts, rendered to the final job summary |

### Key invariants

* 只有 `master` 历史中的 immutable commit 可以改变 staging。
* PR 代码永远不能读取 staging secrets。
* 同一时间最多一个运行持有 staging database advisory lock 或改变稳定 Vercel 环境。Migration controller 保持锁连接存活并监控它，Prisma 使用第二条 Session Pooler 连接；锁连接丢失时立即终止 Prisma 子进程。
* 应用发布之前必须完成 migration。migration 必须向前兼容上一份 READY 应用。
* 数据库不自动降级，也不自动执行 `migrate resolve`。
* tag 与 GitHub Release 只能指向已通过 staging smoke test 的同一个 commit。
* synthetic cleanup 只能软删除专用测试账号拥有且带本功能规定前缀的数据。本轮记录 ID 可以立即清理；只有孤儿数据还必须超过保留时间。
* Vercel stable alias 只能由本 workflow 的 promote 或 recovery 阶段改变。
* Vercel source upload 只能来自 candidate SHA 的 clean Git archive，不能来自含 secrets 的 runner working tree。
* Candidate 是使用 Production 变量构建的 staged Production deployment。Promote 只分配稳定域名，不重建应用。
* 任何远程 mutation 都必须先有 durable intent checkpoint。未知结果必须按 record key 对账。
* legacy MariaDB 和 production 环境不属于此 pipeline。
* Vercel Deployment Protection 和 SSO 始终保持开启。自动 smoke 不保存静态 bypass secret，也不把认证凭据放进 URL。
* OIDC token 只在对应 smoke phase 内存活，只能发送到已经核验的单一 HTTPS origin。Candidate token 与 stable token 不复用。
* Staging migration 只使用精确 allowlist 的 Supavisor Session Pooler `5432`。Direct endpoint 与 Transaction Pooler `6543` 均不属于自动化目标。

### Security model

PR workflow 只具有 `contents: read`，不绑定 GitHub Environment，也不读取 secrets。发布 workflow 只由受保护的 `master` push 或经过权限与 ancestry 验证的 manual input 触发。禁止用 `pull_request_target`、`workflow_run` 或来自 PR 内容的 shell interpolation 承接 privileged 发布。

受保护部署访问使用 Vercel Trusted Sources，不使用 `VERCEL_AUTOMATION_BYPASS_SECRET`。Vercel 端的 GitHub Actions trusted source 必须精确匹配 `repository=ZXFTech/feline-blog-app`、`ref=refs/heads/master`、`environment=staging`、`workflow_ref=ZXFTech/feline-blog-app/.github/workflows/staging.yml@refs/heads/master` 和默认 audience `https://github.com/ZXFTech`，只允许访问项目 `feline-blog-staging` 的 Production 环境。Candidate 与 stable 都是同一项目的 Production deployment，区别只是 candidate 尚未绑定稳定域名。若任一 claim 或目标环境不匹配，请求继续受 SSO 保护并使 smoke 失败。

只有 candidate smoke、stable smoke 与 `recovery-verification` job 具有 `id-token: write`。Smoke harness 直接读取 runner 提供的 `ACTIONS_ID_TOKEN_REQUEST_URL` 和 `ACTIONS_ID_TOKEN_REQUEST_TOKEN`，在进程内向 GitHub OIDC provider 请求默认 audience token，不通过 step output、`GITHUB_ENV` 或文件传递它。它只解析 JWT payload 的 `exp`，不验证或记录 token 内容；剩余寿命不超过 90 秒时在同一受控进程内重新签发，只重放尚未开始的只读请求，不自动重放任何 mutation。Public smoke 对 URL 做规范化与 exact origin allowlist 检查后才添加 `x-vercel-trusted-oidc-idp-token`，手动处理 redirect，并在每一跳发送前重新核验 origin。

Playwright 不设置全局 `extraHTTPHeaders`。它以路由拦截只对已核验的 exact origin 注入 OIDC header，拒绝任何跨 origin document、redirect 或 subresource，设置 `serviceWorkers: "block"`，禁用 trace、HAR、截图和视频，并在阶段结束时销毁 context。它不写 `storageState`，不复用 candidate、stable 或 recovery 的 context。OIDC request bearer、签发后的 token、认证头、Cookie 与登录凭据不得写入文件、cache、artifact、job summary 或测试报告；错误输出只保留 phase、脱敏 host、path、HTTP status 和 allowlisted failure code。

GitHub Environment `staging` 保存迁移、Vercel 和 synthetic smoke 凭据，并限制 `master`。每个 job 只在自身 `env` 中映射明确需要的单个值：migration 只接收 `POSTGRES_MIGRATION_URL` 与 `POSTGRES_SSL_CA`，deploy、promote 和 restore 只接收 `VERCEL_TOKEN` 与 Vercel project variables，candidate authenticated smoke 只接收 `E2E_USER_EMAIL`、`E2E_USER_PASSWORD` 与 `E2E_USER_ID`，public stable 与 recovery smoke 不接收 synthetic credentials，release maintenance 只接收 GitHub App secrets。禁止把整个 `secrets` context 作为 reusable workflow input、JSON、environment 或命令参数传递。Release finalization 的 `contents: write` 只授予独立 job。所有 `uses:` 固定到完整 SHA。Checkout 在不需要写 Git 的 job 中使用 `persist-credentials: false`。任何 secret 都不作为 CLI flag、step output、artifact 或日志内容传递。

Staging migration 使用精确 allowlist 的 Supavisor Shared Pooler Session endpoint、qualified username `app_migrator.<stagingProjectRef>`、端口 `5432`、TLS certificate verification 和 advisory lock。独立的 migration target classifier 先校验 hostname、port、database、完整 username、project ref 与零 URL 参数，再允许 DNS 或 socket 操作；不得以 `*.pooler.supabase.com` 通配、host suffix 或仅 username 前缀替代精确匹配。Exporter、admin 和 legacy import 保留规格 0009 的各自角色分类器与命令，不复用 migration-only classifier；CI migration job 不读取 `POSTGRES_EXPORTER_URL` 或 `POSTGRES_ADMIN_URL`。CI 在 migration job 中临时创建 mode 0600 的 `.env.staging`，该 job 不运行 Vercel CLI，并在结束时删除文件。Vercel job 从 candidate SHA 的 clean Git archive 开始，并断言没有 secrets 或未跟踪文件。Vercel CLI 从环境读取 `VERCEL_TOKEN`、`VERCEL_ORG_ID` 和 `VERCEL_PROJECT_ID`，不得使用 `--token`。

| Credential | Source and lifetime | Authorized use | Explicit boundary |
| --- | --- | --- | --- |
| Vercel OIDC token | GitHub OIDC provider，per smoke phase，短期内存值 | 穿过 Deployment Protection 访问一个已核验 origin | 不授权 Vercel management API；不供 deploy、promote 或 restore；不跨 phase 或 origin 复用 |
| `VERCEL_TOKEN` | GitHub Environment secret，dedicated Vercel principal | deploy、inspect、promote、restore `feline-blog-staging` | job 必须同时核验 org/project；workflow 不调用 environment、member、billing 或其他项目管理接口 |
| `POSTGRES_MIGRATION_URL` and CA | GitHub Environment secrets，migration job 临时文件 | 通过 allowlisted Session Pooler 以 `app_migrator.<stagingProjectRef>` 对 staging database 执行已提交 migration | 不进入 deploy 或 smoke job；不允许 Direct endpoint、Transaction Pooler、application login、数据复制、reset 或 production target |
| Synthetic user credentials | GitHub Environment secrets，candidate authenticated smoke job only | 通过正常登录流程操作该用户自己的 Todo | 账号保持最低普通用户角色；不进入 stable、recovery、deploy 或 release job |
| GitHub App installation token | App ID 与 private key 在 release maintenance job 内即时换取 | 在本仓库读写 contents 与 pull requests，维护 Release Please PR | installation 只安装到本仓库；不用于 staging deployment、tag 或 Release finalization |
| Job `GITHUB_TOKEN` | GitHub per job token | 按 job 的显式 `permissions` 读写 deployment、artifact、check 或最终 tag/Release | workflow 默认 `permissions: {}`；权限不通过共享 token 跨 job 传递 |

日志脱敏在序列化边界执行，不依赖事后文本替换。命令 wrapper 关闭 shell tracing；HTTP wrapper 从错误对象移除 request headers、Cookie、authorization、request body 与完整 URL query；数据库错误只映射到安全错误码和 migration name；Vercel host 只以 SHA256 prefix 进入持久记录。任何未列入 record schema 的 provider payload 都不得写入日志或 artifact。

### Configuration required

GitHub Environment `staging` secrets:

* `POSTGRES_MIGRATION_URL`: Supabase Connect 面板给出的 Shared Pooler Session mode URL，host 必须等于提交的 exact allowlist，port 必须为 `5432`，database 必须为 `postgres`，username 必须为 `app_migrator.<stagingProjectRef>`；密码需要 URL encode，URL 不携带 TLS 或其他 query 参数
* `POSTGRES_SSL_CA`: 能验证 exact Session Pooler hostname 的 Supabase CA PEM；从当前项目 Connect 面板获取并用 hosted runner probe 验证，不假设旧 Direct endpoint CA 一定适用
* `VERCEL_TOKEN`: scoped Vercel access token
* `E2E_USER_EMAIL`: synthetic staging account email
* `E2E_USER_PASSWORD`: synthetic staging account password
* `RELEASE_APP_PRIVATE_KEY`: GitHub App private key for a short lived installation token

Vercel project `feline-blog-staging` Deployment Protection:

* GitHub Actions Trusted Source，限定仓库 `ZXFTech/feline-blog-app`、分支 `master`、GitHub Environment `staging` 和 `.github/workflows/staging.yml`。
* Audience 使用 GitHub 默认值 `https://github.com/ZXFTech`，不维护自定义 audience。
* Applies to environments 只选择 Production，同时覆盖 staged Production candidate 与稳定 staging alias。
* 不创建供 CI 使用的 Protection Bypass for Automation secret。若项目已有此类 secret，它不进入 GitHub，完成 OIDC 验证后可独立撤销。

GitHub Environment `staging` variables:

* `VERCEL_ORG_ID`: Vercel team identifier
* `VERCEL_PROJECT_ID`: exact identifier for `feline-blog-staging`
* `STAGING_BASE_URL`: stable staging URL
* `STAGING_BASELINE_DEPLOYMENT_ID`: 首次自动 promote 前人工确认的当前稳定 deployment ID
* `STAGING_BASELINE_COMMIT_SHA`: 与 baseline deployment metadata 一致的 40 字符 commit SHA
* `SMOKE_DATA_RETENTION_HOURS`: stale synthetic data cutoff, fixed to `24` unless this spec is revised
* `E2E_USER_ID`: synthetic staging account 的不可变用户 ID
* `RELEASE_APP_ID`: 用于 release PR maintenance 的 GitHub App Client ID，不是 App slug 或 numeric App ID

Vercel project `feline-blog-staging` runtime variables:

* `STAGING_SMOKE_API_ENABLED`: 只在该 staging 项目设为 `true`，其他环境缺省为 false
* `STAGING_SMOKE_USER_ID`: 必须等于 GitHub Environment 中的 `E2E_USER_ID`

Repository configuration:

* repository variable `RELEASE_APP_LOGIN`: 允许维护 release PR 的 GitHub App bot login，包含 `[bot]`；该公开身份必须可被 `pull_request` workflow 读取，不放在只允许 protected branch ref 的 `staging` Environment
* `release-please-config.json`: single Node package, branch `master`, stable releases, changelog enabled, `include-v-in-tag: true`, no package publish
* `.release-please-manifest.json`: `{ ".": "0.1.0" }`
* `config/database-targets.json`: 记录非 secret 的 `stagingSessionPoolerHost`、`stagingProjectRef`、`stagingDatabase`、固定 session port `5432`、`stagingMigrationLockTimeoutMs=5000` 和 `stagingMigrationStatementTimeoutMs=120000`；只接受一个完整 hostname，不接受 wildcard 或从 region 动态拼接
* `package.json` and `pnpm-lock.yaml`: Vercel CLI 与 Prisma CLI 的唯一版本来源；workflow 只报告实际 lockfile 版本，不接受 Environment variable 覆盖
* `.github/dependabot.yml`: weekly `github-actions` updates
* `.github/workflows/release-bookkeeping.yml`: 只读取可信 staging record 的 release only 幂等重跑入口
* branch protection: required Verify check, no direct push, squash merge only，合并前分支必须与最新 `master` 同步
* Vercel project setting: independent Git production deploy disabled，CLI staged Production deploy 不自动分配稳定域名，stable alias changes only through this workflow

One-time staging role configuration:

1. 维护者在本地被忽略的 `.env.staging` 中提供规格 0009 已定义的 `POSTGRES_ADMIN_URL`、本规格定义的 `POSTGRES_MIGRATION_URL` 与 `POSTGRES_SSL_CA`。管理员连接必须先通过精确 staging project、Direct endpoint、database 和 admin role 分类，migrator 连接必须通过精确 Session Pooler 分类；管理员 URL 不得进入 GitHub Environment 或 CI job。
2. 运行 `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true pnpm db:staging:migrator-timeouts:configure`。专用进程变量只确认本次角色默认值写入，不保存到文件，也不能授权 migration、reset 或其他角色管理。
3. 首次运行在现有 staging advisory lock 下读取 `app_migrator` 的两个 timeout `rolconfig` 条目，并在修改前通过 fresh migrator Session Pooler connection 读取两个 effective timeout。它把 schema version、project ref、database、role、采集时间、每项 explicit value 或 absent 状态，以及每项 effective milliseconds 写入被 Git 忽略的 `.feline-blog/staging-migrator-timeouts-prestate.json`。记录只允许这两个参数，不含 URL、密码或 CA，并以原子 rename 完成写入。POSIX/WSL 文件使用 mode 0600；Windows 必须设置只允许当前用户和系统账户读取的等效 ACL，无法证明权限时停止。
4. Configure 是一个 fail-closed 幂等状态机。没有 pre-state 文件时执行第 3 步。有文件时先核验 schema、target identity 和字段 allowlist，比较时忽略采集时间：当前两个 explicit settings 等于已记录 pre-state 时，可执行配置；当前两个值已经等于目标 `5s/120s` 时，保留原文件且只执行后置验证；处于其他组合时视为 out-of-band drift 并拒绝。允许的配置分支在一个 transaction 中执行 `ALTER ROLE "app_migrator" SET lock_timeout = '5s'` 与 `ALTER ROLE "app_migrator" SET statement_timeout = '120s'`。角色不存在、权限不足、目标不匹配或任一语句失败时 transaction 回滚，命令失败。
5. 命令关闭自己持有的旧连接并通过精确 allowlist 的 Session Pooler 建立新的 client connections。它验证 `current_user='app_migrator'`、`current_database()='postgres'`，并把 `current_setting('lock_timeout')` 与 `current_setting('statement_timeout')` 规范化为毫秒后分别断言 `5000` 与 `120000`。Session mode 为一个 client connection 分配一个 backend connection，但 Supavisor 可能把先前创建的 backend 再分配给新 client；因此有限重连只以实际 effective values 为成功条件，不把 fresh client 等同于 fresh backend。仍不匹配时配置保留、CI 写入保持禁用，维护者通过 Direct admin 复核 `rolconfig` 后重试 probe；持续不匹配按 pooler/provider 故障处理，不自动重启 pooler或切换 Direct CI 路径。
6. 配置成功后，先在 GitHub hosted runner 手动运行当前 HEAD 的 `db:staging:migration:probe`。只有 probe 和 Prisma `migrate status` 都成功，才可恢复 staging migration 自动写入。
* GitHub ruleset: stable required checks named `Verify / verify`、`Conventional PR title` and `Release eligibility / verified-base`; eligibility check 对普通 PR 返回 not-applicable success，对符合 release App 身份特征的 PR 核验最新 base SHA；title edits rerun the title check and squash commit messages use the approved PR title
* local migration replay: uses the immutable PostgreSQL image and bootstrap contract already recorded by spec 0009, and proves ordered replay rather than full Supabase service emulation

Vercel project `feline-blog-staging` retains all application build and runtime variables. GitHub receives no runtime database role or application secrets beyond the explicit migration and smoke credentials above.

### Smoke application surface

| Surface | Contract | Authorization and failure behavior |
| --- | --- | --- |
| `GET /api/auth/me` | 返回当前 synthetic user 的 `id` 与 `email`，smoke 必须同时匹配 `E2E_USER_ID` 与 `E2E_USER_EMAIL` | 沿用现有 HttpOnly `token` Cookie；未认证失败关闭 |
| `GET /api/v1/staging-smoke/todos?mode=current&prefix=<exact>&limit=<n>` | 对账本轮未知写入；只返回当前 synthetic user、与完整本轮 prefix 精确匹配的 Todo；按 `createAt,id` 排序；`limit` 为 1 至 100 | `STAGING_SMOKE_API_ENABLED` 不为 true 时返回 404；登录用户 ID 不等于 `STAGING_SMOKE_USER_ID` 时返回 403；prefix 必须精确匹配本轮格式 |
| `GET /api/v1/staging-smoke/todos?mode=orphan&limit=<n>` | 服务端以数据库 `CURRENT_TIMESTAMP` 减 `SMOKE_DATA_RETENTION_HOURS` 计算 cutoff，只返回当前 synthetic user、未软删除且 prefix 匹配完整 `e2e-staging-<run-id>-<attempt>-<sha7>` 语法的过期 Todo；按 `createAt,id` 排序；最多 100 条 | 客户端不能提供 cutoff 或裸 prefix；非法 mode 或 limit 返回 400；响应仍只含 `id,content,finished,createAt,updateAt,delete` |
| `DELETE /api/v1/staging-smoke/todos` | body 为 `ids`、`prefix`；最多 100 个 ID；只把同时属于 synthetic user、精确匹配 ID 且带 prefix 的记录软删除；已软删除目标幂等成功；返回匹配 ID 与未匹配 ID | 与 GET 相同；不能按裸 prefix 批量删除，也不能越权修改其他用户数据 |

UI smoke 仍通过 `/todo` 完成真实创建、编辑、完成和软删除。Cleanup API 只用于发现服务端 ID、未知写入结果对账、本轮按 ID 立即清理，以及后续运行清理超过保留期的孤儿数据，不替代 UI 行为验证。Orphan 查询排除已软删除记录，避免旧记录反复占满 100 条上限；超过上限的数据由后续运行继续按稳定排序分批清理。

### Execution record contract

The workflow maintains a versioned JSON record whose identity is `recordKey=<candidateSha>/<runId>/<attempt>`. Before the first remote mutation, the first phase owner creates a GitHub deployment with `environment=staging`、`ref=candidateSha` and payload `{schemaVersion,recordKey,runId,attempt,workflowRef}`. Each remote mutation has `operationId=sha256(recordKey/sequence/phase)[0:24]` where `sequence` is the committed monotonically increasing phase order. The phase owner job writes an intent status, performs or reconciles exactly that operation, uploads a full immutable checkpoint artifact named `staging-record-<sha>-<runId>-<attempt>-<sequence>-<phase>`, then writes a compact result status containing phase、operation ID and provider-returned artifact digest prefix. Jobs form one explicit `needs` chain and pass only validated checkpoint artifacts; there is no implicit shared coordinator state. Artifacts retain for 30 days. The final safe record is rendered to the job summary.

| Field | Type | Source |
| --- | --- | --- |
| `schemaVersion` | integer, initially `1` | committed controller constant |
| `recordKey` | `<sha>/<runId>/<attempt>` | trusted candidate and GitHub run context |
| `candidateSha` | 40 character hex string | trusted `master` checkout |
| `runId`, `attempt` | integer | GitHub context passed through typed environment variables |
| `workflowRef`, `runStartedAt`, `currentHeadAtLock` | string values | trusted GitHub context and GitHub API |
| `githubDeploymentId` | integer | deployment API create response |
| `operationId`, `sequence` | 24 character hash prefix and integer | SHA256 of `recordKey/sequence/phase` plus committed phase order |
| `checkpointArtifactName`, `checkpointDigest` | string values | deterministic artifact name and GitHub artifact API digest returned after upload |
| `phaseStates` | map of phase to allowed status enum | workflow controller state machine |
| `migrations` | array of name、checksum prefix、state | migration reconciliation output |
| `previous`, `candidate`, `stable` | `{deploymentId,commitSha,hostHash}` or null | verified Vercel inspection，host 只保存 SHA256 prefix |
| `cleanup` | `{currentRunDeleted,orphanDeleted,status}` | cleanup API results |
| `promote`, `recovery`, `release` | typed status plus safe identifiers | provider reconciliation and release jobs |
| `stagingVerified` | boolean plus candidate SHA and checkpoint identity | independent checkpoint written immediately after stable public smoke, before release bookkeeping |
| `failureCode` | allowlisted enum or null | phase error mapping |

`phaseStates` 固定包含 `verify`、`head-check`、`checkpoint`、`migration-reconcile`、`migrate`、`capture-previous`、`deploy`、`candidate-public-smoke`、`candidate-auth-smoke`、`candidate-cleanup`、`promote`、`stable-public-smoke`、`restore`、`recovery-public-smoke`、`release-maintenance` 和 `release-finalize`。状态只能是 `pending|running|succeeded|failed|skipped|superseded`。`failureCode` 只能取提交的 enum，包括 `HEAD_DRIFT`、`MIGRATION_DIVERGENT`、`MIGRATION_FAILED`、`REMOTE_AMBIGUOUS`、`DEPLOY_TIMEOUT`、`OIDC_REJECTED`、`ORIGIN_REJECTED`、`SMOKE_FAILED`、`CLEANUP_FAILED`、`ALIAS_CHANGED`、`RESTORE_FAILED`、`RELEASE_DEFERRED` 和 `RELEASE_COLLISION`；实现可在评审中追加 enum，不能写 provider 原始错误。

A missing value is `null`, not an empty string. A stage that never starts is `skipped`. A stale candidate is `superseded`. Exception handling and cancellation cleanup must still write the last safe checkpoint when GitHub runner is available。新运行以每页 100 条分页查询 repository 中全部 `environment=staging` deployments，直到空页，筛选 payload schema、受信 `workflowRef` 和没有 terminal result 的记录；再从 payload 读取旧 `recordKey`，按 sequence 读取 statuses，并用 deterministic exact artifact name 获取最新 checkpoint、校验 GitHub 返回的 digest。零条未闭合记录才允许开始；一条必须先完成 provider reconciliation；多条、分页未完成、API rate limit、schema 不兼容、artifact 已过期或缺失、digest 不符都阻塞并要求人工修复。存在 mutation intent 而没有 result 时，必须有限轮询 provider 后按 correlation metadata 和目标状态对账；仍为零匹配是 unknown 并停止，不能视为 absent 或盲目重放。每个 phase owner job 只在自身 mutation 窗口获得 `deployments: write`；跨运行查询只使用 `deployments: read` 与 `actions: read`。

### Migration reconciliation contract

PR verification compares the candidate tree with its merge base. Existing migration directories are immutable. Deployment sorts candidate migration directory names lexicographically, computes each `migration.sql` SHA256, then groups `_prisma_migrations` rows by `migration_name` and applies this legal state table:

| Database history for one migration name | Decision |
| --- | --- |
| Every row has non-null `rolled_back_at` and no active row | Historical rolled back attempt; migration remains pending and a later successful attempt is allowed |
| Exactly one non-rolled-back row has non-null `finished_at`, no unfinished active row, and checksum matches candidate | Applied |
| A non-rolled-back row has null `finished_at` | Blocking failed or unfinished state; stop for manual repair |
| More than one non-rolled-back finished row exists | Blocking ambiguous history |
| Applied checksum differs, or database name is absent from candidate tree | Blocking divergent history |

After classification, applied names must be an exact prefix of the ordered candidate list; all remaining candidate migrations are pending. Prisma may retain a rolled-back row after an operator runs `prisma migrate resolve --rolled-back`; that row is legal only because `rolled_back_at` is non-null, and the unchanged candidate migration becomes pending again. After an operator has fixed the database cause and explicitly marked the failed attempt rolled back, CI may re-run that pending migration; a later successful row then becomes the applied record. The workflow never executes resolve itself and never treats an unfinished active row as retryable. The first automated release has no automatic baseline exception; existing staging history must already satisfy the same reconciliation.

The SQL guard is deliberately conservative. Statements or procedural blocks it cannot classify are rejected and require a separately designed cleanup change. Timeout 的唯一持久来源是 `app_migrator` 的 PostgreSQL role defaults；controller、reconciliation 和 Prisma child 不用 session `SET` 或 startup `options` 覆盖它。每个连接都必须新建并继承同一默认值。Hosted-runner probe 在任何 reconciliation 或 migration write 前把两个 `current_setting(...)` 值规范化为毫秒并与 committed config 精确比较。Passing the guard is not proof of compatibility, so PR review must still confirm expand first behavior and compatibility with the previous READY app.

### Staging migration connection contract

`POSTGRES_MIGRATION_URL` is one secret representation of `postgresql://app_migrator.<project-ref>:<encoded-password>@<exact-session-pooler-host>:5432/postgres`. The committed target configuration supplies every non-secret comparison value. A dedicated migration classifier compares the decoded full username, not only the segment before `.`, so another tenant on the same pooler or a mistyped project ref fails closed. After connection it requires `current_user='app_migrator'` and `current_database()='postgres'`; Supavisor removes the tenant suffix before authenticating the database role. Passwords are never copied into committed config, output, artifacts or summaries.

Session mode is required because migration tooling expects connection-scoped PostgreSQL behavior and prepared statement compatibility. Transaction mode on `6543` is not an automatic fallback. The Direct endpoint is also rejected by the CI migration path and migration-only commands because its IPv6-only path is not portable to GitHub hosted runners. A maintainer may use provider tooling for an explicit emergency diagnosis, but that path cannot be selected by CI and does not weaken the committed migration classifier.

The raw secret URL must contain zero query parameters. The trusted wrapper writes the decoded CA to a mode 0600 temporary file, then alone derives the Prisma child URL by adding `sslmode=verify-full` and `sslrootcert=<temporary-file>`；它不得添加 `options` 或其他 timeout 参数。Node-postgres receives the same CA as an `ssl.ca` value with certificate and hostname verification enabled. `pnpm db:staging:migration:probe` first validates the raw target, opens two fresh simultaneous Session Pooler connections, verifies database identity, and converts `current_setting('lock_timeout')` and `current_setting('statement_timeout')` to milliseconds before requiring `5000` and `120000`. It then acquires and releases a run-scoped advisory lock on the controller connection and invokes the wrapper's read-only Prisma `migrate status` path. Role defaults apply at login, so the node-postgres proof on fresh connections establishes the effective policy for new sessions using the same database role, while Prisma status separately proves its actual TLS、authentication and Session Pooler path; CI does not claim that Prisma exposes its private session GUCs. This command never reads exporter or admin URLs. DNS, capacity, TLS, authentication, identity, timeout-policy or Prisma failures map to the existing `MIGRATION_FAILED` code and never expose the URL, password, CA or provider error payload.

During deploy, the controller holds the staging advisory lock on one Session Pooler connection while the Prisma child uses a second connection. The controller sends a periodic `SELECT 1` over its lock session. A client `error`、`end`、failed heartbeat or backend PID change means lock ownership is no longer provable; it sends SIGTERM to the Prisma child, waits at most 10 seconds, sends SIGKILL if needed, records `MIGRATION_FAILED`, and requires reconciliation before any retry. The runner probe must prove the project has capacity for both connections before write mode is enabled.

### Vercel promotion and recovery contract

The Vercel adapter is implemented against one exact lockfile version and exposes typed operations for deploy staged Production candidate、inspect deployment、inspect stable alias、promote candidate and restore previous. `vercel deploy --prod --skip-domain` adds exact metadata `githubCommitSha=<candidateSha>`、`githubCommitRef=master`、`felineRunId=<runId>`、`felineRunAttempt=<attempt>` and `felineRecordKey=<recordKey>`. Every result includes organization、project、target、deployment ID、state、URL and commit metadata. A remote success followed by local timeout queries the Vercel list or deployment API using all correlation metadata、organization、project、Production target and run start time. It polls at most 5 times with exponential backoff capped at 30 seconds. Exactly one match may be reused; multiple matches or zero matches after the final poll are blocking ambiguity and must not trigger another mutation.

The stable alias is never moved before candidate smoke and cleanup succeed. `vercel promote` promotes the same deployment without rebuild. The workflow is the sole authorized stable alias writer, but the provider does not promise an atomic compare and set: immediately before promote it re-reads the alias and requires it still equal `previous`; immediately after promote it requires it equal `candidate`. Any mismatch stops without a compensating write. Recovery follows the same precondition and restores only when alias still equals this run's candidate; the restore job has no OIDC. A separate `recovery-verification` job then verifies alias identity and runs protected public smoke against the recorded previous SHA. Initial setup additionally requires current alias to equal both `STAGING_BASELINE_DEPLOYMENT_ID` and `STAGING_BASELINE_COMMIT_SHA`; later successful records become the trusted previous history.

### Smoke and cleanup contract

Candidate public smoke requires successful HTML responses for `/` and `/blog` with `<title>neon cat</title>`、`html[lang="zh-cn"]` and same-origin links to `/blog` and `/todo`; deployment identity is proven separately through the verified Vercel deployment metadata. Candidate authenticated smoke logs in through `/login`, confirms `/api/auth/me` matches the expected ID and email, and completes create、edit、complete and soft delete on `/todo`. Stable and recovery smoke are public-only and prove the stable alias maps to the expected deployment ID and commit before requesting the same public markers. Each phase mints or refreshes its own OIDC token and only sends it to that phase's one normalized exact HTTPS origin.

The test records every created resource ID returned by the staging-only API. Its `finally` path immediately soft deletes this run's IDs regardless of age. Unknown mutation results use `mode=current` and the exact full prefix. Before creating new data, the next run may use `mode=orphan`; the server derives time from PostgreSQL `CURRENT_TIMESTAMP`, applies the fixed retention interval and prefix grammar, and returns only not-yet-deleted rows capped at 100. It refuses an unexpected owner、prefix、ID or response shape. Candidate cleanup must succeed before promote. No stable or recovery smoke receives credentials or mutates application data.

### Retry and timeout rules

* Verify 保持 20 分钟 job timeout。Migration reconciliation 有 5 分钟，migration job 有 10 分钟；每个 database session 另设 5 秒 `lock_timeout` 与 120 秒 `statement_timeout`。
* Staged Production upload and READY polling 有 15 分钟。Candidate public smoke 有 2 分钟，authenticated smoke 有 5 分钟，cleanup 有 2 分钟。
* Promote 有 3 分钟，stable public smoke 有 2 分钟。开始 promote 前必须至少保留 6 分钟给 restore 与 recovery public smoke；restore 和 recovery public smoke 各有 2 分钟。没有 recovery 预算时不得开始 promote。
* Vercel polling and public idempotent GET 可以对 transient network failure 做最多 5 次 exponential backoff，单次间隔不超过 30 秒。Mutation command 不盲目重试，先按 record key reconciliation。OIDC token 剩余寿命低于 90 秒时只刷新 token，不重放 mutation。
* Migration、Release Please、authenticated mutation 和 cleanup 不自动重放。每个 timeout 映射到固定 failure code。

### Release coordination contract

Release PR maintenance is downstream bookkeeping, not part of the staging deployment transaction. Before minting the GitHub App installation token it re-reads `master` and requires `HEAD=candidateSha`; immediately after Release Please returns it re-reads again. If either check differs, it records `RELEASE_DEFERRED` and does not treat the run as failed staging. `Release eligibility / verified-base` runs for every PR。普通 PR 返回 not-applicable success；只有 author 等于 `RELEASE_APP_LOGIN` 且带 `autorelease: pending` 的候选 release PR 才解析其当前 base SHA，并要求一个 schema-compatible successful staging deployment record whose final checkpoint proves that same SHA passed stable public smoke。Branch protection 还要求 PR 与最新 `master` 同步，因此 base 前进会使旧检查失效并要求重新核验。

Release finalization filters associated PRs by base `master`、exact merge SHA、`RELEASE_APP_LOGIN`、`autorelease: pending` and matching committed manifest version. Zero or more than one match fails closed. `.github/workflows/release-bookkeeping.yml` accepts only `operation=maintain-pr|finalize-release`、`candidateSha`、`sourceRunId` and `attempt`, reconstructs `recordKey`, and requires a matching `stagingVerified=true` checkpoint plus successful GitHub deployment status before doing any write. `maintain-pr` still requires current `master` HEAD to equal candidate SHA. `finalize-release` may continue after `master` advances only if candidate remains an ancestor of current `master`、the trusted release PR identity matches and no version or tag collision exists. Its input never selects workflow code or an arbitrary Git ref. If the required checkpoint artifact has expired after 30 days, automated release-only recovery fails closed; the commit must pass a newly authorized staging verification or be handled manually.

### Critical test scenarios

* Happy path: squash merge a `feat` PR, verify、migration、staged Production deployment、candidate public and authenticated smoke、cleanup、same deployment promote and stable public smoke pass, Release Please updates the release PR，verifies **AC-1** through **AC-7**, **AC-10**, **AC-11**.
* No migration: a code only commit reports zero pending migrations and continues to deployment，verifies **AC-3** through **AC-6**.
* Unsafe migration: a migration containing a destructive statement fails before any staging secret is used for mutation，verifies **AC-4**, **AC-12**, **AC-13**.
* Failed migration: Prisma records failure and the workflow stops without resolve or application deploy，verifies **AC-5**.
* Failed smoke after migration: before promote the stable alias remains unchanged; after promote it is restored only if it still points to this candidate, then public recovery smoke passes and the release step does not run，verifies **AC-8**, **AC-10**.
* Manual misuse: a short SHA or commit outside `master` is rejected before Environment secrets are available，verifies **AC-9**, **AC-12**.
* Stale run: an older SHA obtains the lock after `master` advances and becomes superseded before secrets can mutate staging，verifies **AC-3**, **AC-9**, **AC-13**.
* Migration drift: changed checksum、missing history、unfinished active row or duplicate active success stops before deploy; a row with non-null `rolled_back_at` remains legal history and a later matching success applies，verifies **AC-4**, **AC-5**, **AC-13**.
* Remote timeout: candidate deployment succeeds remotely while CLI loses the response; all correlation metadata finds exactly one deployment and does not create a duplicate; zero or multiple matches stop，verifies **AC-6**, **AC-10**, **AC-13**.
* Runner loss after intent: a new run reads the GitHub deployment and immutable checkpoint, reconciles the provider result, and either records the result or stops without replaying the mutation，verifies **AC-10**, **AC-13**.
* Alias race: stable alias changes outside this run before promote or recovery; compare and set validation stops without overwriting it，verifies **AC-8**, **AC-13**.
* Cleanup isolation: this run's recorded IDs are removed immediately while only prefixed synthetic records older than 24 hours qualify as orphans; ordinary staging data remains untouched，verifies **AC-7**, **AC-13**, **AC-14**.
* Recovery separation: restore runs without OIDC and only changes the alias; a separate Environment-bound job mints OIDC and proves the previous deployment ID and SHA by public smoke，verifies **AC-8**, **AC-12**, **AC-13**.
* Release PR merge: the release commit passes staging first, then creates the expected exact SHA `v0.x.y` tag and GitHub Release without publishing npm; a matching repeat is success and a mismatched existing tag fails，verifies **AC-10**, **AC-11**, **AC-13**.
* Release race: `master` advances before or after Release Please, so bookkeeping is deferred; the required verified-base check prevents a release PR whose new base lacks a successful record from merging，verifies **AC-11**, **AC-13**.
* Release only rerun: trusted record inputs reproduce a missing PR update or exact tag idempotently; altered SHA、run ID or attempt cannot select another record，verifies **AC-10** through **AC-13**.
* Fork PR: validation runs without secrets and cannot reach Supabase or Vercel，verifies **AC-1**, **AC-12**.
* Protected deployment identity: a token with the expected repository、branch、Environment、workflow ref and audience reaches candidate and stable origins; a wrong claim、expired token、unlisted host or cross origin redirect receives no authentication header and fails closed，verifies **AC-7**, **AC-12**, **AC-13**.
* Redaction: forced smoke failure emits only the safe failure record and produces no trace、HAR、screenshot、video、header、token、Cookie or credential artifact，verifies **AC-10**, **AC-13**.
* Session Pooler target: the exact host、`5432`、`postgres`、qualified migrator username and CA pass classification; a GitHub hosted runner uses fresh connections to prove two simultaneous sessions、`current_user`、role-default `5000ms` and `120000ms` timeouts、advisory lock and Prisma `migrate status`; Direct endpoint、`6543`、wildcard host、wrong project ref、bare role and raw URL query parameters fail before network access，verifies **AC-5**, **AC-12**, **AC-13**, **AC-15**.
* Timeout configuration guard: missing write confirmation、wrong admin target、missing role、insufficient privilege or either failed `ALTER ROLE` leaves both values unchanged; a stale pooler session is discarded and bounded fresh-session retries must observe both values before CI writes are enabled，verifies **AC-13**, **AC-14**, **AC-15**.
* Timeout configure recovery: configure is repeated after success、after commit but before verification、and after post-commit verification failure; target settings retain the original pre-state and only reverify, original settings may reapply, and a third state fails as drift，verifies **AC-13**, **AC-14**, **AC-15**.
* Timeout rollback matrix: pre-state covers both entries absent、one absent and one explicit、and both explicit non-target values; rollback verifies both catalog state and the original effective milliseconds through a migrator connection，verifies **AC-13**, **AC-14**, **AC-15**.
* Session lock loss: the controller connection ends while Prisma is running, so the child is terminated within the fixed grace period and a later run reconciles migration state before retry，verifies **AC-3**, **AC-5**, **AC-15**.

## Build plan

1. Restore the existing staging thread at its first broken boundary: add the dedicated migrator Session classifier without changing exporter or admin strategy, commit the exact target and desired timeout constants, update the GitHub Environment migration URL, add the guarded one-time role-default configure and rollback commands, derive only verified TLS inside the Prisma wrapper, and prove the node-postgres dual-session、identity、role-default timeout、lock and Prisma status paths from a GitHub hosted runner before allowing deploy, satisfies **AC-5**, **AC-12**, **AC-13**, **AC-14**, **AC-15**.
2. Continue the end to end staging thread: keep secretless PR checks, pin stable check names, replay and reconcile migrations with spec 0009's immutable local image, create the GitHub deployment record, deploy a clean archive with `--prod --skip-domain`, run exact-origin protected public smoke, promote that same deployment without rebuild, repeat public smoke on the stable origin, and persist phase checkpoints, satisfies **AC-1**, **AC-3** through **AC-8**, **AC-10**, **AC-12**, **AC-14**.
3. Harden the thread: implement the `_prisma_migrations` legal-state table、conservative SQL checks、correlation metadata、provider reconciliation、baseline verification、whole-pipeline concurrency、stale candidate detection、job-scoped permissions、OIDC expiry refresh、redaction and bounded phase budgets; add protected branch、Conventional Commit rules、full SHA action pins、Dependabot and current-HEAD manual rerun, satisfies **AC-2** through **AC-6**, **AC-9**, **AC-10**, **AC-12**, **AC-13**.
4. Complete real use verification and recovery: add the staging-only Todo cleanup API, adapt Playwright for per-request exact-origin injection with blocked service workers and no retained media, implement public、login、identity and Todo behavior, split immediate and orphan cleanup, then add pre/post alias checks、restore without OIDC and separate recovery verification, satisfies **AC-7**, **AC-8**, **AC-10**, **AC-12** through **AC-14**.
5. Add Release Please after the verified staging gate: configure manifest and changelog, create short lived GitHub App tokens for version PR maintenance, add pre/post HEAD checks and the required verified-base check, implement trusted release PR filtering and the release-only workflow, then make exact-SHA tag and GitHub Release creation idempotent without npm publish, satisfies **AC-2**, **AC-10** through **AC-13**.

## Consequences

**Positive**:

* Every staging state points to one reviewed commit and one recorded migration state.
* Database and application ordering is explicit, observable and repeatable.
* A runner loss after a remote mutation can be reconciled from GitHub deployment statuses、immutable checkpoints and provider metadata.
* Release bookkeeping no longer depends on a local machine changing Git state.
* The same smoke path proves automatic and manual reruns.

**Negative / tradeoffs**:

* Each merge waits for migration, remote deployment and smoke checks, so staging feedback is slower than Vercel Git Integration alone.
* Durable checkpoints and a separate recovery verification job add workflow and artifact complexity.
* Vercel token and database credentials remain long lived secrets that require rotation and least privilege review.
* Forward only migration means recovery after a schema mistake may require a repair migration instead of a quick rollback.
* The migration SQL checker catches known dangerous patterns but cannot prove every SQL change is compatible. PR review remains necessary.
* Session Pooler adds a provider-managed hop and holds one backend connection for each migration session. A Supavisor outage blocks migration even when the database itself is healthy.
* Timeout policy now depends on persistent `app_migrator` role defaults. An authorized out-of-band role change blocks the next probe, but repository code alone cannot prevent that configuration drift.

**Neutral**:

* The Vercel project's production target is used as the stable staging target. The product production environment remains absent and out of scope.
* GitHub and Vercel remain the deployment record. No application deployment table is added.
* Release Please creates repository versions and Releases only. The private package is never published.
* Vercel SSO stays enabled for people. Automated access depends on the GitHub OIDC provider and the Trusted Source claim rule being available.

## Migration plan

**Strategy**: strangler

**Phases**:

1. Keep the existing PR Verify behavior and add deterministic migration safety checks without secrets.
2. Replace the staging migration secret and exact target allowlist with the Supabase Connect Session Pooler values. Capture the current allowlisted timeout entries from `pg_roles.rolconfig`, run the guarded one-time `db:staging:migrator-timeouts:configure` command through the existing local admin boundary, close old connections, then run `db:staging:migration:probe` from GitHub hosted Ubuntu to prove fresh node-postgres sessions and the Prisma path. Do not enable migration writes until all checks pass; the admin credential remains outside CI and exporter configuration is unchanged.
3. Disable independent Vercel Git production deploys and automatic stable-domain assignment, configure the Production-only Trusted Source, set the synthetic account and baseline variables, then add the full staging path behind `workflow_dispatch` restricted to current HEAD. Prove reconciliation、staged Production candidate、protected smoke、same-deployment promote、restore and separate recovery verification against `feline_blog_staging` and `feline-blog-staging`.
4. Enable automatic `master` staging, enforce whole pipeline concurrency and stale candidate handling, then add Release Please and exact SHA release finalization after the staging success gate.
5. Retire the unimplemented local release design and keep local commands only for explicit development diagnostics.

**Rollback**: first disable the staging migration trigger or keep its write step blocked, while retaining secretless PR verification. Confirm `.feline-blog/staging-migrator-timeouts-prestate.json` belongs to the exact staging project、database and `app_migrator` role. Using the same exact-target admin boundary and `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true`, run `pnpm db:staging:migrator-timeouts:rollback`. The command acquires the staging advisory lock and applies a fail-closed state machine：当前两个 explicit settings 等于目标值时可恢复；已经等于记录的 pre-state 时只复验；其他组合视为 drift 并拒绝。恢复 transaction 对 pre-state 中 absent 的条目执行对应的 `ALTER ROLE "app_migrator" RESET`，对 explicit 条目恢复其经过 allowlist 解析的原值。随后先从 `pg_roles.rolconfig` 验证 explicit/absent 状态，再关闭旧连接并通过 bounded fresh Session Pooler connections 验证 migrator 的两个 effective milliseconds 等于记录值；不能用 admin session 的 `SHOW` 代替。只有两层验证都成功，才可把记录原子 rename 为 timestamped `.rolled-back.json` audit copy。Missing、already-consumed or ambiguous pre-state、target mismatch、privilege failure or verification failure stops for manual repair and must not resume migration. Do not put the admin URL in CI and do not fall back to the Direct endpoint from GitHub Actions. If application publishing already began, revert the workflow commit, keep applied additive migrations, and restore the last READY Vercel deployment. Never roll back business migrations automatically.

**Risks**: the pooler hostname or CA may be copied incorrectly; Supavisor may retain an old backend session briefly after role defaults change; an out-of-band role change may drift the timeout policy; a Supavisor incident may block migration; an incorrectly classified SQL statement may pass the static guard; a leaked long lived token could affect staging; a Vercel rollback may fail during provider outage; a synthetic cleanup defect could leave test rows. Fresh connections、bounded retries、exact numeric probe、exact target matching、allowlist、least privilege、scoped cleanup、redaction and forward repair rules limit these risks.

## Follow-up

* [ ] Connect the official GitHub、Vercel and Supabase MCP servers in Codex settings. Scope Supabase to the staging project with read only access, and grant only the GitHub and Vercel capabilities needed to inspect workflow and deployment state.
* [ ] `release-please` conventions are not yet in root `AGENTS.md`. They apply to repository wide commit and release work and belong in the root Agent skills section.
* [ ] `supabase-postgres-best-practices` conventions are not yet in root `AGENTS.md`. They apply to the primary PostgreSQL system and belong in the root Agent skills section.
* [ ] `github-actions-hardening` conventions are not yet in root `AGENTS.md`. They apply to every workflow and belong in the root Agent skills section.
* [ ] `vercel-cli-with-tokens` conventions are not yet in root `AGENTS.md`. They apply to repository deployment work and belong in the root Agent skills section.
* [ ] `prisma-cli-migrate-deploy` is not yet referenced by `prisma/AGENTS.md`. Its staging migration rules belong in that nested context file.
* [ ] Design production promotion as a separate feature after the staging pipeline has a stable operating history.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
