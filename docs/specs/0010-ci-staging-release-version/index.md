# 0010. CI、Staging 发布与版本管理

**Date**: 2026-09-20
**Status**: Proposed

## Summary

GitHub Actions 将成为 staging 发布的唯一编排入口。每次进入 `master` 的变更都先完成代码与迁移检查，再把已提交的 PostgreSQL migration 应用到 Supabase `feline_blog_staging`，随后发布到 Vercel `feline-blog-staging` 并运行真实 smoke test。Release Please 只在 staging 验证成功后维护版本 PR、changelog、Git 标签和 GitHub Release。

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
* **AC-4**: PR 检查以 PR merge base 为基线，拒绝修改或删除基线中已有的 PostgreSQL migration。staging 发布把 candidate 仓库 migration 清单与数据库 `_prisma_migrations` 对账，验证已成功记录的名称和 SHA256 checksum，拒绝 missing、divergent 或 failed 状态，并对所有实际 pending migration SQL 执行向前兼容检查。检查拒绝 `DROP`、`TRUNCATE`、直接改名、缩窄类型、无法安全分析的动态 SQL 和其他已知破坏性操作。通过后才可运行现有 `pnpm db:staging:status` 和 `pnpm db:staging:deploy`。工作流不得运行 `migrate dev`、`migrate reset`、`db push` 或 legacy MariaDB migration。
* **AC-5**: migration 失败时发布立即停止。连接失败和 migration 尚未开始可以在状态重新对账后重跑。部分执行、已有 failed migration 或未知状态必须进入人工修复流程，不自动调用 `prisma migrate resolve`，不自动标记 applied 或 rolled back。输出只包含脱敏目标、migration 名称、状态枚举、安全错误码和人工检查命令。
* **AC-6**: migration 成功后，GitHub Actions 从 candidate commit 的 clean Git archive 创建无秘密上传目录，使用 lockfile 固定的 Vercel CLI 和环境变量中的 token、组织 ID 与项目 ID，把该 commit 部署成项目 `feline-blog-staging` 的未 promote candidate。工作流确认上传目录不含 `.env.staging`、CA 临时文件或其他未跟踪文件。Vercel Git Integration 不得独立改变该项目的稳定主环境。Vercel 保存应用 build 与 runtime 变量，GitHub 不复制这些变量。
* **AC-7**: candidate READY 后，工作流只向 allowlist 中的 candidate host 和稳定 staging host 发送 smoke secrets。公开 smoke 验证 `/` 和 `/blog`。登录 smoke 通过 `/login` 使用独立 synthetic 账号，在 `/todo` 创建、更新、完成并删除一个带 `e2e-staging-<run-id>-<attempt>-<sha7>` 前缀的 Todo，并记录服务端返回的 ID。本轮结束时只按这些 ID 清理。下一次运行只可清理同一账号拥有、带规定前缀、服务端创建时间超过 24 小时的数据，单次最多 100 条。未知写入结果先按前缀查询再清理。任何 cleanup 失败都会使发布失败。
* **AC-8**: smoke 成功后才把 candidate promote 为稳定 staging。发布前从稳定域名当前 alias 映射读取 previous deployment，并验证组织、项目、READY 状态和 commit metadata。应用发布、smoke、promote 或稳定域名验证在数据库已迁移后失败时，不自动降级数据库。若稳定 alias 已改变，工作流只恢复到记录的 previous deployment，并核验 alias 精确指回该 deployment 后再运行公开 smoke。没有可验证 previous deployment 或恢复失败时停止并显示带目标 ID 的人工恢复命令，不继续版本发布。
* **AC-9**: `workflow_dispatch` 只允许具有仓库 write 权限并可使用 GitHub Environment `staging` 的成员重跑当前 `master` HEAD。输入必须是完整 commit SHA，必须等于可信 workflow 从 `master` 读取的 HEAD。人工运行执行与自动发布相同的验证、migration reconciliation、部署、smoke、promote 和恢复逻辑，不能发布任意历史 SHA，也不能用输入 SHA 选择 privileged workflow 代码。
* **AC-10**: 每次运行生成固定结构的安全执行记录，字段为 candidate SHA、run ID、attempt、各阶段状态、pending migration 名称与 checksum 摘要、previous、candidate 和 stable deployment ID、三个 URL 的脱敏 host、cleanup 结果、promote 或恢复结果、release 结果和 failure code。阶段状态只能是 pending、running、succeeded、failed、skipped 或 superseded。记录写入 GitHub job summary 和绑定 candidate SHA 的 Environment deployment。日志和输出不得包含 secrets、完整数据库 URL、Cookie、密码或 CA 内容。
* **AC-11**: Release Please 使用独立 GitHub App 的短期 installation token 维护一个版本 PR，使机器人创建或更新的 PR 正常触发 required checks。普通 commit 只有在同一 candidate SHA 的 staging 成功后才可更新版本 PR。版本 PR 合并后的当前 HEAD 也必须先通过 staging。`finalize-release` 从已提交的 `package.json`、manifest 和 changelog 读取版本，创建精确指向该 verified SHA 的 `v<version>` tag 与 GitHub Release。重复运行时，相同 tag、release 和 SHA 视为成功；名称相同但 SHA 不同立即失败。staging 已成功而 release bookkeeping 失败不会回滚应用，可独立幂等重跑。当前版本为 `0.1.0`，`fix` 增加 patch，`feat` 增加 minor，`0.x` 的破坏性变更增加 minor并写明迁移说明，不产生 prerelease，也不发布 npm package。
* **AC-12**: GitHub workflow 默认 `permissions: {}`，每个 job 只获得所需权限。所有 action 固定到完整 commit SHA并保留版本注释，Dependabot 每周检查 GitHub Actions 更新。PR job 不接收 secrets，发布 secrets 只进入使用 GitHub Environment `staging` 的 job，`VERCEL_TOKEN` 只通过环境变量传给 CLI。
* **AC-13**: CI 和 staging 发布的配置、检查器与编排逻辑具有不访问外部服务的 Vitest 覆盖。测试覆盖触发条件、可信 workflow 与 candidate SHA 分离、乱序候选、superseded 判断、migration 对账和 SQL 拒绝规则、远程成功但本地 timeout、runner 丢失、无 previous deployment、alias 被外部改变、tag 已存在、秘密脱敏、阶段短路、smoke cleanup 部分失败和恢复选择。
* **AC-14**: 本规格不创建或修改业务数据模型，不发布 production 环境，也不自动执行 Supabase 角色管理、数据复制、数据库 reset 或 destructive cleanup。

## Decision

**Chosen option**: Option 1: GitHub Actions 统一编排的分阶段发布

扩展现有 Verify 工作流，以 GitHub Actions 串联验证、staging migration、Vercel 发布、smoke test、恢复和 Release Please。GitHub Environment `staging` 是发布权限与 secrets 边界。Vercel `feline-blog-staging` 的主环境是稳定 staging，不代表博客的正式 production。

**Implementation skills**: `release-please` (`bmad-labs/skills`, `.agents/skills/release-please/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `prisma-cli-migrate-deploy` (`prisma/cursor-plugin`, `.agents/skills/prisma-cli-migrate-deploy/`) · `github-actions-hardening` (`openai/skills`, `~/.codex/skills/github-actions-hardening/`) · `vercel-cli-with-tokens` (`vercel-labs/agent-skills`, `~/.codex/skills/vercel-cli-with-tokens/`)

## Feature design

### Data model

没有新的业务实体或表。部署状态由 GitHub Actions、GitHub Environment deployment、Vercel deployment、Git 标签和 GitHub Release 保存。Supabase 只接收 `prisma/postgres/migrations` 中已经提交的 schema migration。

### Pipeline state transitions

```text
candidate: queued -> verifying -> waiting for staging lock -> current head checked -> migrations reconciled -> migrating -> candidate deploying -> candidate smoke -> promoting -> stable smoke -> cleanup -> release bookkeeping -> succeeded
candidate before migration: queued or verifying -> superseded
candidate failure before migration: current staging unchanged -> failed
candidate failure after migration but before promote: stable alias unchanged -> cleanup -> failed and repair required
candidate failure during or after promote: previous alias restored -> alias identity verified -> public smoke verified -> failed and repair required
release: no release change -> release PR updated -> release PR merged -> exact SHA staging verified -> exact SHA tag and GitHub Release created
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

### Value sourcing

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| Select candidate | immutable commit SHA | automatic run 使用 `github.sha`，manual run 使用经过完整格式与 `master` ancestry 检查的 input |
| Select database | project ref、database、role、TLS mode | committed `config/database-targets.json` 加由 GitHub secrets 临时构造的 `.env.staging` |
| Check PR migrations | added、modified、deleted migration paths | PR merge base and candidate tree |
| Check deploy migrations | applied、pending、failed names and checksums | candidate migration tree plus structured staging status and `_prisma_migrations` |
| Report migration state | applied、pending、failed migration | `pnpm db:staging:status` 的结构化脱敏输出和 Prisma `_prisma_migrations` |
| Select Vercel project | organization ID、project ID、project name | GitHub Environment variables 与已知项目 `feline-blog-staging`，两者必须一致 |
| Select previous app | stable alias、previous deployment ID、URL、commit metadata | Vercel alias inspection for `STAGING_BASE_URL`, validated against org and project |
| Deploy candidate | unique deployment URL、deployment ID、commit metadata | pinned Vercel CLI structured output for the clean archive of candidate SHA |
| Promote candidate | stable deployment ID and alias mapping | candidate ID after smoke plus Vercel promote result and follow up alias inspection |
| Select stable URL | staging base URL | GitHub Environment variable `STAGING_BASE_URL` |
| Authenticate smoke test | synthetic account credentials | GitHub Environment secrets `E2E_USER_EMAIL` 与 `E2E_USER_PASSWORD` |
| Scope smoke data | exact created IDs、unique prefix、server created time、expiry cutoff | API responses and reads under the synthetic account, GitHub run ID、attempt、candidate SHA and retention rule |
| Compute version | next SemVer、tag、changelog entries | Release Please config、current manifest version、Conventional Commit history |
| Authenticate release PR | short lived installation token | GitHub App ID and private key secrets scoped to this repository |
| Bind release | verified SHA、version、tag target、release URL | staging execution record plus committed package、manifest、changelog and GitHub tag lookup |
| Publish evidence | fixed phase states、migration summary、deployment identities、release result | typed step outputs collected into the execution record, job summary and Environment deployment state |

### Key invariants

* 只有 `master` 历史中的 immutable commit 可以改变 staging。
* PR 代码永远不能读取 staging secrets。
* 同一时间最多一个运行持有 staging database advisory lock 或改变稳定 Vercel 环境。
* 应用发布之前必须完成 migration。migration 必须向前兼容上一份 READY 应用。
* 数据库不自动降级，也不自动执行 `migrate resolve`。
* tag 与 GitHub Release 只能指向已通过 staging smoke test 的同一个 commit。
* synthetic cleanup 只能删除专用测试账号拥有、带规定前缀且超过保留时间的数据。
* Vercel stable alias 只能由本 workflow 的 promote 或 recovery 阶段改变。
* Vercel source upload 只能来自 candidate SHA 的 clean Git archive，不能来自含 secrets 的 runner working tree。
* legacy MariaDB 和 production 环境不属于此 pipeline。

### Security model

PR workflow 只具有 `contents: read`，不绑定 GitHub Environment，也不读取 secrets。发布 workflow 只由受保护的 `master` push 或经过权限与 ancestry 验证的 manual input 触发。禁止用 `pull_request_target`、`workflow_run` 或来自 PR 内容的 shell interpolation 承接 privileged 发布。

GitHub Environment `staging` 保存迁移、Vercel 和 synthetic smoke 凭据，并限制 `master`。Release Please 的写权限只授予独立 job。所有 `uses:` 固定到完整 SHA。Checkout 在不需要写 Git 的 job 中使用 `persist-credentials: false`。任何 secret 都不作为 CLI flag、step output、artifact 或日志内容传递。

Staging migration 使用现有 allowlist、direct Supabase endpoint、`app_migrator`、TLS certificate verification 和 advisory lock。CI 在 migration job 中临时创建 mode 0600 的 `.env.staging`，该 job 不运行 Vercel CLI，并在结束时删除文件。Vercel job 从 candidate SHA 的 clean Git archive 开始，并断言没有 secrets 或未跟踪文件。Vercel CLI 从环境读取 `VERCEL_TOKEN`、`VERCEL_ORG_ID` 和 `VERCEL_PROJECT_ID`，不得使用 `--token`。

### Configuration required

GitHub Environment `staging` secrets:

* `POSTGRES_MIGRATION_URL`: Supabase direct migration URL for `app_migrator`
* `POSTGRES_SSL_CA`: Supabase CA PEM
* `VERCEL_TOKEN`: scoped Vercel access token
* `E2E_USER_EMAIL`: synthetic staging account email
* `E2E_USER_PASSWORD`: synthetic staging account password
* `RELEASE_APP_ID`: GitHub App identifier for release PR maintenance
* `RELEASE_APP_PRIVATE_KEY`: GitHub App private key for a short lived installation token

GitHub Environment `staging` variables:

* `VERCEL_ORG_ID`: Vercel team identifier
* `VERCEL_PROJECT_ID`: exact identifier for `feline-blog-staging`
* `STAGING_BASE_URL`: stable staging URL
* `SMOKE_DATA_RETENTION_HOURS`: stale synthetic data cutoff, fixed to `24` unless this spec is revised
* `VERCEL_CLI_VERSION`: exact repository pinned CLI version, reported by the workflow and changed only through reviewed dependency updates

Repository configuration:

* `release-please-config.json`: single Node package, branch `master`, stable releases, changelog enabled, `include-v-in-tag: true`, no package publish
* `.release-please-manifest.json`: `{ ".": "0.1.0" }`
* `.github/dependabot.yml`: weekly `github-actions` updates
* branch protection: required Verify check, no direct push, squash merge only
* Vercel project setting: independent Git production deploy disabled, stable alias changes only through this workflow
* GitHub ruleset: stable required checks named `Verify / verify` and `Conventional PR title`; title edits rerun the title check and squash commit messages use the approved PR title
* local migration replay: uses the immutable PostgreSQL image and bootstrap contract already recorded by spec 0009, and proves ordered replay rather than full Supabase service emulation

Vercel project `feline-blog-staging` retains all application build and runtime variables. GitHub receives no runtime database role or application secrets beyond the explicit migration and smoke credentials above.

### Execution record contract

The workflow builds one JSON compatible record in memory and renders only its safe fields to GitHub summary and deployment APIs.

| Field | Type | Source |
| --- | --- | --- |
| `candidateSha` | 40 character hex string | trusted `master` checkout |
| `runId`, `attempt` | integer | GitHub context passed through typed environment variables |
| `phaseStates` | map of phase to allowed status enum | workflow controller state machine |
| `migrations` | array of name、checksum prefix、state | migration reconciliation output |
| `previousDeploymentId` | string or null | stable alias inspection before candidate deploy |
| `candidateDeploymentId` | string or null | Vercel deploy output |
| `stableDeploymentId` | string or null | alias inspection after promote or recovery |
| `cleanupResult` | status enum plus deleted count | smoke cleanup output |
| `releaseResult` | status enum plus version、tag、URL | release jobs |
| `failureCode` | allowlisted enum or null | phase error mapping |

A missing value is `null`, not an empty string. A stage that never starts is `skipped`. A stale candidate is `superseded`. An exception handler must still emit the record. GitHub Environment deployment uses `candidateSha` as its ref, not the dispatch workflow ref.

### Migration reconciliation contract

PR verification compares the candidate tree with its merge base. Existing migration directories are immutable. Deployment compares the complete ordered candidate migration list with staging. Successfully applied migrations must be an exact prefix or exact named subset accepted by Prisma ordering, with matching SHA256 checksum. A database migration missing from the candidate, a changed checksum, an unfinished row or a failed row stops before mutation. The first automated release has no automatic baseline exception. Existing staging history must already satisfy the same reconciliation.

The SQL guard is deliberately conservative. Statements or procedural blocks it cannot classify are rejected and require a separately designed cleanup change. Each migration session sets `lock_timeout` to 5 seconds and `statement_timeout` to 120 seconds. Passing the guard is not proof of compatibility, so PR review must still confirm expand first behavior and compatibility with the previous READY app.

### Vercel promotion and recovery contract

The Vercel adapter is implemented against one exact lockfile version and exposes typed operations for deploy candidate、inspect deployment、inspect stable alias、promote candidate and restore previous. Every result includes organization、project、deployment ID、state、URL and commit metadata. A remote success followed by local timeout triggers reconciliation by candidate SHA before any retry.

The stable alias is never moved before candidate smoke succeeds. Recovery is compare and set in intent: if the alias no longer points to the candidate this run promoted, the workflow stops instead of overwriting an external change. With no verified previous deployment, automatic promotion is refused during initial setup until a baseline is recorded and manually confirmed.

### Smoke and cleanup contract

Public smoke requires successful HTML responses for `/` and `/blog`, the expected site marker, and deployment commit metadata matching `candidateSha`. Authenticated smoke logs in through `/login`, confirms the synthetic account identity, and completes create、edit、complete and delete on `/todo`. Candidate and stable hosts must both match the configured HTTPS host allowlist before credentials or cookies are sent.

The test records every created resource ID. The `finally` path deletes only those IDs. Startup recovery uses the synthetic account, exact prefix, server `createdAt`, 24 hour cutoff and 100 row cap. It refuses rows with an unexpected owner, prefix or relation. If the runner disappears before cleanup, the next run performs this bounded recovery before creating new data.

### Retry and timeout rules

* Verify 保持 20 分钟 job timeout。Migration reconciliation and deploy 有 5 分钟预算，其中 database statements 受独立 lock and statement timeout 约束。
* Candidate upload and READY polling 有 15 分钟预算。Public smoke 有 2 分钟，authenticated smoke 有 5 分钟，cleanup 有 2 分钟。
* Promote and stable verification 有 3 分钟。主流程必须在总 job timeout 前为 recovery 保留 5 分钟。没有 recovery 预算时不得开始 promote。
* Vercel polling and public idempotent GET 可以对 transient network failure 做最多 5 次 exponential backoff，单次间隔不超过 30 秒。Mutation command 不盲目重试，先按 candidate SHA reconciliation。
* Migration、Release Please、authenticated mutation 和 cleanup 不自动重放。每个 timeout 映射到固定 failure code。

### Critical test scenarios

* Happy path: squash merge a `feat` PR, verify、migration、deployment、public and authenticated smoke pass, Release Please updates the release PR，verifies **AC-1** through **AC-7**, **AC-10**, **AC-11**.
* No migration: a code only commit reports zero pending migrations and continues to deployment，verifies **AC-3** through **AC-6**.
* Unsafe migration: a migration containing a destructive statement fails before any staging secret is used for mutation，verifies **AC-4**, **AC-12**, **AC-13**.
* Failed migration: Prisma records failure and the workflow stops without resolve or application deploy，verifies **AC-5**.
* Failed smoke after migration: the stable app returns to the captured READY deployment, public smoke passes, and the release step does not run，verifies **AC-8**, **AC-10**.
* Manual misuse: a short SHA or commit outside `master` is rejected before Environment secrets are available，verifies **AC-9**, **AC-12**.
* Stale run: an older SHA obtains the lock after `master` advances and becomes superseded before secrets can mutate staging，verifies **AC-3**, **AC-9**, **AC-13**.
* Migration drift: changed checksum、missing history or an existing failed row stops before deploy，verifies **AC-4**, **AC-5**, **AC-13**.
* Remote timeout: candidate deployment succeeds remotely while CLI loses the response; reconciliation finds the exact deployment and does not create a duplicate，verifies **AC-6**, **AC-10**, **AC-13**.
* Alias race: stable alias changes outside this run before promote or recovery; compare and set validation stops without overwriting it，verifies **AC-8**, **AC-13**.
* Cleanup isolation: stale prefixed records for the synthetic account are removed while ordinary staging data remains untouched，verifies **AC-7**, **AC-13**, **AC-14**.
* Release PR merge: the release commit passes staging first, then creates the expected exact SHA `v0.x.y` tag and GitHub Release without publishing npm; a matching repeat is success and a mismatched existing tag fails，verifies **AC-10**, **AC-11**, **AC-13**.
* Fork PR: validation runs without secrets and cannot reach Supabase or Vercel，verifies **AC-1**, **AC-12**.

## Build plan

1. Extend the existing Verify path into one thin end to end staging thread: keep secretless PR checks, pin stable check names, replay migrations with spec 0009's immutable local image, reconcile staging history, deploy a clean archive as a candidate, run public smoke, promote only after proof, and emit the typed execution record. This proves the real commit to database to application path before adding automation layers, satisfies **AC-1**, **AC-3** through **AC-6**, **AC-8**, **AC-10**, **AC-14**.
2. Harden the thread: add immutable migration history and conservative SQL checks, protected branch and Conventional Commit rules, Environment authorization, full SHA action pins, Dependabot, whole pipeline concurrency, stale candidate detection, redaction, bounded phase budgets, reconciliation after unknown results and current HEAD manual rerun, satisfies **AC-2** through **AC-5**, **AC-9**, **AC-12**, **AC-13**.
3. Complete real use verification and recovery: adapt Playwright for allowlisted remote origins without starting a local server, implement the exact public、login and Todo path, bounded synthetic cleanup, stable alias inspection, candidate promote, compare and set recovery and abandoned runner reconciliation, satisfies **AC-7**, **AC-8**, **AC-10**, **AC-13**.
4. Add Release Please after the verified staging gate: configure the manifest and changelog, create short lived GitHub App tokens for version PR maintenance, bind release finalization to the verified current HEAD, and make tag and GitHub Release creation idempotent without npm publish, satisfies **AC-2**, **AC-10** through **AC-13**.

## Consequences

**Positive**:

* Every staging state points to one reviewed commit and one recorded migration state.
* Database and application ordering is explicit, observable and repeatable.
* Release bookkeeping no longer depends on a local machine changing Git state.
* The same smoke path proves automatic and manual reruns.

**Negative / tradeoffs**:

* Each merge waits for migration, remote deployment and smoke checks, so staging feedback is slower than Vercel Git Integration alone.
* Vercel token and database credentials remain long lived secrets that require rotation and least privilege review.
* Forward only migration means recovery after a schema mistake may require a repair migration instead of a quick rollback.
* The migration SQL checker catches known dangerous patterns but cannot prove every SQL change is compatible. PR review remains necessary.

**Neutral**:

* The Vercel project's production target is used as the stable staging target. The product production environment remains absent and out of scope.
* GitHub and Vercel remain the deployment record. No application deployment table is added.
* Release Please creates repository versions and Releases only. The private package is never published.

## Migration plan

**Strategy**: strangler

**Phases**:

1. Keep the existing PR Verify behavior and add deterministic migration safety checks without secrets.
2. Disable independent Vercel Git production deploys, record and verify the current stable deployment baseline, then add the full staging path behind `workflow_dispatch` restricted to current HEAD. Prove reconciliation、candidate deployment、smoke、promote and recovery against `feline_blog_staging` and `feline-blog-staging`.
3. Enable automatic `master` staging, enforce whole pipeline concurrency and stale candidate handling, then add Release Please and exact SHA release finalization after the staging success gate.
4. Retire the unimplemented local release design and keep local commands only for explicit development diagnostics.

**Rollback**: before phase 3, disable the new automatic trigger and retain PR verification. After phase 3, revert the workflow commit, keep applied additive migrations, and restore the last READY Vercel deployment. Never roll back the database automatically.

**Risks**: an incorrectly classified SQL statement may pass the static guard; a leaked long lived token could affect staging; a Vercel rollback may fail during provider outage; a synthetic cleanup defect could leave test rows. The allowlist、least privilege、scoped cleanup、redaction and forward repair rules limit these risks.

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
