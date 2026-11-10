import type { FastifyPluginAsync } from "fastify";
import type { K8sClientsResult } from "../k8s/clients.js";
import { getRegistry } from "../k8s/registries.js";
import { inspectImage } from "../images/inspect.js";
import { imageVolumeHints } from "../builds/volume-hints/index.js";
import { volumeHintSchema } from "./apps-source-schemas.js";

type ImageBody = { image: string; registry?: string };
type ImageDeps = { k8s: K8sClientsResult; namespace: string };
const bodySchema = {
  type: "object", additionalProperties: false, required: ["image"],
  properties: { image: { type: "string", minLength: 1, maxLength: 255, pattern: "^\\S+$" }, registry: { type: "string", minLength: 1, maxLength: 63 } },
} as const;
const responseSchema = {
  type: "object", required: ["ok", "image", "digest", "exposedPorts", "volumes"],
  properties: { ok: { type: "boolean" }, image: { type: "string" }, digest: { type: "string" }, exposedPorts: { type: "array", items: { type: "integer" } }, volumes: { type: "array", items: { type: "string" } }, workingDir: { type: "string" }, defaultUser: { type: "string" }, volumeHints: { type: "array", items: volumeHintSchema } },
} as const;
const errorSchema = { type: "object", required: ["ok", "error"], properties: { ok: { type: "boolean" }, error: { type: "string" } } } as const;

export function imageRoutesWithDeps(deps: ImageDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: ImageBody }>("/images/inspect", { schema: { body: bodySchema, response: { 200: responseSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 503: errorSchema } } }, async (req, reply) => {
      if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
      try {
        const credential = req.body.registry ? await getRegistry(deps.k8s.clients.core, deps.namespace, req.body.registry) : undefined;
        if (req.body.registry && !credential) return reply.status(404).send({ ok: false, error: "registry not found" });
        const inspection = await inspectImage(req.body.image, credential);
        // Same hint shape as the git probe (#83), so the wizard shows one kind of suggestion.
        return reply.send({ ok: true, ...inspection, volumeHints: imageVolumeHints(inspection).hints });
      } catch (error) {
        const message = error instanceof Error ? error.message : "registry request failed";
        const status = message.includes("authentication") ? 401 : message.includes("not found") ? 404 : message.includes("registry request failed") ? 502 : 400;
        return reply.status(status).send({ ok: false, error: message });
      }
    });
  };
}
