import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

let db, daysA, dayB, exA, exB, historical, oldProgram, preflight;
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function user(uid, fn, role = "authenticated") {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function rejects(sql, args, code) {
  await assert.rejects(db.query(sql, args), (error) => error.code === code);
}
const rpc = (id = ID, exercise = exA, day = daysA[0].id, weight = 52.5, reps = [8, 8, 7, 6]) =>
  db.query("SELECT save_workout_entry($1,$2,$3,'2026-10-13',$4,$5::int[],1.5,'заметка') AS id", [
    id,
    exercise,
    day,
    weight,
    reps,
  ]);

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for (const name of [
    "0000_workout_schema",
    "0001_program_fields_soft_delete_restrict_fk",
    "0002_personal_program_days",
    "0003_program_management",
  ])
    await db.exec(file(`drizzle/migrations/${name}.sql`));
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
  await user(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Силовой", "Другой"]]);
    daysA = await rows("SELECT id FROM program_days ORDER BY position");
    exA = (
      await rows(
        "INSERT INTO program_exercises(name,day_id,target_sets,example_reps) VALUES ('Жим',$1,4,'{8,8,7,6}') RETURNING id",
        [daysA[0].id],
      )
    )[0].id;
    for (const reps of ["'{}'", "'{-1,8}'", "'{NULL,8}'", "'{{1,2},{3,4}}'", "'[0:1]={1,2}'"])
      await db.query(
        `INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,50,${reps}::int[])`,
        [exA],
      );
    const orphan = (
      await rows(
        "INSERT INTO program_exercises(name,working_weight,example_reps) VALUES ('Старый пример',2001,'{NULL,-1}') RETURNING id",
      )
    )[0].id;
    await db.query("INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,10,'{8}')", [
      orphan,
    ]);
    await db.query(
      "INSERT INTO program_exercises(name,working_weight,example_reps) VALUES ('Старая точность',50.123,'{}')",
    );
  });
  await user(B, async () => {
    await db.query("SELECT setup_program($1::text[])", [["День B"]]);
    dayB = (await rows("SELECT id FROM program_days"))[0].id;
    exB = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Чужое',$1) RETURNING id", [
        dayB,
      ])
    )[0].id;
  });
  historical = await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id");
  oldProgram = await rows("SELECT to_jsonb(e)::text AS row FROM program_exercises e ORDER BY id");
  // Actual read-only preflight on the isolated schema/data BEFORE the new migration.
  preflight = await db.exec(file("scripts/workout-preflight.sql"));
  await db.exec(file("drizzle/migrations/0004_workout_data_integrity.sql"));
});
after(async () => {
  await db?.close();
});

test("read-only preflight finds invalid legacy rows; migration retains them exactly with NOT VALID constraints", async () => {
  assert.equal(preflight[1].rows.length, 5);
  assert.equal(preflight[2].rows.length, 2);
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    historical,
  );
  assert.deepEqual(
    await rows("SELECT to_jsonb(e)::text AS row FROM program_exercises e ORDER BY id"),
    oldProgram,
  );
  const constraints = await rows(
    "SELECT convalidated FROM pg_constraint WHERE conname IN ('workout_entries_reps_valid','program_exercises_example_reps_valid','program_exercises_weight_valid')",
  );
  assert.equal(constraints.length, 3);
  assert.ok(constraints.every((row) => !row.convalidated));
});
for (const [name, reps] of [
  ["empty", "'{}'"],
  ["negative", "'{-1,8}'"],
  ["NULL element", "'{NULL,8}'"],
  ["two dimensions", "'{{1,2},{3,4}}'"],
  ["nonstandard lower bound", "'[0:1]={1,2}'"],
  ["21 sets", "array_fill(8,ARRAY[21])"],
]) {
  test(`rejects ${name} reps through direct INSERT`, () =>
    user(A, () =>
      rejects(
        `INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,50,${reps}::int[])`,
        [exA],
        "23514",
      ),
    ));
}
test("accepts zero reps, explicit zero weight, decimal weight, and exactly 20 sets", () =>
  user(A, async () => {
    await db.query(
      "INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,0,ARRAY[0]),($1,52.55,array_fill(8,ARRAY[20]))",
      [exA],
    );
  }));

test("a NULL reps array is rejected and nullable examples remain supported", () =>
  user(A, async () => {
    await rejects(
      "INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,50,NULL)",
      [exA],
      "23502",
    );
    await db.query(
      "INSERT INTO program_exercises(name,example_reps,working_weight) VALUES ('Без примера',NULL,NULL)",
    );
  }));
test("the optional Upper/Lower template still satisfies the new constraints", async () => {
  const uid = "33333333-3333-4333-8333-333333333333";
  await db.query("INSERT INTO auth.users(id) VALUES ($1)", [uid]);
  await user(uid, async () => {
    await db.query("SELECT setup_program($1::text[],'upper_lower')", [
      ["Один", "Два", "Три", "Четыре"],
    ]);
    assert.equal((await rows("SELECT count(*)::int AS n FROM program_exercises"))[0].n, 25);
    assert.equal((await rows("SELECT count(*)::int AS n FROM program_days"))[0].n, 4);
  });
});
for (const weight of ["-1", "2000.01", "1.234", "'NaN'::numeric", "'Infinity'::numeric"]) {
  test(`rejects weight ${weight} without rounding`, () =>
    user(A, async () => {
      await rejects(
        `INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,${weight},'{8}')`,
        [exA],
        "23514",
      );
      await rejects(
        `INSERT INTO program_exercises(name,working_weight) VALUES ('Новый',${weight})`,
        [],
        "23514",
      );
    }));
}
test("validates example_reps and RIR precision on future writes", () =>
  user(A, async () => {
    for (const reps of [
      "'{}'",
      "'{NULL,8}'",
      "'{-1,8}'",
      "'{{8,8},{8,8}}'",
      "array_fill(8,ARRAY[21])",
    ])
      await rejects(
        `INSERT INTO program_exercises(name,example_reps) VALUES ('Пример',${reps}::int[])`,
        [],
        "23514",
      );
    await rejects(
      "INSERT INTO workout_entries(exercise_id,weight,reps,rir) VALUES ($1,50,'{8}',1.55)",
      [exA],
      "23514",
    );
  }));
test("server derives day and name; client cannot forge owner, exercise or selected day", () =>
  user(A, async () => {
    await rejects(
      "INSERT INTO workout_entries(exercise_id,day_id,day_name,weight,reps) VALUES ($1,$2,'fake',50,'{8}')",
      [exA, daysA[1].id],
      "23503",
    );
    await rejects(
      "INSERT INTO workout_entries(exercise_id,day_id,weight,reps) VALUES ($1,$2,50,'{8}')",
      [exA, dayB],
      "23503",
    );
    await rejects(
      "INSERT INTO workout_entries(exercise_id,weight,reps) VALUES ($1,50,'{8}')",
      [exB],
      "23503",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO workout_entries(user_id,exercise_id,weight,reps) VALUES ($1,$2,50,'{8}')",
        [B, exA],
      ),
    );
    const row = (
      await rows(
        "INSERT INTO workout_entries(exercise_id,day_name,weight,reps) VALUES ($1,'fake',50,'{8}') RETURNING day_id,day_name",
        [exA],
      )
    )[0];
    assert.deepEqual(row, { day_id: daysA[0].id, day_name: "Силовой" });
  }));
test("stable UUID retries insert one row; a new UUID permits another session on the same date", () =>
  user(A, async () => {
    assert.equal((await rpc()).rows[0].id, ID);
    assert.equal((await rpc()).rows[0].id, ID);
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [ID]))[0].n,
      1,
    );
    await assert.rejects(rpc(ID, exA, daysA[0].id, 60), (error) => error.code === "22023");
    await rpc("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assert.equal(
      (
        await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id IN ($1,$2)", [
          ID,
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ])
      )[0].n,
      2,
    );
  }));
test("archive/move/rename retain history; retry after archival succeeds while new logging is rejected", () =>
  user(A, async () => {
    const before = (await rows("SELECT * FROM workout_entries WHERE id=$1", [ID]))[0];
    await db.query(
      "UPDATE program_exercises SET day_id=$2,archived_at=now(),name='Новое имя' WHERE id=$1",
      [exA, daysA[1].id],
    );
    await db.query("UPDATE program_days SET name='Переименован',archived_at=now() WHERE id=$1", [
      daysA[0].id,
    ]);
    assert.equal((await rpc()).rows[0].id, ID);
    await assert.rejects(
      rpc("cccccccc-cccc-4ccc-8ccc-cccccccccccc", exA, daysA[1].id),
      (error) => error.code === "23503",
    );
    assert.deepEqual((await rows("SELECT * FROM workout_entries WHERE id=$1", [ID]))[0], before);
    await rejects("UPDATE workout_entries SET day_name='fake' WHERE id=$1", [ID], "42501");
    await rejects("UPDATE workout_entries SET day_id=$2 WHERE id=$1", [ID, daysA[1].id], "42501");
    await rejects("UPDATE workout_entries SET exercise_id=$2 WHERE id=$1", [ID, exB], "42501");
    await db.query("UPDATE program_exercises SET archived_at=NULL WHERE id=$1", [exA]);
    await db.query("UPDATE program_days SET archived_at=NULL WHERE id=$1", [daysA[0].id]);
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [daysA[1].id]);
    await assert.rejects(
      rpc("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", exA, daysA[1].id),
      (error) => error.code === "23503",
    );
    await rejects("DELETE FROM program_exercises WHERE id=$1", [exA], "42501");
  }));
test("RPC and replay are isolated from another owner and anon", async () => {
  await user(B, async () => {
    assert.equal((await rows("SELECT id FROM workout_entries WHERE id=$1", [ID])).length, 0);
    await assert.rejects(rpc(ID, exB, dayB), (error) => error.code === "42501");
    await assert.rejects(
      rpc("dddddddd-dddd-4ddd-8ddd-dddddddddddd", exA, dayB),
      (error) => error.code === "23503",
    );
  });
  await user(
    "",
    () =>
      rejects(
        "SELECT save_workout_entry($1,$2,$3,current_date,50,'{8}')",
        [ID, exA, daysA[0].id],
        "42501",
      ),
    "anon",
  );
});
