import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifySession } from "./session.js";

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Compare two tokens using SHA-256 hashing and timingSafeEqual.
 * Prevents timing attacks by hashing both sides so length mismatches don't leak.
 */
export function tokensMatch(provided: string, configured: string): boolean {
  const configuredHash = createHash("sha256").update(configured).digest();
  const providedHash = createHash("sha256").update(provided).digest();

  try {
    return timingSafeEqual(configuredHash, providedHash);
  } catch (err) {
    // timingSafeEqual can throw if buffers are different lengths
    // (should not happen since both are SHA-256, but be defensive).
    if (err instanceof UnauthorizedError) {
      throw err;
    }
    return false;
  }
}

/**
 * Extract the path from a request URL, without the query string.
 */
function getPathFromUrl(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

/**
 * Extract the origin from an Origin or Referer header.
 * Returns the origin (scheme + host + port) or null if not present/invalid.
 */
function getOriginFromHeaders(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    return origin;
  }

  const referer = req.headers.referer;
  if (typeof referer === "string") {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Setup bearer token and session cookie authentication hook on a Fastify app.
 *
 * Public paths (no auth required):
 * - /health, /api/health
 * - POST /api/login (even with expired cookies)
 * - POST /api/logout (public, works with any/no cookie)
 *
 * With apiToken configured:
 * - Bearer token in Authorization header takes precedence.
 * - Cookie-authenticated requests require an Origin header check (CSRF protection).
 *
 * Without apiToken (dev on loopback):
 * - Mutating requests are rejected.
 * - GET requests are allowed (dev mode).
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

  // Register error handler for UnauthorizedError, ForbiddenError, and schema validation errors.
  app.setErrorHandler(async (err, _req, reply) => {
    if (err instanceof UnauthorizedError) {
      return reply.status(401).send({
        ok: false,
        error: "unauthorized",
      });
    }
    if (err instanceof ForbiddenError) {
      return reply.status(403).send({
        ok: false,
        error: "forbidden origin",
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
      // Extract and clean validation message from the first error.
      let details: string | undefined;
      if (errObj.validation && Array.isArray(errObj.validation)) {
        const firstError = errObj.validation[0];
        if (firstError && typeof firstError === "object") {
          const msg = (firstError as Record<string, unknown>).message;
          if (typeof msg === "string") {
            details = msg;
          }
        }
      }
      return reply.status(400).send({
        ok: false,
        error: "invalid request",
        ...(details && { details }),
      });
    }
    throw err;
  });

  // Register onRequest hook that runs before all handlers.
  app.addHook("onRequest", async (req) => {
    const path = getPathFromUrl(req.url);
    const method = req.method;

    // Public paths (no auth required).
    if (path === "/health" || path === "/api/health") {
      return;
    }
    if ((method === "POST" && path === "/api/login") || (method === "POST" && path === "/api/logout")) {
      return;
    }
    if (method === "GET" && path === "/api/session" && !apiToken) {
      // GET /api/session is public when auth is disabled (no token configured).
      return;
    }

    // Only enforce auth on /api/* paths. Anything else is unauthenticated (404 today, SPA later).
    if (!path.startsWith("/api/")) {
      return;
    }

    // Token is required for /api/* paths.
    // With no token configured (dev mode on loopback), reject all /api/* requests.
    if (!apiToken) {
      throw new UnauthorizedError();
    }

    // Token is configured. Try Authorization header first (Bearer token takes precedence).
    const authHeader = req.headers.authorization || "";
    if (authHeader) {
      const parts = authHeader.split(" ");

      // Validate header format: "Bearer <token>"
      if (parts.length !== 2 || parts[0] !== "Bearer") {
        throw new UnauthorizedError();
      }

      const providedToken = parts[1];
      if (!tokensMatch(providedToken, apiToken)) {
        throw new UnauthorizedError();
      }

      // Bearer token is valid; skip cookie and Origin checks.
      return;
    }

    // No Bearer token; try session cookie.
    const cookies = req.cookies || {};
    const sessionCookie = cookies.pier_session;

    if (!sessionCookie) {
      throw new UnauthorizedError();
    }

    // Verify the session cookie.
    const now = Date.now();
    if (!verifySession(apiToken, sessionCookie, now)) {
      throw new UnauthorizedError();
    }

    // Cookie is valid. For cookie-authenticated mutations, require Origin check (CSRF protection).
    const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(method);
    if (isMutating) {
      const origin = getOriginFromHeaders(req);
      const requestHost = req.headers.host;

      // Mutations with cookie auth must have a matching Origin or Referer header.
      if (!origin || !requestHost) {
        throw new ForbiddenError("forbidden origin");
      }

      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== requestHost) {
          throw new ForbiddenError("forbidden origin");
        }
      } catch (err) {
        if (err instanceof ForbiddenError) {
          throw err;
        }
        // Invalid URL format; reject the request.
        throw new ForbiddenError("forbidden origin");
      }
    }
  });
}
