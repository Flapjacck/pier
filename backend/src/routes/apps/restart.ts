import type { FastifyPluginAsync } from "fastify";
import { restartApp } from "../../k8s/app-actions.js";
import { isValidAppName } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { getApp } from "../../k8s/app-lookup.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import type { DeploySpec } from "../../deploys/types.js";
import { errorSchema } from "../apps-schemas.js";
import { recordDeployError, specFromApp, withDeploymentId } from "./deploy-hooks.js";

type RestartRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  /** Records the restart as a deploy (#81). */
  tracker?: DeployTracker;
};

const restartResponseSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    restartedAt: { type: "string" },
    deploymentId: { type: "integer" },
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

        const deploy = deps.tracker?.begin(name, "restart", {}) ?? null;
        try {
          const result = await restartApp(
            deps.k8s.clients.apps,
            deps.namespace,
            name,
          );
          deploy?.applied(await restartSpec(deps, name));
          return reply.status(202).send(withDeploymentId({ ok: true, ...result }, deploy));
        } catch (err) {
          recordDeployError(deploy, err);
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

/** What the restarted app runs, for the deploy record; empty when it cannot be read. */
async function restartSpec(deps: RestartRouteDeps, name: string): Promise<DeploySpec> {
  if (!deps.tracker || !deps.k8s.ok) return {};
  try {
    const app = await getApp(deps.k8s.clients, deps.namespace, name);
    return app ? specFromApp(app) : {};
  } catch {
    return {};
  }
}
