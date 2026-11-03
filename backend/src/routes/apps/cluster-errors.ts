import type { FastifyReply } from "fastify";
import { apiErrorMessage, apiStatusCode } from "../../k8s/api-errors.js";
import { QuotaExceededError, ResourceLimitError } from "../../k8s/resource-fit.js";
import { InvalidResourcesError } from "../../k8s/update-app.js";

/**
 * Shared error mapping for routes that write to the cluster (POST /apps, PATCH /apps/:name):
 * resource pre-check errors, then API 403 (quota or forbidden), 400/422 (rejected), else 503.
 * Route-specific errors (404, 409, timeouts) must be handled before calling this.
 */
export function mapClusterWriteError(err: unknown, reply: FastifyReply): void {
  if (err instanceof InvalidResourcesError || err instanceof ResourceLimitError) {
    reply.status(400).send({ ok: false, error: "invalid request", details: err.message });
    return;
  }

  if (err instanceof QuotaExceededError) {
    reply.status(403).send({ ok: false, error: "quota exceeded", details: err.message });
    return;
  }

  const statusCode = apiStatusCode(err);
  const message = apiErrorMessage(err);

  if (statusCode === 403) {
    const quota = message?.toLowerCase().includes("exceeded quota");
    reply.status(403).send({
      ok: false,
      error: quota ? "quota exceeded" : "forbidden by cluster",
      ...(message && { details: message }),
    });
    return;
  }

  // 400 or 422 from the API (VAP, Pod Security, invalid patch).
  if (statusCode === 400 || statusCode === 422) {
    reply.status(422).send({
      ok: false,
      error: "rejected by cluster",
      ...(message && { details: message }),
    });
    return;
  }

  // No status code or 5xx — cluster unreachable.
  reply.status(503).send({ ok: false, error: "cluster unreachable" });
}
