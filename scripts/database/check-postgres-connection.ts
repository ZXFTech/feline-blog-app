export {};

if (!process.env.POSTGRES_DATABASE_URL) {
  throw new Error("POSTGRES_DATABASE_URL is required for the PostgreSQL connection check.");
}

const { default: postgresDb, postgresPool } = await import("../../src/db/postgres/runtime");

try {
  await postgresDb.$queryRaw`SELECT 1 AS ok`;
  console.log("PostgreSQL read only connection check passed.");
} finally {
  await postgresDb.$disconnect();
  await postgresPool.end();
}
