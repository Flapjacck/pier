import type { AppsV1Api } from "@kubernetes/client-node";
import { appSelector } from "../labels.js";
import { volumeMountsOf } from "./pod-spec.js";

export type Attachment = { app: string; mountPath: string };

export async function listAttachments(
  apps: AppsV1Api,
  namespace: string,
): Promise<Map<string, Attachment>> {
  const response = await apps.listNamespacedDeployment({ namespace, labelSelector: appSelector() });
  const result = new Map<string, Attachment>();
  for (const deployment of response.items ?? []) {
    if (deployment.metadata?.deletionTimestamp) continue;
    const app = deployment.metadata?.labels?.["pier.app"];
    if (!app) continue;
    for (const mount of volumeMountsOf(deployment)) result.set(mount.name, { app, mountPath: mount.mountPath });
  }
  return result;
}

export { volumeMountsOf };
