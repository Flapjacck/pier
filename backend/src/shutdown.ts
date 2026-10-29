import type { FastifyInstance } from "fastify";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** One-shot SIGINT/SIGTERM handler; force-exit if Fastify close hangs. */
export function registerGracefulShutdown(app: FastifyInstance): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      app.log.info("already shutting down");
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");

    const forceExitTimer = setTimeout(() => {
      app.log.error(
        { timeoutMs: SHUTDOWN_TIMEOUT_MS },
        "shutdown timed out, forcing exit",
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await app.close();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
