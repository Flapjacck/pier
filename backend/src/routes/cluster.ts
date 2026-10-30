import type { FastifyPluginAsync } from "fastify";
import { getClusterHealth } from "../k8s/cluster-health";
import { listClusterPods } from "../k8s/list-pods";
import type { K8sClientsResult } from "../k8s/clients";

type ClusterRouteDeps = {
  k8s: K8sClientsResult;
};

/** Factory keeps the HTTP handler testable without a live cluster. */
export function clusterRoutesWithDeps(deps: ClusterRouteDeps): FastifyPluginAsync {
  return async (app) => {
    /** Kubernetes API reachability: version string + node readiness counts. */
    app.get("/cluster/health", async (req, reply) => {
      if (!deps.k8s.ok) {
        return reply.status(503).send({
          ok: false,
          error: "cluster unreachable",
        });
      }

      try {
        const result = await getClusterHealth(
          deps.k8s.clients.core,
          deps.k8s.clients.version,
          deps.k8s.clients.mode,
        );
        return result;
      } catch (err) {
        req.log.error({ err }, "cluster call failed");
        return reply.status(503).send({
          ok: false,
          error: "cluster unreachable",
        });
      }
    });

    /** Snapshot of all pods (every namespace) from the Kubernetes API. */
    app.get("/cluster/pods", async (req, reply) => {
      if (!deps.k8s.ok) {
        return reply.status(503).send({
          ok: false,
          error: "cluster unreachable",
        });
      }

      try {
        const result = await listClusterPods(
          deps.k8s.clients.core,
          deps.k8s.clients.mode,
        );
        return result;
      } catch (err) {
        req.log.error({ err }, "cluster call failed");
        return reply.status(503).send({
          ok: false,
          error: "cluster unreachable",
        });
      }
    });
  };
}
