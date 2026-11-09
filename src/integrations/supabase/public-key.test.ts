import { expect, it } from "vitest";
import { validateSupabasePublishableKey } from "./env-contract";

const jwt = (role: string) =>
  [btoa('{"alg":"HS256"}'), btoa(JSON.stringify({ role })), "synthetic-signature"].join(".");

it("accepts only public key kinds, without asserting validity", () => {
  expect(() => validateSupabasePublishableKey("sb_publishable_synthetic_only")).not.toThrow();
  expect(() => validateSupabasePublishableKey(jwt("anon"))).not.toThrow();
});
it.each([
  "sb_secret_synthetic_only",
  jwt("service_role"),
  jwt("authenticated"),
  "opaque-synthetic",
  "x.invalid.x",
  " sb_publishable_test",
  undefined,
])("fails closed without echoing a candidate", (candidate) => {
  try {
    validateSupabasePublishableKey(candidate);
    throw new Error("Expected rejection");
  } catch (error) {
    expect((error as Error).message).toBe(
      "Supabase public key must be a publishable key or a legacy anon JWT",
    );
    if (candidate) expect((error as Error).message).not.toContain(candidate);
  }
});
