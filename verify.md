# CI、Staging 发布与版本管理验证清单

本清单用于首次启用和以后重新验证 `.github/workflows/staging.yml`。不要把 token、密码、数据库 URL、Cookie、CA 内容或 GitHub App 私钥复制到 issue、PR、Actions 日志或 artifact。

## 1. GitHub App

- [ ] 在 GitHub 创建一个仅用于本仓库 Release Please 的私有 GitHub App。
- [ ] Webhook 设为 inactive，不填写 callback URL，不启用用户授权。
- [ ] Repository permissions 只设置为 `Metadata: Read-only`、`Contents: Read and write`、`Pull requests: Read and write`。
- [ ] Organization、account 和其他 repository permissions 保持 `No access`，不订阅事件。
- [ ] App 只允许安装到所有者账号，并且安装时只选择 `ZXFTech/feline-blog-app`。
- [ ] 生成 private key，并把完整 PEM 内容保存为 GitHub Environment `staging` 的 secret `RELEASE_APP_PRIVATE_KEY`。
- [ ] 把 App settings 页面显示的 App ID 保存为 Environment variable `RELEASE_APP_ID`。
- [ ] 把 `<app-slug>[bot]` 保存为 Environment variable `RELEASE_APP_LOGIN`。`app-slug` 是 `https://github.com/apps/<app-slug>` 中的最后一段。
- [ ] 确认私钥没有写入仓库、`.env`、shell history 或命令参数。GitHub secret 保存成功后，将本地 PEM 移入安全密钥库或安全删除。

PowerShell 可使用以下命令保存三个值。不要把私钥作为 `--body` 参数传递。

```powershell
gh variable set RELEASE_APP_ID --env staging --body "<app-id>"
gh variable set RELEASE_APP_LOGIN --env staging --body "<app-slug>[bot]"
Get-Content -Raw -LiteralPath "<private-key.pem>" |
  gh secret set RELEASE_APP_PRIVATE_KEY --env staging
```

只检查名称，不读取 secret 内容：

```powershell
gh api repos/ZXFTech/feline-blog-app/environments/staging/secrets `
  --jq '[.secrets[].name]'
gh api repos/ZXFTech/feline-blog-app/environments/staging/variables `
  --jq '[.variables[].name]'
```

预期同时存在：

```text
Secret: RELEASE_APP_PRIVATE_KEY
Variable: RELEASE_APP_ID
Variable: RELEASE_APP_LOGIN
```

## 2. GitHub Environment 和分支保护

- [ ] Environment `staging` 的 deployment branch policy 为 protected branches only。
- [ ] `master` 要求 pull request、线性历史和最新分支状态。
- [ ] Required checks 包含 `Verify`、`Pull request policy` 和 `verified-base`。
- [ ] 禁止 force push 和 branch deletion。
- [ ] 仓库只允许 squash merge，并用 PR title 作为 squash commit title。
- [ ] Actions 默认 workflow permission 保持 read-only。

只读核验：

```powershell
gh api repos/ZXFTech/feline-blog-app/environments/staging `
  --jq '{deployment_branch_policy, protection_rules}'
gh api repos/ZXFTech/feline-blog-app/branches/master/protection `
  --jq '{required_status_checks, enforce_admins, required_linear_history, allow_force_pushes, allow_deletions}'
```

## 3. Vercel 项目

目标项目必须是 `feline-blog-staging`，Production 环境在本项目中代表稳定 staging，不是产品 production。

- [ ] 打开 Vercel Dashboard，选择 `feline-blog-staging`。
- [ ] 进入 Settings > Environments > Production > Branch Tracking。
- [ ] 确认 Production branch 为 `master`。
- [ ] 关闭 `Auto-assign Custom Production Domains`。工作流使用 `vercel deploy --prod --skip-domain` 创建 staged Production deployment，再用 `vercel promote` 提升同一个 deployment。
- [ ] 禁止 Git Integration 独立移动稳定域名。如果仍保留 Git Integration，关闭该项目的自动部署；部署只能由 GitHub Actions staging workflow 编排。
- [ ] Production runtime variables 包含 `STAGING_SMOKE_API_ENABLED=true`、正确的 `E2E_USER_ID` 和 `SMOKE_DATA_RETENTION_HOURS=24`。
- [ ] 保持面向人的 Vercel Authentication 或现有 Deployment Protection 开启。
- [ ] 不创建供 Actions 使用的长期 Protection Bypass secret。

## 4. Vercel Trusted Source

在 `feline-blog-staging` 中进入 Settings > Deployment Protection > Trusted Sources。

- [ ] 在 External Services 中选择 Add > GitHub Actions。
- [ ] GitHub account 选择 `ZXFTech`。如果列表中没有该账号，先按 Vercel 提示安装其 GitHub App。
- [ ] Repository 选择 `feline-blog-app`。
- [ ] Branch 填写 `master`。
- [ ] GitHub Actions environment 填写 `staging`。
- [ ] Applies to environments 只选择 `Production`。
- [ ] Audience 使用自动生成的 `https://github.com/ZXFTech`，不要设置自定义 audience。
- [ ] 保存后选择 Edit raw claims，并确认下列 claim 全部精确匹配。

| Claim          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| `aud`          | `https://github.com/ZXFTech`                                              |
| `repository`   | `ZXFTech/feline-blog-app`                                                 |
| `ref`          | `refs/heads/master`                                                       |
| `environment`  | `staging`                                                                 |
| `workflow_ref` | `ZXFTech/feline-blog-app/.github/workflows/staging.yml@refs/heads/master` |

Issuer 必须是 `https://token.actions.githubusercontent.com`。工作流只在 candidate public smoke、candidate authenticated smoke、stable smoke 和 recovery verification job 中请求 `id-token: write`，并通过 `x-vercel-trusted-oidc-idp-token` 请求头发送短期 token。

## 5. GitHub Environment 值

在 Repository Settings > Environments > staging 中核对以下名称。只核对名称和目标，不展示内容。

| Kind     | Name                      | Target                                         |
| -------- | ------------------------- | ---------------------------------------------- |
| Secret   | `POSTGRES_MIGRATION_URL`  | Supabase staging `app_migrator` direct TLS URL |
| Secret   | `POSTGRES_SSL_CA`         | Supabase CA PEM content                        |
| Secret   | `VERCEL_TOKEN`            | 专用 staging Vercel principal                  |
| Secret   | `E2E_USER_EMAIL`          | Synthetic staging user                         |
| Secret   | `E2E_USER_PASSWORD`       | Synthetic staging user                         |
| Secret   | `RELEASE_APP_PRIVATE_KEY` | Release GitHub App PEM                         |
| Variable | `VERCEL_ORG_ID`           | Expected Vercel team ID                        |
| Variable | `VERCEL_PROJECT_ID`       | Expected project ID                            |
| Variable | `STAGING_BASE_URL`        | `https://feline-blog-staging.vercel.app`       |
| Variable | `E2E_USER_ID`             | Synthetic user database ID                     |
| Variable | `RELEASE_APP_ID`          | Release GitHub App ID                          |
| Variable | `RELEASE_APP_LOGIN`       | Exact `<app-slug>[bot]` login                  |

## 6. Pull request 验证

- [ ] 用 Conventional Commit 格式设置 PR title，例如 `ci: add controlled staging release pipeline`。
- [ ] PR 中 `Verify`、`Pull request policy` 和 `verified-base` 全部成功。
- [ ] PR workflow 没有 Environment secret，也没有 `id-token: write`。
- [ ] 合并方式为 squash merge。
- [ ] 合并前确认 Vercel Trusted Source 和 GitHub App 已配置。

## 7. 首次 staging 激活

合并后，`master` push 会自动触发 `Staging`。如需人工重跑，只允许当前 `master` 的完整 SHA。

```powershell
$candidateSha = gh api repos/ZXFTech/feline-blog-app/commits/master --jq .sha
gh workflow run staging.yml -f candidate_sha=$candidateSha
gh run list --workflow staging.yml --limit 1
```

拿到 run ID 后等待结束：

```powershell
gh run watch <run-id> --exit-status
```

逐项确认：

- [ ] Verify candidate 成功。
- [ ] Migration reconcile 没有 unfinished、divergent 或 destructive migration。
- [ ] GitHub deployment payload 的 candidate SHA、run ID、attempt 和 record key 正确。
- [ ] Vercel candidate 属于预期 team 和 project，状态为 READY，commit metadata 等于 candidate SHA。
- [ ] Candidate public smoke 成功。
- [ ] Candidate login and Todo smoke 完成登录、创建、编辑、完成和删除。
- [ ] Cleanup 只删除本轮精确 ID，或清理超过保留时间的 synthetic orphan。
- [ ] Promote 使用 candidate deployment ID，没有重新构建。
- [ ] Stable public smoke 确认稳定域名指向同一个 candidate deployment。
- [ ] GitHub staging deployment 最终状态为 success，描述为 `staging:verified`。
- [ ] 每个远程 mutation 都有 intent、result 和脱敏 checkpoint。
- [ ] 日志和 artifacts 不包含 token、Authorization header、Cookie、密码、数据库 URL 或 CA 内容。

可把 artifacts 下载到已忽略的本地目录审查：

```powershell
gh run download <run-id> --dir ".feline-blog/staging-run-<run-id>"
```

## 8. Release Please 验证

`ci:`、`docs:`、`test:` 和 `chore:` 提交不会产生版本 PR。需要至少一个 `feat:`、`fix:` 或 `deps:` 提交，或者明确的 `BREAKING CHANGE:` footer。

- [ ] staging 验证成功后，Release Please 创建或更新唯一版本 PR。
- [ ] PR author 精确等于 `RELEASE_APP_LOGIN`。
- [ ] PR 目标是 `master`，并带有 `autorelease: pending` label。
- [ ] `Release eligibility / verified-base` 证明当前 base SHA 已成功通过 staging。
- [ ] `package.json`、`.release-please-manifest.json` 和 `CHANGELOG.md` 中的版本一致。
- [ ] 合并版本 PR 后，新 `master` HEAD 再次完成 staging。
- [ ] `v<version>` tag 和 GitHub Release 精确指向该 verified SHA。
- [ ] 重跑相同 SHA 时保持幂等；同名 tag 指向其他 SHA 时必须失败。

## 9. 失败处理

- [ ] 先阅读 Actions job summary 和 checkpoint，再决定是否重跑。
- [ ] `MIGRATION_FAILED` 或 unfinished migration 必须人工检查数据库，不自动执行 `prisma migrate resolve`。
- [ ] `REMOTE_AMBIGUOUS` 必须用完整 correlation metadata 找到唯一 Vercel deployment。
- [ ] `ALIAS_CHANGED` 时停止，不覆盖外部 actor 的 alias 修改。
- [ ] `RESTORE_FAILED` 时核验 previous deployment ID、SHA、team、project 和 READY 状态，再执行手工恢复。
- [ ] `RELEASE_DEFERRED` 等待新的 master HEAD 完成 staging。
- [ ] `RELEASE_COLLISION` 比较现有 tag、Release 和 verified SHA，禁止移动已有 tag。

人工 release bookkeeping 只接受成功 staging 记录中的精确 candidate SHA、source run ID 和 attempt：

```powershell
gh workflow run release-bookkeeping.yml `
  -f operation=maintain `
  -f candidate_sha=<full-sha> `
  -f source_run_id=<run-id> `
  -f source_attempt=<attempt>
```
