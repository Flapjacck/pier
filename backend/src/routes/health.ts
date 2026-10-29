import type { FastifyPluginAsync } from "fastify";
import { loadKubeConfig } from "../k8s/client";
import { getClusterHealth } from "../k8s/cluster-health";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    service: "pi-backend",
  }));

  app.get("/health/cluster", async (_req, reply) => {
    const { kc, mode } = loadKubeConfig();
    const result = await getClusterHealth(kc, mode);

    if (!result.ok) {
      return reply.status(503).send(result);
    }

    return result;
  });
};
