import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { getLiveApp } from "../../k8s/app-lookup.js";
import { listAppPods } from "../../k8s/app-pods.js";
import { apiErrorMessage } from "../../k8s/api-errors.js";
import { isValidAppName, POD_NAME_SCHEMA_PATTERN } from "../../k8s/names.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";
import { streamSseLogs } from "./logs-stream.js";

type LogsRouteDeps = { k8s: K8sClientsResult; namespace: string };
type LogsQuery = { pod?: string; tail: number; follow: boolean; previous: boolean };

function isMissingPrevious(error: unknown): boolean {
  const message = apiErrorMessage(error)?.toLowerCase() ?? "";
  return message.includes("previous") && message.includes("not found");
}

export function getAppLogsRoutesWithDeps(deps: LogsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { name: string }; Querystring: LogsQuery }>(
      "/apps/:name/logs",
      {
        schema: {
          querystring: {
            type: "object",
            properties: {
              pod: { type: "string", pattern: POD_NAME_SCHEMA_PATTERN, maxLength: 253 },
              tail: { type: "integer", minimum: 1, maximum: 5000, default: 200 },
              follow: { type: "boolean", default: false },
              previous: { type: "boolean", default: false },
            },
            additionalProperties: false,
          },
          response: { 200: { type: "string" }, 400: errorSchema, 404: errorSchema, 503: errorSchema },
        },
      },
      async (req, reply) => {
        const { name } = req.params;
        const { pod: podName, tail, follow, previous } = req.query;
        if (!isValidAppName(name)) return reply.status(400).send({ ok: false, error: "invalid request" });
        if (previous && follow) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
            details: "previous logs can't be followed",
          });
        }
        if (!deps.k8s.ok) return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        try {
          if (!(await getLiveApp(deps.k8s.clients.apps, deps.namespace, name))) {
            return reply.status(404).send({ ok: false, error: "app not found" });
          }
          const pods = await listAppPods(deps.k8s.clients.core, deps.namespace, name);
          if (pods.length === 0) return reply.status(404).send({ ok: false, error: "no pods" });
          const selectedPod = podName ? pods.find((pod) => pod.name === podName) : pods[0];
          if (!selectedPod) return reply.status(404).send({ ok: false, error: "pod not found" });

          if (!follow) {
            const stream = new PassThrough();
            try {
              await deps.k8s.clients.log.log(deps.namespace, selectedPod.name, "app", stream, {
                tailLines: tail,
                previous,
              });
            } catch (err) {
              if (previous && isMissingPrevious(err)) {
                return reply.status(404).send({ ok: false, error: "no previous logs" });
              }
              throw err;
            }
            reply.type("text/plain; charset=utf-8");
            return reply.send(stream);
          }
          await streamSseLogs({
            reply,
            req,
            logClient: deps.k8s.clients.log,
            namespace: deps.namespace,
            podName: selectedPod.name,
            tail,
          });
        } catch (err) {
          req.log.error({ err }, "log endpoint failed");
          return reply.status(503).send({ ok: false, error: "cluster unreachable" });
        }
      },
    );
  };
}
