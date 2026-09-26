# CI、Staging 发布与版本管理全流程手册

> English version: [CI, Staging Deployment, and Version Management Runbook](./ci-staging-release-runbook.en.md)

本文档覆盖从本地开发、Pull Request 验证、Supabase 迁移、Vercel staged deployment、稳定域名切换，到 Release Please 版本发布和故障恢复的完整流程。文中的 `Production` 指 Vercel 项目 `feline-blog-staging` 的稳定 staging 环境，不是产品生产环境。

## 1. 目标与流程总览

### 作用

保证只有通过代码验证、数据库迁移检查、候选环境冒烟测试和稳定域名复验的 `master` 提交，才能成为 staging 基线并参与版本发布。

### 流程

1. 开发者在功能分支完成本地验证并提交 Conventional Commit。
2. Pull Request 执行无密钥 `Verify` 和 `Release eligibility` 检查。
3. Pull Request 以 squash merge 合并到 `master`。
4. `Staging` 工作流验证候选提交并执行 Supabase 迁移。
5. 工作流在 Vercel 创建不绑定稳定域名的候选 deployment。
6. 候选 deployment 通过公开与登录 Todo 冒烟测试。
7. 工作流把同一个 deployment 提升到稳定 staging 域名。
8. 稳定域名再次通过冒烟测试，GitHub deployment 记录为 `staging:verified`。
9. Release Please 创建或更新版本 Pull Request。
10. 版本 Pull Request 合并后，同一个发布提交再次完成完整 staging 流程。
11. 工作流在已验证的精确 SHA 上创建 `v<version>` tag 和 GitHub Release。

### 验证标准

完整链路成功时，GitHub Actions 中 `Staging` 所有 job 为绿色，GitHub deployment 状态为 success，稳定域名指向候选 deployment，版本 tag 与 Release 精确指向同一个已验证 SHA。

## 2. 平台、地址与权限准备

### 作用

集中列出所有配置入口，避免在错误的仓库、项目或环境中写入凭据。

| 平台 | 配置地址 | 用途 |
| --- | --- | --- |
| GitHub 仓库 | <https://github.com/ZXFTech/feline-blog-app> | 代码、Pull Request、tag 和 Release |
| GitHub Actions | <https://github.com/ZXFTech/feline-blog-app/actions> | CI、Staging 和发布工作流 |
| Verify workflow | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/verify.yml> | Pull Request 和 `master` 无密钥验证 |
| Staging workflow | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/staging.yml> | 数据库迁移、Vercel 发布和版本编排 |
| Release eligibility | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/release-eligibility.yml> | 版本 Pull Request 的 base SHA 资格检查 |
| Release bookkeeping | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/release-bookkeeping.yml> | 单独重试版本维护或 finalize |
| Actions 设置 | <https://github.com/ZXFTech/feline-blog-app/settings/actions> | 默认 workflow 权限 |
| 分支保护 | <https://github.com/ZXFTech/feline-blog-app/settings/branches> | `master` required checks 和合并策略 |
| GitHub Environments | <https://github.com/ZXFTech/feline-blog-app/settings/environments> | `staging` 环境变量、secret 和部署策略 |
| Actions secrets/variables | <https://github.com/ZXFTech/feline-blog-app/settings/variables/actions> | 仓库级变量和 secret |
| GitHub Deployments | <https://github.com/ZXFTech/feline-blog-app/deployments> | staging deployment 状态记录 |
| GitHub Releases | <https://github.com/ZXFTech/feline-blog-app/releases> | 版本 tag 和 Release |
| GitHub Apps | <https://github.com/settings/apps> | Release GitHub App 设置 |
| GitHub App installations | <https://github.com/settings/installations> | 限制 App 安装范围 |
| Supabase 项目 | <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng> | staging PostgreSQL |
| Supabase 数据库设置 | <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng/settings/database> | 连接信息、密码与证书入口 |
| Vercel Dashboard | <https://vercel.com/dashboard> | 选择 team 和 `feline-blog-staging` 项目 |

执行配置的人需要 GitHub 仓库 admin 权限、Supabase 项目 owner/admin 权限，以及 Vercel 对应 team/project 的管理权限。日常手工触发 Staging 的账号至少需要仓库 write 权限。

## 3. 本地工具与仓库准备

### 作用

使用与 CI 一致的 Node.js 和 pnpm 版本，减少本地通过、远端失败的差异。

### 配置

1. 安装 Node.js `22.21.1`。
2. 启用 Corepack 并激活 pnpm `10.28.1`。
3. 安装 GitHub CLI，并执行 `gh auth login`。
4. 克隆仓库后在仓库根目录安装锁定依赖。

### 命令

```powershell
node --version
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm --version
pnpm install --frozen-lockfile
gh auth status
git remote -v
```

### 验证方法

1. `node --version` 输出 `v22.21.1`。
2. `pnpm --version` 输出 `10.28.1`。
3. `pnpm install --frozen-lockfile` 没有修改 `pnpm-lock.yaml`。
4. `gh auth status` 显示可以访问 `ZXFTech/feline-blog-app`。
5. `git remote -v` 的 `origin` 指向 `https://github.com/ZXFTech/feline-blog-app.git` 或等价 SSH 地址。

## 4. GitHub 仓库、分支保护与合并策略

### 作用

阻止绕过 Pull Request、required checks 或线性历史直接修改 `master`。

### 配置地址

1. Merge 设置：<https://github.com/ZXFTech/feline-blog-app/settings>
2. Branch protection：<https://github.com/ZXFTech/feline-blog-app/settings/branches>
3. Actions 权限：<https://github.com/ZXFTech/feline-blog-app/settings/actions>

### 配置步骤

1. 只启用 squash merge。
2. 关闭 merge commit 和 rebase merge。
3. Squash commit title 使用 Pull Request title，body 使用 Pull Request body。
4. 为 `master` 要求 Pull Request、严格的最新分支状态和线性历史。
5. Required checks 配置为 `Verify`、`Pull request policy`、`verified-base`。
6. 对管理员同样执行规则。
7. 禁止 force push 和 branch deletion。
8. Actions 默认 workflow permission 设置为 read-only，不允许 Actions 自动批准 Pull Request。

### 只读验证命令

```powershell
gh api repos/ZXFTech/feline-blog-app `
  --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,squash_merge_commit_title,squash_merge_commit_message}'

gh api repos/ZXFTech/feline-blog-app/branches/master/protection `
  --jq '{required_status_checks,enforce_admins,required_linear_history,allow_force_pushes,allow_deletions}'

gh api repos/ZXFTech/feline-blog-app/actions/permissions/workflow `
  --jq '{default_workflow_permissions,can_approve_pull_request_reviews}'
```

### 预期结果

`allow_squash_merge=true`，其他两种合并方式为 false；required checks 为上述三个名称且 `strict=true`；管理员规则、线性历史开启；force push 和 deletion 关闭；默认 Actions 权限为 `read`。

## 5. GitHub Environment `staging`

### 作用

把 staging 的高权限凭据限制在受保护的 `master` 部署工作流中，Pull Request 工作流不能读取这些 secret。

### 配置地址

<https://github.com/ZXFTech/feline-blog-app/settings/environments>

### 配置步骤

1. 创建名为 `staging` 的 Environment。
2. Deployment branches 选择 `Protected branches only`。
3. 在该 Environment 中配置下表的 secrets 和 variables。
4. `RELEASE_APP_LOGIN` 必须配置为仓库级 variable，不要只放在 Environment 中。Pull Request 的 `refs/pull/*/merge` 不能读取只允许 protected branch 的 Environment。

| 类型 | 名称 | 值或来源 | 作用 |
| --- | --- | --- | --- |
| Secret | `POSTGRES_MIGRATION_URL` | Supavisor Session pooler 的 `app_migrator` TLS URL | migration probe 和 deploy |
| Secret | `POSTGRES_SSL_CA` | Supabase 当前项目 Connect 面板提供的 CA PEM | 完整 TLS 证书验证 |
| Secret | `VERCEL_TOKEN` | 仅能访问 staging team/project 的 Vercel token | deployment、promote 和 restore |
| Secret | `E2E_USER_EMAIL` | staging 合成测试账号 | 登录冒烟测试 |
| Secret | `E2E_USER_PASSWORD` | staging 合成测试账号 | 登录冒烟测试 |
| Secret | `RELEASE_APP_PRIVATE_KEY` | 专用 GitHub App 私钥 PEM | Release Please 写入身份 |
| Variable | `VERCEL_ORG_ID` | Vercel team ID | 防止跨 team 操作 |
| Variable | `VERCEL_PROJECT_ID` | `feline-blog-staging` project ID | 防止跨 project 操作 |
| Variable | `STAGING_BASE_URL` | `https://feline-blog-staging.vercel.app` | 稳定 staging origin |
| Variable | `STAGING_BASELINE_DEPLOYMENT_ID` | 首次激活前人工核验的 `dpl_...` | 仅用于可信初始恢复基线 |
| Variable | `STAGING_BASELINE_COMMIT_SHA` | 上述 deployment 的完整 40 字符 SHA | 绑定初始基线身份 |
| Variable | `E2E_USER_ID` | 合成测试用户的数据库 ID | 限制 staging smoke API |
| Variable | `RELEASE_APP_ID` | GitHub App Client ID，通常以 `Iv` 开头 | 生成 App installation token |

仓库级 variable：

| 类型 | 名称 | 值 | 作用 |
| --- | --- | --- | --- |
| Repository variable | `RELEASE_APP_LOGIN` | `feline-blog-release[bot]` | 识别受信任的版本 Pull Request 作者 |

### 写入命令

```powershell
$repo = "ZXFTech/feline-blog-app"

gh variable set RELEASE_APP_ID --repo $repo --env staging --body "<client-id>"
gh variable set RELEASE_APP_LOGIN --repo $repo --body "feline-blog-release[bot]"
gh variable set VERCEL_ORG_ID --repo $repo --env staging --body "<team-id>"
gh variable set VERCEL_PROJECT_ID --repo $repo --env staging --body "<project-id>"
gh variable set STAGING_BASE_URL --repo $repo --env staging --body "https://feline-blog-staging.vercel.app"
gh variable set E2E_USER_ID --repo $repo --env staging --body "<user-id>"

gh secret set POSTGRES_MIGRATION_URL --repo $repo --env staging
gh secret set POSTGRES_SSL_CA --repo $repo --env staging
gh secret set VERCEL_TOKEN --repo $repo --env staging
gh secret set E2E_USER_EMAIL --repo $repo --env staging
gh secret set E2E_USER_PASSWORD --repo $repo --env staging

Get-Content -Raw -LiteralPath "<private-key.pem>" |
  gh secret set RELEASE_APP_PRIVATE_KEY --repo $repo --env staging
```

`gh secret set` 会从安全提示符或管道读取内容。不要把密码、token、URL、CA 或私钥作为 `--body` 命令参数，避免进入 shell history。

### 验证方法

```powershell
gh api repos/ZXFTech/feline-blog-app/environments/staging `
  --jq '{deployment_branch_policy,protection_rules}'
gh variable list --repo ZXFTech/feline-blog-app --env staging
gh variable list --repo ZXFTech/feline-blog-app
gh secret list --repo ZXFTech/feline-blog-app --env staging
```

只验证名称、范围和非 secret 目标值，不读取或打印 secret 内容。

## 6. Supabase、Supavisor 和迁移角色

### 作用

让 CI 通过 Supavisor Session pooler 使用最低权限迁移角色，并在数据库角色层永久设置超时。Supavisor 会忽略 PostgreSQL startup options，所以 URL 中不能依赖 `options=-c ...`。

### 配置地址

1. 项目：<https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng>
2. 数据库设置：<https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng/settings/database>
3. 官方连接说明：<https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI>
4. 官方连接术语：<https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO>

### 固定目标

| 配置 | 值 |
| --- | --- |
| Project ref | `zjnjjzgxiltulkuhrjng` |
| Session pooler host | `aws-0-ap-northeast-1.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| Role | `app_migrator` |
| Pooler username | `app_migrator.zjnjjzgxiltulkuhrjng` |
| `lock_timeout` | `5s` |
| `statement_timeout` | `120s` |

### 生成迁移 URL

在 Supabase Dashboard 的 Connect 面板选择 Session pooler。密码必须 URL encode。

```text
postgresql://app_migrator.zjnjjzgxiltulkuhrjng:<URL-ENCODED-PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

不要添加 `options` startup 参数。不要把 direct admin URL 写入 GitHub。

### 一次性配置角色默认超时

把 admin 连接和 migration 连接只保存在被 Git 忽略的 `.env.staging` 中：

```dotenv
POSTGRES_ENVIRONMENT=staging
POSTGRES_ADMIN_URL=postgresql://<admin-user>:<password>@<direct-host>:5432/postgres
POSTGRES_MIGRATION_URL=postgresql://app_migrator.zjnjjzgxiltulkuhrjng:<encoded-password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
POSTGRES_SSL_CA="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

执行：

```powershell
$env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE = "true"
pnpm db:staging:migrator-timeouts:configure
Remove-Item Env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE
pnpm db:staging:migration:probe
```

工具事务性执行并验证等价 SQL：

```sql
ALTER ROLE app_migrator SET lock_timeout = '5s';
ALTER ROLE app_migrator SET statement_timeout = '120s';
```

### 密码与证书验证

首选项目 probe：

```powershell
pnpm db:staging:migration:probe
```

该命令同时验证 DNS、TLS hostname、CA trust、密码、数据库角色、两个角色默认超时、advisory lock 和 Prisma migration status，而且不会输出连接 secret。预期包含：

```text
host=aws-0-ap-northeast-1.pooler.supabase.com
port=5432
database=postgres
connections=2
databaseRole=app_migrator
lockTimeoutMs=5000
statementTimeoutMs=120000
advisoryLock=verified
prismaStatus=reachable
```

只验证证书链时，可以把 CA 写入临时 PEM 文件后执行：

```powershell
openssl s_client -starttls postgres `
  -connect aws-0-ap-northeast-1.pooler.supabase.com:5432 `
  -servername aws-0-ap-northeast-1.pooler.supabase.com `
  -CAfile "<ca-file.pem>"
```

成功时检查 `Verify return code: 0 (ok)`。证书通过但 probe 报 authentication failed，通常是用户名格式、密码或 URL encoding 错误。证书失败则重新从当前项目 Connect 面板取得与 pooler host 匹配的 CA。

### 回滚方法

只在批准的维护窗口执行：

```powershell
$env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE = "true"
pnpm db:staging:migrator-timeouts:rollback
Remove-Item Env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE
```

回滚后暂停 CI migration。恢复时重新运行 configure 和 probe，确认新连接得到 `5s` 与 `120s` 后再恢复 Staging。

## 7. Vercel staging 项目

### 作用

先部署并验证不可变候选 deployment，再原子地切换稳定 staging 域名，避免把未经验证的构建暴露为稳定环境。

### 配置地址

1. 打开 <https://vercel.com/dashboard>。
2. 选择正确 team。
3. 选择项目 `feline-blog-staging`。
4. 进入 Settings 的 Git、Environments、Environment Variables 和 Deployment Protection。

相关官方文档：

1. Project Settings：<https://vercel.com/docs/project-configuration/project-settings>
2. Git Configuration：<https://vercel.com/docs/project-configuration/git-configuration>
3. Deployment Protection：<https://vercel.com/docs/deployment-protection>
4. Trusted Sources：<https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources>
5. Promote API：<https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment>
6. Rollback API：<https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id>

### 配置步骤

1. Production branch 设置为 `master`。
2. 关闭 Vercel Git Integration 自动部署，防止它与 GitHub Actions 竞争稳定域名。
3. 关闭自动分配 Production/custom domains。
4. 保留面向人的 Vercel Authentication 或现有 Deployment Protection。
5. Production runtime variables 配置为：

| 名称 | 值或来源 | 作用 |
| --- | --- | --- |
| `STAGING_SMOKE_API_ENABLED` | `true` | 只在 staging 启用合成 Todo API |
| `E2E_USER_ID` | 与 GitHub Environment 同一个用户 ID | 限制 smoke API 只能由合成用户访问 |
| `SMOKE_DATA_RETENTION_HOURS` | `24` | 清理过期合成测试数据 |

不要创建给 Actions 使用的长期 Protection Bypass secret。工作流使用短期 GitHub OIDC token。

### 验证方法

1. 在 Vercel Deployments 页面确认 Git push 不会独立触发第二个 deployment。
2. 确认 stable domain 为 `https://feline-blog-staging.vercel.app`。
3. 确认 GitHub Environment 中的 `VERCEL_ORG_ID` 和 `VERCEL_PROJECT_ID` 与项目设置一致。
4. 候选部署必须显示 READY、Production target、正确 team/project 和 `githubCommitSha`。

## 8. Vercel Trusted Source 与 GitHub OIDC

### 作用

让受 Deployment Protection 保护的 staging 页面只接受来自本仓库、`master`、`staging` Environment 和指定 workflow 的短期身份，不保存长期绕过密钥。

### 配置地址

Vercel Dashboard → `feline-blog-staging` → Settings → Deployment Protection → Trusted Sources。

### 配置步骤

1. External Services 选择 Add → GitHub Actions。
2. GitHub account 选择 `ZXFTech`，Repository 选择 `feline-blog-app`。
3. Branch 填 `master`。
4. GitHub Actions environment 填 `staging`。
5. Applies to environments 只选 Production。
6. Audience 使用自动生成的 `https://github.com/ZXFTech`。
7. Edit raw claims 后确认：

| Claim | 精确值 |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| `aud` | `https://github.com/ZXFTech` |
| `repository` | `ZXFTech/feline-blog-app` |
| `ref` | `refs/heads/master` |
| `environment` | `staging` |
| `workflow_ref` | `ZXFTech/feline-blog-app/.github/workflows/staging.yml@refs/heads/master` |

### 验证方法

Staging run 的 smoke jobs 应成功获取 OIDC token，并用 `x-vercel-trusted-oidc-idp-token` 访问候选、稳定和恢复地址。日志中不得输出 token 或完整 Authorization/Cookie header。若返回 401/403，优先逐字符检查 claims、Environment 名称和 workflow ref。

## 9. Release GitHub App

### 作用

用独立 bot 身份创建 Release Please Pull Request，并让发布资格检查精确识别受信任作者。

### 配置地址

1. 创建和管理：<https://github.com/settings/apps>
2. 公开 App 页面：<https://github.com/apps/feline-blog-release>
3. 安装范围：<https://github.com/settings/installations>

### 配置步骤

1. 创建专用于本仓库的 GitHub App `feline-blog-release`。
2. Webhook 设为 inactive，不配置 callback URL，不启用用户授权。
3. Repository permissions 只设置：Metadata read、Contents read/write、Pull requests read/write。
4. 不授予 deployments、Actions、environments、administration 或 packages 权限。
5. 安装时只选择 `ZXFTech/feline-blog-app`。
6. 生成 private key，把完整 PEM 保存为 Environment secret `RELEASE_APP_PRIVATE_KEY`。
7. App 设置页中的 Client ID 保存为 Environment variable `RELEASE_APP_ID`。不要使用 numeric App ID，也不要使用 slug。
8. 精确 bot login `feline-blog-release[bot]` 保存为 repository variable `RELEASE_APP_LOGIN`。

### 命令

```powershell
gh variable set RELEASE_APP_ID `
  --repo ZXFTech/feline-blog-app --env staging --body "<client-id>"

gh variable set RELEASE_APP_LOGIN `
  --repo ZXFTech/feline-blog-app --body "feline-blog-release[bot]"

Get-Content -Raw -LiteralPath "<private-key.pem>" |
  gh secret set RELEASE_APP_PRIVATE_KEY `
    --repo ZXFTech/feline-blog-app --env staging
```

### 验证方法

1. `gh variable list` 显示 repository variable `RELEASE_APP_LOGIN`。
2. `gh variable list --env staging` 显示 `RELEASE_APP_ID`，值是 Client ID。
3. `gh secret list --env staging` 显示 `RELEASE_APP_PRIVATE_KEY`。
4. 一次成功 staging run 能以 `feline-blog-release[bot]` 创建或更新 release Pull Request。

## 10. 初始稳定 deployment 基线

### 作用

首次启用工作流时，为自动恢复提供一个经过人工证明的稳定 deployment。该例外只允许精确的 deployment ID 与 commit SHA 配对。

### 配置步骤

1. 在 Vercel 打开当前由 `STAGING_BASE_URL` 指向的 deployment。
2. 确认它属于预期 team 和 `feline-blog-staging`，target 为 Production，状态为 READY。
3. 记录不可变 deployment ID，格式为 `dpl_...`。
4. 从 source build、deployment log 或其他不可变发布记录确认生成它的完整 40 字符 commit SHA。不要用当前 `master` 或部署日期猜测。
5. 把同一 deployment 的 ID 和 SHA 一起写入 GitHub Environment。

### 命令

```powershell
gh variable set STAGING_BASELINE_DEPLOYMENT_ID `
  --repo ZXFTech/feline-blog-app --env staging --body "<dpl_...>"

gh variable set STAGING_BASELINE_COMMIT_SHA `
  --repo ZXFTech/feline-blog-app --env staging --body "<40-character-sha>"
```

### 验证方法

两个值必须同时存在，并来自同一个 deployment。工作流会在 Vercel 返回 Git metadata 时要求它与配置 SHA 完全一致。不要在每次发布后滚动这两个变量。成功运行产生的新 deployment 必须携带自己的 `githubCommitSha`。

## 11. 日常开发、Pull Request 与 CI

### 作用

在任何 staging secret 暴露前验证代码、迁移历史、类型、lint、单元测试和 production build。

### 本地命令

```powershell
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

需要完整浏览器验证并已经安全配置测试账号时，再执行：

```powershell
pnpm test:e2e
```

### 提交和 Pull Request

```powershell
git switch -c codex/<short-topic>
git add <files>
git commit -m "feat: describe the user-visible change"
git push --set-upstream origin codex/<short-topic>
gh pr create --base master --fill
```

Pull Request title 必须符合 Conventional Commit，例如：

```text
feat: add article draft autosave
fix: prevent duplicate staging promotion
ci: harden staging deployment checks
docs: add release operations guide
```

### CI 工作流

[`verify.yml`](../../.github/workflows/verify.yml) 在 Pull Request 和 `master` push 上执行：

1. Pull Request title policy。
2. PostgreSQL 17 service。
3. Frozen dependency install。
4. Prisma validate 和 generate。
5. migration PR guard 和 replay。
6. typecheck、lint、Vitest 和 build。

[`release-eligibility.yml`](../../.github/workflows/release-eligibility.yml) 对普通 Pull Request 返回 not applicable success；对 bot 创建且带 `autorelease: pending` 的版本 Pull Request，要求 base SHA 已有成功的 `staging:verified` 记录。

### 验证方法

```powershell
gh pr checks <pr-number> --repo ZXFTech/feline-blog-app --watch
gh pr view <pr-number> --repo ZXFTech/feline-blog-app `
  --json title,author,baseRefName,headRefName,mergeStateStatus,statusCheckRollup
```

`Verify`、`Pull request policy`、`verified-base` 必须全部成功。使用 squash merge，不要绕过 checks。

## 12. Staging 发布

### 作用

把一个精确的 `master` SHA 按验证、迁移、候选部署、候选冒烟、提升和稳定复验的顺序发布，并记录可恢复的 checkpoint。

### 自动触发

Pull Request squash merge 后的 `master` push 自动触发 [`staging.yml`](../../.github/workflows/staging.yml)。同一时刻只允许一个 staging mutation 流程，新的 run 不会取消正在执行的 run。

### 手工触发

只允许当前 `master` 的完整 SHA：

```powershell
$repo = "ZXFTech/feline-blog-app"
$candidateSha = gh api repos/$repo/commits/master --jq .sha

gh workflow run staging.yml --repo $repo --ref master `
  -f candidate_sha=$candidateSha

gh run list --repo $repo --workflow staging.yml --limit 1
gh run watch <run-id> --repo $repo --exit-status
```

工作流会验证手工触发者具有 write、maintain 或 admin 权限，并拒绝不是当前 `master` HEAD 的 SHA。

### 工作流阶段与作用

| 阶段 | 作用 | 成功证据 |
| --- | --- | --- |
| Verify candidate | 重跑安装、Prisma、迁移检查、类型、lint、测试和 build | verify job 绿色 |
| Select candidate | 固定 SHA、run ID、attempt 和 record key | GitHub deployment intent |
| Migration | probe、reconcile、`prisma migrate deploy` | 无 unfinished/divergent/destructive migration |
| Stage deployment | `vercel deploy --prod --skip-domain` | 唯一 READY candidate deployment |
| Candidate public smoke | 验证公开页面和 API | public smoke 绿色 |
| Candidate login/Todo smoke | 登录并创建、编辑、完成、删除 Todo | full smoke 绿色且精确清理 |
| Promote | 把同一个 deployment 指向 stable domain | deployment ID 未改变 |
| Stable smoke | 从 `STAGING_BASE_URL` 再次检查 | stable origin 指向 candidate |
| Recovery | 失败时在安全前提下恢复 previous deployment | restore 和 recovery smoke 绿色 |
| Record | 写入 `staging:verified` | GitHub deployment status success |
| Release maintenance | 创建或更新版本 Pull Request | bot PR 或 no releasable changes |
| Release finalize | 版本 PR 合并后创建 tag/Release | tag 和 Release 指向 candidate SHA |

### 检查结果和 artifacts

```powershell
gh run view <run-id> --repo ZXFTech/feline-blog-app `
  --json status,conclusion,headSha,event,attempt,jobs,url

gh run download <run-id> --repo ZXFTech/feline-blog-app `
  --dir ".feline-blog/staging-run-<run-id>"
```

确认每次远程 mutation 都有 intent、result 和脱敏 checkpoint。Artifacts 保留 30 天。日志和 artifact 不得包含 OIDC token、Authorization header、Cookie、密码、数据库 URL、CA 内容或私钥。

## 13. Release Please 与版本发布

### 作用

根据 Conventional Commits 自动计算版本、维护 changelog，并且只在版本提交通过完整 staging 后创建 tag 和 GitHub Release。

### 配置文件

1. [`release-please-config.json`](../../release-please-config.json)
2. [`.release-please-manifest.json`](../../.release-please-manifest.json)
3. [`CHANGELOG.md`](../../CHANGELOG.md)
4. [`release-bookkeeping.yml`](../../.github/workflows/release-bookkeeping.yml)
5. Release Please 官方说明：<https://github.com/googleapis/release-please>
6. Release Please Action：<https://github.com/googleapis/release-please-action>

当前配置为 Node release、`v` tag、稳定版本、`bump-minor-pre-major=true`，并设置 `skip-github-release=true`。Release Please 只维护版本 Pull Request，tag 和 Release 由 staging finalizer 在验证后创建，避免竞态。

### 提交类型与版本效果

| Conventional Commit | 版本效果 | 示例 |
| --- | --- | --- |
| `feat:` | minor；在 1.0 前仍提升 minor | `0.2.0` → `0.3.0` |
| `fix:` | patch | `0.2.0` → `0.2.1` |
| `deps:` | patch | `0.2.0` → `0.2.1` |
| `BREAKING CHANGE:` | 1.0 前因 `bump-minor-pre-major=true` 提升 minor；1.0 后提升 major | `0.2.0` → `0.3.0` |
| `ci:`、`docs:`、`test:`、`chore:` | 单独不发布 | 无版本 PR 变化 |

### 发布步骤

1. 普通功能 Pull Request squash merge 到 `master`。
2. Staging 成功并写入 `staging:verified`。
3. Release GitHub App 创建或更新唯一 release Pull Request。
4. 确认 PR 作者是 `feline-blog-release[bot]`，label 为 `autorelease: pending`。
5. 确认 `package.json`、manifest 和 `CHANGELOG.md` 版本一致。
6. `verified-base` 成功后 squash merge release Pull Request。
7. 该版本提交再次完成完整 Staging。
8. Finalizer 验证 author、label、merge SHA 和 manifest version，然后创建 `v<version>` 和 GitHub Release。

### 验证命令

```powershell
gh pr list --repo ZXFTech/feline-blog-app --state open `
  --json number,title,author,labels,baseRefName,headRefName,url

gh release view v<version> --repo ZXFTech/feline-blog-app `
  --json tagName,targetCommitish,isDraft,isPrerelease,publishedAt,url

gh api repos/ZXFTech/feline-blog-app/git/ref/tags/v<version> --jq .object.sha
```

Tag、Release target 和成功 staging run 的 `headSha` 必须完全相同。现有示例证据为 [Staging run 35950241960](https://github.com/ZXFTech/feline-blog-app/actions/runs/35950241960) 和 [v0.2.0](https://github.com/ZXFTech/feline-blog-app/releases/tag/v0.2.0)。

## 14. 手工 Release bookkeeping

### 作用

只在 staging 已经成功、但 release maintenance 或 finalize 单独失败时重试发布记账，不重跑数据库迁移和 Vercel promote。

### 配置地址

[`release-bookkeeping.yml`](../../.github/workflows/release-bookkeeping.yml) 的 Actions 页面。

### 命令

```powershell
gh workflow run release-bookkeeping.yml `
  --repo ZXFTech/feline-blog-app --ref master `
  -f operation=maintain `
  -f candidate_sha=<full-sha> `
  -f source_run_id=<run-id> `
  -f attempt=<attempt>
```

完成 release Pull Request 合并后的 finalizer 重试：

```powershell
gh workflow run release-bookkeeping.yml `
  --repo ZXFTech/feline-blog-app --ref master `
  -f operation=finalize `
  -f candidate_sha=<full-sha> `
  -f source_run_id=<run-id> `
  -f attempt=<attempt>
```

### 验证方法

三个字段必须来自同一个成功 staging deployment record。工作流会重建 `<candidate_sha>:<source_run_id>:<attempt>` 并拒绝不匹配的 tuple。不要猜测 attempt，也不要拿其他 run 的 SHA 拼接。

## 15. 失败处理与恢复

### 作用

避免在远程操作结果不明确时重复迁移、重复 deployment、覆盖其他 actor 的 alias，或移动已经发布的 tag。

| 失败码或现象 | 含义 | 操作 | 验证 |
| --- | --- | --- | --- |
| `MIGRATION_FAILED` | 迁移执行失败 | 停止发布，人工检查数据库与 `_prisma_migrations` | 原因明确且新 probe 成功后再运行 |
| unfinished migration | 存在未完成记录 | 禁止自动 `prisma migrate resolve` | 由数据库负责人批准处置 |
| `REMOTE_AMBIGUOUS` | 无法证明远程 mutation 唯一结果 | 用完整 correlation metadata 查找 deployment | 只能得到一个匹配结果 |
| `DEPLOY_TIMEOUT` | Vercel 未在期限内 READY | 检查相同 deployment，不先创建新候选 | 项目、team、SHA、record key 全匹配 |
| `SMOKE_FAILED` | 候选或稳定冒烟失败 | 查看 smoke artifact 和应用日志 | 修复后产生新的 master SHA 或安全重跑 |
| `ALIAS_CHANGED` | 其他 actor 移动了 stable alias | 停止，不覆盖 | 查明 actor 和当前 deployment |
| `RESTORE_FAILED` | 自动恢复失败 | 核验 previous deployment 后人工恢复 | stable URL 指向 previous ID 且 recovery smoke 成功 |
| `RELEASE_DEFERRED` | 当前 run 不再是最新 master | 等最新 master run 完成 | 新 run 写入 verified record |
| `RELEASE_COLLISION` | 同名 tag/Release 指向其他 SHA | 比较 tag、Release 和 verified SHA，禁止移动 tag | 人工消除冲突后重试 |

Promotion 或 stable smoke 失败时，工作流只有在 stable alias 仍指向本次 candidate 时才自动恢复 previous deployment，并执行 recovery smoke。不要在不确认 alias 当前状态时手工覆盖。

## 16. 变更、轮换与安全检查

### 作用

让凭据轮换和平台设置修改保持可审计，并防止 secret 泄漏。

### 操作

1. 轮换 `VERCEL_TOKEN`、测试账号密码、数据库密码或 GitHub App key 后，立即运行对应 probe 或一次完整 Staging。
2. 数据库密码变化时重新 URL encode，并同时更新 `POSTGRES_MIGRATION_URL`。CA 仅在 Supabase 提供的信任链变化时更新。
3. GitHub App key 轮换后，只替换 `RELEASE_APP_PRIVATE_KEY`。Client ID 和 bot login 不应随 private key 轮换改变。
4. 变更 Vercel team/project 时，先更新并核验 `VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`、Trusted Source 和 stable URL。
5. 不把 `.env.staging`、PEM、token、密码、完整数据库 URL 或下载的 artifact 提交到 Git。
6. 过时的重复 Environment 值在确认工作流不再引用后再删除。例如 `RELEASE_APP_LOGIN` 的权威位置是 repository variable，Vercel IDs 的权威位置是 Environment variables。

### 最终检查命令

```powershell
git status --short
git diff --check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

对于只改文档的 Pull Request，仍应至少执行 `git diff --check`，并在 Pull Request 中让远端 `Verify` 完整运行。不要依赖 Husky 中可能包含旧工作区路径的 push hook 作为完整验证。

## 17. 运行完成检查表

1. GitHub 只允许 squash merge，`master` required checks 和线性历史已启用。
2. `staging` Environment 只允许 protected branches，并且 secrets/variables 范围正确。
3. `RELEASE_APP_ID` 是 Client ID，`RELEASE_APP_LOGIN` 是 repository variable。
4. Supavisor URL 使用 Session port 5432、`app_migrator.<project-ref>` 和 URL encoded password。
5. `pnpm db:staging:migration:probe` 验证证书、密码、角色、5 秒 lock timeout 和 120 秒 statement timeout。
6. Vercel Git 自动部署和自动 stable domain assignment 已关闭。
7. Trusted Source claims 与仓库、分支、Environment 和 workflow ref 精确一致。
8. 候选 deployment 在 promote 前通过公开与认证冒烟测试。
9. Stable domain 指向同一个 candidate deployment，GitHub deployment 为 `staging:verified`。
10. Release Pull Request 的 author、label、base verification 和版本文件一致。
11. Tag、GitHub Release 和成功 staging SHA 完全相同。
12. 日志、artifacts、Pull Request 和提交历史中没有 secret。
