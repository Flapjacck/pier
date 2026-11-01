import type { FastifyServerOptions } from "fastify";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { Config } from "./config";
import { setupAuth } from "./plugins/auth";
import type { KubeConfigLoader } from "./k8s/client";
import { createK8sClients, type K8sClientsResult } from "./k8s/clients";
import { appsRoutesWithDeps } from "./routes/apps";
import { clusterRoutesWithDeps } from "./routes/cluster";
import { healthRoutes } from "./routes/health";
import { sessionRoutesWithDeps } from "./routes/session";

type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Prebuilt clients (tests). Takes precedence over loadKubeConfig. */
  k8s?: K8sClientsResult;
  /** Kubeconfig loader passed to createK8sClients() (tests count or fake it). */
  loadKubeConfig?: KubeConfigLoader;
};

/**
 * Only the first line of a load error is safe to log: YAML parse errors append a
 * snippet of the surrounding file, which for a kubeconfig can be a token or key.
 */
function firstLine(message: string): string {
  return message.split("\n", 1)[0] ?? "";
}

/**
 * Build and configure the Fastify app.
 * K8s clients are built once from config and shared across all requests.
 * If clients fail to load, they're logged as a warning and all cluster routes return 503.
 */
export async function buildApp(config: Config, opts: BuildAppOptions = {}) {
  // Default logger: info level with sensitive headers redacted.
  const logger = opts.logger ?? {
    level: "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
    ],
  };

  const app = Fastify({
    logger,
    ajv: {
      customOptions: {
        removeAdditional: false, // Reject unknown keys instead of silently stripping them
      },
    },
  });

  // Build or use provided K8s clients once.
  const k8sResult =
    opts.k8s ?? createK8sClients({ kubeconfig: config.kubeconfig }, opts.loadKubeConfig);

  // If clients failed to load, log a one-line startup warning (no stack, no file content).
  if (!k8sResult.ok) {
    app.log.warn(`cluster unreachable at startup: ${firstLine(k8sResult.error.message)}`);
  }

  // Decorate the app instance with config for routes to access.
  app.decorate("config", config);

  // Register cookie parser plugin before auth hook so cookies are available.
  await app.register(fastifyCookie);

  // Setup auth hooks on the root app before registering routes.
  setupAuth(app, config.apiToken);

  // Register health at root.
  app.register(healthRoutes);

  // Register all API routes under /api prefix (health, session, cluster, apps).
  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(sessionRoutesWithDeps({ apiToken: config.apiToken, ingressDomain: config.ingressDomain }));
    await api.register(clusterRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));
    await api.register(appsRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace, ingressDomain: config.ingressDomain }));
  }, { prefix: "/api" });

  return app;
}

// TypeScript module augmentation: allow routes to access config via fastifyInstance.config
declare module "fastify" {
  interface FastifyInstance {
    config: Config;
  }
}
