import type { FastifyReply, FastifyRequest } from "fastify";
import type { Log } from "@kubernetes/client-node";
import { PassThrough } from "node:stream";
import { SSELineTransform } from "./logs-sse.js";

interface StreamSseLogsOpts {
  reply: FastifyReply;
  req: FastifyRequest;
  logClient: Log;
  namespace: string;
  podName: string;
  tail: number;
}

/**
 * Stream logs as Server-Sent Events (SSE) with proper headers, UTF-8 encoding,
 * and graceful cleanup on client disconnect.
 */
export async function streamSseLogs(opts: StreamSseLogsOpts): Promise<void> {
  const { reply, req, logClient, namespace, podName, tail } = opts;

  // Hijack raw socket and write proper SSE headers (no hand-written status line).
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  reply.raw.flushHeaders?.();

  // Create upstream and transform streams.
  const upstream = new PassThrough();
  const transform = new SSELineTransform();
  upstream.pipe(transform);

  // Track cleanup state to ensure it runs once.
  let done = false;

  // Cleanup function that stops the stream and clears resources.
  const cleanup = (): void => {
    if (done) return;
    done = true;

    clearInterval(pingInterval);
    upstreamController?.abort();

    if (!reply.raw.destroyed) {
      transform.unpipe();
      transform.destroy();
      upstream.destroy();
    }

    if (!reply.raw.destroyed) {
      reply.raw.end();
    }
  };

  // Send `: ping\n\n` comment every 15 seconds to keep connection alive.
  const pingInterval = setInterval(() => {
    if (!reply.raw.destroyed && !done) {
      reply.raw.write(": ping\n\n");
    }
  }, 15000);

  // Pipe transformed logs to the raw socket.
  transform.on("data", (chunk: Buffer) => {
    if (!reply.raw.destroyed && !done) {
      reply.raw.write(chunk);
    }
  });

  // When upstream ends normally, write end marker then cleanup.
  transform.on("end", () => {
    if (!reply.raw.destroyed && !done) {
      reply.raw.write("event: end\ndata: \n\n");
    }
    cleanup();
  });

  // Forward transform errors.
  transform.on("error", () => {
    cleanup();
  });

  // Forward upstream errors.
  upstream.on("error", () => {
    cleanup();
  });

  // Wire cleanup to socket close/error events.
  reply.raw.on("close", cleanup);
  reply.raw.on("error", cleanup);

  // Store controller so cleanup can abort it.
  let upstreamController: AbortController | undefined;

  // Request logs from Kubernetes with follow enabled.
  try {
    // Start the log stream and capture the AbortController.
    upstreamController = await logClient.log(namespace, podName, "app", upstream, {
      tailLines: tail,
      follow: true,
    });

    // If client already disconnected while awaiting, abort immediately.
    if (done) {
      upstreamController?.abort();
    }
  } catch (err) {
    req.log.error({ err }, "kubernetes log stream error");
    if (!reply.raw.destroyed && !done) {
      reply.raw.write("event: error\ndata: upstream error\n\n");
    }
    cleanup();
  }
}
