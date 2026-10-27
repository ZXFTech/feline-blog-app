import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testIgnore: "**/staging-smoke.spec.ts", workers: 1, timeout: 90000, expect: { timeout: 15000 },
  use: { baseURL: "http://localhost:13000", trace: "off", screenshot: "only-on-failure" },
  projects: [ { name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["iPhone 13"] } } ],
  reporter: [["line"], ["json", { outputFile: ".feline-blog/e2e-results.json" }]],
});
