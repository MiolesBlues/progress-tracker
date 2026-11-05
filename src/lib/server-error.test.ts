import { afterEach, expect, it, vi } from "vitest";
import { serverErrorResponse } from "./server-error";

afterEach(() => vi.restoreAllMocks());

it.each([
  [new TypeError("private token"), "type_error"],
  [new RangeError("private workout"), "range_error"],
  [new SyntaxError("private payload"), "syntax_error"],
  [new Error("private password", { cause: "private cause" }), "unexpected_error"],
  [{ name: "private name", message: "private message" }, "thrown_value"],
  [
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("private prototype diagnostic");
        },
      },
    ),
    "thrown_value",
  ],
])("emits only an allowlisted diagnostic classification", async (error, kind) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = serverErrorResponse(
    new Request("https://example.invalid/private-path?token=private-query", {
      headers: { authorization: "Bearer private-auth", cookie: "private-cookie" },
    }),
    "request_middleware",
    error,
  );
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const event = JSON.parse(log.mock.calls[0]![0] as string);
  expect(event).toEqual({
    event: "ssr_failure",
    boundary: "request_middleware",
    kind,
    correlation_id: response.headers.get("x-pt-error-id"),
  });
  expect(event.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(event) + (await response.text())).not.toContain("private");
});
