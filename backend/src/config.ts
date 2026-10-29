/** Runtime settings from environment (no secrets in repo). */

export type Config = {
  port: number;
  host: string;
  kubeconfig: string | undefined;
  namespace: string;
};

function parsePort(raw: string | undefined): number {
  const value = raw ?? "3000";
  const trimmed = value.trim();

  if (trimmed === "" || !/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid PORT "${value}": must be an integer between 1 and 65535`,
    );
  }

  const port = Number(trimmed);
  if (port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT "${value}": must be an integer between 1 and 65535`,
    );
  }

  return port;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" || trimmed === undefined ? undefined : trimmed;
}

/** Pure env parsing so tests can pass a fixture object without touching process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || "0.0.0.0",
    kubeconfig: optionalNonEmpty(env.KUBECONFIG),
    namespace: env.PIER_NAMESPACE?.trim() || "pier-apps",
  };
}
