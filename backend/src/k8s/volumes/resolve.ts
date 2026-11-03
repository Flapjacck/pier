import type { AppsV1Api, CoreV1Api } from "@kubernetes/client-node";
import { listAttachments } from "./attachments.js";
import { createVolume, setVolumeAppLabel } from "./volume-store.js";
import { mountProblems } from "./validation.js";
import type { VolumeMount } from "./types.js";
import {
  InvalidVolumesError,
  VolumeInUseError,
  VolumeNotFoundError,
  VolumesReplicaError,
} from "./errors.js";

type Clients = { apps: AppsV1Api; core: CoreV1Api; storage?: import("@kubernetes/client-node").StorageV1Api };
export type ResolvedVolumes = { created: string[]; attached: string[] };

export async function resolveVolumes(clients: Clients, namespace: string, app: string, mounts: VolumeMount[], replicas: number): Promise<ResolvedVolumes> {
  if (mounts.length && replicas > 1) throw new VolumesReplicaError("apps with volumes run at most 1 replica");
  const problem = mountProblems(mounts);
  if (problem) throw new InvalidVolumesError(problem);
  const result: ResolvedVolumes = { created: [], attached: [] };
  if (!mounts.length) return result;
  const attachments = await listAttachments(clients.apps, namespace);
  const pvcList = await clients.core.listNamespacedPersistentVolumeClaim({
    namespace,
    labelSelector: "app.kubernetes.io/managed-by=pier",
  });
  const existing = new Map((pvcList.items ?? []).map((pvc) => [pvc.metadata?.name ?? "", pvc]));
  try {
    for (const mount of mounts) {
      const attachment = attachments.get(mount.name);
      if (attachment && attachment.app !== app) {
        throw new VolumeInUseError(`volume in use by app "${attachment.app}"`);
      }
      if (!existing.has(mount.name)) {
        if (!mount.size) throw new VolumeNotFoundError("volume not found");
        await createVolume(clients, namespace, mount.name, mount.size);
        result.created.push(mount.name);
      }
      await setVolumeAppLabel(clients.core, namespace, mount.name, app);
      result.attached.push(mount.name);
    }
  } catch (err) {
    await rollbackResolvedVolumes(clients, namespace, result);
    throw err;
  }
  return result;
}

export async function rollbackResolvedVolumes(
  clients: Clients,
  namespace: string,
  resolved: ResolvedVolumes,
): Promise<void> {
  for (const name of resolved.created) {
    try {
      await clients.core.deleteNamespacedPersistentVolumeClaim({ namespace, name });
    } catch {
      // Best effort: preserve the original operation error.
    }
  }
  for (const name of resolved.attached) {
    if (resolved.created.includes(name)) continue;
    try {
      await setVolumeAppLabel(clients.core, namespace, name, null);
    } catch {
      // Best effort: preserve the original operation error.
    }
  }
}
