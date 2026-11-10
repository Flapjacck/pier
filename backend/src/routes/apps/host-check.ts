/** Problems with a requested app host (POST /apps), or null when it's fine. */
export type HostProblem = { status: 400 | 409; error: string; details?: string };

const DNS_1123 = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** host is already lowercased. It must be a subdomain of the ingress domain, not the dashboard's. */
export function hostProblem(host: string | undefined, opts: { ingressDomain?: string; dashboardHost?: string }): HostProblem | null {
  if (!host) return null;
  if (opts.dashboardHost && host === opts.dashboardHost) return { status: 409, error: "host already in use" };
  const invalid = (details: string): HostProblem => ({ status: 400, error: "invalid request", details });
  if (host.includes("*")) return invalid("host cannot contain wildcards");
  if (!DNS_1123.test(host)) return invalid("host must be a valid DNS-1123 hostname (e.g., hello.192.0.2.10.nip.io)");
  if (!opts.ingressDomain) return invalid("ingress not configured");
  const suffix = `.${opts.ingressDomain}`;
  // Must end with .<domain>, not equal it.
  if (!host.endsWith(suffix) || host === opts.ingressDomain) return invalid(`host must end with ${suffix}`);
  return null;
}
