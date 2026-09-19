import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationUrl = process.env.POSTGRES_MIGRATION_URL;
const shadowDatabaseUrl = process.env.POSTGRES_SHADOW_DATABASE_URL;

if (migrationUrl && shadowDatabaseUrl && migrationUrl === shadowDatabaseUrl) {
  throw new Error(
    "POSTGRES_SHADOW_DATABASE_URL must not point to the PostgreSQL migration database."
  );
}

export default defineConfig({
  schema: "prisma/postgres/schema.prisma",
  migrations: { path: "prisma/postgres/migrations" },
  datasource: { url: migrationUrl, shadowDatabaseUrl },
});
