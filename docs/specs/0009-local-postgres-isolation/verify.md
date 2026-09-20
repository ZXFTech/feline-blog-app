# 0009. Verification plan

## Purpose

This plan proves that daily development, migration work, destructive verification, staging export, and staging deployment cannot silently cross their intended database boundaries.

## Offline checks

These checks must run without Docker, staging credentials, or any database connection.

1. Run `pnpm test` and confirm target classifier tests reject remote local targets, wrong fixed or generated database names, wrong staging project refs, pooler endpoints, unsupported roles, saved write gates, conflicting inherited variables, protected keys in alternate Next.js files, and secret bearing output.
2. Run `pnpm prisma:validate` and `pnpm prisma:generate` with database credentials absent. Both must succeed without loading `.env`, `.env.development`, or `.env.staging` implicitly.
3. Run the command orchestration tests and confirm each child process receives only its explicit environment, accepted arguments, binary streams, timeout, cancellation, and safe error mapping.
4. Exercise every compatibility mapping and confirm unsafe names fail closed instead of forwarding their original arguments.
5. Search test output for fixture passwords, URL credentials, CA markers, tokens, password hashes, emails, and raw constraint errors. No match is allowed.

## Local Docker checks

Use a disposable Compose project and volume. Never load `.env.staging` in this section.

1. Run `pnpm db:local:test` twice with separate generated project identities, credentials, and deterministic local users. Both runs must pass and leave no test volume, ledger row, or temporary database.
2. Confirm the PostgreSQL container binds only to `127.0.0.1` on the configured port.
3. Confirm `feline_blog_dev`, `feline_blog_shadow`, and `feline_blog_verify` exist and have distinct connection targets.
4. Confirm `PUBLIC` has no unwanted connect, schema create, table, sequence, or function rights. Confirm runtime cannot connect to shadow or verify.
5. Confirm `app_runtime` can read and write application tables and use generated keys but cannot create schema, roles, or databases.
6. Confirm `app_migrator` owns migration objects and can apply migrations but cannot create roles or databases. Create a new object as migrator and verify the configured default runtime grants.
7. Confirm recreating verify and replaying every ordered working tree migration produces matching checksums and an empty schema diff.
8. Test a shared exported snapshot while the source fixture changes. Confirm the dump and source count manifest describe the same snapshot.
9. Restore fixtures with cyclic foreign keys, migration inserted rows, empty and advanced generated keys, then confirm foreign key recreation and rolled back insert probes pass.
10. Add a partitioned table, foreign table, materialized view, large object, RLS table, and executable application function one at a time. Confirm each unsupported case fails before export.
11. Keep an idle dev pool connection open and confirm the fence refuses without terminating it. Attempt reconnects during the check and confirm none enter.
12. Terminate the orchestrator before each side effect and after each SQL statement but before its result update. Confirm recovery reconciles actual OIDs, names, grants, and child state without deleting the only viable database.
13. Start conflicting lifecycle operations from two worktrees before PostgreSQL is available and confirm the shared host lock serializes them. Repeat after startup and confirm the maintenance database advisory lock also serializes database operations.
14. Interrupt the dump producer and restore consumer separately. Confirm every Docker child stops before lock release and the current dev database remains unchanged.
15. Stop and restart the service and confirm data remains. Confirm destroy rejects a remote Docker context, wrong labels, unexpected mounts, missing confirmations, and succeeds only for the owned local volume.
16. Force the restore consumer to fail after the dump producer starts. Confirm the command returns only its safe failure code and phase, both named child containers are removed, and no new `feline-refresh-*` container remains.
17. On the pinned PostgreSQL 17 image, attempt a database rename inside a transaction. If the server accepts it, roll the transaction back and confirm the original database OID and name remain unchanged. If it returns SQLSTATE `25001`, confirm no rename occurred. Record which behavior the pinned image exhibited.

## Staging read checks

These checks require explicit staging credentials. They must not change staging data.

1. Run `pnpm db:staging:status` and confirm it prints the allowlisted project and database only in redacted form.
2. Verify the connected endpoint, project, database, and role after connection. A pooler endpoint must fail.
3. Verify `app_exporter` can read every supported application table, `_prisma_migrations`, and owned sequence metadata.
4. Verify `app_exporter` cannot call `nextval` or `setval`, execute an application function, insert, update, delete, create, alter, truncate, or drop.
5. Replace the staging URL with a different Supabase project and confirm status, refresh, and deploy reject it before a mutating command starts.
6. Remove the CA or weaken its mode and confirm every staging command rejects the connection.

## Refresh check

This check copies sensitive staging data. Run it only on the trusted development workstation with the explicit process switch.

1. Stop `pnpm dev` and run `pnpm db:local:refresh` with `STAGING_DATA_COPY_ALLOW=true` and `STAGING_DATA_COPY_TRUSTED_WORKSTATION=feline-blog-local-sensitive-copy` in the current process.
2. Confirm output lists the captured snapshot manifest row counts and the restored target matches that manifest. Do not mutate staging as part of verification.
3. Confirm output contains no row values, credentials, tokens, hashes, emails, CA contents, raw child errors, or full URLs.
4. Confirm local `_prisma_migrations` comes from local migration replay and was not restored from staging.
5. Confirm every owned sequence permits a rolled back generated key insert without collision.
6. Confirm no dump file, environment file, or CA file created by the command remains in the repository, host temp directory, container, or Docker volume after success.
7. Use the existing test account credentials from ignored `.env.e2e.local`, start `pnpm dev`, sign in through the local runtime, perform one uniquely marked authenticated write, and prove through the validated connection target plus a read only staging lookup that no staging row with that marker exists.

## Staging deploy protection check

1. Run the staging deploy command without `STAGING_MIGRATION_ALLOW_WRITE`. It must fail before Prisma starts.
2. Attempt to route `migrate dev`, `migrate reset`, and `db push` through every staging and deprecated command. Each must fail.
3. Add a migration checksum mismatch and confirm deploy status identifies it without running migration SQL.
4. With no pending migration, run the guarded deploy command with the correct process switch and confirm it reports no pending work.

## Completion evidence

Record command, exit code, redacted target, and relevant assertion for each check. Never paste environment files, URLs, certificates, password hashes, sessions, verification tokens, or copied row contents into the evidence.
