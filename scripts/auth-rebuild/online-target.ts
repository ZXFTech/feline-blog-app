import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectConfiguration,
  serverConfiguration,
  type EnvironmentValues,
} from "../../src/lib/auth/sdk/configuration";

// These are host development resources. The production target selects only the center.
export const onlineTarget = Object.freeze({
  directory: ".feline-blog/auth-rebuild/local-to-production-0.1.6",
  issuer: "https://auth.zhaosie.com/api/auth",
  origin: "https://blog.user-center.test:3445",
  port: 3445,
  distDir: ".next-online-center",
  databasePort: 54332,
  database: "feline_blog_sdk_online_dev",
  runtimeRole: "blog_sdk_online_runtime",
  maintenanceRole: "blog_sdk_online_migrator",
  adminRole: "blog_sdk_online_admin",
  project: "feline-blog-sdk-online-local",
  container: "feline-blog-sdk-online-postgres",
  volume: "feline_blog_sdk_online_postgres_data",
  databaseUrlEnv: "LOCAL_ONLINE_DATABASE_URL",
  sessionSecretEnv: "LOCAL_ONLINE_SESSION_SECRET",
  clientSecretEnv: "LOCAL_TO_PRODUCTION_CLIENT_SECRET",
  image:
    "postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652",
});
const projectRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const onlineDirectory = () => {
  if (path.resolve(process.cwd()).toLowerCase() !== projectRoot.toLowerCase())
    throw Error("ONLINE_LOCAL_WORKDIR_REJECTED");
  return path.join(projectRoot, onlineTarget.directory);
};

export function selectOnlineConfiguration(profiles: unknown, values: EnvironmentValues) {
  const selected = selectConfiguration(profiles, values);
  if (
    selected.environment.runtimeEnvironment !== "development" ||
    selected.environment.targetEnvironment !== "production" ||
    selected.manifest.issuer !== onlineTarget.issuer ||
    selected.manifest.platformOrigin !== onlineTarget.origin ||
    selected.manifest.sessionSecretEnv !== onlineTarget.sessionSecretEnv ||
    selected.manifest.clientSecretEnv !== onlineTarget.clientSecretEnv ||
    selected.database?.hostname !== "127.0.0.1" ||
    selected.database.port !== onlineTarget.databasePort ||
    selected.database.database !== onlineTarget.database ||
    selected.database.username !== onlineTarget.runtimeRole ||
    selected.database.urlEnv !== onlineTarget.databaseUrlEnv
  )
    throw Error("ONLINE_LOCAL_BINDING_REJECTED");
  return selected;
}
export function onlineServerConfiguration(profiles: unknown, values: EnvironmentValues) {
  return serverConfiguration(selectOnlineConfiguration(profiles, values), values);
}
