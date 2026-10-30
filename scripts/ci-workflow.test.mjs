import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/quality.yml", "utf8");

test("quality workflow runs on main PRs, all pushes and manual dispatch with read-only permissions", () => {
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /\n  push:\n    branches: \["\*\*"\]/);
  assert.match(workflow, /\n  workflow_dispatch:\n/);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(
    workflow,
    /permissions:[\s\S]*?\b(?:write-all|contents: write|actions: write)\b/,
  );
  assert.match(workflow, /runs-on: ubuntu-24\.04/g);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("all external actions are pinned to full commit SHAs with reviewed release labels", () => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)\s+#\s+([^\s]+)$/gm)];
  assert.equal(uses.length, 11);
  for (const [, reference, release] of uses) {
    assert.match(reference, /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[a-f0-9]{40}$/);
    assert.match(release, /^v\d+\.\d+\.\d+$/);
  }
  assert.match(workflow, /node-version: 24\.14\.0/);
  assert.match(workflow, /bun-version: "1\.4\.3"/);
});

test("CI environment is synthetic and explicitly rejects developer env and database artifacts", () => {
  assert.match(workflow, /^  SUPABASE_ENVIRONMENT: test$/m);
  assert.match(workflow, /^  VITE_SUPABASE_ENVIRONMENT: test$/m);
  assert.match(workflow, /^  SUPABASE_URL: https:\/\/workout-e2e\.invalid$/m);
  assert.match(workflow, /^  VITE_SUPABASE_URL: https:\/\/workout-e2e\.invalid$/m);
  assert.match(workflow, /^  SUPABASE_SERVICE_ROLE_KEY: ""$/m);
  assert.match(workflow, /^  RELEASE_DATABASE_URL: ""$/m);
  assert.match(workflow, /^  ALLOW_STAGING_DEV: "false"$/m);
  assert.match(workflow, /if \[\[ -e \.env \|\| -e \.env\.local \]\]/);
  assert.match(workflow, /Tracked database artifacts are forbidden in CI/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("workflow invokes required local checks and contains no hosted mutation or deploy step", () => {
  for (const command of [
    "bun install --frozen-lockfile",
    "bun audit",
    "bun run check:dependencies",
    "bun run typecheck",
    "bun run lint",
    "bun run format:check",
    "bun run test",
    "bun run test:db",
    "bun run test:toolchain",
    "bun run preflight:schema-contract",
    "bun run build",
    "bun run check:client-bundle",
    "bun run smoke:runtime",
    "bun run test:e2e",
    "playwright install --with-deps chromium webkit",
  ]) {
    assert.ok(workflow.includes(command), `Missing required workflow command: ${command}`);
  }
  assert.doesNotMatch(
    workflow,
    /wrangler\s+deploy|drizzle-kit\s+push|supabase\s+db\s+(?:push|reset|seed)|preflight:release|lovable[^\n]*(?:deploy|publish)/i,
  );
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /github\.event_name != 'pull_request'/);
});

test("GitHub Actions expressions have balanced delimiters", () => {
  const openExpressions = [...workflow.matchAll(/\$\{\{/g)].length;
  const closeExpressions = [...workflow.matchAll(/\}\}/g)].length;
  assert.equal(openExpressions, closeExpressions);
});
