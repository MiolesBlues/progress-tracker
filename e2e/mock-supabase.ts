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
    workout_entry_sets: [],
  };
  const state = {
    rows,
    users,
    offline: false,
    loseSaveResponse: false,
    archiveDeletionAvailable: true,
    deleteReplyStatus: null as number | null,
    failReorder: false,
    failPatch: false,
    trainingLibraryAvailable: true,
    failNextTemplateApply: false,
    loseNextTemplateApplyResponse: false,
    archiveDayOnInsert: false,
    delayProgramUpdate: null as { id: string; promise: Promise<void> } | null,
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
      if (url.pathname.endsWith("/list_training_templates")) {
        if (!state.trainingLibraryAvailable)
          return respond({ code: "PGRST202", message: "Function not found" }, 404);
        const count = Number(args["_days_per_week"]);
        return respond([
          {
            template_key: `strength_${count}d_v1`,
            version: 1,
            title_ru: `Шаблон ${count} дней`,
            days_per_week: count,
            metadata: {},
          },
        ]);
      }
      if (url.pathname.endsWith("/apply_training_template")) {
        if (state.failNextTemplateApply) {
          state.failNextTemplateApply = false;
          return respond({ code: "22023", message: "Simulated template failure" }, 400);
        }
        const names = args["_names"] as string[];
        const applicationId = String(args["_application_id"]);
        const templateKey = String(args["_template_key"]);
        if (
          rows["program_days"]!.some(
            (row) => row["user_id"] === id && row["template_application_id"] === applicationId,
          )
        )
          return respond(null);
        names.forEach((name, position) => {
          const dayId = randomUUID();
          rows["program_days"]!.push({
            id: dayId,
            user_id: id,
            name,
            position,
            archived_at: null,
            created_at: createdAt(),
            template_application_id: applicationId,
            template_day_key: `${templateKey}_d${String(position + 1).padStart(2, "0")}`,
          });
          rows["program_exercises"]!.push({
            id: randomUUID(),
            user_id: id,
            day_id: dayId,
            day: `${templateKey}_d${String(position + 1).padStart(2, "0")}`,
            position: 0,
            name: `Упражнение ${position + 1}`,
            working_weight: null,
            target_sets: 3,
            target_reps: "8-12",
            target_rir_min: 2,
            target_rir_max: 3,
            archived_at: null,
            created_at: createdAt(),
            template_application_id: applicationId,
            template_slot_key: `${templateKey}_d${String(position + 1).padStart(2, "0")}_e01`,
            template_exercise_key: `exercise_${position + 1}`,
          });
        });
        if (state.loseNextTemplateApplyResponse) {
          state.loseNextTemplateApplyResponse = false;
          await route.abort("failed");
          return;
        }
        return respond(null);
      }
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
      if (url.pathname.endsWith("/save_workout_entry_sets")) {
        const operation = String(args["_id"]);
        const sets = args["_sets"] as Row[];
        state.saveCalls.push(operation);
        if (!rows["workout_entries"]!.some((row) => row.id === operation)) {
          rows["workout_entries"]!.push({
            id: operation,
            user_id: id,
            exercise_id: args["_exercise_id"],
            day_id: args["_day_id"],
            day_name: rows["program_days"]!.find((row) => row.id === args["_day_id"])?.["name"],
            performed_on: args["_performed_on"],
            created_at: createdAt(),
            weight: Number(sets[0]?.["weight"] ?? 0),
            reps: sets.map((set) => set["reps"]),
            rir: sets[0]?.["rir"] ?? null,
            notes: args["_notes"],
          });
          sets.forEach((set) =>
            rows["workout_entry_sets"]!.push({
              ...set,
              id: String(set["id"]),
              user_id: id,
              workout_entry_id: operation,
              legacy_snapshot: false,
              created_at: createdAt(),
              updated_at: createdAt(),
            }),
          );
        }
        if (state.loseSaveResponse) {
          state.loseSaveResponse = false;
          return route.abort("failed");
        }
        return respond(operation);
      }
      if (url.pathname.endsWith("/archive_deletion_capabilities"))
        return respond(state.archiveDeletionAvailable);
      if (url.pathname.endsWith("/delete_archived_program_day")) {
        const day = rows["program_days"]!.find(
          (row) => row.id === args["_day_id"] && row.user_id === id,
        );
        if (!day) return respond(false);
        if (!day["archived_at"])
          return respond({ message: "Only archived days may be deleted" }, 400);
        rows["program_exercises"]!.forEach((row) => {
          if (row.user_id === id && row["day_id"] === day.id) row["day_id"] = null;
        });
        rows["workout_entries"]!.forEach((row) => {
          if (row.user_id === id && row["day_id"] === day.id) row["day_id"] = null;
        });
        rows["program_days"]!.splice(rows["program_days"]!.indexOf(day), 1);
        const status = state.deleteReplyStatus;
        state.deleteReplyStatus = null;
        return status ? respond({ message: "simulated lost reply" }, status) : respond(true);
      }
      if (url.pathname.endsWith("/delete_archived_program_exercise")) {
        const exercise = rows["program_exercises"]!.find(
          (row) => row.id === args["_exercise_id"] && row.user_id === id,
        );
        if (!exercise) return respond(false);
        if (!exercise["archived_at"])
          return respond({ message: "Only archived exercises may be deleted" }, 400);
        rows["workout_entries"] = rows["workout_entries"]!.filter(
          (row) => !(row.user_id === id && row["exercise_id"] === exercise.id),
        );
        rows["program_exercises"]!.splice(rows["program_exercises"]!.indexOf(exercise), 1);
        const status = state.deleteReplyStatus;
        state.deleteReplyStatus = null;
        return status ? respond({ message: "simulated lost reply" }, status) : respond(true);
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
      if (table === "program_exercises" && state.archiveDayOnInsert) {
        state.archiveDayOnInsert = false;
        const day = rows["program_days"]!.find((row) => row.id === json?.["day_id"]);
        if (day) day["archived_at"] = createdAt();
        return respond(
          {
            code: "22023",
            message: "Выбранный тренировочный день больше недоступен. Упражнение не создано.",
          },
          400,
        );
      }
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
    if (request.method() === "PATCH") {
      if (state.failPatch) {
        state.failPatch = false;
        return respond({ message: "Network unavailable" }, 503);
      }
      const delayed = state.delayProgramUpdate;
      if (table === "program_days" && delayed && found.some((row) => row.id === delayed.id)) {
        state.delayProgramUpdate = null;
        await delayed.promise;
      }
      found.forEach((r) => Object.assign(r, json));
    }
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
    found = found.slice(
      from,
      from + Math.min(requested, table === "workout_entry_sets" ? 1000 : 2),
    );
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
