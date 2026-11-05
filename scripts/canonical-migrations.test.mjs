import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalMigrations, validateMigrationInventory } from "./canonical-migrations.mjs";

test("canonical inventory includes both ACL migrations before revision/legacy guards", () => {
  const migrations = canonicalMigrations();
  const names = migrations.map((entry) => entry.file);
  const library = names.indexOf("20261020100000_training_library_least_privilege.sql");
  const helpers = names.indexOf("20261020120000_public_helper_function_privileges.sql");
  const revision = names.indexOf("20261105010000_workout_set_edit_revisions.sql");
  assert.ok(library >= 0 && helpers > library && revision > helpers);
});

test("inventory fails closed for missing/duplicate/reordered SQL, journal drift and changed SQL", () => {
  const sql = "SELECT 1;\n";
  const manifest = {
    version: 1,
    migrations: [{ file: "0000.sql", sha256: createHash("sha256").update(sql).digest("hex") }],
  };
  const journal = { entries: [{ idx: 0, tag: "0000", when: 1 }] };
  const files = { "0000.sql": sql };
  assert.equal(
    validateMigrationInventory(manifest, journal, { "0000.sql": "SELECT 1;\r\n" })[0].sql,
    sql,
  );
  for (const [m, j, f] of [
    [manifest, journal, {}],
    [manifest, journal, { ...files, "0001.sql": sql }],
    [{ ...manifest, migrations: [...manifest.migrations, ...manifest.migrations] }, journal, files],
    [manifest, { entries: [] }, files],
    [manifest, journal, { "0000.sql": "SELECT 2;\n" }],
  ])
    assert.throws(() => validateMigrationInventory(m, j, f));
});
