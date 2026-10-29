import Fastify from "fastify";
import { clusterRoutes } from "./routes/cluster";
import { healthRoutes } from "./routes/health";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(healthRoutes);
  app.register(clusterRoutes);
  return app;
}
