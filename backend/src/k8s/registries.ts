import type { AppsV1Api, CoreV1Api, V1Secret } from "@kubernetes/client-node";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "./labels.js";

export type RegistryCredential = {
  name: string;
  host?: string;
  /** @deprecated Use host. Kept for injected test clients and older callers. */
  registry?: string;
  username: string;
  password: string;
};

export type RegistrySummary = Omit<RegistryCredential, "password"> & { createdAt: string };

const REGISTRY_LABEL = "pier.registry";
const PART_OF_LABEL = "app.kubernetes.io/part-of";
const PART_OF_VALUE = "pier";
const PREFIX = "pier-registry-";

export function registrySecretName(name: string): string {
  return `${PREFIX}${name}`;
}

export function normalizeRegistryHost(host: string): string {
  const value = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return value === "index.docker.io" || value === "index.docker.io/v1" || value === "registry-1.docker.io"
    ? "docker.io"
    : value;
}

export function buildDockerConfig(registry: RegistryCredential): string {
  const host = normalizeRegistryHost(registry.host ?? registry.registry ?? "");
  const entry = {
    username: registry.username,
    password: registry.password,
    auth: Buffer.from(`${registry.username}:${registry.password}`).toString("base64"),
  };
  const auths: Record<string, typeof entry> = { [host]: entry };
  if (host === "docker.io") auths["https://index.docker.io/v1/"] = entry;
  return JSON.stringify({ auths });
}

export function registrySecret(registry: RegistryCredential): V1Secret {
  const host = normalizeRegistryHost(registry.host ?? registry.registry ?? "");
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: registrySecretName(registry.name),
      labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE, [PART_OF_LABEL]: PART_OF_VALUE, [REGISTRY_LABEL]: registry.name },
      annotations: { "pier.registry/host": host, "pier.registry/username": registry.username },
    },
    type: "kubernetes.io/dockerconfigjson",
    data: { ".dockerconfigjson": Buffer.from(buildDockerConfig({ ...registry, host })).toString("base64") },
  };
}

export async function saveRegistry(core: CoreV1Api, namespace: string, value: RegistryCredential): Promise<void> {
  await core.createNamespacedSecret({ namespace, body: registrySecret(value) });
}

export async function replaceRegistry(core: CoreV1Api, namespace: string, value: RegistryCredential): Promise<void> {
  const current = await core.readNamespacedSecret({ namespace, name: registrySecretName(value.name) });
  const next = registrySecret(value);
  next.metadata = { ...next.metadata, resourceVersion: current.metadata?.resourceVersion };
  await core.patchNamespacedSecret({ namespace, name: registrySecretName(value.name), body: next });
}

export async function getRegistry(core: CoreV1Api, namespace: string, name: string): Promise<RegistryCredential | undefined> {
  try {
    const secret = await core.readNamespacedSecret({ namespace, name: registrySecretName(name) });
    return decodeRegistry(secret);
  } catch (error) {
    if (status(error) === 404) return undefined;
    throw error;
  }
}

export async function listRegistries(core: CoreV1Api, namespace: string): Promise<RegistrySummary[]> {
  const response = await core.listNamespacedSecret({
    namespace,
    labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE},${REGISTRY_LABEL}`,
  });
  return (response.items ?? []).flatMap((secret) => {
    const decoded = decodeRegistry(secret);
    return decoded ? [{ name: decoded.name, host: decoded.host, username: decoded.username, createdAt: secret.metadata?.creationTimestamp?.toISOString?.() ?? String(secret.metadata?.creationTimestamp ?? "") }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function registryInUse(apps: AppsV1Api, namespace: string, name: string): Promise<string[]> {
  const deployments = await apps.listNamespacedDeployment({ namespace, labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}` });
  return (deployments.items ?? [])
    .filter((deployment) => deployment.spec?.template?.spec?.imagePullSecrets?.some((secret) => secret.name === registrySecretName(name)))
    .map((deployment) => deployment.metadata?.name)
    .filter((app): app is string => Boolean(app))
    .slice(0, 10);
}

export async function deleteRegistry(core: CoreV1Api, namespace: string, name: string): Promise<boolean> {
  try {
    await core.deleteNamespacedSecret({ namespace, name: registrySecretName(name) });
    return true;
  } catch (error) {
    if (status(error) === 404) return false;
    throw error;
  }
}

function decodeRegistry(secret: V1Secret): RegistryCredential | undefined {
  const name = secret.metadata?.labels?.[REGISTRY_LABEL];
  const raw = secret.data?.[".dockerconfigjson"];
  if (!name || !raw) return undefined;
  try {
    const auths = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
      auths?: Record<string, { username?: string; password?: string }>;
    };
    const entry = Object.entries(auths.auths ?? {})[0];
    if (!entry?.[1]?.username || entry[1].password === undefined) return undefined;
    return { name, host: normalizeRegistryHost(entry[0]), username: entry[1].username, password: entry[1].password };
  } catch {
    return undefined;
  }
}

function status(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}
