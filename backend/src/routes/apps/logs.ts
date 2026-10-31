import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { appExists, listAppPods } from "../../k8s/app-pods.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";
import { streamSseLogs } from "./logs-stream.js";

type LogsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

type LogsQuerystring = {
  pod?: string;
  tail: number;
  follow: boolean;
};

/** GET /apps/:name/logs — stream logs from a specific pod with optional follow. */
export function getAppLogsRoutesWithDeps(deps: LogsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{
      Params: { name: string };
      Querystring: LogsQuerystring;
    }>(
      "/apps/:name/logs",
      {
        schema: {
          querystring: {
            type: "object",
            properties: {
              pod: {
                type: "string",
                pattern: "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$",
                maxLength: 253,
              },
              tail: {
                type: "integer",
                minimum: 1,
                maximum: 5000,
                default: 200,
              },
              follow: {
                type: "boolean",
                default: false,
              },
            },
            additionalProperties: false,
          },
          response: {
            200: { type: "string" },
            400: errorSchema,
            404: errorSchema,
            503: errorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!deps.k8s.ok) {
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }

        const { name } = req.params;
        const { pod: podName, tail, follow } = req.query;

        // Validate app name (DNS-1035).
        const namePattern = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;
        if (!namePattern.test(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
          });
        }

        try {
          // Check if app exists.
          const exists = await appExists(deps.k8s.clients.apps, deps.namespace, name);
          if (!exists) {
            return reply.status(404).send({
              ok: false,
              error: "app not found",
            });
          }

          // List pods for this app.
          const pods = await listAppPods(deps.k8s.clients.core, deps.namespace, name);
          if (pods.length === 0) {
            return reply.status(404).send({
              ok: false,
              error: "no pods",
            });
          }

          // Determine which pod to log from.
          let selectedPod = pods[0]; // Default to newest pod.
          if (podName) {
            const found = pods.find((p) => p.name === podName);
            if (!found) {
              return reply.status(404).send({
                ok: false,
                error: "pod not found",
              });
            }
            selectedPod = found;
          }

          // For non-SSE (follow=false), stream plain text logs.
          if (!follow) {
            try {
              const stream = new PassThrough();
              await deps.k8s.clients.log.log(
                deps.namespace,
                selectedPod.name,
                "app",
                stream,
                { tailLines: tail },
              );

              reply.type("text/plain; charset=utf-8");
              return reply.send(stream);
            } catch (err) {
              req.log.error({ err }, "read logs failed");
              return reply.status(503).send({
                ok: false,
                error: "cluster unreachable",
              });
            }
          }

          // For follow=true, stream SSE events.
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
          return reply.status(503).send({
            ok: false,
            error: "cluster unreachable",
          });
        }
      },
    );
  };
}
