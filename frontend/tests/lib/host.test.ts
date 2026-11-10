import { describe, expect, it } from "vitest";
import { resolveHost, subdomainInput } from "../../src/lib/host";

const domain = "192.0.2.10.nip.io";

describe("subdomainInput", () => {
  it("keeps a plain subdomain", () => expect(subdomainInput("demo", domain)).toBe("demo"));
  it("strips our suffix, scheme and path", () => expect(subdomainInput("https://demo.192.0.2.10.nip.io/x", domain)).toBe("demo"));
  it("leaves a foreign host for validation to reject", () => expect(subdomainInput("myapp.wrong.com", domain)).toBe("myapp.wrong.com"));
});

describe("resolveHost", () => {
  it("appends the domain to a subdomain", () => expect(resolveHost("demo", domain)).toEqual({ ok: true, host: `demo.${domain}` }));
  it("accepts a full host under the domain without doubling it", () => expect(resolveHost(`demo.${domain}`, domain)).toEqual({ ok: true, host: `demo.${domain}` }));
  it("rejects a host under another domain instead of appending", () => expect(resolveHost("myapp.wrong.com", domain).ok).toBe(false));
  it("rejects the bare domain, wildcards and bad labels", () => {
    expect(resolveHost(domain, domain).ok).toBe(false);
    expect(resolveHost("*", domain).ok).toBe(false);
    expect(resolveHost("-bad", domain).ok).toBe(false);
    expect(resolveHost("", domain).ok).toBe(false);
  });
});
