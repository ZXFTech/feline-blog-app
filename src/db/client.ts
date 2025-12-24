import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 5,
});

const globalForDB = globalThis as unknown as { db: PrismaClient };

const db = globalForDB.db || new PrismaClient({ adapter });

export default db;

if (process.env.NODE_ENV !== "production") {
  globalForDB.db = db;
}

export const testUserId = "test-user";
