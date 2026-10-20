// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import { validateSupabaseEnvironment } from "./src/integrations/supabase/env-contract.js";

// Keep Nitro's generated Worker date supported by the pinned Wrangler runtime.
// Bump it together with Wrangler after validating the new workerd runtime.
process.env["NITRO_COMPATIBILITY_DATE"] ||= "2026-10-19";

const modeArg = process.argv.indexOf("--mode");
const mode =
  modeArg >= 0
    ? process.argv[modeArg + 1] || "development"
    : process.argv.some((arg) => arg === "build")
      ? "production"
      : "development";
const loadedEnv = loadEnv(mode, process.cwd(), ["VITE_", "SUPABASE_"]);
const env = (key: string) => process.env[key] || loadedEnv[key];
const serverEnvironment = env("SUPABASE_ENVIRONMENT");
const browserEnvironment = env("VITE_SUPABASE_ENVIRONMENT");
if (serverEnvironment !== browserEnvironment) {
  throw new Error("Set matching SUPABASE_ENVIRONMENT and VITE_SUPABASE_ENVIRONMENT for this build");
}
if (!env("VITE_SUPABASE_URL") || !env("VITE_SUPABASE_PUBLISHABLE_KEY")) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY for this build mode");
}
const exposedSecret = Object.keys({ ...loadedEnv, ...process.env }).find((key) =>
  /^VITE_.*(SERVICE_ROLE|SECRET|ADMIN_KEY)/i.test(key),
);
if (exposedSecret)
  throw new Error(`${exposedSecret} must remain server-only and cannot be bundled`);
validateSupabaseEnvironment({
  browserUrl: env("VITE_SUPABASE_URL"),
  serverUrl: env("SUPABASE_URL"),
  projectRef: env("SUPABASE_PROJECT_REF"),
  browserProjectRef: env("VITE_SUPABASE_PROJECT_REF"),
  projectId: env("SUPABASE_PROJECT_ID"),
  browserProjectId: env("VITE_SUPABASE_PROJECT_ID"),
  environment:
    env("SUPABASE_ENVIRONMENT") ||
    env("VITE_SUPABASE_ENVIRONMENT") ||
    (mode === "test" ? "test" : "development"),
  browserEnvironment,
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
