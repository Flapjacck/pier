import type { FastifyPluginAsync } from "fastify";
import { deleteApp } from "../../k8s/app-actions.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { isValidAppName } from "../../k8s/names.js";
import { errorSchema } from "../apps-schemas.js";

type DeleteRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

/** DELETE /apps/:name — delete an app (Deployment, Service, and Ingress). */
export function deleteAppRoutesWithDeps(deps: DeleteRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.delete<{ Params: { name: string } }>(
      "/apps/:name",
      {
        schema: {
          response: {
            204: {
              type: "null",
            },
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
          const result = await deleteApp(deps.k8s.clients, deps.namespace, name);
          if (result.deleted.length === 0) {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }
          return reply.status(204).send();
        } catch (err) {
          req.log.error({ err }, "delete app failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
