import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combineHints, imageVolumeHints, repoVolumeHints, type RepoView } from "../../src/builds/volume-hints/index.js";
import { composeHints, dockerfileInfo, flyHints, looksStatic } from "../../src/builds/volume-hints/manifests.js";
import { containerPath, mergeHints } from "../../src/builds/volume-hints/merge.js";

/** Suggested volumes from repo and image signals (#83 items 21–23). */

function view(files: Record<string, string>, extra: Partial<RepoView> = {}): RepoView {
  return { files: Object.keys(files), folder: ".", method: "railpack", read: async (p) => files[p], ...extra };
}
const paths = (hints: { path: string }[]) => hints.map((h) => h.path);

describe("volume hint detectors", () => {
  it("compose short and long syntax, fly mounts and Dockerfile VOLUME are high confidence", () => {
    const compose = "services:\n  web:\n    image: x\n    volumes:\n      - ./data:/app/data\n      - type: volume\n        target: /var/lib/app\n    ports:\n      - 3000:3000\n";
    assert.deepEqual(paths(composeHints(compose, "compose.yml")), ["/app/data", "/var/lib/app"]);
    assert.deepEqual(paths(flyHints('app = "x"\n[[mounts]]\n  source = "d"\n  destination = "/data"\n[http_service]\n  internal_port = 8080\n')), ["/data"]);
    const df = dockerfileInfo('FROM node\nWORKDIR /srv\nVOLUME ["/srv/uploads", "/cache"]\nVOLUME /logs\n');
    assert.equal(df.workdir, "/srv");
    assert.deepEqual(paths(df.volumes), ["/srv/uploads", "/cache", "/logs"]);
    assert.ok(df.volumes.every((h) => h.confidence === "high"));
  });

  it("rejects unsafe or system mount paths", () => {
    assert.equal(containerPath("relative/x"), undefined);
    assert.equal(containerPath("/app/../etc"), undefined);
    assert.equal(containerPath("/etc/nginx"), undefined);
    assert.equal(containerPath("/tmp"), undefined);
    assert.equal(containerPath("/data/"), "/data");
  });

  it("SQLite-like dependencies and committed db files suggest a path under the workdir", async () => {
    const hints = await repoVolumeHints(view({ "package.json": '{"dependencies":{"better-sqlite3":"^11","express":"^4"}}', "data/app.db": "", "src/index.js": "" }));
    assert.deepEqual(paths(hints), ["/app/data"]);
    assert.equal(hints[0]?.confidence, "medium");
    assert.match(hints[0]?.reason ?? "", /better-sqlite3/);
    assert.match(hints[0]?.reason ?? "", /data\/app\.db/, "reasons from both signals are kept");

    const rails = await repoVolumeHints(view({ Gemfile: 'gem "rails"\ngem "sqlite3"\n', "config/routes.rb": "" }));
    assert.deepEqual(paths(rails), ["/app/storage"]);
  });

  it("only looks inside the build folder and uses the Dockerfile's WORKDIR", async () => {
    const files = { "api/Dockerfile": "FROM go\nWORKDIR /srv\n", "api/go.mod": "require github.com/mattn/go-sqlite3 v1\n", "web/data/x.db": "" };
    const hints = await repoVolumeHints(view(files, { folder: "api", method: "dockerfile", dockerfile: "Dockerfile" }));
    assert.deepEqual(paths(hints), ["/srv/data"]);
  });

  it("static sites get no hints from the repo or the image", async () => {
    const vite = { "package.json": '{"scripts":{"build":"vite build"},"devDependencies":{"vite":"^5"}}', "data/seed.db": "", "index.html": "" };
    assert.equal(looksStatic(new Set(Object.keys(vite)), vite["package.json"]), true);
    assert.deepEqual(await repoVolumeHints(view(vite)), []);
    assert.deepEqual(await repoVolumeHints(view({ "index.html": "", "uploads/a.png": "" })), []);
    const caddy = imageVolumeHints({ volumes: ["/data"], command: ["/bin/sh", "-c", "caddy run --config /Caddyfile"] });
    assert.equal(caddy.static, true);
    assert.deepEqual(combineHints([{ path: "/app/data", reason: "r", source: "files", confidence: "low" }], caddy), []);
  });

  it("image VOLUME merges with repo hints, most confident first, one row per path", () => {
    const image = imageVolumeHints({ volumes: ["/app/data", "/var/lib/redis"], command: ["node", "server.js"] });
    const merged = combineHints([{ path: "/app/data", reason: "repo says so.", source: "files", confidence: "low" }], image);
    assert.deepEqual(paths(merged), ["/app/data", "/var/lib/redis"]);
    assert.equal(merged[0]?.source, "image");
    assert.match(merged[0]?.reason ?? "", /repo says so/);
    assert.equal(mergeHints(Array.from({ length: 20 }, (_, i) => ({ path: `/d${i}`, reason: "r", source: "files" as const, confidence: "low" as const }))).length, 10);
  });
});
