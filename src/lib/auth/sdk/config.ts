import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import productionProfiles from "../../../../config/user-center.production.profiles.json";
import {
  SdkConfigurationError,
  selectConfiguration,
  serverConfiguration,
  resolveDatabaseSchema,
} from "@/lib/auth/sdk/configuration";

function captureConfiguration() {
  try {
    const file = process.env.USER_CENTER_CONFIG_FILE;
    if (!file?.trim()) throw new SdkConfigurationError();
    const resolved = path.resolve(file);
    // Proxy has its own deployment bundle. Import the selected production JSON
    // statically so it does not depend on a runtime file missing from that bundle.
    // Other configured files keep their explicit selection, without fallback.
    const bundled = resolved === path.resolve("config/user-center.production.profiles.json");
    if (!bundled && statSync(resolved).size > 65_536) throw new SdkConfigurationError();
    const input = bundled ? productionProfiles : JSON.parse(readFileSync(resolved, "utf8"));
    const selected = selectConfiguration(input, process.env);
    // Capture credential inputs with the same profile snapshot. Environment changes require restart.
    return { selected, values: Object.freeze({ ...process.env }) };
  } catch {
    throw new SdkConfigurationError();
  }
}

let snapshot: ReturnType<typeof captureConfiguration> | undefined;
function getSnapshot() {
  return (snapshot ??= captureConfiguration());
}
export function getSdkConfiguration() {
  return getSnapshot().selected;
}
export function getSdkDatabaseSchema() {
  const captured = getSnapshot();
  return resolveDatabaseSchema(captured.selected.environment.runtimeEnvironment, captured.values);
}
export function getSdkServerConfiguration() {
  const captured = getSnapshot();
  return serverConfiguration(captured.selected, captured.values);
}
