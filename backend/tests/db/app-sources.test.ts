import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  appsUsingCredential,
  clearPendingCreate,
  deleteAppSource,
  getAppSource,
  listAppSources,
  setBuildResult,
  upsertAppSource,
} from "../../src/db/app-sources.js";
import { migration001 } from "../../src/db/migrations/001_init.js";
import { migration002 } from "../../src/db/migrations/002_deployments.js";
import { migration003 } from "../../src/db/migrations/003_app_sources.js";
import { runMigrations } from "../../src/db/migrations/index.js";

const base = { method: "railpack", repo: "https://github.com/org/app", branch: "main", folder: ".", dockerfile: "Dockerfile" } as const;

function db(): DatabaseSync {
  const d = new DatabaseSync(":memory:");
  runMigrations(d);
  return d;
}

describe("app_sources", () => {
  it("round-trips a source with pending create settings", () => {
    const d = db();
    upsertAppSource(d, { ...base, app: "hello", gitCredential: "work", pendingCreate: { port: 3000, replicas: 1, env: { A: "1" } }, updatedAt: 1 });
    const row = getAppSource(d, "hello");
    assert.equal(row?.method, "railpack");
    assert.equal(row?.gitCredential, "work");
    assert.deepEqual(row?.pendingCreate, { port: 3000, replicas: 1, env: { A: "1" } });
    assert.deepEqual(row?.volumeHints, []);
    assert.deepEqual(appsUsingCredential(d, "work"), ["hello"]);
  });

  it("records a build result and clears pending env once the app exists", () => {
    const d = db();
    upsertAppSource(d, { ...base, app: "hello", pendingCreate: { port: 3000, replicas: 1, env: { SECRET: "x" } }, updatedAt: 1 });
    const hint = { path: "/data", reason: "VOLUME in image", source: "image", confidence: "high" } as const;
    setBuildResult(d, "hello", { commit: "abc", image: "localhost:30500/hello:d1", volumeHints: [hint], now: 2 });
    clearPendingCreate(d, "hello", 3);
    const row = getAppSource(d, "hello");
    assert.equal(row?.lastImage, "localhost:30500/hello:d1");
    assert.equal(row?.lastCommit, "abc");
    assert.deepEqual(row?.volumeHints, [hint]);
    assert.equal(row?.pendingCreate, null);
    assert.ok(deleteAppSource(d, "hello"));
    assert.equal(getAppSource(d, "hello"), undefined);
    assert.deepEqual(listAppSources(d), []);
  });

  it("upgrades a database that ran the first #83 migration: old rows build from a Dockerfile", () => {
    const d = new DatabaseSync(":memory:");
    runMigrations(d, [migration001, migration002, migration003]);
    d.prepare(
      "INSERT INTO app_sources (app, repo, branch, folder, dockerfile, last_image, updated_at) VALUES ('old', 'https://github.com/org/app', 'main', 'api', 'Dockerfile', 'localhost:30500/old:d13', 1)",
    ).run();
    assert.deepEqual(runMigrations(d), [4]);
    const row = getAppSource(d, "old");
    assert.equal(row?.method, "dockerfile");
    assert.equal(row?.folder, "api");
    assert.equal(row?.lastImage, "localhost:30500/old:d13");
    assert.equal(row?.pendingCreate, null);
  });

  it("rejects an unknown build method at the database", () => {
    const d = db();
    assert.throws(() => upsertAppSource(d, { ...base, method: "kaniko" as "railpack", app: "x", updatedAt: 1 }));
  });
});
