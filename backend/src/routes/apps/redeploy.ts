import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { K8sClientsResult } from "../../k8s/clients.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import { getAppSource } from "../../db/app-sources.js";
import { appSchema, errorSchema } from "../apps-schemas.js";
import { getApp } from "../../k8s/app-lookup.js";
import { updateApp } from "../../k8s/update-app.js";
import { recordDeployError, specFromApp, withDeploymentId } from "./deploy-hooks.js";
import {
  buildImageForDeploy,
  specWithSource,
  type BuildConfig,
} from "./build-deploy.js";
import { BuildFailedError } from "../../k8s/builds/run.js";
import { mapPostAppsError } from "./post-errors.js";

type Deps = {
  k8s: K8sClientsResult;
  namespace: string;
  tracker?: DeployTracker;
  db?: DatabaseSync;
  build?: BuildConfig;
};

/** POST /apps/:name/redeploy — rebuild from the saved git source and roll out (#83). */
export function redeployAppRoutesWithDeps(deps: Deps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { name: string } }>(
      "/apps/:name/redeploy",
      {
        schema: {
          response: {
            200: appSchema,
            400: errorSchema,
            404: errorSchema,
            422: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        if (!deps.db || !deps.build) return reply.status(503).send({ ok: false, error: "builds unavailable" });

        const sourceRow = getAppSource(deps.db, req.params.name);
        if (!sourceRow) return reply.status(404).send({ ok: false, error: "no build source for app" });

        const current = await getApp(deps.k8s.clients, deps.namespace, req.params.name);
        if (!current) return reply.status(404).send({ ok: false, error: "app not found" });

        const source = {
          repo: sourceRow.repo,
          branch: sourceRow.branch,
          folder: sourceRow.folder,
          dockerfile: sourceRow.dockerfile,
          ...(sourceRow.gitCredential ? { gitCredential: sourceRow.gitCredential } : {}),
        };

        const deploy =
          deps.tracker?.begin(
            req.params.name,
            "build",
            {
              ...specFromApp(current),
              source: {
                repo: source.repo,
                branch: source.branch,
                folder: source.folder,
                dockerfile: source.dockerfile,
                ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
              },
            },
            { build: true },
          ) ?? null;

        if (!deploy) return reply.status(503).send({ ok: false, error: "could not record deploy" });

        try {
          const built = await buildImageForDeploy({
            clients: deps.k8s.clients,
            db: deps.db,
            deploy,
            app: req.params.name,
            source,
            build: deps.build,
            log: req.log,
          });
          const appResult = await updateApp(
            deps.k8s.clients,
            deps.namespace,
            req.params.name,
            { image: built.image },
            req.log,
          );
          deploy.applied(specWithSource(specFromApp(appResult), source, built.image));
          return reply.send(
            withDeploymentId(
              {
                ...appResult,
                source: {
                  repo: source.repo,
                  branch: source.branch,
                  folder: source.folder,
                  dockerfile: source.dockerfile,
                  ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
                  lastCommit: null,
                  lastImage: built.image,
                },
              },
              deploy,
            ),
          );
        } catch (err) {
          req.log.error({ err }, "redeploy failed");
          if (!(err instanceof BuildFailedError)) recordDeployError(deploy, err);
          if (err instanceof BuildFailedError) {
            return reply.status(422).send({ ok: false, error: "build failed", details: err.message });
          }
          mapPostAppsError(err, reply);
          return;
        }
      },
    );
  };
}
