import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { deleteAppSource, getAppSource, upsertAppSource } from "../../src/db/app-sources.js";
import { runMigrations } from "../../src/db/migrations/index.js";

describe("app_sources", () => {
  it("upserts and deletes a source row", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);
    upsertAppSource(db, {
      app: "hello",
      repo: "https://github.com/org/app.git",
      branch: "main",
      folder: ".",
      dockerfile: "Dockerfile",
      gitCredential: null,
      lastCommit: null,
      lastImage: "localhost:30500/hello:d1",
      updatedAt: 1,
    });
    const row = getAppSource(db, "hello");
    assert.ok(row);
    assert.equal(row.repo, "https://github.com/org/app.git");
    assert.equal(row.lastImage, "localhost:30500/hello:d1");
    deleteAppSource(db, "hello");
    assert.equal(getAppSource(db, "hello"), undefined);
  });
});
