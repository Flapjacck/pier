import {
  V1Deployment,
  V1DeploymentSpec,
  V1ObjectMeta,
  V1PodSpec,
  V1PodTemplateSpec,
  V1Container,
  V1Probe,
  V1SecurityContext,
  V1PodSecurityContext,
  V1ResourceRequirements,
  V1EnvVar,
  V1Service,
  V1ServiceSpec,
  V1ServicePort,
  V1Ingress,
  V1IngressSpec,
  V1IngressRule,
  V1HTTPIngressRuleValue,
  V1HTTPIngressPath,
  V1IngressBackend,
  V1OwnerReference,
} from "@kubernetes/client-node";
import { APP_LABEL, appLabels } from "./labels.js";

/** Input for building Deployment, Service, and Ingress manifests. */
export type CreateAppInput = {
  name: string;
  image: string;
  port: number;
  replicas: number;
  host?: string;
  env?: Record<string, string>;
};

// Resource quantity constants.
export const CPU_REQUEST = "50m";
export const CPU_LIMIT = "500m";
export const MEMORY_REQUEST = "64Mi";
export const MEMORY_LIMIT = "256Mi";
export const EPHEMERAL_STORAGE_REQUEST = "64Mi";
export const EPHEMERAL_STORAGE_LIMIT = "1Gi";

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

  const resources: V1ResourceRequirements = {
    requests: {
      cpu: CPU_REQUEST,
      memory: MEMORY_REQUEST,
      "ephemeral-storage": EPHEMERAL_STORAGE_REQUEST,
    },
    limits: {
      cpu: CPU_LIMIT,
      memory: MEMORY_LIMIT,
      "ephemeral-storage": EPHEMERAL_STORAGE_LIMIT,
    },
  };

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

  const podSpec: V1PodSpec = {
    automountServiceAccountToken: false,
    securityContext: podSecurityContext,
    containers: [container],
  };

  const templateSpec: V1PodTemplateSpec = {
    metadata: {
      labels,
    },
    spec: podSpec,
  };

  const deploymentSpec: V1DeploymentSpec = {
    replicas: input.replicas,
    selector: {
      matchLabels: {
        [APP_LABEL]: input.name,
      },
    },
    template: templateSpec,
  };

  const metadata: V1ObjectMeta = {
    name: input.name,
    labels,
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

/**
 * Build an Ingress manifest for exposing an app at a domain.
 * Only callable when host is provided.
 * Add owner reference if deployment UID is provided for garbage collection.
 */
export function buildIngress(
  input: CreateAppInput,
  deploymentUid?: string,
): V1Ingress {
  if (!input.host) {
    throw new Error("buildIngress requires input.host to be set");
  }

  const labels = appLabels(input.name);
  const backend: V1IngressBackend = {
    service: {
      name: input.name,
      port: {
        number: 80,
      },
    },
  };

  const path: V1HTTPIngressPath = {
    path: "/",
    pathType: "Prefix",
    backend,
  };

  const httpRule: V1HTTPIngressRuleValue = {
    paths: [path],
  };

  const rule: V1IngressRule = {
    host: input.host,
    http: httpRule,
  };

  const spec: V1IngressSpec = {
    ingressClassName: "traefik",
    rules: [rule],
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
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata,
    spec,
  };
}
