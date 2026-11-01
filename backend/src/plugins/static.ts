import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

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
 * - Other public files: 1 hour cache
 * - Missing files: JSON 404 for API, plain 404 for other paths
 */
export async function setupStaticServing(
  app: FastifyInstance,
  publicDirArg?: string,
): Promise<void> {
  // Resolve the public directory to an absolute path.
  // Default: ../public from the dist dir (production).
  let publicDir: string;
  if (publicDirArg) {
    publicDir = path.resolve(publicDirArg);
  } else {
    // __dirname is dist/ in production; ../public is at repo root/public.
    publicDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../public");
  }

  const indexPath = path.join(publicDir, "index.html");

  // If public dir or index.html is missing, skip registration (dev/test mode).
  if (!fs.existsSync(publicDir) || !fs.existsSync(indexPath)) {
    app.log.info("dashboard not bundled; API only");
    return;
  }

  // Register @fastify/static to serve public dir at root.
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    wildcard: false,
    index: false, // Disable auto-serving index.html; we handle it in setNotFoundHandler
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
      const indexContent = fs.readFileSync(indexPath, "utf-8");

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

  // Hook: add cache headers to static assets before sending.
  app.addHook("onSend", async (req, reply) => {
    const urlPath = req.url.split("?")[0] || "/";

    // /assets/* (hashed, immutable): cache for 1 year.
    if (urlPath.startsWith("/assets/")) {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      reply.header("X-Content-Type-Options", "nosniff");
    }
    // index.html: already set in notFoundHandler, but ensure it here too.
    else if (urlPath === "/" || urlPath === "/index.html") {
      reply.header("Cache-Control", "no-cache");
    }
    // Other public files (illustrations, favicons, theme-init.js): 1 hour cache.
    else if (fs.existsSync(path.join(publicDir, urlPath))) {
      reply.header("Cache-Control", "public, max-age=3600");
      reply.header("X-Content-Type-Options", "nosniff");
    }
  });
}
