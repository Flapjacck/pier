import type { CoreV1Api, V1Secret } from "@kubernetes/client-node";
import { apiStatusCode } from "../api-errors.js";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";

/**
 * Git credentials for private repos (#83): a username and token in a write-only Secret
 * in the build namespace, so build Jobs can mount them with secretKeyRef and the token
 * never goes back over the API. Mirrors the #82 registry Secrets.
 */
export type GitCredential = { name: string; username: string; token: string; createdAt?: string };
export type GitCredentialSummary = { name: string; username: string; createdAt: string };

const PART_OF = "app.kubernetes.io/part-of";
const GIT_LABEL = "pier.git-credential";
const PREFIX = "pier-git-";
/** Secret keys the build Job reads (see builds/job.ts). */
export const GIT_USERNAME_KEY = "username";
export const GIT_TOKEN_KEY = "token";

export function gitCredentialSecretName(name: string): string {
  return `${PREFIX}${name}`;
}

export function gitCredentialSecret(value: GitCredential): V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: gitCredentialSecretName(value.name),
      labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE, [PART_OF]: "pier", [GIT_LABEL]: value.name },
    },
    type: "Opaque",
    data: {
      [GIT_USERNAME_KEY]: Buffer.from(value.username).toString("base64"),
      [GIT_TOKEN_KEY]: Buffer.from(value.token).toString("base64"),
    },
  };
}

function decode(secret: V1Secret): GitCredential | undefined {
  const name = secret.metadata?.labels?.[GIT_LABEL];
  const data = secret.data;
  if (!name || !data?.[GIT_USERNAME_KEY] || !data[GIT_TOKEN_KEY]) return undefined;
  const created = secret.metadata?.creationTimestamp;
  return {
    name,
    username: Buffer.from(data[GIT_USERNAME_KEY], "base64").toString("utf8"),
    token: Buffer.from(data[GIT_TOKEN_KEY], "base64").toString("utf8"),
    createdAt: created ? new Date(created).toISOString() : undefined,
  };
}

export function summarizeGitCredential(value: GitCredential): GitCredentialSummary {
  return { name: value.name, username: value.username, createdAt: value.createdAt ?? new Date().toISOString() };
}

export async function saveGitCredential(core: CoreV1Api, namespace: string, value: GitCredential): Promise<void> {
  await core.createNamespacedSecret({ namespace, body: gitCredentialSecret(value) });
}

/** Replace the Secret's data (a strategic merge patch keeps nothing stale: both keys are always set). */
export async function replaceGitCredential(core: CoreV1Api, namespace: string, value: GitCredential): Promise<void> {
  await core.patchNamespacedSecret({ namespace, name: gitCredentialSecretName(value.name), body: gitCredentialSecret(value) });
}

/** The credential, or undefined when its Secret doesn't exist (or isn't one of ours). */
export async function getGitCredential(core: CoreV1Api, namespace: string, name: string): Promise<GitCredential | undefined> {
  try {
    return decode(await core.readNamespacedSecret({ namespace, name: gitCredentialSecretName(name) }));
  } catch (error) {
    if (apiStatusCode(error) === 404) return undefined;
    throw error;
  }
}

export async function listGitCredentials(core: CoreV1Api, namespace: string): Promise<GitCredentialSummary[]> {
  const res = await core.listNamespacedSecret({ namespace, labelSelector: GIT_LABEL });
  return res.items
    .map(decode)
    .filter((value): value is GitCredential => value !== undefined)
    .map(summarizeGitCredential)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteGitCredential(core: CoreV1Api, namespace: string, name: string): Promise<void> {
  try {
    await core.deleteNamespacedSecret({ namespace, name: gitCredentialSecretName(name) });
  } catch (error) {
    if (apiStatusCode(error) !== 404) throw error;
  }
}
