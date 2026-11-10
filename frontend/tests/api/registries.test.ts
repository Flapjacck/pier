import { describe, expect, it } from "vitest";
import { parseImageInspection, parseRegistry, parseRegistryList } from "../../src/api/registryGuards";

describe("registry guards", () => {
  it("parses registry metadata without credentials", () => {
    expect(parseRegistry({ name: "ghcr", server: "ghcr.io", username: "octo", createdAt: "2026-01-01" }))
      .toEqual({ name: "ghcr", server: "ghcr.io", username: "octo", createdAt: "2026-01-01" });
    expect(parseRegistryList({ registries: [] })).toEqual([]);
  });

  it("rejects malformed registry data", () => {
    expect(() => parseRegistry({ name: "ghcr", password: "secret" })).toThrow();
    expect(() => parseRegistryList({ registries: [{ name: "ghcr" }] })).toThrow();
  });

  it("parses image ports and volume hints", () => {
    expect(parseImageInspection({
      image: "example/app:latest", digest: "sha256:abc", exposedPorts: [8080], volumes: ["/data"],
    })).toEqual({ image: "example/app:latest", digest: "sha256:abc", exposedPorts: [8080], volumes: ["/data"], workingDir: undefined, defaultUser: undefined, volumeHints: [] });
    expect(() => parseImageInspection({ image: "example/app", exposedPorts: ["8080"], volumes: [] })).toThrow();
  });
});
