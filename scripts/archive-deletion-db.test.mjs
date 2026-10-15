import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
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
  const journal = JSON.parse(file("drizzle/migrations/meta/_journal.json"));
  for (const entry of journal.entries) await db.exec(file(`drizzle/migrations/${entry.tag}.sql`));
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
});
after(async () => db?.close());

test("RPC grants deny anonymous calls and direct table DELETE", async () => {
  for (const name of ["delete_archived_program_day", "delete_archived_program_exercise"]) {
    const [grant] = await rows(
      "SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed, has_function_privilege('anon',$1,'EXECUTE') AS anonymous",
      [`public.${name}(uuid)`],
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
  });
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
