import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "");
const postgresVersion = process.argv[3];
if (!process.argv[2] || !/^(17|18)\./.test(postgresVersion ?? "")) {
  console.error(
    "Usage: node scripts/recovery/create-synthetic-manifest.mjs <directory> <postgres-version>",
  );
  process.exitCode = 2;
} else {
  const artifacts = [];
  for (const [component, path] of [
    ["publicSchema", "public-schema.dump"],
    ["publicData", "public-data.dump"],
    ["authDependencies", "auth.dump"],
  ]) {
    const fullPath = resolve(directory, path);
    const [bytes, info] = await Promise.all([readFile(fullPath), stat(fullPath)]);
    if (!info.isFile() || info.size === 0) throw new Error(`Missing synthetic artifact: ${path}`);
    artifacts.push({
      component,
      path,
      bytes: info.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  const excludedReason =
    "Deliberately omitted from this synthetic local fixture; not a production backup.";
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: { kind: "synthetic", projectRef: "synthetic-local", postgresVersion },
    authorization: { ticketId: "synthetic-fixture", approvedBy: "local-automation" },
    artifacts,
    coverage: {
      publicSchema: { status: "included" },
      publicData: { status: "included" },
      authDependencies: { status: "included" },
      migrationHistory: { status: "excluded", reason: excludedReason },
      rolesAndAcl: { status: "excluded", reason: excludedReason },
      extensions: { status: "excluded", reason: excludedReason },
      storageMetadata: { status: "excluded", reason: excludedReason },
      storageBytes: { status: "excluded", reason: excludedReason },
      authProviderConfig: { status: "excluded", reason: excludedReason },
      secretsAndExternalServices: { status: "excluded", reason: excludedReason },
    },
  };
  await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  console.log("Synthetic manifest created; this is not a production backup.");
}
