import { readFileSync } from "node:fs";
import postgres from "postgres";

const contract = JSON.parse(
  readFileSync(new URL("./schema-capability-contract.json", import.meta.url), "utf8"),
);
const refs = { production: "szdmzvsenrnjxgjgregf", staging: "fdzcwhzszbmpxyawrzzf" };

function requireProjectRef(databaseUrl, expectedRef) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("RELEASE_DATABASE_URL must be a PostgreSQL URL");
  }
  const hostRef = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  const userRef = /\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username))?.[1];
  if (hostRef !== expectedRef && userRef !== expectedRef) {
    throw new Error(
      "Database URL does not identify SUPABASE_PROJECT_REF; preflight stopped before connecting",
    );
  }
  if (hostRef && userRef && hostRef !== userRef) {
    throw new Error("Database URL host and username identify different Supabase projects");
  }
}

function requireLocalContract() {
  const librarySql = readFileSync(
    new URL("../drizzle/migrations/20261016150000_training_template_library.sql", import.meta.url),
    "utf8",
  );
  const v4Sql = readFileSync(
    new URL("../drizzle/migrations/20261016204330_per_set_workout_v4.sql", import.meta.url),
    "utf8",
  );
  const aclSql = readFileSync(
    new URL(
      "../drizzle/migrations/20261020100000_training_library_least_privilege.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const table of Object.keys(contract.authoritativeSetTables))
    if (!v4Sql.includes(`public.${table}`))
      throw new Error(`V4 migration does not define public.${table}`);
  for (const rpc of contract.perSetRpcs)
    if (!v4Sql.includes(`public.${rpc.name}`))
      throw new Error(`V4 migration does not define ${rpc.name}`);
  for (const table of Object.keys(contract.libraryTables))
    if (!librarySql.includes(`public.${table}`))
      throw new Error(`Library migration does not define public.${table}`);
  if (
    !/^BEGIN;/m.test(v4Sql) ||
    !/^COMMIT;/m.test(v4Sql) ||
    /\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i.test(v4Sql)
  )
    throw new Error("V4 migration must remain transactional and forward-only");
  for (const role of ["PUBLIC", "anon", "authenticated"])
    if (!aclSql.includes(role)) throw new Error(`ACL migration omits ${role}`);
  if (
    !aclSql.includes("ALTER DEFAULT PRIVILEGES") ||
    !aclSql.includes("GRANT EXECUTE ON FUNCTION public.apply_training_template")
  )
    throw new Error("ACL migration omits default privilege or template apply handling");
  if (contract.workoutCapability !== "per-set-workout-v4")
    throw new Error("Unknown workout capability contract");
  console.log(
    "Local schema capability contract: PASS (library, per-set V4 and ACL migrations are present)",
  );
}

async function runRemotePreflight() {
  const environment = process.env["SUPABASE_ENVIRONMENT"];
  const expectedRef = process.env["SUPABASE_PROJECT_REF"];
  const databaseUrl = process.env["RELEASE_DATABASE_URL"];
  if (!(environment in refs) || !expectedRef || !databaseUrl) {
    throw new Error(
      "Set SUPABASE_ENVIRONMENT (staging|production), SUPABASE_PROJECT_REF and RELEASE_DATABASE_URL",
    );
  }
  if (refs[environment] !== expectedRef)
    throw new Error("SUPABASE_PROJECT_REF does not match the selected environment");
  requireProjectRef(databaseUrl, expectedRef);

  const db = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    connect_timeout: 10,
    idle_timeout: 3,
    onnotice: () => {},
  });
  const failures = [];
  try {
    await db.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      const tables = [
        ...Object.keys(contract.legacyPrerequisiteTables),
        ...Object.keys(contract.authoritativeSetTables),
        ...Object.keys(contract.libraryTables),
      ];
      const tableRows = await tx`
        SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname = ANY(${tx.array(tables, "text")}) AND c.relkind='r'`;
      const tableByName = new Map(tableRows.map((row) => [row.name, row]));
      const allTables = {
        ...contract.legacyPrerequisiteTables,
        ...contract.authoritativeSetTables,
        ...contract.libraryTables,
      };
      const expectedColumns = Object.fromEntries(
        Object.entries(allTables).map(([name, spec]) => [name, spec.columns]),
      );
      const columnRows = await tx`
        SELECT table_name, column_name, udt_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name = ANY(${tx.array(tables, "text")})`;
      const columns = new Map();
      const columnTypes = new Map();
      for (const row of columnRows)
        columns.set(row.table_name, [...(columns.get(row.table_name) ?? []), row.column_name]);
      for (const row of columnRows)
        columnTypes.set(`${row.table_name}.${row.column_name}`, row.udt_name);
      for (const [name, required] of Object.entries(expectedColumns)) {
        const table = tableByName.get(name);
        if (!table) {
          failures.push(`missing table public.${name}`);
          continue;
        }
        const actual = new Set(columns.get(name) ?? []);
        for (const column of required)
          if (!actual.has(column)) failures.push(`missing column public.${name}.${column}`);
        const expectedRls = allTables[name].rls ?? true;
        const expectedForce = allTables[name].forceRls ?? false;
        if (table.rls !== expectedRls || table.force_rls !== expectedForce)
          failures.push(`RLS flags differ on public.${name}`);
      }
      for (const [column, expectedType] of Object.entries(contract.columnTypes)) {
        const actualType = columnTypes.get(column);
        if (actualType && actualType !== expectedType)
          failures.push(`column type differs for public.${column} (expected ${expectedType})`);
      }

      const constraintNames = [
        ...Object.values(contract.authoritativeSetTables).flatMap(
          (table) => table.constraints ?? [],
        ),
        ...contract.libraryConstraints,
        ...contract.requiredConstraints,
      ];
      const constraints = await tx`
        SELECT conname FROM pg_constraint
        WHERE connamespace='public'::regnamespace AND conname = ANY(${tx.array(constraintNames, "text")}) AND convalidated`;
      const actualConstraints = new Set(constraints.map((row) => row.conname));
      for (const name of constraintNames)
        if (!actualConstraints.has(name))
          failures.push(`missing or unvalidated constraint ${name}`);

      const indexNames = Object.values(contract.authoritativeSetTables).flatMap(
        (table) => table.indexes ?? [],
      );
      const allIndexNames = [...indexNames, ...contract.requiredLibraryIndexes];
      const indexes =
        await tx`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY(${tx.array(allIndexNames, "text")})`;
      const actualIndexes = new Set(indexes.map((row) => row.indexname));
      for (const name of allIndexNames)
        if (!actualIndexes.has(name)) failures.push(`missing index ${name}`);

      const policyRows =
        await tx`SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public'`;
      const requiredPolicies = [
        ...contract.requiredPolicies.map((name) => ({
          name,
          ownerScoped: name === "own applications read",
        })),
        ...contract.authoritativeSetTables.workout_entry_sets.policies.map((name) => ({
          name,
          ownerScoped: true,
        })),
        {
          table: "workout_entry_operations",
          name: "workout_entry_operations_select_own",
          ownerScoped: true,
        },
        {
          table: "workout_entry_operation_tombstones",
          name: "workout_entry_operation_tombstones_select_own",
          ownerScoped: true,
        },
        ...["program_days", "program_exercises", "workout_entries"].flatMap((table) =>
          [
            { name: "own select", cmd: "SELECT" },
            { name: "own insert", cmd: "INSERT" },
            { name: "own update", cmd: "UPDATE" },
          ].map(({ name, cmd }) => ({
            table,
            name,
            cmd,
            ownerScoped: true,
          })),
        ),
      ];
      for (const expected of requiredPolicies) {
        const policy = policyRows.find(
          (row) =>
            row.policyname === expected.name &&
            (!expected.table || row.tablename === expected.table),
        );
        if (!policy) {
          failures.push(`missing RLS policy ${expected.name}`);
          continue;
        }
        if ((expected.cmd ?? "SELECT") !== policy.cmd || !policy.roles.includes("authenticated"))
          failures.push(`policy ${expected.name} is not authenticated ${expected.cmd ?? "SELECT"}`);
        const policyCheck = `${policy.qual ?? ""} ${policy.with_check ?? ""}`;
        if (expected.ownerScoped && !policyCheck.includes("auth.uid()"))
          failures.push(`policy ${expected.name} lacks auth.uid() owner scoping`);
      }

      const rpcRequirements = [
        ...contract.perSetRpcs.map((rpc) => ({
          ...rpc,
          authenticated: true,
          anon: false,
          definer: true,
        })),
        ...contract.requiredLibraryRpcs.map((rpc) => ({
          ...rpc,
          definer: rpc.name === "apply_training_template",
        })),
      ];
      const rpcRows = await tx`
        SELECT p.proname AS name, pg_catalog.oidvectortypes(p.proargtypes) AS argument_types,
          p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
          COALESCE(p.proconfig, ARRAY[]::text[]) AS config,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
          EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY(${tx.array(
          rpcRequirements.map((rpc) => rpc.name),
          "text",
        )})`;
      for (const expected of rpcRequirements) {
        const matches = rpcRows.filter(
          (row) => row.name === expected.name && row.argument_types === expected.argumentTypes,
        );
        if (matches.length !== 1) {
          failures.push(
            `RPC signature missing or ambiguous: ${expected.name}(${expected.argumentTypes})`,
          );
          continue;
        }
        const actual = matches[0];
        if (actual.security_definer !== expected.definer)
          failures.push(`SECURITY DEFINER mode differs for ${expected.name}`);
        if (expected.definer && actual.owner !== "postgres")
          failures.push(`unexpected owner on SECURITY DEFINER RPC ${expected.name}`);
        if (expected.authenticated && !actual.authenticated_execute)
          failures.push(`authenticated lacks EXECUTE on ${expected.name}`);
        if (!expected.anon && actual.anon_execute)
          failures.push(`anon has EXECUTE on ${expected.name}`);
        if (actual.public_execute) failures.push(`PUBLIC has EXECUTE on ${expected.name}`);
        if (expected.definer && !actual.config.some((entry) => entry.startsWith("search_path=")))
          failures.push(`${expected.name} has no fixed search_path`);
      }

      const protectedTables = [
        ...Object.keys(contract.legacyPrerequisiteTables),
        ...Object.keys(contract.authoritativeSetTables),
        ...Object.keys(contract.libraryTables),
      ];
      const privilegeRows = await tx`
        SELECT c.relname AS table_name, role_name,
          has_table_privilege(role_name,c.oid,'SELECT') AS can_select,
          has_table_privilege(role_name,c.oid,'INSERT') AS can_insert,
          has_table_privilege(role_name,c.oid,'UPDATE') AS can_update,
          has_table_privilege(role_name,c.oid,'DELETE') AS can_delete,
          has_table_privilege(role_name,c.oid,'TRUNCATE') AS can_truncate,
          has_table_privilege(role_name,c.oid,'REFERENCES') AS can_references,
          has_table_privilege(role_name,c.oid,'TRIGGER') AS can_trigger
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES ('anon'::name),('authenticated'::name)) roles(role_name)
        WHERE n.nspname='public' AND c.relname = ANY(${tx.array(protectedTables, "text")}) AND c.relkind='r'`;
      for (const row of privilegeRows) {
        const authenticatedRead = new Set([
          "program_days",
          "program_exercises",
          "workout_entries",
          "workout_entry_operations",
          "workout_entry_operation_tombstones",
          "workout_entry_sets",
          "training_exercise_catalog",
          "training_templates",
          "training_template_days",
          "training_template_slots",
          "training_template_applications",
        ]);
        const shouldSelect =
          row.role_name === "authenticated" && authenticatedRead.has(row.table_name);
        if (row.can_select !== shouldSelect)
          failures.push(`${row.role_name} SELECT privilege differs on ${row.table_name}`);
        for (const privilege of [
          "insert",
          "update",
          "delete",
          "truncate",
          "references",
          "trigger",
        ]) {
          const actual = row[`can_${privilege}`];
          const authDmlTables = new Set(["program_days", "program_exercises", "workout_entries"]);
          const expected =
            row.role_name === "authenticated" &&
            authDmlTables.has(row.table_name) &&
            ["insert", "update"].includes(privilege);
          if (actual !== expected)
            failures.push(
              `${row.role_name} ${privilege.toUpperCase()} privilege differs on ${row.table_name}`,
            );
        }
      }
      const inheritedRoleRows = await tx`
        SELECT parent.rolname AS granted_role, member.rolname AS member_role
        FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
        JOIN pg_roles member ON member.oid=m.member
        WHERE member.rolname IN ('anon','authenticated')`;
      for (const row of inheritedRoleRows)
        failures.push(
          `${row.member_role} inherits role ${row.granted_role}; inspect effective browser grants`,
        );

      if (
        tableByName.has("workout_entries") &&
        tableByName.has("workout_entry_sets") &&
        tableByName.has("workout_entry_operations")
      ) {
        const assertions = await tx`
          SELECT
            (SELECT count(*)::int FROM public.workout_entries w
              LEFT JOIN LATERAL (
                SELECT array_agg(s.reps ORDER BY s.position) AS set_reps
                FROM public.workout_entry_sets s
                WHERE s.workout_entry_id=w.id AND s.user_id=w.user_id
              ) actual ON true
              WHERE actual.set_reps IS DISTINCT FROM w.reps) AS reps_mismatch,
            (SELECT count(*)::int FROM public.workout_entries w
              WHERE EXISTS (SELECT 1 FROM public.workout_entry_sets s
                WHERE s.workout_entry_id=w.id AND s.user_id=w.user_id AND s.legacy_snapshot)
                AND EXISTS (
                  SELECT 1 FROM unnest(w.reps) WITH ORDINALITY expected(reps,position)
                  LEFT JOIN public.workout_entry_sets s
                    ON s.workout_entry_id=w.id AND s.user_id=w.user_id AND s.position=expected.position
                  WHERE s.id IS NULL OR s.reps IS DISTINCT FROM expected.reps
                    OR s.weight IS DISTINCT FROM w.weight OR s.rir IS DISTINCT FROM w.rir
                    OR s.set_type IS DISTINCT FROM 'working' OR s.load_type IS DISTINCT FROM 'external'
                    OR NOT s.legacy_snapshot
                )) AS legacy_value_mismatch,
            (SELECT count(*)::int FROM public.workout_entry_operations o
              JOIN public.workout_entries w ON w.id=o.id AND w.user_id=o.user_id
              WHERE o.set_snapshot IS NULL) AS missing_operation_snapshot`;
        if (assertions[0].reps_mismatch)
          failures.push("entry reps differ from ordered authoritative sets");
        if (assertions[0].legacy_value_mismatch)
          failures.push("legacy set snapshot differs from source reps, weight, RIR or ordering");
        if (assertions[0].missing_operation_snapshot)
          failures.push("existing operation rows lack a per-set retry snapshot");
      }
      const defaults = await tx`
        SELECT d.defaclobjtype, a.grantee, a.privilege_type
        FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole='postgres'::regrole
          AND ((d.defaclnamespace='public'::regnamespace
            AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
            AND ((d.defaclobjtype='r' AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
              OR (d.defaclobjtype='S' AND a.privilege_type IN ('USAGE','SELECT','UPDATE'))
              OR (d.defaclobjtype='f' AND a.privilege_type='EXECUTE')))
            OR (d.defaclnamespace=0 AND d.defaclobjtype='f' AND a.grantee=0 AND a.privilege_type='EXECUTE'))`;
      if (defaults.length)
        failures.push("public default privileges still grant browser roles or PUBLIC access");

      const migrations =
        await tx`SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS journal_exists`;
      if (!migrations[0]?.journal_exists)
        failures.push("Supabase migration journal is unavailable for capability preflight");
      const server = await tx`SELECT current_setting('transaction_read_only') AS read_only`;
      if (server[0]?.read_only !== "on") failures.push("database transaction is not read-only");
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    throw new Error(`Read-only schema preflight could not complete${code}`);
  } finally {
    await db.end({ timeout: 2 });
  }

  if (failures.length) {
    console.error(`Schema preflight FAILED for ${environment} (${expectedRef}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Schema preflight PASS for ${environment} (${expectedRef}); capability ${contract.workoutCapability}. Read-only transaction; no changes made.`,
  );
}

if (process.argv.includes("--check-contract")) requireLocalContract();
else
  runRemotePreflight().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
