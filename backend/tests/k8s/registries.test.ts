import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registrySecret } from "../../src/k8s/registries.js";

describe("registrySecret", () => {
  it("creates a dockerconfigjson secret without exposing credentials in metadata", () => {
    const secret = registrySecret({ name: "ghcr", registry: "ghcr.io", username: "octo", password: "token" });
    assert.equal(secret.type, "kubernetes.io/dockerconfigjson");
    assert.equal(secret.metadata?.name, "pier-registry-ghcr");
    assert.equal(secret.metadata?.labels?.["app.kubernetes.io/managed-by"], "pier");
    assert.equal(secret.metadata?.labels?.["app.kubernetes.io/part-of"], "pier");
    assert.equal(secret.metadata?.labels?.["pier.registry"], "ghcr");
    assert.equal(secret.metadata?.annotations?.["pier.registry/host"], "ghcr.io");
    assert.equal(secret.metadata?.annotations?.["pier.registry/username"], "octo");
    assert.equal(Buffer.from(secret.data?.[".dockerconfigjson"] ?? "", "base64").toString().includes("token"), true);
  });
});
