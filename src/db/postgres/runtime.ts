import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../../generated/prisma-postgres/client";
import { buildPostgresPoolConfig } from "./config";

const globalForPostgres = globalThis as unknown as {
  postgresDb?: PrismaClient;
  postgresPool?: Pool;
};

let postgresRuntime: { db: PrismaClient; pool: Pool } | undefined;

function getPostgresRuntime(): { db: PrismaClient; pool: Pool } {
  if (postgresRuntime) return postgresRuntime;

  const pool = globalForPostgres.postgresPool ?? new Pool(buildPostgresPoolConfig());
  const db = globalForPostgres.postgresDb ?? new PrismaClient({ adapter: new PrismaPg(pool) });

  if (process.env.NODE_ENV !== "production") {
    globalForPostgres.postgresPool = pool;
    globalForPostgres.postgresDb = db;
  }

  postgresRuntime = { db, pool };
  return postgresRuntime;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve();
      const value = Reflect.get(instance, property, instance) as unknown;
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

// Keep imports side-effect free so `next build` can collect route metadata without
// production database credentials. The first real client or pool operation still
// validates the environment before a connection is created.
const postgresDb = lazyProxy<PrismaClient>(() => getPostgresRuntime().db);
const postgresPool = lazyProxy<Pool>(() => getPostgresRuntime().pool);

export { postgresPool };
export default postgresDb;
