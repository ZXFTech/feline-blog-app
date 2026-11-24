# 0009. Local PostgreSQL development and migration isolation rationale

## Context

> ⚠️ Premise note: copying all staging rows, including sessions, verification tokens, password hashes, and user content, turns the developer workstation into a sensitive staging data location. Command isolation reduces accidental remote writes, but it does not make the copied data low risk. The right framing is a controlled local staging replica that must be explicitly created and destroyed, not disposable sample data.

The application runtime and every business module now use Supabase PostgreSQL staging. The same `.env.development` currently feeds the app, Prisma migration commands, database audits, smoke tests, role configuration, and legacy data migration tools. Daily development can therefore write remote staging data, and a command name alone does not prove which environment it will touch.

Prisma development migrations require two distinct roles for databases. The development database receives the migration, while a separate shadow database is repeatedly cleared and replayed for drift detection. A further from empty verification target is needed because using the Prisma shadow database for unrelated reset checks creates ownership and concurrency ambiguity.

The repository already has separate PostgreSQL schema, migrations, generated client, verified remote TLS, runtime and migrator roles, and target comparison helpers. The decision should strengthen those assets rather than replace the PostgreSQL stack. The result must work on Windows, keep ordinary tests offline, preserve legacy MySQL boundaries, and avoid persistent dump files.

## Options considered

### Option 1: Fix in place with Docker Compose and guarded commands

Keep the current Prisma schema, migrations, client, runtime adapter, and Supabase staging. Add one local PostgreSQL Compose service, explicit environment loaders, local database roles, canonical local and staging commands, and safe aliases during cutover.

**Pros**:

- Reuses the working PostgreSQL and Prisma 7 design.
- Gives the project exact control over three databases, roles, ports, volume identity, and health checks.
- Allows a gradual command cutover with no staging data migration.

**Cons**:

- Adds Docker, Compose configuration, orchestration scripts, and local disk use.
- Requires the team to maintain target guards and sensitive local data lifecycle rules.

### Option 2: Keep staging as the development database and add stronger checks

Continue using Supabase staging for daily development, but add project identity checks, role restrictions, and more explicit command names.

**Pros**:

- Requires little local infrastructure and always uses current staging data.
- Avoids copying sensitive data to another database.

**Cons**:

- Ordinary development still changes shared remote data.
- Network outages and latency remain part of the inner development loop.
- Destructive migration validation cannot safely use the shared target.

### Option 3: Use the Supabase local stack

Run the full Supabase development stack and use its local database and management commands.

**Pros**:

- Closely resembles Supabase managed services if local Auth, Storage, Realtime, or Data API later become required.
- Provides an established local reset workflow.

**Cons**:

- The application currently uses custom JWT authentication and has Data API disabled, so most services would be idle complexity.
- It still needs project specific role, three database, refresh, and command protection work.

### Option 4: Replace the workflow directly with a generic local PostgreSQL manager

Use a host PostgreSQL install or a helper such as `clickhousectl` to create a local instance, then point Prisma and the application at it.

**Pros**:

- A helper can provide quick instance creation, automatic ports, generated passwords, and a bundled `psql` client.
- A host install avoids a repository Compose file.

**Cons**:

- Generic instance lifecycle does not express the confirmed three databases, three roles, fixed project identity, and safe command surface.
- Host installation differs across Windows and other developer machines.
- Direct replacement would remove the current command path before the new isolation contract is proven.

## Rationale

Option 1 solves the actual failure mode with the least architectural change. The runtime is already PostgreSQL, Prisma migrations already exist, and the repository already enforces a split between runtime and migration credentials. A single pinned container makes the missing local boundary reproducible while TypeScript orchestration keeps Windows behavior consistent.

Three databases are deliberate. Prisma owns the shadow database and may clear it. The verify database proves migration history from empty. Keeping those duties away from the developer data prevents a safety control from becoming another destructive path.

The gradual command cutover is safer than replacing every command at once. A thin local application and migration path can be proven first. The old names then become aliases over the same protected implementation, so there is only one target selection policy to maintain.

The full staging copy is the engineer's explicit choice. The design compensates with a read only exporter, no persistent dump, non CI enforcement, committed project identity, a temporary restore target, active connection refusal, and explicit destruction. A sanitized seed would have been safer, but it would not satisfy the chosen local data fidelity.

## 2026-10-25 private RLS copy decision

Spec 0016 added RLS protected drafts and publication receipts. The earlier blanket refusal of application RLS correctly stopped snapshot restore rather than silently omitting private rows. The engineer explicitly authorized copying both tables, retaining RLS, and continuing implementation and verification.

Fixing the existing snapshot path preserves the established whole database replacement and recovery contract. A second export pipeline or a direct replacement of the refresh tool would duplicate locks, credentials and recovery for just two tables. Excluding private rows would reduce local exposure but would contradict the chosen complete local reproduction. Giving the exporter BYPASSRLS would simplify pg_dump but extend its privilege to future private tables without another decision.

Named SELECT policies on exactly these tables preserve the separate read only exporter and make the expanded access reviewable. Policy catalog checks are required because matching row counts alone cannot detect the same source filter being applied to both counting and dumping. Role setup owns these environment specific policies so it also supports a role created after migrations without changing migration checksums. Private content now joins the sensitive local volume; whole database refresh replaces local unpublished work rather than merging it.

An independent read only design review found no unrecorded data scope or value sources. It identified two concurrency clarifications and an ownership verification check. The contract now fixes lock acquisition before snapshot evidence, shares the existing staging management lock through source export, and separately verifies object ownership even when the exporter revoked its own DML. Direct privileged administration remains a trusted boundary. These refine the chosen mechanism without extending the authorized copy scope.
