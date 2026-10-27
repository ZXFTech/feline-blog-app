import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Maintenance only. This connection must never be available to Next.js.
const url = process.env.POSTGRES_MIGRATION_URL;
if (!url || !process.argv.includes("--apply")) throw new Error("Explicit --apply and POSTGRES_MIGRATION_URL are required");
const target = new URL(url);
const runtime = process.env.FELINE_DATABASE_RUNTIME_ROLE ?? "app_runtime";
if (!/^[a-z][a-z0-9_]{0,62}$/.test(runtime) || runtime === "feline_auth_owner") throw new Error("Invalid runtime role");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
if (!local && !process.env.POSTGRES_SSL_CA) throw new Error("Verified TLS CA required");
const pool = new Pool({ connectionString: url, max: 1, ssl: local ? false : { ca: process.env.POSTGRES_SSL_CA, rejectUnauthorized: true }, connectionTimeoutMillis: 3000, query_timeout: 10000 });
try {
  const template = readFileSync(fileURLToPath(new URL("./permissions.sql", import.meta.url)), "utf8");
  await pool.query(template.replaceAll("__RUNTIME__", runtime));
  console.log("FELINE_AUTH_PERMISSIONS_INSTALLED");
} catch { console.error("FELINE_AUTH_PERMISSIONS_FAILED"); process.exitCode = 1; }
finally { await pool.end(); }
