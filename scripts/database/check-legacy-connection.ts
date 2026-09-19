import legacyMysqlDb from "../../src/db/legacy-mysql/client";

try {
  await legacyMysqlDb.$queryRaw`SELECT 1 AS ok`;
  console.log("Legacy MySQL read only connection check passed.");
} finally {
  await legacyMysqlDb.$disconnect();
}
