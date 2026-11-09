export const SUPABASE_PROJECT_REFS = {
  production: "szdmzvsenrnjxgjgregf",
  staging: "fdzcwhzszbmpxyawrzzf",
};

// This checks public key *kind*, not signature validity or authorization.
// Never include the supplied value (or decoder error) in diagnostics.
export function validateSupabasePublishableKey(value) {
  let publicKind = typeof value === "string" && /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
  if (!publicKind && typeof value === "string") {
    const parts = value.split(".");
    if (parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        publicKind = payload?.role === "anon";
      } catch {
        publicKind = false;
      }
    }
  }
  if (!publicKind) {
    throw new Error("Supabase public key must be a publishable key or a legacy anon JWT");
  }
}

function projectRefFromUrl(value, label, { allowTestHost = false } = {}) {
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const isolatedTestHost = allowTestHost && url.hostname.endsWith(".invalid");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error(`${label} must use HTTPS outside localhost`);
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (!match && !localHost && !isolatedTestHost) {
    throw new Error(`${label} must identify a Supabase project or localhost`);
  }
  return match?.[1];
}

export function validateSupabaseEnvironment(input) {
  const env = input.environment?.toLowerCase();
  const browserEnv = input.browserEnvironment?.toLowerCase();
  const developmentServer = input.developmentServer === true;
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

  const allowTestHost = selectedEnvironment === "test";
  const browserRef = projectRefFromUrl(input.browserUrl, "VITE_SUPABASE_URL", { allowTestHost });
  const serverRef = projectRefFromUrl(input.serverUrl, "SUPABASE_URL", { allowTestHost });
  if (
    (selectedEnvironment === "staging" || selectedEnvironment === "production") &&
    ((input.browserUrl && !browserRef) || (input.serverUrl && !serverRef))
  ) {
    throw new Error("Cannot verify the Supabase project ref from the configured URL host");
  }
  if (developmentServer && !selectedEnvironment) {
    throw new Error("Vite development server requires SUPABASE_ENVIRONMENT=development or test");
  }
  if (developmentServer && !["development", "test"].includes(selectedEnvironment)) {
    throw new Error("Vite development server must use SUPABASE_ENVIRONMENT=development or test");
  }
  const declaredRefs = [
    input.projectRef,
    input.browserProjectRef,
    input.projectId,
    input.browserProjectId,
  ].filter((ref) => Boolean(ref));
  const actualRefs = [browserRef, serverRef].filter((ref) => Boolean(ref));
  const allRefs = [...declaredRefs, ...actualRefs];
  if (
    input.requireBrowserServerPair === true &&
    (!browserRef || !serverRef || browserRef !== serverRef)
  ) {
    throw new Error("Staging development requires matching hosted browser and server project refs");
  }
  const knownHostedRefs = new Set(Object.values(SUPABASE_PROJECT_REFS));
  const isolatedTestRefs = selectedEnvironment === "test" && actualRefs.length === 0;
  if (allRefs.some((ref) => !knownHostedRefs.has(ref)) && !isolatedTestRefs) {
    throw new Error("Supabase project ref is not recognized for this application");
  }

  if (new Set(allRefs).size > 1) {
    throw new Error("Supabase project refs do not match across browser and server configuration");
  }
  const actualRef = actualRefs[0];
  if (selectedEnvironment === "staging" || selectedEnvironment === "production") {
    const expected = SUPABASE_PROJECT_REFS[selectedEnvironment];
    if (allRefs.some((ref) => ref !== expected)) {
      throw new Error(
        `Supabase project ref does not match SUPABASE_ENVIRONMENT=${selectedEnvironment}`,
      );
    }
    if (!actualRef) {
      throw new Error("Cannot verify the Supabase project ref from the configured URLs");
    }
  }
  const allProjects = new Set(allRefs);
  if (allProjects.has(SUPABASE_PROJECT_REFS.production) && selectedEnvironment !== "production") {
    throw new Error("Development and non-production configuration cannot target production");
  }
  if (allProjects.has(SUPABASE_PROJECT_REFS.staging)) {
    if (selectedEnvironment === "test") {
      throw new Error("Test configuration cannot target the hosted staging project");
    }
    const optedIn = input.allowStagingDevelopment === true;
    if (selectedEnvironment === "development" || developmentServer) {
      if (!developmentServer || !optedIn) {
        throw new Error("Staging in the Vite development server requires ALLOW_STAGING_DEV=true");
      }
    } else if (selectedEnvironment !== "staging") {
      throw new Error("Staging project ref requires SUPABASE_ENVIRONMENT=staging");
    }
  }
  if (allProjects.size > 0 && !selectedEnvironment) {
    throw new Error("SUPABASE_ENVIRONMENT is required for a hosted Supabase project ref");
  }
}
