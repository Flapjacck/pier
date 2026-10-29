/**
 * Minimal className merger — joins truthy strings, filters falsy values.
 * Keeps JSX readable without a full clsx/twMerge dependency.
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
