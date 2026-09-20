# Staging release operations

This runbook owns the one time provider settings and the safe recovery path for the staging pipeline in `.github/workflows/staging.yml`.

## GitHub repository settings

Protect `master` with a repository ruleset.

* Require pull requests and allow squash merge only.
* Block direct pushes, force pushes, branch deletion, merge commits, and rebase merges.
* Require branches to be current before merge.
* Require `Verify / Verify`, `Verify / Pull request policy`, and `Release eligibility / verified-base`.
* Keep Actions workflow permissions read only by default.

Create a GitHub Environment named `staging`. Limit it to `master` and trusted maintainers. Store only these values there.

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `POSTGRES_MIGRATION_URL` | TLS staging migrator connection |
| Secret | `POSTGRES_SSL_CA` | Supabase CA content |
| Secret | `VERCEL_TOKEN` | Token limited to the staging project and team |
| Secret | `E2E_USER_EMAIL` | Synthetic staging login |
| Secret | `E2E_USER_PASSWORD` | Synthetic staging password |
| Secret | `RELEASE_APP_PRIVATE_KEY` | Dedicated Release Please GitHub App key |
| Variable | `VERCEL_ORG_ID` | Expected Vercel team ID |
| Variable | `VERCEL_PROJECT_ID` | Expected `feline-blog-staging` project ID |
| Variable | `STAGING_BASE_URL` | Stable HTTPS staging origin |
| Variable | `E2E_USER_ID` | Expected synthetic user ID |
| Variable | `RELEASE_APP_ID` | Dedicated Release Please GitHub App ID |
| Variable | `RELEASE_APP_LOGIN` | Exact bot login, including `[bot]` |

The Release Please App needs repository metadata read, contents write, and pull requests write. It does not need deployments, Actions, environments, administration, or packages permission.

## Vercel settings

Use the `feline-blog-staging` project Production environment as stable staging.

* Disable automatic Production domain assignment for Git deployments.
* Prevent Vercel Git Integration from independently moving the stable staging domains.
* Keep `STAGING_SMOKE_API_ENABLED=true`, `E2E_USER_ID`, and `SMOKE_DATA_RETENTION_HOURS=24` in the Vercel Production runtime variables.
* Configure a Production Trusted Source for issuer `https://token.actions.githubusercontent.com`.
* Limit claims to repository `ZXFTech/feline-blog-app`, ref `refs/heads/master`, GitHub Environment `staging`, the trusted workflow refs in this repository, and the `feline-blog-staging` project.
* Keep SSO enabled for human access. Do not create a long lived protection bypass secret for Actions.

Before enabling the automatic `master` trigger, verify that `STAGING_BASE_URL` resolves to a READY deployment in the expected team and project, with a valid `githubCommitSha` metadata value.

## Supabase settings

The migration URL must identify the `app_migrator` role in project `zjnjjzgxiltulkuhrjng`, database `postgres`, with full certificate verification. The workflow never receives an admin connection and never runs `migrate dev`, `migrate reset`, `db push`, legacy MariaDB migration, or `prisma migrate resolve`.

## First activation

Use the repository root [`verify.md`](../../verify.md) for the complete provider configuration and first activation checklist.

1. Configure the provider settings above before merging the workflow change to `master`.
2. Merge the workflow change through a squash pull request. Its resulting `master` HEAD starts the first automatic Staging run.
3. Confirm the GitHub deployment record, migration reconciliation, staged Production deployment, candidate smoke, same deployment promotion, stable smoke, and Release Please maintenance.
4. Confirm no artifact or log contains an OIDC token, request authentication header, Cookie, password, connection URL, or CA content.
5. Keep the `push` trigger enabled and finish protecting `master` with the required checks once their first check runs are visible.

## Failure and recovery

Every remote mutation records an intent and result status on the GitHub Environment deployment. Check the run summary and the immutable checkpoint artifacts before retrying.

* `MIGRATION_FAILED` or an unfinished `_prisma_migrations` row requires manual database inspection. Do not run `prisma migrate resolve` automatically.
* `REMOTE_AMBIGUOUS` requires inspecting Vercel deployments by the full correlation metadata. Do not create another candidate until exactly one result is known.
* `ALIAS_CHANGED` means another actor moved the stable alias. Stop and identify that actor before any restore.
* `RESTORE_FAILED` requires confirming the stable alias, previous deployment ID, previous commit SHA, project, team, and READY state before running `vercel rollback <previous-deployment-id>`.
* `RELEASE_DEFERRED` is safe. Let the newer `master` HEAD finish staging, then allow that run to maintain the release PR.
* `RELEASE_COLLISION` requires comparing the existing tag and GitHub Release with the verified candidate SHA. Never move an existing tag automatically.

Use `Release bookkeeping` only with the exact candidate SHA, source run ID, and attempt from a successful staging deployment record. The workflow rejects any tuple that does not reconstruct the trusted record key.
