/**
 * Client-side ids for list keys and toasts (#83).
 *
 * Pier is often served over plain HTTP on a .nip.io host. That is not a secure
 * context, so `crypto.randomUUID` is undefined there and calling it threw inside
 * Toast. These ids only need to be unique within the page, never unguessable.
 */
let counter = 0;

export function randomId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    // getRandomValues works outside secure contexts, unlike randomUUID.
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}`;
}
