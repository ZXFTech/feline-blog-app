import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
const url = new URL(process.env.POSTGRES_DATABASE_URL ?? "http://invalid");
const key = process.argv[2];
if (url.hostname !== "127.0.0.1" || !(url.port === "54341" || url.port === "54346" && process.env.FELINE_AUTH_TEST_OWNER === "oauth-post-20261019") || url.pathname !== "/feline_blog_dev" || !key) {
  throw new Error("Only the dedicated isolated fixture is permitted");
}
const { rateLimit } = await import("@/lib/auth/center/store");
const { AuthError } = await import("@/lib/auth/center/config");
const { postgresPool } = await import("@/db/postgres/runtime");
try {
  await rateLimit("test-process", key, 86400, 2);
  process.stdout.write("accepted");
} catch (error) {
  if (!(error instanceof AuthError) || error.code !== "RATE_LIMITED") throw error;
  process.stdout.write("limited");
} finally {
  await postgresPool.end();
}
