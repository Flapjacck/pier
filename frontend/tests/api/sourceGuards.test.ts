import { describe, expect, it } from "vitest";
import { parseApp } from "../../src/api/guards";
import { parseGitCredentialList, parseGitProbe, parseRedeploy, parseVolumeHints } from "../../src/api/sourceGuards";

const hint = { path: "/data", reason: "VOLUME /data in the image", source: "image", confidence: "high" };
const source = { method: "railpack", repo: "https://github.com/example/app", branch: "main", folder: ".", dockerfile: "Dockerfile", lastCommit: null, lastImage: null, volumeHints: [hint] };

describe("source guards (#83)", () => {
  it("parses an app's git source alongside the image", () => {
    const app = parseApp({ name: "demo", image: "", replicas: 1, ready: 0, status: "building", createdAt: "2026-11-10", source });
    expect(app.source?.repo).toBe("https://github.com/example/app");
    expect(app.source?.volumeHints).toEqual([hint]);
  });

  it("rejects a source with an unknown build method", () => {
    expect(() => parseApp({ name: "demo", image: "", replicas: 1, ready: 0, status: "building", createdAt: "x", source: { ...source, method: "kaniko" } })).toThrow();
  });

  it("treats missing hints as none but malformed hints as an error", () => {
    expect(parseVolumeHints(undefined)).toEqual([]);
    expect(() => parseVolumeHints([{ ...hint, confidence: "certain" }])).toThrow();
  });

  it("parses probe, credential list (no token) and redeploy responses", () => {
    expect(parseGitProbe({ defaultBranch: "main", branches: ["main"], folders: ["."], dockerfiles: [], volumeHints: [] }).branches).toEqual(["main"]);
    expect(parseGitCredentialList({ ok: true, credentials: [{ name: "gh", username: "octo", createdAt: "x", token: "leak" }] }))
      .toEqual([{ name: "gh", username: "octo", createdAt: "x" }]);
    expect(parseRedeploy({ ok: true, deploymentId: 7 })).toEqual({ deploymentId: 7 });
    expect(() => parseGitProbe({ branches: [] })).toThrow();
  });
});
