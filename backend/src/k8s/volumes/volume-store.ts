import type { AppsV1Api, CoreV1Api, StorageV1Api, V1PersistentVolumeClaim } from "@kubernetes/client-node";
import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import { apiStatusCode, apiErrorMessage } from "../api-errors.js";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";
import { listAttachments } from "./attachments.js";
import { buildPvc, pvcToVolume } from "./pvc.js";
import type { Volume } from "./types.js";
import {
  VolumeExistsError,
  VolumeInUseError,
  VolumeNotFoundError,
  VolumeQuotaExceededError,
} from "./errors.js";
export { VolumeExistsError, VolumeInUseError, VolumeNotFoundError, VolumeQuotaExceededError };

type Clients = { core: CoreV1Api; apps: AppsV1Api; storage?: StorageV1Api };

export async function listVolumes(clients: Clients, namespace: string): Promise<Volume[]> {
  const [pvcs, attachments] = await Promise.all([
    clients.core.listNamespacedPersistentVolumeClaim({ namespace, labelSelector: `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}` }),
    listAttachments(clients.apps, namespace),
  ]);
  return (pvcs.items ?? []).map((pvc) => pvcToVolume(pvc, attachments.get(pvc.metadata?.name ?? "")));
}

export async function getVolume(clients: Clients, namespace: string, name: string): Promise<Volume | undefined> {
  try {
    const pvc = await clients.core.readNamespacedPersistentVolumeClaim({ namespace, name });
    if (pvc.metadata?.labels?.[MANAGED_BY_LABEL] !== MANAGED_BY_VALUE) return undefined;
    const attachments = await listAttachments(clients.apps, namespace);
    return pvcToVolume(pvc, attachments.get(name));
  } catch (err) {
    if (apiStatusCode(err) === 404) return undefined;
    throw err;
  }
}

export async function createVolume(clients: Clients, namespace: string, name: string, size: string): Promise<Volume> {
  if (clients.storage) {
    try {
      await clients.storage.readStorageClass({ name: "pier-local" });
    } catch (err) {
      if (apiStatusCode(err) === 404) {
        throw new Error("StorageClass pier-local not found; re-run deploy-local.sh");
      }
      throw err;
    }
  }
  try {
    const pvc = await clients.core.createNamespacedPersistentVolumeClaim({ namespace, body: buildPvc(name, size) });
    return pvcToVolume(pvc);
  } catch (err) {
    if (apiStatusCode(err) === 409) throw new VolumeExistsError("volume exists");
    if (apiStatusCode(err) === 403 && apiErrorMessage(err)?.toLowerCase().includes("exceeded quota")) {
      throw new VolumeQuotaExceededError(apiErrorMessage(err) ?? "persistent volume quota exceeded");
    }
    throw err;
  }
}

export async function setVolumeAppLabel(core: CoreV1Api, namespace: string, name: string, app: string | null): Promise<void> {
  const labels = app ? { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE, "pier.volume": name, "pier.app": app } : { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE, "pier.volume": name };
  await core.patchNamespacedPersistentVolumeClaim(
    { namespace, name, body: { metadata: { labels } } },
    setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
  );
}

export async function deleteVolume(clients: Clients, namespace: string, name: string): Promise<{ dataRetained: boolean }> {
  const raw = await readManagedPvc(clients.core, namespace, name);
  const attachments = await listAttachments(clients.apps, namespace);
  const attachment = attachments.get(name);
  if (attachment) throw new VolumeInUseError(`volume in use by app "${attachment.app}"`);
  return deleteVolumeResource(clients, namespace, name, raw);
}

export async function deleteVolumeUnchecked(
  clients: Clients,
  namespace: string,
  name: string,
): Promise<{ dataRetained: boolean }> {
  const raw = await readManagedPvc(clients.core, namespace, name);
  return deleteVolumeResource(clients, namespace, name, raw);
}

async function readManagedPvc(
  core: CoreV1Api,
  namespace: string,
  name: string,
): Promise<V1PersistentVolumeClaim> {
  const raw = await core.readNamespacedPersistentVolumeClaim({ namespace, name }).catch((err: unknown) => {
    if (apiStatusCode(err) === 404) throw new VolumeNotFoundError("volume not found");
    throw err;
  });
  if (raw.metadata?.labels?.[MANAGED_BY_LABEL] !== MANAGED_BY_VALUE) {
    throw new VolumeNotFoundError("volume not found");
  }
  return raw;
}

async function deleteVolumeResource(
  clients: Clients,
  namespace: string,
  name: string,
  raw: V1PersistentVolumeClaim,
): Promise<{ dataRetained: boolean }> {
  let dataRetained = false;
  const pvName = raw.spec?.volumeName;
  if (pvName) {
    try {
      const pv = await clients.core.readPersistentVolume({ name: pvName });
      if (pv.spec?.persistentVolumeReclaimPolicy !== "Delete") {
      await clients.core.patchPersistentVolume(
        { name: pvName, body: { spec: { persistentVolumeReclaimPolicy: "Delete" } } },
        setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
      );
      }
    } catch (err) {
      dataRetained = true;
      // The PVC is still deleted; operators can clean up the retained PV manually.
      console.warn(`volume ${name}: unable to flip PV ${pvName} reclaim policy`, err);
    }
  }
  await clients.core.deleteNamespacedPersistentVolumeClaim({ namespace, name });
  return { dataRetained };
}
