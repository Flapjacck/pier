import type { FastifyPluginAsync } from "fastify";
import { createAppSeralized, AppExistsError, HostInUseError } from "../../k8s/create-app.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import {
  appSchema,
  errorSchema,
  errorWithDetailsSchema,
  type PostAppsBody,
} from "../apps-schemas.js";

type PostAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
};

/** POST /apps — create a new Deployment, Service, and optionally Ingress. */
export function postAppsRoutesWithDeps(deps: PostAppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: PostAppsBody }>(
      "/apps",
      {
        schema: {
          response: {
            201: appSchema,
            400: errorWithDetailsSchema,
            401: errorSchema,
            409: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }

        const { name, image, port, replicas = 1, host, env } = req.body;

        // Validate required fields and types.
        if (typeof name !== "string" || typeof image !== "string" || typeof port !== "number") {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "name, image, and port are required",
          });
        }

        // Validate name: DNS-1035 (must start with letter).
        const namePattern = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;
        if (!namePattern.test(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details:
              "name must start with a letter, contain only lowercase letters/digits/hyphens, and end with a letter or digit",
          });
        }

        // Validate image: non-empty, no whitespace.
        if (image.length === 0 || image.length > 255 || /\s/.test(image)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "image must be 1–255 characters with no whitespace",
          });
        }

        // Validate port.
        if (port < 1 || port > 65535 || !Number.isInteger(port)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "port must be an integer between 1 and 65535",
          });
        }

        // Validate replicas.
        if (replicas < 0 || replicas > 10 || !Number.isInteger(replicas)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "replicas must be an integer between 0 and 10",
          });
        }

        // Validate host if provided.
        if (host) {
          if (host.length > 253) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "host must be ≤253 characters",
            });
          }

          const hostLower = host.toLowerCase();

          // Reject wildcards (DNS-1123 compliant hosts only, no pattern matches)
          if (hostLower.includes("*")) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "host cannot contain wildcards",
            });
          }

          // Validate DNS-1123 format: labels [a-z0-9]([a-z0-9-]{0,61}[a-z0-9])? separated by dots
          const dnsPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
          if (!dnsPattern.test(hostLower)) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "host must be a valid DNS-1123 hostname (e.g., hello.example.com)",
            });
          }

          if (!deps.ingressDomain) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "ingress not configured",
            });
          }

          // Host must end with .<domain>, not equal to it.
          const suffix = `.${deps.ingressDomain}`;
          if (!hostLower.endsWith(suffix) || hostLower === deps.ingressDomain) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: `host must end with ${suffix}`,
            });
          }
        }

        // Validate env if provided.
        if (env) {
          const envKeys = Object.keys(env);
          if (envKeys.length > 50) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "env must have ≤50 keys",
            });
          }
          const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
          for (const key of envKeys) {
            if (!envKeyPattern.test(key)) {
              return reply.status(400).send({
                ok: false,
                error: "invalid request",
                details: `env key "${key}" must start with a letter or underscore, and contain only letters, digits, and underscores`,
              });
            }
            const value = env[key];
            if (typeof value !== "string" || value.length > 4096) {
              return reply.status(400).send({
                ok: false,
                error: "invalid request",
                details: `env value for "${key}" must be a string ≤4096 characters`,
              });
            }
          }
        }

        // Check for extra properties (not in expected schema).
        const allowedKeys = new Set(["name", "image", "port", "replicas", "host", "env"]);
        const bodyKeys = Object.keys(req.body);
        for (const key of bodyKeys) {
          if (!allowedKeys.has(key)) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: `unexpected property "${key}"`,
            });
          }
        }

        try {
          const app = await createAppSeralized(
            deps.k8s.clients,
            deps.namespace,
            {
              name,
              image,
              port,
              replicas,
              host,
              env,
            },
            req.log,
          );
          return reply.status(201).send(app);
        } catch (err) {
          if (err instanceof AppExistsError) {
            return reply.status(409).send({
              ok: false,
              error: "app already exists",
            });
          }
          if (err instanceof HostInUseError) {
            return reply.status(409).send({
              ok: false,
              error: "host already in use",
            });
          }
          req.log.error({ err }, "create app failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
