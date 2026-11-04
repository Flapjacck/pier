import { isIP } from "node:net";

/**
 * Which peers may set X-Forwarded-For / -Proto (PIER_TRUST_PROXY).
 * - false: ignore forwarded headers; req.ip is the socket peer.
 * - true: trust every hop. Any client can then spoof X-Forwarded-For; only for a
 *   proxy that is the sole way in and rewrites the header.
 * - string[]: trust only peers in these IPs/CIDRs (e.g. the pod CIDR Traefik runs in).
 *   req.ip is the rightmost X-Forwarded-For entry not in the list.
 */
export type TrustProxy = boolean | string[];

const CIDR = /^(.+)\/(\d{1,3})$/;

function isAddressOrCidr(value: string): boolean {
  const match = CIDR.exec(value);
  if (!match) return isIP(value) !== 0;
  const [, addr = "", bits = ""] = match;
  const family = isIP(addr);
  const prefix = Number(bits);
  return family !== 0 && prefix <= (family === 4 ? 32 : 128);
}

/**
 * Parse PIER_TRUST_PROXY. Hop counts are rejected: Fastify 5 treats a numeric
 * trustProxy as "trust nothing" (it cannot validate the immediate peer), and the
 * string "1" is read as an IP address, so neither ever honoured X-Forwarded-For.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (trimmed === "" || trimmed === "false" || trimmed === "0") return false;
  if (trimmed === "true" || trimmed === "1") return true;
  const entries = trimmed.split(",").map((s) => s.trim()).filter((s) => s !== "");
  const bad = entries.filter((e) => !isAddressOrCidr(e));
  if (entries.length === 0 || bad.length > 0) {
    throw new Error(
      `Invalid PIER_TRUST_PROXY "${raw ?? ""}": use false, true, or a comma-separated list of IPs/CIDRs (e.g. 10.42.0.0/16)`,
    );
  }
  return entries;
}
