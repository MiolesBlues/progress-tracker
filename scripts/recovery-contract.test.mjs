import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { validateBackupManifest, validateRestoreApproval } from "./recovery-contract.mjs";

const tempDirectories = [];
const tempDir = async () => {
  const path = await mkdtemp(join(tmpdir(), "pt-recovery-contract-"));
  tempDirectories.push(path);
  return path;
};
after(async () => {
  for (const path of tempDirectories) await rm(path, { recursive: true, force: true });
});

function coverage() {
  return Object.fromEntries(
    [
      "publicSchema",
      "publicData",
      "authDependencies",
      "migrationHistory",
      "rolesAndAcl",
      "extensions",
      "storageMetadata",
      "storageBytes",
      "authProviderConfig",
      "secretsAndExternalServices",
    ].map((component, index) => [
      component,
      index < 2
        ? { status: "included" }
        : { status: "unavailable", reason: "Not included in this sanitized fixture" },
    ]),
  );
}

async function manifestFixture() {
  const directory = await tempDir();
  const artifacts = [];
  for (const [component, filename, contents] of [
    ["publicSchema", "schema.sql", "-- sanitized schema fixture\n"],
    ["publicData", "data.sql", "-- sanitized data fixture\n"],
  ]) {
    await writeFile(join(directory, filename), contents);
    artifacts.push({
      component,
      path: filename,
      bytes: Buffer.byteLength(contents),
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  const manifest = {
    schemaVersion: 1,
    source: { projectRef: "szdmzvsenrnjxgjgregf", postgresVersion: "17.11.0.003" },
    authorization: { ticketId: "APPROVED-TEST-FIXTURE", approvedBy: "local test" },
    createdAt: "2026-10-20T12:00:00Z",
    artifacts,
    coverage: coverage(),
  };
  const manifestPath = join(directory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { directory, manifestPath, manifest };
}

test("backup manifest validates sanitized files, hashes, source identity, and explicit exclusions", async () => {
  const fixture = await manifestFixture();
  assert.deepEqual(await validateBackupManifest(fixture.manifestPath), {
    sourceProjectRef: "szdmzvsenrnjxgjgregf",
    artifactCount: 2,
    totalBytes: Buffer.byteLength("-- sanitized schema fixture\n-- sanitized data fixture\n"),
  });
});

test("backup manifest accepts only explicitly marked synthetic sources outside production", async () => {
  const fixture = await manifestFixture();
  fixture.manifest.source = {
    kind: "synthetic",
    projectRef: "synthetic-local",
    postgresVersion: "18.6",
  };
  fixture.manifest.authorization = {
    ticketId: "synthetic-fixture",
    approvedBy: "local-automation",
  };
  await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
  assert.equal(
    (await validateBackupManifest(fixture.manifestPath)).sourceProjectRef,
    "synthetic-local",
  );

  fixture.manifest.source.projectRef = "szdmzvsenrnjxgjgregf";
  await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
  await assert.rejects(validateBackupManifest(fixture.manifestPath), /source identity/);
});

test("backup manifest rejects modified files, path traversal, and missing dependency coverage", async () => {
  const fixture = await manifestFixture();
  await writeFile(join(fixture.directory, "schema.sql"), "modified\n");
  await assert.rejects(validateBackupManifest(fixture.manifestPath), /byte count|SHA-256/);

  fixture.manifest.artifacts[0].path = "../outside.sql";
  await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
  await assert.rejects(validateBackupManifest(fixture.manifestPath), /escapes/);

  fixture.manifest.artifacts[0].path = "schema.sql";
  delete fixture.manifest.coverage.authDependencies;
  await writeFile(fixture.manifestPath, JSON.stringify(fixture.manifest));
  await assert.rejects(validateBackupManifest(fixture.manifestPath), /coverage/);
});

test("restore destination approval rejects protected refs, mismatched URLs, and missing confirmation", () => {
  const base = {
    projectRef: "abcdefghijklmnopqrst",
    databaseUrl:
      "postgresql://postgres.abcdefghijklmnopqrst@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    approvedRef: "abcdefghijklmnopqrst",
    targetName: "phase5b1-disposable",
    confirmation: "I_APPROVE_EMPTY_DISPOSABLE_TARGET",
  };
  assert.deepEqual(validateRestoreApproval(base), {
    projectRef: "abcdefghijklmnopqrst",
    hostRef: null,
    userRef: "abcdefghijklmnopqrst",
  });
  for (const projectRef of ["szdmzvsenrnjxgjgregf", "fdzcwhzszbmpxyawrzzf", "jbxbgcqaywkbnsohjzcx"])
    assert.throws(
      () => validateRestoreApproval({ ...base, projectRef }),
      /cannot be restore destinations/,
    );
  assert.throws(
    () =>
      validateRestoreApproval({
        ...base,
        databaseUrl: base.databaseUrl.replace("abcdefghijklmnopqrst", "zyxwvutsrqponmlkjihg"),
      }),
    /different Supabase project/,
  );
  assert.throws(() => validateRestoreApproval({ ...base, confirmation: "" }), /confirmation/);
});
