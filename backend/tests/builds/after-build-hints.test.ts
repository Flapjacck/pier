import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoreV1Api } from "@kubernetes/client-node";
import type { BuildSource } from "../../src/builds/types.js";
import { createBuildHints } from "../../src/builds/volume-hints/after-build.js";

/** Post-build hints (#83): repo signals plus the pushed image's VOLUME lines over plain HTTP. */

const source: BuildSource = { method: "railpack", repo: "https://github.com/acme/web", branch: "dev", folder: "api", dockerfile: "Dockerfile" };
const push = "registry.pier-system.svc.cluster.local:5000/web:d4";

function registry(config: object) {
  const urls: string[] = [];
  const fetcher = (async (input: string | URL) => {
    const url = String(input);
    urls.push(url);
    const body = url.includes("/manifests/") ? { config: { digest: "sha256:c" } } : { config };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fetcher, urls };
}

describe("createBuildHints (#83)", () => {
  it("merges the repo's hints with the image's VOLUME, reading the image over http", async () => {
    const { fetcher, urls } = registry({ Volumes: { "/data": {} }, Cmd: ["node", "server.js"] });
    const seen: unknown[] = [];
    const hints = createBuildHints({
      core: {} as CoreV1Api,
      namespace: "pier-system",
      log: { warn: () => {} },
      fetcher,
      probe: async (_remote, opts) => {
        seen.push(opts);
        return { defaultBranch: "main", branches: ["dev"], folders: [], dockerfiles: [], files: [], volumeHints: [{ path: "/app/data", reason: "r", source: "dependency", confidence: "medium" }] };
      },
    });
    const result = await hints({ app: "web", source, image: "localhost:30500/web:d4", pushImage: push });
    assert.deepEqual(result.map((h) => h.path), ["/data", "/app/data"]);
    assert.ok(urls.every((u) => u.startsWith("http://registry.pier-system.svc.cluster.local:5000/")));
    assert.deepEqual(seen[0], { branch: "dev", hintsFor: { folder: "api", method: "railpack", dockerfile: "Dockerfile" } });
  });

  it("a Caddy image is a static site: no hints even if the repo had some; failures drop only their half", async () => {
    const caddy = registry({ Cmd: ["caddy", "run"] });
    const probe = async () => ({ defaultBranch: "main", branches: [], folders: [], dockerfiles: [], files: [], volumeHints: [{ path: "/app/data", reason: "r", source: "files" as const, confidence: "low" as const }] });
    const base = { core: {} as CoreV1Api, namespace: "pier-system", log: { warn: () => {} } };
    assert.deepEqual(await createBuildHints({ ...base, fetcher: caddy.fetcher, probe })({ app: "web", source, image: "i", pushImage: push }), []);

    const down = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const repoOnly = await createBuildHints({ ...base, fetcher: down, probe })({ app: "web", source, image: "i", pushImage: push });
    assert.deepEqual(repoOnly.map((h) => h.path), ["/app/data"]);
  });
});
