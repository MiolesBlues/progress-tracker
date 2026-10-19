import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";
import postgres from "postgres";

const bundlePath = new URL("../docs/training-library/strength-templates.v1.json", import.meta.url);
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
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

if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify(
      {
        status: "DRY_RUN",
        programs: bundle.programs.length,
        sessions: bundle.programs.reduce((n, p) => n + p.sessions.length, 0),
        slots: bundle.programs.reduce(
          (n, p) => n + p.sessions.reduce((m, d) => m + d.exercises.length, 0),
          0,
        ),
        catalog: bundle.exercise_catalog.length,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const databaseUrl = process.env.TRAINING_LIBRARY_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Set TRAINING_LIBRARY_DATABASE_URL or use --dry-run; no default database is used.",
  );
}
const parsed = new URL(databaseUrl);
if (/supabase\.co$/i.test(parsed.hostname) && process.env.TRAINING_LIBRARY_ALLOW_REMOTE !== "1") {
  throw new Error(
    "Refusing a Supabase host without TRAINING_LIBRARY_ALLOW_REMOTE=1 and explicit review.",
  );
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const [result] =
    await sql`select public.upsert_training_library(${sql.json(bundle)}::jsonb, ${contentHash}) as result`;
  console.log(JSON.stringify(result.result, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
