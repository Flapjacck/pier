import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { createSession } from "../plugins/session.js";
import { tokensMatch } from "../plugins/auth.js";

type SessionRouteDeps = {
  apiToken: string | undefined;
  ingressDomain: string | undefined;
};

/**
 * In-memory rate limiter for login attempts.
 * Tracks failed attempts per IP address, resetting after the window passes.
 */
class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Check if an IP has exceeded the rate limit.
   * After 5 failures within 60s, return true (rate limited).
   */
  isLimited(ip: string, now: number): boolean {
    const entry = this.attempts.get(ip);

    // No previous attempts or window has passed.
    if (!entry || now > entry.resetTime) {
      return false;
    }

    // Still within the window.
    return entry.count >= 5;
  }

  /**
   * Record a failed login attempt for an IP.
   */
  recordFailure(ip: string, now: number): void {
    const entry = this.attempts.get(ip);

    if (!entry || now > entry.resetTime) {
      // Start a new 60-second window.
      this.attempts.set(ip, { count: 1, resetTime: now + 60_000 });
    } else {
      // Increment within the existing window.
      entry.count += 1;
    }
  }

  /**
   * Clear a successful login attempt for an IP.
   */
  clearEntry(ip: string): void {
    this.attempts.delete(ip);
  }

  /**
   * Clear all entries (for testing).
   */
  clearAll(): void {
    this.attempts.clear();
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Extract the client IP from the request.
 * If trustProxy is enabled, respects X-Forwarded-For header from one proxy hop (Traefik).
 * Otherwise, uses req.ip directly (local development or direct connection).
 */
function getClientIp(req: FastifyRequest): string {
  return req.ip ?? "unknown";
}

/**
 * Set the pier_session cookie in the response.
 */
function setSessionCookie(
  reply: FastifyReply,
  sessionValue: string,
  req: FastifyRequest,
): void {
  const isSecure = req.protocol === "https";

  reply.setCookie("pier_session", sessionValue, {
    httpOnly: true,
    sameSite: "strict",
    path: "/api",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    secure: isSecure,
  });
}

/**
 * Clear the pier_session cookie in the response.
 */
function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie("pier_session", {
    httpOnly: true,
    sameSite: "strict",
    path: "/api",
  });
}

export function sessionRoutesWithDeps(deps: SessionRouteDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * POST /api/login — authenticate with the API token to obtain a session cookie.
     *
     * Request body: { token: string (1-512 chars) }
     *
     * Responses:
     * - 204 No Content: correct token, cookie set
     * - 400: auth disabled (no PIER_API_TOKEN configured)
     * - 401: incorrect token
     * - 429: rate limited (too many failures)
     */
    app.post<{ Body: { token?: unknown } }>(
      "/login",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              token: { type: "string", minLength: 1, maxLength: 512 },
            },
            required: ["token"],
            additionalProperties: false,
          },
        },
      },
      async (req, reply) => {
        // Check if auth is disabled.
        if (!deps.apiToken) {
          return reply.status(400).send({
            ok: false,
            error: "auth disabled",
          });
        }

        const clientIp = getClientIp(req);
        const now = Date.now();

        // Check rate limit.
        if (rateLimiter.isLimited(clientIp, now)) {
          return reply.status(429).send({
            ok: false,
            error: "too many attempts",
          });
        }

        // Extract and validate the provided token.
        const providedToken = (req.body as { token?: unknown }).token;
        if (typeof providedToken !== "string") {
          rateLimiter.recordFailure(clientIp, now);
          return reply.status(401).send({
            ok: false,
            error: "unauthorized",
          });
        }

        // Compare tokens (timing-safe).
        if (!tokensMatch(providedToken, deps.apiToken)) {
          rateLimiter.recordFailure(clientIp, now);
          return reply.status(401).send({
            ok: false,
            error: "unauthorized",
          });
        }

        // Token is correct; create and set the session cookie.
        const sessionValue = createSession(deps.apiToken, now);
        setSessionCookie(reply, sessionValue, req);

        // Clear any rate limit entry on successful login.
        rateLimiter.clearEntry(clientIp);

        return reply.status(204).send();
      },
    );

    /**
     * POST /api/logout — clear the session cookie.
     *
     * This is a public endpoint that works with any or no cookie.
     * Always returns 204.
     */
    app.post("/logout", async (_req, reply) => {
      clearSessionCookie(reply);
      return reply.status(204).send();
    });

    /**
     * GET /api/session — get the current session status and ingress domain.
     *
     * Requires authentication (bearer or cookie).
     *
     * Responses:
     * - 200: authenticated or auth disabled
     *   { ok: true, authDisabled: boolean, ingressDomain: string | null }
     * - 401: not authenticated
     */
    app.get("/session", async (_req, reply) => {
      return reply.status(200).send({
        ok: true,
        authDisabled: !deps.apiToken,
        ingressDomain: deps.ingressDomain ?? null,
      });
    });
  };
}
