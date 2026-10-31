import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Derives an HMAC key from the API token.
 * Used to sign and verify session cookies.
 */
function deriveKey(apiToken: string): Buffer {
  return createHmac("sha256", "pier-session-v1").update(apiToken).digest();
}

/**
 * Creates a signed session cookie value.
 *
 * Format: v1.<expMs>.<base64url HMAC-SHA256(key, "v1.<expMs>")>
 *
 * The session expires in 7 days. The signature includes the expiration time
 * so that changing the expiry doesn't break signature verification.
 *
 * @param apiToken - The configured API token
 * @param now - Current timestamp in milliseconds (for testing)
 * @returns The signed cookie value
 */
export function createSession(apiToken: string, now: number): string {
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const expMs = now + maxAgeMs;

  const key = deriveKey(apiToken);
  const message = `v1.${expMs}`;
  const signature = createHmac("sha256", key).update(message).digest();
  const signatureB64 = signature.toString("base64url");

  return `v1.${expMs}.${signatureB64}`;
}

/**
 * Verifies a session cookie value and checks expiration.
 *
 * Format validation: must be v1.<expMs>.<base64url signature>
 * Signature is checked with timingSafeEqual to prevent timing attacks.
 * If the token is rotated (apiToken changes), all sessions are invalidated
 * because they can't be verified with the new key.
 *
 * @param apiToken - The configured API token
 * @param value - The cookie value to verify
 * @param now - Current timestamp in milliseconds (for testing)
 * @returns true if the session is valid and not expired
 */
export function verifySession(
  apiToken: string,
  value: string,
  now: number,
): boolean {
  // Parse the session format: v1.<expMs>.<signature>
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return false;
  }

  const expMs = Number(parts[1]);
  const providedSignatureB64 = parts[2];

  // Check expiration
  if (isNaN(expMs) || now > expMs) {
    return false;
  }

  // Verify signature with timing-safe comparison
  const key = deriveKey(apiToken);
  const message = `v1.${expMs}`;
  const expectedSignature = createHmac("sha256", key).update(message).digest();

  // Decode the provided signature from base64url
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(providedSignatureB64, "base64url");
  } catch {
    return false;
  }

  // Both buffers should be the same length (SHA-256 = 32 bytes),
  // but check anyway to be defensive before timingSafeEqual.
  if (providedSignature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return timingSafeEqual(providedSignature, expectedSignature);
  } catch {
    // timingSafeEqual can throw on length mismatch (already checked above, but be defensive).
    return false;
  }
}
