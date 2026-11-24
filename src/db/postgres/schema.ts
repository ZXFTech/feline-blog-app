import "server-only";
import { Prisma } from "../../../generated/prisma-postgres/client";
import { getSdkDatabaseSchema } from "@/lib/auth/sdk/config";

const applicationObjects = [
  "users",
  "Blog",
  "Checklist",
  "ChecklistItem",
  "feline_sdk_lock_installation",
] as const;
type ApplicationObject = (typeof applicationObjects)[number];
export function applicationObject(name: ApplicationObject) {
  const schema = getSdkDatabaseSchema();
  if (schema !== "public" && schema !== "feline_sdk_prod") throw Error("SCHEMA_BINDING_REJECTED");
  if (!applicationObjects.includes(name)) throw Error("SCHEMA_BINDING_REJECTED");
  return Prisma.raw(`"${schema}"."${name}"`);
}
