import { canonicalMigrations } from "./canonical-migrations.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Synthetic fixtures only: no .env, remote database or actual JWT is used.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const operation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tags = [
  "20261015144732_guard_new_exercise_day",
  "20261015144758_restrict_workout_table_grants",
];
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let db, days, exercise, history, policies, serviceGrants;
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
const save = () =>
  db.query("SELECT save_workout_entry($1,$2,$3,'2026-10-15',50,'{8,8,7,6}',2,'История') AS id", [
    operation,
    exercise,
    days[0].id,
  ]);
const grants = () =>
  rows(`SELECT c.relname, a.privilege_type FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname='public' AND c.relname IN ('program_days','program_exercises','workout_entries')
    AND pg_get_userbyid(a.grantee)='service_role' ORDER BY c.relname,a.privilege_type`);

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE public_probe NOLOGIN;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role,public_probe;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  for (const migration of canonicalMigrations().filter(
    (migration) => !tags.includes(migration.file.slice(0, -4)),
  ))
    await db.exec(migration.sql);
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
  await asUser(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Первый", "Второй"]]);
    days = await rows("SELECT id FROM program_days ORDER BY position");
    exercise = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Жим',$1) RETURNING id", [
        days[0].id,
      ])
    )[0].id;
    await save();
    // Existing legacy rows must not be repaired or deleted by the migrations.
    await db.query("INSERT INTO program_exercises(name,day_id) VALUES ('Legacy',NULL)");
  });
  history = await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id");
  policies = await rows(
    "SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
  );
  serviceGrants = await grants();
  await db.exec("GRANT ALL ON program_days,program_exercises,workout_entries TO PUBLIC");
  for (const tag of tags) await db.exec(file(`drizzle/migrations/${tag}.sql`));
});
after(async () => {
  await db?.close();
});

test("B12 rejects INSERT when a day was archived after the client's successful SELECT", async () => {
  await asUser(A, async () => {
    assert.equal(
      (await rows("SELECT archived_at FROM program_days WHERE id=$1", [days[1].id]))[0].archived_at,
      null,
    );
    await db.query("UPDATE program_days SET revision=revision+1,archived_at=now() WHERE id=$1", [
      days[1].id,
    ]);
    await assert.rejects(
      db.query("INSERT INTO program_exercises(name,day_id) VALUES ('Lost race',$1)", [days[1].id]),
      (error) => error.code === "22023",
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM program_exercises WHERE name='Lost race'"))[0].n,
      0,
    );
    // Editing an existing archived exercise remains valid, even in an archived day.
    await db.query(
      "UPDATE program_exercises SET revision=revision+1,archived_at=now(),day_id=$1 WHERE id=$2",
      [days[1].id, exercise],
    );
    await db.query(
      "UPDATE program_exercises SET revision=revision+1,name='Жим в архиве',position=2 WHERE id=$1",
      [exercise],
    );
    await save(); // Replay of a confirmed historical operation, never a new entry.
    await db.query("UPDATE program_days SET revision=revision+1,archived_at=NULL WHERE id=$1", [
      days[1].id,
    ]);
    await db.query(
      "INSERT INTO program_exercises(name,day_id) VALUES ('После восстановления',$1)",
      [days[1].id],
    );
  });
});

test("B12 rejects a foreign day and keeps the existing owner lock and invoker security", async () => {
  await asUser(B, async () => {
    await assert.rejects(
      db.query("INSERT INTO program_exercises(name,day_id) VALUES ('Foreign',$1)", [days[0].id]),
      (error) => error.code === "22023",
    );
  });
  const [fn] = await rows(
    "SELECT prosecdef,prosrc FROM pg_proc WHERE oid='public.lock_program_owner()'::regprocedure",
  );
  assert.equal(fn.prosecdef, false);
  assert.match(fn.prosrc, /pg_advisory_xact_lock\(hashtextextended\(NEW.user_id::text, 0\)\)/);
  assert.match(fn.prosrc, /TG_OP = 'INSERT'/);
});

test("B09 denies table-wide privileges and unneeded DELETE to public user roles", async () => {
  for (const table of ["program_days", "program_exercises", "workout_entries"])
    for (const role of ["anon", "authenticated", "public_probe"]) {
      for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER", "DELETE", "MAINTAIN"])
        assert.equal(
          (
            await rows("SELECT has_table_privilege($1,$2,$3) AS allowed", [
              role,
              `public.${table}`,
              privilege,
            ])
          )[0].allowed,
          false,
        );
      for (const privilege of ["SELECT", "INSERT", "UPDATE"])
        assert.equal(
          (
            await rows("SELECT has_table_privilege($1,$2,$3) AS allowed", [
              role,
              `public.${table}`,
              privilege,
            ])
          )[0].allowed,
          role === "authenticated",
        );
      await asUser(
        "",
        async () => {
          await assert.rejects(
            db.exec(`TRUNCATE public.${table}`),
            (error) => error.code === "42501",
          );
        },
        role,
      );
    }
});

test("B09 preserves DML, RPCs, RLS, service_role, legacy rows and historical entries", async () => {
  await asUser(A, async () => {
    await db.query("SELECT reorder_program_days($1::uuid[])", [
      days.map((day) => day.id).reverse(),
    ]);
    const activeExercises = await rows(
      "SELECT id FROM program_exercises WHERE day_id=$1 AND archived_at IS NULL",
      [days[1].id],
    );
    await db.query("SELECT reorder_program_exercises($1,$2::uuid[])", [
      days[1].id,
      activeExercises.map((ex) => ex.id),
    ]);
    await save();
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 1);
    assert.equal(
      (
        await rows(
          "SELECT count(*)::int AS n FROM program_exercises WHERE name='Legacy' AND day_id IS NULL",
        )
      )[0].n,
      1,
    );
  });
  await asUser(B, async () => {
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 0);
    await assert.rejects(
      save(),
      (error) => error.code === "23503" && error.message.includes("Упражнение недоступно"),
    );
    await db.query("SELECT setup_program($1::text[])", [["День B"]]);
  });
  assert.deepEqual(await grants(), serviceGrants);
  assert.deepEqual(
    await rows("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"),
    policies,
  );
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    history,
  );
  const preflight = await db.exec(file("scripts/release-schema-preflight.sql"));
  const flags = preflight
    .flatMap((statement) => statement.rows)
    .find((row) => Object.hasOwn(row, "legacy_null_day_exists"));
  assert.equal(flags.legacy_null_day_exists, true);
  assert.ok(
    Object.entries(flags)
      .filter(([key]) => key !== "legacy_null_day_exists")
      .every(([, value]) => value === false),
  );
  for (const tag of tags) await db.exec(file(`drizzle/migrations/${tag}.sql`));
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    history,
  );
});

test("latest migrations preserve optional template setup, new saves and replay after archive", async () => {
  const C = "33333333-3333-4333-8333-333333333333";
  const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await db.query("INSERT INTO auth.users VALUES ($1)", [C]);
  await asUser(C, async () => {
    await db.query("SELECT setup_program($1::text[],'upper_lower')", [
      ["Пуш", "Ноги", "Тяга", "Корпус"],
    ]);
    assert.equal((await rows("SELECT count(*)::int AS n FROM program_days"))[0].n, 4);
    const [ex] = await rows("SELECT id,day_id FROM program_exercises ORDER BY position,id LIMIT 1");
    const insert = () =>
      db.query("SELECT save_workout_entry($1,$2,$3,'2026-10-15',0,'{8,8}',NULL,NULL)", [
        id,
        ex.id,
        ex.day_id,
      ]);
    await insert();
    const original = await rows(
      "SELECT to_jsonb(w)::text AS row FROM workout_entries w WHERE id=$1",
      [id],
    );
    assert.equal(original.length, 1);
    await db.query(
      "UPDATE program_exercises SET revision=revision+1,archived_at=now() WHERE id=$1",
      [ex.id],
    );
    await db.query(
      "UPDATE program_days SET revision=revision+1,archived_at=now(),name='Новое название' WHERE id=$1",
      [ex.day_id],
    );
    await insert();
    assert.deepEqual(
      await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w WHERE id=$1", [id]),
      original,
    );
  });
});
