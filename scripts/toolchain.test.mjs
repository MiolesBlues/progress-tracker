import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { transform, transformSync } from "@esbuild-kit/core-utils";

test("Bun version, manifest and frozen lockfile retain the scoped security override", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const version = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
  assert.equal(manifest.packageManager, `bun@${version}`);
  const lock = JSON.parse(
    execFileSync(
      "bun",
      ["-e", "console.log(JSON.stringify(Bun.JSONC.parse(await Bun.file('bun.lock').text())))"],
      { encoding: "utf8" },
    ),
  );
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.overrides, manifest.overrides);
  assert.equal(lock.overrides["@esbuild-kit/core-utils"].esbuild, "0.25.12");
  assert.equal(lock.overrides.esbuild, undefined); // No global override on Vite/tsx's newer esbuild.
  assert.equal(lock.packages["@esbuild-kit/core-utils/esbuild"], undefined);
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.ok(workflow.includes(`bun-version: "${version}"`));
});

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
