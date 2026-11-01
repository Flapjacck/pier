/** Accept only same-app relative paths to block open redirects. */
export function safeNext(raw: string | null | undefined, fallback = "/apps"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  return raw;
}
