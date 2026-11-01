import type { FastifyPluginAsync } from "fastify";
import { createAppSeralized } from "../../k8s/create-app.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import {
  appSchema,
  errorSchema,
  errorWithDetailsSchema,
  postAppsBodySchema,
  type PostAppsBody,
} from "../apps-schemas.js";
import { mapPostAppsError } from "./post-errors.js";

type PostAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
  dashboardHost: string | undefined;
};

/** POST /apps — create a new Deployment, Service, and optionally Ingress. */
export function postAppsRoutesWithDeps(deps: PostAppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: PostAppsBody }>(
      "/apps",
      {
        schema: {
          body: postAppsBodySchema,
          response: {
            201: appSchema,
            400: errorWithDetailsSchema,
            401: errorSchema,
            403: errorWithDetailsSchema,
            409: errorSchema,
            422: errorWithDetailsSchema,
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

        const { name, image, port, replicas, host, env } = req.body;

        // Normalize host to lowercase (case-insensitive matching in Ingress rules).
        const hostNorm = host?.toLowerCase();

        // Check if host conflicts with dashboard host (reserved).
        if (hostNorm && deps.dashboardHost && hostNorm === deps.dashboardHost) {
          return reply.status(409).send({
            ok: false,
            error: "host already in use",
          });
        }

        // Validate host if provided (DNS-1123, wildcard, ingress config, suffix).
        if (hostNorm) {
          // Reject wildcards.
          if (hostNorm.includes("*")) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "host cannot contain wildcards",
            });
          }

          // Validate DNS-1123 format.
          const dnsPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
          if (!dnsPattern.test(hostNorm)) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: "host must be a valid DNS-1123 hostname (e.g., hello.192.0.2.10.nip.io)",
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
          if (!hostNorm.endsWith(suffix) || hostNorm === deps.ingressDomain) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
              details: `host must end with ${suffix}`,
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
              host: hostNorm,
              env,
            },
            req.log,
          );
          return reply.status(201).send(app);
        } catch (err) {
          req.log.error({ err }, "create app failed");
          mapPostAppsError(err, reply);
          return;
        }
      },
    );
  };
}
