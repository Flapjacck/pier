import { PassThrough } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { appExists, listAppPods } from "../../k8s/app-pods.js";
import type { K8sClientsResult } from "../../k8s/clients.js";
import { errorSchema } from "../apps-schemas.js";
import { SSELineTransform } from "./logs-sse.js";

type LogsRouteDeps = {
  k8s: K8sClientsResult;
  namespace: string;
};

/** GET /apps/:name/logs — stream logs from a specific pod with optional follow. */
export function getAppLogsRoutesWithDeps(deps: LogsRouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { name: string }; Querystring: Record<string, unknown> }>(
      "/apps/:name/logs",
      {
        schema: {
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

        // Validate app name (DNS-1035).
        const namePattern = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;
        if (!namePattern.test(name)) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
          });
        }

        // Parse query parameters.
        const podName = req.query.pod as string | undefined;
        const tailStr = req.query.tail as string | undefined;
        const followStr = req.query.follow as string | undefined;

        // Validate tail parameter (1-5000, default 200).
        const tail = tailStr ? parseInt(tailStr, 10) : 200;
        if (!Number.isInteger(tail) || tail < 1 || tail > 5000) {
          return reply.status(400).send({
            ok: false,
            error: "invalid request",
          });
        }

        // Validate follow parameter (boolean, default false).
        const follow = followStr === "true";

        // Validate pod name if provided (DNS-1123 subdomain, up to 253 chars).
        if (podName) {
          const podPattern = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
          if (!podPattern.test(podName) || podName.length > 253) {
            return reply.status(400).send({
              ok: false,
              error: "invalid request",
            });
          }
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
          reply.type("text/event-stream");
          reply.header("cache-control", "no-cache");
          reply.header("connection", "keep-alive");
          reply.header("x-accel-buffering", "no");

          // Hijack the connection for manual streaming.
          const socket = reply.raw;
          socket.write("HTTP/1.1 200 OK\r\n");
          socket.write("Content-Type: text/event-stream\r\n");
          socket.write("Cache-Control: no-cache\r\n");
          socket.write("Connection: keep-alive\r\n");
          socket.write("X-Accel-Buffering: no\r\n");
          socket.write("\r\n");

          // Set up abort controller for cleanup.
          const abortController = new AbortController();

          // Send ping every 15 seconds.
          const pingInterval = setInterval(() => {
            if (!socket.destroyed) {
              socket.write(": ping\n\n");
            }
          }, 15000);

          // Cleanup function.
          const cleanup = (): void => {
            clearInterval(pingInterval);
            abortController.abort();
            if (!socket.destroyed) {
              socket.destroy();
            }
          };

          // Listen for client disconnect.
          socket.on("close", cleanup);
          socket.on("error", () => cleanup());

          // Request logs from Kubernetes with follow enabled.
          try {
            const logStream = new PassThrough();

            // Start streaming logs (async, no need to await).
            deps.k8s.clients.log
              .log(deps.namespace, selectedPod.name, "app", logStream, {
                tailLines: tail,
                follow: true,
              })
              .catch((err) => {
                req.log.error({ err }, "kubernetes log stream error");
                cleanup();
              });

            // Transform stream to SSE format.
            const transform = new SSELineTransform();
            logStream.pipe(transform);

            // Pipe transformed logs to socket.
            transform.on("data", (chunk: Buffer) => {
              if (!socket.destroyed) {
                socket.write(chunk);
              }
            });

            transform.on("end", () => {
              if (!socket.destroyed) {
                socket.write("event: end\ndata: \n\n");
              }
              cleanup();
            });

            transform.on("error", (err) => {
              req.log.error({ err }, "log stream error");
              cleanup();
            });

            logStream.on("error", (err) => {
              req.log.error({ err }, "log stream write error");
              cleanup();
            });

            // Check for abort signal from cleanup.
            abortController.signal.addEventListener("abort", () => {
              logStream.destroy();
              transform.destroy();
              cleanup();
            });
          } catch (err) {
            req.log.error({ err }, "stream logs failed");
            if (!socket.destroyed) {
              socket.write("data: error\n\n");
              socket.destroy();
            }
          }
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
