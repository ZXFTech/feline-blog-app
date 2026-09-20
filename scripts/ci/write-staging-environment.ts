import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const stagingKeys = ["POSTGRES_MIGRATION_URL", "POSTGRES_SSL_CA"] as const;

export function serializeStagingEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): string {
  const values: Record<string, string> = { POSTGRES_ENVIRONMENT: "staging" };
  for (const key of stagingKeys) {
    const value = environment[key];
    if (!value) throw new Error(`${key} is required.`);
    values[key] = value;
  }
  return (
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  await writeFile(".env.staging", serializeStagingEnvironment(process.env), {
    encoding: "utf8",
    mode: 0o600,
  });
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Staging configuration failed.");
    process.exitCode = 1;
  });
}
