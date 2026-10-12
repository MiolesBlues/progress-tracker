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
export const daysQuery = queryOptions({
  queryKey: ["days"],
  queryFn: async (): Promise<Day[]> => {
    const { data, error } = await supabase
      .from("program_days")
      .select("id, name, position, archived_at")
      .order("position")
      .order("created_at");
    if (error) throw error;
    return data;
  },
});

/** All exercises including archived ones (history needs them). Filter `archived_at` for new entries. */
export const programQuery = queryOptions({
  queryKey: ["program"],
  queryFn: async (): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from("program_exercises")
      .select("id, day_id, name, position, target_sets, target_reps, working_weight, example_reps, archived_at")
      .order("position")
      .order("created_at");
    if (error) throw error;
    return data.map((e) => ({ ...e, working_weight: e.working_weight === null ? null : Number(e.working_weight) }));
  },
});

export const entriesQuery = (exerciseId: string, sinceISO: string) =>
  queryOptions({
    queryKey: ["entries", exerciseId, sinceISO],
    enabled: !!exerciseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_entries")
        .select("id, performed_on, weight, reps, rir, notes, day_name")
        .eq("exercise_id", exerciseId)
        .gte("performed_on", sinceISO)
        .order("performed_on");
      if (error) throw error;
      return data.map((e) => ({ ...e, weight: Number(e.weight) }));
    },
  });

export const lastEntryQuery = (exerciseId: string) =>
  queryOptions({
    queryKey: ["last-entry", exerciseId],
    enabled: !!exerciseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_entries")
        .select("performed_on, weight, reps, rir")
        .eq("exercise_id", exerciseId)
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
