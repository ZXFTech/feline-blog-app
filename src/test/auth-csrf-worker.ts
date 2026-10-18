import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
const url = new URL(process.env.POSTGRES_DATABASE_URL ?? "http://invalid");
const key = process.argv[2], count = Number(process.argv[3]);
if (url.hostname !== "127.0.0.1" || url.port !== "54341" || url.pathname !== "/feline_blog_dev" || !key || !Number.isInteger(count) || count < 1 || count > 20) throw new Error("Only the dedicated isolated fixture is permitted");
process.env.FELINE_TRUSTED_PROXY = "true";
const { authHttp } = await import("@/lib/auth/center/http");
const { postgresPool } = await import("@/db/postgres/runtime");
const statuses = [];
try {
  for (let index = 0; index < count; index++) {
    const response = await authHttp(new Request(`${process.env.FELINE_PUBLIC_ORIGIN}/api/auth/csrf`, { headers: { "x-real-ip": key } }), "csrf");
    statuses.push(response.status);
  }
  process.stdout.write(JSON.stringify(statuses));
} finally { await postgresPool.end(); }
