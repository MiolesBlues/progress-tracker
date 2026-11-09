import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/template-staging.spec.ts",
  timeout: 90_000,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  expect: { timeout: 10_000 },
  // Each test gets an isolated Playwright context and its own mock backend state.
  // This lets the four CI shards balance individual tests instead of whole files.
  fullyParallel: true,
  workers: 1,
  reporter: process.env["CI"]
    ? [["blob"], ["list"]]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "ru-RU",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://workout-e2e.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      SUPABASE_URL: "https://workout-e2e.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ENVIRONMENT: "test",
      VITE_SUPABASE_ENVIRONMENT: "test",
      ALLOW_STAGING_DEV: "false",
      SUPABASE_PROJECT_REF: "",
      VITE_SUPABASE_PROJECT_REF: "",
      SUPABASE_PROJECT_ID: "",
      VITE_SUPABASE_PROJECT_ID: "",
    },
    timeout: 120_000,
  },
});
