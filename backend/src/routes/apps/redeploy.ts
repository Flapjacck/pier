import type { DatabaseSync } from "node:sqlite";
import type { FastifyPluginAsync } from "fastify";
import { runSourceDeploy, sourceSpec, type SourceDeployDeps } from "../../builds/deploy.js";
import type { BuildSource } from "../../builds/types.js";
import type { BuildConfig } from "../../config-builds.js";
import { getAppSource } from "../../db/app-sources.js";
import { unappliedIdsForApp } from "../../db/deployments-read.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import type { DeploySpec } from "../../deploys/types.js";
import { getApp } from "../../k8s/app-lookup.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { isValidAppName } from "../../k8s/names.js";
import { errorSchema } from "../apps-schemas.js";
import { specFromApp } from "./deploy-hooks.js";

type RedeployDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  tlsIssuer?: string;
  tracker?: DeployTracker;
  db?: DatabaseSync;
  builds?: BuildConfig;
  volumeHints?: SourceDeployDeps["volumeHints"];
  /** Swapped in tests so no Job is created. */
  runBuild?: SourceDeployDeps["runBuild"];
};

/**
 * POST /apps/:name/redeploy (#83): rebuild the saved git source at the branch's latest
 * commit and roll the app onto it. For an app whose first build or apply failed, this
 * retries the create with the saved settings. 202: the deploy runs in the background.
 */
export function redeployAppRoutesWithDeps(deps: RedeployDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { name: string } }>(
      "/apps/:name/redeploy",
      {
        schema: {
          params: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          response: {
            202: {
              type: "object",
              properties: { ok: { type: "boolean" }, deploymentId: { type: "integer" } },
              required: ["ok", "deploymentId"],
            },
            400: errorSchema,
            404: errorSchema,
            409: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        const { tracker, db, builds } = deps;
        if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        if (!tracker || !db || !builds) {
          return reply.status(503).send({ ok: false, error: "builds unavailable", details: "this backend was started without build support" });
        }
        const { name } = req.params;
        if (!isValidAppName(name)) return reply.status(400).send({ ok: false, error: "invalid request" });

        const row = getAppSource(db, name);
        let spec: DeploySpec = {};
        try {
          const live = await getApp(deps.k8s.clients, deps.namespace, name);
          if (!row) {
            return live
              ? reply.status(409).send({ ok: false, error: "app has no git source", details: "only apps built from a repo can be redeployed" })
              : reply.status(404).send({ ok: false, error: "app not found" });
          }
          // A live app without pending settings: rebuild and swap the image. Otherwise retry the create.
          if (live && !row.pendingCreate) spec = specFromApp(live);
        } catch (err) {
          req.log.error({ err }, "redeploy lookup failed");
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }

        // Synchronous from here: no second build can slip in between the check and begin.
        // A finished build whose rollout is still being watched is fine: the new deploy supersedes it.
        if (unappliedIdsForApp(db, name).length > 0) {
          return reply.status(409).send({ ok: false, error: "a build is already running", details: "wait for it to finish or fail first" });
        }
        const source: BuildSource = { method: row.method, repo: row.repo, branch: row.branch, folder: row.folder, dockerfile: row.dockerfile, ...(row.gitCredential ? { gitCredential: row.gitCredential } : {}) };
        const full = sourceSpec(spec, source);
        const deploy = tracker.begin(name, row.pendingCreate ? "create" : "build", full, { build: true });
        if (!deploy) return reply.status(503).send({ ok: false, error: "could not record the deploy" });

        void runSourceDeploy(
          { clients: deps.k8s.clients, db, namespace: deps.namespace, config: builds, tlsIssuer: deps.tlsIssuer, log: req.log, volumeHints: deps.volumeHints, runBuild: deps.runBuild },
          { app: name, source, deploy, spec: full },
        );
        return reply.status(202).send({ ok: true, deploymentId: deploy.id });
      },
    );
  };
}
