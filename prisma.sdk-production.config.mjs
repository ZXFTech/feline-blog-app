import { defineConfig } from "prisma/config";

// The guarded maintenance launcher supplies a verified TLS URL for this namespace.
// Never fall back to POSTGRES_DATABASE_URL or the source public migration chain.
export default defineConfig({
  schema: "prisma/postgres/schema.prisma",
  migrations: { path: "prisma/postgres/sdk-production/migrations" },
  datasource: { url: process.env.SDK_PRODUCTION_MIGRATION_URL },
});
