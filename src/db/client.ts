import { PrismaClient } from "../../generated/prisma";

const globalForDB = globalThis as unknown as { db: PrismaClient };

const db = globalForDB.db || new PrismaClient();

export default db;

if (process.env.NODE_ENV !== "production") {
  globalForDB.db = db;
}

export const testUserId = "test-user";
