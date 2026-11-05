import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectImage, probeRegistry } from "../../src/images/inspect.js";

type ResponseInit = { status?: number; headers?: HeadersInit };

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: init.headers });
}

describe("inspectImage", () => {
  it("probes Docker Hub at registry-1.docker.io and follows bearer auth", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://registry-1.docker.io/v2/") {
        return response({}, calls.length === 1 ? { status: 401, headers: { "www-authenticate": 'Bearer realm="https://auth.example/token",service="registry"' } } : {});
      }
      return response({ token: "token" });
    };
    await probeRegistry({ name: "docker", host: "docker.io", username: "u", password: "p" }, fetcher);
    assert.deepEqual(calls, ["https://registry-1.docker.io/v2/", "https://auth.example/token?service=registry", "https://registry-1.docker.io/v2/"]);
  });

  it("maps unauthorized and network probe failures without leaking credentials", async () => {
    await assert.rejects(
      probeRegistry({ name: "x", host: "example.test", username: "u", password: "secret" }, async () => response({}, { status: 403 })),
      /invalid credentials/,
    );
    await assert.rejects(
      probeRegistry({ name: "x", host: "example.test", username: "u", password: "secret" }, async () => { throw new Error("secret"); }),
      /registry unreachable/,
    );
  });

  it("reads ports, volumes, and command without a Docker daemon", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/manifests/latest")) {
        return response({ config: { digest: "sha256:config" } });
      }
      return response({ config: { ExposedPorts: { "8080/tcp": {} }, Volumes: { "/data": {} }, Cmd: ["node", "server.js"] } });
    };
    assert.deepEqual(await inspectImage("example.test/team/app:latest", undefined, fetcher), {
      image: "example.test/team/app:latest", digest: "sha256:config", exposedPorts: [8080], ports: [8080], volumes: ["/data"], command: ["node", "server.js"],
    });
  });

  it("follows a bearer challenge for private images", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (input) => {
      calls++;
      const url = String(input);
      if (url.endsWith("/manifests/latest") && calls === 1) {
        return response({}, { status: 401, headers: { "www-authenticate": 'Bearer realm="https://auth.example/token",service="registry",scope="repository:team/app:pull"' } });
      }
      if (url.startsWith("https://auth.example")) return response({ token: "secret-token" });
      if (url.endsWith("/manifests/latest")) return response({ config: { digest: "sha256:config" } });
      if (url.includes("/manifests/sha256:")) return response({ config: { digest: "sha256:config" } });
      return response({ config: {} });
    };
    const result = await inspectImage("example.test/team/app", { name: "private", registry: "example.test", username: "u", password: "p" }, fetcher);
    assert.deepEqual(result.ports, []);
    assert.equal(calls, 4);
  });
});
