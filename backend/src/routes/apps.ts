import type { FastifyPluginAsync } from "fastify";
import { listApps } from "../k8s/apps.js";
import type { K8sClientsResult } from "../k8s/clients.js";

type AppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

const appSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    image: { type: "string" },
    replicas: { type: "number" },
    ready: { type: "number" },
    status: {
      type: "string",
      enum: ["running", "stopped", "building", "failed"],
    },
    createdAt: { type: "string" },
  },
  required: ["name", "image", "replicas", "ready", "status", "createdAt"],
} as const;

/** Factory keeps GET /apps testable without a live cluster. */
export function appsRoutesWithDeps(deps: AppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    /** Pier-managed Deployments in PIER_NAMESPACE (label pier.app). */
    app.get(
      "/apps",
      {
        schema: {
          response: {
            200: {
              type: "array",
              items: appSchema,
            },
            503: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                error: { type: "string" },
              },
              required: ["ok", "error"],
            },
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

        try {
          return await listApps(deps.k8s.clients.apps, deps.namespace);
        } catch (err) {
          req.log.error({ err }, "list apps failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
