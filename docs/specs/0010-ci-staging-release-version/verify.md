# Verify: CI、Staging 发布与版本管理 · spec 0010 · updated 2026-09-21

_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Operational checks

- [ ] Confirm GitHub Environment `staging` exposes only `POSTGRES_MIGRATION_URL` and `POSTGRES_SSL_CA` to the migration job, and does not expose `POSTGRES_ADMIN_URL` or `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE` → CI cannot change role defaults → AC-12, AC-14, AC-15
- [ ] Confirm the migration secret has the committed exact Session Pooler host, port `5432`, database `postgres`, qualified username `app_migrator.<stagingProjectRef>`, and zero query parameters → the migration target is exact and contains no startup `options` → AC-12, AC-15
- [ ] Inspect `.feline-blog/staging-migrator-timeouts-prestate.json` without printing URLs or credentials → target identity is staging, explicit values and effective milliseconds are present, and POSIX mode 0600 or Windows ACL permits only the current user and SYSTEM → AC-13, AC-14

## Commands

- [ ] `pnpm typecheck` → exits successfully → AC-13
- [ ] `pnpm lint` → exits successfully with zero warnings → AC-13
- [ ] `pnpm test` → all Vitest and database boundary checks pass, including target rejection, timeout state transitions, ACL, transaction rollback, lock loss, child termination, Prisma URL and workflow contracts → AC-5, AC-12, AC-13, AC-14, AC-15
- [ ] `pnpm build` → Prisma clients generate and the production build succeeds → AC-1, AC-13
- [ ] `pnpm db:staging:migration:probe` → reports the exact redacted Session Pooler target, two connections, `databaseRole=app_migrator`, `lockTimeoutMs=5000`, `statementTimeoutMs=120000`, `advisoryLock=verified`, and `prismaStatus=reachable` → AC-5, AC-12, AC-15
- [ ] Run `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true pnpm db:staging:migrator-timeouts:configure` twice using the shell syntax for the current operating system → first run is `configured` or already `verified`, second run is `verified`, both retain the original pre-state and report `5000` and `120000` milliseconds → AC-13, AC-14, AC-15
- [ ] Run both timeout commands without `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true` → each fails with `TARGET_REJECTED` before opening an external connection → AC-12, AC-14
- [ ] On a GitHub hosted runner, dispatch the current `master` HEAD after the Environment secret is updated → the Session Pooler probe succeeds before migration reconciliation, and no role configuration command appears in the workflow → AC-5, AC-12, AC-14, AC-15

## Controlled rollback drill

_Run only in an approved staging maintenance window. Keep staging migration writes disabled until the final reconfigure and probe succeed._

- [ ] Disable or block the staging migration job while retaining secretless PR verification → no migration can start during the drill → AC-12, AC-14
- [ ] Run `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true pnpm db:staging:migrator-timeouts:rollback` → catalog explicit or absent state and migrator effective milliseconds both match the saved pre-state, and the file is renamed to a timestamped `.rolled-back.json` audit copy → AC-13, AC-14, AC-15
- [ ] Restore the active policy with `STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE=true pnpm db:staging:migrator-timeouts:configure`, then run `pnpm db:staging:migration:probe` → effective values return to `5000` and `120000`, Prisma status succeeds, and only then may staging migration writes resume → AC-5, AC-14, AC-15

## Acceptance-criteria coverage

- AC-1 is covered by the production build and the existing secretless Verify workflow checks.
- AC-5 is covered by the real migration probe, advisory lock behavior, Prisma status, and fail closed error paths.
- AC-12 is covered by exact target classification, process only write gates, job scoped secrets, and the absence of admin credentials in CI.
- AC-13 is covered by Vitest contracts for configuration, drift, idempotent retry, transaction failure, ACL, rollback matrices, lock loss and child termination.
- AC-14 is covered by the explicit local configure and rollback commands and by proving CI has no role management authority.
- AC-15 is covered by the exact Session Pooler target, numeric role default verification on two connections, advisory lock proof and Prisma status.
