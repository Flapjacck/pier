import type { FastifyPluginAsync } from "fastify";
import { listVolumes } from "../../k8s/volumes/volume-store.js";
import { errorSchema } from "../apps-schemas.js";
import { volumeSchema } from "../volumes-schemas.js";
import type { VolumeRouteDeps } from "../volumes.js";

export function listVolumeRoutes(deps: VolumeRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/volumes", {
      schema: {
        response: {
          200: { type: "array", items: volumeSchema },
          401: errorSchema,
          503: errorSchema,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      try {
        return await listVolumes(deps.k8s.clients, deps.namespace);
      } catch (err) {
        req.log.error({ err }, "list volumes failed");
        return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      }
    });
  };
}
