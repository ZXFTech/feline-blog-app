import postgresDb from "@/db/client";

export function findPostgresConnectionProbe(nonce: string) {
  return postgresDb.postgresConnectionProbe.findUnique({ where: { nonce } });
}
