import type { FastifyPluginAsync } from "fastify";
import type { K8sClientsResult } from "../k8s/clients.js";
import { getAppsRoutesWithDeps } from "./apps/get.js";
import { postAppsRoutesWithDeps } from "./apps/post.js";
import { getAppPodsRoutesWithDeps } from "./apps/pods.js";
import { getAppLogsRoutesWithDeps } from "./apps/logs.js";
import { scaleAppRoutesWithDeps } from "./apps/scale.js";
import { restartAppRoutesWithDeps } from "./apps/restart.js";
import { deleteAppRoutesWithDeps } from "./apps/delete.js";

export type AppsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
  ingressDomain: string | undefined;
};

/** Factory keeps apps routes testable without a live cluster. */
export function appsRoutesWithDeps(deps: AppsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    // Register GET and POST routes for /apps
    await app.register(getAppsRoutesWithDeps(deps));
    await app.register(postAppsRoutesWithDeps(deps));
    // Register app pod and log routes
    await app.register(getAppPodsRoutesWithDeps(deps));
    await app.register(getAppLogsRoutesWithDeps(deps));
    // Register app action routes (scale, restart, delete)
    await app.register(scaleAppRoutesWithDeps(deps));
    await app.register(restartAppRoutesWithDeps(deps));
    await app.register(deleteAppRoutesWithDeps(deps));
  };
}
