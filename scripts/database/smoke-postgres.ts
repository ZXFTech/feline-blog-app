import { randomUUID } from "node:crypto";

const allowedEnvironments = new Set(["local", "development", "test", "preview"]);
const environment = process.env.POSTGRES_ENVIRONMENT;

if (process.env.POSTGRES_SMOKE_ALLOW_WRITE !== "true") {
  throw new Error(
    "Set POSTGRES_SMOKE_ALLOW_WRITE=true to authorize this PostgreSQL write smoke test."
  );
}
if (!environment || !allowedEnvironments.has(environment)) {
  throw new Error(
    "POSTGRES_ENVIRONMENT must be local, development, test, or preview. Production is not allowed."
  );
}

class ExpectedRollback extends Error {}

const nonce = `smoke-${randomUUID()}`;
const { default: postgresDb, postgresPool } = await import("../../src/db/postgres/runtime");

try {
  try {
    await postgresDb.$transaction(
      async (transaction) => {
        await transaction.postgresConnectionProbe.create({
          data: { nonce, value: "created" },
        });
        const created = await transaction.postgresConnectionProbe.findUniqueOrThrow({
          where: { nonce },
        });
        if (created.value !== "created")
          throw new Error("PostgreSQL smoke read verification failed.");

        const updated = await transaction.postgresConnectionProbe.update({
          where: { nonce },
          data: { value: "updated" },
        });
        if (updated.value !== "updated")
          throw new Error("PostgreSQL smoke update verification failed.");

        throw new ExpectedRollback("Rollback the smoke transaction.");
      },
      { maxWait: 10_000, timeout: 10_000 }
    );
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error;
  }

  const residue = await postgresDb.postgresConnectionProbe.findUnique({ where: { nonce } });
  if (residue) throw new Error("PostgreSQL smoke rollback left probe data behind.");
  console.log("PostgreSQL CRUD and rollback smoke test passed.");
} finally {
  await postgresDb.$disconnect();
  await postgresPool.end();
}
