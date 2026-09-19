import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const allowlistPath = path.join(root, "config/database-legacy-allowlist.json");
const sourceRoots = ["src", "e2e", "scripts"].map((directory) => path.join(root, directory));
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function stripKnownExtension(value) {
  return value.replace(/\.(?:[cm]?[jt]sx?)$/, "");
}

function resolveSpecifier(filePath, specifier) {
  if (specifier.startsWith("@/")) return path.join(root, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(filePath), specifier);
  return null;
}

export function classifyDatabaseDependency(filePath, specifier) {
  if (
    ["@prisma/adapter-mariadb", "mariadb", "mysql2"].some(
      (name) => specifier === name || specifier.startsWith(`${name}/`)
    )
  ) {
    return "legacyDriver";
  }
  if (
    ["@prisma/adapter-pg", "pg"].some(
      (name) => specifier === name || specifier.startsWith(`${name}/`)
    )
  ) {
    return "postgresDriver";
  }

  const resolved = resolveSpecifier(filePath, specifier);
  if (!resolved) return null;
  const normalized = normalizePath(stripKnownExtension(resolved));
  if (normalized.endsWith("/src/db/legacy-mysql/client")) return "legacyClient";
  if (
    normalized.includes("/generated/prisma/") &&
    !normalized.includes("/generated/prisma-postgres/")
  ) {
    return "legacyGenerated";
  }
  return null;
}

function moduleSpecifiers(sourceText, filePath) {
  const scriptKind = filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const results = [];

  function addLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) {
      results.push({
        specifier: node.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      addLiteral(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      addLiteral(node.argument.literal);
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(expression) && expression.text === "require";
      const isMock =
        ts.isPropertyAccessExpression(expression) &&
        ["mock", "doMock", "unmock"].includes(expression.name.text);
      if (isDynamicImport || isRequire || isMock) addLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

export function findViolationsInSource(filePath, sourceText, allowlist) {
  const relativePath = normalizePath(path.relative(root, filePath));
  return moduleSpecifiers(sourceText, filePath).flatMap(({ specifier, line }) => {
    const category = classifyDatabaseDependency(filePath, specifier);
    if (!category || allowlist[category]?.includes(relativePath)) return [];
    return [{ file: relativePath, line, category, specifier }];
  });
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "generated", ".next", "dist"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(fullPath)));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

async function main() {
  const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
  const files = (await Promise.all(sourceRoots.map(collectSourceFiles))).flat();
  const violations = [];
  for (const file of files) {
    violations.push(...findViolationsInSource(file, await readFile(file, "utf8"), allowlist));
  }

  if (violations.length) {
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line} ${violation.category} import is not allowed: ${violation.specifier}`
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Database dependency boundary check passed for ${files.length} source files.`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
