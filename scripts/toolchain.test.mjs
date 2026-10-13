import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { transform, transformSync } from "@esbuild-kit/core-utils";

test("scoped esbuild override preserves legacy loader transform APIs", async () => {
  const require = createRequire(import.meta.url);
  const loaderRequire = createRequire(require.resolve("@esbuild-kit/core-utils"));
  assert.equal(loaderRequire("esbuild").version, "0.25.12");
  const code = "export const value: number = 42;";
  for (const result of [transformSync(code, "fixture.ts"), await transform(code, "fixture.ts")]) {
    assert.match(result.code, /42/);
    assert.ok(result.map);
  }
});

test("Drizzle can load our TypeScript config without connecting to a database", () => {
  const result = execFileSync(
    process.execPath,
    ["node_modules/drizzle-kit/bin.cjs", "check", "--config=drizzle.config.ts"],
    {
      encoding: "utf8",
      env: { ...process.env, LOVABLE_DB_MIGRATION_URL: "" },
    },
  );
  assert.match(result, /Everything's fine/);
});
