/** Label key Pier uses to tie a Deployment to a logical app name (see POST /apps in #4). */
export const APP_LABEL = "pier.app";

/** Standard managed-by label so cluster admins can see Pier-owned workloads. */
export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by";
export const MANAGED_BY_VALUE = "pier";

/** Kubernetes labelSelector for listing one app or every Pier-managed app. */
export function appSelector(name?: string): string {
  return name === undefined ? APP_LABEL : `${APP_LABEL}=${name}`;
}

/** Labels to apply when Pier creates a Deployment for an app. */
export function appLabels(name: string): Record<string, string> {
  return {
    [APP_LABEL]: name,
    [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
  };
}
