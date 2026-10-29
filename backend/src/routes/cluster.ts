import type { FastifyPluginAsync } from "fastify";
import { loadKubeConfig as defaultLoadKubeConfig } from "../k8s/client";
import {
  getClusterHealth as defaultGetClusterHealth,
  type ClusterHealth,
} from "../k8s/cluster-health";
import {
  listClusterPods as defaultListClusterPods,
  type ClusterPodsResult,
} from "../k8s/list-pods";
import type { KubeConfigMode } from "../k8s/client";
import type * as k8s from "@kubernetes/client-node";

type ClusterRouteDeps = {
  loadKubeConfig: typeof defaultLoadKubeConfig;
  getClusterHealth: (
    kc: k8s.KubeConfig,
    mode: KubeConfigMode,
  ) => Promise<ClusterHealth>;
  listClusterPods: (
    kc: k8s.KubeConfig,
    mode: KubeConfigMode,
  ) => Promise<ClusterPodsResult>;
};

/** Factory keeps the HTTP handler testable without a live cluster. */
export function clusterRoutesWithDeps(
  deps: ClusterRouteDeps = {
    loadKubeConfig: defaultLoadKubeConfig,
    getClusterHealth: defaultGetClusterHealth,
    listClusterPods: defaultListClusterPods,
  },
): FastifyPluginAsync {
  return async (app) => {
    /** Kubernetes API reachability: version string + node readiness counts. */
    app.get("/cluster/health", async (_req, reply) => {
      const { kc, mode } = deps.loadKubeConfig();
      const result = await deps.getClusterHealth(kc, mode);

      if (!result.ok) {
        return reply.status(503).send(result);
      }

      return result;
    });

    /** Snapshot of all pods (every namespace) from the Kubernetes API. */
    app.get("/cluster/pods", async (_req, reply) => {
      const { kc, mode } = deps.loadKubeConfig();
      const result = await deps.listClusterPods(kc, mode);

      if (!result.ok) {
        return reply.status(503).send(result);
      }

      return result;
    });
  };
}

export const clusterRoutes = clusterRoutesWithDeps();
