import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { canonicalMigrations } from "./canonical-migrations.mjs";

// Deliberately separate from the PGlite suite. Fail closed rather than skipping
// when CI forgot its disposable PostgreSQL service. Never load .env files.
const target = new URL(process.env.CONCURRENCY_DATABASE_URL || "https://not-configured.invalid");
assert.ok(
  ["postgres:", "postgresql:"].includes(target.protocol) &&
    target.hostname === "127.0.0.1" &&
    target.pathname === "/pt_concurrency_fixtures" &&
    !target.search &&
    !target.hash &&
    target.username === "postgres" &&
    !target.password,
  "Concurrency tests require the explicitly named passwordless loopback fixture database",
);
const control = postgres(target.href, { max: 1, prepare: false, onnotice: () => {} });
const fixtureName = `pt_fixture_${randomUUID().replaceAll("-", "")}`;
const fixtureTarget = new URL(target);
fixtureTarget.pathname = `/${fixtureName}`;
const sql = postgres(fixtureTarget.href, { max: 3, prepare: false, onnotice: () => {} });
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const entry = randomUUID(),
  set = randomUUID(),
  firstEdit = randomUUID();
const payload = [
  {
    id: set,
    position: 1,
    weight: "50",
    reps: 8,
    rir: "2",
    set_type: "working",
    load_type: "external",
  },
];
let left, right, observer, leftPid, rightPid, day, exercise;
const query = (connection, text, args = []) => connection.unsafe(text, args);

async function begin(connection, user = A) {
  await query(
    connection,
    "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='8s'; SET LOCAL ROLE authenticated",
  );
  await query(connection, "SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
}
const save = (connection) =>
  query(
    connection,
    "SELECT public.save_workout_entry_sets($1,$2,$3,'2026-11-01',$4::text::jsonb,NULL) AS id",
    [entry, exercise, day, JSON.stringify(payload)],
  );
const edit = (connection, operation, revision, weight) =>
  query(
    connection,
    "SELECT public.edit_workout_entry_set($1,$2,$3,$4,$5,8,'2','working','external') AS revision",
    [operation, entry, set, revision, weight],
  );

async function assertBlocked() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [state] = await query(
      observer,
      "SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",
      [leftPid, rightPid],
    );
    if (state.blocked) return;
    await delay(20);
  }
  assert.fail("Second PostgreSQL backend never demonstrably waited for the first transaction");
}

// Observe and release a real overlap, not a sleep-based guess about scheduling.
async function overlap(first, second, check) {
  await begin(left);
  await begin(right);
  try {
    await first();
    const pending = second().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await assertBlocked();
    await query(left, "COMMIT");
    const outcome = await pending;
    await check(outcome);
  } finally {
    await query(left, "ROLLBACK");
    await query(right, "ROLLBACK");
  }
}

before(
  async () => {
    await query(
      control,
      `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$`,
    );
    await query(control, `CREATE DATABASE ${fixtureName}`);
    left = await sql.reserve();
    right = await sql.reserve();
    observer = await sql.reserve();
    leftPid = (await query(left, "SELECT pg_backend_pid() AS pid"))[0].pid;
    rightPid = (await query(right, "SELECT pg_backend_pid() AS pid"))[0].pid;
    assert.notEqual(leftPid, rightPid);
    assert.notEqual((await query(observer, "SELECT pg_backend_pid() AS pid"))[0].pid, leftPid);
    await query(
      observer,
      `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`,
    );
    for (const migration of canonicalMigrations()) await query(observer, migration.sql);
    await query(observer, "INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
    for (const owner of [A, B]) {
      await begin(left, owner);
      await query(left, "SELECT setup_program(ARRAY['Synthetic day'])");
      const id = (await query(left, "SELECT id FROM program_days WHERE user_id=$1", [owner]))[0].id;
      const ex = (
        await query(
          left,
          "INSERT INTO program_exercises(name,day_id) VALUES ('Synthetic exercise',$1) RETURNING id",
          [id],
        )
      )[0].id;
      if (owner === A) {
        day = id;
        exercise = ex;
      }
      await query(left, "COMMIT");
    }
  },
  { timeout: 30000 },
);

after(async () => {
  for (const connection of [left, right, observer])
    if (connection) {
      await query(connection, "ROLLBACK");
      connection.release();
    }
  await sql.end({ timeout: 3 });
  await control.end({ timeout: 3 });
});

test(
  "overlapping create retries from separate backends commit exactly one entry and set",
  { timeout: 15000 },
  async () => {
    await overlap(
      () => save(left),
      () => save(right),
      async ({ value, error }) => {
        assert.ifError(error);
        assert.equal(value[0].id, entry);
        await query(right, "COMMIT");
      },
    );
    for (const table of ["workout_entries", "workout_entry_sets", "workout_entry_operations"])
      assert.equal(
        (
          await query(observer, `SELECT count(*)::int AS n FROM public.${table} WHERE user_id=$1`, [
            A,
          ])
        )[0].n,
        1,
      );
  },
);

test(
  "a blocked stale edit returns 40001 after the competing revision commits",
  { timeout: 15000 },
  async () => {
    await overlap(
      () => edit(left, firstEdit, 0, "55"),
      () => edit(right, randomUUID(), 0, "99"),
      async ({ error }) => {
        assert.equal(error?.code, "40001");
      },
    );
    const [current] = await query(
      observer,
      "SELECT revision,weight::text FROM workout_entry_sets WHERE id=$1",
      [set],
    );
    assert.deepEqual(current, { revision: 1, weight: "55" });
  },
);

test(
  "an old operation retry blocked by a newer edit never rolls that edit back",
  { timeout: 15000 },
  async () => {
    await overlap(
      () => edit(left, randomUUID(), 1, "60"),
      () => edit(right, firstEdit, 0, "55"),
      async ({ value, error }) => {
        assert.ifError(error);
        assert.equal(value[0].revision, 1);
        await query(right, "COMMIT");
      },
    );
    const [current] = await query(
      observer,
      "SELECT revision,weight::text FROM workout_entry_sets WHERE id=$1",
      [set],
    );
    assert.deepEqual(current, { revision: 2, weight: "60" });
  },
);

test(
  "a foreign user cannot edit the target or acquire access while its owner holds a transaction",
  { timeout: 15000 },
  async () => {
    await begin(left);
    await query(left, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [A]);
    await begin(right, B);
    try {
      await assert.rejects(edit(right, randomUUID(), 2, "99"), (error) => error.code === "42501");
    } finally {
      await query(left, "ROLLBACK");
      await query(right, "ROLLBACK");
    }
    const [foreign] = await query(
      observer,
      "SELECT count(*)::int AS n FROM workout_entries WHERE user_id=$1",
      [B],
    );
    assert.equal(foreign.n, 0);
    assert.equal(
      (await query(observer, "SELECT weight::text FROM workout_entry_sets WHERE id=$1", [set]))[0]
        .weight,
      "60",
    );
  },
);
