import path from "node:path";
import { pathToFileURL } from "node:url";
import { onlineDirectory } from "./online-target";

export async function runOnline(args: string[]) {
  if (args.length !== 1) throw Error("INVALID_ONLINE_COMMAND");
  const command = args[0];
  if (command === "prepare")
    return (await import("./online-configuration")).prepareOnlineConfiguration();
  if (command === "check")
    return (await import("./online-configuration")).checkOnlineConfiguration();
  if (command === "registration")
    return (await import("./online-configuration")).registrationForOnline();
  if (command === "metadata") return (await import("./online-metadata")).checkOnlineMetadata();
  if (command === "db-setup") return (await import("./online-postgres")).setupOnlineDatabase();
  if (command === "db-check") return (await import("./online-postgres")).verifyOnlineDatabase();
  if (command === "db-migrate") return (await import("./online-migration")).migrateOnlineDatabase();
  if (command === "doctor")
    return (await import("./profiles")).exportProfile([
      "doctor",
      "--env-file",
      path.join(onlineDirectory(), ".env.blog.local"),
    ]);
  if (command === "dev") {
    const checked = await (await import("./online-configuration")).checkOnlineConfiguration();
    if (checked.configuration !== "PASS") return checked;
    await (
      await import("./development-server")
    ).startDevelopment(path.join(onlineDirectory(), ".env.blog.local"), "online");
    return { started: true };
  }
  throw Error("INVALID_ONLINE_COMMAND");
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runOnline(process.argv.slice(2))
    .then((result) => {
      if (result && "configuration" in result && result.configuration !== "PASS")
        process.exitCode = 2;
      if (result && "status" in result && result.status === "BLOCKED") process.exitCode = 2;
      if (result && "exitCode" in result && typeof result.exitCode === "number")
        process.exitCode = result.exitCode;
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          code:
            error instanceof Error && /^[A-Z_]+$/.test(error.message)
              ? error.message
              : "ONLINE_LOCAL_COMMAND_FAILED",
          secretsPrinted: false,
        })
      );
      process.exitCode = 1;
    });
}
