import type { FastifyPluginAsync } from "fastify";
import { isValidAppName } from "../../k8s/names.js";
import { getVolume } from "../../k8s/volumes/volume-store.js";
import { errorSchema } from "../apps-schemas.js";
import { mapVolumeError } from "../volume-errors.js";
import { volumeSchema } from "../volumes-schemas.js";
import type { VolumeRouteDeps } from "../volumes.js";

export function getVolumeRoutes(deps: VolumeRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { name: string } }>("/volumes/:name", {
      schema: {
        response: {
          200: volumeSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          503: errorSchema,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      if (!isValidAppName(req.params.name)) return reply.status(400).send({ ok: false, error: "invalid request" });
      try {
        const volume = await getVolume(deps.k8s.clients, deps.namespace, req.params.name);
        return volume ? reply.send(volume) : reply.status(404).send({ ok: false, error: "volume not found" });
      } catch (err) {
        if (mapVolumeError(err, reply)) return;
        req.log.error({ err }, "get volume failed");
        return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      }
    });
  };
}
