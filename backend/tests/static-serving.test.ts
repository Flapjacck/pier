import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { authHeader, testConfig } from "./helpers/test-config.js";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pier-static-"));
after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

/**
 * Create a minimal public directory for testing with index.html and assets.
 */
function setupPublicDir(): string {
  const publicDir = path.join(tempDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });

  fs.writeFileSync(
    path.join(publicDir, "index.html"),
    "<!DOCTYPE html><html><body>Index</body></html>",
  );

  fs.writeFileSync(path.join(publicDir, "assets", "app-abc123.js"), "console.log('app');");

  fs.writeFileSync(path.join(publicDir, "theme-init.js"), "(function() { console.log('theme'); })();");

  return publicDir;
}

describe("static serving", () => {
  it("serves / with index.html and SPA cache headers", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({ method: "GET", url: "/", headers: authHeader });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
    assert.ok(res.payload.includes("Index"));
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.ok(res.headers["content-security-policy"]?.includes("default-src 'self'"));
    assert.ok(res.headers["x-content-type-options"], "nosniff");
    assert.ok(res.headers["referrer-policy"], "same-origin");

    await app.close();
  });

  it("serves SPA routes (e.g. /apps/hello) with index.html", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello",
      headers: { ...authHeader, accept: "text/html" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
    assert.ok(res.payload.includes("Index"));
    assert.equal(res.headers["cache-control"], "no-cache");

    await app.close();
  });

  it("serves /apps/hello/logs with index.html (deep SPA route)", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/apps/hello/logs",
      headers: { ...authHeader, accept: "text/html" },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes("Index"));

    await app.close();
  });

  it("serves /assets/* with immutable cache headers", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/assets/app-abc123.js",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes("console.log"));
    assert.equal(res.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(res.headers["x-content-type-options"], "nosniff");

    await app.close();
  });

  it("returns 404 for missing /assets/missing.js", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/assets/missing.js",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers["content-type"], "text/plain; charset=utf-8");
    assert.ok(res.payload.includes("Not Found"));

    await app.close();
  });

  it("returns JSON 404 for /api/nope (with auth)", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/api/nope",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { ok: false, error: "not found" });

    await app.close();
  });

  it("serves /health without authentication", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { ok: boolean; service?: string };
    assert.equal(json.ok, true);

    await app.close();
  });

  it("returns 404 when public dir is missing (API only)", async () => {
    const app = await buildApp(testConfig(), { logger: false });

    const res = await app.inject({ method: "GET", url: "/" });
    assert.equal(res.statusCode, 404);

    const apiRes = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(apiRes.statusCode, 200);

    await app.close();
  });

  it("serves public files with 1-hour cache", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({
      method: "GET",
      url: "/theme-init.js",
      headers: authHeader,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "public, max-age=3600");
    assert.equal(res.headers["x-content-type-options"], "nosniff");

    await app.close();
  });

  it("returns CSP header on index.html", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({ method: "GET", url: "/" });
    const csp = res.headers["content-security-policy"] as string;
    assert.ok(csp);
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("connect-src 'self'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));

    await app.close();
  });

  it("serves HEAD request for /", async () => {
    const publicDir = setupPublicDir();
    const app = await buildApp(testConfig(), { logger: false, publicDir });

    const res = await app.inject({ method: "HEAD", url: "/" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");

    await app.close();
  });
});
