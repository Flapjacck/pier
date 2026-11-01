/** DNS-1035 subdomain regex for Kubernetes resource names and Pier app names. */
export const APP_NAME_PATTERN = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** JSON Schema `pattern` for app names (same rules as {@link APP_NAME_PATTERN}). */
export const APP_NAME_SCHEMA_PATTERN = "^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$";

/** DNS-1123 subdomain regex for Kubernetes Pod names. */
export const POD_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** JSON Schema `pattern` for pod names (same rules as {@link POD_NAME_PATTERN}). */
export const POD_NAME_SCHEMA_PATTERN = "^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$";

/** Check if a name is valid for a Pier app. */
export function isValidAppName(name: string): boolean {
  return APP_NAME_PATTERN.test(name);
}

/** Check if a name is valid for a Kubernetes Pod. */
export function isValidPodName(name: string): boolean {
  return POD_NAME_PATTERN.test(name);
}
