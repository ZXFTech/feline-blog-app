import { Client } from "pg";

import { targets } from "./local-postgres/config";
import { classifyLocalTarget, classifyStagingTarget } from "./local-postgres/target";

const environment = process.env.POSTGRES_ENVIRONMENT;
const connectionString = process.env.POSTGRES_MIGRATION_URL;

if (process.env.CHECKLIST_RESET_ALLOW_WRITE !== "true") {
  throw new Error(
    "Set CHECKLIST_RESET_ALLOW_WRITE=true for this process to authorize checklist reset."
  );
}
if (!connectionString) throw new Error("POSTGRES_MIGRATION_URL is required.");

if (environment === "local") {
  classifyLocalTarget(
    connectionString,
    targets.developmentDatabase,
    targets.migratorRole,
    environment
  );
} else if (environment === "staging") {
  classifyStagingTarget(connectionString, targets.migratorRole, environment);
} else {
  throw new Error("Checklist reset is restricted to allowlisted local or staging targets.");
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 5_000,
  ...(environment === "staging"
    ? {
        ssl: {
          ca: process.env.POSTGRES_SSL_CA?.replace(/\\n/g, "\n"),
          rejectUnauthorized: true,
        },
      }
    : {}),
});

try {
  await client.connect();
  const identity = await client.query<{ database: string; role: string }>(
    "SELECT current_database() AS database, current_user AS role"
  );
  const expectedDatabase =
    environment === "local" ? targets.developmentDatabase : targets.stagingDatabase;
  if (
    identity.rows[0]?.database !== expectedDatabase ||
    identity.rows[0]?.role !== targets.migratorRole
  ) {
    throw new Error("Connected database identity is not allowlisted for checklist reset.");
  }
  const result = await client.query<{ deleted: string }>(
    'WITH removed AS (DELETE FROM "Checklist" RETURNING 1) SELECT count(*)::text AS deleted FROM removed'
  );
  console.log(
    `Checklist reset completed for ${environment}; deleted ${result.rows[0]?.deleted ?? "0"} parent rows.`
  );
} finally {
  await client.end();
}
