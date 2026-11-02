import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { routeCIEvent } from "./ci-event-router.mjs";

const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
const router = readFileSync("scripts/ci-event-router.mjs", "utf8");
const packageScripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

const jobsSection = workflow.split("\njobs:\n")[1];
const jobs = Object.fromEntries(
  jobsSection
    .split(/(?=^  [a-z][\w-]*:\n)/m)
    .map((job) => [job.match(/^  ([\w-]+):/m)?.[1], job])
    .filter(([id]) => id),
);

test("workflow triggers on main PRs, branch pushes and manual dispatch", () => {
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /\n  push:\n    branches: \["\*\*"\]/);
  assert.match(workflow, /\n  workflow_dispatch:\n/);
});

test("permissions are read-only and synthetic test configuration has no credentials", () => {
  assert.match(workflow, /permissions:\n  contents: read\n  pull-requests: read\n/);
  assert.doesNotMatch(
    workflow,
    /\b(?:write-all|contents: write|actions: write|pull-requests: write)\b/,
  );
  assert.match(workflow, /^  SUPABASE_ENVIRONMENT: test$/m);
  assert.match(workflow, /^  VITE_SUPABASE_ENVIRONMENT: test$/m);
  assert.match(workflow, /^  SUPABASE_URL: https:\/\/workout-e2e\.invalid$/m);
  assert.match(workflow, /^  VITE_SUPABASE_URL: https:\/\/workout-e2e\.invalid$/m);
  assert.match(workflow, /^  SUPABASE_SERVICE_ROLE_KEY: ""$/m);
  assert.match(workflow, /^  RELEASE_DATABASE_URL: ""$/m);
  assert.match(workflow, /^  ALLOW_STAGING_DEV: "false"$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("concurrency isolates PRs, branches and manual runs while superseding stale runs", () => {
  assert.match(workflow, /github\.event_name == 'pull_request' && format\('pr-/);
  assert.match(workflow, /github\.event_name == 'push' && format\('push-/);
  assert.match(workflow, /format\('manual-/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.doesNotMatch(
    workflow,
    /github\.event\.pull_request\.head\.repo\.full_name \|\| github\.repository/,
  );
});

test("push router avoids duplicate PR runs and fails open if GitHub lookup fails", () => {
  assert.match(workflow, /name: Route CI event/);
  assert.match(jobs.route, /uses: actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /outputs:\n      run_ci: \$\{\{ steps\.route\.outputs\.run_ci \}\}/);
  assert.match(workflow, /run: node scripts\/ci-event-router\.mjs/);
  assert.match(router, /url\.searchParams\.set\("head", `\$\{repositoryOwner\}:\$\{refName\}`\)/);
  assert.match(router, /searchParams\.set\("state", "open"\)/);
  assert.match(router, /searchParams\.set\("base", "main"\)/);
  assert.match(router, /Fail open so an API outage cannot leave required PR checks absent/);
});

test("router runs PR/manual events, skips duplicate pushes, and fails open safely", async () => {
  const base = {
    repository: "MiolesBlues/progress-tracker",
    repositoryOwner: "MiolesBlues",
    refName: "ci/github-actions-setup",
    token: "read-only-test-token",
  };
  let fetchCalls = 0;
  const fetchImpl = async (url, options) => {
    fetchCalls += 1;
    assert.equal(url.searchParams.get("base"), "main");
    assert.equal(url.searchParams.get("head"), "MiolesBlues:ci/github-actions-setup");
    assert.equal(options.headers.Authorization, "Bearer read-only-test-token");
    return { ok: true, json: async () => [{ state: "open" }] };
  };

  assert.deepEqual(await routeCIEvent({ ...base, eventName: "pull_request", fetchImpl }), {
    runCI: true,
    reason: "required-event",
  });
  assert.deepEqual(await routeCIEvent({ ...base, eventName: "workflow_dispatch", fetchImpl }), {
    runCI: true,
    reason: "required-event",
  });
  assert.deepEqual(await routeCIEvent({ ...base, eventName: "push", fetchImpl }), {
    runCI: false,
    reason: "open-pr",
  });
  assert.equal(fetchCalls, 1);

  assert.deepEqual(
    await routeCIEvent({
      ...base,
      eventName: "push",
      fetchImpl: async () => ({ ok: true, json: async () => [] }),
    }),
    { runCI: true, reason: "no-open-pr" },
  );
  assert.deepEqual(
    await routeCIEvent({
      ...base,
      eventName: "push",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    { runCI: true, reason: "lookup-failed" },
  );
});

test("four quick checks remain independent and sharded Playwright keeps one stable aggregation check", () => {
  for (const [id, name] of [
    ["code-quality", "Code Quality"],
    ["unit-tests", "Unit Tests"],
    ["database-contracts", "Database & Contracts"],
    ["build-security", "Build & Security"],
  ]) {
    const job = jobs[id];
    assert.ok(job, `Missing job ${id}`);
    assert.match(job, new RegExp(`name: ["']?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]?`));
    assert.match(job, /needs: route/);
    assert.match(job, /if: needs\.route\.outputs\.run_ci == 'true'/);
    assert.match(job, /runs-on: ubuntu-24\.04/);
  }
  assert.ok(jobs["playwright-shards"]);
  assert.match(jobs["playwright-shards"], /name: Playwright Shard \$\{\{ matrix\.shard \}\}\/4/);
  assert.match(jobs["playwright-shards"], /fail-fast: false/);
  assert.match(jobs["playwright-shards"], /shard: \[1, 2, 3, 4\]/);
  assert.match(jobs["playwright-aggregate"], /name: Playwright Chromium and WebKit/);
  assert.match(jobs["playwright-aggregate"], /needs: \[route, playwright-shards\]/);
  assert.match(jobs["playwright-aggregate"], /always\(\)/);
  assert.match(jobs["playwright-aggregate"], /needs\.route\.outputs\.run_ci == 'true'/);
  assert.match(jobs["playwright-aggregate"], /needs\.route\.result != 'success'/);
  assert.match(jobs["playwright-aggregate"], /needs\.playwright-shards\.result/);
  assert.equal((workflow.match(/name: Code Quality/g) ?? []).length, 1);
  assert.equal((workflow.match(/name: Unit Tests/g) ?? []).length, 1);
  assert.equal((workflow.match(/name: Database & Contracts/g) ?? []).length, 1);
  assert.equal((workflow.match(/name: Build & Security/g) ?? []).length, 1);
  assert.equal((workflow.match(/name: Playwright Chromium and WebKit/g) ?? []).length, 1);
  for (const id of ["code-quality", "unit-tests", "database-contracts", "build-security"]) {
    assert.match(jobs[id], /needs: route/);
    assert.doesNotMatch(
      jobs[id],
      /needs:.*(?:code-quality|unit-tests|database-contracts|build-security|playwright-shards)/,
    );
  }
});

test("each CI job performs an independent frozen install with an isolated Bun cache key", () => {
  for (const id of ["code-quality", "unit-tests", "database-contracts", "build-security"]) {
    const job = jobs[id];
    assert.match(job, /bun install --frozen-lockfile/);
    assert.match(job, /actions\/cache\/restore@[a-f0-9]{40}/);
    assert.match(job, /actions\/cache\/save@[a-f0-9]{40}/);
    assert.match(job, /bun-1\.4\.3-\$\{\{ hashFiles\('bun\.lock'\) \}\}-[a-z-]+/);
  }
  const cacheSuffixes = [...workflow.matchAll(/hashFiles\('bun\.lock'\) \}\}-([a-z-]+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...new Set(cacheSuffixes)].sort(), [
    "build-security",
    "code-quality",
    "database-contracts",
    "playwright",
    "unit-tests",
  ]);
});

test("fast jobs cover checks exactly once without dependencies between the five jobs", () => {
  const expectedCommands = {
    "code-quality": ["bun run typecheck", "bun run lint", "bun run format:check"],
    "unit-tests": ["bun run test"],
    "database-contracts": [
      "bun run test:db",
      "bun run test:toolchain",
      "bun run preflight:schema-contract",
    ],
    "build-security": [
      "bun run check:dependencies",
      "bun audit",
      "bun run build",
      "bun run check:client-bundle",
      "bun run smoke:runtime",
    ],
  };
  for (const [jobId, commands] of Object.entries(expectedCommands)) {
    for (const command of commands) {
      assert.ok(jobs[jobId].includes(command), `${jobId} is missing ${command}`);
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expectedCount = command === "bun run build" ? 2 : 1;
      assert.equal(
        (workflow.match(new RegExp(`${escaped}(?=\\n|$)`, "g")) ?? []).length,
        expectedCount,
      );
    }
  }
  assert.match(jobs["code-quality"], /if \[\[ -e \.env \|\| -e \.env\.local \]\]/);
  assert.match(jobs["code-quality"], /Tracked database artifacts are forbidden in CI/);
  assert.match(jobs["build-security"], /Tracked database artifacts are forbidden in CI/);
  assert.match(jobs["code-quality"], /git diff --check/);
});

test("workflow bun run commands resolve to declared package scripts", () => {
  const scriptNames = [
    "typecheck",
    "lint",
    "format:check",
    "test",
    "test:db",
    "test:toolchain",
    "preflight:schema-contract",
    "check:dependencies",
    "build",
    "check:client-bundle",
    "smoke:runtime",
    "test:e2e",
  ];
  for (const name of scriptNames) {
    assert.equal(typeof packageScripts[name], "string", `Missing package script ${name}`);
    assert.ok(workflow.includes(`bun run ${name}`), `Workflow does not run ${name}`);
  }
});

test("all external actions are pinned to full commit SHAs with release labels", () => {
  const uses = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)\s+#\s+([^\s]+)$/gm)];
  assert.equal(uses.length, 35);
  for (const [, reference, release] of uses) {
    assert.match(reference, /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[a-f0-9]{40}$/);
    assert.match(release, /^v\d+\.\d+\.\d+$/);
  }
  assert.match(workflow, /node-version: 24\.14\.0/);
  assert.match(workflow, /bun-version: "1\.4\.3"/);
});

test("workflow contains no hosted mutations, production secrets or deploy steps", () => {
  assert.doesNotMatch(
    workflow,
    /wrangler\s+deploy|drizzle-kit\s+push|supabase\s+db\s+(?:push|reset|seed)|preflight:release|lovable[^\n]*(?:deploy|publish)/i,
  );
  assert.match(workflow, /if: success\(\) && github\.event_name != 'pull_request'/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /playwright-report\//);
  assert.match(workflow, /test-results\//);
  assert.match(workflow, /if-no-files-found: warn/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("Playwright retains failure diagnostics and executes after the production CSS build", () => {
  assert.match(
    playwrightConfig,
    /\["html", \{ outputFolder: "playwright-report", open: "never" \}\]/,
  );
  assert.match(playwrightConfig, /trace: "retain-on-failure"/);
  assert.match(playwrightConfig, /screenshot: "only-on-failure"/);
  assert.match(playwrightConfig, /video: "retain-on-failure"/);
  assert.match(playwrightConfig, /fullyParallel: true/);
  assert.match(playwrightConfig, /workers: 1/);
  assert.match(playwrightConfig, /\[\["blob"\], \["list"\]\]/);
  const browserJob = jobs["playwright-shards"];
  const build = browserJob.indexOf("Build production assets required by CSS E2E assertions");
  const verifyCss = browserJob.indexOf("Verify production stylesheet is available to E2E tests");
  const playwright = browserJob.indexOf("Playwright E2E against local mock backend");
  assert.ok(build >= 0 && build < verifyCss && verifyCss < playwright);
  assert.match(browserJob, /find \.output\/public\/assets[^\n]*-name 'styles-\*\.css'/);
  assert.match(browserJob, /playwright install --with-deps chromium webkit/);
  assert.match(browserJob, /bun run test:e2e -- --shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(browserJob, /playwright-blob-\$\{\{ github\.run_id \}\}-\$\{\{ matrix\.shard \}\}/);
  assert.match(
    browserJob,
    /playwright-diagnostics-\$\{\{ github\.run_id \}\}-\$\{\{ matrix\.shard \}\}/,
  );
  assert.match(jobs["playwright-aggregate"], /actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(
    jobs["playwright-aggregate"],
    /playwright merge-reports --reporter html all-blob-reports/,
  );
});

test("GitHub Actions expressions have balanced delimiters", () => {
  const openExpressions = [...workflow.matchAll(/\$\{\{/g)].length;
  const closeExpressions = [...workflow.matchAll(/\}\}/g)].length;
  assert.equal(openExpressions, closeExpressions);
});
