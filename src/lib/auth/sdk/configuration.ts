import {
  assertPostgresBinding,
  describeIntegration,
  resolveEnvironmentConfig,
} from "@user-center/next-better-auth/config";
import { buildPostgresPoolConfig } from "@/db/postgres/config";

export class SdkConfigurationError extends Error {
  readonly code = "ENVIRONMENT_MISMATCH";
  constructor() {
    super("ENVIRONMENT_MISMATCH");
  }
}

export type EnvironmentValues = Readonly<Record<string, string | undefined>>;
export type SelectedConfiguration = ReturnType<typeof selectConfiguration>;
export const databaseCaVariables = {
  development: "PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA",
  staging: "PLATFORM_STAGING_POSTGRES_SSL_CA",
  production: "PLATFORM_PRODUCTION_POSTGRES_SSL_CA",
} as const;
export const productionDatabaseSchema = "feline_sdk_prod";
export function resolveDatabaseSchema(
  runtime: "development" | "staging" | "production",
  values: EnvironmentValues
) {
  if (runtime === "production") {
    if (values.PLATFORM_PRODUCTION_POSTGRES_SCHEMA !== productionDatabaseSchema)
      throw new SdkConfigurationError();
    return productionDatabaseSchema;
  }
  const configured = values[`PLATFORM_${runtime.toUpperCase()}_POSTGRES_SCHEMA`];
  if (configured !== undefined && configured !== "public") throw new SdkConfigurationError();
  return "public";
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

export function selectConfiguration(input: unknown, values: EnvironmentValues) {
  try {
    const selected = resolveEnvironmentConfig(structuredClone(input), {
      runtimeEnvironment: values.USER_CENTER_RUNTIME_ENVIRONMENT ?? "",
      ...(values.USER_CENTER_TARGET_ENVIRONMENT === undefined
        ? {}
        : { targetEnvironment: values.USER_CENTER_TARGET_ENVIRONMENT }),
    });
    if (selected.manifest.authBasePath !== "/api/auth") throw new SdkConfigurationError();
    return freeze({ ...selected, publicConfig: describeIntegration(selected.manifest) });
  } catch {
    throw new SdkConfigurationError();
  }
}

export function serverConfiguration(selected: SelectedConfiguration, values: EnvironmentValues) {
  try {
    const requireValue = (key: string): string => {
      const value = values[key];
      if (!value?.trim()) throw new SdkConfigurationError();
      return value;
    };
    if (!selected.database) throw new SdkConfigurationError();
    const clientSecret = requireValue(selected.manifest.clientSecretEnv);
    const sessionSecret = requireValue(selected.manifest.sessionSecretEnv);
    const databaseUrl = requireValue(selected.database.urlEnv);
    const databaseSchema = resolveDatabaseSchema(selected.environment.runtimeEnvironment, values);
    const databaseCa = requireValue(
      databaseCaVariables[selected.environment.runtimeEnvironment]
    ).replace(/\\n/g, "\n");
    assertPostgresBinding(databaseUrl, selected.database);
    if (
      sessionSecret.length < 32 ||
      clientSecret === sessionSecret ||
      clientSecret === databaseUrl ||
      sessionSecret === databaseUrl ||
      !databaseCa.includes("-----BEGIN CERTIFICATE-----")
    )
      throw new SdkConfigurationError();
    const poolConfig = {
      ...buildPostgresPoolConfig({
        ...values,
        POSTGRES_DATABASE_URL: databaseUrl,
        POSTGRES_SSL_CA: databaseCa,
        // This isolated SDK target requires verified TLS. Ambient legacy local mode cannot disable it.
        POSTGRES_ENVIRONMENT: "sdk",
      }),
      options: `-c search_path=${databaseSchema},pg_catalog,public`,
    };
    return Object.freeze({
      ...selected,
      clientSecret,
      sessionSecret,
      databaseUrl,
      databaseSchema,
      databaseCa,
      poolConfig,
    });
  } catch {
    throw new SdkConfigurationError();
  }
}
