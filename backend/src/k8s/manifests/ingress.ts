import type { V1Ingress, V1IngressSpec, V1IngressRule, V1HTTPIngressRuleValue, V1HTTPIngressPath, V1IngressBackend, V1ObjectMeta, V1OwnerReference } from "@kubernetes/client-node";
import { appLabels } from "../labels.js";
import { CLUSTER_ISSUER_ANNOTATION, HTTPS_REDIRECT_MIDDLEWARE, ROUTER_MIDDLEWARES_ANNOTATION, tlsSecretName } from "./constants.js";
import type { CreateAppInput } from "./index.js";

/** TLS settings for an app Ingress (#29). */
export type IngressTls = {
  /** cert-manager ClusterIssuer that signs the certificate. */
  issuer: string;
  /** Namespace of the Ingress; Traefik middleware refs are namespace-prefixed. */
  namespace: string;
};

/**
 * Build an Ingress manifest for exposing an app at a domain.
 * Only callable when host is provided.
 * Add owner reference if deployment UID is provided for garbage collection.
 * With tls: cert-manager issues <name>-tls for the host, and Traefik's
 * pier-https-redirect middleware 301s plain HTTP to HTTPS. Without tls the
 * manifest is exactly the HTTP-only one.
 */
export function buildIngress(
  input: CreateAppInput,
  deploymentUid?: string,
  tls?: IngressTls,
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

  if (tls) {
    metadata.annotations = {
      [CLUSTER_ISSUER_ANNOTATION]: tls.issuer,
      [ROUTER_MIDDLEWARES_ANNOTATION]: `${tls.namespace}-${HTTPS_REDIRECT_MIDDLEWARE}@kubernetescrd`,
    };
    spec.tls = [{ hosts: [input.host], secretName: tlsSecretName(input.name) }];
  }

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
