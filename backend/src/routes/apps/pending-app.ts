import type { DatabaseSync } from "node:sqlite";
import type { App } from "../../k8s/apps.js";
import { DEFAULT_RESOURCES } from "../../k8s/resources.js";
import { getDeployment, listRunning } from "../../db/deployments-read.js";
import type { DeploySpec } from "../../deploys/types.js";
import type { BuildSource } from "../../k8s/builds/source.js";

export type PendingApp = App & {
  deploymentId: number;
  source?: {
    repo: string;
    branch: string;
    folder: string;
    dockerfile: string;
    gitCredential?: string;
    lastCommit: null;
    lastImage: string | null;
  };
};

/** True when a create-from-source deploy is still running for this app name. */
export function hasRunningCreateBuild(db: DatabaseSync, app: string): boolean {
  return listRunning(db).some((row) => row.app === app && row.trigger === "create" && row.spec.source);
}

/** Newest running create deploy that still has a git source (pre-k8s create). */
export function findPendingCreateDeploy(db: DatabaseSync, app: string) {
  const running = listRunning(db)
    .filter((row) => row.app === app && row.trigger === "create" && row.spec.source)
    .sort((a, b) => b.id - a.id);
  return running[0];
}

function resourcesFromSpec(spec: DeploySpec): App["resources"] {
  const req = spec.resources?.requests ?? {};
  const lim = spec.resources?.limits ?? {};
  return {
    requests: {
      cpu: req.cpu ?? DEFAULT_RESOURCES.requests.cpu,
      memory: req.memory ?? DEFAULT_RESOURCES.requests.memory,
    },
    limits: {
      cpu: lim.cpu ?? DEFAULT_RESOURCES.limits.cpu,
      memory: lim.memory ?? DEFAULT_RESOURCES.limits.memory,
    },
  };
}

/** Synthetic App for GET /apps/:name while Kaniko runs before the Deployment exists. */
export function pendingAppFromSpec(
  name: string,
  spec: DeploySpec,
  opts: {
    deploymentId: number;
    createdAtMs: number;
    source?: BuildSource;
    env?: Record<string, string>;
  },
): PendingApp {
  const source = opts.source ?? (spec.source
    ? {
        repo: spec.source.repo,
        branch: spec.source.branch,
        folder: spec.source.folder,
        dockerfile: spec.source.dockerfile,
        ...(spec.source.gitCredential ? { gitCredential: spec.source.gitCredential } : {}),
      }
    : undefined);

  const app: PendingApp = {
    name,
    image: spec.image && spec.image !== "pending" ? spec.image : "pending",
    replicas: spec.replicas ?? 1,
    ready: 0,
    status: "building",
    createdAt: new Date(opts.createdAtMs).toISOString(),
    port: spec.port,
    host: spec.host,
    url: spec.host ? `http://${spec.host}` : undefined,
    resources: resourcesFromSpec(spec),
    volumes: spec.volumes,
    registry: spec.registry ?? undefined,
    deploymentId: opts.deploymentId,
    ...(opts.env && Object.keys(opts.env).length > 0 ? { env: opts.env } : {}),
  };

  if (source) {
    app.source = {
      repo: source.repo,
      branch: source.branch,
      folder: source.folder,
      dockerfile: source.dockerfile,
      ...(source.gitCredential ? { gitCredential: source.gitCredential } : {}),
      lastCommit: null,
      lastImage: null,
    };
  }
  return app;
}

/** Resolve a pending building app from a running create deploy, if any. */
export function getPendingCreateApp(db: DatabaseSync, name: string): PendingApp | undefined {
  const row = findPendingCreateDeploy(db, name);
  if (!row) return undefined;
  const detail = getDeployment(db, row.id) ?? row;
  return pendingAppFromSpec(name, detail.spec, {
    deploymentId: detail.id,
    createdAtMs: detail.startedAt,
  });
}
