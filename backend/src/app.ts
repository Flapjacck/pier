import Fastify from "fastify";
import { setupAuth } from "./plugins/auth";
import { loadConfig } from "./config";
import { appsRoutesWithDeps } from "./routes/apps";
import { clusterRoutes } from "./routes/cluster";
import { healthRoutes } from "./routes/health";

type BuildAppOptions = {
  apiToken?: string;
  namespace?: string;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      level: "info",
      // Redact authorization header from logs to avoid leaking tokens.
      redact: ["req.headers.authorization"],
    },
  });
  // Setup auth hooks on the root app before registering routes.
  setupAuth(app, options.apiToken);
  app.register(healthRoutes);
  app.register(clusterRoutes);
  app.register(
    appsRoutesWithDeps({
      namespace: options.namespace ?? loadConfig().namespace,
    }),
  );
  return app;
}
