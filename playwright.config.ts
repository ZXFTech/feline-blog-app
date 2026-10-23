import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: [".env.e2e.local", ".env.development"],
  quiet: true,
});

const stagingFile = /staging-smoke\.spec\.ts$/;
const isolatedActions =
  process.env.GITHUB_ACTIONS === "true" && process.env.C06_COMPLETE_E2E === "true";
const stagingUse = {
  baseURL: process.env.STAGING_SMOKE_ORIGIN,
  serviceWorkers: "block" as const,
  trace: "off" as const,
  screenshot: "off" as const,
  video: "off" as const,
};

export default defineConfig({
  testDir: "./e2e",
  // The authenticated scenarios share two database accounts and mutable records.
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "staging-desktop",
      testMatch: stagingFile,
      use: { ...devices["Desktop Chrome"], ...stagingUse },
    },
    {
      name: "staging-mobile",
      testMatch: stagingFile,
      use: { ...devices["iPhone 13"], ...stagingUse },
    },
    { name: "desktop", testIgnore: stagingFile, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: stagingFile, use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // Actions owns a disposable PostgreSQL service, not the managed daily local container.
    command: isolatedActions ? "pnpm exec next dev" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
