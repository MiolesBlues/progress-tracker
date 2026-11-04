import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bundle = JSON.parse(file("docs/training-library/strength-templates.v1.json"));
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const contentHash = createHash("sha256").update(canonical(bundle), "utf8").digest("hex");
let db;
let existingProgramSnapshot;
const rows = async (query, args = []) => (await db.query(query, args)).rows;
async function asRole(role, userId, action) {
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
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE supabase_admin NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  for (const migration of [
    "0000_workout_schema.sql",
    "0001_program_fields_soft_delete_restrict_fk.sql",
    "0002_personal_program_days.sql",
    "0003_program_management.sql",
    "0004_workout_data_integrity.sql",
  ])
    await db.exec(file(`drizzle/migrations/${migration}`));
  await db.query("INSERT INTO auth.users(id) VALUES ($1),($2),($3)", [A, B, C]);
  await asRole("authenticated", C, async () => {
    await rows("SELECT public.setup_program($1::text[])", [["Существующая программа"]]);
    const day = (await rows("SELECT id FROM program_days WHERE user_id=$1", [C]))[0];
    const exercise = (
      await rows(
        "INSERT INTO program_exercises(name,day_id,target_sets,target_reps) VALUES ('Существующее упражнение',$1,4,'6-8') RETURNING id",
        [day.id],
      )
    )[0];
    await rows(
      "INSERT INTO workout_entries(user_id,exercise_id,day_id,day,performed_on,weight,reps,rir,notes) VALUES ($1,$2,$3,'legacy','2026-10-01',50,'{8,8}',2,'existing log')",
      [C, exercise.id, day.id],
    );
  });
  existingProgramSnapshot = [
    await rows(
      "SELECT id,user_id,name,position,archived_at,created_at FROM program_days WHERE user_id=$1 ORDER BY position",
      [C],
    ),
    await rows(
      "SELECT id,user_id,day_id,day,name,position,working_weight,target_sets,target_reps,example_reps,archived_at,created_at FROM program_exercises WHERE user_id=$1 ORDER BY position",
      [C],
    ),
    await rows(
      "SELECT id,user_id,exercise_id,day_id,day_name,performed_on,weight,reps,rir,notes,created_at FROM workout_entries WHERE user_id=$1",
      [C],
    ),
  ];
  await db.exec(file("drizzle/migrations/20261016150000_training_template_library.sql"));
  // Reproduce the broad grants observed on hosted project metadata before
  // applying the forward-only privilege correction.
  await db.exec(`GRANT ALL ON public.training_exercise_catalog, public.training_templates,
    public.training_template_days, public.training_template_slots,
    public.training_template_applications TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`);
  // Supabase-managed role defaults are not modifiable by the postgres role.
  // Model them explicitly so the release contract cannot silently ignore them.
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`);
  await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
    GRANT EXECUTE ON FUNCTIONS TO PUBLIC`);
  await db.exec(file("drizzle/migrations/20261020100000_training_library_least_privilege.sql"));
  await db.exec(file("drizzle/migrations/20261020120000_public_helper_function_privileges.sql"));
});

after(async () => db?.close());

test("template library migration leaves existing user programs and workout history unchanged", async () => {
  assert.deepEqual(
    [
      await rows(
        "SELECT id,user_id,name,position,archived_at,created_at FROM program_days WHERE user_id=$1 ORDER BY position",
        [C],
      ),
      await rows(
        "SELECT id,user_id,day_id,day,name,position,working_weight,target_sets,target_reps,example_reps,archived_at,created_at FROM program_exercises WHERE user_id=$1 ORDER BY position",
        [C],
      ),
      await rows(
        "SELECT id,user_id,exercise_id,day_id,day_name,performed_on,weight,reps,rir,notes,created_at FROM workout_entries WHERE user_id=$1",
        [C],
      ),
    ],
    existingProgramSnapshot,
  );
  assert.deepEqual(
    await rows(
      "SELECT d.template_application_id,d.template_day_key,e.target_rir_min,e.target_rir_max FROM program_days d JOIN program_exercises e ON e.user_id=d.user_id WHERE d.user_id=$1",
      [C],
    ),
    [
      {
        template_application_id: null,
        template_day_key: null,
        target_rir_min: null,
        target_rir_max: null,
      },
    ],
  );
});

test("template schema keeps keys, foreign keys, NOT NULL and RLS policies in place", async () => {
  const tables = await rows(
    `
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
  `,
    [
      [
        "training_exercise_catalog",
        "training_templates",
        "training_template_days",
        "training_template_slots",
        "training_template_applications",
      ],
    ],
  );
  assert.equal(tables.length, 5);
  assert.ok(tables.every((table) => table.relrowsecurity));

  const constraints = await rows(`
    SELECT conrelid::regclass::text AS table_name, conname, contype
    FROM pg_constraint
    WHERE conrelid::regclass::text IN (
      'training_template_applications', 'training_template_days', 'training_template_slots'
    )
  `);
  for (const expected of [
    {
      table_name: "training_template_applications",
      conname: "training_template_applications_pkey",
      contype: "p",
    },
    {
      table_name: "training_template_applications",
      conname: "training_template_applications_user_id_template_key_version_key",
      contype: "u",
    },
    {
      table_name: "training_template_applications",
      conname: "training_template_applications_template_key_version_fkey",
      contype: "f",
    },
    {
      table_name: "training_template_days",
      conname: "training_template_days_template_key_version_fkey",
      contype: "f",
    },
    {
      table_name: "training_template_slots",
      conname: "training_template_slots_exercise_key_fkey",
      contype: "f",
    },
    {
      table_name: "training_template_slots",
      conname: "training_template_slots_template_key_version_day_key_fkey",
      contype: "f",
    },
  ])
    assert.ok(
      constraints.some((constraint) =>
        Object.entries(expected).every(([key, value]) => constraint[key] === value),
      ),
      `missing constraint ${expected.conname}`,
    );

  const notNull = await rows(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('training_template_applications','training_template_slots')
      AND column_name IN ('application_id','user_id','template_key','version','slot_key','exercise_key')
      AND is_nullable='NO'
  `);
  assert.equal(notNull.length, 8);
  const policies = await rows(`
    SELECT tablename, policyname, roles::text[] AS roles, cmd
    FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('training_template_applications','training_templates','training_template_slots')
  `);
  assert.ok(
    policies.some(
      (policy) =>
        policy.tablename === "training_template_applications" &&
        policy.cmd === "SELECT" &&
        policy.roles.includes("authenticated"),
    ),
  );
  assert.ok(
    policies.some(
      (policy) =>
        policy.tablename === "training_templates" &&
        policy.cmd === "SELECT" &&
        policy.roles.includes("authenticated"),
    ),
  );
  assert.ok(policies.every((policy) => !policy.roles.includes("anon")));
});

test("library seed is complete and repeatable", async () => {
  await db.exec("SET ROLE service_role");
  const seeded = (
    await rows("SELECT public.upsert_training_library($1::jsonb,$2) AS result", [
      bundle,
      contentHash,
    ])
  )[0].result;
  const seededAgain = (
    await rows("SELECT public.upsert_training_library($1::jsonb,$2) AS result", [
      bundle,
      contentHash,
    ])
  )[0].result;
  await db.exec("RESET ROLE");
  assert.equal(seeded.content_sha256, seededAgain.content_sha256);
  assert.equal((await rows("SELECT count(*)::int AS n FROM training_templates"))[0].n, 7);
  assert.equal((await rows("SELECT count(*)::int AS n FROM training_exercise_catalog"))[0].n, 36);
  assert.equal((await rows("SELECT count(*)::int AS n FROM training_template_slots"))[0].n, 164);
});

test("same version with changed content is an explicit conflict", async () => {
  const changed = structuredClone(bundle);
  changed.programs[0].title_ru = "Изменённый заголовок";
  await db.exec("SET ROLE service_role");
  await assert.rejects(
    rows("SELECT public.upsert_training_library($1::jsonb,$2)", [
      changed,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]),
    (error) => error.code === "22023" && /content conflict/.test(error.message),
  );
  await db.exec("RESET ROLE");
});

test("template list filters exact day count and application is atomic/idempotent", async () => {
  const applicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const names = ["Push", "Pull"];
  const available = await asRole("authenticated", A, () =>
    rows("SELECT * FROM public.list_training_templates(2)"),
  );
  assert.deepEqual(
    available.map((row) => row.template_key),
    ["strength_2d_v1"],
  );
  await asRole("authenticated", A, () =>
    rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
      applicationId,
      "strength_2d_v1",
      1,
      names,
      false,
    ]),
  );
  assert.deepEqual(
    (await rows("SELECT name FROM program_days WHERE user_id=$1 ORDER BY position", [A])).map(
      (r) => r.name,
    ),
    names,
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_exercises WHERE user_id=$1", [A]))[0].n,
    bundle.programs
      .find((p) => p.days_per_week === 2)
      .sessions.reduce((n, d) => n + d.exercises.length, 0),
  );
  await asRole("authenticated", A, () =>
    rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
      applicationId,
      "strength_2d_v1",
      1,
      names,
      false,
    ]),
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_days WHERE user_id=$1", [A]))[0].n,
    2,
  );
  assert.equal(
    (
      await rows("SELECT count(*)::int AS n FROM training_template_applications WHERE user_id=$1", [
        A,
      ])
    )[0].n,
    1,
  );
});

test("all 1–7 day templates copy ordered days, fresh IDs, exercise prescriptions and RIR", async () => {
  for (let count = 1; count <= 7; count++) {
    const uid = `33333333-3333-4333-8333-${String(count).padStart(12, "0")}`;
    const applicationId = `cccccccc-cccc-4ccc-8ccc-${String(count).padStart(12, "0")}`;
    const template = bundle.programs.find((program) => program.days_per_week === count);
    assert.ok(template);
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [uid]);
    const names = template.sessions.map((_, index) => `Личный день ${index + 1}`);

    await asRole("authenticated", uid, () =>
      rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
        applicationId,
        template.template_key,
        template.version,
        names,
        count === 7,
      ]),
    );

    const days = await rows(
      "SELECT id, name, position, template_day_key FROM program_days WHERE user_id=$1 ORDER BY position",
      [uid],
    );
    assert.deepEqual(
      days.map((day) => day.name),
      names,
    );
    assert.deepEqual(
      days.map((day) => day.position),
      template.sessions.map((_, index) => index),
    );
    assert.deepEqual(
      days.map((day) => day.template_day_key),
      template.sessions.map((session) => session.day_key),
    );

    const exercises = await rows(
      `SELECT e.id, e.day_id, e.position, e.name, e.target_sets, e.target_reps,
        e.target_rir_min, e.target_rir_max, e.template_slot_key, e.template_exercise_key,
        s.day_key AS source_day_key, s.exercise_key AS source_exercise_key,
        s.slot_order, s.prescription
       FROM program_exercises e
       JOIN training_template_slots s ON s.template_key=$2 AND s.version=$3
         AND s.slot_key=e.template_slot_key AND s.exercise_key=e.template_exercise_key
       WHERE e.user_id=$1 ORDER BY s.day_key, s.slot_order`,
      [uid, template.template_key, template.version],
    );
    const expectedSlots = template.sessions.flatMap((session) =>
      session.exercises.map((exercise) => ({ ...exercise, day_key: session.day_key })),
    );
    assert.equal(exercises.length, expectedSlots.length);
    for (const exercise of exercises) {
      const source = expectedSlots.find((slot) => slot.slot_key === exercise.template_slot_key);
      assert.ok(source);
      assert.notEqual(exercise.id, exercise.template_exercise_key);
      assert.equal(exercise.day_id, days.find((day) => day.template_day_key === source.day_key).id);
      assert.equal(exercise.position, source.order - 1);
      assert.equal(exercise.target_sets, source.working_sets);
      assert.equal(exercise.target_reps, `${source.reps_min}-${source.reps_max}`);
      assert.equal(Number(exercise.target_rir_min), source.rir_min);
      assert.equal(Number(exercise.target_rir_max), source.rir_max);
      assert.equal(exercise.template_exercise_key, source.exercise_key);
      assert.equal(
        exercise.name,
        bundle.exercise_catalog.find((item) => item.exercise_key === source.exercise_key).name_ru,
      );
      assert.equal(exercise.source_day_key, source.day_key);
      assert.equal(exercise.source_exercise_key, source.exercise_key);
      assert.equal(exercise.slot_order, source.order);
      assert.equal(Number(exercise.prescription.rir_min), source.rir_min);
    }
    assert.equal(
      (
        await rows(
          "SELECT count(*)::int AS n FROM training_template_applications WHERE user_id=$1",
          [uid],
        )
      )[0].n,
      1,
    );
  }
});

test("failed template copy rolls back every row and the same application ID can retry", async () => {
  const uid = "44444444-4444-4444-8444-444444444444";
  await db.query("INSERT INTO auth.users(id) VALUES ($1)", [uid]);
  await db.exec(`
    CREATE FUNCTION public.fail_template_copy() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.template_application_id IS NOT NULL AND NEW.template_slot_key = 'strength_3d_v1_d01_e01' THEN
        RAISE EXCEPTION 'simulated template exercise failure' USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_template_copy BEFORE INSERT ON public.program_exercises
      FOR EACH ROW EXECUTE FUNCTION public.fail_template_copy();
  `);
  const names = ["Push", "Pull", "Legs"];
  await assert.rejects(
    asRole("authenticated", uid, () =>
      rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
        "dddddddd-dddd-4ddd-8ddd-000000000001",
        "strength_3d_v1",
        1,
        names,
        false,
      ]),
    ),
    (error) => error.code === "P0001" && /simulated template exercise failure/.test(error.message),
  );
  await db.exec(
    "DROP TRIGGER fail_template_copy ON public.program_exercises; DROP FUNCTION public.fail_template_copy()",
  );
  for (const table of ["training_template_applications", "program_days", "program_exercises"])
    assert.equal(
      (await rows(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [uid]))[0].n,
      0,
      `${table} should roll back after a failed copy`,
    );

  await asRole("authenticated", uid, () =>
    rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
      "dddddddd-dddd-4ddd-8ddd-000000000001",
      "strength_3d_v1",
      1,
      names,
      false,
    ]),
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_days WHERE user_id=$1", [uid]))[0].n,
    3,
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_exercises WHERE user_id=$1", [uid]))[0].n,
    bundle.programs
      .find((program) => program.days_per_week === 3)
      .sessions.reduce((n, day) => n + day.exercises.length, 0),
  );
});

test("seven-day template requires explicit daily opt-in", async () => {
  const names = Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`);
  await assert.rejects(
    asRole("authenticated", B, () =>
      rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "strength_7d_v1",
        1,
        names,
        false,
      ]),
    ),
    (error) => error.code === "22023" && /daily opt-in/.test(error.message),
  );
  await asRole("authenticated", B, () =>
    rows("SELECT public.apply_training_template($1,$2,$3,$4,$5)", [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "strength_7d_v1",
      1,
      names,
      true,
    ]),
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_days WHERE user_id=$1", [B]))[0].n,
    7,
  );
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM program_exercises WHERE user_id=$1", [B]))[0].n,
    bundle.programs
      .find((p) => p.days_per_week === 7)
      .sessions.reduce((n, d) => n + d.exercises.length, 0),
  );
});

test("training library ACLs are minimal for browser roles after correcting hosted drift", async () => {
  const rowsByTable = await rows(`
    SELECT c.relname AS table_name,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
      has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
      has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
      has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
      has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
      has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
      has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth_truncate
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'training_%' AND c.relkind='r'
    ORDER BY c.relname`);
  for (const row of rowsByTable) {
    assert.equal(row.anon_select, false, `${row.table_name} anon SELECT`);
    assert.equal(row.auth_select, true, `${row.table_name} auth SELECT`);
    for (const privilege of ["insert", "update", "delete", "truncate"]) {
      assert.equal(row[`anon_${privilege}`], false, `${row.table_name} anon ${privilege}`);
      assert.equal(row[`auth_${privilege}`], false, `${row.table_name} authenticated ${privilege}`);
    }
  }
  assert.equal(
    (
      await rows(
        "SELECT bool_and(has_table_privilege('service_role', c.oid, 'TRUNCATE')) AS retained FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'training_%' AND c.relkind='r'",
      )
    )[0].retained,
    true,
    "service_role retains its administrative grants",
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('anon','public.apply_training_template(uuid,text,integer,text[],boolean)','EXECUTE') AS allowed",
      )
    )[0].allowed,
    false,
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('authenticated','public.apply_training_template(uuid,text,integer,text[],boolean)','EXECUTE') AS allowed",
      )
    )[0].allowed,
    true,
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('anon','public.list_training_templates(integer,text)','EXECUTE') AS allowed",
      )
    )[0].allowed,
    false,
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('authenticated','public.list_training_templates(integer,text)','EXECUTE') AS allowed",
      )
    )[0].allowed,
    true,
  );
  await db.exec("CREATE TABLE public.future_training_object(id integer)");
  assert.equal(
    (
      await rows(
        "SELECT has_table_privilege('anon','public.future_training_object','SELECT') AS allowed",
      )
    )[0].allowed,
    false,
  );
  assert.equal(
    (
      await rows(
        "SELECT has_table_privilege('authenticated','public.future_training_object','INSERT') AS allowed",
      )
    )[0].allowed,
    false,
  );
  await db.exec(
    "CREATE FUNCTION public.future_training_helper() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$",
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('anon','public.future_training_helper()','EXECUTE') AS allowed",
      )
    )[0].allowed,
    false,
    "new public functions do not inherit PUBLIC EXECUTE",
  );
  await db.exec("CREATE SEQUENCE public.future_training_sequence");
  assert.equal(
    (
      await rows(
        "SELECT has_sequence_privilege('anon','public.future_training_sequence','USAGE') AS allowed",
      )
    )[0].allowed,
    false,
    "new public sequences do not inherit browser grants",
  );
  await db.exec("CREATE ROLE inherited_test_writer NOLOGIN");
  await db.exec(
    "GRANT INSERT ON public.future_training_object TO inherited_test_writer; GRANT inherited_test_writer TO authenticated",
  );
  assert.equal(
    (
      await rows(
        "SELECT has_table_privilege('authenticated','public.future_training_object','INSERT') AS allowed",
      )
    )[0].allowed,
    true,
    "effective privilege checks include inherited role grants",
  );
  await db.exec(
    "REVOKE ALL ON public.future_training_object FROM inherited_test_writer; REVOKE inherited_test_writer FROM authenticated; DROP ROLE inherited_test_writer",
  );
  await db.exec(file("drizzle/migrations/20261020100000_training_library_least_privilege.sql"));
  assert.equal(
    (
      await rows(
        "SELECT has_table_privilege('authenticated','public.future_training_object','INSERT') AS allowed",
      )
    )[0].allowed,
    false,
    "replaying the ACL correction is safe and idempotent",
  );
});

test("ACL repair clears postgres defaults, inventories managed supabase_admin defaults, and keeps app tables postgres-owned", async () => {
  const defaults = await rows(file("scripts/default-privileges-preflight.sql"));
  assert.ok(defaults.some((row) => row.owner === "supabase_admin"));
  assert.ok(defaults.every((row) => row.owner !== "postgres"));
  const applicationOwners = await rows(`
    SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'training_exercise_catalog','training_templates','training_template_days',
      'training_template_slots','training_template_applications'
    )
  `);
  assert.deepEqual(applicationOwners, [{ owner: "postgres" }]);
});

test("helper functions are callable only by their intended application path", async () => {
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('anon','public.valid_workout_reps(integer[])','EXECUTE') AS allowed",
      )
    )[0].allowed,
    false,
  );
  assert.equal(
    (
      await rows(
        "SELECT has_function_privilege('authenticated','public.valid_workout_reps(integer[])','EXECUTE') AS allowed",
      )
    )[0].allowed,
    true,
  );
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await rows(
          "SELECT has_function_privilege($1,'public.snapshot_entry_day()','EXECUTE') AS allowed",
          [role],
        )
      )[0].allowed,
      false,
    );
  assert.equal(
    (
      await rows(`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
          WHERE p.oid='public.snapshot_entry_day()'::regprocedure
            AND a.grantee=0 AND a.privilege_type='EXECUTE'
        ) AS allowed
      `)
    )[0].allowed,
    false,
  );
  const saved = await asRole("authenticated", C, async () =>
    rows("SELECT public.valid_workout_reps(ARRAY[8,8]) AS allowed"),
  );
  assert.deepEqual(saved, [{ allowed: true }]);
});
