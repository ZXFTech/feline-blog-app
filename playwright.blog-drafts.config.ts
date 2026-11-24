import { defineConfig, devices } from "@playwright/test";

const origin = process.env.BLOG_DRAFT_E2E_ORIGIN;
if (origin !== "https://blog.user-center.test:3446") {
  throw new Error("Blog drafts E2E requires the dedicated loopback SDK fixture.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "blog-author-rendering.spec.ts",
    "blog-drafts.spec.ts",
    "blog-editor-layout.spec.ts",
    "blog-markdown.spec.ts",
    "blog-reading.spec.ts",
  ],
  workers: 1,
  outputDir: ".feline-blog/blog-drafts-e2e/results",
  reporter: [["line"], ["json", { outputFile: ".feline-blog/blog-drafts-e2e/report.json" }]],
  use: {
    baseURL: origin,
    proxy: { server: "http://127.0.0.1:3448", bypass: "127.0.0.1" },
    ignoreHTTPSErrors: true,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: [
    {
      command: `"${process.execPath}" e2e/blog-draft-runner.mjs --issuer-server`,
      url: "https://127.0.0.1:3447/api/auth/.well-known/openid-configuration",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
    {
      command: `"${process.execPath}" e2e/blog-draft-runner.mjs --app-server`,
      url: "https://127.0.0.1:3446/api/health",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
