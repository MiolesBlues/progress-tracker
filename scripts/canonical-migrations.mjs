import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

export function validateMigrationInventory(manifest, journal, files) {
  assert.equal(manifest.version, 1, "unsupported migration manifest");
  const names = manifest.migrations.map((entry) => entry.file);
  const actual = Object.keys(files).sort();
  assert.deepEqual(names, actual, "canonical SQL inventory/order must match every migration");
  assert.deepEqual(
    journal.entries.map((entry) => `${entry.tag}.sql`),
    names,
    "Drizzle journal must enumerate the same canonical SQL exactly once and in order",
  );
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    names.map((_, index) => index),
  );
  const times = journal.entries.map((entry) => entry.when);
  assert.ok(
    times.every((time, i) => i === 0 || time > times[i - 1]),
    "journal times must increase",
  );
  return manifest.migrations.map((entry) => {
    const sql = files[entry.file].replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(sql, "utf8").digest("hex");
    assert.equal(hash, entry.sha256, `canonical SQL checksum mismatch: ${entry.file}`);
    return { file: entry.file, sql, sha256: hash };
  });
}

// Read/validate only: this module never connects to a database or runs migrations.
export function canonicalMigrations() {
  const root = new URL("../drizzle/migrations/", import.meta.url);
  const json = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
  const files = Object.fromEntries(
    readdirSync(root)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => [name, readFileSync(new URL(name, root), "utf8")]),
  );
  return validateMigrationInventory(
    json("meta/canonical-manifest.json"),
    json("meta/_journal.json"),
    files,
  );
}
