import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { targets } from "./config";
import { DatabaseToolError } from "./errors";
import { localDestroy } from "./local";
import { createInactivityTimeout, inventory, recoverOperation } from "./refresh";
import {
  applyDesiredMigratorTimeouts,
  assertEffectiveMigrationTimeouts,
  configureStagingMigratorTimeouts,
  assertExporterSafety,
  deployStaging,
  grantExporterReadAccess,
  readRoleTimeoutCatalog,
  restoreMigratorTimeouts,
  rollbackStagingMigratorTimeouts,
  setupStagingExporter,
  stagingTls,
  verifiedPrismaMigrationUrl,
  withMonitoredStagingLock,
  withStagingLock,
} from "./staging";

interface FakeResult {
  rows: unknown[];
  rowCount?: number;
}

type DatabaseClient = Parameters<typeof inventory>[0];

function fakeClient(
  handler: (sql: string, values: readonly unknown[] | undefined) => FakeResult | Promise<FakeResult>
): DatabaseClient {
  return {
    query: vi.fn(async (sql: string, values?: readonly unknown[]) => await handler(sql, values)),
    end: vi.fn(async () => undefined),
  } as unknown as DatabaseClient;
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.LOCAL_DATABASE_DESTROY_ALLOW;
  delete process.env.STAGING_MIGRATION_ALLOW_WRITE;
  delete process.env.STAGING_MIGRATOR_TIMEOUTS_ALLOW_WRITE;
  delete process.env.STAGING_ROLE_SETUP_ALLOW_WRITE;
});

describe("database operation safety", () => {
  it("covers: AC-5 refresh timeout measures inactivity instead of total transfer time", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const timeout = createInactivityTimeout(120_000, onTimeout);

    await vi.advanceTimersByTimeAsync(100_000);
    timeout.activity();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(onTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(onTimeout).toHaveBeenCalledOnce();
    timeout.clear();
  });

  it("covers: AC-5 completed refresh clears the inactivity timeout", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const timeout = createInactivityTimeout(120_000, onTimeout);

    await vi.advanceTimersByTimeAsync(30_000);
    timeout.clear();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("covers: AC-5 returns the catalog inventory and snapshot row counts", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("pg_largeobject_metadata")) {
        return {
          rows: [
            {
              partitioned: 0,
              foreign_tables: 0,
              materialized_views: 0,
              rls: 0,
              triggers: 0,
              large_objects: 0,
            },
          ],
        };
      }
      if (sql.includes("ORDER BY c.relname")) {
        return {
          rows: [
            { schema: "public", name: "Post" },
            { schema: "public", name: "User" },
          ],
        };
      }
      if (sql.includes('"Post"')) return { rows: [{ count: "3" }] };
      if (sql.includes('"User"')) return { rows: [{ count: "2" }] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(inventory(client)).resolves.toEqual([
      { schema: "public", name: "Post", count: 3 },
      { schema: "public", name: "User", count: 2 },
    ]);
  });

  it.each([
    "partitioned",
    "foreign_tables",
    "materialized_views",
    "rls",
    "triggers",
    "large_objects",
  ])(
    "covers: AC-5 rejects unsupported %s before selecting application rows",
    async (unsupportedKey) => {
      const query = vi.fn(async () => ({
        rows: [
          {
            partitioned: 0,
            foreign_tables: 0,
            materialized_views: 0,
            rls: 0,
            triggers: 0,
            large_objects: 0,
            [unsupportedKey]: 1,
          },
        ],
      }));
      const client = { query } as unknown as DatabaseClient;

      await expect(inventory(client)).rejects.toMatchObject({ code: "SNAPSHOT_FAILED" });
      expect(query).toHaveBeenCalledTimes(1);
    }
  );

  it("covers: AC-6 rejects an explicit recovery id with no active ledger row", async () => {
    const client = fakeClient((sql) => {
      if (sql.includes("FROM feline_tool.refresh_operations")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await expect(recoverOperation(client, "a".repeat(32))).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
  });

  it("covers: AC-6 rolls a pre commit rename back by recorded database OID", async () => {
    const statements: string[] = [];
    let candidateRolledBack = false;
    const client = fakeClient((sql, values) => {
      statements.push(sql);
      if (sql.includes("FROM feline_tool.refresh_operations")) {
        return {
          rows: [
            {
              operation_id: "b".repeat(32),
              owner_token: "owner",
              candidate_oid: 22,
              previous_oid: 11,
              candidate_name: "feline_blog_refresh_candidate",
              previous_name: "feline_blog_previous_candidate",
              state: "candidate_renamed",
            },
          ],
        };
      }
      if (sql.includes("SELECT datname AS name FROM pg_database")) {
        const oid = values?.[0];
        if (oid === 22)
          return {
            rows: [
              {
                name: candidateRolledBack
                  ? "feline_blog_refresh_candidate"
                  : targets.developmentDatabase,
              },
            ],
          };
        if (oid === 11) return { rows: [{ name: "feline_blog_previous_candidate" }] };
      }
      if (sql.includes('RENAME TO "feline_blog_refresh_candidate"')) {
        candidateRolledBack = true;
      }
      if (sql.includes("pg_stat_activity")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await recoverOperation(client, "b".repeat(32));

    expect(
      statements.some((sql) => sql.includes('RENAME TO "feline_blog_refresh_candidate"'))
    ).toBe(true);
    expect(statements.some((sql) => sql.includes('RENAME TO "feline_blog_dev"'))).toBe(true);
    expect(statements.some((sql) => sql.includes("DROP DATABASE"))).toBe(true);
    expect(
      statements.some((sql) => sql.includes("SET state = $2") && sql.includes("operation_id = $1"))
    ).toBe(true);
  });

  it("covers: AC-6 preserves a committed canonical database while cleanup is blocked", async () => {
    const statements: string[] = [];
    const client = fakeClient((sql, values) => {
      statements.push(sql);
      if (sql.includes("FROM feline_tool.refresh_operations")) {
        return {
          rows: [
            {
              operation_id: "c".repeat(32),
              owner_token: "owner",
              candidate_oid: 22,
              previous_oid: 11,
              candidate_name: "feline_blog_refresh_candidate",
              previous_name: "feline_blog_previous_candidate",
              state: "committed",
            },
          ],
        };
      }
      if (sql.includes("SELECT datname AS name FROM pg_database")) {
        const oid = values?.[0];
        if (oid === 22) return { rows: [{ name: targets.developmentDatabase }] };
        if (oid === 11) return { rows: [{ name: "feline_blog_previous_candidate" }] };
      }
      if (sql.includes("pg_stat_activity")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await recoverOperation(client, "c".repeat(32));

    expect(statements.some((sql) => sql.includes("GRANT CONNECT"))).toBe(true);
    expect(statements.some((sql) => sql.includes("DROP DATABASE"))).toBe(false);
  });

  it.each(["rls_tables", "executable_functions", "writable_tables"])(
    "covers: AC-7 rejects exporter capability %s",
    async (capability) => {
      const client = fakeClient(() => ({
        rows: [{ rls_tables: 0, executable_functions: 0, writable_tables: 0, [capability]: 1 }],
      }));

      await expect(assertExporterSafety(client)).rejects.toMatchObject({ code: "ROLE_MISMATCH" });
    }
  );

  it("covers: AC-7 ignores extension-owned functions when checking exporter safety", async () => {
    let statement = "";
    const client = fakeClient((sql) => {
      statement = sql;
      return { rows: [{ rls_tables: 0, executable_functions: 0, writable_tables: 0 }] };
    });

    await expect(assertExporterSafety(client)).resolves.toBeUndefined();
    expect(statement).toContain("LEFT JOIN pg_depend");
    expect(statement).toContain("d.deptype = 'e'");
    expect(statement).toContain("d.objid IS NULL");
  });

  it("covers: AC-7 grants exporter reads through the application table owner", async () => {
    const statements: string[] = [];
    const client = fakeClient((sql) => {
      statements.push(sql);
      return { rows: [] };
    });

    await grantExporterReadAccess(client);

    expect(statements).toEqual([
      "GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_exporter",
      "GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_exporter",
      "REVOKE USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM app_exporter",
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_exporter",
    ]);
  });

  it("covers: AC-7 requires a strict staging CA", () => {
    expect(stagingTls({ POSTGRES_SSL_CA: "line-one\\nline-two" })).toEqual({
      ca: "line-one\nline-two",
      rejectUnauthorized: true,
    });
    expect(() => stagingTls({})).toThrow(DatabaseToolError);
  });

  it("covers: AC-7 releases the staging advisory lock when the action fails", async () => {
    const queries: string[] = [];
    const client = fakeClient((sql) => {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      return { rows: [{ pg_advisory_unlock: true }] };
    });

    await expect(
      withStagingLock(client, async () => {
        throw new Error("action failed");
      })
    ).rejects.toThrow("action failed");
    expect(queries.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(true);
  });

  it("covers: AC-15 derives only trusted Prisma TLS parameters", () => {
    const raw = `postgresql://${targets.migratorRole}.${targets.stagingProjectRef}:secret@${targets.stagingSessionPoolerHost}:${targets.stagingSessionPoolerPort}/${targets.stagingDatabase}`;
    const derived = new URL(verifiedPrismaMigrationUrl(raw, "C:/temp/root.crt"));

    expect(derived.searchParams.get("sslmode")).toBe("verify-full");
    expect(derived.searchParams.get("sslrootcert")).toBe("C:/temp/root.crt");
    expect(derived.searchParams.has("options")).toBe(false);
  });

  it("covers: AC-15 aborts migration work when the advisory lock session is lost", async () => {
    const emitter = new EventEmitter();
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
        if (sql.includes("pg_backend_pid")) return { rows: [{ pid: 42 }] };
        return { rows: [{ pg_advisory_unlock: true }] };
      }),
      once: emitter.once.bind(emitter),
      off: emitter.off.bind(emitter),
    } as unknown as Parameters<typeof withMonitoredStagingLock>[0];

    await expect(
      withMonitoredStagingLock(
        client,
        async (signal) => {
          emitter.emit("error", new Error("connection lost"));
          await new Promise<void>((resolve, reject) => {
            if (signal.aborted) reject(new Error("aborted"));
            else
              signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
        1
      )
    ).rejects.toThrow("aborted");
    expect(queries.some((sql) => sql.includes("pg_advisory_unlock"))).toBe(true);
  });

  it("covers: AC-14 rolls both desired role defaults back when either ALTER fails", async () => {
    const statements: string[] = [];
    const client = fakeClient((sql) => {
      statements.push(sql);
      if (sql.includes("SET statement_timeout")) throw new Error("simulated ALTER failure");
      return { rows: [] };
    });

    await expect(applyDesiredMigratorTimeouts(client as never)).rejects.toThrow(
      "simulated ALTER failure"
    );
    expect(statements[0]).toBe("BEGIN");
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("covers: AC-14 restores absent and explicit role defaults in one transaction", async () => {
    const statements: string[] = [];
    const client = fakeClient((sql) => {
      statements.push(sql);
      return { rows: [] };
    });

    await restoreMigratorTimeouts(client as never, {
      lockTimeout: null,
      statementTimeout: "45s",
    });

    expect(statements).toEqual([
      "BEGIN",
      'ALTER ROLE "app_migrator" RESET lock_timeout',
      "ALTER ROLE \"app_migrator\" SET statement_timeout = '45s'",
      "COMMIT",
    ]);
  });

  it("covers: AC-15 compares effective timeouts numerically", async () => {
    const client = fakeClient(() => ({
      rows: [{ lock_timeout: "5000ms", statement_timeout: "2min" }],
    }));

    await expect(
      assertEffectiveMigrationTimeouts(client as never, {
        lockTimeoutMs: targets.stagingMigrationLockTimeoutMs,
        statementTimeoutMs: targets.stagingMigrationStatementTimeoutMs,
      })
    ).resolves.toEqual({ lockTimeoutMs: 5_000, statementTimeoutMs: 120_000 });
  });

  it("covers: AC-14 rejects database-specific timeout overrides", async () => {
    const client = fakeClient(() => ({
      rows: [{ rolconfig: [], database_config: ["statement_timeout=1s"] }],
    }));

    await expect(readRoleTimeoutCatalog(client as never)).rejects.toMatchObject({
      code: "CONFIG_CONFLICT",
    });
  });

  it("covers: AC-7 and AC-9 reject mutating entry points before external access", async () => {
    await expect(deployStaging()).rejects.toMatchObject({ code: "TARGET_REJECTED" });
    await expect(configureStagingMigratorTimeouts()).rejects.toMatchObject({
      code: "TARGET_REJECTED",
    });
    await expect(rollbackStagingMigratorTimeouts()).rejects.toMatchObject({
      code: "TARGET_REJECTED",
    });
    await expect(setupStagingExporter(true)).rejects.toMatchObject({ code: "TARGET_REJECTED" });
    await expect(
      localDestroy(`${targets.composeProject}:${targets.composeVolume}`)
    ).rejects.toMatchObject({ code: "TARGET_REJECTED" });
  });
});
