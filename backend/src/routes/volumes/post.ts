import type { FastifyPluginAsync } from "fastify";
import { isValidAppName } from "../../k8s/names.js";
import { createVolume } from "../../k8s/volumes/volume-store.js";
import { sizeProblem } from "../../k8s/volumes/validation.js";
import { errorSchema } from "../apps-schemas.js";
import { mapVolumeError } from "../volume-errors.js";
import { volumeBodySchema, volumeSchema, type VolumeBody } from "../volumes-schemas.js";
import type { VolumeRouteDeps } from "../volumes.js";

export function postVolumeRoutes(deps: VolumeRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: VolumeBody }>("/volumes", {
      schema: {
        body: volumeBodySchema,
        response: {
          201: volumeSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          409: errorSchema,
          503: errorSchema,
        },
      },
    }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      if (!isValidAppName(req.body.name)) return reply.status(400).send({ ok: false, error: "invalid request" });
      const problem = sizeProblem(req.body.size);
      if (problem) return reply.status(400).send({ ok: false, error: "invalid request", details: problem });
      try {
        return reply.status(201).send(await createVolume(deps.k8s.clients, deps.namespace, req.body.name, req.body.size));
      } catch (err) {
        if (mapVolumeError(err, reply)) return;
        req.log.error({ err }, "create volume failed");
        return reply.status(503).send({ ok: false, error: "cluster unreachable", details: err instanceof Error ? err.message : undefined });
      }
    });
  };
}
