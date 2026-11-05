import { errorPageResponse } from "./error-page";
import { requestLanguage } from "./ssr-language";

type Boundary = "server_entry" | "request_middleware" | "framework_response";

function errorKind(error: unknown): string {
  // Only fixed classifications cross the logging boundary. Never inspect names,
  // messages, causes or stacks supplied by application/dependency exceptions.
  if (error instanceof TypeError) return "type_error";
  if (error instanceof RangeError) return "range_error";
  if (error instanceof SyntaxError) return "syntax_error";
  return error instanceof Error ? "unexpected_error" : "thrown_value";
}

export function serverErrorResponse(
  request: Request,
  boundary: Boundary,
  error?: unknown,
): Response {
  const correlationId = crypto.randomUUID();
  const response = errorPageResponse(requestLanguage(request));
  response.headers.set("x-pt-error-id", correlationId);
  console.error(
    JSON.stringify({
      event: "ssr_failure",
      boundary,
      kind: boundary === "framework_response" ? "framework_swallowed" : errorKind(error),
      correlation_id: correlationId,
    }),
  );
  return response;
}
