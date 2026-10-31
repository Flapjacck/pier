/** DNS-1035 subdomain regex for Kubernetes resource names and Pier app names.
 * Allows lowercase letters, digits, and hyphens; must start/end with a letter or digit.
 * Max 63 characters (per DNS-1035), though apps allow up to 63 per Pier convention.
 * Copied inline in six route files today (#36 will consolidate onto this constant).
 */
export const APP_NAME_PATTERN = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Check if a name is valid for a Pier app.
 * Returns true if the name matches DNS-1035 subdomain rules: lowercase, letters/digits/hyphens,
 * starts and ends with alphanumeric, max 63 chars. Used for validating app names in requests.
 * #36 will move the other routes onto this check.
 */
export function isValidAppName(name: string): boolean {
  return APP_NAME_PATTERN.test(name);
}
