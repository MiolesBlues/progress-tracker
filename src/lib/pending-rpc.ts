import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Functions = Database["public"]["Functions"];

// Resolve the lazy client only on invocation. The generated contract couples
// each function name to its exact argument shape and SDK result builder.
export function pendingRpc<Name extends keyof Functions>(
  name: Name,
  args: Functions[NoInfer<Name>]["Args"],
  options?: Parameters<typeof supabase.rpc>[2],
) {
  return supabase.rpc<Name, Functions[Name]["Args"]>(name, args, options);
}
