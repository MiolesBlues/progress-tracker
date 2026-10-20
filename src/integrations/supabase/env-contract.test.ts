import { describe, expect, it } from "vitest";
import { SUPABASE_PROJECT_REFS, validateSupabaseEnvironment } from "./env-contract";

describe("Supabase environment contract", () => {
  it("accepts matching browser/server refs and the declared project ID", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`,
        serverUrl: `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`,
        projectId: SUPABASE_PROJECT_REFS.production,
        browserProjectRef: SUPABASE_PROJECT_REFS.production,
        environment: "production",
      }),
    ).not.toThrow();
  });

  it("rejects browser and server URLs that point at different projects", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`,
        serverUrl: `https://${SUPABASE_PROJECT_REFS.staging}.supabase.co`,
      }),
    ).toThrow(/refs do not match/);
  });

  it("rejects a URL whose declared environment or project ref differs", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`,
        projectRef: SUPABASE_PROJECT_REFS.staging,
        environment: "production",
      }),
    ).toThrow(/refs do not match/);
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: `https://${SUPABASE_PROJECT_REFS.staging}.supabase.co`,
        environment: "production",
      }),
    ).toThrow(/does not match/);
  });

  it("rejects a browser build-time environment that differs from the server runtime", () => {
    expect(() =>
      validateSupabaseEnvironment({
        environment: "staging",
        browserEnvironment: "production",
      }),
    ).toThrow(/environments do not match/);
  });

  it("refuses an unverifiable custom URL for a named hosted environment", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://api.progress.example",
        projectRef: SUPABASE_PROJECT_REFS.production,
        environment: "production",
        browserEnvironment: "production",
      }),
    ).toThrow(/Cannot verify/);
  });

  it("rejects an accidental hosted project in a development environment", () => {
    expect(() =>
      validateSupabaseEnvironment({
        serverUrl: `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`,
        environment: "development",
      }),
    ).toThrow(/Development configuration/);
  });

  it("allows paired local test URLs without a hosted ref", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://workout-e2e.invalid",
        serverUrl: "https://workout-e2e.invalid",
        environment: "test",
      }),
    ).not.toThrow();
  });
});
