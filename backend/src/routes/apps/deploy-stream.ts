import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { getDeployment } from "../../db/deployments-read.js";
import { toDeployDetail } from "../../deploys/serialize.js";
import type { DeployTracker } from "../../deploys/tracker.js";

type StreamDeploymentOpts = {
  reply: FastifyReply;
  req: FastifyRequest;
  db: DatabaseSync;
  tracker: DeployTracker;
  id: number;
  /** Fallback DB reread in ms (tests shorten it). */
  rereadMs?: number;
};

export const DEPLOY_STREAM_PING_MS = 15000;
export const DEPLOY_STREAM_REREAD_MS = 5000;

/**
 * Stream one deploy as SSE: `event: deployment` with the full detail JSON on start and
 * on every change, then `event: end` once it is no longer running. The DB is reread
 * every few seconds too, so a missed emit only delays an update.
 */
export function streamDeployment(opts: StreamDeploymentOpts): void {
  const { reply, req, db, tracker, id } = opts;

  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  reply.raw.flushHeaders?.();

  let done = false;
  let unsubscribe = (): void => {};

  const cleanup = (): void => {
    if (done) return;
    done = true;
    clearInterval(ping);
    clearInterval(reread);
    unsubscribe();
    if (!reply.raw.destroyed) reply.raw.end();
  };

  const write = (chunk: string): void => {
    if (!done && !reply.raw.destroyed) reply.raw.write(chunk);
  };

  /** Send the current state; finish the stream once the deploy is over (or gone). */
  const send = (): void => {
    if (done) return;
    let row;
    try {
      row = getDeployment(db, id);
    } catch (err) {
      req.log.warn({ err, deploymentId: id }, "deploy stream read failed");
      return;
    }
    if (row) write(`event: deployment\ndata: ${JSON.stringify(toDeployDetail(row))}\n\n`);
    if (!row || row.status !== "running") {
      write("event: end\ndata: \n\n");
      cleanup();
    }
  };

  const ping = setInterval(() => write(": ping\n\n"), DEPLOY_STREAM_PING_MS);
  const reread = setInterval(send, opts.rereadMs ?? DEPLOY_STREAM_REREAD_MS);
  unsubscribe = tracker.subscribe(id, send);

  req.raw.on("close", cleanup);
  reply.raw.on("close", cleanup);
  reply.raw.on("error", cleanup);

  send();
}
