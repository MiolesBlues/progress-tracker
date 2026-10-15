import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

type Row = Record<string, unknown> & { id: string; user_id: string };
export async function mockSupabase(page: Page) {
  const users = new Map<string, string>();
  const rows: Record<string, Row[]> = {
    program_days: [],
    program_exercises: [],
    workout_entries: [],
  };
  const state = {
    rows,
    users,
    offline: false,
    loseSaveResponse: false,
    failReorder: false,
    saveCalls: [] as string[],
    signupCalls: [] as Record<string, unknown>[],
    rpcCalls: [] as { name: string; userId: string; args: Record<string, unknown> }[],
    delayLastRead: null as { exerciseId: string; promise: Promise<void> } | null,
    sequence: 0,
  };
  const createdAt = () => new Date(Date.UTC(2026, 9, 15, 12, 0, 0, ++state.sequence)).toISOString();
  const user = (id: string, email = "test@example.invalid") => ({
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  });
  const token = (id: string) =>
    `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800, role: "authenticated", aud: "authenticated" })).toString("base64url")}.test-signature`;
  // Reject every non-local request by default: these tests cannot contact a real Supabase.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    if (url.hostname !== "workout-e2e.invalid") return route.abort();
    const request = route.request();
    const json = request.postDataJSON() as Record<string, unknown> | null;
    const bearer = request.headers()["authorization"]?.split(" ")[1];
    let id = "";
    if (bearer) {
      try {
        id = String(JSON.parse(Buffer.from(bearer.split(".")[1]!, "base64url").toString())["sub"]);
      } catch {
        /* Unauthenticated */
      }
    }
    const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    if (request.method() === "OPTIONS")
      return respond({}, 200, {
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      });
    if (state.offline) return respond({ message: "Network unavailable" }, 503);
    if (url.pathname.endsWith("/signup") || url.pathname.endsWith("/token")) {
      if (url.pathname.endsWith("/signup")) state.signupCalls.push(json ?? {});
      const email = String(json?.["email"]);
      id = users.get(email) ?? randomUUID();
      users.set(email, id);
      return respond({
        access_token: token(id),
        refresh_token: `refresh-${id}`,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: 4102444800,
        user: user(id, email),
      });
    }
    if (url.pathname.endsWith("/user")) return respond(user(id));
    if (url.pathname.endsWith("/logout")) return respond({});
    if (url.pathname.includes("/rpc/")) {
      const args = json ?? {};
      state.rpcCalls.push({ name: url.pathname.split("/").at(-1)!, userId: id, args });
      if (url.pathname.endsWith("/setup_program")) {
        (args["_names"] as string[]).forEach((name, position) =>
          rows["program_days"]!.push({
            id: randomUUID(),
            user_id: id,
            name,
            position,
            archived_at: null,
            created_at: createdAt(),
          }),
        );
        return respond(null);
      }
      if (url.pathname.endsWith("/save_workout_entry")) {
        const operation = String(args["_id"]);
        state.saveCalls.push(operation);
        if (!rows["workout_entries"]!.some((r) => r.id === operation))
          rows["workout_entries"]!.push({
            id: operation,
            user_id: id,
            exercise_id: args["_exercise_id"],
            day_id: args["_day_id"],
            day_name: rows["program_days"]!.find((r) => r.id === args["_day_id"])?.["name"],
            performed_on: args["_performed_on"],
            created_at: createdAt(),
            weight: args["_weight"],
            reps: args["_reps"],
            rir: args["_rir"],
            notes: args["_notes"],
          });
        if (state.loseSaveResponse) {
          state.loseSaveResponse = false;
          return route.abort("failed");
        }
        return respond(operation);
      }
      if (url.pathname.includes("/reorder_")) {
        if (state.failReorder) {
          state.failReorder = false;
          return respond({ message: "Не удалось сохранить порядок" }, 503);
        }
        const table = url.pathname.endsWith("reorder_program_days")
          ? "program_days"
          : "program_exercises";
        (args["_ids"] as string[]).forEach((key, position) => {
          const row = rows[table]!.find((r) => r.id === key && r.user_id === id);
          if (row) row["position"] = position;
        });
        return respond(null);
      }
    }
    const table = url.pathname.split("/").at(-1)!;
    if (!rows[table]) return respond({ message: "Unknown endpoint" }, 404);
    const matches = (r: Row) =>
      r.user_id === id &&
      [...url.searchParams].every(([key, filter]) => {
        if (["select", "order", "offset", "limit"].includes(key)) return true;
        const [op, ...rest] = filter.split(".");
        const value = rest.join(".");
        if (op === "eq") return String(r[key]) === value;
        if (op === "gte") return String(r[key]) >= value;
        if (op === "lte") return String(r[key]) <= value;
        return true;
      });
    let found = rows[table]!.filter(matches);
    if (request.method() === "POST") {
      const row = {
        id: randomUUID(),
        user_id: id,
        archived_at: null,
        working_weight: null,
        example_reps: null,
        target_reps: null,
        target_sets: null,
        created_at: createdAt(),
        ...json,
      };
      rows[table]!.push(row);
      found = [row];
    }
    if (request.method() === "PATCH") found.forEach((r) => Object.assign(r, json));
    const orders = (url.searchParams.get("order") ?? "").split(",");
    found.sort((a, b) => {
      for (const order of orders) {
        const [key, dir] = order.split(".");
        const cmp = String(a[key!] ?? "").localeCompare(String(b[key!] ?? ""), undefined, {
          numeric: true,
        });
        if (cmp) return cmp * (dir === "desc" ? -1 : 1);
      }
      return 0;
    });
    const count = found.length,
      from = Number(url.searchParams.get("offset") ?? 0),
      requested = Number(url.searchParams.get("limit") ?? 1000);
    // A deliberately low maxRows catches silent truncation even with a tiny fixture.
    found = found.slice(from, from + Math.min(requested, 2));
    if (
      requested === 1 &&
      url.searchParams.get("exercise_id") === `eq.${state.delayLastRead?.exerciseId}`
    ) {
      const gate = state.delayLastRead!;
      state.delayLastRead = null;
      found = structuredClone(found);
      await gate.promise;
    }
    return respond(
      request.headers()["accept"]?.includes("vnd.pgrst.object") ? (found[0] ?? null) : found,
      200,
      { "content-range": `${from}-${from + found.length - 1}/${count}` },
    );
  });
  return state;
}
