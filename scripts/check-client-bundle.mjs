import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = ".output/public";
const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
let checked = 0;
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else {
      const content = readFileSync(path);
      checked++;
      if (secret && content.includes(Buffer.from(secret))) {
        throw new Error("A server-only Supabase credential was found in the public build output");
      }
      if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(content.toString("utf8"))) {
        throw new Error("A Supabase secret-key value marker was found in the public build output");
      }
    }
  }
}

try {
  walk(root);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
if (!process.exitCode) console.log(`Public bundle secret scan: PASS (${checked} files)`);
