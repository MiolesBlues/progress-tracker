import { defineConfig } from "@playwright/test";

const projectRef = "fdzcwhzszbmpxyawrzzf";
const supabaseUrl = process.env["TEMPLATE_STAGING_URL"];
const publishableKey = process.env["TEMPLATE_STAGING_PUBLISHABLE_KEY"];
if (!supabaseUrl || new URL(supabaseUrl).hostname !== `${projectRef}.supabase.co`)
  throw new Error("Staging E2E requires the ProgressTracker (Staging) project URL.");
if (!publishableKey || publishableKey.startsWith("sb_secret_"))
  throw new Error("Staging E2E requires only a staging publishable/anon key.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "template-staging.spec.ts",
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: "staging-chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      VITE_SUPABASE_PROJECT_ID: projectRef,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    timeout: 120_000,
  },
});
