import { describe, expect, it } from "vitest";
import { SUPABASE_PROJECT_REFS, validateSupabaseEnvironment } from "./env-contract";

const stagingUrl = `https://${SUPABASE_PROJECT_REFS.staging}.supabase.co`;
const productionUrl = `https://${SUPABASE_PROJECT_REFS.production}.supabase.co`;

describe("Supabase environment contract", () => {
  it("accepts matching production browser/server refs and declared project ID", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: productionUrl,
        serverUrl: productionUrl,
        projectId: SUPABASE_PROJECT_REFS.production,
        browserProjectRef: SUPABASE_PROJECT_REFS.production,
        environment: "production",
      }),
    ).not.toThrow();
  });

  it("accepts the staging project in staging mode without a development opt-in", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: stagingUrl,
        serverUrl: stagingUrl,
        projectRef: SUPABASE_PROJECT_REFS.staging,
        browserProjectRef: SUPABASE_PROJECT_REFS.staging,
        environment: "staging",
      }),
    ).not.toThrow();
  });

  it("does not let bun run dev use staging mode as a way around the development opt-in", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: stagingUrl,
        serverUrl: stagingUrl,
        environment: "staging",
        developmentServer: true,
      }),
    ).toThrow(/development server must use SUPABASE_ENVIRONMENT=development or test/);
  });

  it("allows staging during Vite development only with explicit opt-in", () => {
    const stagingDevelopment = {
      browserUrl: stagingUrl,
      serverUrl: stagingUrl,
      projectRef: SUPABASE_PROJECT_REFS.staging,
      browserProjectRef: SUPABASE_PROJECT_REFS.staging,
      environment: "development",
      browserEnvironment: "development",
      developmentServer: true,
    };
    expect(() => validateSupabaseEnvironment(stagingDevelopment)).toThrow(/ALLOW_STAGING_DEV=true/);
    expect(() =>
      validateSupabaseEnvironment({ ...stagingDevelopment, allowStagingDevelopment: true }),
    ).not.toThrow();
    expect(() =>
      validateSupabaseEnvironment({
        ...stagingDevelopment,
        allowStagingDevelopment: true,
        developmentServer: false,
      }),
    ).toThrow(/ALLOW_STAGING_DEV=true/);
  });

  it("requires both Vite server and browser URLs to identify the same staging project", () => {
    const stagingDevelopment = {
      browserUrl: stagingUrl,
      serverUrl: stagingUrl,
      environment: "development",
      developmentServer: true,
      allowStagingDevelopment: true,
      requireBrowserServerPair: true,
    };
    expect(() => validateSupabaseEnvironment(stagingDevelopment)).not.toThrow();
    expect(() =>
      validateSupabaseEnvironment({ ...stagingDevelopment, serverUrl: "http://localhost:54321" }),
    ).toThrow(/matching hosted browser and server project refs/);
    expect(() => {
      const { serverUrl: _, ...browserOnly } = stagingDevelopment;
      validateSupabaseEnvironment(browserOnly);
    }).toThrow(/matching hosted browser and server project refs/);
  });

  it("blocks production in development even when staging opt-in is enabled", () => {
    for (const refs of [
      { serverUrl: productionUrl },
      { projectRef: SUPABASE_PROJECT_REFS.production },
      { projectId: SUPABASE_PROJECT_REFS.production },
    ]) {
      expect(() =>
        validateSupabaseEnvironment({
          ...refs,
          environment: "development",
          developmentServer: true,
          allowStagingDevelopment: true,
        }),
      ).toThrow(/cannot target production/);
    }
  });

  it("rejects staging URLs or refs when environment is production", () => {
    expect(() =>
      validateSupabaseEnvironment({ browserUrl: stagingUrl, environment: "production" }),
    ).toThrow(/does not match/);
    expect(() =>
      validateSupabaseEnvironment({
        projectRef: SUPABASE_PROJECT_REFS.staging,
        environment: "production",
      }),
    ).toThrow(/does not match/);
  });

  it("rejects production URLs or refs when environment is staging", () => {
    expect(() =>
      validateSupabaseEnvironment({ serverUrl: productionUrl, environment: "staging" }),
    ).toThrow(/does not match/);
    expect(() =>
      validateSupabaseEnvironment({
        projectRef: SUPABASE_PROJECT_REFS.production,
        environment: "staging",
      }),
    ).toThrow(/does not match/);
  });

  it("rejects browser and server URLs that point at different projects", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: productionUrl,
        serverUrl: stagingUrl,
        environment: "development",
        developmentServer: true,
        allowStagingDevelopment: true,
      }),
    ).toThrow(/refs do not match/);
  });

  it("rejects a declared browser or server ref that differs from the URLs", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: stagingUrl,
        serverUrl: stagingUrl,
        projectRef: SUPABASE_PROJECT_REFS.production,
        environment: "development",
        developmentServer: true,
        allowStagingDevelopment: true,
      }),
    ).toThrow(/refs do not match/);
  });

  it("requires matching environment names and an explicit environment value", () => {
    expect(() =>
      validateSupabaseEnvironment({
        environment: "staging",
        browserEnvironment: "production",
      }),
    ).toThrow(/environments do not match/);
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: stagingUrl,
        serverUrl: stagingUrl,
        developmentServer: true,
        allowStagingDevelopment: true,
      }),
    ).toThrow(/development or test/);
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: productionUrl,
        environment: "developement",
      }),
    ).toThrow(/must be development/);
  });

  it("refuses unverifiable URLs for hosted environments and unknown hosts in development", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://api.progress.example",
        projectRef: SUPABASE_PROJECT_REFS.production,
        environment: "production",
        browserEnvironment: "production",
      }),
    ).toThrow(/must identify a Supabase project or localhost/);
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://api.progress.example",
        environment: "development",
      }),
    ).toThrow(/must identify a Supabase project or localhost/);
  });

  it("rejects malformed URLs and non-HTTPS hosted endpoints", () => {
    expect(() =>
      validateSupabaseEnvironment({ browserUrl: "not-a-url", environment: "development" }),
    ).toThrow(/absolute URL/);
    expect(() =>
      validateSupabaseEnvironment({
        serverUrl: "http://fdzcwhzszbmpxyawrzzf.supabase.co",
        environment: "development",
        developmentServer: true,
        allowStagingDevelopment: true,
      }),
    ).toThrow(/must use HTTPS/);
  });

  it("allows paired localhost URLs and the explicit fake host used by isolated tests", () => {
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "http://localhost:54321",
        serverUrl: "http://127.0.0.1:54321",
        environment: "development",
        developmentServer: true,
      }),
    ).not.toThrow();
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://workout-e2e.invalid",
        serverUrl: "https://workout-e2e.invalid",
        environment: "test",
      }),
    ).not.toThrow();
  });

  it("prevents unit/E2E test mode from targeting any hosted project", () => {
    for (const hostedUrl of [stagingUrl, productionUrl]) {
      expect(() =>
        validateSupabaseEnvironment({
          browserUrl: hostedUrl,
          serverUrl: hostedUrl,
          environment: "test",
        }),
      ).toThrow(/cannot target production|cannot target the hosted staging/i);
    }
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://unknown-project.supabase.co",
        serverUrl: "https://unknown-project.supabase.co",
        environment: "test",
      }),
    ).toThrow(/must identify a Supabase project or localhost|project ref is not recognized/);
    expect(() =>
      validateSupabaseEnvironment({
        browserUrl: "https://workout-e2e.invalid",
        serverUrl: "https://workout-e2e.invalid",
        projectRef: "isolated-test",
        environment: "test",
      }),
    ).not.toThrow();
  });
});
