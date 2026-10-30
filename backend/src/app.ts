import type { FastifyServerOptions } from "fastify";
import Fastify from "fastify";
import type { Config } from "./config";
import { setupAuth } from "./plugins/auth";
import { createK8sClients, type K8sClientsResult } from "./k8s/clients";
import { appsRoutesWithDeps } from "./routes/apps";
import { clusterRoutesWithDeps } from "./routes/cluster";
import { healthRoutes } from "./routes/health";

type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  k8s?: K8sClientsResult;
};

/**
 * Build and configure the Fastify app.
 * K8s clients are built once from config and shared across all requests.
 * If clients fail to load, they're logged as a warning and all cluster routes return 503.
 */
export function buildApp(config: Config, opts: BuildAppOptions = {}) {
  // Default logger: info level with authorization header redacted.
  const logger = opts.logger ?? {
    level: "info",
    redact: ["req.headers.authorization"],
  };

  const app = Fastify({ logger });

  // Build or use provided K8s clients once.
  const k8sResult =
    opts.k8s ??
    createK8sClients({
      kubeconfig: config.kubeconfig,
    });

  // If clients failed to load, log a startup warning (message only, no stack, no secrets).
  if (!k8sResult.ok) {
    app.log.warn(`cluster unreachable at startup: ${k8sResult.error.message}`);
  }

  // Decorate the app instance with config for routes to access.
  app.decorate("config", config);

  // Setup auth hooks on the root app before registering routes.
  setupAuth(app, config.apiToken);
  app.register(healthRoutes);
  app.register(clusterRoutesWithDeps({ k8s: k8sResult }));
  app.register(appsRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));

  return app;
}

// TypeScript module augmentation: allow routes to access config via fastifyInstance.config
declare module "fastify" {
  interface FastifyInstance {
    config: Config;
  }
}
