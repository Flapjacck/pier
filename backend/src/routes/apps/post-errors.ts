import type { FastifyReply } from "fastify";
import { apiErrorMessage, apiStatusCode } from "../../k8s/api-errors.js";
import {
  AppExistsError,
  CreateTimeoutError,
  HostInUseError,
} from "../../k8s/create-app.js";

/**
 * Map a caught error from createAppSerialized to a Fastify response.
 * Returns true if the error was handled, false if it should be re-thrown.
 */
export function mapPostAppsError(
  err: unknown,
  reply: FastifyReply,
): boolean {
  // Known app creation errors (pre-checks, conflict).
  if (err instanceof AppExistsError) {
    reply.status(409).send({ ok: false, error: "app already exists" });
    return true;
  }

  if (err instanceof HostInUseError) {
    reply.status(409).send({ ok: false, error: "host already in use" });
    return true;
  }

  if (err instanceof CreateTimeoutError) {
    reply.status(503).send({
      ok: false,
      error: "cluster unreachable",
      details: "create timed out",
    });
    return true;
  }

  // Parse status code and message from API error.
  const statusCode = apiStatusCode(err);
  const message = apiErrorMessage(err);

  if (statusCode === 403) {
    // Check if it's a quota exceeded error.
    if (message?.toLowerCase().includes("exceeded quota")) {
      reply.status(403).send({
        ok: false,
        error: "quota exceeded",
        ...(message && { details: message }),
      });
      return true;
    }
    // Generic 403.
    reply.status(403).send({
      ok: false,
      error: "forbidden by cluster",
      ...(message && { details: message }),
    });
    return true;
  }

  // 400 or 422 from the API (VAP or Pod Security).
  if (statusCode === 400 || statusCode === 422) {
    reply.status(422).send({
      ok: false,
      error: "rejected by cluster",
      ...(message && { details: message }),
    });
    return true;
  }

  // 409 (race with another request) — already wrapped in AppExistsError above.
  // If we see a bare 409 here, treat it as "app already exists".
  if (statusCode === 409) {
    reply.status(409).send({ ok: false, error: "app already exists" });
    return true;
  }

  // No status code or 5xx — cluster unreachable.
  reply.status(503).send({ ok: false, error: "cluster unreachable" });
  return true;
}
