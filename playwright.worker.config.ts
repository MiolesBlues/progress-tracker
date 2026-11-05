import { defineConfig } from "@playwright/test";

// One production-artifact journey; the existing four-shard UI suite stays intact.
export default defineConfig({
  testDir: "./e2e-worker",
  outputDir: "test-results/worker",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/worker", open: "never" }]],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node node_modules/wrangler/bin/wrangler.js dev --local --config .output/server/wrangler.json --ip 127.0.0.1 --port 4174 --inspector-port 0",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SUPABASE_ENVIRONMENT: "test",
      VITE_SUPABASE_ENVIRONMENT: "test",
      SUPABASE_URL: "https://workout-e2e.invalid",
      VITE_SUPABASE_URL: "https://workout-e2e.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_PROJECT_REF: "",
      VITE_SUPABASE_PROJECT_REF: "",
      SUPABASE_PROJECT_ID: "",
      VITE_SUPABASE_PROJECT_ID: "",
      ALLOW_STAGING_DEV: "false",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ACCOUNT_ID: "",
      WRANGLER_SEND_METRICS: "false",
    },
  },
});
