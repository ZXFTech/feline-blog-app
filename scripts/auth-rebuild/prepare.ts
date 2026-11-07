import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { releaseFiles, RebuildError, sdkVersion, sha256 } from "./contracts";
import { insideState, privateDirectory, regularFile } from "./files";

export async function verifyRelease(directory: string): Promise<void> {
  for (const [file, digest] of Object.entries(releaseFiles)) {
    if (sha256(await regularFile(path.join(directory, file))) !== digest)
      throw new RebuildError("RELEASE_DIGEST_MISMATCH");
  }
  const lines = (await regularFile(path.join(directory, "SHA256SUMS")))
    .toString("utf8")
    .trim()
    .split(/\r?\n/);
  if (
    lines.length !== Object.keys(releaseFiles).length ||
    lines.some((line) => {
      const match = /^([a-f0-9]{64})  ([a-zA-Z0-9.-]+)$/.exec(line);
      return (
        !match ||
        !Object.hasOwn(releaseFiles, match[2]) ||
        releaseFiles[match[2] as keyof typeof releaseFiles] !== match[1]
      );
    }) ||
    new Set(lines.map((line) => line.slice(66))).size !== lines.length
  )
    throw new RebuildError("RELEASE_DIGEST_MISMATCH");
}

export async function prepare(releaseDirectory: string): Promise<void> {
  await verifyRelease(releaseDirectory);
  const output = insideState("auth-rebuild");
  // Never overwrite a previous session secret or an operator's configuration.
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await mkdir(output, { mode: 0o700 });
  await privateDirectory(output);
  const artifacts = path.join(output, "release", sdkVersion);
  await mkdir(artifacts, { mode: 0o700, recursive: true });
  for (const file of [...Object.keys(releaseFiles), "SHA256SUMS"])
    await copyFile(
      path.join(releaseDirectory, file),
      path.join(artifacts, file),
      constants.COPYFILE_EXCL
    );
  await verifyRelease(artifacts);
  const manifest = {
    schemaVersion: 1,
    issuer: "",
    platformOrigin: "",
    clientId: "",
    authBasePath: "/api/auth",
    clientSecretEnv: "USER_CENTER_CLIENT_SECRET",
    sessionSecretEnv: "PLATFORM_SESSION_SECRET",
    returnTo: {
      fallback: "/profile",
      allowedPaths: ["/", "/profile", "/todo", "/tomato", "/blog/new", "/checklists"],
      allowedPathPrefixes: ["/blog/edit", "/checklists"],
      allowedQueryKeys: [],
    },
    errorPath: "/auth/error",
  };
  const templates = {
    "integration.template.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "runtime.env.template": `# Copy to an ignored application env file after review. Empty values are intentionally invalid.\nUSER_CENTER_CLIENT_SECRET=\nPLATFORM_SESSION_SECRET=${randomBytes(48).toString("base64url")}\nPOSTGRES_DATABASE_URL=\nPOSTGRES_SSL_CA=\n`,
    "source.env.template":
      "# Dedicated read only source. This file is never loaded by Next.\nPOSTGRES_BACKUP_URL=\nPOSTGRES_SSL_CA=\n",
    "maintenance.env.template":
      "# Dedicated new empty target. Never copy this connection into the application env.\nPOSTGRES_MIGRATION_URL=\nPOSTGRES_SSL_CA=\n",
  };
  for (const [file, contents] of Object.entries(templates))
    await writeFile(path.join(output, file), contents, { mode: 0o600, flag: "wx" });
}

export async function registration(issuer: string, platformOrigin: string): Promise<unknown> {
  const artifacts = insideState("auth-rebuild", "release", sdkVersion);
  await verifyRelease(artifacts);
  const reader = await mkdtemp(insideState("auth-rebuild", "registration-reader-"));
  await privateDirectory(reader);
  const sdk = path.join(reader, "node_modules", "@user-center", "next-better-auth");
  await mkdir(sdk, { recursive: true, mode: 0o700 });
  const unpack = spawnSync(
    "tar",
    [
      "-xf",
      path.join(artifacts, `user-center-next-better-auth-${sdkVersion}.tgz`),
      "-C",
      sdk,
      "--strip-components",
      "1",
    ],
    { windowsHide: true, stdio: "ignore" }
  );
  if (unpack.status !== 0) throw new RebuildError("SDK_EXTRACTION_FAILED");
  // Use the package's public export, never private implementation or a hand copied algorithm.
  const script = path.join(reader, "registration.mjs");
  await writeFile(
    script,
    'import { describeRegistration } from "@user-center/next-better-auth/config";\nlet input="";for await(const part of process.stdin)input+=part;try{console.log(JSON.stringify(describeRegistration({...JSON.parse(input),authBasePath:"/api/auth"})));}catch{process.exitCode=1;}\n',
    { mode: 0o600 }
  );
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ issuer, platformOrigin }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
  });
  if (result.status !== 0) throw new RebuildError("INVALID_REGISTRATION_CONFIG");
  return JSON.parse(result.stdout) as unknown;
}
