import type { FastifyPluginAsync } from "fastify";
import { deleteVolume } from "../../k8s/volumes/volume-store.js";
import { errorSchema } from "../apps-schemas.js";
import { mapVolumeError } from "../volume-errors.js";
import type { VolumeRouteDeps } from "../volumes.js";

export function deleteVolumeRoutes(deps: VolumeRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.delete<{ Params: { name: string } }>("/volumes/:name", {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { ok: { type: "boolean" }, dataRetained: { type: "boolean" } },
            required: ["ok", "dataRetained"],
          },
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      try {
        return reply.send({ ok: true, ...(await deleteVolume(deps.k8s.clients, deps.namespace, req.params.name, req.log)) });
      } catch (err) {
        if (mapVolumeError(err, reply)) return;
        req.log.error({ err }, "delete volume failed");
        return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      }
    });
  };
}
