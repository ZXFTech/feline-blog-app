import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { describeRegistration } from "@user-center/next-better-auth/config";
import {
  onlineTarget as target,
  onlineDirectory,
  onlineServerConfiguration,
} from "./online-target";
import { privateDirectory, privateConfigFile } from "./files";

export const registrationForOnline = () =>
  describeRegistration({
    issuer: target.issuer,
    platformOrigin: target.origin,
    authBasePath: "/api/auth",
  });
export async function readOnlineInputs() {
  const directory = onlineDirectory();
  const values = dotenv.parse(await privateConfigFile(path.join(directory, ".env.blog.local")));
  if (
    path.resolve(values.USER_CENTER_CONFIG_FILE ?? "") !==
    path.join(directory, "integration.profiles.json")
  )
    throw Error("ONLINE_CONFIG_PATH_REJECTED");
  const profiles = JSON.parse(
    (await privateConfigFile(path.join(directory, "integration.profiles.json"))).toString("utf8")
  );
  return { values, profiles };
}
export async function prepareOnlineConfiguration() {
  const directory = onlineDirectory();
  try {
    await fs.lstat(directory);
    throw Error("ONLINE_CONFIGURATION_ALREADY_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await privateDirectory(directory);
  const example = JSON.parse(await fs.readFile("config/user-center.profiles.example.json", "utf8"));
  const profiles = {
    ...example,
    centers: { production: target.issuer },
    runtimes: {
      development: {
        platformOrigin: target.origin,
        sessionSecretEnv: target.sessionSecretEnv,
        clients: { production: { clientId: "", clientSecretEnv: target.clientSecretEnv } },
        database: {
          urlEnv: target.databaseUrlEnv,
          hostname: "127.0.0.1",
          port: target.databasePort,
          database: target.database,
          username: target.runtimeRole,
        },
      },
    },
  };
  await fs.writeFile(
    path.join(directory, "integration.profiles.json"),
    JSON.stringify(profiles, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  const ca = await fs.readFile(".feline-blog/auth-rebuild/local/tls/rootCA.pem", "utf8");
  const entries: Record<string, string> = {
    USER_CENTER_CONFIG_FILE: path.join(directory, "integration.profiles.json"),
    USER_CENTER_RUNTIME_ENVIRONMENT: "development",
    USER_CENTER_TARGET_ENVIRONMENT: "production",
    [target.sessionSecretEnv]: randomBytes(48).toString("base64url"),
    [target.clientSecretEnv]: "",
    [target.databaseUrlEnv]: "",
    PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA: ca,
    NODE_EXTRA_CA_CERTS: path.resolve(".feline-blog/auth-rebuild/local/tls/rootCA.pem"),
    POSTGRES_POOL_MAX: "5",
    POSTGRES_CONNECT_TIMEOUT_MS: "10000",
    POSTGRES_QUERY_TIMEOUT_MS: "10000",
  };
  await fs.writeFile(
    path.join(directory, ".env.blog.local"),
    "# Only local platform resources. Fill the dedicated online-center Client Secret here.\n" +
      Object.entries(entries)
        .map(([key, value]) => key + "=" + JSON.stringify(value))
        .join("\n") +
      "\n",
    { flag: "wx", mode: 0o600 }
  );
  const registration = registrationForOnline();
  await fs.writeFile(
    path.join(directory, "registration.json"),
    JSON.stringify(registration, null, 2) + "\n",
    { flag: "wx", mode: 0o600 }
  );
  await privateConfigFile(path.join(directory, ".env.blog.local"));
  return {
    directory,
    runtime: "development",
    target: "production",
    registration,
    sessionSecretGenerated: true,
    clientCredentialsCopied: false,
    databaseCreated: false,
  };
}
export async function checkOnlineConfiguration() {
  const { values, profiles } = await readOnlineInputs();
  const missing: string[] = [];
  const profile = profiles.runtimes?.development;
  if (!profile?.clients?.production?.clientId?.trim())
    missing.push("线上中心的本地开发专用 Client ID");
  if (!values[target.clientSecretEnv]?.trim()) missing.push(target.clientSecretEnv);
  if (!values[target.databaseUrlEnv]?.trim()) missing.push(target.databaseUrlEnv);
  if ((values[target.sessionSecretEnv]?.length ?? 0) < 32) missing.push(target.sessionSecretEnv);
  let valid = false;
  try {
    onlineServerConfiguration(profiles, values);
    valid = true;
  } catch {
    /* Fail closed, including a missing Client. */
  }
  const tls = path.resolve(".feline-blog/auth-rebuild/local/tls");
  for (const file of ["blog.pem", "blog-key.pem", "rootCA.pem"])
    try {
      if (!(await fs.stat(path.join(tls, file))).isFile()) throw Error();
    } catch {
      missing.push(file);
    }
  let sessionSecretIndependent: boolean | null = null;
  const oldEnv = path.resolve(".feline-blog/auth-rebuild/local-0.1.6/.env.blog.local");
  const oldConfig = path.resolve(".feline-blog/auth-rebuild/local-0.1.6/integration.profiles.json");
  if ((await fs.stat(oldEnv).catch(() => null)) && (await fs.stat(oldConfig).catch(() => null))) {
    const oldValues = dotenv.parse(await privateConfigFile(oldEnv));
    const oldProfiles = JSON.parse((await privateConfigFile(oldConfig)).toString("utf8"));
    sessionSecretIndependent =
      values[target.sessionSecretEnv] !==
      oldValues[oldProfiles.runtimes.development.sessionSecretEnv];
  }
  if (sessionSecretIndependent === false) missing.push("独立于旧本地模式的 session secret");
  const result = {
    checkedAt: new Date().toISOString(),
    scope: "offline files only",
    runtime: "development",
    target: "production",
    configuration: valid && !missing.length ? "PASS" : "BLOCKED",
    missing,
    registration: registrationForOnline(),
    sessionSecretIndependent,
    databasePort: target.databasePort,
    database: target.database,
    networkRequested: false,
    databaseConnected: false,
    secretValuesPrinted: false,
  };
  await fs.writeFile(
    path.join(onlineDirectory(), "offline-check.json"),
    JSON.stringify(result, null, 2) + "\n"
  );
  return result;
}
