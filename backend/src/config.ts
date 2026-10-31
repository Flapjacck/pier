/** Runtime settings from environment (no secrets in repo). */

export type Config = {
  port: number;
  host: string;
  apiToken: string | undefined;
  kubeconfig: string | undefined;
  namespace: string;
  ingressDomain: string | undefined;
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
 * Parse and validate an ingress domain.
 * Format: lowercase DNS name with 2+ labels, ≤253 chars total.
 * Each label must match [a-z0-9]([-a-z0-9]{0,61}[a-z0-9])? (DNS-1035 compatible).
 */
function parseIngressDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  
  if (trimmed === "") {
    return ""; // Empty → undefined after the caller checks
  }

  if (trimmed.length > 253) {
    throw new Error(
      `Invalid PIER_INGRESS_DOMAIN "${raw}": must be ≤253 characters (got ${trimmed.length})`,
    );
  }

  const labels = trimmed.split(".");
  if (labels.length < 2) {
    throw new Error(
      `Invalid PIER_INGRESS_DOMAIN "${raw}": must have at least 2 labels (e.g. example.com)`,
    );
  }

  const labelPattern = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
  for (const label of labels) {
    if (!labelPattern.test(label)) {
      throw new Error(
        `Invalid PIER_INGRESS_DOMAIN "${raw}": label "${label}" must start with a letter or digit, end with a letter or digit, and contain only lowercase letters, digits, and hyphens`,
      );
    }
  }

  return trimmed;
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

  // Parse ingress domain: empty string becomes undefined.
  const ingressDomainRaw = optionalNonEmpty(env.PIER_INGRESS_DOMAIN);
  let ingressDomain: string | undefined;
  if (ingressDomainRaw) {
    const parsed = parseIngressDomain(ingressDomainRaw);
    ingressDomain = parsed === "" ? undefined : parsed;
  }

  return {
    port: parsePort(env.PORT),
    host,
    apiToken,
    kubeconfig: optionalNonEmpty(env.KUBECONFIG),
    namespace: env.PIER_NAMESPACE?.trim() || "pier-apps",
    ingressDomain,
  };
}
