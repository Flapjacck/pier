/**
 * Extract HTTP status code from a Kubernetes API error or similar error.
 * Returns the numeric code if found, undefined otherwise.
 *
 * Handles:
 * - ApiException with statusCode property (from @kubernetes/client-node)
 * - Errors with a code property (legacy or other API clients)
 * - Non-errors (returns undefined)
 */
export function apiStatusCode(err: unknown): number | undefined {
  if (err == null) {
    return undefined;
  }

  // Check for ApiException.statusCode first (client-node pattern).
  if (typeof err === "object" && "statusCode" in err) {
    const code = (err as Record<string, unknown>).statusCode;
    if (typeof code === "number") {
      return code;
    }
  }

  // Fall back to numeric code property (other API clients).
  if (typeof err === "object" && "code" in err) {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === "number") {
      return code;
    }
  }

  return undefined;
}
