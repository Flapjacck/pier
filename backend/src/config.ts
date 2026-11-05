/** Runtime settings from environment (no secrets in repo). */
import { parseTrustProxy, type TrustProxy } from "./trust-proxy.js";

export type Config = {
  port: number;
  host: string;
  apiToken: string | undefined;
  kubeconfig: string | undefined;
  namespace: string;
  ingressDomain: string | undefined;
  publicDir: string | undefined;
  /** Peers allowed to set X-Forwarded-* (PIER_TRUST_PROXY); see trust-proxy.ts. */
  trustProxy: TrustProxy;
  dashboardHost: string | undefined;
  tlsIssuer: string | undefined;
  /** SQLite file for the audit log and login limiter (PIER_DB_PATH). ":memory:" in tests. */
  dbPath: string;
  /** Audit rows older than this many days are pruned (PIER_AUDIT_RETENTION_DAYS). */
  auditRetentionDays: number;
  /** A deploy still rolling out after this many seconds fails (PIER_DEPLOY_TIMEOUT_SECONDS). */
  deployTimeoutSeconds: number;
  /** Host:port written into Deployment image refs (PIER_BUILD_REGISTRY). Default localhost:30500. */
  buildRegistry: string;
  /**
   * Host:port Kaniko pushes to (PIER_BUILD_PUSH_REGISTRY).
   * Defaults to registry.<buildNamespace>.svc.cluster.local:5000 so Jobs can
   * reach the in-cluster registry; pull refs stay on buildRegistry (NodePort).
   */
  buildPushRegistry: string;
  /** Namespace for the registry and Kaniko Jobs (PIER_BUILD_NAMESPACE). */
  buildNamespace: string;
  /** Max seconds a Dockerfile build may run (PIER_BUILD_TIMEOUT_SECONDS). */
  buildTimeoutSeconds: number;
  /** Kaniko executor image (PIER_KANIKO_IMAGE). */
  kanikoImage: string;
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

function parseRetentionDays(raw: string | undefined): number {
  const value = raw?.trim() ?? "";
  if (value === "") return 90;
  const days = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error(
      `Invalid PIER_AUDIT_RETENTION_DAYS "${raw}": must be an integer between 1 and 3650`,
    );
  }
  return days;
}

function parseDeployTimeout(raw: string | undefined): number {
  const value = raw?.trim() ?? "";
  if (value === "") return 300;
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 3600) {
    throw new Error(`Invalid PIER_DEPLOY_TIMEOUT_SECONDS "${raw}": must be an integer between 30 and 3600`);
  }
  return seconds;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" || trimmed === undefined ? undefined : trimmed;
}

/**
 * Parse a boolean flag from a string.
 * "true" or "1" → true, anything else → false (no error).
 */
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


function parseBuildTimeout(raw: string | undefined): number {
  const value = raw?.trim() ?? "";
  if (value === "") return 900;
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 3600) {
    throw new Error(`Invalid PIER_BUILD_TIMEOUT_SECONDS "${raw}": must be an integer between 60 and 3600`);
  }
  return seconds;
}

function parseBuildRegistry(raw: string | undefined): string {
  const value = (raw?.trim() || "localhost:30500").toLowerCase();
  // host:port only — no scheme, path, or spaces.
  if (!/^[a-z0-9._-]+:[1-9][0-9]{0,4}$/.test(value)) {
    throw new Error(
      `Invalid PIER_BUILD_REGISTRY "${raw}": must be host:port (e.g. localhost:30500)`,
    );
  }
  const port = Number(value.split(":").pop());
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PIER_BUILD_REGISTRY "${raw}": port must be 1-65535`);
  }
  return value;
}

function parseBuildPushRegistry(raw: string | undefined, buildNamespace: string): string {
  const fallback = `registry.${buildNamespace}.svc.cluster.local:5000`;
  const value = (raw?.trim() || fallback).toLowerCase();
  if (!/^[a-z0-9._-]+:[1-9][0-9]{0,4}$/.test(value)) {
    throw new Error(
      `Invalid PIER_BUILD_PUSH_REGISTRY "${raw}": must be host:port (e.g. ${fallback})`,
    );
  }
  const port = Number(value.split(":").pop());
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PIER_BUILD_PUSH_REGISTRY "${raw}": port must be 1-65535`);
  }
  return value;
}

function parseBuildNamespace(raw: string | undefined): string {
  const value = raw?.trim() || "pier-system";
  if (!/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error(`Invalid PIER_BUILD_NAMESPACE "${raw}": must be a DNS-1123 label`);
  }
  return value;
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

  // Parse dashboard host (optional, must be DNS-1123 if provided).
  const dashboardHostRaw = optionalNonEmpty(env.PIER_DASHBOARD_HOST);
  let dashboardHost: string | undefined;
  if (dashboardHostRaw) {
    const dnsPattern = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!dnsPattern.test(dashboardHostRaw.toLowerCase())) {
      throw new Error(
        `Invalid PIER_DASHBOARD_HOST "${dashboardHostRaw}": must be a valid DNS-1123 hostname`,
      );
    }
    dashboardHost = dashboardHostRaw.toLowerCase();
  }

  // Parse TLS issuer (optional cert-manager ClusterIssuer name, DNS-1123 subdomain).
  const tlsIssuerRaw = optionalNonEmpty(env.PIER_TLS_ISSUER);
  if (tlsIssuerRaw !== undefined) {
    const subdomain = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
    if (tlsIssuerRaw.length > 253 || !subdomain.test(tlsIssuerRaw)) {
      throw new Error(
        `Invalid PIER_TLS_ISSUER "${tlsIssuerRaw}": must be a ClusterIssuer name (lowercase letters, digits, '-' and '.')`,
      );
    }
  }

  const buildNamespace = parseBuildNamespace(env.PIER_BUILD_NAMESPACE);
  return {
    port: parsePort(env.PORT),
    host,
    apiToken,
    kubeconfig: optionalNonEmpty(env.KUBECONFIG),
    namespace: env.PIER_NAMESPACE?.trim() || "pier-apps",
    ingressDomain,
    publicDir: optionalNonEmpty(env.PIER_PUBLIC_DIR),
    trustProxy: parseTrustProxy(env.PIER_TRUST_PROXY),
    dashboardHost,
    tlsIssuer: tlsIssuerRaw,
    dbPath: optionalNonEmpty(env.PIER_DB_PATH) ?? "./data/pier.db",
    auditRetentionDays: parseRetentionDays(env.PIER_AUDIT_RETENTION_DAYS),
    deployTimeoutSeconds: parseDeployTimeout(env.PIER_DEPLOY_TIMEOUT_SECONDS),
    buildRegistry: parseBuildRegistry(env.PIER_BUILD_REGISTRY),
    buildPushRegistry: parseBuildPushRegistry(env.PIER_BUILD_PUSH_REGISTRY, buildNamespace),
    buildNamespace,
    buildTimeoutSeconds: parseBuildTimeout(env.PIER_BUILD_TIMEOUT_SECONDS),
    kanikoImage: optionalNonEmpty(env.PIER_KANIKO_IMAGE) ?? "gcr.io/kaniko-project/executor:v1.23.2",
  };
}
