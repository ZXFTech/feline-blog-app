import "server-only";
import { Prisma } from "../../../generated/prisma-postgres/client";
import { getSdkDatabaseSchema } from "@/lib/auth/sdk/config";

type ApplicationObject = "users" | "Checklist" | "ChecklistItem" | "feline_sdk_lock_installation";
export function applicationObject(name: ApplicationObject) {
  const schema = getSdkDatabaseSchema();
  if (schema !== "public" && schema !== "feline_sdk_prod") throw Error("SCHEMA_BINDING_REJECTED");
  if (!["users", "Checklist", "ChecklistItem", "feline_sdk_lock_installation"].includes(name))
    throw Error("SCHEMA_BINDING_REJECTED");
  return Prisma.raw(`"${schema}"."${name}"`);
}
