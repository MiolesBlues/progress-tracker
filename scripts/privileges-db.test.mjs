import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Isolated PostgreSQL/WASM only; never reads .env or connects to Supabase.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const migration = "20261015112617_revoke_workout_truncate";
const tables = ["program_days", "program_exercises", "workout_entries"];
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let db, daysA, dayB, exA, history, policies, serviceGrants, grantsBefore, preflightBefore;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
async function asRole(role, uid, action) {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const grants = (role) =>
  rows(
    `SELECT c.relname, a.privilege_type FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND pg_get_userbyid(a.grantee)=$2
  ORDER BY c.relname,a.privilege_type`,
    [tables, role],
  );
const rpc = (id = ID) =>
  db.query("SELECT save_workout_entry($1,$2,$3,'2026-10-15',50,'{8,8,7,6}',2,'История') AS id", [
    id,
    exA,
    daysA[0].id,
  ]);

before(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE public_probe NOLOGIN;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role,public_probe;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    -- Supabase-like defaults: bare migration fixtures alone would miss B09.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  for (const name of [
    "0000_workout_schema",
    "0001_program_fields_soft_delete_restrict_fk",
    "0002_personal_program_days",
    "0003_program_management",
    "0004_workout_data_integrity",
  ])
    await db.exec(file(`drizzle/migrations/${name}.sql`));
  // Test inherited PUBLIC privileges too, even though current production has no such ACL entry.
  await db.exec(`GRANT TRUNCATE ON program_days,program_exercises,workout_entries TO PUBLIC;`);
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [A, B]);
  await asRole("authenticated", A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Силовой", "Другой"]]);
    daysA = await rows("SELECT id FROM program_days ORDER BY position");
    exA = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Жим',$1) RETURNING id", [
        daysA[0].id,
      ])
    )[0].id;
    await rpc();
  });
  await asRole("authenticated", B, async () => {
    await db.query("SELECT setup_program($1::text[])", [["День B"]]);
    dayB = (await rows("SELECT id FROM program_days"))[0].id;
  });
  history = await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id");
  policies = await rows(
    "SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname",
  );
  serviceGrants = await grants("service_role");
  grantsBefore = { anon: await grants("anon"), authenticated: await grants("authenticated") };
  assert.equal(
    (
      await rows(
        "SELECT has_table_privilege('anon','public.workout_entries','TRUNCATE') AS allowed",
      )
    )[0].allowed,
    true,
  );
  preflightBefore = await db.exec(file("scripts/workout-privileges-preflight.sql"));
  await db.exec(file(`drizzle/migrations/${migration}.sql`));
});
after(async () => {
  await db?.close();
});

test("TRUNCATE is revoked from anon/authenticated/PUBLIC on all three tables", async () => {
  const effective = (result) =>
    result
      .flatMap((statement) => statement.rows)
      .filter((row) => Object.hasOwn(row, "can_truncate"));
  assert.equal(effective(preflightBefore).length, 9);
  assert.ok(effective(preflightBefore).every((row) => row.can_truncate));
  const after = effective(await db.exec(file("scripts/workout-privileges-preflight.sql")));
  assert.equal(
    after.filter((row) => row.rolname !== "service_role" && !row.can_truncate).length,
    6,
  );
  for (const role of ["anon", "authenticated", "public_probe"])
    for (const table of tables) {
      assert.equal(
        (
          await rows("SELECT has_table_privilege($1,$2,'TRUNCATE') AS allowed", [
            role,
            `public.${table}`,
          ])
        )[0].allowed,
        false,
      );
    }
  assert.equal(
    (
      await rows(
        `SELECT count(*)::int AS n FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=ANY($1::regclass[])
    AND a.grantee=0 AND a.privilege_type='TRUNCATE'`,
        [tables],
      )
    )[0].n,
    0,
  );
  for (const role of ["anon", "authenticated", "public_probe"])
    await asRole(role, role === "authenticated" ? A : "", async () => {
      await assert.rejects(
        db.exec("TRUNCATE public.workout_entries, public.program_exercises, public.program_days"),
        (error) => error.code === "42501",
      );
    });
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    history,
  );
});

test("migration changes only TRUNCATE grants, retains service_role and RLS, and is repeatable", async () => {
  for (const role of ["anon", "authenticated"])
    assert.deepEqual(
      await grants(role),
      grantsBefore[role].filter((grant) => grant.privilege_type !== "TRUNCATE"),
    );
  assert.deepEqual(await grants("service_role"), serviceGrants);
  for (const table of tables)
    assert.equal(
      (
        await rows("SELECT has_table_privilege('service_role',$1,'TRUNCATE') AS allowed", [
          `public.${table}`,
        ])
      )[0].allowed,
      true,
    );
  assert.deepEqual(
    await rows("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"),
    policies,
  );
  assert.ok(
    (
      await rows("SELECT relrowsecurity FROM pg_class WHERE oid=ANY($1::regclass[])", [tables])
    ).every((row) => row.relrowsecurity),
  );
  await db.exec(file(`drizzle/migrations/${migration}.sql`));
  assert.deepEqual(await grants("service_role"), serviceGrants);
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    history,
  );
});

test("own program CRUD, both reorder RPCs, workout insert/read/update and retry still work", async () => {
  await asRole("authenticated", A, async () => {
    await db.query("UPDATE program_days SET name='Новое имя' WHERE id=$1", [daysA[0].id]);
    await db.query("SELECT reorder_program_days($1::uuid[])", [[daysA[1].id, daysA[0].id]]);
    assert.deepEqual(
      (await rows("SELECT id FROM program_days ORDER BY position")).map((row) => row.id),
      [daysA[1].id, daysA[0].id],
    );
    const ex2 = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Тяга',$1) RETURNING id", [
        daysA[0].id,
      ])
    )[0].id;
    await db.query("SELECT reorder_program_exercises($1,$2::uuid[])", [daysA[0].id, [ex2, exA]]);
    assert.deepEqual(
      (await rows("SELECT id FROM program_exercises ORDER BY position")).map((row) => row.id),
      [ex2, exA],
    );
    assert.equal((await rpc()).rows[0].id, ID);
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 1);
    const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await rpc(second);
    await db.query("UPDATE workout_entries SET notes='Своя заметка' WHERE id=$1", [second]);
    assert.equal(
      (await rows("SELECT notes FROM workout_entries WHERE id=$1", [second]))[0].notes,
      "Своя заметка",
    );
    await db.query(
      "UPDATE program_exercises SET name='Новое упражнение', archived_at=now() WHERE id=$1",
      [exA],
    );
    await db.query("UPDATE program_days SET archived_at=now() WHERE id=$1", [daysA[0].id]);
    assert.equal((await rpc()).rows[0].id, ID); // Retry remains valid after archival.
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 2);
    assert.equal(
      (await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w WHERE id=$1", [ID]))[0]
        .row,
      history[0].row,
    );
    await db.query("UPDATE program_days SET archived_at=NULL WHERE id=$1", [daysA[0].id]);
    await db.query("UPDATE program_exercises SET archived_at=NULL WHERE id=$1", [exA]);
  });
});

test("RLS still isolates foreign owners and anonymous access", async () => {
  await asRole("authenticated", B, async () => {
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 0);
    assert.equal(
      (await rows("UPDATE workout_entries SET weight=99 WHERE id=$1 RETURNING id", [ID])).length,
      0,
    );
    assert.equal(
      (await rows("UPDATE program_days SET name='Подмена' WHERE id=$1 RETURNING id", [daysA[0].id]))
        .length,
      0,
    );
    await assert.rejects(
      db.query("INSERT INTO program_days(user_id,name) VALUES ($1,'Подмена')", [A]),
      (error) => error.code === "42501",
    );
    await assert.rejects(
      db.query(
        "SELECT save_workout_entry(gen_random_uuid(),$1,$2,'2026-10-15',50,'{8}',NULL,NULL)",
        [exA, dayB],
      ),
      (error) => error.code === "23503",
    );
  });
  await asRole("anon", "", async () => {
    assert.equal((await rows("SELECT count(*)::int AS n FROM workout_entries"))[0].n, 0);
    await assert.rejects(
      db.query(
        "INSERT INTO workout_entries(user_id,exercise_id,day_id,weight,reps) VALUES ($1,$2,$3,50,'{8}')",
        [A, exA, daysA[0].id],
      ),
      (error) => error.code === "23503",
    );
  });
});

test("PostgreSQL last-entry ordering respects the cutoff, created_at microseconds and UUID ties", async () => {
  await asRole("authenticated", A, async () => {
    await db.exec("BEGIN");
    try {
      for (const [id, date, created, weight, reps] of [
        [
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          "2026-10-15",
          "2026-10-15T12:00:00.000001Z",
          50,
          [8, 8, 7, 6],
        ],
        [
          "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          "2026-10-15",
          "2026-10-15T12:00:00.000002Z",
          52.5,
          [8, 8, 7, 7],
        ],
        [
          "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          "2026-10-15",
          "2026-10-15T12:00:00.000002Z",
          0,
          [9, 8],
        ],
        ["ffffffff-ffff-4fff-8fff-ffffffffffff", "2026-10-16", "2026-10-16T12:00:00Z", 60, [10]],
      ])
        await db.query(
          `INSERT INTO workout_entries(id,exercise_id,day_id,performed_on,created_at,weight,reps)
        VALUES ($1,$2,$3,$4,$5,$6,$7::int[])`,
          [id, exA, daysA[0].id, date, created, weight, reps],
        );
      const latest = () =>
        rows(
          `SELECT id,weight,reps FROM workout_entries
        WHERE user_id=$1 AND exercise_id=$2 AND performed_on<=$3
        ORDER BY performed_on DESC,created_at DESC,id DESC LIMIT 1`,
          [A, exA, "2026-10-15"],
        );
      // Exclude the pre-existing fixture entries, whose creation time is deliberately newer.
      await db.query("DELETE FROM workout_entries WHERE id IN ($1,$2)", [
        ID,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ]);
      assert.equal((await latest())[0].id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
      assert.deepEqual((await latest())[0].reps, [9, 8]);
      await db.query("DELETE FROM workout_entries WHERE id=$1", [
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      ]);
      assert.equal((await latest())[0].id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    } finally {
      await db.exec("ROLLBACK");
    }
  });
});
