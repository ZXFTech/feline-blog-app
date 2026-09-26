# CI, Staging Deployment, and Version Management Runbook

> 中文版本：[CI、Staging 发布与版本管理全流程手册](./ci-staging-release-runbook.zh-CN.md)

This document covers the complete process from local development, pull request verification, Supabase migration, Vercel staged deployment, and stable-domain promotion through Release Please version publishing and failure recovery. In this document, `Production` means the stable staging environment of the Vercel project `feline-blog-staging`. It does not mean the product production environment.

## 1. Objective and Process Overview

### Purpose

Ensure that only a `master` commit that passes code verification, database migration checks, candidate smoke tests, and stable-domain verification can become the staging baseline and participate in a version release.

### Process

1. A developer completes local verification on a feature branch and creates a Conventional Commit.
2. The pull request runs the secretless `Verify` and `Release eligibility` checks.
3. The pull request is squash merged into `master`.
4. The `Staging` workflow verifies the candidate commit and applies Supabase migrations.
5. The workflow creates a candidate deployment in Vercel without attaching the stable domain.
6. The candidate deployment passes public and authenticated Todo smoke tests.
7. The workflow promotes that same deployment to the stable staging domain.
8. The stable domain passes another smoke test, and the GitHub deployment is recorded as `staging:verified`.
9. Release Please creates or updates the release pull request.
10. After the release pull request is merged, the same release commit completes the full staging process again.
11. The workflow creates the `v<version>` tag and GitHub Release on the exact verified SHA.

### Verification Standard

When the complete chain succeeds, every job in the GitHub Actions `Staging` run is green, the GitHub deployment status is success, the stable domain points to the candidate deployment, and the version tag and Release point to the same verified SHA.

## 2. Platforms, Addresses, and Access Preparation

### Purpose

List every configuration entry point in one place so that credentials are not written to the wrong repository, project, or environment.

| Platform | Configuration address | Purpose |
| --- | --- | --- |
| GitHub repository | <https://github.com/ZXFTech/feline-blog-app> | Code, pull requests, tags, and Releases |
| GitHub Actions | <https://github.com/ZXFTech/feline-blog-app/actions> | CI, Staging, and release workflows |
| Verify workflow | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/verify.yml> | Secretless verification for pull requests and `master` |
| Staging workflow | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/staging.yml> | Database migration, Vercel deployment, and version orchestration |
| Release eligibility | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/release-eligibility.yml> | Base SHA eligibility for a release pull request |
| Release bookkeeping | <https://github.com/ZXFTech/feline-blog-app/actions/workflows/release-bookkeeping.yml> | Retry release maintenance or finalization alone |
| Actions settings | <https://github.com/ZXFTech/feline-blog-app/settings/actions> | Default workflow permissions |
| Branch protection | <https://github.com/ZXFTech/feline-blog-app/settings/branches> | `master` required checks and merge policy |
| GitHub Environments | <https://github.com/ZXFTech/feline-blog-app/settings/environments> | `staging` variables, secrets, and deployment policy |
| Actions secrets/variables | <https://github.com/ZXFTech/feline-blog-app/settings/variables/actions> | Repository-level variables and secrets |
| GitHub Deployments | <https://github.com/ZXFTech/feline-blog-app/deployments> | Staging deployment status records |
| GitHub Releases | <https://github.com/ZXFTech/feline-blog-app/releases> | Version tags and Releases |
| GitHub Apps | <https://github.com/settings/apps> | Release GitHub App settings |
| GitHub App installations | <https://github.com/settings/installations> | App installation scope |
| Supabase project | <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng> | Staging PostgreSQL |
| Supabase database settings | <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng/settings/database> | Connection, password, and certificate entry points |
| Vercel Dashboard | <https://vercel.com/dashboard> | Select the team and `feline-blog-staging` project |

The operator needs GitHub repository admin access, Supabase project owner/admin access, and management access to the corresponding Vercel team/project. An account that manually triggers Staging needs at least repository write access.

## 3. Local Tools and Repository Preparation

### Purpose

Use the same Node.js and pnpm versions as CI to reduce differences between local and remote results.

### Configuration

1. Install Node.js `22.21.1`.
2. Enable Corepack and activate pnpm `10.28.1`.
3. Install GitHub CLI and run `gh auth login`.
4. Clone the repository and install locked dependencies from the repository root.

### Commands

```powershell
node --version
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm --version
pnpm install --frozen-lockfile
gh auth status
git remote -v
```

### Verification

1. `node --version` returns `v22.21.1`.
2. `pnpm --version` returns `10.28.1`.
3. `pnpm install --frozen-lockfile` does not modify `pnpm-lock.yaml`.
4. `gh auth status` shows access to `ZXFTech/feline-blog-app`.
5. `git remote -v` shows `origin` as `https://github.com/ZXFTech/feline-blog-app.git` or the equivalent SSH address.

## 4. GitHub Repository, Branch Protection, and Merge Policy

### Purpose

Prevent direct changes to `master` that bypass pull requests, required checks, or linear history.

### Configuration Addresses

1. Merge settings: <https://github.com/ZXFTech/feline-blog-app/settings>
2. Branch protection: <https://github.com/ZXFTech/feline-blog-app/settings/branches>
3. Actions permissions: <https://github.com/ZXFTech/feline-blog-app/settings/actions>

### Configuration Steps

1. Enable squash merge only.
2. Disable merge commits and rebase merges.
3. Use the pull request title for the squash commit title and the pull request body for its message.
4. Require pull requests, a strictly up-to-date branch, and linear history for `master`.
5. Configure required checks as `Verify`, `Pull request policy`, and `verified-base`.
6. Enforce the rules for administrators.
7. Disable force pushes and branch deletion.
8. Set the default Actions workflow permission to read-only and prevent Actions from approving pull requests.

### Read-only Verification Commands

```powershell
gh api repos/ZXFTech/feline-blog-app `
  --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,squash_merge_commit_title,squash_merge_commit_message}'

gh api repos/ZXFTech/feline-blog-app/branches/master/protection `
  --jq '{required_status_checks,enforce_admins,required_linear_history,allow_force_pushes,allow_deletions}'

gh api repos/ZXFTech/feline-blog-app/actions/permissions/workflow `
  --jq '{default_workflow_permissions,can_approve_pull_request_reviews}'
```

### Expected Result

`allow_squash_merge=true` and both other merge methods are false. Required checks have the three names above and `strict=true`. Admin enforcement and linear history are enabled. Force pushes and deletion are disabled. The default Actions permission is `read`.

## 5. GitHub Environment `staging`

### Purpose

Limit high-privilege staging credentials to protected `master` deployment workflows. Pull request workflows cannot read these secrets.

### Configuration Address

<https://github.com/ZXFTech/feline-blog-app/settings/environments>

### Configuration Steps

1. Create an Environment named `staging`.
2. Select `Protected branches only` under Deployment branches.
3. Configure the secrets and variables in the following table in that Environment.
4. Configure `RELEASE_APP_LOGIN` as a repository variable, not only as an Environment variable. Pull request refs under `refs/pull/*/merge` cannot read an Environment limited to protected branches.

| Type | Name | Value or source | Purpose |
| --- | --- | --- | --- |
| Secret | `POSTGRES_MIGRATION_URL` | `app_migrator` TLS URL for the Supavisor Session pooler | Migration probe and deployment |
| Secret | `POSTGRES_SSL_CA` | CA PEM from the current Supabase project Connect panel | Full TLS certificate verification |
| Secret | `VERCEL_TOKEN` | Vercel token limited to the staging team/project | Deployment, promotion, and restore |
| Secret | `E2E_USER_EMAIL` | Synthetic staging account | Authenticated smoke test |
| Secret | `E2E_USER_PASSWORD` | Synthetic staging account | Authenticated smoke test |
| Secret | `RELEASE_APP_PRIVATE_KEY` | Dedicated GitHub App private key PEM | Release Please write identity |
| Variable | `VERCEL_ORG_ID` | Vercel team ID | Prevent cross-team operations |
| Variable | `VERCEL_PROJECT_ID` | `feline-blog-staging` project ID | Prevent cross-project operations |
| Variable | `STAGING_BASE_URL` | `https://feline-blog-staging.vercel.app` | Stable staging origin |
| Variable | `STAGING_BASELINE_DEPLOYMENT_ID` | Manually verified `dpl_...` before first activation | Trusted initial recovery baseline only |
| Variable | `STAGING_BASELINE_COMMIT_SHA` | Full 40-character SHA of that deployment | Bind the initial baseline identity |
| Variable | `E2E_USER_ID` | Database ID of the synthetic user | Restrict the staging smoke API |
| Variable | `RELEASE_APP_ID` | GitHub App Client ID, usually beginning with `Iv` | Generate an App installation token |

Repository-level variable:

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| Repository variable | `RELEASE_APP_LOGIN` | `feline-blog-release[bot]` | Identify the trusted release pull request author |

### Write Commands

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

`gh secret set` reads from a secure prompt or a pipe. Do not pass a password, token, URL, CA, or private key as a `--body` command argument because it can enter shell history.

### Verification

```powershell
gh api repos/ZXFTech/feline-blog-app/environments/staging `
  --jq '{deployment_branch_policy,protection_rules}'
gh variable list --repo ZXFTech/feline-blog-app --env staging
gh variable list --repo ZXFTech/feline-blog-app
gh secret list --repo ZXFTech/feline-blog-app --env staging
```

Verify only names, scopes, and non-secret target values. Do not read or print secret values.

## 6. Supabase, Supavisor, and the Migration Role

### Purpose

Allow CI to use a least-privilege migration role through the Supavisor Session pooler and persist timeouts at the database-role level. Supavisor ignores PostgreSQL startup options, so the URL must not depend on `options=-c ...`.

### Configuration Addresses

1. Project: <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng>
2. Database settings: <https://supabase.com/dashboard/project/zjnjjzgxiltulkuhrjng/settings/database>
3. Official connection guidance: <https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI>
4. Official connection terminology: <https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO>

### Fixed Target

| Configuration | Value |
| --- | --- |
| Project ref | `zjnjjzgxiltulkuhrjng` |
| Session pooler host | `aws-0-ap-northeast-1.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| Role | `app_migrator` |
| Pooler username | `app_migrator.zjnjjzgxiltulkuhrjng` |
| `lock_timeout` | `5s` |
| `statement_timeout` | `120s` |

### Build the Migration URL

Choose the Session pooler in the Supabase Dashboard Connect panel. The password must be URL encoded.

```text
postgresql://app_migrator.zjnjjzgxiltulkuhrjng:<URL-ENCODED-PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
```

Do not append `options` startup parameters. Do not store the direct admin URL in GitHub.

### Configure Role Defaults Once

Store the admin and migration connections only in the Git-ignored `.env.staging` file:

```dotenv
POSTGRES_ENVIRONMENT=staging
POSTGRES_ADMIN_URL=postgresql://<admin-user>:<password>@<direct-host>:5432/postgres
POSTGRES_MIGRATION_URL=postgresql://app_migrator.zjnjjzgxiltulkuhrjng:<encoded-password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
POSTGRES_SSL_CA="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

Run:

```powershell
$env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE = "true"
pnpm db:staging:migrator-timeouts:configure
Remove-Item Env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE
pnpm db:staging:migration:probe
```

The tool transactionally applies and verifies SQL equivalent to:

```sql
ALTER ROLE app_migrator SET lock_timeout = '5s';
ALTER ROLE app_migrator SET statement_timeout = '120s';
```

### Password and Certificate Verification

Prefer the project probe:

```powershell
pnpm db:staging:migration:probe
```

This command simultaneously verifies DNS, TLS hostname, CA trust, password, database role, both role-default timeouts, advisory locks, and Prisma migration status without printing connection secrets. Expected output includes:

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

To verify only the certificate chain, write the CA to a temporary PEM file and run:

```powershell
openssl s_client -starttls postgres `
  -connect aws-0-ap-northeast-1.pooler.supabase.com:5432 `
  -servername aws-0-ap-northeast-1.pooler.supabase.com `
  -CAfile "<ca-file.pem>"
```

For success, check `Verify return code: 0 (ok)`. If the certificate passes but the probe reports authentication failure, the likely cause is the username format, password, or URL encoding. If certificate verification fails, obtain a CA that matches the pooler host from the current project Connect panel.

### Rollback

Run only during an approved maintenance window:

```powershell
$env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE = "true"
pnpm db:staging:migrator-timeouts:rollback
Remove-Item Env:STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE
```

Pause CI migrations after rollback. To resume, run configure and probe again, verify that fresh connections receive `5s` and `120s`, and only then restore Staging.

## 7. Vercel Staging Project

### Purpose

Deploy and verify an immutable candidate deployment before atomically switching the stable staging domain, so an unverified build never becomes the stable environment.

### Configuration Addresses

1. Open <https://vercel.com/dashboard>.
2. Select the correct team.
3. Select the `feline-blog-staging` project.
4. Open Git, Environments, Environment Variables, and Deployment Protection under Settings.

Related official documentation:

1. Project Settings: <https://vercel.com/docs/project-configuration/project-settings>
2. Git Configuration: <https://vercel.com/docs/project-configuration/git-configuration>
3. Deployment Protection: <https://vercel.com/docs/deployment-protection>
4. Trusted Sources: <https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources>
5. Promote API: <https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment>
6. Rollback API: <https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id>

### Configuration Steps

1. Set the Production branch to `master`.
2. Disable automatic Vercel Git Integration deployments so they cannot compete with GitHub Actions for the stable domain.
3. Disable automatic assignment of Production/custom domains.
4. Keep Vercel Authentication or the existing Deployment Protection for human access.
5. Configure these Production runtime variables:

| Name | Value or source | Purpose |
| --- | --- | --- |
| `STAGING_SMOKE_API_ENABLED` | `true` | Enable the synthetic Todo API only in staging |
| `E2E_USER_ID` | The same user ID as the GitHub Environment | Restrict the smoke API to the synthetic user |
| `SMOKE_DATA_RETENTION_HOURS` | `24` | Remove expired synthetic test data |

Do not create a long-lived Protection Bypass secret for Actions. The workflow uses a short-lived GitHub OIDC token.

### Verification

1. In Vercel Deployments, confirm that a Git push does not independently create a second deployment.
2. Confirm that the stable domain is `https://feline-blog-staging.vercel.app`.
3. Confirm that `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in the GitHub Environment match the project settings.
4. A candidate deployment must show READY, the Production target, the correct team/project, and `githubCommitSha`.

## 8. Vercel Trusted Source and GitHub OIDC

### Purpose

Allow staging pages protected by Deployment Protection to accept only short-lived identities from this repository, `master`, the `staging` Environment, and the designated workflow, without storing a long-lived bypass credential.

### Configuration Address

Vercel Dashboard → `feline-blog-staging` → Settings → Deployment Protection → Trusted Sources.

### Configuration Steps

1. Under External Services, select Add → GitHub Actions.
2. Select `ZXFTech` as the GitHub account and `feline-blog-app` as the repository.
3. Enter `master` as the branch.
4. Enter `staging` as the GitHub Actions environment.
5. Select only Production under Applies to environments.
6. Use the generated audience `https://github.com/ZXFTech`.
7. Select Edit raw claims and verify:

| Claim | Exact value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| `aud` | `https://github.com/ZXFTech` |
| `repository` | `ZXFTech/feline-blog-app` |
| `ref` | `refs/heads/master` |
| `environment` | `staging` |
| `workflow_ref` | `ZXFTech/feline-blog-app/.github/workflows/staging.yml@refs/heads/master` |

### Verification

The smoke jobs in a Staging run must obtain an OIDC token and use `x-vercel-trusted-oidc-idp-token` to access candidate, stable, and recovery addresses. Logs must not print the token or complete Authorization/Cookie headers. For a 401/403 response, first compare the claims, Environment name, and workflow ref character by character.

## 9. Release GitHub App

### Purpose

Use a dedicated bot identity to create Release Please pull requests and let the release eligibility check identify the trusted author exactly.

### Configuration Addresses

1. Create and manage: <https://github.com/settings/apps>
2. Public App page: <https://github.com/apps/feline-blog-release>
3. Installation scope: <https://github.com/settings/installations>

### Configuration Steps

1. Create a GitHub App named `feline-blog-release` dedicated to this repository.
2. Set the webhook to inactive, omit the callback URL, and do not enable user authorization.
3. Set only these repository permissions: Metadata read, Contents read/write, and Pull requests read/write.
4. Do not grant deployments, Actions, environments, administration, or packages permissions.
5. Install the App only on `ZXFTech/feline-blog-app`.
6. Generate a private key and save the complete PEM as the Environment secret `RELEASE_APP_PRIVATE_KEY`.
7. Save the Client ID from the App settings page as the Environment variable `RELEASE_APP_ID`. Do not use the numeric App ID or the slug.
8. Save the exact bot login `feline-blog-release[bot]` as the repository variable `RELEASE_APP_LOGIN`.

### Commands

```powershell
gh variable set RELEASE_APP_ID `
  --repo ZXFTech/feline-blog-app --env staging --body "<client-id>"

gh variable set RELEASE_APP_LOGIN `
  --repo ZXFTech/feline-blog-app --body "feline-blog-release[bot]"

Get-Content -Raw -LiteralPath "<private-key.pem>" |
  gh secret set RELEASE_APP_PRIVATE_KEY `
    --repo ZXFTech/feline-blog-app --env staging
```

### Verification

1. `gh variable list` shows the repository variable `RELEASE_APP_LOGIN`.
2. `gh variable list --env staging` shows `RELEASE_APP_ID`, whose value is the Client ID.
3. `gh secret list --env staging` shows `RELEASE_APP_PRIVATE_KEY`.
4. A successful Staging run can create or update a release pull request as `feline-blog-release[bot]`.

## 10. Initial Stable Deployment Baseline

### Purpose

Provide a manually proven stable deployment for automatic recovery when the workflow is first enabled. This exception allows only one exact deployment ID and commit SHA pair.

### Configuration Steps

1. In Vercel, open the deployment currently addressed by `STAGING_BASE_URL`.
2. Confirm that it belongs to the expected team and `feline-blog-staging`, has a Production target, and is READY.
3. Record its immutable deployment ID in `dpl_...` format.
4. Confirm the full 40-character commit SHA that produced it from the source build, deployment log, or another immutable release record. Do not guess from the current `master` or the deployment date.
5. Write the ID and SHA from the same deployment to the GitHub Environment together.

### Commands

```powershell
gh variable set STAGING_BASELINE_DEPLOYMENT_ID `
  --repo ZXFTech/feline-blog-app --env staging --body "<dpl_...>"

gh variable set STAGING_BASELINE_COMMIT_SHA `
  --repo ZXFTech/feline-blog-app --env staging --body "<40-character-sha>"
```

### Verification

Both values must exist and come from the same deployment. If Vercel returns Git metadata, the workflow requires it to equal the configured SHA exactly. Do not rotate these variables after every release. New deployments produced by successful runs must carry their own `githubCommitSha`.

## 11. Daily Development, Pull Requests, and CI

### Purpose

Verify code, migration history, types, lint, unit tests, and the production build before exposing any staging secret.

### Local Commands

```powershell
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

When full browser verification is needed and test-account variables are configured securely, also run:

```powershell
pnpm test:e2e
```

### Commit and Pull Request

```powershell
git switch -c codex/<short-topic>
git add <files>
git commit -m "feat: describe the user-visible change"
git push --set-upstream origin codex/<short-topic>
gh pr create --base master --fill
```

The pull request title must follow Conventional Commit format, for example:

```text
feat: add article draft autosave
fix: prevent duplicate staging promotion
ci: harden staging deployment checks
docs: add release operations guide
```

### CI Workflows

[`verify.yml`](../../.github/workflows/verify.yml) runs on pull requests and pushes to `master`:

1. Pull request title policy.
2. PostgreSQL 17 service.
3. Frozen dependency installation.
4. Prisma validation and generation.
5. Migration pull request guard and replay.
6. Type checking, lint, Vitest, and build.

[`release-eligibility.yml`](../../.github/workflows/release-eligibility.yml) returns a successful not-applicable result for ordinary pull requests. For a release pull request created by the bot with the `autorelease: pending` label, it requires a successful `staging:verified` record for the base SHA.

### Verification

```powershell
gh pr checks <pr-number> --repo ZXFTech/feline-blog-app --watch
gh pr view <pr-number> --repo ZXFTech/feline-blog-app `
  --json title,author,baseRefName,headRefName,mergeStateStatus,statusCheckRollup
```

`Verify`, `Pull request policy`, and `verified-base` must all succeed. Use squash merge and do not bypass checks.

## 12. Staging Deployment

### Purpose

Deploy one exact `master` SHA through verification, migration, candidate deployment, candidate smoke tests, promotion, and stable verification while recording recoverable checkpoints.

### Automatic Trigger

The `master` push produced by a pull request squash merge automatically triggers [`staging.yml`](../../.github/workflows/staging.yml). Only one staging mutation flow can run at a time, and a new run does not cancel an executing run.

### Manual Trigger

Only the full SHA of the current `master` is accepted:

```powershell
$repo = "ZXFTech/feline-blog-app"
$candidateSha = gh api repos/$repo/commits/master --jq .sha

gh workflow run staging.yml --repo $repo --ref master `
  -f candidate_sha=$candidateSha

gh run list --repo $repo --workflow staging.yml --limit 1
gh run watch <run-id> --repo $repo --exit-status
```

The workflow verifies that a manual actor has write, maintain, or admin permission and rejects a SHA that is not the current `master` HEAD.

### Workflow Stages and Purposes

| Stage | Purpose | Success evidence |
| --- | --- | --- |
| Verify candidate | Repeat installation, Prisma, migration checks, types, lint, tests, and build | Green verify job |
| Select candidate | Fix the SHA, run ID, attempt, and record key | GitHub deployment intent |
| Migration | Probe, reconcile, and run `prisma migrate deploy` | No unfinished, divergent, or destructive migration |
| Stage deployment | Run `vercel deploy --prod --skip-domain` | One READY candidate deployment |
| Candidate public smoke | Verify public pages and APIs | Green public smoke job |
| Candidate login/Todo smoke | Log in, then create, edit, complete, and delete a Todo | Green full smoke job with exact cleanup |
| Promote | Point the stable domain at the same deployment | Deployment ID does not change |
| Stable smoke | Check again from `STAGING_BASE_URL` | Stable origin points to the candidate |
| Recovery | Restore the previous deployment under safe conditions after failure | Green restore and recovery smoke |
| Record | Write `staging:verified` | GitHub deployment status success |
| Release maintenance | Create or update the release pull request | Bot pull request or no releasable changes |
| Release finalize | Create the tag/Release after a release pull request merge | Tag and Release point to the candidate SHA |

### Inspect Results and Artifacts

```powershell
gh run view <run-id> --repo ZXFTech/feline-blog-app `
  --json status,conclusion,headSha,event,attempt,jobs,url

gh run download <run-id> --repo ZXFTech/feline-blog-app `
  --dir ".feline-blog/staging-run-<run-id>"
```

Confirm that every remote mutation has an intent, result, and redacted checkpoint. Artifacts are retained for 30 days. Logs and artifacts must not contain OIDC tokens, Authorization headers, Cookies, passwords, database URLs, CA contents, or private keys.

## 13. Release Please and Version Publishing

### Purpose

Calculate versions and maintain the changelog from Conventional Commits, while creating tags and GitHub Releases only after the release commit passes complete staging verification.

### Configuration Files

1. [`release-please-config.json`](../../release-please-config.json)
2. [`.release-please-manifest.json`](../../.release-please-manifest.json)
3. [`CHANGELOG.md`](../../CHANGELOG.md)
4. [`release-bookkeeping.yml`](../../.github/workflows/release-bookkeeping.yml)
5. Official Release Please documentation: <https://github.com/googleapis/release-please>
6. Release Please Action: <https://github.com/googleapis/release-please-action>

The current configuration uses a Node release, `v` tags, stable versions, and `bump-minor-pre-major=true`, with `skip-github-release=true`. Release Please maintains only the version pull request. The staging finalizer creates the tag and Release after verification to avoid a race.

### Commit Types and Version Effect

| Conventional Commit | Version effect | Example |
| --- | --- | --- |
| `feat:` | Minor; still minor before 1.0 | `0.2.0` → `0.3.0` |
| `fix:` | Patch | `0.2.0` → `0.2.1` |
| `deps:` | Patch | `0.2.0` → `0.2.1` |
| `BREAKING CHANGE:` | Minor before 1.0 because `bump-minor-pre-major=true`; major from 1.0 onward | `0.2.0` → `0.3.0` |
| `ci:`, `docs:`, `test:`, `chore:` | No release by themselves | No release pull request change |

### Release Steps

1. Squash merge an ordinary feature pull request into `master`.
2. Staging succeeds and writes `staging:verified`.
3. The Release GitHub App creates or updates the single release pull request.
4. Confirm that the author is `feline-blog-release[bot]` and the label is `autorelease: pending`.
5. Confirm that the versions in `package.json`, the manifest, and `CHANGELOG.md` agree.
6. Squash merge the release pull request after `verified-base` succeeds.
7. The release commit completes the full Staging flow again.
8. The finalizer verifies the author, label, merge SHA, and manifest version, then creates `v<version>` and the GitHub Release.

### Verification Commands

```powershell
gh pr list --repo ZXFTech/feline-blog-app --state open `
  --json number,title,author,labels,baseRefName,headRefName,url

gh release view v<version> --repo ZXFTech/feline-blog-app `
  --json tagName,targetCommitish,isDraft,isPrerelease,publishedAt,url

gh api repos/ZXFTech/feline-blog-app/git/ref/tags/v<version> --jq .object.sha
```

The tag, Release target, and `headSha` of the successful Staging run must be identical. Existing example evidence is [Staging run 35950241960](https://github.com/ZXFTech/feline-blog-app/actions/runs/35950241960) and [v0.2.0](https://github.com/ZXFTech/feline-blog-app/releases/tag/v0.2.0).

## 14. Manual Release Bookkeeping

### Purpose

Retry release maintenance or finalization by itself only when staging succeeded but that release step failed. This does not rerun database migrations or Vercel promotion.

### Configuration Address

The Actions page for [`release-bookkeeping.yml`](../../.github/workflows/release-bookkeeping.yml).

### Commands

```powershell
gh workflow run release-bookkeeping.yml `
  --repo ZXFTech/feline-blog-app --ref master `
  -f operation=maintain `
  -f candidate_sha=<full-sha> `
  -f source_run_id=<run-id> `
  -f attempt=<attempt>
```

To retry the finalizer after the release pull request is merged:

```powershell
gh workflow run release-bookkeeping.yml `
  --repo ZXFTech/feline-blog-app --ref master `
  -f operation=finalize `
  -f candidate_sha=<full-sha> `
  -f source_run_id=<run-id> `
  -f attempt=<attempt>
```

### Verification

All three fields must come from the same successful staging deployment record. The workflow reconstructs `<candidate_sha>:<source_run_id>:<attempt>` and rejects a tuple that does not match. Do not guess the attempt or combine a SHA with a different run.

## 15. Failure Handling and Recovery

### Purpose

Prevent repeated migrations, duplicate deployments, overwriting an alias changed by another actor, or moving an already published tag when a remote result is uncertain.

| Failure code or symptom | Meaning | Action | Verification |
| --- | --- | --- | --- |
| `MIGRATION_FAILED` | Migration execution failed | Stop the release and inspect the database and `_prisma_migrations` manually | Rerun only after the cause is understood and a new probe passes |
| Unfinished migration | An incomplete record exists | Never run automated `prisma migrate resolve` | A database owner approves the resolution |
| `REMOTE_AMBIGUOUS` | The workflow cannot prove a unique remote mutation result | Search deployments using the complete correlation metadata | Exactly one matching result exists |
| `DEPLOY_TIMEOUT` | Vercel did not become READY in time | Inspect the same deployment before creating another candidate | Project, team, SHA, and record key all match |
| `SMOKE_FAILED` | Candidate or stable smoke failed | Inspect the smoke artifact and application logs | Fix with a new master SHA or perform a proven safe rerun |
| `ALIAS_CHANGED` | Another actor moved the stable alias | Stop and do not overwrite it | Identify the actor and current deployment |
| `RESTORE_FAILED` | Automatic restoration failed | Verify the previous deployment before manual restoration | Stable URL points to the previous ID and recovery smoke passes |
| `RELEASE_DEFERRED` | The run is no longer the latest master | Wait for the latest master run | The newer run writes a verified record |
| `RELEASE_COLLISION` | The same tag/Release points to another SHA | Compare the tag, Release, and verified SHA; never move the tag | Resolve the conflict manually before retrying |

If promotion or stable smoke fails, the workflow restores the previous deployment only when the stable alias still points to this run's candidate, then runs recovery smoke. Do not manually overwrite the alias without first confirming its current state.

## 16. Changes, Rotation, and Security Checks

### Purpose

Keep credential rotation and provider-setting changes auditable and prevent secret disclosure.

### Operations

1. After rotating `VERCEL_TOKEN`, test-account passwords, database passwords, or a GitHub App key, immediately run the corresponding probe or one complete Staging flow.
2. When the database password changes, URL encode it again and update `POSTGRES_MIGRATION_URL`. Update the CA only when the Supabase trust chain changes.
3. When rotating a GitHub App key, replace only `RELEASE_APP_PRIVATE_KEY`. The Client ID and bot login should not change with private-key rotation.
4. When changing the Vercel team/project, first update and verify `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, the Trusted Source, and the stable URL.
5. Never commit `.env.staging`, PEM files, tokens, passwords, complete database URLs, or downloaded artifacts to Git.
6. Remove stale duplicate Environment values only after confirming workflows no longer reference them. The authoritative location for `RELEASE_APP_LOGIN` is the repository variable. The authoritative locations for the Vercel IDs are Environment variables.

### Final Check Commands

```powershell
git status --short
git diff --check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For a documentation-only pull request, still run at least `git diff --check` and let the remote `Verify` workflow run completely on the pull request. Do not treat the Husky push hook, which may still contain an old workspace path, as complete verification.

## 17. Completion Checklist

1. GitHub permits only squash merge, and `master` required checks and linear history are enabled.
2. The `staging` Environment accepts protected branches only, and secrets/variables have the correct scope.
3. `RELEASE_APP_ID` is the Client ID, and `RELEASE_APP_LOGIN` is a repository variable.
4. The Supavisor URL uses Session port 5432, `app_migrator.<project-ref>`, and a URL-encoded password.
5. `pnpm db:staging:migration:probe` verifies the certificate, password, role, 5-second lock timeout, and 120-second statement timeout.
6. Vercel automatic Git deployment and automatic stable-domain assignment are disabled.
7. Trusted Source claims exactly match the repository, branch, Environment, and workflow ref.
8. The candidate deployment passes public and authenticated smoke tests before promotion.
9. The stable domain points to the same candidate deployment, and the GitHub deployment is `staging:verified`.
10. The release pull request author, label, base verification, and version files agree.
11. The tag, GitHub Release, and successful Staging SHA are identical.
12. Logs, artifacts, pull requests, and commit history contain no secrets.
