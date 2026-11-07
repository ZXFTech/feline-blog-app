import { defineConfig, devices } from "@playwright/test";

// Safe HTTP UI fixtures only. This config never runs pnpm dev's database orchestrator.
export default defineConfig({
  testDir: "./e2e/sdk-offline",
  workers: 1,
  outputDir: ".feline-blog/auth-rebuild/ui-results",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3444", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3444",
    url: "http://127.0.0.1:3444/api/health",
    reuseExistingServer: false,
    env: {
      USER_CENTER_CONFIG_FILE: "__offline_ui_without_database__",
      USER_CENTER_RUNTIME_ENVIRONMENT: "development",
      USER_CENTER_TARGET_ENVIRONMENT: "development",
    },
  },
});
