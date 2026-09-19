import path from "node:path";
import { describe, expect, it } from "vitest";
import { findViolationsInSource } from "./check-boundaries.mjs";

const root = process.cwd();
const emptyAllowlist = {
  legacyClient: [],
  legacyGenerated: [],
  legacyDriver: [],
  postgresDriver: [],
};

function check(source: string, file = "src/features/new-feature.ts") {
  return findViolationsInSource(path.join(root, file), source, emptyAllowlist);
}

describe("database dependency boundary", () => {
  it("allows a listed legacy client consumer", () => {
    const file = "src/db/todoAction.ts";
    const violations = findViolationsInSource(
      path.join(root, file),
      'import db from "@/db/legacy-mysql/client";',
      { ...emptyAllowlist, legacyClient: [file] }
    );

    expect(violations).toEqual([]);
  });

  it("allows a listed PostgreSQL operations script", () => {
    const file = "scripts/database/configure-postgres-roles.ts";
    const violations = findViolationsInSource(path.join(root, file), 'import { Pool } from "pg";', {
      ...emptyAllowlist,
      postgresDriver: [file],
    });

    expect(violations).toEqual([]);
  });

  it.each([
    ['import db from "@/db/legacy-mysql/client";', "legacyClient"],
    ['import type { Role } from "../../generated/prisma/enums";', "legacyGenerated"],
    ['export { default } from "../db/legacy-mysql/client";', "legacyClient"],
    ['const db = await import("@/db/legacy-mysql/client");', "legacyClient"],
    ['vi.mock("@/db/legacy-mysql/client");', "legacyClient"],
    ['import { PrismaMariaDb } from "@prisma/adapter-mariadb";', "legacyDriver"],
    ['import mariadb from "mariadb";', "legacyDriver"],
    ['import mysql from "mysql2/promise";', "legacyDriver"],
    ['import { Pool } from "pg";', "postgresDriver"],
  ])("blocks unlisted database dependency: %s", (source, category) => {
    expect(check(source)).toEqual([
      expect.objectContaining({ category, file: "src/features/new-feature.ts" }),
    ]);
  });

  it("does not classify the PostgreSQL default client as legacy", () => {
    expect(check('import db from "@/db/client";')).toEqual([]);
  });
});
