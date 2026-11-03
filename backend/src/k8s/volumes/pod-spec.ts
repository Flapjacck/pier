import type { V1Container, V1PodSpec, V1Volume, V1VolumeMount, V1DeploymentStrategy } from "@kubernetes/client-node";
import type { VolumeMount } from "./types.js";

export function volumeMountsOf(deployment: { spec?: { template?: { spec?: V1PodSpec } } }): VolumeMount[] {
  const spec = deployment.spec?.template?.spec;
  const container = spec?.containers?.[0];
  return (container?.volumeMounts ?? []).flatMap((mount) => {
    const claim = spec?.volumes?.find((volume) => volume.name === mount.name)?.persistentVolumeClaim?.claimName;
    return claim ? [{ name: claim, mountPath: mount.mountPath }] : [];
  });
}

export function withVolumes(spec: V1PodSpec, container: V1Container, mounts: VolumeMount[]): V1PodSpec {
  const volumes: V1Volume[] = mounts.map((mount) => ({
    name: `vol-${mount.name}`,
    persistentVolumeClaim: { claimName: mount.name, readOnly: false },
  }));
  const volumeMounts: V1VolumeMount[] = mounts.map((mount) => ({
    name: `vol-${mount.name}`,
    mountPath: mount.mountPath,
  }));
  const nextContainer = { ...container, volumeMounts };
  const containers = (spec.containers ?? []).map((item) =>
    item.name === container.name ? nextContainer : item,
  );
  return { ...spec, containers, volumes };
}

export function strategyFor(mounts: VolumeMount[]): V1DeploymentStrategy {
  return mounts.length ? { type: "Recreate" } : { type: "RollingUpdate" };
}
