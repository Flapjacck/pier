import type { FastifyPluginAsync } from "fastify";
import { getLiveApp } from "../../k8s/app-lookup.js";
import { listAppPods } from "../../k8s/app-pods.js";
import { isValidAppName } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";

type PodsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

const appPodSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    phase: { type: "string" },
    ready: { type: "boolean" },
    readyContainers: { type: "string" },
    restarts: { type: "number" },
    node: { type: "string" },
    startedAt: { type: "string" },
    waitingReason: { type: "string" },
    lastTerminationReason: { type: "string" },
  },
  required: ["name", "phase", "ready", "readyContainers", "restarts"],
} as const;

/** GET /apps/:name/pods — list pods for a specific app. */
export function getAppPodsRoutesWithDeps(deps: PodsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { name: string } }>(
      "/apps/:name/pods",
      {
        schema: {
          response: {
            200: {
              type: "array",
              items: appPodSchema,
            },
            400: errorSchema,
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
          });
        }

        try {
          // Check if app exists before listing pods.
          const live = await getLiveApp(deps.k8s.clients.apps, deps.namespace, name);
          if (!live) {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }

          // List pods for this app (may be empty if scaled to 0).
          const pods = await listAppPods(deps.k8s.clients.core, deps.namespace, name);
          return reply.status(200).send(pods);
        } catch (err) {
          req.log.error({ err }, "list app pods failed");
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
