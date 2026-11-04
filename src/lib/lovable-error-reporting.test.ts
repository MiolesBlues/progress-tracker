import { afterEach, expect, it, vi } from "vitest";
import { reportLovableError } from "./lovable-error-reporting";

afterEach(() => {
  delete window.__lovableEvents;
  delete window.__lovableReportRuntimeError;
});

it("redacts raw errors, stacks and private values from telemetry", () => {
  const captureException = vi.fn();
  const report = vi.fn();
  window.__lovableEvents = { captureException };
  window.__lovableReportRuntimeError = report;
  reportLovableError(new Error("token=secret workout bench 120kg"), { boundary: "root" });
  expect(captureException).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Application error" }),
    expect.objectContaining({ source: "react_error_boundary", boundary: "root" }),
    expect.any(Object),
  );
  expect(report).toHaveBeenCalledWith({
    message: "Application error",
    filename: window.location.pathname,
  });
  expect(JSON.stringify([captureException.mock.calls, report.mock.calls])).not.toMatch(
    /secret|bench|120kg/,
  );
});
