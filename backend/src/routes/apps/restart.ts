import type { FastifyPluginAsync } from "fastify";
import { restartApp } from "../../k8s/app-actions.js";
import { isValidAppName } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";

type RestartRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

const restartResponseSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    restartedAt: { type: "string" },
  },
  required: ["ok", "restartedAt"],
} as const;

/** POST /apps/:name/restart — restart an app by triggering a pod rollout. */
export function restartAppRoutesWithDeps(deps: RestartRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { name: string } }>(
      "/apps/:name/restart",
      {
        schema: {
          response: {
            202: restartResponseSchema,
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

        if (!isValidAppName(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "name must match DNS-1035 pattern",
          });
        }

        try {
          const result = await restartApp(
            deps.k8s.clients.apps,
            deps.namespace,
            name,
          );
          return reply.status(202).send({
            ok: true,
            ...result,
          });
        } catch (err) {
          if (err instanceof Error && err.message === "app not found") {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }
          req.log.error({ err }, "restart app failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
