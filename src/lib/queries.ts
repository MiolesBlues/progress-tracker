import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Day = { id: string; name: string; position: number; archived_at: string | null };

export type Exercise = {
  id: string;
  day_id: string | null;
  name: string;
  position: number;
  target_sets: number | null;
  target_reps: string | null;
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
  lastEntry: (userId: string, exerciseId: string) =>
    ["user", userId, "last-entry", exerciseId] as const,
};

export const daysQuery = (userId: string) =>
  queryOptions({
    queryKey: userKeys.days(userId),
    queryFn: async ({ signal }): Promise<Day[]> => {
      const { data, error } = await supabase
        .from("program_days")
        .select("id, name, position, archived_at")
        .eq("user_id", userId)
        .order("position")
        .order("created_at")
        .order("id")
        .abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });

/** All exercises including archived ones (history needs them). Filter `archived_at` for new entries. */
export const programQuery = (userId: string) =>
  queryOptions({
    queryKey: userKeys.program(userId),
    queryFn: async ({ signal }): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from("program_exercises")
        .select(
          "id, day_id, name, position, target_sets, target_reps, working_weight, example_reps, archived_at",
        )
        .eq("user_id", userId)
        .order("position")
        .order("created_at")
        .order("id")
        .abortSignal(signal);
      if (error) throw error;
      return data.map((e) => ({
        ...e,
        working_weight: e.working_weight === null ? null : Number(e.working_weight),
      }));
    },
  });

export const entriesQuery = (userId: string, exerciseId: string, sinceISO: string) =>
  queryOptions({
    queryKey: [...userKeys.entries(userId, exerciseId), sinceISO],
    enabled: !!exerciseId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("workout_entries")
        .select("id, performed_on, weight, reps, rir, notes, day_name")
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .gte("performed_on", sinceISO)
        .order("performed_on")
        .abortSignal(signal);
      if (error) throw error;
      return data.map((e) => ({ ...e, weight: Number(e.weight) }));
    },
  });

export const lastEntryQuery = (userId: string, exerciseId: string) =>
  queryOptions({
    queryKey: userKeys.lastEntry(userId, exerciseId),
    enabled: !!exerciseId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("workout_entries")
        .select("performed_on, weight, reps, rir")
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
