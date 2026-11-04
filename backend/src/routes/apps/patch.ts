import type { FastifyPluginAsync } from "fastify";
import type { DeployTracker } from "../../deploys/tracker.js";
import { recordDeployError, specFromApp, specFromPatch, withDeploymentId } from "./deploy-hooks.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { isValidAppName } from "../../k8s/names.js";
import { AppNotFoundError, updateApp } from "../../k8s/update-app.js";
import { appSchema, errorSchema, patchAppBodySchema, type PatchAppBody } from "../apps-schemas.js";
import { mapClusterWriteError } from "./cluster-errors.js";
import { mapVolumeError } from "../volume-errors.js";

type PatchAppRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  /** Records the change as a deploy (#81). */
  tracker?: DeployTracker;
};

/**
 * PATCH /apps/:name — change an app's image, port, env, replicas and/or CPU/RAM.
 * Fields left out stay as they are; env replaces the whole set; resources merge onto the
 * current values. Resources are checked against the namespace LimitRange and ResourceQuota
 * first, because the cluster only enforces those when pods are created.
 */
export function patchAppRoutesWithDeps(deps: PatchAppRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.patch<{ Params: { name: string }; Body: PatchAppBody }>(
      "/apps/:name",
      {
        schema: {
          body: patchAppBodySchema,
          response: {
            200: appSchema,
            400: errorSchema,
            401: errorSchema,
            403: errorSchema,
            404: errorSchema,
            422: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }

        const { name } = req.params;
        if (!isValidAppName(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "name must match DNS-1035 pattern",
          });
        }

        const deploy = deps.tracker?.begin(name, "patch", specFromPatch(req.body)) ?? null;
        try {
          const updated = await updateApp(deps.k8s.clients, deps.namespace, name, req.body, req.log);
          deploy?.applied(specFromApp(updated));
          return reply.status(200).send(withDeploymentId(updated, deploy));
        } catch (err) {
          recordDeployError(deploy, err);
          if (err instanceof AppNotFoundError) {
            return reply.status(404).send({ ok: false, error: "app not found" });
          }
          if (mapVolumeError(err, reply)) return;
          req.log.error({ err }, "update app failed");
          mapClusterWriteError(err, reply);
          return;
        }
      },
    );
  };
}
