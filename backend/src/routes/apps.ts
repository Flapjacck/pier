import type { FastifyPluginAsync } from "fastify";
import * as k8s from "@kubernetes/client-node";
import { loadConfig } from "../config.js";
import { loadKubeConfig as defaultLoadKubeConfig } from "../k8s/client.js";
import { listApps as defaultListApps } from "../k8s/apps.js";

type AppsRouteDeps = {
  loadKubeConfig: typeof defaultLoadKubeConfig;
  listApps: typeof defaultListApps;
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
export function appsRoutesWithDeps(
  deps: Partial<AppsRouteDeps> & Pick<AppsRouteDeps, "namespace"> = {
    namespace: loadConfig().namespace,
  },
): FastifyPluginAsync {
  const resolved: AppsRouteDeps = {
    loadKubeConfig: deps.loadKubeConfig ?? defaultLoadKubeConfig,
    listApps: deps.listApps ?? defaultListApps,
    namespace: deps.namespace,
  };

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
        try {
          const { kc } = resolved.loadKubeConfig();
          const api = kc.makeApiClient(k8s.AppsV1Api);
          return await resolved.listApps(api, resolved.namespace);
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

export const appsRoutes = appsRoutesWithDeps();
