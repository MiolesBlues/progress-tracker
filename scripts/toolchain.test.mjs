import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { transform, transformSync } from "@esbuild-kit/core-utils";

test("Bun version, manifest and frozen lockfile retain the scoped security override", () => {
  execFileSync(process.execPath, ["scripts/check-dependency-contract.mjs"], { encoding: "utf8" });
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
  const normalizedOverrides = { ...lock.overrides };
  for (const [name, expected] of Object.entries(manifest.overrides)) {
    const actual = normalizedOverrides[name];
    if (
      typeof expected === "string" &&
      actual !== null &&
      typeof actual === "object" &&
      Object.keys(actual).length === 1 &&
      typeof actual["."] === "string"
    )
      normalizedOverrides[name] = actual["."];
  }
  assert.deepEqual(normalizedOverrides, manifest.overrides);
  assert.equal(lock.overrides["undici@^7"]["."], "7.30.1");
  assert.equal(lock.overrides["@esbuild-kit/core-utils"].esbuild, "0.25.12");
  assert.equal(lock.overrides.esbuild, undefined); // No global override on Vite/tsx's newer esbuild.
  assert.equal(lock.packages["@esbuild-kit/core-utils/esbuild"][0], "esbuild@0.25.12");
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.ok(workflow.includes(`bun-version: "${version}"`));
  assert.ok(
    workflow.indexOf("bun run check:dependencies") <
      workflow.indexOf("bun install --frozen-lockfile"),
  );
  assert.ok(workflow.includes("git diff --exit-code -- package.json bun.lock"));
});

test("every installed direct package matches the frozen lock, including the Lovable preset", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(
    execFileSync(
      "bun",
      ["-e", "console.log(JSON.stringify(Bun.JSONC.parse(await Bun.file('bun.lock').text())))"],
      { encoding: "utf8" },
    ),
  );
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
    assert.equal(`${name}@${installed.version}`, lock.packages[name][0], name);
  }
});

test("preinstall guard rejects an older generated lock or lost override without node_modules", () => {
  const fixture = mkdtempSync(join(tmpdir(), "progress-dependency-contract-"));
  const script = resolve("scripts/check-dependency-contract.mjs");
  const manifest = readFileSync("package.json", "utf8");
  const lock = JSON.parse(
    execFileSync(
      "bun",
      ["-e", "console.log(JSON.stringify(Bun.JSONC.parse(await Bun.file('bun.lock').text())))"],
      { encoding: "utf8" },
    ),
  );
  writeFileSync(join(fixture, "package.json"), manifest);
  const check = () => execFileSync(process.execPath, [script], { cwd: fixture, stdio: "pipe" });
  writeFileSync(join(fixture, "bun.lock"), JSON.stringify(lock));
  assert.doesNotThrow(check);
  writeFileSync(join(fixture, "bun.lock"), JSON.stringify({ ...lock, lockfileVersion: 1 }));
  assert.throws(check, /older generator/);
  writeFileSync(
    join(fixture, "bun.lock"),
    JSON.stringify({ ...lock, overrides: { rolldown: "1.2.1" } }),
  );
  assert.throws(check, /overrides differ/);
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

test("Vite and tsx resolve their newer esbuild independently of the legacy loader override", () => {
  for (const name of ["vite", "tsx"])
    assert.equal(
      createRequire(resolve(`node_modules/${name}/package.json`))("esbuild").version,
      "0.28.2",
    );
  assert.equal(
    createRequire(resolve("node_modules/drizzle-kit/package.json"))("esbuild").version,
    "0.25.12",
  );
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
