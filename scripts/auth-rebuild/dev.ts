import { startDevelopment } from "./development-server";

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== "--env-file") throw Error();
  await startDevelopment(process.argv[3], "local");
}
main().catch(() => {
  console.error("LOCAL_SDK_CONFIGURATION_INCOMPLETE");
  process.exitCode = 1;
});
