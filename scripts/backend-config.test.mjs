import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("browser configuration retains the verified backend without .env or host settings", () => {
  const cwd = mkdtempSync(join(tmpdir(), "workout-backend-config-"));
  const configUrl = pathToFileURL(resolve("vite.config.ts")).href;
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_SUPABASE_")) delete env[key];
  }
  // A host-provided project must not redirect this app's existing users.
  env.VITE_SUPABASE_URL = "https://unrelated.invalid";
  env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_unrelated";
  try {
    const output = execFileSync(
      "bun",
      [
        "--eval",
        `const { default: config } = await import(${JSON.stringify(configUrl)});
         const resolved = await config({ command: "build", mode: "production" });
         console.log(JSON.stringify(resolved.define));`,
      ],
      { cwd, env, encoding: "utf8" },
    );
    const defines = JSON.parse(output.trim().split("\n").at(-1));
    assert.equal(
      JSON.parse(defines["import.meta.env.VITE_SUPABASE_URL"]),
      "https://jbxbgcqaywkbnsohjzcx.supabase.co",
    );
    const key = JSON.parse(defines["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"]);
    assert.equal(key, "sb_publishable_Plpo5ziJe8DkGoQSgDgmCg_IN4C7ArC");
    assert.ok(key.startsWith("sb_publishable_"));
    assert.equal(
      JSON.parse(defines["import.meta.env.VITE_SUPABASE_PROJECT_ID"]),
      "jbxbgcqaywkbnsohjzcx",
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});