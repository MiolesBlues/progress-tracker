import { afterEach, expect, it, vi } from "vitest";
const { fetchHandler } = vi.hoisted(() => ({ fetchHandler: vi.fn() }));
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: fetchHandler } }));
vi.mock("./lib/error-capture", () => ({ consumeLastCapturedError: () => null }));
import server from "./server";

afterEach(() => {
  vi.restoreAllMocks();
  fetchHandler.mockReset();
});

it.each(["throw", "swallowed"])(
  "localizes the actual server %s fallback using the current display hint",
  async (mode) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (mode === "throw") fetchHandler.mockRejectedValueOnce(new Error("private diagnostic"));
    else
      fetchHandler.mockResolvedValueOnce(
        new Response(JSON.stringify({ unhandled: true, message: "HTTPError" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      );
    const response = await server.fetch(
      new Request("https://example.invalid", {
        headers: { cookie: "app_display_language=en", "accept-language": "ru" },
      }),
      {},
      {},
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("content-language")).toBe("en");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain('<html lang="en">');
    expect(body).toContain("Could not load the page");
    expect(body).not.toContain("private diagnostic");
  },
);

it("preserves successful responses and unrelated JSON errors", async () => {
  for (const response of [
    new Response("ok"),
    new Response('{"message":"expected"}', {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  ]) {
    fetchHandler.mockResolvedValueOnce(response);
    expect(await server.fetch(new Request("https://example.invalid"), {}, {})).toBe(response);
  }
});
