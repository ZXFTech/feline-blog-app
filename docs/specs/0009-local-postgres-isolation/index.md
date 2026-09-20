# 0009. Local PostgreSQL development and migration isolation

**Date**: 2026-09-19
**Status**: In Progress

## Summary

Daily development will use a PostgreSQL container on the developer machine instead of Supabase staging. Development, Prisma shadow work, destructive migration verification, and staging access each get a separate database or command boundary. Copying staging data remains possible, but only through an explicit guarded refresh that treats the local volume as sensitive.

## Requirements

**User stories**:

- As a developer, I want `pnpm dev` to use a local database so ordinary work cannot change staging data.
- As a developer, I want every ordered migration file in my working tree to replay from an empty database so a newly created migration is verified before commit.
- As a developer, I want an explicit way to refresh local data from staging without weakening staging write protection.
- As a maintainer, I want commands to identify their database target before they act so an environment file mistake fails safely.

**Acceptance criteria**:

- **AC-1**: `pnpm db:local:up` acquires the shared host lifecycle lock, generates missing local credentials before Compose starts, and launches the committed immutable PostgreSQL image in project `feline-blog-local`, service `postgres`, volume `feline_blog_postgres_data`, bound only to configurable loopback port `54329` by default. `pnpm db:local:setup` idempotently reconciles the documented databases, roles, ownership, grants, and default privileges without changing application rows.
- **AC-2**: `pnpm dev` rejects every protected inherited database or libpq variable, constructs a clean child environment only from `.env.development`, connects to `feline_blog_dev` as `app_runtime`, rejects protected database variables in alternate Next.js environment files, and performs no staging network access.
- **AC-3**: `pnpm db:local:migrate -- --name <name>` accepts `--name` as its only user argument, runs `migrate dev` against `feline_blog_dev` with `feline_blog_shadow`, explicitly regenerates the Prisma client, then recreates `feline_blog_verify` and replays every ordered migration directory present in the working tree, including the new migration. It verifies applied names, SQL checksums, completion state, and schema equality. A failure in any step makes the command fail.
- **AC-4**: `pnpm db:local:refresh` runs only outside CI and Preview when both process only copy gates are correct, the committed staging allowlist matches the direct Supabase project and database, the target is the verified local `feline_blog_dev`, and the cluster scoped database operation lock is free.
- **AC-5**: Refresh opens one read only repeatable read staging transaction, exports its snapshot, discovers the supported application table inventory, records source row counts in that snapshot, streams a custom format data only archive to a migrated temporary local database, validates restored foreign keys and derived safe sequence values, compares target row counts with the snapshot manifest, and switches only after every check passes.
- **AC-6**: A refresh that fails before the documented commit point preserves the current `feline_blog_dev`. The switch fences new application connections, refuses while any existing application session remains, journals every rename by database OID, and recovers deterministically after interruption. A failure after the commit point reports refresh success with cleanup pending and never removes the only viable database.
- **AC-7**: Staging export uses a verified read only `app_exporter` through the allowlisted direct Supabase endpoint. Staging migration SQL is limited to `pnpm db:staging:deploy` with `.env.staging`, the committed allowlist, and `STAGING_MIGRATION_ALLOW_WRITE=true`. Staging commands reject `migrate dev`, `migrate reset`, and `db push`.
- **AC-8**: `pnpm db:local:status` and `pnpm db:staging:status` emit the documented structured fields for environment class, redacted target, readiness, effective capabilities, migration names and checksums, and recovery state. They return allowlisted error codes and summaries without relaying raw child or database diagnostics.
- **AC-9**: `pnpm db:local:down` preserves the owned local volume. `pnpm db:local:destroy` rejects remote Docker contexts and unexpected mounts, then removes only resources with the committed project and ownership labels after `LOCAL_DATABASE_DESTROY_ALLOW=true` and exact confirmation `feline-blog-local:feline_blog_postgres_data`.
- **AC-10**: `.env.development.example`, `.env.shadow.example`, and `.env.staging.example` document every required value without secrets. The corresponding real files and all transient database artifacts are ignored by Git.
- **AC-11**: Existing PostgreSQL command names remain as temporary aliases that print a deprecation notice and route through the same target checks. No alias can restore the former implicit staging development path.
- **AC-12**: `pnpm test` covers configuration parsing, target classification, allowlist checks, shared operation locks, command orchestration, redaction, and rejection paths without Docker or staging. `pnpm db:local:test` uses a unique internal Docker project with generated credentials and deterministic fixtures to prove database and role isolation, migration replay, snapshot consistency, restore validation, switch recovery, and protected operation rejection.

## Decision

**Chosen option**: Fix the existing PostgreSQL tooling in place with a guarded Docker Compose local environment and a gradual command cutover.

Use Compose project `feline-blog-local`, service `postgres`, and volume `feline_blog_postgres_data`. During implementation, query staging `SHOW server_version`, select the matching `postgres:<major>-bookworm` image, resolve its content digest, and commit the full `postgres:<major>-bookworm@sha256:<digest>` reference. Store the resolved major and digest beside the Compose file. Keep the application on the host and expose PostgreSQL only on configurable `127.0.0.1:54329`.

Use maintenance database `postgres` plus three local application databases. `feline_blog_dev` is the application and `migrate dev` target. `feline_blog_shadow` belongs only to Prisma shadow work. `feline_blog_verify` is recreated from empty to prove the ordered migration files in the working tree. The container bootstrap user is `local_admin`. Before first container startup, `db:local:up` generates independent random 32 byte passwords for `local_admin`, `app_migrator`, and `app_runtime`, writes them only to the designated ignored local files, then passes the bootstrap credential to Compose. Setup never depends on credentials that do not exist yet.

Keep canonical PostgreSQL variable names inside each environment file. A shared TypeScript launcher rejects every inherited protected variable except the command's explicitly allowed process only gates. It then parses only the files allowed for that command, validates them, and constructs an explicit child environment. It rejects protected keys in `.env`, `.env.local`, and `.env.development.local`, so Next.js cannot override the validated local runtime target. The refresh script parses `.env.development`, `.env.shadow`, and `.env.staging` into separate source, administration, and target objects and never merges those objects into `process.env`.

Remove implicit default environment loading from `prisma.postgres.config.ts`. Every wrapper must supply the intended variables before Prisma starts. This keeps generation and validation offline and prevents a root `.env` file from silently selecting a database.

Refresh staging data through a consistent exported PostgreSQL snapshot. Run `pg_dump`, `pg_restore`, and `psql` from a tools container using the same immutable PostgreSQL image as the local service. A Node child process connects their binary streams with backpressure and no TTY or PowerShell pipeline. Apply migrations before restoring data. Do not copy Prisma migration metadata.

Build and verify the copy in `feline_blog_refresh_<run-id>`. Use the maintenance database for a shared advisory lock and a durable `feline_tool.refresh_operations` ledger. Fence new connections before checking existing sessions, then rename the current database to `feline_blog_previous_<run-id>` and the candidate to `feline_blog_dev`. Preserve the old database until the candidate passes the defined smoke check and the ledger reaches its commit point. Every rename and cleanup step is recoverable by database OID and owner token.

The local connection may omit TLS only when the environment is `local`, the host is loopback, and the database is one of the committed local targets. Every Supabase connection keeps CA verification with `sslmode=verify-full`. No remote host can select the local exception through an environment variable alone.

**Implementation skills**: `docker-compose-orchestration` (`manutej/luxor-claude-marketplace`, `.agents/skills/docker-compose-orchestration/`) · `infra-postgres` (`clickhouse/agent-skills`, `.agents/skills/infra-postgres/`) · `prisma-cli-migrate-dev` (`prisma/cursor-plugin`, `.agents/skills/prisma-cli-migrate-dev/`) · `prisma-cli-migrate-deploy` (`prisma/cursor-plugin`, `.agents/skills/prisma-cli-migrate-deploy/`) · `prisma-cli-migrate-status` (`prisma/cursor-plugin`, `.agents/skills/prisma-cli-migrate-status/`) · `prisma-database-setup-postgresql` (`prisma/cursor-plugin`, `.agents/skills/prisma-database-setup-postgresql/`) · `prisma-orm-v7-skills` (`gocallum/nextjs16-agent-skills`, `.agents/skills/prisma-orm-v7-skills/`)

`infra-postgres` is a reference for local PostgreSQL operating concerns only. Its `clickhousectl` workflow is not part of this build because it does not satisfy the confirmed Compose, database, role, and command contracts.

## Feature design

### Database topology

| Database | Data source | Roles | Lifecycle | Purpose |
| --- | --- | --- | --- | --- |
| `feline_blog_dev` | ordered working tree migrations plus optional staging refresh | `app_runtime`, `app_migrator`, `local_admin` | persists in the named volume | application reads and writes, migration development |
| `feline_blog_shadow` | Prisma managed | `app_migrator`, `local_admin` | Prisma may clear it at any time | drift detection for `migrate dev` |
| `feline_blog_verify` | ordered working tree migrations only | `app_migrator`, `local_admin` | recreated for verification | replay migration history from empty |
| `feline_blog_refresh_<run-id>` | migrations plus streamed staging data | `local_admin`, then normal grants | temporary | build and verify a replacement dev database |
| Supabase staging | remote authoritative staging data | remote runtime, migrator, `app_exporter` | persistent remote environment | staging runtime, migration deploy, read only export |

No Prisma business model changes are required. The existing PostgreSQL schema and `prisma/postgres/migrations` remain the schema source of truth.

### Environment and privilege contract

#### Local role matrix

| Role | Attributes | Database access | Schema and object rights |
| --- | --- | --- | --- |
| `local_admin` | `LOGIN SUPERUSER CREATEDB CREATEROLE`, no remote use | maintenance, dev, shadow, verify, owned temporary databases | bootstrap, reconcile, refresh, rename, recover, destroy |
| `app_migrator` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT` | `CONNECT` on dev, shadow, verify only | owns `public` and migration created application objects in those databases |
| `app_runtime` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT` | `CONNECT` on dev only | `USAGE` on `public`, application table DML, sequence `USAGE` and `SELECT` |

`local_admin` owns each database. `app_migrator` owns the application schema and every migration created application object. Revoke `PUBLIC CONNECT` on dev, shadow, verify, and every refresh or retained database. Grant database connect only to the roles named in the matrix. Revoke `PUBLIC CREATE` on every application schema. Revoke all application object privileges from `PUBLIC`. Set default privileges for objects created by `app_migrator`, not for the setup session, so runtime grants continue to apply after later migrations.

On staging, `app_exporter` is `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. It receives `CONNECT`, application schema `USAGE`, application table `SELECT`, `_prisma_migrations` `SELECT`, and owned sequence `SELECT`. It never receives sequence `USAGE` or `UPDATE`, so it cannot call `nextval` or `setval`. Default read privileges are created for the staging migration object owner.

Role setup repairs passwords, missing grants, default privileges, and grants that exceed this matrix. It refuses unknown role membership, unexpected database or schema owners, objects owned by an unknown role, or an existing role with stronger attributes. It never reassigns unknown ownership automatically. `db:local:setup` preserves application rows and does not apply migrations. The migrate command owns schema application.

#### Environment matrix

| Command class | Allowed files | Process only inputs | Rejected inputs |
| --- | --- | --- | --- |
| local runtime | `.env.development` | none | any staging URL, admin URL, protected key in an alternate Next.js environment file |
| local setup and status | `.env.development`, `.env.shadow` | none | remote host, unknown database, inherited protected key |
| local migrate and verify | `.env.development`, `.env.shadow` | migration name and allowlisted Prisma flags | staging file, unknown Prisma flag, noninteractive destructive acceptance |
| sensitive refresh | `.env.development`, `.env.shadow`, `.env.staging` parsed separately | copy gate, trusted workstation assertion | CI or Preview marker, shared or remote Docker context, saved gate, merged environment |
| staging status | `.env.staging` | none | local target, pooler endpoint, weak TLS, mismatched project |
| staging deploy | `.env.staging` | migration write gate | local target, pooler endpoint, development Prisma subcommand, saved gate |
| staging exporter setup | `.env.staging` | role setup write gate and optional explicit rotation | local target, pooler endpoint, inherited admin URL |

The committed `config/database-env.schema.json` is the authoritative protected key list. It includes `DATABASE_URL`, every `POSTGRES_*` key, every legacy database URL and credential key, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSERVICE`, `PGSERVICEFILE`, `PGPASSFILE`, `PGSSLMODE`, `PGSSLROOTCERT`, Compose identity keys, project refs, and every write gate. Unknown future `POSTGRES_*` or `PG*` keys are protected by prefix. The launcher rejects inherited protected keys before parsing files. It passes through ordinary Node and Next.js variables, then creates the child protected set only from validated file values and the command's named process gates. Process only gates are rejected if they appear inside any environment file.

Sensitive refresh rejects `CI`, `GITHUB_ACTIONS`, `VERCEL`, and any `VERCEL_ENV`. It also requires `STAGING_DATA_COPY_TRUSTED_WORKSTATION=feline-blog-local-sensitive-copy` in the current process and a local Docker context. Ordinary local setup and the disposable Docker integration test may run in CI because they never load staging configuration or data.

#### Target names and cluster identity

| Operation | Allowed database names |
| --- | --- |
| application and `migrate dev` | exactly `feline_blog_dev` |
| Prisma shadow | exactly `feline_blog_shadow` |
| replay verification | exactly `feline_blog_verify` |
| administration | exactly `postgres` |
| refresh candidate | `feline_blog_refresh_<32 lowercase hex characters>` recorded in the ledger |
| retained previous copy | `feline_blog_previous_<same run id>` recorded in the ledger |
| Docker integration test | `feline_blog_test_<32 lowercase hex characters>` under a unique test project label |

All local URLs must resolve to the same PostgreSQL cluster fingerprint, derived from `system_identifier`, server address, server port, and committed Compose labels. Their database names and login roles must match this table. Staging export, role setup, and migration require the direct endpoint `db.<project-ref>.supabase.co:5432`, the exact committed project ref and database name, an allowlisted URL parameter set, verified TLS, and post connection checks of `current_database()` and `current_user`. Changing the committed project ref requires an ordinary reviewed repository change.

#### Lifecycle and database locks

Every command that can start, stop, configure, migrate, refresh, recover, or destroy local resources first acquires an atomic host lifecycle lock keyed by the normalized Docker endpoint and Compose project. On Windows it lives below `%LOCALAPPDATA%/feline-blog/locks/`. On other systems it lives below the matching per user application state directory. The record contains process creation identity, owner token, Docker endpoint, project, worktree, operation, and heartbeat. PID reuse is rejected by comparing creation identity. A command never breaks an uncertain lock automatically.

Once PostgreSQL is reachable, setup, migrate, refresh, and recover also acquire the maintenance database advisory lock and inspect incomplete ledger rows before doing new work. Staging deploy and exporter role setup use their own staging advisory lock. Down and destroy retain the host lifecycle lock after PostgreSQL becomes unreachable. A lifecycle command releases its host lock only after every recorded Docker child stops and resource inspection reaches a final state.

### State transitions

```text
local service: absent -> starting -> healthy -> stopped -> healthy
local volume: absent -> initialized -> retained -> explicitly destroyed
refresh: planned -> candidate created -> migrated -> restored -> validated -> fence intent -> both fenced -> old rename intent -> old renamed -> candidate rename intent -> candidate renamed -> smoke passed -> committed -> cleanup intent -> cleanup pending -> complete
refresh before commit failure: current dev restored or unchanged -> fence removed -> candidate retained for proven cleanup
refresh after commit cleanup failure: new dev remains authoritative -> cleanup pending -> complete
database operation: advisory lock free -> lock and ledger owned -> child processes stopped -> lock released
```

Local mutating commands acquire a cluster scoped PostgreSQL advisory lock in the maintenance database. The persistent ledger records operation, database OIDs, generated names, repository identity, worktree path, Compose project, process creation time, random owner token, child process identifiers, Docker container identifiers, fence state, start time, heartbeat, and last completed state. This serializes worktrees that share the same Compose project. PID absence alone never proves safety. A recovery command verifies the ledger, database OIDs, Docker child state, and owner token before it changes anything. Ambiguous ownership fails with exact manual inspection commands.

The connection fence keeps `PUBLIC CONNECT` revoked and revokes explicit `CONNECT` from `app_runtime` and `app_migrator` on both the current dev database and the candidate. It then checks `pg_stat_activity` from the maintenance connection. Every nonadmin session, including idle pooled sessions, blocks the switch. The command does not terminate them. After a zero session second check, it performs the rename sequence while both databases remain closed to nonadmin connections. The controlled smoke check runs as `local_admin SET ROLE app_runtime`, verifies the exact database identity and migration state, runs `SELECT ... LIMIT 0` for every application table, and performs a `PostgresConnectionProbe` create, read, update, and delete inside a rolled back transaction. Only commit restores the documented connect grants on the new dev. Completed rollback restores them only on the old dev.

Before every fence, rename, admission change, rollback rename, or cleanup statement, write and commit an intent row containing the expected OID and name mapping. After the statement, write the observed result. Recovery never trusts the last completed state alone. It queries current database OIDs, names, grants, sessions, and Docker children, then reconciles them against the latest intent. The commit point is the durable `smoke_passed` result after the new database has the canonical name and the old database remains under its recorded previous name. Failures before that point must restore the old canonical name and connection grants. Failures after it do not roll back a successfully checked database. They retain the previous database and report cleanup pending.

#### Refresh recovery table

| Last durable state | Recovery action |
| --- | --- |
| `planned` through `validated` | reconcile actual OIDs, keep current dev, remove only the ledger owned candidate after child processes are stopped |
| fence intent or result | inspect grants and sessions on both OIDs, keep or restore the old dev admission, then clean the candidate |
| old rename intent or result | inspect whether the old OID has the canonical or previous name, restore it to canonical when the new OID is not committed, retain candidate for inspection |
| candidate rename intent or result | inspect both OIDs and names, keep both fenced, run the controlled smoke check when the candidate has the canonical name, otherwise restore the old OID |
| `smoke_passed` or `committed` | keep the new canonical dev, restore its grants, retain old until cleanup succeeds |
| cleanup intent or `cleanup_pending` | verify canonical and previous OIDs, never drop canonical, then remove only the recorded previous database |

Each database rename is a separate guarded statement from the maintenance connection. The Docker integration suite must confirm the pinned PostgreSQL version's actual transaction restriction and inject process death both before a statement and after SQL completion but before its result is recorded. It must cover forward rename, rollback rename, admission restoration, and cleanup windows. No recovery branch drops the only database that passes the smoke check.

### Command surface

| Command | Key inputs | Key outputs | Database writes | Key failures |
| --- | --- | --- | --- | --- |
| `pnpm db:local:up` | `.env.development`, pinned image tag | container and health state | container startup only | Docker unavailable, port occupied, unhealthy server |
| `pnpm db:local:setup` | `.env.development`, `.env.shadow` | created or reconciled roles and empty databases | local roles, grants, databases, tool ledger | non local target, unknown ownership, lock held, privilege failure |
| `pnpm db:local:migrate -- --name <name>` | schema change, migration name | migration directory, generated client, replay result | dev, shadow, verify | drift, destructive prompt declined, replay failure |
| `pnpm db:local:refresh` | three isolated config objects, copy and workstation gates | snapshot manifest, per table row counts, recovery state, switched local target | ledger owned local databases only | CI or Preview, wrong source, wrong target, unsupported object, schema drift, restore failure, active connections |
| `pnpm db:local:recover` | operation id or current incomplete ledger row | chosen recovery branch and final state | recorded local resources only | ambiguous ownership, live child process, OID mismatch |
| `pnpm db:local:status` | local files | structured redacted identity, Docker and SQL readiness, effective privileges, migrations, ledger state | none | Docker unavailable, configuration invalid |
| `pnpm db:local:down` | Compose project identity | stopped state | none, volume retained | wrong Compose project |
| `pnpm db:local:destroy` | destroy flag, typed collection name | removed container and volume names | destroys local volume | confirmation mismatch, active operation |
| `pnpm db:local:test` | Docker, example derived test config | isolation and protection results | disposable test Compose project only | Docker unavailable, isolation failure |
| `pnpm db:staging:exporter:setup` | `.env.staging`, admin URL, role setup gate, optional `--rotate` | exporter created, repaired, or verified | staging role and grants only | RLS, executable app function, unknown owner, project mismatch |
| `pnpm db:staging:exporter:verify` | `.env.staging`, exporter URL | structured effective privilege result | none | effective write path, incomplete read scope, project mismatch |
| `pnpm db:staging:status` | `.env.staging`, committed allowlist | structured redacted identity, SQL readiness, effective privileges, migration names and checksums | none | CA failure, project mismatch, credential failure |
| `pnpm db:staging:deploy` | `.env.staging`, committed allowlist, write flag | applied migration names and final status | staging schema only | missing flag, project mismatch, failed migration |
| deprecated aliases | original arguments | warning plus canonical command output | same as canonical target | unsafe legacy intent, unsupported argument |

No browser or HTTP API is added. These commands are the feature interface.

`db:local:migrate` accepts exactly `--name <migration-name>`. The name must be 1 to 64 lowercase ASCII characters, digits, or single hyphens, with no leading, trailing, or repeated hyphen. The wrapper owns Prisma config, schema, datasource, shadow URL, generation, replay, and status arguments. It rejects `--create-only`, `--url`, `--schema`, `--config`, destructive acceptance flags, unknown flags, positional arguments, and a second `--name` before Prisma starts.

### Value sourcing

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| choose local image | pinned PostgreSQL major, tag, and digest | staging `SHOW server_version`, registry digest resolved during implementation, committed image record |
| bootstrap local service | three role credentials | cryptographic random 32 byte generation before first Compose startup, saved only in designated ignored files |
| classify local target | local or rejected | parsed URL host, port, database, role, `POSTGRES_ENVIRONMENT`, committed local allowlist |
| classify staging target | allowed project or rejected | parsed Supabase tenant, database name, TLS state, committed staging project ref and database allowlist |
| configure Prisma development | migration and shadow URLs | separately parsed `.env.development` and `.env.shadow` |
| report migration drift | missing, extra, failed, or pending migration names | local migration directories and `_prisma_migrations` on the selected database |
| create staging export | table data stream | consistent `pg_dump` snapshot through `app_exporter` |
| select copied tables | all application tables | PostgreSQL catalog minus `_prisma_migrations` and the tool metadata schema |
| verify copied data | source and target row counts | catalog discovered application tables and `COUNT(*)` on each side |
| decide refresh switch | allowed or rejected | snapshot manifest result, active connection query, maintenance ledger, advisory lock ownership |
| serialize lifecycle | lock acquired or rejected | normalized Docker endpoint, committed Compose project, per user host lock record, process creation identity |
| redact status | environment, host class, port, database, role class | parsed configuration after removing password, query secrets, CA, and full URL |
| report capabilities | effective grants or `unknown` | catalog role and membership rows plus PostgreSQL `has_*_privilege` checks as the documented inspection role |
| permit staging migration | allowed or rejected | current process flag, `.env.staging`, target allowlist, CA verification, command allowlist |
| permit local destruction | allowed or rejected | current process flag, exact committed confirmation string, local Docker context, resource labels, mounts, advisory lock |

### Export and restore contract

The supported application inventory is every ordinary table with `relkind = 'r'` in schema `public`, except `_prisma_migrations`. Source and migrated target inventories must match exactly before the dump starts. The command refuses partitioned tables, foreign tables, materialized views, large objects, application row level security, and application owned extensions until a later spec defines their copy semantics. It also refuses any effective `EXECUTE` privilege that lets `app_exporter` call an application schema function. This is deliberate fail closed behavior, not silent omission.

The source connection begins a read only repeatable read transaction and calls `pg_export_snapshot()`. It discovers the inventory and computes all source row counts while that transaction remains open. The dump receives the exported snapshot identifier. Target counts compare with this captured manifest, never with a later live staging query.

The tools container receives source and target credentials in separate generated Docker environment files, the staging CA as a read only temporary mount, no TTY, and no host shell interpolation. Those temporary inputs use restricted permissions where the host supports them and are removed after every exit path. The Node orchestrator connects stdout to stdin as binary streams with backpressure, aggregates both child exit states, treats a broken pipe or timeout as failure, sends termination to every recorded child on cancellation, and waits for Docker to confirm they stopped before recovery or lock release.

Restore uses this algorithm:

1. Create the ledger owned candidate database and apply every ordered PostgreSQL migration directory present in the working tree.
2. Compare local migration file checksums with staging `_prisma_migrations`. Require matching applied names, matching checksums, non null completion, no rollback marker, and no failed row. Use Prisma schema diff to prove the candidate and staging application schemas are compatible before data export.
3. Require all candidate application tables to be empty after migrations. If migration SQL left seed rows, truncate the supported application inventory in the candidate because staging is the chosen complete data source.
4. Capture each candidate foreign key name and `pg_get_constraintdef` definition, then drop those foreign keys. Refuse user defined application triggers. Keep check, unique, exclusion, and not null constraints active during restore.
5. Run custom format, data only `pg_dump` with explicit table selections, snapshot, no owner, and no ACL. Stream to single worker `pg_restore` as `local_admin` inside one target transaction. Never restore schema, ownership, grants, comments, security labels, or `_prisma_migrations`.
6. Recreate every captured foreign key from its exact migrated definition. PostgreSQL validates existing rows while adding it. Any validation failure rejects the candidate.
7. Discover sequences owned by supported table columns through catalog dependencies. Do not copy staging sequence state because sequence changes do not share the table snapshot. Set each target sequence from the restored column maximum with the correct empty table `is_called` state, then run a rolled back insert probe for every generated key path to prove no collision.
8. Compare every target table row count with the snapshot manifest, run Prisma schema diff against the clean verify database, then proceed to the fenced switch.

### Status and error contract

Every status command emits JSON by default and a human table when `--human` is present. Stable fields are `environment`, `targetClass`, `redactedHost`, `port`, `database`, `roleClass`, `dockerContextClass`, `containerState`, `dockerHealth`, `sqlReady`, `tlsMode`, `effectiveCapabilities`, `migrationState`, `migrationNames`, `migrationChecksums`, `operationState`, and `recoveryRequired`.

Stable failures use an allowlisted code and summary, such as `CONFIG_CONFLICT`, `TARGET_REJECTED`, `DOCKER_UNAVAILABLE`, `ROLE_MISMATCH`, `MIGRATION_DRIFT`, `SNAPSHOT_FAILED`, `RESTORE_FAILED`, `ACTIVE_CONNECTIONS`, `RECOVERY_REQUIRED`, or `OWNERSHIP_AMBIGUOUS`. Raw `psql`, `pg_dump`, `pg_restore`, Prisma, Docker, and database messages are never relayed because constraint errors can contain copied row values. The command may report the child name, exit code, failing phase, and safe object identifier after validating that identifier against the discovered inventory.

Container state and health come from `docker compose ps --format json` plus `docker inspect` of the expected labeled container. SQL readiness comes from a five second timed identity query that returns `current_database()`, `current_user`, server address, server port, `system_identifier`, and version. Effective capabilities come from catalog role attributes and memberships plus `has_database_privilege`, `has_schema_privilege`, `has_table_privilege`, `has_sequence_privilege`, and function privilege checks against the discovered inventory. Local infrastructure status connects as `local_admin` and separately verifies runtime and migrator login targets. Staging status uses the migration URL for migration state and the exporter URL for export capability. Any field that cannot be inspected is `unknown`, never an inferred denial or success.

### Compatibility mapping

| Existing command | New behavior |
| --- | --- |
| `postgres:migrate:dev` | warning alias to `db:local:migrate` with only the canonical argument allowlist |
| `postgres:migrate:deploy` | fail closed stub that points to guarded `db:staging:deploy` |
| `postgres:migrate:status` | warning alias to `db:local:status` migration fields |
| `db:check:postgres` | warning alias to `db:local:status` |
| `db:audit:postgres` | warning alias to `db:local:status --audit` |
| `db:configure:postgres-roles` | fail closed stub that points to local setup or staging exporter setup |
| `db:verify:postgres-roles` | warning alias to local status role checks unless an explicit staging file selects exporter verify |
| `db:smoke:postgres` | fail closed stub that points to `db:local:test` or the refresh smoke phase |
| `prisma:validate:postgres`, `prisma:generate:postgres` | remain offline and never load a database environment file |
| `db:migrate:data:dry-run`, `db:migrate:data:apply`, `db:migrate:data:verify` | remain explicit legacy MySQL migration tools, parse legacy source from `.env.development` and staging target from `.env.staging`, require the staging allowlist, and never enter the canonical local dispatcher |

Unsupported old arguments fail with migration guidance. They are never forwarded to Prisma or a shell.

### Key invariants

- `pnpm dev` never reads `.env.staging` and never falls back to a remote database.
- `migrate dev` always targets `feline_blog_dev` and always receives `feline_blog_shadow` as its separate shadow URL.
- Destructive replay always targets `feline_blog_verify` or a tool owned temporary database, never dev or staging.
- No command infers a safe target only from `POSTGRES_ENVIRONMENT`. It also verifies network location, exact database name, role class, and the committed allowlist.
- Staging export can read supported application tables, `_prisma_migrations`, and sequence metadata required for inspection, but cannot call `nextval`, call `setval`, insert, update, delete, create, alter, truncate, or drop.
- The refresh copy includes every application table, including `Session` and `VerificationToken`. It does not copy migration or tool metadata.
- A refresh never writes to staging and never creates a persistent dump file.
- A failed pre switch refresh leaves the current dev database unchanged.
- Status and error output never expose credentials, certificate contents, connection strings, password hashes, tokens, or copied row values.
- PostgreSQL generation and validation remain usable without any database credential.

### Security model

- `app_runtime` receives only the application DML and sequence permissions needed by the existing runtime.
- `app_migrator` owns local application schema changes but cannot create roles or databases. Default privileges are installed for this object creator.
- `local_admin` is confined to loopback local tooling and never appears in application runtime configuration.
- Staging `app_exporter` has the exact rights in the role matrix. Setup audits inherited roles, `PUBLIC`, row level security, and executable application functions. Any effective indirect write or incomplete read scope fails verification.
- Creating or repairing `app_exporter` uses `db:staging:exporter:setup`, an admin URL, the committed allowlist, and `STAGING_ROLE_SETUP_ALLOW_WRITE=true`. First creation and explicit `--rotate` generate a random 32 byte password and update only ignored `.env.staging` without printing the password or URL. Routine setup verifies and repairs grants without rotating credentials.
- `db:staging:deploy` may execute only reviewed SQL from committed migration directories. That SQL may contain deliberate data backfills as well as DDL. The command does not promise schema only writes, and it cannot run arbitrary SQL or application data commands.
- Local plaintext PostgreSQL is allowed only on loopback or the private Compose network. Staging and every other remote host require verified TLS and the configured CA.
- Because refresh copies password hashes, sessions, verification tokens, and user content, the Docker volume is sensitive. It must not run on CI, Preview, a shared host, or an untrusted workstation.
- The local JWT secret remains local. The refresh copies database rows, not staging environment secrets.

### Configuration required

- `.env.development`: local runtime URL, local migration URL, local environment marker, local Compose credentials, configurable loopback port.
- `.env.shadow`: local shadow URL, verify URL, local admin URL, Compose project identity.
- `.env.staging`: direct staging runtime URL where still required, direct migration URL, direct exporter URL, direct admin URL for explicit role setup, CA, and non secret expected environment marker.
- `config/database-targets.json`: exact local host classes and database names, Compose project identity, allowed staging Supabase project ref, and staging database name.
- `STAGING_DATA_COPY_ALLOW`: current process only switch for a staging data export. A saved value in `.env.staging` is rejected.
- `STAGING_DATA_COPY_TRUSTED_WORKSTATION`: current process only exact value `feline-blog-local-sensitive-copy` for a sensitive local replica.
- `STAGING_MIGRATION_ALLOW_WRITE`: current process only switch for staging `migrate deploy`. A saved value in `.env.staging` is rejected.
- `STAGING_ROLE_SETUP_ALLOW_WRITE`: current process only switch for staging exporter role creation or repair.
- `LOCAL_DATABASE_DESTROY_ALLOW`: current process only switch for local volume destruction.

The example files use placeholders and safe local defaults. They never contain the actual staging project ref if the project treats it as private, credentials, CA contents, JWT secrets, or copied data.

### Critical test scenarios

- Local happy path: start, set up, run the app, create a named migration, regenerate the client, and replay all migrations in verify, verifies **AC-1**, **AC-2**, **AC-3**.
- Refresh happy path: export through `app_exporter`, build a temporary database, compare all application table row counts, switch with no active connections, and leave no dump, verifies **AC-4**, **AC-5**, **AC-6**.
- Wrong source: change the staging URL to another Supabase project while leaving the environment marker as staging, then confirm refresh and deploy reject it, verifies **AC-4**, **AC-7**.
- Wrong target: point a local command at a remote host or a database other than the committed local names, then confirm it rejects before opening a mutating session, verifies **AC-4**, **AC-7**.
- Schema drift: add a migration name on only one side and confirm refresh lists the mismatch and performs no dump or local switch, verifies **AC-5**, **AC-6**.
- Restore failure: interrupt `pg_restore` and confirm the current dev database remains available and only the owned temporary database is eligible for cleanup, verifies **AC-6**.
- Snapshot race: in the disposable Docker harness, mutate a local source fixture after snapshot export and confirm source manifest, dump, and target counts remain consistent with the exported snapshot, verifies **AC-5**.
- Restore integrity: copy cyclic foreign keys, empty and advanced sequences, migration inserted seed rows, and an unsupported trigger fixture. Confirm supported data validates and unsupported objects fail before switching, verifies **AC-5**, **AC-6**.
- Active application: keep a dev connection open and confirm refresh refuses the switch without terminating it, verifies **AC-6**.
- Reconnect race: attempt runtime reconnects after the fence and confirm none enter before the commit or rollback branch restores admission, verifies **AC-6**.
- Crash recovery: terminate the orchestrator after every durable ledger state and confirm `db:local:recover` follows the recovery table without losing the only viable database, verifies **AC-6**, **AC-12**.
- Privilege boundary: prove runtime cannot create schema, migrator cannot create database or role, and exporter cannot write any staging application table, verifies **AC-1**, **AC-7**.
- Redaction: inject recognizable secrets into every URL and CA field and confirm status, errors, and test output contain none of them, verifies **AC-8**.
- Lifecycle: stop and restart with data retained, then destroy with missing and valid confirmations, verifies **AC-9**.
- Offline unit suite: run `pnpm test` without Docker and without database credentials, verifies **AC-10**, **AC-11**, **AC-12**.
- Docker integration suite: run the disposable project twice and confirm idempotent setup, isolated roles and databases, and no staging network access, verifies **AC-1**, **AC-3**, **AC-12**.
- Shared worktrees: start conflicting operations from two worktrees against one Compose project and confirm the maintenance database lock serializes them, verifies **AC-4**, **AC-6**, **AC-12**.

## Build plan

The Tracer Bullet order first proves one real local application and migration path. Later slices add staging copy, remote deployment, compatibility, and broader failure coverage without returning daily development to staging.

1. Resolve and commit the staging compatible immutable PostgreSQL image. Add the single service Compose project, owned volume labels, loopback port, health check, pre startup credential generation, safe examples, protected key schema, rejecting environment launcher, shared host lifecycle lock, maintenance ledger and advisory lock, exact privilege matrix, and `db:local:up`, `db:local:setup`, and `db:local:status`. Update runtime TLS selection so only a verified local cluster may omit TLS. Switch `pnpm dev` to the validated local runtime and prove one existing authenticated read and write, satisfies **AC-1**, **AC-2**, **AC-8**, **AC-10**.
2. Remove implicit default dotenv loading from the PostgreSQL Prisma config. Add `db:local:migrate` with only the validated `--name` input, dev and shadow isolation, explicit Prisma 7 client generation, working tree migration checksums, empty verify replay, schema diff, structured status, and failure propagation, satisfies **AC-3**, **AC-8**.
3. Add guarded staging exporter setup and verification. Build the refresh source manifest and restore algorithm with a shared snapshot, explicit supported inventory, pinned tools container, binary streaming, foreign key reconstruction, sequence repair, row counts, and sanitized process handling, satisfies **AC-4**, **AC-5**, **AC-7**, **AC-8**.
4. Add the two database connection fence, intent before side effect OID ledger, guarded rename state machine, commit point, controlled runtime smoke check, cleanup policy, and `db:local:recover`. Prove every pre statement and post statement crash window before allowing the refresh command to replace dev, satisfies **AC-4**, **AC-6**, **AC-8**.
5. Add `db:staging:status` and `db:staging:deploy`. Require the direct allowlisted staging identity, actual connected role checks, verified TLS, process only deployment gate, migration checksum reporting, and rejection of every development or destructive Prisma subcommand on staging, satisfies **AC-7**, **AC-8**.
6. Add `db:local:down` and guarded `db:local:destroy`. Verify Docker context, labels, mounts, and exact confirmation. Implement the complete compatibility mapping, update database documentation, and remove wording that says daily development uses staging, satisfies **AC-9**, **AC-10**, **AC-11**.
7. Add offline unit tests for every parser, environment override, classifier, allowlist, gate, lock, ledger transition, redactor, safe error mapper, argument forwarder, and compatibility entry. Add the unique internal Compose harness for roles, migrations, snapshot concurrency, cyclic foreign keys, seeds, sequences, connection races, process death, shared worktrees, persistence, and destruction without staging access, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-12**.

## Migration plan

**Strategy**: Strangler migration of development commands. The new local path runs beside the old names until it proves the complete application and migration loop. Old names become aliases, not independent implementations.

**Phases**:

1. Add Compose, local configuration, setup, status, and migration commands without changing staging data or roles.
2. Prove existing application reads and writes plus full migration replay locally, then make `.env.development` local and route `pnpm dev` to it.
3. Create and verify staging `app_exporter`, then enable the guarded refresh command.
4. Add guarded staging status and deploy commands, convert safe old names to aliases, and retire any command whose meaning was an implicit staging development operation.

**Rollback**: Before the local runtime cutover, remove the new Compose resources and commands. After cutover, revert the command and configuration commit only for diagnosis. Do not resume ordinary staging writes as a standing fallback. The remote staging database is never changed by local setup or refresh, and the local volume can be destroyed independently.

**Risks**:

- The local volume contains staging user content and authentication state. A lost or shared workstation becomes a staging data exposure.
- PostgreSQL tool version differences can break dump restore. Pinning the staging major reduces but does not remove extension or patch level differences.
- Database rename spans multiple guarded statements and process failure can occur between them. The durable OID ledger and recovery table remain required even if the pinned PostgreSQL version allows an individual rename inside a transaction.
- A future table with unusual large objects or extension owned data may need an explicit export rule. The catalog based selection and Docker integration test must fail visibly rather than silently omit it.

## Consequences

**Positive**:

- Ordinary development and migration creation stop touching staging.
- Prisma shadow work and from empty verification cannot destroy development data.
- Staging access becomes explicit, target checked, least privilege, and auditable from command output.
- The local environment is reproducible across developer machines without requiring a host PostgreSQL install.

**Negative and tradeoffs**:

- Docker becomes a development prerequisite and consumes disk and memory.
- The developer machine stores a sensitive copy of staging, including sessions and verification tokens.
- Three databases, three local roles, an exporter role, command locks, and guarded refresh logic add maintenance cost.
- Refresh is slower than using staging directly and requires the application to release active database connections before switching.
- Row count comparison proves coverage at a coarse level, not byte exact equality. This is the accepted validation limit.

**Neutral**:

- The local database does not use TLS because it is limited to loopback and the private Compose network. Remote TLS rules remain unchanged.
- Existing migration files and generated client locations do not change.
- Legacy MySQL remains outside this decision and keeps its current explicit migration and audit boundary.

## Follow-up

- [ ] `docker-compose-orchestration` conventions are not yet in root `AGENTS.md`. Their project wide local infrastructure rules belong at root level.
- [ ] `infra-postgres` conventions are not yet in root `AGENTS.md`. Record only the applicable Docker readiness and local data lifecycle guidance, and explicitly state that this project does not use its `clickhousectl` workflow.
- [ ] `prisma-cli-migrate-dev` conventions are not yet in `prisma/AGENTS.md`. Its Prisma 7 development migration rules belong with the Prisma area guidance.
- [ ] `prisma-cli-migrate-deploy` conventions are not yet in `prisma/AGENTS.md`. Its staging deployment rules belong with the Prisma area guidance.
- [ ] `prisma-cli-migrate-status` conventions are not yet in `prisma/AGENTS.md`. Its migration status behavior belongs with the Prisma area guidance.
- [ ] `prisma-database-setup-postgresql` conventions are not yet in `prisma/AGENTS.md`. Its PostgreSQL connection and adapter rules belong with the Prisma area guidance.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
