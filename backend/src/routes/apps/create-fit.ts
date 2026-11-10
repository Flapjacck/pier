import type { FastifyBaseLogger } from "fastify";
import type { K8sClients } from "../../k8s/clients.js";
import { checkResourceFit } from "../../k8s/resource-fit.js";
import { DEFAULT_RESOURCES, mergeResources, resourcesProblem, type PartialAppResources } from "../../k8s/resources.js";
import { InvalidResourcesError } from "../../k8s/update-app.js";

/**
 * Pre-check a new app's CPU/RAM against the namespace quota and LimitRange (#78). Only
 * resources the client set are checked; the defaults always fit the shipped quota.
 * Throws the same errors mapPostAppsError understands.
 */
export async function checkCreateFit(
  clients: K8sClients,
  namespace: string,
  input: { resources?: PartialAppResources; replicas: number; hasVolumes: boolean },
  log: FastifyBaseLogger,
): Promise<void> {
  if (!input.resources) return;
  const merged = mergeResources(DEFAULT_RESOURCES, input.resources);
  const problem = resourcesProblem(merged);
  if (problem) throw new InvalidResourcesError(problem);
  // Apps with volumes run one replica (RWO).
  const replicas = input.hasVolumes ? Math.min(input.replicas, 1) : input.replicas;
  await checkResourceFit(clients.core, namespace, { next: { resources: merged, replicas }, surge: false }, log);
}
