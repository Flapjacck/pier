/** Runtime settings from environment (no secrets in repo). */

export type Config = {
  port: number;
  host: string;
  apiToken: string | undefined;
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

/**
 * Check if a host is a loopback address (safe to use without PIER_API_TOKEN).
 * Returns true for 127.0.0.0/8, ::1, or "localhost".
 */
function isLoopback(host: string): boolean {
  const trimmed = host.trim();
  // 127.0.0.0/8 range
  if (trimmed.startsWith("127.")) return true;
  // IPv6 loopback
  if (trimmed === "::1") return true;
  // Hostname
  if (trimmed.toLowerCase() === "localhost") return true;
  return false;
}

/** Pure env parsing so tests can pass a fixture object without touching process.env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST?.trim() || "127.0.0.1";
  const apiToken = optionalNonEmpty(env.PIER_API_TOKEN);

  // Refuse to listen on non-loopback without a token (security gate before bind).
  if (!isLoopback(host) && !apiToken) {
    throw new Error(
      `Refusing to listen on ${host} without PIER_API_TOKEN set`,
    );
  }

  return {
    port: parsePort(env.PORT),
    host,
    apiToken,
    kubeconfig: optionalNonEmpty(env.KUBECONFIG),
    namespace: env.PIER_NAMESPACE?.trim() || "pier-apps",
  };
}
