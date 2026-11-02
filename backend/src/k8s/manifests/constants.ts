/** Resource request for CPU. */
export const CPU_REQUEST = "50m";

/** Resource limit for CPU. */
export const CPU_LIMIT = "500m";

/** Resource request for memory. */
export const MEMORY_REQUEST = "64Mi";

/** Resource limit for memory. */
export const MEMORY_LIMIT = "256Mi";

/** Resource request for ephemeral storage. */
export const EPHEMERAL_STORAGE_REQUEST = "64Mi";

/** Resource limit for ephemeral storage. */
export const EPHEMERAL_STORAGE_LIMIT = "1Gi";

/** Rollout deadline: 120 seconds to cap time-to-failure for immediately-exiting apps. */
export const PROGRESS_DEADLINE_SECONDS = 120;

/** cert-manager ingress-shim annotation: which ClusterIssuer signs the Ingress's certificate. */
export const CLUSTER_ISSUER_ANNOTATION = "cert-manager.io/cluster-issuer";

/** Traefik annotation listing middlewares (<namespace>-<name>@kubernetescrd) for an Ingress. */
export const ROUTER_MIDDLEWARES_ANNOTATION = "traefik.ingress.kubernetes.io/router.middlewares";

/** Traefik Middleware (k8s/tls.yaml) that 301s plain HTTP to HTTPS. */
export const HTTPS_REDIRECT_MIDDLEWARE = "pier-https-redirect";

/** Name of the TLS Secret cert-manager writes for an app's Ingress. */
export function tlsSecretName(appName: string): string {
  return `${appName}-tls`;
}
