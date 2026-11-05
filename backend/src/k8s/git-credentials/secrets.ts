import type { CoreV1Api, V1Secret } from "@kubernetes/client-node";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";

export type GitCredential = {
  name: string;
  username: string;
  token: string;
  createdAt?: string;
};

export type GitCredentialSummary = { name: string; username: string; createdAt: string };

const PART_OF = "app.kubernetes.io/part-of";
const GIT_LABEL = "pier.git-credential";
const PREFIX = "pier-git-";

export function gitCredentialSecretName(name: string): string {
  return `${PREFIX}${name}`;
}

export function gitCredentialSecret(value: GitCredential): V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: gitCredentialSecretName(value.name),
      labels: {
        [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
        [PART_OF]: "pier",
        [GIT_LABEL]: value.name,
      },
      annotations: { "pier.git/username": value.username },
    },
    type: "Opaque",
    data: {
      username: Buffer.from(value.username).toString("base64"),
      token: Buffer.from(value.token).toString("base64"),
    },
  };
}

function decode(secret: V1Secret): GitCredential | undefined {
  const name = secret.metadata?.labels?.[GIT_LABEL];
  if (!name || !secret.data?.username || !secret.data?.token) return undefined;
  return {
    name,
    username: Buffer.from(secret.data.username, "base64").toString("utf8"),
    token: Buffer.from(secret.data.token, "base64").toString("utf8"),
    createdAt: secret.metadata?.creationTimestamp
      ? new Date(secret.metadata.creationTimestamp).toISOString()
      : undefined,
  };
}

function status(error: unknown): number | undefined {
  return (error as { response?: { statusCode?: number }; statusCode?: number }).response?.statusCode
    ?? (error as { statusCode?: number }).statusCode;
}

export async function saveGitCredential(core: CoreV1Api, namespace: string, value: GitCredential): Promise<void> {
  await core.createNamespacedSecret({ namespace, body: gitCredentialSecret(value) });
}

export async function replaceGitCredential(core: CoreV1Api, namespace: string, value: GitCredential): Promise<void> {
  const current = await core.readNamespacedSecret({ namespace, name: gitCredentialSecretName(value.name) });
  const next = gitCredentialSecret(value);
  next.metadata = { ...next.metadata, resourceVersion: current.metadata?.resourceVersion };
  await core.patchNamespacedSecret({ namespace, name: gitCredentialSecretName(value.name), body: next });
}

export async function getGitCredential(
  core: CoreV1Api,
  namespace: string,
  name: string,
): Promise<GitCredential | undefined> {
  try {
    const secret = await core.readNamespacedSecret({ namespace, name: gitCredentialSecretName(name) });
    return decode(secret);
  } catch (error) {
    if (status(error) === 404) return undefined;
    throw error;
  }
}

export async function listGitCredentials(core: CoreV1Api, namespace: string): Promise<GitCredentialSummary[]> {
  const res = await core.listNamespacedSecret({
    namespace,
    labelSelector: `${GIT_LABEL}`,
  });
  const out: GitCredentialSummary[] = [];
  for (const secret of res.items) {
    const decoded = decode(secret);
    if (!decoded) continue;
    out.push({
      name: decoded.name,
      username: decoded.username,
      createdAt: decoded.createdAt ?? new Date().toISOString(),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteGitCredential(core: CoreV1Api, namespace: string, name: string): Promise<void> {
  await core.deleteNamespacedSecret({ namespace, name: gitCredentialSecretName(name) });
}

/** True when any app_sources row references this credential — checked by the route via SQLite. */
