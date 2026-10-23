import { randomBytes, randomUUID } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { validateEmail, validatePassword } from "@/utils/auth";

const stagingOrigin = "https://feline-blog-staging-3ec51f95bf630efc-2918s-projects.vercel.app";

export function assertIsolatedE2eEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): URL {
  for (const name of ["CI", "GITHUB_ACTIONS", "C06_COMPLETE_E2E"]) {
    if (environment[name] !== "true")
      throw new Error("Disposable E2E requires explicit Actions context.");
  }
  const url = new URL(environment.C06_ADMIN_DATABASE_URL ?? "https://invalid.example.test");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    url.pathname !== "/feline_blog_dev" ||
    url.username !== "postgres" ||
    url.search ||
    url.hash
  )
    throw new Error("Disposable E2E only accepts its Actions loopback database.");
  if (environment.STAGING_SMOKE_ORIGIN !== stagingOrigin) {
    throw new Error("Staging smoke origin does not match the verified project alias.");
  }
  return url;
}

export function createE2eAccounts() {
  return [
    {
      id: randomUUID(),
      email: "c06-primary@example.test",
      role: "ROOT",
      password: "Aa1" + randomBytes(24).toString("hex"),
    },
    {
      id: randomUUID(),
      email: "c06-other@example.test",
      role: "USER",
      password: "Aa1" + randomBytes(24).toString("hex"),
    },
  ];
}

async function prepare(): Promise<void> {
  const adminUrl = assertIsolatedE2eEnvironment(process.env);
  const files = [".env.development", ".env.e2e.local"];
  for (const file of files) {
    const exists = await access(file).then(
      () => true,
      () => false
    );
    if (exists) throw new Error("Refusing to overwrite an existing environment file.");
  }
  const runtimePassword = randomBytes(32).toString("hex");
  const jwtSecret = randomBytes(48).toString("hex");
  const accounts = createE2eAccounts();
  if (
    accounts.some(
      ({ email, password }) => !validateEmail(email) || !validatePassword(password).isValid
    )
  ) {
    throw new Error("Disposable E2E accounts must satisfy the registration policy.");
  }
  for (const secret of [runtimePassword, jwtSecret, ...accounts.map(({ password }) => password)]) {
    console.log("::add-mask::" + secret);
  }

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM public.users"
    );
    const roles = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime'");
    if (users.rows[0]?.count !== "0" || roles.rowCount !== 0) {
      throw new Error("Disposable E2E requires an empty, newly migrated database.");
    }
    // Only generated hex is interpolated into DDL; fixture values use bound parameters.
    await client.query(
      "CREATE ROLE app_runtime LOGIN PASSWORD '" +
        runtimePassword +
        "' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION"
    );
    await client.query("GRANT CONNECT ON DATABASE feline_blog_dev TO app_runtime");
    await client.query("GRANT USAGE ON SCHEMA public TO app_runtime");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime"
    );
    await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime");
    for (const account of accounts) {
      await client.query(
        'INSERT INTO public.users (id, email, username, password, role, "updateAt") VALUES ($1, $2, $3, $4, $5, now())',
        [
          account.id,
          account.email,
          "C06 fixture",
          await bcrypt.hash(account.password, 10),
          account.role,
        ]
      );
    }
    await client.query(
      'INSERT INTO public."Blog" ("authorId", title, content, "updatedAt") VALUES ($1, $2, $3, now())',
      [accounts[0].id, "C06 baseline article", "Disposable Actions fixture."]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = "app_runtime";
  runtimeUrl.password = runtimePassword;
  await writeFile(
    files[0],
    [
      "POSTGRES_ENVIRONMENT=local",
      "POSTGRES_DATABASE_URL=" + runtimeUrl,
      "JWT_SECRET=" + jwtSecret,
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 }
  );
  await writeFile(
    files[1],
    [
      "E2E_USER_EMAIL=" + accounts[0].email,
      "E2E_USER_PASSWORD=" + accounts[0].password,
      "E2E_OTHER_USER_EMAIL=" + accounts[1].email,
      "E2E_OTHER_USER_PASSWORD=" + accounts[1].password,
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 }
  );
  console.log("Prepared two disposable local accounts and a restricted runtime role.");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  prepare().catch(() => {
    console.error("Disposable E2E preparation failed. No remote database is permitted.");
    process.exitCode = 1;
  });
}
