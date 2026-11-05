import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { createAppSerialized } from "../../k8s/create-app.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import {
  appSchema,
  errorSchema,
  postAppsBodySchema,
  type PostAppsBody,
} from "../apps-schemas.js";
import { mapPostAppsError } from "./post-errors.js";
import { checkResourceFit } from "../../k8s/resource-fit.js";
import { DEFAULT_RESOURCES, mergeResources, resourcesProblem } from "../../k8s/resources.js";
import { InvalidResourcesError } from "../../k8s/update-app.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import { recordDeployError, specFromApp, specFromCreateBody, withDeploymentId } from "./deploy-hooks.js";
import { getRegistry } from "../../k8s/registries.js";
import { InvalidBuildSourceError } from "../../k8s/builds/source.js";
import {
  sourceFromBody,
  type BuildConfig,
} from "./build-deploy.js";
import { scheduleCreateFromSource } from "./build-pipeline.js";
import { hasRunningCreateBuild, pendingAppFromSpec } from "./pending-app.js";

type PostAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
  dashboardHost: string | undefined;
  tlsIssuer?: string;
  tracker?: DeployTracker;
  db?: DatabaseSync;
  build?: BuildConfig;
};

function validateHost(
  hostNorm: string | undefined,
  deps: PostAppsRouteDeps,
): { status: number; body: Record<string, unknown> } | null {
  if (!hostNorm) return null;
  if (deps.dashboardHost && hostNorm === deps.dashboardHost) {
    return { status: 409, body: { ok: false, error: "host already in use" } };
  }
  if (hostNorm.includes("*")) {
    return { status: 400, body: { ok: false, error: "invalid request", details: "host cannot contain wildcards" } };
  }
  const dnsPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!dnsPattern.test(hostNorm)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "invalid request",
        details: "host must be a valid DNS-1123 hostname (e.g., hello.192.0.2.10.nip.io)",
      },
    };
  }
  if (!deps.ingressDomain) {
    return { status: 400, body: { ok: false, error: "invalid request", details: "ingress not configured" } };
  }
  const suffix = `.${deps.ingressDomain}`;
  if (!hostNorm.endsWith(suffix) || hostNorm === deps.ingressDomain) {
    return {
      status: 400,
      body: { ok: false, error: "invalid request", details: `host must end with ${suffix}` },
    };
  }
  return null;
}

/** POST /apps — create from a pre-built image or a Dockerfile in a git repo (#83). */
export function postAppsRoutesWithDeps(deps: PostAppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: PostAppsBody }>(
      "/apps",
      {
        schema: {
          body: postAppsBodySchema,
          response: {
            201: appSchema,
            400: errorSchema,
            404: errorSchema,
            401: errorSchema,
            403: errorSchema,
            409: errorSchema,
            422: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }

        const hasImage = typeof req.body.image === "string" && req.body.image.trim() !== "";
        const hasSource = req.body.source !== undefined;
        if (hasImage === hasSource) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "provide exactly one of image or source",
          });
        }
        if (hasSource && req.body.registry) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "registry applies to pulled images only; omit it for Dockerfile builds",
          });
        }

        const { name, port, replicas, host, env, resources, volumes, registry } = req.body;
        if (registry && !(await getRegistry(deps.k8s.clients.core, deps.namespace, registry))) {
          return reply.status(404).send({ ok: false, error: "registry not found" });
        }

        let source;
        try {
          source = hasSource ? sourceFromBody(req.body.source!) : undefined;
        } catch (err) {
          if (err instanceof InvalidBuildSourceError) {
            return reply.status(400).send({ ok: false, error: "invalid request", details: err.details });
          }
          throw err;
        }

        const hostNorm = host?.toLowerCase();
        const hostErr = validateHost(hostNorm, deps);
        if (hostErr) return reply.status(hostErr.status).send(hostErr.body);

        if (source && deps.db && hasRunningCreateBuild(deps.db, name)) {
          return reply.status(409).send({ ok: false, error: "app already exists" });
        }

        const buildOpts = source ? { build: true as const } : undefined;
        const initialSpec = specFromCreateBody({
          ...req.body,
          image: req.body.image ?? "pending",
        });
        const deploy =
          deps.tracker?.begin(
            name,
            "create",
            source
              ? {
                  ...initialSpec,
                  source: {
                    repo: source.repo,
                    branch: source.branch,
                    folder: source.folder,
                    dockerfile: source.dockerfile,
                    ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
                  },
                }
              : initialSpec,
            buildOpts,
          ) ?? null;

        try {
          if (resources) {
            const merged = mergeResources(DEFAULT_RESOURCES, resources);
            const problem = resourcesProblem(merged);
            if (problem) throw new InvalidResourcesError(problem);
            await checkResourceFit(
              deps.k8s.clients.core,
              deps.namespace,
              { next: { resources: merged, replicas: volumes?.length ? Math.min(replicas, 1) : replicas }, surge: false },
              req.log,
            );
          }

          // Dockerfile create: return immediately and build in the background so the
          // client can open the deploy page and stream Build image logs (#83).
          if (source) {
            if (!deps.db || !deps.build || !deploy) {
              deploy?.discard();
              return reply.status(503).send({ ok: false, error: "builds unavailable" });
            }
            const pending = pendingAppFromSpec(name, {
              ...initialSpec,
              source: {
                repo: source.repo,
                branch: source.branch,
                folder: source.folder,
                dockerfile: source.dockerfile,
                ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
              },
            }, {
              deploymentId: deploy.id,
              createdAtMs: Date.now(),
              source,
              env,
            });
            scheduleCreateFromSource({
              clients: deps.k8s.clients,
              namespace: deps.namespace,
              db: deps.db,
              build: deps.build,
              deploy,
              name,
              source,
              body: req.body,
              hostNorm,
              tlsIssuer: deps.tlsIssuer,
              log: req.log,
            });
            return reply.status(201).send(pending);
          }

          const image = req.body.image!.trim();
          const appResult = await createAppSerialized(
            deps.k8s.clients,
            deps.namespace,
            {
              name,
              image,
              port,
              replicas,
              host: hostNorm,
              env,
              resources,
              tlsIssuer: deps.tlsIssuer,
              volumes,
              registry,
            },
            req.log,
          );
          deploy?.applied(specFromApp(appResult));
          return reply.status(201).send(withDeploymentId(appResult, deploy));
        } catch (err) {
          req.log.error({ err }, "create app failed");
          recordDeployError(deploy, err);
          if (err instanceof InvalidBuildSourceError) {
            return reply.status(400).send({ ok: false, error: "invalid request", details: err.details });
          }
          mapPostAppsError(err, reply);
          return;
        }
      },
    );
  };
}
