import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RebuildError } from "./contracts";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const stateRoot = path.join(repositoryRoot, ".feline-blog");
const comparablePath = (value: string): string =>
  process.platform === "win32" ? value.toLowerCase() : value;

export async function regularFile(file: string): Promise<Buffer> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new RebuildError("UNSAFE_INPUT_FILE");
  return readFile(file);
}

export async function privateConfigFile(file: string): Promise<Buffer> {
  const absolute = path.resolve(file);
  if (!comparablePath(absolute).startsWith(`${comparablePath(path.resolve(stateRoot))}${path.sep}`))
    throw new RebuildError("SOURCE_CONFIG_LOCATION_REJECTED");
  const stat = await lstat(absolute);
  const resolved = await realpath(absolute);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 1024 * 1024 ||
    comparablePath(resolved) !== comparablePath(absolute)
  )
    throw new RebuildError("UNSAFE_INPUT_FILE");
  if (process.platform === "win32") {
    const script =
      '$ErrorActionPreference="Stop"; $acl=[System.IO.File]::GetAccessControl($env:FELINE_CONFIG_ACL_PATH); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($rule in $acl.Access){if($rule.AccessControlType -eq "Allow"){ $who=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($who -ne $sid -and $who -ne "S-1-5-18"){exit 1}}}';
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        env: { ...process.env, FELINE_CONFIG_ACL_PATH: absolute },
        windowsHide: true,
        stdio: "ignore",
        timeout: 10000,
      }
    );
    if (result.status !== 0) throw new RebuildError("SOURCE_CONFIG_PERMISSIONS_REJECTED");
  } else if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) {
    throw new RebuildError("SOURCE_CONFIG_PERMISSIONS_REJECTED");
  }
  return regularFile(absolute);
}

// mode alone does not restrict inherited Windows ACLs.
export async function privateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await realpath(directory);
  if (
    comparablePath(resolved) !== comparablePath(path.resolve(directory)) ||
    (await lstat(directory)).isSymbolicLink()
  ) {
    throw new RebuildError("UNSAFE_OUTPUT_DIRECTORY");
  }
  if (process.platform === "win32") {
    const identity = spawnSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const sid = identity.stdout?.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
    if (identity.status !== 0 || !sid) throw new RebuildError("PRIVATE_DIRECTORY_FAILED");
    const acl = spawnSync(
      "icacls.exe",
      [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"],
      { windowsHide: true, stdio: "ignore" }
    );
    if (acl.status !== 0) throw new RebuildError("PRIVATE_DIRECTORY_FAILED");
  } else await chmod(directory, 0o700);
}

export function insideState(...parts: string[]): string {
  const result = path.resolve(stateRoot, ...parts);
  if (!result.startsWith(`${path.resolve(stateRoot)}${path.sep}`))
    throw new RebuildError("UNSAFE_OUTPUT_DIRECTORY");
  return result;
}
