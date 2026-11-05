import type { FastifyServerOptions } from "fastify";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import type { Config } from "./config";
import { setupAuth } from "./plugins/auth";
import { setupAudit } from "./plugins/audit";
import { setupStaticServing } from "./plugins/static";
import type { KubeConfigLoader } from "./k8s/client";
import { createK8sClients, type K8sClientsResult } from "./k8s/clients";
import { appsRoutesWithDeps } from "./routes/apps";
import { auditRoutesWithDeps } from "./routes/audit";
import { clusterRoutesWithDeps } from "./routes/cluster";
import { healthRoutes } from "./routes/health";
import { sessionRoutesWithDeps } from "./routes/session";
import { volumesRoutesWithDeps } from "./routes/volumes";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db/open";
import { SqliteLoginLimiter } from "./db/login-limiter";
import { startPruning } from "./db/maintenance";
import { createDeployTracker } from "./deploys/tracker";
import { deploymentsRoutesWithDeps } from "./routes/deployments";
import { registriesRoutesWithDeps } from "./routes/registries";
import { imageRoutesWithDeps } from "./routes/images";
import { gitCredentialsRoutesWithDeps } from "./routes/git-credentials";

type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Prebuilt clients (tests). Takes precedence over loadKubeConfig. */
  k8s?: K8sClientsResult;
  /** Kubeconfig loader passed to createK8sClients() (tests count or fake it). */
  loadKubeConfig?: KubeConfigLoader;
  /** Override publicDir for tests. */
  publicDir?: string;
  /** Prebuilt database (tests). The caller owns it, so buildApp won't close it. */
  db?: DatabaseSync;
  /** Deploy tracker poll interval in ms (tests shorten it). Default 2000. */
  deployPollMs?: number;
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
    // false, true, or the proxy IPs/CIDRs allowed to set X-Forwarded-For (req.ip feeds the login limiter and audit log).
    trustProxy: config.trustProxy,
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

  // Pier's own data (audit log, login limiter). Kubernetes stays the source of truth for apps.
  const db = opts.db ?? openDatabase(config.dbPath);
  const limiter = new SqliteLoginLimiter(db);
  const stopPruning = startPruning({ db, limiter, retentionDays: config.auditRetentionDays, log: app.log });
  // Deploy history (#81): records create/PATCH/restart and follows each rollout.
  const tracker = createDeployTracker({
    db,
    k8s: k8sResult,
    namespace: config.namespace,
    log: app.log,
    timeoutMs: config.deployTimeoutSeconds * 1000,
    pollMs: opts.deployPollMs,
  });
  // Pick up deploys that were running when Pier last stopped. Also when the cluster is
  // unreachable: unapplied ones fail now and the rest time out instead of staying running.
  tracker.resume();
  app.addHook("onClose", async () => {
    tracker.stop();
    stopPruning();
    if (!opts.db) db.close();
  });

  // Register cookie parser plugin before auth hook so cookies are available.
  await app.register(fastifyCookie);

  // Setup auth hooks on the root app before registering routes.
  setupAuth(app, config.apiToken);

  // Record successful mutating requests in the audit log.
  setupAudit(app, { db });

  // Register health at root.
  app.register(healthRoutes);

  // Register all API routes under /api prefix (health, session, cluster, apps).
  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(sessionRoutesWithDeps({ apiToken: config.apiToken, ingressDomain: config.ingressDomain, tls: config.tlsIssuer !== undefined, limiter }));
    await api.register(clusterRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));
    await api.register(appsRoutesWithDeps({
      k8s: k8sResult,
      namespace: config.namespace,
      ingressDomain: config.ingressDomain,
      dashboardHost: config.dashboardHost,
      tlsIssuer: config.tlsIssuer,
      tracker,
      db,
      build: {
        buildRegistry: config.buildRegistry,
        buildPushRegistry: config.buildPushRegistry,
        buildNamespace: config.buildNamespace,
        buildTimeoutSeconds: config.buildTimeoutSeconds,
        kanikoImage: config.kanikoImage,
      },
    }));
    await api.register(deploymentsRoutesWithDeps({ db, tracker }));
    await api.register(volumesRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));
    await api.register(registriesRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));
    await api.register(gitCredentialsRoutesWithDeps({ k8s: k8sResult, namespace: config.buildNamespace, db }));
    await api.register(imageRoutesWithDeps({ k8s: k8sResult, namespace: config.namespace }));
    await api.register(auditRoutesWithDeps({ db }));
  }, { prefix: "/api" });

  // Register static file serving (dashboard SPA) after API routes.
  await setupStaticServing(app, opts.publicDir ?? config.publicDir);

  return app;
}

// TypeScript module augmentation: allow routes to access config via fastifyInstance.config
declare module "fastify" {
  interface FastifyInstance {
    config: Config;
  }
}
