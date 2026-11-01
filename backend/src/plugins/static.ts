import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

/**
 * Resolve the public directory path. Exported for testing.
 * In production, import.meta.url is file:// to dist/index.js, so ../public is at /app/public.
 * In dev/tests, it may be different based on publicDirArg.
 */
export function resolvePublicDir(publicDirArg?: string): string {
  if (publicDirArg) {
    return path.resolve(publicDirArg);
  }
  // __filename is the bundled dist/index.js (or src/plugins/static.ts in dev).
  // ../public is one level above dist, which is /app/public in the container.
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "../public");
}

/**
 * Security headers applied to HTML responses (index.html and SPA fallback).
 * CSP: default-src 'self' blocks inline scripts; only assets from same origin allowed.
 * Script-src 'self' ensures only scripts from same origin run (no inline scripts).
 * Connect-src 'self' restricts API calls to same origin (backend API).
 */
const CSP_HEADER =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; " +
  "base-uri 'self'; form-action 'self'";

/**
 * Register the @fastify/static plugin to serve the public directory.
 * If the public directory or index.html is missing, logs info and skips registration.
 *
 * Serves:
 * - `/assets/*` (hashed, immutable): 1 year cache, gzip, no 404→200 fallback
 * - `index.html`: no-cache (always revalidate)
 * - SPA routes (`GET /apps/*`, `/workspaces/*`, etc.): 200 with index.html
 * - Other public files (illustrations, the theme script) get `public, max-age=3600`.
 * - Missing files: JSON 404 for API, plain 404 for other paths
 */
export async function setupStaticServing(
  app: FastifyInstance,
  publicDirArg?: string,
): Promise<void> {
  const publicDir = resolvePublicDir(publicDirArg);
  const indexPath = path.join(publicDir, "index.html");

  // If public dir or index.html is missing, skip registration (dev/test mode).
  if (!fs.existsSync(publicDir) || !fs.existsSync(indexPath)) {
    app.log.info("dashboard not bundled; API only");
    return;
  }

  // Read index.html once at registration; keep in memory for SPA fallback.
  const indexContent = fs.readFileSync(indexPath, "utf-8");

  // Register @fastify/static to serve public dir at root.
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    wildcard: false,
    index: false, // Disable auto-serving index.html; we handle it in setNotFoundHandler
    setHeaders: (res, filePath) => {
      const url = res.req.url?.split("?")[0] || "";

      // /assets/* (hashed, immutable): cache for 1 year.
      if (url.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
      // index.html: no-cache (always revalidate).
      else if (url === "/index.html") {
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Security-Policy", CSP_HEADER);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "same-origin");
      }
      // Other public files: 1 hour cache.
      else {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
    },
  });

  // Root-level notFoundHandler: routes to index.html or returns a proper 404.
  app.setNotFoundHandler(async (req, reply) => {
    const urlPath = req.url.split("?")[0] || "/";
    const method = req.method;

    // API paths: return JSON 404.
    if (urlPath === "/api" || urlPath.startsWith("/api/")) {
      return reply.status(404).send({
        ok: false,
        error: "not found",
      });
    }

    // GET or HEAD requests that accept HTML (SPA routes, fallback for missing files).
    const acceptsHtml = (req.headers.accept || "").includes("text/html");
    const isGetOrHead = method === "GET" || method === "HEAD";
    const hasNoExtension = !urlPath.includes(".") || urlPath.endsWith("/");

    if (isGetOrHead && (acceptsHtml || hasNoExtension)) {
      // Return index.html with SPA security headers and no-cache directive.
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Content-Security-Policy", CSP_HEADER);
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Referrer-Policy", "same-origin");
      reply.header("Cache-Control", "no-cache");

      return reply.send(indexContent);
    }

    // Everything else (e.g. missing /assets/foo.js, requests without Accept: text/html): 404.
    return reply.status(404).send("Not Found");
  });
}
