import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

let db;
let dayA, dayB, exerciseA, exerciseB, originalEntries, originalOperations;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const LEGACY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY_NULL_RIR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEGACY_FOREIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NEW_ENTRY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SET_A = "10000000-0000-4000-8000-000000000001";
const SET_B = "10000000-0000-4000-8000-000000000002";
const SET_C = "10000000-0000-4000-8000-000000000003";
const SET_D = "10000000-0000-4000-8000-000000000004";
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;

async function asUser(userId, fn, role = "authenticated") {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

const payload = (id1 = SET_A, id2 = SET_B, id3 = SET_C) => [
  {
    id: id1,
    position: 1,
    weight: "50",
    reps: 12,
    rir: "2",
    set_type: "working",
    load_type: "external",
  },
  {
    id: id2,
    position: 2,
    weight: "52.5",
    reps: 10,
    rir: null,
    set_type: "working",
    load_type: "external",
  },
  {
    id: id3,
    position: 3,
    weight: "55",
    reps: 8,
    rir: "1",
    set_type: "warmup",
    load_type: "bodyweight",
  },
];

async function saveSets(id, exerciseId, dayId, sets) {
  return db.query(
    "SELECT save_workout_entry_sets($1,$2,$3,'2026-10-16',$4::jsonb,'per-set note') AS id",
    [id, exerciseId, dayId, JSON.stringify(sets)],
  );
}

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
  await asUser(A, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Силовая", "Техника"]]);
    dayA = (await rows("SELECT id FROM program_days ORDER BY position"))[0].id;
    exerciseA = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Жим',$1) RETURNING id", [
        dayA,
      ])
    )[0].id;
    await db.query(
      `INSERT INTO workout_entries(id,user_id,exercise_id,day_id,day_name,performed_on,weight,reps,rir,notes)
       VALUES ($1,$2,$3,$4,'Силовая','2026-10-10',40,'{12,10,8}',2,'old note')`,
      [LEGACY, A, exerciseA, dayA],
    );
    await db.query(
      `INSERT INTO workout_entries(id,user_id,exercise_id,day_id,day_name,performed_on,weight,reps,rir)
       VALUES ($1,$2,$3,NULL,'Старая тренировка','2026-10-11',45,'{8,6}',NULL)`,
      [LEGACY_NULL_RIR, A, exerciseA],
    );
  });
  await asUser(B, async () => {
    await db.query("SELECT setup_program($1::text[])", [["Чужой день"]]);
    dayB = (await rows("SELECT id FROM program_days"))[0].id;
    exerciseB = (
      await rows("INSERT INTO program_exercises(name,day_id) VALUES ('Чужое',$1) RETURNING id", [
        dayB,
      ])
    )[0].id;
    await db.query(
      "INSERT INTO workout_entries(id,user_id,exercise_id,day_id,performed_on,weight,reps,rir) VALUES ($1,$2,$3,$4,'2026-10-12',60,'{5}',NULL)",
      [LEGACY_FOREIGN, B, exerciseB, dayB],
    );
  });
  originalEntries = await rows(
    "SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id",
  );

  await db.exec(file("drizzle/migrations/0004_workout_data_integrity.sql"));
  await db.exec(file("drizzle/migrations/20261015202500_archived_object_deletion.sql"));
  await db.exec(file("drizzle/migrations/20261016150000_training_template_library.sql"));
  originalOperations =
    await rows(`SELECT user_id,id,exercise_id,day_id,performed_on,weight::text,reps,rir::text,notes
    FROM public.workout_entry_operations ORDER BY user_id,id`);
  await db.exec(file("drizzle/migrations/20261016204330_per_set_workout_v4.sql"));
});

after(async () => {
  await db?.close();
});

test("backfill preserves legacy entry rows and creates ordered working sets with exact nullable RIR", async () => {
  assert.deepEqual(
    await rows("SELECT to_jsonb(w)::text AS row FROM workout_entries w ORDER BY id"),
    originalEntries,
  );
  assert.deepEqual(
    await rows(`SELECT user_id,id,exercise_id,day_id,performed_on,weight::text,reps,rir::text,notes
      FROM public.workout_entry_operations ORDER BY user_id,id`),
    originalOperations,
  );
  assert.deepEqual(
    await rows(
      "SELECT position,weight::text,reps,rir::text,set_type,load_type,legacy_snapshot FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
      [LEGACY],
    ),
    [1, 2, 3].map((position, index) => ({
      position,
      weight: "40.00",
      reps: [12, 10, 8][index],
      rir: "2.0",
      set_type: "working",
      load_type: "external",
      legacy_snapshot: true,
    })),
  );
  assert.deepEqual(
    await rows(
      "SELECT position,rir::text,legacy_snapshot FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
      [LEGACY_NULL_RIR],
    ),
    [1, 2].map((position) => ({ position, rir: null, legacy_snapshot: true })),
  );
  assert.equal(
    (
      await rows("SELECT count(*)::int AS n FROM workout_entry_sets WHERE workout_entry_id=$1", [
        LEGACY_FOREIGN,
      ])
    )[0].n,
    1,
  );
  const originalSnapshot = (
    await rows("SELECT set_snapshot FROM workout_entry_operations WHERE user_id=$1 AND id=$2", [
      A,
      LEGACY,
    ])
  )[0].set_snapshot;
  assert.equal(originalSnapshot.length, 3);
  assert.deepEqual(
    originalSnapshot.map((set) => [set.position, set.weight, set.reps, set.rir]),
    [
      [1, 40, 12, 2],
      [2, 40, 10, 2],
      [3, 40, 8, 2],
    ],
  );
});

test("backfill key is deterministic and replay does not duplicate any legacy set", async () => {
  const before = await rows(
    "SELECT id,workout_entry_id,position FROM workout_entry_sets ORDER BY workout_entry_id,position",
  );
  await db.exec(`
    INSERT INTO public.workout_entry_sets
      (id,workout_entry_id,user_id,position,weight,reps,rir,set_type,load_type,legacy_snapshot,created_at,updated_at)
    SELECT public.legacy_workout_set_id(w.id,s.position::integer),w.id,w.user_id,s.position::integer,
      w.weight,s.reps,w.rir,'working','external',true,w.created_at,w.created_at
    FROM public.workout_entries w
    CROSS JOIN LATERAL unnest(w.reps) WITH ORDINALITY AS s(reps,position)
    WHERE NOT EXISTS (SELECT 1 FROM public.workout_entry_sets existing
      WHERE existing.workout_entry_id=w.id AND existing.position=s.position::integer)
    ON CONFLICT (id) DO NOTHING;
  `);
  assert.deepEqual(
    await rows(
      "SELECT id,workout_entry_id,position FROM workout_entry_sets ORDER BY workout_entry_id,position",
    ),
    before,
  );
});

test("new save is atomic, stores different per-set weights/RIR and is safe to retry in parallel", async () => {
  await asUser(A, async () => {
    const sets = payload();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => saveSets(NEW_ENTRY, exerciseA, dayA, sets)),
    );
    assert.ok(results.every((result) => result.rows[0].id === NEW_ENTRY));
    assert.deepEqual(
      await rows(
        "SELECT position,weight::text,reps,rir::text,set_type,load_type FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
        [NEW_ENTRY],
      ),
      [
        {
          position: 1,
          weight: "50",
          reps: 12,
          rir: "2",
          set_type: "working",
          load_type: "external",
        },
        {
          position: 2,
          weight: "52.5",
          reps: 10,
          rir: null,
          set_type: "working",
          load_type: "external",
        },
        {
          position: 3,
          weight: "55",
          reps: 8,
          rir: "1",
          set_type: "warmup",
          load_type: "bodyweight",
        },
      ],
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [NEW_ENTRY]))[0].n,
      1,
    );
    assert.deepEqual(
      (
        await rows("SELECT reps,weight::text,rir::text FROM workout_entries WHERE id=$1", [
          NEW_ENTRY,
        ])
      )[0],
      {
        reps: [12, 10, 8],
        weight: "50",
        rir: null,
      },
    );
    await assert.rejects(
      saveSets(NEW_ENTRY, exerciseA, dayA, [{ ...sets[0], weight: "49" }, ...sets.slice(1)]),
      (error) => error.code === "22023",
    );
    const savedSnapshot = (
      await rows("SELECT set_snapshot FROM workout_entry_operations WHERE user_id=$1 AND id=$2", [
        A,
        NEW_ENTRY,
      ])
    )[0].set_snapshot;
    assert.deepEqual(
      savedSnapshot.map((set) => [set.id, set.position, set.weight, set.reps, set.rir]),
      sets.map((set) => [
        set.id,
        set.position,
        Number(set.weight),
        set.reps,
        set.rir === null ? null : Number(set.rir),
      ]),
    );
  });
});

test("invalid per-set input and invalid ownership roll back the parent, operation and child rows", async () => {
  await asUser(A, async () => {
    const badId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await assert.rejects(
      saveSets(badId, exerciseA, dayB, payload()),
      (error) => error.code === "23503",
    );
    await assert.rejects(
      saveSets(badId, exerciseA, dayA, [{ ...payload()[0], weight: "2000.001" }]),
      (error) => error.code === "22023",
    );
    assert.equal(
      (await rows("SELECT count(*)::int AS n FROM workout_entries WHERE id=$1", [badId]))[0].n,
      0,
    );
    assert.equal(
      (
        await rows("SELECT count(*)::int AS n FROM workout_entry_operations WHERE id=$1", [badId])
      )[0].n,
      0,
    );
    assert.equal(
      (
        await rows("SELECT count(*)::int AS n FROM workout_entry_sets WHERE workout_entry_id=$1", [
          badId,
        ])
      )[0].n,
      0,
    );
  });
});

test("legacy save RPC remains compatible and automatically mirrors same-weight sets", async () => {
  await asUser(A, async () => {
    const id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const saved = await db.query(
      "SELECT save_workout_entry($1,$2,$3,'2026-10-16',42.5,'{9,8,7}',NULL,'legacy') AS id",
      [id, exerciseA, dayA],
    );
    assert.equal(saved.rows[0].id, id);
    assert.equal(
      (
        await db.query(
          "SELECT save_workout_entry($1,$2,$3,'2026-10-16',42.5,'{9,8,7}',NULL,'legacy') AS id",
          [id, exerciseA, dayA],
        )
      ).rows[0].id,
      id,
    );
    assert.deepEqual(
      await rows(
        "SELECT position,weight::text,reps,rir::text,legacy_snapshot FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
        [id],
      ),
      [1, 2, 3].map((position, index) => ({
        position,
        weight: "42.5",
        reps: [9, 8, 7][index],
        rir: null,
        legacy_snapshot: true,
      })),
    );
  });
});

test("set edit/add/delete/reorder preserve stable IDs and are idempotent", async () => {
  await asUser(A, async () => {
    assert.equal(
      (
        await db.query(
          "SELECT update_workout_entry_set($1,$2,'51.25',12,NULL,'working','external') AS ok",
          [NEW_ENTRY, SET_B],
        )
      ).rows[0].ok,
      true,
    );
    assert.deepEqual(
      await rows(
        "SELECT id,weight::text,reps,rir::text FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
        [NEW_ENTRY],
      ),
      [
        { id: SET_A, weight: "50", reps: 12, rir: "2" },
        { id: SET_B, weight: "51.25", reps: 12, rir: null },
        { id: SET_C, weight: "55", reps: 8, rir: "1" },
      ],
    );
    assert.equal((await saveSets(NEW_ENTRY, exerciseA, dayA, payload())).rows[0].id, NEW_ENTRY);
    await assert.rejects(
      saveSets(NEW_ENTRY, exerciseA, dayA, [
        { ...payload()[0], weight: "49" },
        ...payload().slice(1),
      ]),
      (error) => error.code === "22023",
    );
    const add = "SELECT add_workout_entry_set($1,$2,'0',6,NULL,'working','bodyweight') AS id";
    assert.equal((await db.query(add, [NEW_ENTRY, SET_D])).rows[0].id, SET_D);
    assert.equal((await db.query(add, [NEW_ENTRY, SET_D])).rows[0].id, SET_D);
    assert.equal(
      (
        await rows("SELECT count(*)::int AS n FROM workout_entry_sets WHERE workout_entry_id=$1", [
          NEW_ENTRY,
        ])
      )[0].n,
      4,
    );
    await db.query("SELECT reorder_workout_entry_sets($1,$2::uuid[])", [
      NEW_ENTRY,
      [SET_D, SET_C, SET_B, SET_A],
    ]);
    assert.deepEqual(
      (
        await rows(
          "SELECT id,position FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
          [NEW_ENTRY],
        )
      ).map(({ id, position }) => [id, position]),
      [
        [SET_D, 1],
        [SET_C, 2],
        [SET_B, 3],
        [SET_A, 4],
      ],
    );
    assert.equal(
      (await db.query("SELECT delete_workout_entry_set($1,$2) AS ok", [NEW_ENTRY, SET_B])).rows[0]
        .ok,
      true,
    );
    assert.equal(
      (await db.query("SELECT delete_workout_entry_set($1,$2) AS ok", [NEW_ENTRY, SET_B])).rows[0]
        .ok,
      true,
    );
    assert.deepEqual(
      (
        await rows(
          "SELECT id,position FROM workout_entry_sets WHERE workout_entry_id=$1 ORDER BY position",
          [NEW_ENTRY],
        )
      ).map(({ id, position }) => [id, position]),
      [
        [SET_D, 1],
        [SET_C, 2],
        [SET_A, 3],
      ],
    );
    await assert.rejects(db.query(add, [NEW_ENTRY, SET_B]), (error) => error.code === "23503");
    await db.query("SELECT delete_workout_entry_set($1,$2)", [NEW_ENTRY, SET_C]);
    await db.query("SELECT delete_workout_entry_set($1,$2)", [NEW_ENTRY, SET_D]);
    await assert.rejects(
      db.query("SELECT delete_workout_entry_set($1,$2)", [NEW_ENTRY, SET_A]),
      (error) => error.code === "22023",
    );
    await assert.rejects(
      db.query("SELECT reorder_workout_entry_sets($1,$2::uuid[])", [NEW_ENTRY, [SET_D, SET_C]]),
      (error) => error.code === "22023",
    );
  });
});

test("RLS isolates set rows and security-definer mutations enforce entry ownership", async () => {
  assert.deepEqual(
    await rows(
      "SELECT has_table_privilege('authenticated','public.workout_entry_sets','SELECT') AS can_select, has_schema_privilege('authenticated','public','USAGE') AS can_use_schema",
    ),
    [{ can_select: true, can_use_schema: true }],
  );
  assert.deepEqual(
    await rows(`SELECT c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('authenticated','public.workout_entry_sets','INSERT') AS can_insert,
      has_table_privilege('authenticated','public.workout_entry_sets','UPDATE') AS can_update,
      has_table_privilege('authenticated','public.workout_entry_sets','DELETE') AS can_delete,
      has_table_privilege('anon','public.workout_entry_sets','SELECT') AS anon_can_select
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='workout_entry_sets'`),
    [
      {
        relrowsecurity: true,
        relforcerowsecurity: true,
        can_insert: false,
        can_update: false,
        can_delete: false,
        anon_can_select: false,
      },
    ],
  );
  assert.deepEqual(
    await rows(`SELECT has_function_privilege('authenticated','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE') AS auth_can_save,
      has_function_privilege('anon','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE') AS anon_can_save`),
    [{ auth_can_save: true, anon_can_save: false }],
  );
  await asUser(B, async () => {
    assert.equal(
      (await rows("SELECT id FROM workout_entry_sets WHERE workout_entry_id=$1", [NEW_ENTRY]))
        .length,
      0,
    );
    await assert.rejects(
      db.query("SELECT update_workout_entry_set($1,$2,'50',8,NULL)", [NEW_ENTRY, SET_A]),
      (error) => error.code === "42501",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO workout_entry_sets(id,workout_entry_id,user_id,position,weight,reps) VALUES ($1,$2,$3,1,1,1)",
        [SET_A, NEW_ENTRY, B],
      ),
      (error) => error.code === "42501",
    );
  });
  await asUser(
    "",
    async () => {
      await assert.rejects(
        rows("SELECT id FROM workout_entry_sets WHERE workout_entry_id=$1", [LEGACY]),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        db.query("SELECT save_workout_entry_sets($1,$2,$3,current_date,$4::jsonb)", [
          NEW_ENTRY,
          exerciseA,
          dayA,
          JSON.stringify(payload()),
        ]),
        (error) => error.code === "42501",
      );
    },
    "anon",
  );
});
