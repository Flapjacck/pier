import type { V1PersistentVolumeClaim } from "@kubernetes/client-node";
import { MANAGED_BY_LABEL, MANAGED_BY_VALUE } from "../labels.js";
import type { Volume } from "./types.js";

export function buildPvc(name: string, size: string): V1PersistentVolumeClaim {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: {
      name,
      labels: { [MANAGED_BY_LABEL]: MANAGED_BY_VALUE, "pier.volume": name },
    },
    spec: {
      accessModes: ["ReadWriteOnce"],
      storageClassName: "pier-local",
      resources: { requests: { storage: size } },
    },
  };
}

export function pvcToVolume(
  pvc: V1PersistentVolumeClaim,
  attachment?: { app: string; mountPath: string },
): Volume {
  const phase = pvc.status?.phase;
  return {
    name: pvc.metadata?.name ?? "",
    size: pvc.spec?.resources?.requests?.storage ?? "",
    status: phase === "Bound" ? "bound" : phase === "Lost" ? "lost" : "pending",
    ...(attachment ? { app: attachment.app, mountPath: attachment.mountPath } : {}),
    createdAt: pvc.metadata?.creationTimestamp
      ? new Date(pvc.metadata.creationTimestamp).toISOString()
      : new Date(0).toISOString(),
  };
}
