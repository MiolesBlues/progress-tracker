import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// In-memory PostgreSQL only. No environment keys or remote connections are read.
let db;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let orphan, orphanLog, originalLog;
const sql = (file) =>
  readFileSync(new URL(`../drizzle/migrations/${file}`, import.meta.url), "utf8");
async function asUser(uid, action) {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function rejects(sqlText, args, code) {
  await assert.rejects(db.query(sqlText, args), (error) => error.code === code);
}
const rows = async (sqlText, args = []) => (await db.query(sqlText, args)).rows;

before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  for (const file of [
    "0000_workout_schema.sql",
    "0001_program_fields_soft_delete_restrict_fk.sql",
    "0002_personal_program_days.sql",
  ])
    await db.exec(sql(file));
  await db.query("INSERT INTO auth.users(id) VALUES ($1),($2)", [A, B]);
  await asUser(A, async () => {
    orphan = (
      await rows("INSERT INTO program_exercises(name) VALUES ('Непривязанный') RETURNING *")
    )[0];
    orphanLog = (
      await rows(
        "INSERT INTO workout_entries(exercise_id,weight,reps,performed_on) VALUES ($1,50,'{8,8,7}','2026-10-01') RETURNING *",
        [orphan.id],
      )
    )[0];
  });
  originalLog = JSON.stringify(orphanLog);
  await db.exec(sql("0003_program_management.sql"));
});
after(async () => {
  await db?.close();
});

test("migration preserves existing NULL day_id rows and all history exactly", async () => {
  assert.equal(
    (await rows("SELECT day_id FROM program_exercises WHERE id=$1", [orphan.id]))[0].day_id,
    null,
  );
  assert.equal(
    JSON.stringify((await rows("SELECT * FROM workout_entries WHERE id=$1", [orphanLog.id]))[0]),
    originalLog,
  );
});

test("onboarding supports every day count 1..7 and arbitrary names", async () => {
  for (let count = 1; count <= 7; count++) {
    const uid = `33333333-3333-4333-8333-${String(count).padStart(12, "0")}`;
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [uid]);
    await asUser(uid, async () => {
      const names = Array.from({ length: count }, (_, index) => `Свободное название ${index + 1}`);
      await db.query("SELECT setup_program($1::text[])", [names]);
      assert.deepEqual(
        (await rows("SELECT name FROM program_days ORDER BY position")).map((day) => day.name),
        names,
      );
      await rejects("SELECT setup_program($1::text[])", [names], "P0001");
    });
  }
});

test("day creation, rename, atomic reorder, archive, restore and server-side bounds", async () => {
  await asUser(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Силовой", "Кардио"]]);
    const initial = await rows("SELECT * FROM program_days ORDER BY position");
    await db.query("UPDATE program_days SET name='Ноги' WHERE id=$1", [initial[0].id]);
    await db.query("SELECT reorder_program_days($1::uuid[])", [[initial[1].id, initial[0].id]]);
    assert.deepEqual(
      (await rows("SELECT name FROM program_days ORDER BY position")).map((day) => day.name),
      ["Кардио", "Ноги"],
    );
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [initial[0].id]);
    await rejects(
      "UPDATE program_days SET archived_at=now() WHERE id=$1",
      [initial[1].id],
      "23514",
    );
    await db.query("UPDATE program_days SET archived_at=NULL WHERE id=$1", [initial[0].id]);
    for (let index = 0; index < 5; index++)
      await db.query("INSERT INTO program_days(name,position) VALUES ($1,$2)", [
        `Новый ${index}`,
        index + 2,
      ]);
    await rejects("INSERT INTO program_days(name) VALUES ('Восьмой')", [], "23514");
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [initial[0].id]);
    const extra = (await rows("INSERT INTO program_days(name) VALUES ('Другой') RETURNING id"))[0];
    await rejects("UPDATE program_days SET archived_at=NULL WHERE id=$1", [initial[0].id], "23514");
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [extra.id]);
    await db.query("UPDATE program_days SET archived_at=NULL WHERE id=$1", [initial[0].id]);
  });
});

test("exercise edit/move/reorder and day/exercise archive preserve the original log and snapshot", async () => {
  await asUser(A, async () => {
    const days = await rows(
      "SELECT id FROM program_days WHERE archived_at IS NULL ORDER BY position",
    );
    const ex1 = (
      await rows(
        "INSERT INTO program_exercises(name,day_id,position) VALUES ('Жим',$1,0) RETURNING id",
        [days[0].id],
      )
    )[0];
    const log = (
      await rows(
        "INSERT INTO workout_entries(exercise_id,weight,reps,performed_on) VALUES ($1,60,'{8,7,6}','2026-10-02') RETURNING *",
        [ex1.id],
      )
    )[0];
    await db.query("UPDATE program_days SET name='Другое имя' WHERE id=$1", [days[0].id]);
    await db.query(
      "UPDATE program_exercises SET name='Жим сидя',day_id=$2,target_sets=4,target_reps='6-8',working_weight=62.5 WHERE id=$1",
      [ex1.id, days[1].id],
    );
    const ex2 = (
      await rows(
        "INSERT INTO program_exercises(name,day_id,position) VALUES ('Тяга',$1,1) RETURNING id",
        [days[1].id],
      )
    )[0];
    await db.query("SELECT reorder_program_exercises($1,$2::uuid[])", [
      days[1].id,
      [ex2.id, ex1.id],
    ]);
    assert.deepEqual(
      (
        await rows("SELECT name FROM program_exercises WHERE day_id=$1 ORDER BY position", [
          days[1].id,
        ])
      ).map((ex) => ex.name),
      ["Тяга", "Жим сидя"],
    );
    const positions = await rows("SELECT id,position FROM program_exercises ORDER BY id");
    await rejects(
      "SELECT reorder_program_exercises($1,$2::uuid[])",
      [days[1].id, [ex1.id, ex1.id]],
      "22023",
    );
    assert.deepEqual(
      await rows("SELECT id,position FROM program_exercises ORDER BY id"),
      positions,
    );
    await db.query("UPDATE program_exercises SET archived_at=now() WHERE id=$1", [ex1.id]);
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [days[0].id]);
    assert.deepEqual((await rows("SELECT * FROM workout_entries WHERE id=$1", [log.id]))[0], log);
    await rejects("DELETE FROM program_exercises WHERE id=$1", [ex1.id], "42501");
    await rejects("DELETE FROM program_days WHERE id=$1", [days[0].id], "42501");
    await db.query("UPDATE program_exercises SET archived_at=NULL WHERE id=$1", [ex1.id]);
    await db.query("UPDATE program_exercises SET day_id=$2 WHERE id=$1", [orphan.id, days[1].id]);
    assert.equal(
      JSON.stringify((await rows("SELECT * FROM workout_entries WHERE id=$1", [orphanLog.id]))[0]),
      originalLog,
    );
  });
});

test("RLS isolates users and new reorder RPCs reject foreign/stale/null lists", async () => {
  const aDays = await rows(
    "SELECT id,position FROM program_days WHERE user_id=$1 AND archived_at IS NULL ORDER BY position",
    [A],
  );
  await asUser(B, async () => {
    await db.query("SELECT setup_program($1::text[])", [["День B"]]);
    assert.equal((await rows("SELECT * FROM program_exercises")).length, 0);
    await rejects("SELECT reorder_program_days($1::uuid[])", [aDays.map((day) => day.id)], "22023");
    await rejects("SELECT reorder_program_days(NULL)", [], "22023");
    await rejects("SELECT reorder_program_exercises($1,'{}'::uuid[])", [aDays[0].id], "22023");
    await rejects(
      "INSERT INTO program_exercises(name,day_id) VALUES ('Чужой день',$1)",
      [aDays[0].id],
      "23503",
    );
    await rejects(
      "INSERT INTO program_days(user_id,name) VALUES ($1,'Чужой владелец')",
      [A],
      "42501",
    );
  });
  assert.deepEqual(
    await rows(
      "SELECT id,position FROM program_days WHERE user_id=$1 AND archived_at IS NULL ORDER BY position",
      [A],
    ),
    aDays,
  );
  await db.exec("SET ROLE anon");
  try {
    await rejects("SELECT reorder_program_days('{}'::uuid[])", [], "42501");
  } finally {
    await db.exec("RESET ROLE");
  }
});
