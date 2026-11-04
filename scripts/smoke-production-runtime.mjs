import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";

const root = process.cwd();
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const config = resolve(root, ".output/server/wrangler.json");
const port = await reservePort();
const url = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [wrangler, "dev", "--config", config, "--ip", "127.0.0.1", "--port", String(port)],
  {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_ENVIRONMENT: "test",
      VITE_SUPABASE_ENVIRONMENT: "test",
      SUPABASE_URL: "https://phase3-runtime.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      SUPABASE_SERVICE_ROLE_KEY: "",
      VITE_SUPABASE_URL: "https://phase3-runtime.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let logs = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    logs = `${logs}${chunk}`.slice(-8_000);
  });
}

try {
  const shell = await waitForHtml(url);
  const shellText = await shell.text();
  if (!shellText.includes("<html") || !shellText.includes("Прогресс Трекер")) {
    throw new Error("Production worker returned an unexpected HTML shell for /");
  }

  const auth = await fetch(`${url}/auth`, { redirect: "manual" });
  if (auth.status !== 200 || !auth.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`Production worker returned HTTP ${auth.status} for /auth`);
  }
  const authText = await auth.text();
  if (!authText.includes("<html")) {
    throw new Error("Production worker returned a non-HTML response for /auth");
  }

  const manifest = await fetch(`${url}/manifest.webmanifest`);
  if (manifest.status !== 200) {
    throw new Error(`Production worker returned HTTP ${manifest.status} for manifest`);
  }
  const manifestBody = await manifest.json();
  if (typeof manifestBody.name !== "string" || !manifestBody.name.trim()) {
    throw new Error("Production worker returned an invalid web manifest");
  }

  console.log("Production runtime smoke: PASS (/, /auth, manifest)");
} catch (error) {
  console.error(`Production runtime smoke: FAIL (${error.message})`);
  if (logs.trim()) console.error(logs.trim());
  process.exitCode = 1;
} finally {
  await stopChild(child);
}

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise((resolveListen, reject) => {
    server.once("listening", resolveListen);
    server.once("error", reject);
  });
  const address = server.address();
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  if (!address || typeof address === "string") throw new Error("Could not reserve a local port");
  return address.port;
}

async function waitForHtml(baseUrl) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Wrangler exited with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`Production worker returned HTTP ${response.status} for /`);
      }
      return response;
    } catch (error) {
      if (error.message.startsWith("Production worker returned")) throw error;
      await delay(400);
    }
  }
  throw new Error("Wrangler did not serve the production worker within 60 seconds");
}

async function stopChild(processHandle) {
  if (processHandle.exitCode !== null) return;
  processHandle.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => processHandle.once("exit", resolveExit)),
    delay(3_000),
  ]);
  if (processHandle.exitCode === null && process.platform === "win32" && processHandle.pid) {
    const taskkill = spawn("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    await new Promise((resolveExit) => taskkill.once("exit", resolveExit));
  }
}
