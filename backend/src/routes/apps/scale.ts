import type { FastifyPluginAsync } from "fastify";
import { scaleApp } from "../../k8s/app-actions.js";
import { isValidAppName } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";

type ScaleRouteDeps = {
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
    status: { type: "string" },
    createdAt: { type: "string" },
  },
  required: ["name", "image", "replicas", "ready", "status", "createdAt"],
} as const;

/** PATCH /apps/:name/scale — scale an app to a specific replica count. */
export function scaleAppRoutesWithDeps(deps: ScaleRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.patch<{ Params: { name: string }; Body: { replicas: number } }>(
      "/apps/:name/scale",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              replicas: { type: "integer", minimum: 0, maximum: 10 },
            },
            required: ["replicas"],
            additionalProperties: false,
          },
          response: {
            200: appSchema,
            400: errorSchema,
            401: errorSchema,
            404: errorSchema,
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

        const { name } = req.params;
        const { replicas } = req.body;

        if (!isValidAppName(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "name must match DNS-1035 pattern",
          });
        }

        try {
          const result = await scaleApp(
            deps.k8s.clients.apps,
            deps.namespace,
            name,
            replicas,
          );
          return reply.status(200).send(result);
        } catch (err) {
          if (err instanceof Error && err.message === "app not found") {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }
          req.log.error({ err }, "scale app failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
