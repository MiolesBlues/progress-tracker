// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The root .env is git-ignored, so hosted builds may start without it. These are the
// public backend URL and publishable key (safe in client code); Vite picks up VITE_*
// values from process.env, so set them only when the environment does not provide them.
const PUBLIC_BACKEND = {
  VITE_SUPABASE_URL: "https://jbxbgcqaywkbnsohjzcx.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_Plpo5ziJe8DkGoQSgDgmCg_IN4C7ArC",
  VITE_SUPABASE_PROJECT_ID: "jbxbgcqaywkbnsohjzcx",
};
for (const [key, value] of Object.entries(PUBLIC_BACKEND)) {
  if (!process.env[key]) process.env[key] = value;
}

export default defineConfig({
  vite: {
    // Explicit replacements survive hosted builds without .env and keep this app
    // on its verified backend, even if the host injects another project's values.
    define: Object.fromEntries(
      Object.entries(PUBLIC_BACKEND).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
