import type { CoreV1Api } from "@kubernetes/client-node";
import { apiStatusCode } from "./api-errors.js";
import { appSelector } from "./labels.js";

/** Delete one pod only when it is labelled as belonging to the requested app. */
export async function deleteAppPod(
  core: CoreV1Api,
  namespace: string,
  appName: string,
  podName: string,
): Promise<boolean> {
  const response = await core.listNamespacedPod({
    namespace,
    labelSelector: appSelector(appName),
  });
  const pod = (response.items ?? []).find((item) => item.metadata?.name === podName);
  if (!pod) return false;

  try {
    await core.deleteNamespacedPod({ namespace, name: podName });
    return true;
  } catch (error) {
    if (apiStatusCode(error) === 404) return true;
    throw error;
  }
}
