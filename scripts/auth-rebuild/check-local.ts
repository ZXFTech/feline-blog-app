import path from "node:path";
import { stat } from "node:fs/promises";
import dotenv from "dotenv";
import { describeRegistration } from "@user-center/next-better-auth/config";
import { selectConfiguration, serverConfiguration } from "../../src/lib/auth/sdk/configuration";
import { privateConfigFile } from "./files";
import { checkInstalledSdk } from "./check-installed";

// Local files only. No adapter, application runtime, center source or database imports.
async function exists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--env-file") throw Error();
  const values = dotenv.parse(await privateConfigFile(path.resolve(process.argv[3])));
  const configFile = path.resolve(values.USER_CENTER_CONFIG_FILE || "__missing__");
  const profiles = JSON.parse((await privateConfigFile(configFile)).toString("utf8"));
  const runtime = values.USER_CENTER_RUNTIME_ENVIRONMENT;
  const target = values.USER_CENTER_TARGET_ENVIRONMENT || runtime;
  if (runtime !== "development" || target !== "development") throw Error();
  const profile = profiles.runtimes?.development;
  const client = profile?.clients?.development;
  const missing: string[] = [];
  if (!client?.clientId?.trim()) missing.push("本地中心专用 Client ID");
  if (!client?.clientSecretEnv || !values[client.clientSecretEnv]?.trim())
    missing.push("本地中心专用 Client Secret");
  if (!profile?.sessionSecretEnv || (values[profile.sessionSecretEnv]?.length ?? 0) < 32)
    missing.push("独立且至少 32 字符的 development session secret");
  if (
    !profile?.database ||
    ["urlEnv", "hostname", "database", "username"].some(
      (key) => typeof profile.database[key] !== "string" || !profile.database[key].trim()
    ) ||
    !Number.isInteger(profile.database.port) ||
    profile.database.port < 1 ||
    profile.database.port > 65535
  )
    missing.push("development.database 的 urlEnv、hostname、port、database、username");
  if (!profile?.database?.urlEnv || !values[profile.database.urlEnv]?.trim())
    missing.push("新空博客目标的 development 运行连接");
  if (!values.PLATFORM_DEVELOPMENT_POSTGRES_SSL_CA?.trim())
    missing.push("新空博客目标的可信 PostgreSQL CA");
  const tlsRoot = path.resolve(".feline-blog/auth-rebuild/local/tls");
  const files = [
    path.join(tlsRoot, "blog.pem"),
    path.join(tlsRoot, "blog-key.pem"),
    path.join(tlsRoot, "rootCA.pem"),
  ];
  const tlsFiles = await Promise.all(files.map(exists));
  for (let i = 0; i < files.length; i++)
    if (!tlsFiles[i]) missing.push(`本地 TLS 文件 ${path.basename(files[i])}`);
  const installed = await checkInstalledSdk();
  let selectedConfiguration = "BLOCKED";
  let runtimeConfiguration = "BLOCKED";
  try {
    const selected = selectConfiguration(profiles, values);
    selectedConfiguration = "PASS";
    serverConfiguration(selected, values);
    runtimeConfiguration = "PASS";
  } catch {
    /* Missing or invalid selected fields must remain blocked. */
  }
  const registration = describeRegistration({
    issuer: profiles.centers.development,
    platformOrigin: profile.platformOrigin,
    authBasePath: profiles.authBasePath,
  });
  const report = {
    ...installed,
    node: process.versions.node,
    runtime,
    target,
    authUserPolicy: "allow-new",
    accountPlan: "0019-new-target-new-account",
    configFile,
    registration,
    selectedConfiguration,
    runtimeConfiguration,
    cliDoctor:
      selectedConfiguration === "PASS"
        ? "READY_TO_RUN_OFFLINE_SEPARATELY"
        : "NOT_RUN_CONFIG_INCOMPLETE",
    missing,
    pendingVerification: [
      "hosts 解析与浏览器公共 CA 信任",
      "本地中心运行与 Discovery user_center_environment=development",
      "新空目标的唯一迁移、运行 ACL/RLS、存储约束与并发",
      "真实登录、必要 consent、GET 回调、稳定身份、资料、页面/API、刷新和退出",
      "ROOT 初始化、单账号业务恢复与显式开放",
    ],
    databaseConnected: false,
    networkRequested: false,
    realAuthenticationVerified: false,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = missing.length || runtimeConfiguration !== "PASS" ? 2 : 0;
}
main().catch(() => {
  console.error(
    JSON.stringify({
      code: "OFFLINE_CONFIGURATION_CHECK_FAILED",
      databaseConnected: false,
      networkRequested: false,
    })
  );
  process.exitCode = 3;
});
