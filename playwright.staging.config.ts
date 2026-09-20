import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.STAGING_SMOKE_ORIGIN;
if (!baseURL) throw new Error("STAGING_SMOKE_ORIGIN is required.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "staging-smoke.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 5 * 60 * 1000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  reporter: [["line"]],
});
