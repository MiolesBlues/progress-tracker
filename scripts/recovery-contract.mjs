import { createReadStream } from "node:fs";
import { realpath, stat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const PRODUCTION_PROJECT_REF = "szdmzvsenrnjxgjgregf";
export const FORBIDDEN_RESTORE_REFS = new Set([
  PRODUCTION_PROJECT_REF,
  "fdzcwhzszbmpxyawrzzf",
  "jbxbgcqaywkbnsohjzcx",
]);
const COVERAGE_COMPONENTS = [
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
];
const sha256Pattern = /^[a-f0-9]{64}$/i;

export function validateRestoreApproval({
  projectRef,
  databaseUrl,
  approvedRef,
  targetName,
  confirmation,
}) {
  if (!/^[a-z0-9]{20}$/.test(projectRef ?? ""))
    throw new Error("Restore target project ref is missing or malformed");
  if (FORBIDDEN_RESTORE_REFS.has(projectRef))
    throw new Error("Production, staging, and legacy refs cannot be restore destinations");
  if (approvedRef !== projectRef)
    throw new Error("Approved restore ref does not match the destination project ref");
  if (targetName !== "phase5b1-disposable")
    throw new Error("Restore target is not marked as the dedicated disposable environment");
  if (confirmation !== "I_APPROVE_EMPTY_DISPOSABLE_TARGET")
    throw new Error("Explicit empty disposable target confirmation is required");

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Restore destination must be a PostgreSQL URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    throw new Error("Restore destination must use PostgreSQL TLS connection settings");
  const hostRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  const userRef = /\.([a-z0-9]{20})$/i.exec(decodeURIComponent(url.username))?.[1];
  if (!hostRef && !userRef) throw new Error("Restore URL does not identify a Supabase project ref");
  if ((hostRef && hostRef !== projectRef) || (userRef && userRef !== projectRef))
    throw new Error("Restore URL identifies a different Supabase project");
  return { projectRef, hostRef: hostRef ?? null, userRef: userRef ?? null };
}

export async function validateBackupManifest(manifestPath) {
  const manifestFile = await realpath(resolve(manifestPath));
  const root = await realpath(dirname(manifestFile));
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported recovery manifest version");
  const synthetic = manifest.source?.kind === "synthetic";
  if (
    synthetic
      ? manifest.source?.projectRef !== "synthetic-local"
      : manifest.source?.projectRef !== PRODUCTION_PROJECT_REF
  )
    throw new Error("Backup source identity is not an allowed production or synthetic source");
  if (
    typeof manifest.authorization?.ticketId !== "string" ||
    !manifest.authorization.ticketId.trim() ||
    typeof manifest.authorization?.approvedBy !== "string" ||
    !manifest.authorization.approvedBy.trim() ||
    (synthetic && manifest.authorization.ticketId !== "synthetic-fixture")
  )
    throw new Error("Manifest must reference a valid export approval or synthetic fixture");
  const compatibleVersion = synthetic ? /^(17|18)\./ : /^17\./;
  if (!compatibleVersion.test(manifest.source?.postgresVersion ?? ""))
    throw new Error(
      "Backup PostgreSQL version is missing or incompatible with its declared source",
    );
  if (!Number.isFinite(Date.parse(manifest.createdAt)))
    throw new Error("Backup creation timestamp is invalid");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 2)
    throw new Error("Manifest must list separate schema and data artifacts");
  const coverage = manifest.coverage;
  if (!coverage || COVERAGE_COMPONENTS.some((component) => !coverage[component]))
    throw new Error("Every database and external dependency coverage item must be declared");

  for (const component of COVERAGE_COMPONENTS) {
    const entry = coverage[component];
    if (!["included", "excluded", "unavailable"].includes(entry.status))
      throw new Error(`Coverage status is invalid for ${component}`);
    if (entry.status === "included") {
      if (!manifest.artifacts.some((artifact) => artifact.component === component))
        throw new Error(`Included component has no artifact: ${component}`);
    } else if (typeof entry.reason !== "string" || entry.reason.trim().length < 8) {
      throw new Error(`Excluded component requires a reason: ${component}`);
    }
  }

  const components = new Set(manifest.artifacts.map((artifact) => artifact.component));
  if (!components.has("publicSchema") || !components.has("publicData"))
    throw new Error("Separate public schema and application data artifacts are required");

  let totalBytes = 0;
  const artifactPaths = new Set();
  for (const artifact of manifest.artifacts) {
    if (typeof artifact.path !== "string" || isAbsolute(artifact.path))
      throw new Error("Artifact paths must be relative to the manifest directory");
    const path = resolve(root, artifact.path);
    if (artifactPaths.has(path)) throw new Error("Manifest repeats an artifact path");
    artifactPaths.add(path);
    const pathRelative = relative(root, path);
    if (!pathRelative || pathRelative === ".." || pathRelative.startsWith(`..${sep}`))
      throw new Error("Artifact path escapes the manifest directory");
    const actualPath = await realpath(path);
    const realRelative = relative(root, actualPath);
    if (realRelative === ".." || realRelative.startsWith(`..${sep}`))
      throw new Error("Artifact symlink escapes the manifest directory");
    const info = await stat(actualPath);
    if (!info.isFile() || !Number.isSafeInteger(artifact.bytes) || info.size !== artifact.bytes)
      throw new Error("Artifact file type or byte count does not match the manifest");
    if (!sha256Pattern.test(artifact.sha256 ?? ""))
      throw new Error("Artifact SHA-256 is missing or malformed");
    const digest = await hashFile(actualPath);
    if (digest !== artifact.sha256.toLowerCase())
      throw new Error("Artifact SHA-256 does not match the manifest");
    totalBytes += info.size;
  }
  if (!Number.isSafeInteger(totalBytes)) throw new Error("Combined artifact size is invalid");
  return {
    sourceProjectRef: manifest.source.projectRef,
    artifactCount: manifest.artifacts.length,
    totalBytes,
  };
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
