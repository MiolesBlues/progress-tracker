import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const recoveryScript = new URL("./recovery/Invoke-SyntheticRecovery.ps1", import.meta.url);

test("synthetic recovery requires a named new target and refuses overwrite or port substitution", async () => {
  const source = await readFile(recoveryScript, "utf8");
  assert.match(source, /ValidatePattern\('\^synthetic-track-a-/);
  assert.match(source, /ValidateSet\('CREATE_SYNTHETIC_TRACK_A_TARGET'\)/);
  assert.match(source, /if \(Test-Path -LiteralPath \$targetRoot\).*refusing to overwrite/s);
  assert.match(source, /if \(\$listener\).*refusing to select another server implicitly/s);
  assert.match(source, /At least 1 GiB of free space/);
  assert.match(source, /icacls\.exe \$passFile[\s\S]*if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(source, /listen_addresses = '127\.0\.0\.1'/);
  assert.match(source, /'127\.0\.0\.1'/);
});

test("synthetic recovery validates artifact checksums before restore and never labels fixture as production", async () => {
  const source = await readFile(recoveryScript, "utf8");
  assert.match(source, /verify-backup-manifest\.mjs/);
  assert.match(source, /pg_restore\.exe/);
  assert.match(source, /productionBackup = \$false/);
  assert.match(source, /productionBaselineV4Rehearsal = \$false/);
});
