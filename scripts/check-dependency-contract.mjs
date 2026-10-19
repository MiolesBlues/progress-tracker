import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Deliberately uses only Node built-ins and the pinned Bun binary: this gate
// must run before installation, including after an editor replaces bun.lock.
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const version = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
assert.equal(manifest.packageManager, `bun@${version}`, "Use the project's pinned Bun");
const lock = JSON.parse(
  execFileSync(
    "bun",
    ["-e", "console.log(JSON.stringify(Bun.JSONC.parse(await Bun.file('bun.lock').text())))"],
    { encoding: "utf8" },
  ),
);
assert.equal(lock.lockfileVersion, 3, "An older generator replaced the scoped-override lockfile");
assert.deepEqual(lock.overrides, manifest.overrides, "Manifest and lockfile overrides differ");
assert.equal(lock.overrides["@esbuild-kit/core-utils"].esbuild, "0.25.12");
assert.equal(lock.overrides.esbuild, undefined, "Do not override newer Vite/tsx esbuild globally");
assert.equal(lock.packages.esbuild[0], `esbuild@${manifest.devDependencies.esbuild}`);
for (const group of ["dependencies", "devDependencies"])
  assert.deepEqual(lock.workspaces[""][group], manifest[group], `${group} drift in bun.lock`);
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!entry[0].startsWith("esbuild@")) continue;
  const [major, minor] = entry[0].slice("esbuild@".length).split(".").map(Number);
  assert.ok(major > 0 || minor >= 25, `Vulnerable esbuild in ${path}: ${entry[0]}`);
}
const preset = "@lovable.dev/vite-tanstack-config";
assert.equal(lock.packages[preset][0], `${preset}@${manifest.devDependencies[preset]}`);
console.log(`Dependency contract OK: Bun ${version}, lockfile v3, scoped esbuild override`);
