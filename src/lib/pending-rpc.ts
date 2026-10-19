import { supabase } from "@/integrations/supabase/client";

/**
 * RPCs defined in drizzle/migrations 0003/0004 that are not yet applied to the
 * backend (awaiting user approval), so generated types do not list them yet.
 * Remove this helper once the migrations are applied and types regenerate.
 */
type PendingRpc = "reorder_program_days" | "reorder_program_exercises" | "save_workout_entry";

export function pendingRpc(name: PendingRpc, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => ReturnType<typeof supabase.rpc>
  )(name, args);
}
