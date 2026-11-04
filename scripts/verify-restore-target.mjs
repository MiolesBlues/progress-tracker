import postgres from "postgres";
import { validateRestoreApproval } from "./recovery-contract.mjs";

const databaseUrl = process.env["PHASE5B_RESTORE_DATABASE_URL"];
let identity;
try {
  identity = validateRestoreApproval({
    projectRef: process.env["PHASE5B_RESTORE_PROJECT_REF"],
    databaseUrl,
    approvedRef: process.env["PHASE5B_RESTORE_APPROVED_PROJECT_REF"],
    targetName: process.env["PHASE5B_RESTORE_TARGET_NAME"],
    confirmation: process.env["PHASE5B_RESTORE_CONFIRM"],
  });
} catch (error) {
  console.error(`Restore destination guard BLOCKED: ${error.message}`);
  process.exitCode = 2;
}

if (identity) {
  const db = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    connect_timeout: 10,
    idle_timeout: 3,
    onnotice: () => {},
  });
  try {
    let inventory;
    await db.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      const database = await tx`SELECT current_database() AS name`;
      if (database[0]?.name !== "postgres")
        throw new Error("Destination database name is not postgres");
      const tables = await tx`
        SELECT c.relname AS name
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND d.objid IS NULL`;
      const authTable = await tx`SELECT to_regclass('auth.users') IS NOT NULL AS present`;
      const storageTable = await tx`SELECT to_regclass('storage.objects') IS NOT NULL AS present`;
      let authUsers = 0;
      let storageObjects = 0;
      if (authTable[0]?.present)
        authUsers = (await tx`SELECT count(*)::int AS count FROM auth.users`)[0].count;
      if (storageTable[0]?.present)
        storageObjects = (await tx`SELECT count(*)::int AS count FROM storage.objects`)[0].count;
      inventory = { appTables: tables.map((row) => row.name), authUsers, storageObjects };
      if (inventory.appTables.length || authUsers || storageObjects)
        throw new Error("Destination contains application or user data");
      const readOnly = await tx`SELECT current_setting('transaction_read_only') AS value`;
      if (readOnly[0]?.value !== "on") throw new Error("Destination check is not read-only");
    });
    console.log(
      `Restore destination PASS: approved disposable ref ${identity.projectRef}; no application tables, Auth users, or Storage objects. Read-only transaction; no changes made.`,
    );
  } catch (error) {
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    console.error(`Restore destination guard BLOCKED: verification failed${code}`);
    process.exitCode = 1;
  } finally {
    await db.end({ timeout: 2 });
  }
}
