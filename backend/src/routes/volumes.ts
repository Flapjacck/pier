import type { FastifyPluginAsync } from "fastify";
import type { K8sClientsResult } from "../k8s/clients.js";
import { getVolumeRoutes } from "./volumes/get-one.js";
import { listVolumeRoutes } from "./volumes/list.js";
import { postVolumeRoutes } from "./volumes/post.js";
import { deleteVolumeRoutes } from "./volumes/delete.js";

export type VolumeRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

export function volumesRoutesWithDeps(deps: VolumeRouteDeps): FastifyPluginAsync {
  return async (app) => {
    await app.register(listVolumeRoutes(deps));
    await app.register(getVolumeRoutes(deps));
    await app.register(postVolumeRoutes(deps));
    await app.register(deleteVolumeRoutes(deps));
  };
}
