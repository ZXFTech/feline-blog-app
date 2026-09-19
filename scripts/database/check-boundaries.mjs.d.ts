export type DatabaseDependencyCategory =
  | "legacyClient"
  | "legacyGenerated"
  | "legacyDriver"
  | "postgresDriver";

export type DatabaseDependencyAllowlist = Record<DatabaseDependencyCategory, string[]>;

export type DatabaseDependencyViolation = {
  file: string;
  line: number;
  category: DatabaseDependencyCategory;
  specifier: string;
};

export function classifyDatabaseDependency(
  filePath: string,
  specifier: string
): DatabaseDependencyCategory | null;

export function findViolationsInSource(
  filePath: string,
  sourceText: string,
  allowlist: DatabaseDependencyAllowlist
): DatabaseDependencyViolation[];
