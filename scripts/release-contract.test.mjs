import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("machine-readable capability contract names local library and V4 objects", () => {
  const contract = JSON.parse(file("scripts/schema-capability-contract.json"));
  const v4 = file("drizzle/migrations/20261016204330_per_set_workout_v4.sql");
  const library = file("drizzle/migrations/20261016150000_training_template_library.sql");
  for (const table of Object.keys(contract.authoritativeSetTables))
    assert.ok(v4.includes(`public.${table}`));
  for (const rpc of contract.perSetRpcs) assert.ok(v4.includes(`public.${rpc.name}`));
  for (const table of Object.keys(contract.libraryTables))
    assert.ok(library.includes(`public.${table}`));
  assert.equal(contract.perSetRpcs.length, 5);
});

test("release preflight uses a read-only transaction and has no database repair path", () => {
  const preflight = file("scripts/release-schema-preflight.mjs");
  assert.ok(preflight.includes("SET TRANSACTION READ ONLY"));
  assert.ok(preflight.includes("SUPABASE_PROJECT_REF"));
  assert.ok(preflight.includes("has_table_privilege"));
  assert.ok(preflight.includes("has_function_privilege"));
  assert.ok(
    !/\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE)\b/i.test(
      preflight,
    ),
  );
});

test("the real local env file is not tracked and Vite validates environment before builds", () => {
  assert.throws(() =>
    execFileSync("git", ["ls-files", "--error-unmatch", ".env"], {
      encoding: "utf8",
      stdio: "pipe",
    }),
  );
  const viteConfig = file("vite.config.ts");
  assert.ok(viteConfig.includes("validateSupabaseEnvironment"));
  assert.ok(viteConfig.includes("SERVICE_ROLE"));
  const sample = file(".env.example");
  assert.ok(sample.includes("<publishable-key>"));
  assert.ok(sample.includes("<server-only-secret>"));
  assert.ok(!/sb_(publishable|secret)_[A-Za-z0-9]+/.test(sample));
  assert.match(file("bunfig.toml"), /^env = false/m);
});

test("V4 and ACL migrations are transaction scoped and preserve the expected recovery boundaries", () => {
  const v4 = file("drizzle/migrations/20261016204330_per_set_workout_v4.sql");
  const acl = file("drizzle/migrations/20261020100000_training_library_least_privilege.sql");
  assert.match(v4, /^BEGIN;/m);
  assert.match(v4, /^COMMIT;/m);
  assert.match(acl, /^BEGIN;/m);
  assert.match(acl, /^COMMIT;/m);
  assert.match(acl, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated;/);
  assert.match(acl, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
});

test("Vite exits before compiling when browser and SSR configs target different refs", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ["node_modules/vite/bin/vite.js", "build", "--mode", "staging"],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            SUPABASE_ENVIRONMENT: "staging",
            VITE_SUPABASE_ENVIRONMENT: "staging",
            SUPABASE_PROJECT_REF: "fdzcwhzszbmpxyawrzzf",
            VITE_SUPABASE_PROJECT_REF: "szdmzvsenrnjxgjgregf",
            SUPABASE_URL: "https://fdzcwhzszbmpxyawrzzf.supabase.co",
            VITE_SUPABASE_URL: "https://szdmzvsenrnjxgjgregf.supabase.co",
            SUPABASE_PUBLISHABLE_KEY: "test-only",
            VITE_SUPABASE_PUBLISHABLE_KEY: "test-only",
          },
        },
      ),
    (error) => error.stderr?.toString().includes("Supabase project refs do not match"),
  );
});

test("Vite rejects service-role-shaped public variables before compilation", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--mode", "test"], {
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          SUPABASE_ENVIRONMENT: "test",
          VITE_SUPABASE_ENVIRONMENT: "test",
          SUPABASE_URL: "https://workout-e2e.invalid",
          VITE_SUPABASE_URL: "https://workout-e2e.invalid",
          SUPABASE_PUBLISHABLE_KEY: "test-only",
          VITE_SUPABASE_PUBLISHABLE_KEY: "test-only",
          VITE_SUPABASE_SERVICE_ROLE_KEY: "test-only-secret-marker",
        },
      }),
    (error) => error.stderr?.toString().includes("must remain server-only"),
  );
});

test("release preflight rejects the wrong project URL before opening a connection and redacts its password", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/release-schema-preflight.mjs"], {
        encoding: "utf8",
        stdio: "pipe",
        env: {
          ...process.env,
          SUPABASE_ENVIRONMENT: "staging",
          SUPABASE_PROJECT_REF: "fdzcwhzszbmpxyawrzzf",
          RELEASE_DATABASE_URL:
            "postgresql://postgres:do-not-print@db.szdmzvsenrnjxgjgregf.supabase.co/postgres",
        },
      }),
    (error) => {
      const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      return (
        output.includes("does not identify SUPABASE_PROJECT_REF") &&
        !output.includes("do-not-print")
      );
    },
  );
});
