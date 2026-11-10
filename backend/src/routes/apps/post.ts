import type { FastifyPluginAsync } from "fastify";
import { createAppSerialized } from "../../k8s/create-app.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import {
  appSchema,
  errorSchema,
  postAppsBodySchema,
  type PostAppsBody,
} from "../apps-schemas.js";
import { mapPostAppsError } from "./post-errors.js";
import { checkCreateFit } from "./create-fit.js";
import { hostProblem } from "./host-check.js";
import { createFromSource, type SourceCreateDeps } from "./post-source.js";
import { getAppSource } from "../../db/app-sources.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import { recordDeployError, specFromApp, specFromCreateBody, withDeploymentId } from "./deploy-hooks.js";
import { getRegistry } from "../../k8s/registries.js";

type PostAppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
  dashboardHost: string | undefined;
  /** cert-manager ClusterIssuer for app Ingresses (PIER_TLS_ISSUER); unset = HTTP only. */
  tlsIssuer?: string;
  /** Records the create as a deploy (#81); unset in tests that do not need it. */
  tracker?: DeployTracker;
} & Omit<SourceCreateDeps, "clients" | "namespace" | "tlsIssuer" | "tracker">;

/** POST /apps — create a new Deployment, Service, and optionally Ingress; or build one from git (#83). */
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
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }

        const { name, image, port, replicas, env, resources, volumes, registry, source } = req.body;
        if (Boolean(image) === Boolean(source)) {
          return reply.status(400).send({ ok: false, error: "invalid request", details: "set exactly one of image or source" });
        }

        // Ingress rules match hosts case-insensitively; store them lowercase.
        const hostNorm = req.body.host?.toLowerCase();
        const problem = hostProblem(hostNorm, deps);
        if (problem) return reply.status(problem.status).send({ ok: false, error: problem.error, ...(problem.details ? { details: problem.details } : {}) });

        if (source) return createFromSource({ ...deps, clients: deps.k8s.clients }, req, reply, hostNorm);
        // A build-from-repo app owns this name even before its Deployment exists (#83).
        if (deps.db && getAppSource(deps.db, name)) return reply.status(409).send({ ok: false, error: "app already exists" });

        if (registry && !(await getRegistry(deps.k8s.clients.core, deps.namespace, registry))) {
          return reply.status(404).send({ ok: false, error: "registry not found" });
        }

        // Record the deploy once the request is well-formed; the resource fit is its Validate step.
        const deploy = deps.tracker?.begin(name, "create", specFromCreateBody(req.body)) ?? null;
        try {
          await checkCreateFit(deps.k8s.clients, deps.namespace, { resources, replicas, hasVolumes: Boolean(volumes?.length) }, req.log);
          const app = await createAppSerialized(
            deps.k8s.clients,
            deps.namespace,
            {
              name,
              image: image ?? "",
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
          deploy?.applied(specFromApp(app));
          return reply.status(201).send(withDeploymentId(app, deploy));
        } catch (err) {
          req.log.error({ err }, "create app failed");
          recordDeployError(deploy, err);
          mapPostAppsError(err, reply);
          return;
        }
      },
    );
  };
}
