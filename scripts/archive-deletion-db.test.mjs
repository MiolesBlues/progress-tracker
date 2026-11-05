import { canonicalMigrations } from "./canonical-migrations.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let db;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function asUser(userId, action, role = "authenticated") {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
  for (const migration of canonicalMigrations()) await db.exec(migration.sql);
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
});
after(async () => db?.close());

test("RPC grants deny anonymous calls and direct table DELETE", async () => {
  for (const name of [
    "delete_archived_program_day",
    "delete_archived_program_exercise",
    "archive_deletion_capabilities",
  ]) {
    const [grant] = await rows(
      "SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed, has_function_privilege('anon',$1,'EXECUTE') AS anonymous",
      [name === "archive_deletion_capabilities" ? `public.${name}()` : `public.${name}(uuid)`],
    );
    assert.equal(grant.allowed, true);
    assert.equal(grant.anonymous, false);
  }
  await asUser(A, async () => {
    for (const table of ["program_days", "program_exercises", "workout_entries"])
      assert.equal(
        (await rows("SELECT has_table_privilege(current_user,$1,'DELETE') AS allowed", [table]))[0]
          .allowed,
        false,
      );
    const [ledger] = await rows(
      `SELECT has_table_privilege('anon','public.workout_entry_operations','SELECT') AS anon_read,
        has_table_privilege('authenticated','public.workout_entry_operations','SELECT') AS own_read,
        has_table_privilege('authenticated','public.workout_entry_operations','INSERT') AS insert_allowed,
        has_table_privilege('authenticated','public.workout_entry_operations','UPDATE') AS update_allowed,
        has_table_privilege('authenticated','public.workout_entry_operations','DELETE') AS delete_allowed,
        c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
       FROM pg_class c WHERE c.oid='public.workout_entry_operations'::regclass`,
    );
    assert.deepEqual(ledger, {
      anon_read: false,
      own_read: true,
      insert_allowed: false,
      update_allowed: false,
      delete_allowed: false,
      rls: true,
      force_rls: true,
    });
    const [tombstones] = await rows(
      `SELECT has_table_privilege('anon','public.workout_entry_operation_tombstones','SELECT') AS anon_read,
        has_table_privilege('authenticated','public.workout_entry_operation_tombstones','SELECT') AS own_read,
        has_table_privilege('authenticated','public.workout_entry_operation_tombstones','INSERT') AS insert_allowed,
        has_table_privilege('authenticated','public.workout_entry_operation_tombstones','DELETE') AS delete_allowed,
        c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
       FROM pg_class c WHERE c.oid='public.workout_entry_operation_tombstones'::regclass`,
    );
    assert.deepEqual(tombstones, {
      anon_read: false,
      own_read: true,
      insert_allowed: false,
      delete_allowed: false,
      rls: true,
      force_rls: true,
    });
  });
});

test("account data orphan preflight detects legacy rows without deleting them", async () => {
  const preflight = file("scripts/account-data-preflight.sql");
  const before = await rows(preflight);
  assert.ok(before.every((row) => Number(row.orphan_rows) === 0));
  await db.query(
    "INSERT INTO public.program_days(user_id,name,position) VALUES ($1,'orphan-day',0)",
    [C],
  );
  const detected = await rows(preflight);
  assert.equal(Number(detected.find((row) => row.table_name === "program_days").orphan_rows), 1);
  assert.equal(
    Number(
      (await rows("SELECT count(*)::int AS n FROM public.program_days WHERE user_id=$1", [C]))[0].n,
    ),
    1,
  );
  await db.query("DELETE FROM public.program_days WHERE user_id=$1", [C]);
});

test("archived day deletion keeps exercises and every meaningful history field", async () => {
  await asUser(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["First", "Second"]]);
    const [first, second] = await rows(
      "SELECT id FROM program_days WHERE user_id=$1 ORDER BY position",
      [A],
    );
    const [linked] = await rows(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Same name',$1) RETURNING id",
      [first.id],
    );
    const [moved] = await rows(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Moved',$1) RETURNING id",
      [first.id],
    );
    for (const [id, exerciseId] of [
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", linked.id],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", moved.id],
    ])
      await db.query(
        "SELECT save_workout_entry($1,$2,$3,'2026-10-15',52.5,'{8,8,7,6}',2,'Keep me')",
        [id, exerciseId, first.id],
      );
    await db.query("UPDATE program_exercises SET day_id=$1 WHERE id=$2", [second.id, moved.id]);
    const beforeRows = await rows(
      "SELECT id,exercise_id,user_id,performed_on,weight,reps,rir,notes,day_name,created_at FROM workout_entries WHERE user_id=$1 ORDER BY id",
      [A],
    );
    await assert.rejects(
      db.query("UPDATE workout_entries SET day_id=NULL WHERE user_id=$1", [A]),
      (error) => error.code === "42501",
    );
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [first.id]);
    assert.equal(
      (await rows("SELECT delete_archived_program_day($1) AS deleted", [first.id]))[0].deleted,
      true,
    );
    assert.equal(
      (await rows("SELECT delete_archived_program_day($1) AS deleted", [first.id]))[0].deleted,
      false,
    );
    assert.deepEqual(
      await rows(
        "SELECT id,exercise_id,user_id,performed_on,weight,reps,rir,notes,day_name,created_at FROM workout_entries WHERE user_id=$1 ORDER BY id",
        [A],
      ),
      beforeRows,
    );
    assert.equal(
      (
        await rows(
          "SELECT count(*)::int AS n FROM workout_entries WHERE user_id=$1 AND day_id IS NOT NULL",
          [A],
        )
      )[0].n,
      0,
    );
    const exercises = await rows(
      "SELECT id,day_id FROM program_exercises WHERE id IN ($1,$2) ORDER BY id",
      [linked.id, moved.id],
    );
    assert.equal(exercises.find((row) => row.id === linked.id).day_id, null);
    assert.equal(exercises.find((row) => row.id === moved.id).day_id, second.id);
    await db.query("UPDATE program_exercises SET day_id=$1 WHERE id=$2", [second.id, linked.id]);
    assert.equal(
      (await rows("SELECT day_id FROM program_exercises WHERE id=$1", [linked.id]))[0].day_id,
      second.id,
    );
  });
});

test("a lost save reply can be retried exactly after day deletion, while changed payloads fail", async () => {
  await db.query("INSERT INTO auth.users VALUES ($1)", [C]);
  await asUser(C, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Leg day", "Other day"]]);
    const [day, otherDay] = await rows(
      "SELECT id FROM program_days WHERE user_id=$1 ORDER BY position",
      [C],
    );
    const [exercise] = await rows(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Squat',$1) RETURNING id",
      [day.id],
    );
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const original = [id, exercise.id, day.id, "2026-10-15", 100, [8, 7, 6], 2, "retry me"];
    assert.equal(
      (await rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8) AS id", original))[0].id,
      id,
    );
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [day.id]);
    assert.equal(
      (await rows("SELECT delete_archived_program_day($1) AS ok", [day.id]))[0].ok,
      true,
    );
    assert.equal(
      (await rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8) AS id", original))[0].id,
      id,
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [id]))[0].n,
      1,
    );
    const changed = [
      [id, otherDay.id, day.id, "2026-10-15", 100, [8, 7, 6], 2, "retry me"],
      [id, exercise.id, otherDay.id, "2026-10-15", 100, [8, 7, 6], 2, "retry me"],
      [id, exercise.id, day.id, "2026-10-14", 100, [8, 7, 6], 2, "retry me"],
      [id, exercise.id, day.id, "2026-10-15", 101, [8, 7, 6], 2, "retry me"],
      [id, exercise.id, day.id, "2026-10-15", 100, [8, 7, 5], 2, "retry me"],
      [id, exercise.id, day.id, "2026-10-15", 100, [8, 7, 6], 3, "retry me"],
      [id, exercise.id, day.id, "2026-10-15", 100, [8, 7, 6], 2, "changed"],
    ];
    for (const payload of changed)
      await assert.rejects(
        rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8)", payload),
        (error) => error.code === "22023",
      );
  });
});

test("permanent exercise deletion removes payload history but prevents UUID reuse", async () => {
  const userId = "44444444-4444-4444-8444-444444444444";
  await db.query("INSERT INTO auth.users VALUES ($1)", [userId]);
  await asUser(userId, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Only day"]]);
    const [day] = await rows("SELECT id FROM program_days WHERE user_id=$1", [userId]);
    const [exercise] = await rows(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Delete me',$1) RETURNING id",
      [day.id],
    );
    const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const args = [id, exercise.id, day.id, "2026-10-15", 60, [8, 8], 2, "private note"];
    await rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8)", args);
    await db.query("UPDATE program_exercises SET archived_at=now() WHERE id=$1", [exercise.id]);
    assert.equal(
      (await rows("SELECT delete_archived_program_exercise($1) AS ok", [exercise.id]))[0].ok,
      true,
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [id]))[0].n,
      0,
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entry_operations WHERE id=$1", [id]))[0]
        .n,
      0,
    );
    assert.equal(
      (
        await rows(
          "SELECT count(*)::int AS n FROM workout_entry_operation_tombstones WHERE id=$1",
          [id],
        )
      )[0].n,
      1,
    );
    await assert.rejects(
      rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8)", args),
      (error) => error.code === "23503",
    );
    await assert.rejects(
      rows("SELECT save_workout_entry($1,$2,$3,$4,$5,$6,$7,$8)", [
        id,
        exercise.id,
        day.id,
        "2026-10-15",
        61,
        [8, 8],
        2,
        "changed",
      ]),
      (error) => error.code === "23503",
    );
  });
});

test("active and foreign objects cannot be deleted; archived exercise removes only its own history", async () => {
  let foreignExercise;
  let foreignDay;
  await asUser(B, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Other owner"]]);
    const [day] = await rows("SELECT id FROM program_days WHERE user_id=$1", [B]);
    foreignDay = day.id;
    const [exercise] = await rows(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Same name',$1) RETURNING id",
      [day.id],
    );
    foreignExercise = exercise.id;
    await db.query(
      "SELECT save_workout_entry('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$1,$2,'2026-10-15',60,'{5,5}',1,'Other')",
      [exercise.id, day.id],
    );
    await assert.rejects(
      db.query("SELECT delete_archived_program_day($1)", [day.id]),
      (error) => error.code === "22023",
    );
    await assert.rejects(
      db.query("SELECT delete_archived_program_exercise($1)", [exercise.id]),
      (error) => error.code === "22023",
    );
  });
  await asUser(A, async () => {
    const [foreign] = await rows("SELECT id FROM program_exercises WHERE user_id=$1", [A]);
    assert.equal(
      (await rows("SELECT delete_archived_program_day($1) AS deleted", [foreignDay]))[0].deleted,
      false,
    );
    assert.equal(
      (await rows("SELECT delete_archived_program_exercise($1) AS deleted", [foreignExercise]))[0]
        .deleted,
      false,
    );
    await db.query("UPDATE program_exercises SET archived_at=now() WHERE id=$1", [foreign.id]);
    assert.equal(
      (await rows("SELECT delete_archived_program_exercise($1) AS deleted", [foreign.id]))[0]
        .deleted,
      true,
    );
    assert.equal(
      (await rows("SELECT delete_archived_program_exercise($1) AS deleted", [foreign.id]))[0]
        .deleted,
      false,
    );
    assert.equal(
      (
        await rows("SELECT count(*)::int AS n FROM workout_entries WHERE exercise_id=$1", [
          foreign.id,
        ])
      )[0].n,
      0,
    );
  });
  await asUser(B, async () => {
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE user_id=$1", [B]))[0].n,
      1,
    );
  });
});
