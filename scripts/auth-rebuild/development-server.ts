import path from "node:path";
import { stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { privateConfigFile } from "./files";
import { selectConfiguration, serverConfiguration } from "../../src/lib/auth/sdk/configuration";
import { onlineTarget, onlineServerConfiguration } from "./online-target";

export async function startDevelopment(envFile: string, mode: "local" | "online") {
  const fileValues = dotenv.parse(await privateConfigFile(path.resolve(envFile)));
  const values: NodeJS.ProcessEnv = { ...process.env, ...fileValues, NODE_ENV: "development" };
  if (!fileValues.USER_CENTER_CONFIG_FILE || values.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw Error("LOCAL_DEVELOPMENT_CONFIGURATION_REJECTED");
  const profiles = JSON.parse(
    (await privateConfigFile(path.resolve(fileValues.USER_CENTER_CONFIG_FILE))).toString("utf8")
  );
  let configuration;
  if (mode === "online") {
    configuration = onlineServerConfiguration(profiles, values);
  } else {
    const selected = selectConfiguration(profiles, values);
    if (
      selected.environment.runtimeEnvironment !== "development" ||
      selected.environment.targetEnvironment !== "development" ||
      selected.manifest.platformOrigin !== "https://blog.user-center.test:3443"
    )
      throw Error("LOCAL_DEVELOPMENT_CONFIGURATION_REJECTED");
    configuration = serverConfiguration(selected, values);
  }
  const hostname = new URL(configuration.manifest.platformOrigin).hostname;
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => address !== "127.0.0.1"))
    throw Error("LOCAL_DNS_BINDING_REJECTED");
  const tls = path.resolve(".feline-blog/auth-rebuild/local/tls");
  const cert = path.join(tls, "blog.pem"),
    key = path.join(tls, "blog-key.pem"),
    ca = path.join(tls, "rootCA.pem");
  for (const file of [cert, key, ca])
    if (!(await stat(file)).isFile()) throw Error("LOCAL_TLS_FILE_MISSING");
  if (mode === "online") {
    await (await import("./online-postgres")).assertOnlineStorageReady(configuration.poolConfig);
    const metadata = await (await import("./online-metadata")).checkOnlineMetadata();
    if (metadata.status !== "PASS")
      throw Error(typeof metadata.code === "string" ? metadata.code : "CENTER_UNAVAILABLE");
  }
  // Center target never selects a production platform DB, origin or session secret.
  const env: NodeJS.ProcessEnv = {
    ...values,
    NODE_EXTRA_CA_CERTS: ca,
    FELINE_SDK_DEV_TARGET: mode === "online" ? "production" : "development",
  };
  for (const name of [
    "DATABASE_URL",
    "DIRECT_URL",
    "POSTGRES_MIGRATION_URL",
    "POSTGRES_SHADOW_DATABASE_URL",
    "POSTGRES_BACKUP_URL",
  ])
    env[name] = "";
  const child = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      hostname,
      "--port",
      String(mode === "online" ? onlineTarget.port : 3443),
      "--experimental-https",
      "--experimental-https-key",
      key,
      "--experimental-https-cert",
      cert,
      "--experimental-https-ca",
      ca,
    ],
    { stdio: "inherit", windowsHide: true, env }
  );
  child.on("error", () => {
    console.error("LOCAL_SDK_START_FAILED");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
