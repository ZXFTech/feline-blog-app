import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

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

  // 云端测试先使用较小的连接池。
  connectionLimit: 2,

  // 单位为毫秒。
  connectTimeout: 10_000,

  ssl: sslEnabled
    ? {
        rejectUnauthorized: true,
        ...(sslCa ? { ca: sslCa } : {}),
      }
    : undefined,
});

const globalForDB = globalThis as unknown as { db: PrismaClient };

const db = globalForDB.db || new PrismaClient({ adapter });

export default db;

if (process.env.NODE_ENV !== "production") {
  globalForDB.db = db;
}
