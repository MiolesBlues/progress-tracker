export const SUPABASE_PROJECT_REFS = {
  production: "szdmzvsenrnjxgjgregf",
  staging: "fdzcwhzszbmpxyawrzzf",
};

function projectRefFromUrl(value, label) {
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`${label} must use HTTPS outside localhost`);
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  return match?.[1];
}

export function validateSupabaseEnvironment(input) {
  const env = input.environment?.toLowerCase();
  const browserEnv = input.browserEnvironment?.toLowerCase();
  if (env && browserEnv && env !== browserEnv) {
    throw new Error("Browser build-time and server runtime environments do not match");
  }
  const selectedEnvironment = browserEnv || env;
  if (
    selectedEnvironment &&
    !["development", "staging", "production", "test"].includes(selectedEnvironment)
  ) {
    throw new Error("SUPABASE_ENVIRONMENT must be development, staging, production, or test");
  }

  const browserRef = projectRefFromUrl(input.browserUrl, "VITE_SUPABASE_URL");
  const serverRef = projectRefFromUrl(input.serverUrl, "SUPABASE_URL");
  if (
    (selectedEnvironment === "staging" || selectedEnvironment === "production") &&
    ((input.browserUrl && !browserRef) || (input.serverUrl && !serverRef))
  ) {
    throw new Error("Cannot verify the Supabase project ref from the configured URL host");
  }
  const declaredRefs = [
    input.projectRef,
    input.browserProjectRef,
    input.projectId,
    input.browserProjectId,
  ].filter((ref) => Boolean(ref));
  const actualRefs = [browserRef, serverRef].filter((ref) => Boolean(ref));
  const allRefs = [...declaredRefs, ...actualRefs];

  if (new Set(allRefs).size > 1) {
    throw new Error("Supabase project refs do not match across browser and server configuration");
  }
  const actualRef = actualRefs[0];
  if (actualRef && (selectedEnvironment === "staging" || selectedEnvironment === "production")) {
    const expected = SUPABASE_PROJECT_REFS[selectedEnvironment];
    if (actualRef !== expected) {
      throw new Error(`Supabase URL does not match SUPABASE_ENVIRONMENT=${selectedEnvironment}`);
    }
  }
  if (
    actualRef &&
    selectedEnvironment === "development" &&
    Object.values(SUPABASE_PROJECT_REFS).includes(actualRef)
  ) {
    throw new Error(
      "Development configuration cannot target the hosted staging or production project",
    );
  }
}
