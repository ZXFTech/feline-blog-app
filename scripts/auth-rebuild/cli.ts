import path from "node:path";
import { pathToFileURL } from "node:url";
import { backup, sourceConfig, verifyBackup } from "./backup";
import { RebuildError } from "./contracts";
import { prepare, registration } from "./prepare";

const optionsByCommand: Record<string, readonly string[]> = {
  prepare: ["--release-dir"],
  registration: ["--issuer", "--platform-origin"],
  "source-info": ["--env-file"],
  backup: ["--env-file", "--source-fingerprint"],
  "verify-backup": ["--backup-id", "--manifest-sha256"],
};

export function parseArguments(args: string[]): {
  command: string;
  options: Record<string, string>;
} {
  const command = args[0];
  if (!Object.hasOwn(optionsByCommand, command)) throw new RebuildError("INVALID_COMMAND");
  const allowed = optionsByCommand[command];
  if (!allowed) throw new RebuildError("INVALID_COMMAND");
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1];
    if (!allowed.includes(key) || key in options || !value || value.startsWith("--"))
      throw new RebuildError("INVALID_ARGUMENTS");
    options[key] = value;
  }
  if (allowed.some((key) => !(key in options))) throw new RebuildError("REQUIRED_ARGUMENT_MISSING");
  return { command, options };
}

export async function main(args: string[]): Promise<unknown> {
  const { command, options } = parseArguments(args);
  switch (command) {
    case "prepare":
      await prepare(path.resolve(options["--release-dir"]));
      return { code: "PREPARED", directory: ".feline-blog/auth-rebuild", secretsPrinted: false };
    case "registration":
      return registration(options["--issuer"], options["--platform-origin"]);
    case "source-info": {
      const config = await sourceConfig(options["--env-file"]);
      return { sourceFingerprint: config.fingerprint, connected: false };
    }
    case "backup":
      return backup(options["--env-file"], options["--source-fingerprint"]);
    case "verify-backup": {
      const manifest = await verifyBackup(options["--backup-id"], options["--manifest-sha256"]);
      return {
        code: "BACKUP_VERIFIED",
        backupId: manifest.backupId,
        contentDigest: manifest.contentDigest,
      };
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2))));
  } catch (error) {
    // No driver messages, paths, URLs, rows, credentials or causes in logs.
    console.error(
      JSON.stringify({ code: error instanceof RebuildError ? error.code : "PREPARATION_FAILED" })
    );
    process.exitCode = 1;
  }
}
