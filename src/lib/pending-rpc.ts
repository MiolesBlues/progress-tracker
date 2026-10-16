import { supabase } from "@/integrations/supabase/client";

/**
 * RPCs defined in drizzle/migrations that generated backend types do not list
 * yet. This adapter does not apply migrations or bypass backend permissions.
 * Remove this helper once the migrations are applied and types regenerate.
 */
type PendingRpc =
  | "reorder_program_days"
  | "reorder_program_exercises"
  | "save_workout_entry"
  | "delete_archived_program_day"
  | "delete_archived_program_exercise";

export function pendingRpc(name: PendingRpc, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => ReturnType<typeof supabase.rpc>
  )(name, args);
}
