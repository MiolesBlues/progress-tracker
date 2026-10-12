import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Exercise = {
  id: string;
  day: string;
  name: string;
  position: number;
  target_sets: number | null;
  target_reps: string | null;
  working_weight: number | null;
  example_reps: number[] | null;
  archived_at: string | null;
};

/** All exercises including archived ones (history needs them). Filter `archived_at` for new entries. */
export const programQuery = queryOptions({
  queryKey: ["program"],
  queryFn: async (): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from("program_exercises")
      .select("id, day, name, position, target_sets, target_reps, working_weight, example_reps, archived_at")
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
        .select("id, performed_on, weight, reps, rir, notes")
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
