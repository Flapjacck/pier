import type { V1Deployment, V1ObjectMeta, V1PodSpec, V1PodTemplateSpec, V1Container, V1Probe, V1SecurityContext, V1PodSecurityContext, V1EnvVar, V1Service, V1ServiceSpec, V1ServicePort, V1OwnerReference, V1DeploymentSpec } from "@kubernetes/client-node";
import { APP_LABEL, appLabels } from "../labels.js";
import { PROGRESS_DEADLINE_SECONDS } from "./constants.js";
import { DEFAULT_RESOURCES, mergeResources, toContainerResources, type PartialAppResources } from "../resources.js";
import { strategyFor, withVolumes } from "../volumes/pod-spec.js";
import type { VolumeMount } from "../volumes/types.js";

/** Input for building Deployment, Service, and Ingress manifests. */
export type CreateAppInput = {
  name: string;
  image: string;
  port: number;
  replicas: number;
  host?: string;
  env?: Record<string, string>;
  /** CPU/RAM requests and limits; missing fields default to DEFAULT_RESOURCES. */
  resources?: PartialAppResources;
  volumes?: VolumeMount[];
  /** Name of a Pier-managed registry Secret to use for image pulls. */
  registry?: string;
  /** cert-manager ClusterIssuer (PIER_TLS_ISSUER). Set: the Ingress gets TLS. */
  tlsIssuer?: string;
};

/**
 * Build a Deployment manifest with all required security and resource settings.
 * Pod Security baseline enforced in pier-apps.
 */
export function buildDeployment(input: CreateAppInput): V1Deployment {
  const labels = appLabels(input.name);
  const env: V1EnvVar[] = [];
  if (input.env) {
    const keys = Object.keys(input.env).sort();
    for (const key of keys) {
      env.push({
        name: key,
        value: input.env[key],
      });
    }
  }

  const resources = toContainerResources(mergeResources(DEFAULT_RESOURCES, input.resources));

  const readinessProbe: V1Probe = {
    tcpSocket: {
      port: input.port,
    },
    initialDelaySeconds: 2,
    periodSeconds: 5,
  };

  const containerSecurityContext: V1SecurityContext = {
    allowPrivilegeEscalation: false,
    capabilities: {
      drop: ["ALL"],
    },
  };

  const container: V1Container = {
    name: "app",
    image: input.image,
    imagePullPolicy: "IfNotPresent",
    ports: [
      {
        name: "http",
        containerPort: input.port,
      },
    ],
    env,
    readinessProbe,
    resources,
    securityContext: containerSecurityContext,
  };

  const podSecurityContext: V1PodSecurityContext = {
    seccompProfile: {
      type: "RuntimeDefault",
    },
  };

  const podSpec: V1PodSpec = withVolumes({
    automountServiceAccountToken: false,
    securityContext: podSecurityContext,
    containers: [container],
  }, container, input.volumes ?? []);
  if (input.registry) podSpec.imagePullSecrets = [{ name: `pier-registry-${input.registry}` }];

  const templateSpec: V1PodTemplateSpec = {
    metadata: {
      labels: { ...labels, ...(input.registry ? { "pier.registry": input.registry } : {}) },
    },
    spec: podSpec,
  };

  const deploymentSpec: V1DeploymentSpec = {
    replicas: input.volumes && input.volumes.length > 0 ? Math.min(input.replicas, 1) : input.replicas,
    strategy: strategyFor(input.volumes ?? []),
    selector: {
      matchLabels: {
        [APP_LABEL]: input.name,
      },
    },
    template: templateSpec,
    progressDeadlineSeconds: PROGRESS_DEADLINE_SECONDS,
  };

  const metadata: V1ObjectMeta = {
    name: input.name,
    labels: { ...labels, ...(input.registry ? { "pier.registry": input.registry } : {}) },
  };

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata,
    spec: deploymentSpec,
  };
}

/**
 * Build a Service manifest (always ClusterIP).
 * Add owner reference if deployment name is provided for garbage collection.
 */
export function buildService(
  input: CreateAppInput,
  deploymentUid?: string,
): V1Service {
  const labels = appLabels(input.name);
  const port: V1ServicePort = {
    name: "http",
    port: 80,
    targetPort: input.port,
  };

  const spec: V1ServiceSpec = {
    type: "ClusterIP",
    selector: {
      [APP_LABEL]: input.name,
    },
    ports: [port],
  };

  const metadata: V1ObjectMeta = {
    name: input.name,
    labels,
  };

  if (deploymentUid) {
    const ownerRef: V1OwnerReference = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: input.name,
      uid: deploymentUid,
      blockOwnerDeletion: false,
      controller: false,
    };
    metadata.ownerReferences = [ownerRef];
  }

  return {
    apiVersion: "v1",
    kind: "Service",
    metadata,
    spec,
  };
}

export { buildIngress, type IngressTls } from "./ingress.js";
