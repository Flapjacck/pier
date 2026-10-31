import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildApp } from "../../src/app.js";
import { createFakeClientsResult } from "../helpers/fake-clients.js";
import { authHeader, TEST_TOKEN, testConfig } from "../helpers/test-config.js";
import { rateLimiter } from "../../src/routes/session.js";

const UNAUTHORIZED = { ok: false, error: "unauthorized" };
const AUTH_DISABLED = { ok: false, error: "auth disabled" };
const TOO_MANY_ATTEMPTS = { ok: false, error: "too many attempts" };

async function appWithClients(apiToken?: string) {
  return await buildApp(testConfig({ apiToken }), {
    logger: false,
    k8s: createFakeClientsResult({
      core: {
        listNode: async () => ({
          items: [{ status: { conditions: [{ type: "Ready", status: "True" }] } }],
        }),
        listNamespacedPod: async () => ({ items: [] }),
      } as never,
      version: { getCode: async () => ({ gitVersion: "v1.30.0+k3s1" }) } as never,
      apps: { listNamespacedDeployment: async () => ({ items: [] }) } as never,
      networking: { listNamespacedIngress: async () => ({ items: [] }) } as never,
    }),
  });
}

describe("POST /api/login", () => {
  beforeEach(() => {
    rateLimiter.clearAll();
  });

  it("returns 204 and sets pier_session cookie with correct token", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    await app.close();

    assert.equal(res.statusCode, 204);

    // Extract the Set-Cookie header.
    const setCookie = res.headers["set-cookie"];
    assert.ok(setCookie, "Set-Cookie header should be present");
    assert.ok(
      typeof setCookie === "string" && setCookie.includes("pier_session="),
      "Should set pier_session cookie",
    );
    assert.ok(setCookie.includes("HttpOnly"), "Cookie should have HttpOnly");
    assert.ok(setCookie.includes("SameSite=Strict"), "Cookie should have SameSite=Strict");
    assert.ok(setCookie.includes("Path=/api"), "Cookie should have Path=/api");
    assert.ok(setCookie.includes("Max-Age=604800"), "Cookie should have 7-day max age");
  });

  it("returns 400 when auth is disabled (no PIER_API_TOKEN)", async () => {
    const app = await appWithClients(undefined);
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: "any-token" },
    });
    await app.close();

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), AUTH_DISABLED);
  });

  it("returns 401 with wrong token", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: "wrong-token" },
    });
    await app.close();

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), UNAUTHORIZED);

    // No Set-Cookie header on failure.
    assert.ok(!res.headers["set-cookie"], "Should not set cookie on wrong token");
  });

  it("enforces rate limit: 6th failure within 60s returns 429", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Try 6 failed logins quickly (same IP context within one app instance).
    for (let i = 1; i <= 6; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { token: "wrong-token" },
      });

      if (i < 6) {
        // First 5 failures should return 401.
        assert.equal(res.statusCode, 401, `attempt ${i}`);
      } else {
        // 6th should be rate limited.
        assert.equal(res.statusCode, 429, `attempt ${i}`);
        assert.deepEqual(res.json(), TOO_MANY_ATTEMPTS);
      }
    }

    await app.close();
  });

  it("clears rate limit on successful login", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Fail once.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: "wrong-token" },
    });
    assert.equal(res.statusCode, 401);

    // Succeed with the correct token.
    res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    // The rate limit should be cleared, so we can try wrong tokens again.
    res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: "wrong-token" },
    });
    assert.equal(res.statusCode, 401);

    await app.close();
  });

  it("rejects invalid request body", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: "valid", extraField: "not allowed" },
    });
    await app.close();

    // Should reject due to additionalProperties: false.
    assert.equal(res.statusCode, 400);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid request");
  });

  it("rejects missing token field", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: {},
    });
    await app.close();

    assert.equal(res.statusCode, 400);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid request");
  });
});

describe("POST /api/logout", () => {
  it("returns 204 and clears the session cookie", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/logout",
    });
    await app.close();

    assert.equal(res.statusCode, 204);

    // Should have a Set-Cookie header with Max-Age=0 to clear the cookie.
    const setCookie = res.headers["set-cookie"];
    assert.ok(setCookie, "Set-Cookie header should be present");
    assert.ok(
      typeof setCookie === "string" && setCookie.includes("pier_session="),
      "Should clear pier_session cookie",
    );
    assert.ok(setCookie.includes("Max-Age=0"), "Cookie should have Max-Age=0 to clear");
  });

  it("returns 204 even without any cookie", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/logout",
    });
    await app.close();

    assert.equal(res.statusCode, 204);
  });
});

describe("GET /api/session", () => {
  it("returns 200 with authDisabled:false when authed with bearer token", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: authHeader,
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; authDisabled: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.authDisabled, false);
  });

  it("returns 200 with authDisabled:false when authed with session cookie", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // First, login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue, "Should extract cookie from Set-Cookie header");

    // Now call /api/session with the cookie.
    res = await app.inject({
      method: "GET",
      url: "/api/session",
      cookies: { pier_session: cookieValue },
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; authDisabled: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.authDisabled, false);
  });

  it("returns 200 with authDisabled:true when no token is configured", async () => {
    const app = await appWithClients(undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/session",
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; authDisabled: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.authDisabled, true);
  });

  it("returns 401 when not authenticated (no bearer, no valid cookie)", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/api/session",
    });
    await app.close();

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), UNAUTHORIZED);
  });
});

describe("cookie authentication on routes", () => {
  it("allows GET /api/apps with a valid session cookie", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue);

    // Call GET /api/apps with the cookie.
    res = await app.inject({
      method: "GET",
      url: "/api/apps",
      cookies: { pier_session: cookieValue },
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });

  it("rejects POST with cookie but no Origin header (CSRF protection)", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue);

    // Try POST /api/logout (public endpoint, but POST with cookie) without Origin.
    // Actually, /api/logout is public so it doesn't require auth; let's use a different endpoint.
    // We need an endpoint that requires auth and allows POST. Let's use /api/apps for this test.

    // POST /api/apps with cookie but no Origin should fail with 403.
    res = await app.inject({
      method: "POST",
      url: "/api/apps",
      cookies: { pier_session: cookieValue },
      payload: { name: "test", image: "test:1.0", port: 80 },
    });
    await app.close();

    assert.equal(res.statusCode, 403);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.error, "forbidden origin");
  });

  it("allows POST with cookie and matching Origin header", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue);

    // POST with matching Origin should work (or fail with 503 from fake k8s, but not 403).
    res = await app.inject({
      method: "POST",
      url: "/api/apps",
      cookies: { pier_session: cookieValue },
      headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
      payload: { name: "test", image: "test:1.0", port: 80 },
    });
    await app.close();

    // Should not be 403 (forbidden origin); it might be 400, 503, or success depending on validation.
    // The important thing is it got past the origin check.
    assert.notEqual(res.statusCode, 403);
  });

  it("rejects POST with cookie and mismatched Origin header", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue);

    // POST with mismatched Origin should fail with 403.
    res = await app.inject({
      method: "POST",
      url: "/api/apps",
      cookies: { pier_session: cookieValue },
      headers: { origin: "http://attacker.com" },
      payload: { name: "test", image: "test:1.0", port: 80 },
    });
    await app.close();

    assert.equal(res.statusCode, 403);
    const body = res.json() as { ok: boolean; error: string };
    assert.equal(body.error, "forbidden origin");
  });
});

describe("bearer token still works (doesn't require Origin)", () => {
  it("allows POST with bearer token and no Origin", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: authHeader,
      payload: { name: "test", image: "test:1.0", port: 80 },
    });
    await app.close();

    // Should not be 403 (that would only happen with cookie + no origin).
    assert.notEqual(res.statusCode, 403);
  });

  it("rejects bearer token if wrong, even with valid cookie present", async () => {
    const app = await appWithClients(TEST_TOKEN);

    // Login to get a session cookie.
    let res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { token: TEST_TOKEN },
    });
    assert.equal(res.statusCode, 204);

    const setCookie = res.headers["set-cookie"] as string;
    const cookieValue = setCookie.split(";")[0]?.split("=")[1];
    assert.ok(cookieValue);

    // POST with wrong bearer and valid cookie should still fail (bearer takes precedence).
    res = await app.inject({
      method: "GET",
      url: "/api/apps",
      headers: { authorization: "Bearer wrong-token" },
      cookies: { pier_session: cookieValue },
    });
    await app.close();

    assert.equal(res.statusCode, 401);
  });
});

describe("public endpoints", () => {
  it("allows /health without auth", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
  });

  it("allows /api/health without auth", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    await app.close();

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, service: "pier-backend" });
  });

  it("returns 404 for /apps (without /api prefix)", async () => {
    const app = await appWithClients(TEST_TOKEN);
    const res = await app.inject({
      method: "GET",
      url: "/apps",
      headers: authHeader,
    });
    await app.close();

    assert.equal(res.statusCode, 404);
  });
});
