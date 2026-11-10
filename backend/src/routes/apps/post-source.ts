import type { DatabaseSync } from "node:sqlite";
import type { FastifyReply, FastifyRequest } from "fastify";
import { runSourceDeploy, sourceSpec, type SourceDeployDeps } from "../../builds/deploy.js";
import { InvalidBuildSourceError, normalizeBuildSource } from "../../builds/source.js";
import type { BuildSource } from "../../builds/types.js";
import type { BuildConfig } from "../../config-builds.js";
import { deleteAppSource, getAppSource, upsertAppSource } from "../../db/app-sources.js";
import type { DeployTracker } from "../../deploys/tracker.js";
import { getLiveApp } from "../../k8s/app-lookup.js";
import type { K8sClients } from "../../k8s/clients.js";
import { getGitCredential } from "../../k8s/git-credentials/secrets.js";
import type { PostAppsBody } from "../apps-schemas.js";
import { checkCreateFit } from "./create-fit.js";
import { specFromCreateBody } from "./deploy-hooks.js";
import { mapPostAppsError } from "./post-errors.js";
import { sourceOnlyApp } from "./source-app.js";

/**
 * POST /apps with a git source (#83). Everything checkable is checked before answering;
 * then the source and runtime settings are saved, the deploy is recorded and the build
 * runs in the background. 201 means "accepted and building", not "running": the app's
 * page and its deploy record exist from now on, whether the build passes or fails.
 */

export type SourceCreateDeps = {
  clients: K8sClients;
  namespace: string;
  tlsIssuer?: string;
  tracker?: DeployTracker;
  db?: DatabaseSync;
  builds?: BuildConfig;
  volumeHints?: SourceDeployDeps["volumeHints"];
  /** Swapped in tests so no Job is created. */
  runBuild?: SourceDeployDeps["runBuild"];
  now?: () => number;
};

function invalid(reply: FastifyReply, details: string) {
  return reply.status(400).send({ ok: false, error: "invalid request", details });
}

export async function createFromSource(
  deps: SourceCreateDeps,
  req: FastifyRequest<{ Body: PostAppsBody }>,
  reply: FastifyReply,
  host: string | undefined,
) {
  const { tracker, db, builds } = deps;
  if (!tracker || !db || !builds) {
    return reply.status(503).send({ ok: false, error: "builds unavailable", details: "this backend was started without build support" });
  }
  const body = req.body;
  if (body.registry) return invalid(reply, "registry is only for pre-built images; built images use Pier's own registry");

  let source: BuildSource;
  try {
    source = normalizeBuildSource({ ...body.source, repo: body.source?.repo ?? "" });
  } catch (err) {
    if (err instanceof InvalidBuildSourceError) return invalid(reply, err.details);
    throw err;
  }

  try {
    if (await getLiveApp(deps.clients.apps, deps.namespace, body.name)) {
      return reply.status(409).send({ ok: false, error: "app already exists" });
    }
    if (source.gitCredential && !(await getGitCredential(deps.clients.core, builds.namespace, source.gitCredential))) {
      return reply.status(404).send({ ok: false, error: "git credential not found" });
    }
    await checkCreateFit(deps.clients, deps.namespace, { resources: body.resources, replicas: body.replicas, hasVolumes: Boolean(body.volumes?.length) }, req.log);
  } catch (err) {
    req.log.error({ err }, "create from source pre-check failed");
    mapPostAppsError(err, reply);
    return;
  }

  // No await from here to the insert, so two racing creates can't both claim the name.
  if (getAppSource(db, body.name)) return reply.status(409).send({ ok: false, error: "app already exists" });
  const now = (deps.now ?? Date.now)();
  upsertAppSource(db, {
    app: body.name,
    ...source,
    updatedAt: now,
    pendingCreate: {
      port: body.port,
      replicas: body.replicas,
      ...(host ? { host } : {}),
      ...(body.env ? { env: body.env } : {}),
      ...(body.resources ? { resources: body.resources } : {}),
      ...(body.volumes?.length ? { volumes: body.volumes } : {}),
    },
  });

  const { image: _unbuilt, ...rest } = specFromCreateBody(body);
  const spec = sourceSpec(rest, source);
  const deploy = tracker.begin(body.name, "create", spec, { build: true });
  if (!deploy) {
    deleteAppSource(db, body.name);
    return reply.status(503).send({ ok: false, error: "could not record the deploy" });
  }

  void runSourceDeploy(
    { clients: deps.clients, db, namespace: deps.namespace, config: builds, tlsIssuer: deps.tlsIssuer, log: req.log, volumeHints: deps.volumeHints, runBuild: deps.runBuild, now: deps.now },
    { app: body.name, source, deploy, spec },
  );

  const row = getAppSource(db, body.name);
  if (!row) return reply.status(503).send({ ok: false, error: "could not save the app source" });
  return reply.status(201).send({ ...sourceOnlyApp(db, row), deploymentId: deploy.id });
}
