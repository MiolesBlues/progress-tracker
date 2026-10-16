import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadAllPages } from "./pagination";
import { toISO } from "./workout";
import type { HistoryEntry } from "./analytics";
import { MAX_SETS, MAX_WEIGHT, MAX_REPS, isWorkoutDate } from "./workout-input";

export type Day = { id: string; name: string; position: number; archived_at: string | null };

export type Exercise = {
  id: string;
  day_id: string | null;
  name: string;
  position: number;
  target_sets: number | null;
  target_reps: string | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  working_weight: number | null;
  example_reps: number[] | null;
  archived_at: string | null;
};

/** All personal days including archived (history needs them). */
export const userKeys = {
  all: (userId: string) => ["user", userId] as const,
  days: (userId: string) => ["user", userId, "days"] as const,
  program: (userId: string) => ["user", userId, "program"] as const,
  entries: (userId: string, exerciseId: string) => ["user", userId, "entries", exerciseId] as const,
  entrySets: (userId: string, entryIds: string[]) =>
    ["user", userId, "entry-sets", ...[...entryIds].sort()] as const,
  lastEntry: (userId: string, exerciseId: string) =>
    ["user", userId, "last-entry", exerciseId] as const,
};

export const daysQuery = (userId: string) =>
  queryOptions({
    queryKey: userKeys.days(userId),
    queryFn: async ({ signal }): Promise<Day[]> => {
      return loadAllPages(
        (from, to) =>
          supabase
            .from("program_days")
            .select("id, name, position, archived_at", { count: "exact" })
            .eq("user_id", userId)
            .order("position")
            .order("created_at")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      );
    },
  });

/** All exercises including archived ones (history needs them). Filter `archived_at` for new entries. */
export const programQuery = (userId: string) =>
  queryOptions({
    queryKey: userKeys.program(userId),
    queryFn: async ({ signal }): Promise<Exercise[]> => {
      const data = await loadAllPages(
        (from, to) =>
          supabase
            .from("program_exercises")
            .select(
              "id, day_id, name, position, target_sets, target_reps, target_rir_min, target_rir_max, working_weight, example_reps, archived_at",
              { count: "exact" },
            )
            .eq("user_id", userId)
            .order("position")
            .order("created_at")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      );
      return data.map((e) => ({
        ...e,
        working_weight: e.working_weight === null ? null : Number(e.working_weight),
        target_rir_min: e.target_rir_min === null ? null : Number(e.target_rir_min),
        target_rir_max: e.target_rir_max === null ? null : Number(e.target_rir_max),
      }));
    },
  });

export const entriesQuery = (
  userId: string,
  exerciseId: string,
  sinceISO = "0001-01-01",
  untilISO = toISO(new Date()),
) =>
  queryOptions({
    queryKey: [...userKeys.entries(userId, exerciseId), sinceISO, untilISO],
    enabled: !!exerciseId,
    queryFn: async ({ signal }): Promise<HistoryEntry[]> => {
      const data = await loadAllPages(
        (from, to) =>
          supabase
            .from("workout_entries")
            .select(
              "id, user_id, exercise_id, performed_on, created_at, weight, reps, rir, notes, day_id, day_name",
              { count: "exact" },
            )
            .eq("user_id", userId)
            .eq("exercise_id", exerciseId)
            .gte("performed_on", sinceISO)
            .lte("performed_on", untilISO)
            .order("performed_on")
            .order("created_at")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      );
      if (
        data.some(
          (e) =>
            e.weight === null ||
            !Number.isFinite(Number(e.weight)) ||
            Number(e.weight) < 0 ||
            Number(e.weight) > MAX_WEIGHT ||
            !Array.isArray(e.reps) ||
            e.reps.length < 1 ||
            e.reps.length > MAX_SETS ||
            e.reps.some((rep) => !Number.isInteger(rep) || rep < 0 || rep > MAX_REPS),
        )
      )
        throw new Error(
          "В истории есть некорректные старые результаты. Расчёты остановлены; данные требуют отдельной проверки.",
        );
      const setsByEntry = new Map<string, NonNullable<HistoryEntry["sets"]>>();
      const ids = data.map((entry) => entry.id);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data: setRows, error } = await supabase
          .from("workout_entry_sets")
          .select("id, workout_entry_id, position, weight, reps, rir, set_type, load_type")
          .eq("user_id", userId)
          .in("workout_entry_id", ids.slice(offset, offset + 100))
          .order("workout_entry_id")
          .order("position")
          .abortSignal(signal);
        if (error) throw error;
        for (const row of setRows ?? []) {
          const sets = setsByEntry.get(row.workout_entry_id) ?? [];
          sets.push({
            position: row.position,
            weight: Number(row.weight),
            reps: row.reps,
            rir: row.rir === null ? null : Number(row.rir),
            set_type: row.set_type,
            load_type: row.load_type,
          });
          setsByEntry.set(row.workout_entry_id, sets);
        }
      }
      return data.map((e) => ({
        ...e,
        weight: Number(e.weight),
        rir: e.rir === null ? null : Number(e.rir),
        ...(setsByEntry.has(e.id) ? { sets: setsByEntry.get(e.id)! } : {}),
      }));
    },
  });

/** Authoritative per-set history. Numeric values stay decimal strings for exact editing. */
export type WorkoutEntrySet = {
  id: string;
  workout_entry_id: string;
  user_id: string;
  position: number;
  weight: string;
  reps: number;
  rir: string | null;
  set_type: "warmup" | "working";
  load_type: "external" | "bodyweight";
  legacy_snapshot: boolean;
  created_at: string;
  updated_at: string;
};

export const entrySetsQuery = (userId: string, entryIds: string[]) => {
  const ids = [...new Set(entryIds)].sort();
  return queryOptions({
    queryKey: userKeys.entrySets(userId, ids),
    enabled: !!userId && ids.length > 0,
    queryFn: async ({ signal }): Promise<WorkoutEntrySet[]> => {
      if (!ids.length) return [];
      const data = await loadAllPages(
        (from, to) =>
          supabase
            .from("workout_entry_sets")
            .select(
              "id, workout_entry_id, user_id, position, weight, reps, rir, set_type, load_type, legacy_snapshot, created_at, updated_at",
              { count: "exact" },
            )
            .eq("user_id", userId)
            .in("workout_entry_id", ids)
            .order("workout_entry_id")
            .order("position")
            .order("id")
            .range(from, to)
            .abortSignal(signal),
        signal,
      );
      return data.map((row) => ({
        ...row,
        weight: String(row.weight),
        rir: row.rir === null ? null : String(row.rir),
      }));
    },
  });
};

export const lastEntryQuery = (
  userId: string,
  exerciseId: string,
  onOrBefore = toISO(new Date()),
) =>
  queryOptions({
    queryKey: [...userKeys.lastEntry(userId, exerciseId), onOrBefore],
    enabled: !!exerciseId && isWorkoutDate(onOrBefore),
    // A form selection must verify history even if its cached preview was previously successful.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("workout_entries")
        .select("id, performed_on, weight, reps, rir")
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .lte("performed_on", onOrBefore)
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!data) return data;
      const { data: sets, error: setsError } = await supabase
        .from("workout_entry_sets")
        .select("position, weight, reps, rir, set_type, load_type")
        .eq("user_id", userId)
        .eq("workout_entry_id", data.id)
        .order("position")
        .abortSignal(signal);
      if (setsError) throw setsError;
      return {
        ...data,
        sets: (sets ?? []).map((set) => ({
          ...set,
          weight: String(set.weight),
          rir: set.rir === null ? null : String(set.rir),
        })),
      };
    },
  });
