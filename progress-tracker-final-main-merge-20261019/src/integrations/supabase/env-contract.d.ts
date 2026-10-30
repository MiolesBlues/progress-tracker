export type SupabaseEnvironment = "development" | "staging" | "production" | "test";
export interface SupabaseEnvironmentInput {
  browserUrl?: string | undefined;
  serverUrl?: string | undefined;
  projectRef?: string | undefined;
  browserProjectRef?: string | undefined;
  projectId?: string | undefined;
  browserProjectId?: string | undefined;
  environment?: string | undefined;
  browserEnvironment?: string | undefined;
}
export const SUPABASE_PROJECT_REFS: Readonly<{ production: string; staging: string }>;
export function validateSupabaseEnvironment(input: SupabaseEnvironmentInput): void;
