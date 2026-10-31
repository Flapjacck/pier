import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Setup bearer token authentication hook on a Fastify app.
 *
 * If apiToken is set, all routes except /health require Authorization: Bearer <token>.
 * Token comparison uses SHA-256 hashing and timingSafeEqual to prevent timing attacks.
 * If apiToken is unset (dev on loopback), all routes are allowed (warning logged at startup).
 *
 * Must be called before registering routes so the hook applies to all route handlers.
 */
export function setupAuth(app: FastifyInstance, apiToken: string | undefined): void {
  // Log a startup warning if running without token on loopback (dev mode).
  if (!apiToken) {
    app.log.warn(
      "auth disabled: PIER_API_TOKEN not set (loopback only)",
    );
  }

  // Register error handler for UnauthorizedError and schema validation errors.
  app.setErrorHandler(async (err, _req, reply) => {
    if (err instanceof UnauthorizedError) {
      return reply.status(401).send({
        ok: false,
        error: "unauthorized",
      });
    }
    // Handle schema validation errors (querystring, body, params).
    // These can come from AJV validation with different error structures.
    const errObj = err as unknown as Record<string, unknown>;
    if (
      err instanceof Error &&
      errObj.statusCode === 400 &&
      (errObj.validation || errObj.ajv)
    ) {
      return reply.status(400).send({
        ok: false,
        error: "invalid request",
      });
    }
    throw err;
  });

  // Register onRequest hook that runs before all handlers.
  app.addHook("onRequest", async (req) => {
    // /health is always public (k8s probes).
    if (req.url === "/health") {
      return;
    }

    // Mutating endpoints (POST, PUT, DELETE, PATCH) always require authentication,
    // even on loopback. These are control-plane operations that use the backend's
    // Kubernetes credentials, so they must never bypass auth.
    const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
    if (isMutating && !apiToken) {
      throw new UnauthorizedError();
    }

    // Read-only endpoints (GET, HEAD, OPTIONS) can skip auth on loopback (dev mode).
    // If no token is configured, allow the request (dev mode on loopback).
    if (!apiToken) {
      return;
    }

    // Token is configured; extract Bearer token from Authorization header.
    const authHeader = req.headers.authorization || "";
    const parts = authHeader.split(" ");

    // Validate header format: "Bearer <token>"
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UnauthorizedError();
    }

    const providedToken = parts[1];

    // Compare tokens using SHA-256 hashing + timingSafeEqual to prevent timing leaks.
    // Hash both sides so length mismatches don't throw or leak.
    const configuredHash = createHash("sha256").update(apiToken).digest();
    const providedHash = createHash("sha256").update(providedToken).digest();

    try {
      if (!timingSafeEqual(configuredHash, providedHash)) {
        throw new UnauthorizedError();
      }
    } catch (err) {
      // timingSafeEqual can throw if buffers are different lengths
      // (should not happen since both are SHA-256, but be defensive).
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError();
    }
  });
}
