import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../../generated/prisma/client";

const port = Number(process.env.DATABASE_PORT ?? "3306");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DATABASE_PORT must be a valid port number.");
}

const sslEnabled = process.env.DATABASE_SSL === "true";
const sslCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  port,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 2,
  connectTimeout: 10_000,
  ssl: sslEnabled
    ? {
        rejectUnauthorized: true,
        ...(sslCa ? { ca: sslCa } : {}),
      }
    : undefined,
});

const globalForLegacyMysql = globalThis as unknown as {
  legacyMysqlDb?: PrismaClient;
};

const legacyMysqlDb = globalForLegacyMysql.legacyMysqlDb ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForLegacyMysql.legacyMysqlDb = legacyMysqlDb;
}

/** @deprecated Existing MySQL modules only. New features must use PostgreSQL. */
export default legacyMysqlDb;
