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

  // Some clients nest the HTTP status in a parsed JSON body.
  if (typeof err === "object" && "body" in err) {
    const body = (err as Record<string, unknown>).body;
    let parsed: unknown = body;
    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = undefined;
      }
    }
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const code = (parsed as Record<string, unknown>).code;
      if (typeof code === "number") {
        return code;
      }
    }
  }

  return undefined;
}

/**
 * Extract error message from an API error, parsing JSON body if present.
 * Returns a message string (trimmed to 300 chars), or undefined if none found.
 *
 * Handles:
 * - ApiException with body property (string or object) containing a message field
 * - Error.message property
 * - Never returns the raw body JSON (security: prevents leaking internal details)
 */
export function apiErrorMessage(err: unknown): string | undefined {
  if (err == null) {
    return undefined;
  }

  const errObj = err as unknown as Record<string, unknown>;

  // Try to parse body (string or object with a message field).
  if ("body" in errObj) {
    const body = errObj.body;
    let parsed: unknown;

    // If body is a JSON string, parse it.
    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body);
      } catch {
        // Not JSON, ignore.
      }
    } else {
      parsed = body;
    }

    // If parsed object has a message field, use it.
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const msg = (parsed as Record<string, unknown>).message;
      if (typeof msg === "string") {
        return msg.trim().slice(0, 300);
      }
    }
  }

  // Fall back to Error.message.
  if (err instanceof Error && err.message) {
    return err.message.trim().slice(0, 300);
  }

  return undefined;
}
