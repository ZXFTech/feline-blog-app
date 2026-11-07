import path from "node:path";
import { writeFile } from "node:fs/promises";
import { backup } from "./backup";
import { holdSourceCutoff } from "./source-cutoff";
import { privateDirectory, insideState } from "./files";
import { RebuildError } from "./contracts";

async function main() {
  const options: Record<string, string> = {};
  const args = process.argv.slice(2),
    required = ["--lock-env-file", "--source-env-file", "--out"],
    keys = [...required, "--backup-id", "--manifest-sha256"];
  for (let i = 0; i < args.length; i += 2) {
    if (!keys.includes(args[i]) || !args[i + 1] || args[i] in options)
      throw new RebuildError("INVALID_ARGUMENTS");
    options[args[i]] = args[i + 1];
  }
  if (
    required.some((key) => !options[key]) ||
    Boolean(options["--backup-id"]) !== Boolean(options["--manifest-sha256"])
  )
    throw new RebuildError("REQUIRED_ARGUMENT_MISSING");
  const output = path.resolve(options["--out"]),
    relative = path.relative(path.resolve(".feline-blog"), output);
  if (relative.startsWith("..") || path.isAbsolute(relative) || insideState(relative) !== output)
    throw new RebuildError("MAINTENANCE_PLAN_PATH_REJECTED");
  await privateDirectory(path.dirname(output));
  const holder = await holdSourceCutoff(options["--lock-env-file"], options["--source-env-file"]);
  try {
    const result = options["--backup-id"]
      ? { backupId: options["--backup-id"], manifestSha256: options["--manifest-sha256"] }
      : await backup(options["--source-env-file"], holder.sourceFingerprint);
    const proof = await holder.certifyBackup(result.backupId, result.manifestSha256);
    await writeFile(output, JSON.stringify(proof, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        code: "SOURCE_CUTOFF_HELD",
        backupId: result.backupId,
        manifestSha256: result.manifestSha256,
        proofFile: output,
        maximumSeconds: 300,
        release: "type release or press Ctrl+C",
      })
    );
    await new Promise<void>((resolve) => {
      const timer = setTimeout(
        resolve,
        Math.max(1, 300_000 - (Date.now() - Date.parse(proof.lockedAt)))
      );
      const finish = () => {
        clearTimeout(timer);
        process.stdin.pause();
        resolve();
      };
      process.stdin.on("data", (chunk: Buffer) => {
        if (chunk.toString("utf8").trim() === "release") finish();
      });
      process.stdin.once("end", finish);
      process.once("SIGINT", finish);
      process.once("SIGTERM", finish);
      process.stdin.resume();
    });
  } finally {
    await holder.release();
  }
}
main().catch((error) => {
  console.error(
    JSON.stringify({ code: error instanceof RebuildError ? error.code : "SOURCE_CUTOFF_FAILED" })
  );
  process.exitCode = 1;
});
