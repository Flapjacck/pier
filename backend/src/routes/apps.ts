import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { K8sClientsResult } from "../k8s/clients.js";
import type { DeployTracker } from "../deploys/tracker.js";
import type { BuildConfig } from "./apps/build-deploy.js";
import { getAppsRoutesWithDeps } from "./apps/get.js";
import { getAppRoutesWithDeps } from "./apps/get-one.js";
import { postAppsRoutesWithDeps } from "./apps/post.js";
import { getAppPodsRoutesWithDeps } from "./apps/pods.js";
import { getAppLogsRoutesWithDeps } from "./apps/logs.js";
import { scaleAppRoutesWithDeps } from "./apps/scale.js";
import { patchAppRoutesWithDeps } from "./apps/patch.js";
import { restartAppRoutesWithDeps } from "./apps/restart.js";
import { deleteAppRoutesWithDeps } from "./apps/delete.js";
import { podActionRoutesWithDeps } from "./apps/pod-actions.js";
import { getAppEventsRoutesWithDeps } from "./apps/events.js";
import { redeployAppRoutesWithDeps } from "./apps/redeploy.js";

export type AppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
  dashboardHost: string | undefined;
  /** cert-manager ClusterIssuer for app Ingresses (PIER_TLS_ISSUER); unset = HTTP only. */
  tlsIssuer?: string;
  /** Records create/PATCH/restart as deploys (#81). */
  tracker?: DeployTracker;
  db?: DatabaseSync;
  build?: BuildConfig;
};

/** Factory keeps apps routes testable without a live cluster. */
export function appsRoutesWithDeps(deps: AppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    await app.register(getAppsRoutesWithDeps(deps));
    await app.register(getAppRoutesWithDeps(deps));
    await app.register(postAppsRoutesWithDeps(deps));
    await app.register(getAppPodsRoutesWithDeps(deps));
    await app.register(getAppLogsRoutesWithDeps(deps));
    await app.register(podActionRoutesWithDeps(deps));
    await app.register(getAppEventsRoutesWithDeps(deps));
    await app.register(patchAppRoutesWithDeps(deps));
    await app.register(scaleAppRoutesWithDeps(deps));
    await app.register(restartAppRoutesWithDeps(deps));
    await app.register(redeployAppRoutesWithDeps(deps));
    await app.register(deleteAppRoutesWithDeps(deps));
  };
}
