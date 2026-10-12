import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Exercise = { id: string; day: string; name: string; position: number };

export const programQuery = queryOptions({
  queryKey: ["program"],
  queryFn: async (): Promise<Exercise[]> => {
    const { data, error } = await supabase
      .from("program_exercises")
      .select("id, day, name, position")
      .order("position");
    if (error) throw error;
    return data;
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
