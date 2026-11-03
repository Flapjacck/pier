import type { FastifyReply } from "fastify";
import { apiStatusCode } from "../../k8s/api-errors.js";
import {
  AppExistsError,
  CreateTimeoutError,
  HostInUseError,
} from "../../k8s/create-app.js";
import { mapClusterWriteError } from "./cluster-errors.js";

/**
 * Map a caught error from POST /apps (resource pre-check or createAppSerialized) to a response.
 * Always handles the error and returns true.
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

  // 409 (race with another request) — usually wrapped in AppExistsError above.
  // If we see a bare 409 here, treat it as "app already exists".
  if (apiStatusCode(err) === 409) {
    reply.status(409).send({ ok: false, error: "app already exists" });
    return true;
  }

  mapClusterWriteError(err, reply);
  return true;
}
