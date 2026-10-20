import { resolve } from "node:path";
import { validateBackupManifest } from "./recovery-contract.mjs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node scripts/verify-backup-manifest.mjs <manifest.json>");
  process.exitCode = 2;
} else {
  try {
    const result = await validateBackupManifest(resolve(manifestPath));
    console.log(
      `Backup artifact integrity PASS for source ${result.sourceProjectRef}: ${result.artifactCount} files, ${result.totalBytes} bytes. This does not verify restore or component completeness.`,
    );
  } catch (error) {
    console.error(`Backup artifact integrity FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
