import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { deleteAppSource } from "../../db/app-sources.js";
import { deleteApp } from "../../k8s/app-actions.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { isValidAppName } from "../../k8s/names.js";
import { errorSchema } from "../apps-schemas.js";
import type { DeployTracker } from "../../deploys/tracker.js";

type DeleteRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  /** Cancels the app's running deploys (#81). */
  tracker?: DeployTracker;
  /** Git sources (#83): deleting the app forgets its source and stops its build. */
  db?: DatabaseSync;
};

/** DELETE /apps/:name — delete an app (Deployment, Service, and Ingress). */
export function deleteAppRoutesWithDeps(deps: DeleteRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.delete<{ Params: { name: string }; Querystring: { deleteVolumes?: boolean } }>(
      "/apps/:name",
      {
        schema: {
          querystring: {
            type: "object",
            properties: { deleteVolumes: { type: "boolean", default: false } },
            additionalProperties: false,
          },
          response: {
            204: {
              type: "null",
            },
            200: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                dataRetained: { type: "boolean" },
                volumeErrors: { type: "array", items: { type: "string" } },
              },
              required: ["ok", "dataRetained", "volumeErrors"],
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
          const result = await deleteApp(deps.k8s.clients, deps.namespace, name, req.query.deleteVolumes === true, req.log);
          // Cancelling the deploy also stops a running build (its Job is deleted).
          const hadSource = deps.db ? deleteAppSource(deps.db, name) : false;
          if (result.deleted.length === 0 && !hadSource) {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }
          deps.tracker?.cancelApp(name, "The app was deleted.");
          if (req.query.deleteVolumes) {
            return reply.status(200).send({
              ok: true,
              dataRetained: result.dataRetained,
              volumeErrors: result.volumeErrors,
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
