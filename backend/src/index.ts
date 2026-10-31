import { buildApp } from "./app";
import { loadConfig } from "./config";
import { registerGracefulShutdown } from "./shutdown";

(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  const app = await buildApp(config);
  registerGracefulShutdown(app);

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
