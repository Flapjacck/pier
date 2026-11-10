/**
 * Public host rules for the deploy wizard (#83).
 *
 * The field is subdomain-only with a fixed `.<PIER_INGRESS_DOMAIN>` suffix. People paste
 * whole URLs, so the suffix is stripped on input (no `app.nip.io.nip.io`), and a host
 * under some other domain is rejected rather than silently re-suffixed.
 */

const LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** What the input box should hold after a keystroke or paste: scheme, path and our suffix removed. */
export function subdomainInput(raw: string, ingressDomain: string | null): string {
  let value = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "");
  if (ingressDomain && value.endsWith(`.${ingressDomain}`)) value = value.slice(0, -(ingressDomain.length + 1));
  return value;
}

export type HostResult = { ok: true; host: string } | { ok: false; error: string };

/** Turn the field's value into the full host sent to the API. */
export function resolveHost(input: string, ingressDomain: string): HostResult {
  const value = input.trim().toLowerCase();
  if (!value) return { ok: false, error: "Host is required when Public URL is enabled" };
  if (value.includes("*")) return { ok: false, error: "Host cannot contain wildcards" };
  if (value === ingressDomain) return { ok: false, error: "Host cannot be the domain itself" };
  const sub = value.endsWith(`.${ingressDomain}`) ? value.slice(0, -(ingressDomain.length + 1)) : value;
  // Anything still dotted belongs to another domain: refuse instead of appending ours to it.
  if (value === sub && sub.includes(".")) return { ok: false, error: `Host must be a subdomain of ${ingressDomain}` };
  const labels = sub.split(".");
  if (!labels.every((label) => LABEL.test(label))) {
    return { ok: false, error: "Use lowercase letters, numbers and hyphens (each part ≤63 characters)" };
  }
  const host = `${sub}.${ingressDomain}`;
  if (host.length > 253) return { ok: false, error: "Host must be ≤253 characters" };
  return { ok: true, host };
}
