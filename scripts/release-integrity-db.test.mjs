import { canonicalMigrations } from "./canonical-migrations.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { workoutIntegritySql, workoutIntegrityFailures } from "./workout-integrity-preflight.mjs";

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const LEGACY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY_NO_DAY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SET_A = "10000000-0000-4000-8000-000000000001";
const SET_B = "10000000-0000-4000-8000-000000000002";
const SET_C = "10000000-0000-4000-8000-000000000003";
let db, day, exercise;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function asUser(id, action, role = "authenticated") {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const sets = () => [
  {
    id: SET_A,
    position: 1,
    weight: "50",
    reps: 8,
    rir: "2",
    set_type: "working",
    load_type: "external",
  },
  {
    id: SET_B,
    position: 2,
    weight: "55",
    reps: 6,
    rir: null,
    set_type: "warmup",
    load_type: "bodyweight",
  },
];
async function createEntry() {
  await asUser(A, () =>
    db.query("SELECT save_workout_entry_sets($1,$2,$3,'2026-11-01',$4::jsonb,NULL)", [
      ENTRY,
      exercise,
      day,
      JSON.stringify(sets()),
    ]),
  );
}
async function gate() {
  return (await rows(workoutIntegritySql))[0];
}
async function assertGatePass() {
  assert.deepEqual(workoutIntegrityFailures(await gate()), []);
}

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  const migrations = canonicalMigrations();
  for (const migration of migrations.filter(({ file }) => file < "0004"))
    await db.exec(migration.sql);
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
  await asUser(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Synthetic A", "Synthetic B"]]);
    day = (await rows("SELECT id FROM program_days ORDER BY position LIMIT 1"))[0].id;
    exercise = (
      await rows(
        "INSERT INTO program_exercises(name,day_id) VALUES ('Synthetic exercise',$1) RETURNING id",
        [day],
      )
    )[0].id;
    for (const [id, dayId, rir] of [
      [LEGACY, day, "2"],
      [LEGACY_NO_DAY, null, null],
    ])
      await db.query(
        "INSERT INTO workout_entries(id,exercise_id,day_id,performed_on,weight,reps,rir) VALUES($1,$2,$3,'2026-10-01',40,'{8,7,6}',$4)",
        [id, exercise, dayId, rir],
      );
    // The old INSERT trigger fills a missing day. Model an actual pre-ledger
    // historical row with NULL day_id before the immutable UPDATE guard exists.
    await db.query("UPDATE workout_entries SET day_id=NULL WHERE id=$1", [LEGACY_NO_DAY]);
  });
  for (const migration of migrations.filter(({ file }) => file >= "0004"))
    await db.exec(migration.sql);
});
beforeEach(() => db.exec("BEGIN"));
afterEach(() => db.exec("ROLLBACK"));
after(async () => {
  await db?.close();
});

test("release gate accepts a legitimate per-set edit without changing its immutable snapshot", async () => {
  await createEntry();
  await assertGatePass();
  const original = await rows(
    "SELECT to_jsonb(o) AS row FROM workout_entry_operations o ORDER BY id",
  );
  await asUser(A, () =>
    db.query(
      "SELECT edit_workout_entry_set(gen_random_uuid(),$1,$2,0,'60',9,'1','working','external')",
      [ENTRY, SET_A],
    ),
  );
  assert.deepEqual(
    await rows("SELECT to_jsonb(o) AS row FROM workout_entry_operations o ORDER BY id"),
    original,
  );
  await assertGatePass();
});

async function originalRows() {
  return rows(`SELECT w.id, w.weight::text, w.reps, w.rir::text, w.day_name,
    o.set_snapshot FROM workout_entries w LEFT JOIN workout_entry_operations o
    ON o.id=w.id AND o.user_id=w.user_id ORDER BY w.id`);
}

test("gate accepts V4 add/reorder/delete and exact create retry, keeping original rows", async () => {
  await createEntry();
  const original = await originalRows();
  await asUser(A, () =>
    db.query("SELECT add_workout_entry_set($1,$2,'0',5,NULL,'working','bodyweight')", [
      ENTRY,
      SET_C,
    ]),
  );
  await assertGatePass();
  await asUser(A, () =>
    db.query("SELECT reorder_workout_entry_sets($1,$2::uuid[])", [ENTRY, [SET_C, SET_B, SET_A]]),
  );
  await assertGatePass();
  await createEntry(); // An exact retry does not undo edits or reorder current sets.
  await assertGatePass();
  await asUser(A, () => db.query("SELECT delete_workout_entry_set($1,$2)", [ENTRY, SET_B]));
  await assertGatePass();
  // The existing RPC deliberately rejects reusing any tombstoned set ID,
  // including a save retry containing that ID. The release gate still passes.
  await asUser(A, () =>
    rejectsSql(
      () =>
        db.query("SELECT save_workout_entry_sets($1,$2,$3,'2026-11-01',$4::jsonb,NULL)", [
          ENTRY,
          exercise,
          day,
          JSON.stringify(sets()),
        ]),
      "23503",
    ),
  );
  await assertGatePass();
  assert.deepEqual(await originalRows(), original);
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [ENTRY]))[0].n,
    1,
  );
});

for (const entry of [LEGACY, LEGACY_NO_DAY]) {
  test(`gate matches legacy sets by stable ID after edits, reorder and deletion (${entry})`, async () => {
    const original = await originalRows();
    const ids = (
      await rows("SELECT id FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position", [
        entry,
      ])
    ).map((row) => row.id);
    if (entry === LEGACY_NO_DAY) {
      assert.equal(
        (await rows("SELECT day_id FROM workout_entries WHERE id=$1", [entry]))[0].day_id,
        null,
      );
      assert.equal(
        (
          await rows("SELECT count(*)::int AS n FROM workout_entry_operations WHERE id=$1", [entry])
        )[0].n,
        0,
      );
    }
    await assertGatePass();
    await asUser(A, () =>
      db.query(
        "SELECT edit_workout_entry_set(gen_random_uuid(),$1,$2,0,'42.5',10,NULL,'working','external')",
        [entry, ids[0]],
      ),
    );
    await assertGatePass();
    await asUser(A, () =>
      db.query("SELECT reorder_workout_entry_sets($1,$2::uuid[])", [entry, ids.toReversed()]),
    );
    await assertGatePass();
    await asUser(A, () => db.query("SELECT delete_workout_entry_set($1,$2)", [entry, ids[1]]));
    await assertGatePass();
    await asUser(A, () =>
      db.query("SELECT add_workout_entry_set($1,$2,'45',8,'1','working','external')", [
        entry,
        SET_C,
      ]),
    );
    await assertGatePass();
    assert.deepEqual(await originalRows(), original);
  });
}

test("gate accepts archived-day deletion without rewriting the original save snapshot", async () => {
  await createEntry();
  const snapshots = await rows(
    "SELECT to_jsonb(o) AS row FROM workout_entry_operations o ORDER BY id",
  );
  await asUser(A, async () => {
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [day]);
    await db.query("SELECT delete_archived_program_day($1)", [day]);
  });
  await assertGatePass();
  assert.deepEqual(
    await rows("SELECT to_jsonb(o) AS row FROM workout_entry_operations o ORDER BY id"),
    snapshots,
  );
});

for (const [name, patch] of [
  ["missing", "NULL"],
  ["non-array", "'{}'::jsonb"],
  ["empty", "'[]'::jsonb"],
  ["wrong reps", "jsonb_set(set_snapshot,'{0,reps}','999')"],
  ["wrong first weight", "jsonb_set(set_snapshot,'{0,weight}','999')"],
  ["wrong common RIR", "jsonb_set(set_snapshot,'{0,rir}','null')"],
  ["duplicate ID", "jsonb_set(set_snapshot,'{1,id}',set_snapshot->0->'id')"],
  ["wrong order", "jsonb_set(set_snapshot,'{0,position}','2')"],
  ["missing field", "set_snapshot #- '{0,rir}'"],
  ["scalar set", "jsonb_set(set_snapshot,'{0}','null')"],
]) {
  test(`gate rejects an inconsistent immutable snapshot: ${name}`, async () => {
    // The legacy fixture has uniform RIR, so changing one RIR also conflicts
    // with the immutable operation's compatibility payload.
    await db.query(`UPDATE workout_entry_operations SET set_snapshot=${patch} WHERE id=$1`, [
      LEGACY,
    ]);
    const counters = await gate();
    assert.ok(counters.invalid_operation_snapshot > 0);
    assert.ok(workoutIntegrityFailures(counters).length > 0);
  });
}

test("gate rejects missing ledger for a linked entry and unexpected legacy metric changes", async () => {
  await createEntry();
  await db.query("UPDATE workout_entries SET weight=99 WHERE id=$1", [ENTRY]);
  assert.equal((await gate()).legacy_fields_mismatch, 1);
  await db.query("DELETE FROM workout_entry_operations WHERE id=$1", [ENTRY]);
  assert.equal((await gate()).missing_operation_snapshot, 1);
});

test("gate rejects changed untouched legacy values even if some sets were edited", async () => {
  const ids = (
    await rows("SELECT id FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position", [
      LEGACY,
    ])
  ).map((row) => row.id);
  await asUser(A, () =>
    db.query(
      "SELECT edit_workout_entry_set(gen_random_uuid(),$1,$2,0,'60',10,NULL,'working','external')",
      [LEGACY, ids[0]],
    ),
  );
  await assertGatePass();
  await db.query("UPDATE workout_entry_sets SET reps=99 WHERE id=$1", [ids[1]]);
  assert.equal((await gate()).legacy_value_mismatch, 1);
});

test("gate rejects missing original sets without a matching owner tombstone", async () => {
  await createEntry();
  await db.query("DELETE FROM workout_entry_sets WHERE id=$1", [SET_B]);
  assert.equal((await gate()).missing_original_sets, 1);
  await db.query(
    "INSERT INTO workout_entry_set_tombstones(user_id,workout_entry_id,set_id) VALUES($1,$2,$3)",
    [B, ENTRY, SET_B],
  );
  assert.equal((await gate()).missing_original_sets, 1);
  await db.query(
    "INSERT INTO workout_entry_set_tombstones(user_id,workout_entry_id,set_id) VALUES($1,$2,$3)",
    [A, LEGACY, SET_B],
  );
  assert.equal((await gate()).missing_original_sets, 1);
});

test("gate rejects no sets, position gaps and a resurrected tombstoned ID", async () => {
  await createEntry();
  await db.query("UPDATE workout_entry_sets SET position=3 WHERE id=$1", [SET_B]);
  assert.equal((await gate()).invalid_current_sets, 1);
  await db.query(
    "INSERT INTO workout_entry_set_tombstones(user_id,workout_entry_id,set_id) VALUES($1,$2,$3)",
    [A, ENTRY, SET_B],
  );
  assert.equal((await gate()).tombstone_conflicts, 1);
  await db.query("DELETE FROM workout_entry_sets WHERE workout_entry_id=$1", [ENTRY]);
  assert.equal((await gate()).invalid_current_sets, 1);
});

async function rejectsSql(action, code) {
  await db.exec("SAVEPOINT rejected_write");
  try {
    await assert.rejects(action, (error) => error.code === code);
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT rejected_write; RELEASE SAVEPOINT rejected_write");
  }
}

test("owner, RLS, direct-write and value constraints still reject unauthorized changes", async () => {
  await createEntry();
  const before = await rows("SELECT to_jsonb(s) AS row FROM workout_entry_sets s ORDER BY id");
  await asUser(B, async () => {
    assert.deepEqual(await rows("SELECT id FROM workout_entry_sets"), []);
    await rejectsSql(
      () =>
        db.query(
          "SELECT edit_workout_entry_set(gen_random_uuid(),$1,$2,0,'60',9,NULL,'working','external')",
          [ENTRY, SET_A],
        ),
      "42501",
    );
    await rejectsSql(
      () => db.query("SELECT delete_workout_entry_set($1,$2)", [ENTRY, SET_A]),
      "42501",
    );
    await rejectsSql(
      () => db.query("UPDATE workout_entry_sets SET reps=10 WHERE id=$1", [SET_A]),
      "42501",
    );
  });
  await asUser(A, async () => {
    await rejectsSql(
      () =>
        db.query(
          "SELECT edit_workout_entry_set(gen_random_uuid(),$1,$2,0,'2001',9,NULL,'working','external')",
          [ENTRY, SET_A],
        ),
      "22023",
    );
    await rejectsSql(
      () => db.query("UPDATE workout_entry_operations SET reps=ARRAY[10] WHERE id=$1", [ENTRY]),
      "42501",
    );
    await rejectsSql(
      () => db.query("UPDATE workout_entry_sets SET user_id=$1 WHERE id=$2", [B, SET_A]),
      "42501",
    );
  });
  assert.deepEqual(
    await rows("SELECT to_jsonb(s) AS row FROM workout_entry_sets s ORDER BY id"),
    before,
  );
  await assertGatePass();
});

test("actual shared assertions execute in a read-only transaction without changing data", async () => {
  await db.exec("SET TRANSACTION READ ONLY");
  const before = await originalRows();
  await assertGatePass();
  assert.deepEqual(await originalRows(), before);
});

test("incomplete assertion results fail closed and diagnostics contain no row values", () => {
  assert.throws(() => workoutIntegrityFailures({}), /valid counters/);
  const counters = Object.fromEntries(
    [
      "missing_operation_snapshot",
      "invalid_operation_snapshot",
      "legacy_fields_mismatch",
      "invalid_current_sets",
      "legacy_value_mismatch",
      "missing_original_sets",
      "tombstone_conflicts",
    ].map((name) => [name, 1]),
  );
  const messages = workoutIntegrityFailures(counters);
  assert.equal(messages.length, 7);
  assert.ok(messages.every((message) => !message.includes(A) && !message.includes(LEGACY)));
});

const EDIT_A = "20000000-0000-4000-8000-000000000001";
const EDIT_B = "20000000-0000-4000-8000-000000000002";
const edit = (operation = EDIT_A, revision = 0, weight = "60") =>
  db.query("SELECT edit_workout_entry_set($1,$2,$3,$4,$5,9,'1','working','external') AS revision", [
    operation,
    ENTRY,
    SET_A,
    revision,
    weight,
  ]);

test("edit revisions reject the stale interleaving and replay never overwrites a newer edit", async () => {
  await createEntry();
  // Both clients have read revision 0 before either edit is delivered.
  assert.equal(
    (await rows("SELECT revision FROM workout_entry_sets WHERE id=$1", [SET_A]))[0].revision,
    0,
  );
  await asUser(A, async () => {
    assert.equal((await edit()).rows[0].revision, 1);
    await rejectsSql(() => edit(EDIT_B, 0, "70"), "40001");
    assert.equal((await edit(EDIT_B, 1, "70")).rows[0].revision, 2);
    assert.equal((await edit()).rows[0].revision, 1); // Lost first response retried after second edit.
    await rejectsSql(() => edit(EDIT_A, 0, "99"), "22023");
  });
  assert.deepEqual(
    await rows("SELECT weight::text,revision FROM workout_entry_sets WHERE id=$1", [SET_A]),
    [{ weight: "70", revision: 2 }],
  );
  assert.equal((await rows("SELECT count(*)::int AS n FROM workout_set_edit_operations"))[0].n, 2);
  await assertGatePass();
});

test("edit ledger and revision API reject foreign callers and the unsafe legacy signature", async () => {
  await createEntry();
  await asUser(B, () => rejectsSql(() => edit(), "42501"));
  await asUser(A, async () => {
    await rejectsSql(
      () =>
        db.query("SELECT update_workout_entry_set($1,$2,'99',10,NULL,'working','external')", [
          ENTRY,
          SET_A,
        ]),
      "42501",
    );
    await rejectsSql(() => db.query("SELECT * FROM workout_set_edit_operations"), "42501");
    await rejectsSql(() => edit(EDIT_A, -1), "22023");
    assert.equal((await edit()).rows[0].revision, 1);
    await db.query("SELECT delete_workout_entry_set($1,$2)", [ENTRY, SET_A]);
    assert.equal((await edit()).rows[0].revision, 1);
    await rejectsSql(() => edit(EDIT_B, 1), "P0002");
  });
  await assertGatePass();
});

test("browser legacy metrics are immutable while metadata, safe edits and exact retries still work", async () => {
  await createEntry();
  const original = await originalRows();
  await asUser(A, async () => {
    for (const patch of ["weight=99", "reps=ARRAY[10]", "rir=3"])
      await rejectsSql(
        () => db.query(`UPDATE workout_entries SET ${patch} WHERE id=$1`, [ENTRY]),
        "42501",
      );
    await db.query("UPDATE workout_entries SET notes='updated metadata' WHERE id=$1", [ENTRY]);
    await db.query("UPDATE workout_entries SET weight=weight,reps=reps,rir=rir WHERE id=$1", [
      ENTRY,
    ]);
    assert.equal((await edit()).rows[0].revision, 1);
  });
  await createEntry();
  assert.deepEqual(await originalRows(), original);
  assert.equal(
    (await rows("SELECT notes FROM workout_entries WHERE id=$1", [ENTRY]))[0].notes,
    "updated metadata",
  );
  await assertGatePass();
});
