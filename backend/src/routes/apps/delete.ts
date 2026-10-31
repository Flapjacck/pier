import type { FastifyPluginAsync } from "fastify";
import { deleteApp } from "../../k8s/app-actions.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
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

        // Validate app name (DNS-1035).
        const namePattern = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;
        if (!namePattern.test(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "name must match DNS-1035 pattern",
          });
        }

        try {
          // Check if app exists first (including if terminating).
          const existing = await deps.k8s.clients.apps.readNamespacedDeployment({
            namespace: deps.namespace,
            name,
          });

          // If already terminating, treat as gone.
          if (existing.metadata?.deletionTimestamp) {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }

          await deleteApp(deps.k8s.clients, deps.namespace, name);
          return reply.status(204).send();
        } catch (err) {
          // 404 means app doesn't exist.
          if (
            err instanceof Error &&
            ("statusCode" in err || "code" in err)
          ) {
            const code = ("statusCode" in err)
              ? (err as Record<string, unknown>).statusCode
              : (err as Record<string, unknown>).code;
            if (code === 404) {
              return reply.status(404).send({
                ok: false,
                error: "app not found",
              });
            }
          }
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
