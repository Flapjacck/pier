import type { FastifyPluginAsync } from "fastify";
import { deleteAppPod } from "../../k8s/pod-actions.js";
import { getLiveApp } from "../../k8s/app-lookup.js";
import { APP_NAME_SCHEMA_PATTERN } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";

type PodActionDeps = { k8s: K8sClientsResult; namespace: string };

/** DELETE /apps/:name/pods/:pod — restart one Deployment-managed pod. */
export function podActionRoutesWithDeps(deps: PodActionDeps): FastifyPluginAsync {
  return async (app) => {
    app.delete<{ Params: { name: string; pod: string } }>(
      "/apps/:name/pods/:pod",
      {
        schema: {
          params: {
            type: "object",
            properties: { name: { type: "string", pattern: APP_NAME_SCHEMA_PATTERN }, pod: { type: "string", pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", maxLength: 253 } },
            required: ["name", "pod"],
          },
          response: {
            202: { type: "object", properties: { ok: { type: "boolean" }, pod: { type: "string" } }, required: ["ok", "pod"] },
            400: errorSchema,
            404: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        const { name, pod } = req.params;
        if (!new RegExp(APP_NAME_SCHEMA_PATTERN).test(name) || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(pod) || pod.length > 253) {
          return reply.status(400).send({ ok: false, error: "invalid request" });
        }
        if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        try {
          if (!(await getLiveApp(deps.k8s.clients.apps, deps.namespace, name))) {
            return reply.status(404).send({ ok: false, error: "app not found" });
          }
          if (!(await deleteAppPod(deps.k8s.clients.core, deps.namespace, name, pod))) {
            return reply.status(404).send({ ok: false, error: "pod not found" });
          }
          return reply.status(202).send({ ok: true, pod });
        } catch (err) {
          req.log.error({ err }, "delete app pod failed");
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }
      },
    );
  };
}
