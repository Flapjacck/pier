import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { insertDeployment } from "../../src/db/deployments.js";
import { getDeployment } from "../../src/db/deployments-read.js";
import { runMigrations } from "../../src/db/migrations/index.js";
import { stepsForDeploy } from "../../src/deploys/types.js";

describe("stepsForDeploy", () => {
  it("inserts build between validate and apply when requested", () => {
    assert.deepEqual(stepsForDeploy(), [
      "validate", "apply", "schedule", "pull", "start", "health", "ready",
    ]);
    assert.deepEqual(stepsForDeploy({ build: true }), [
      "validate", "build", "apply", "schedule", "pull", "start", "health", "ready",
    ]);
  });

  it("persists the build step on insertDeployment", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db);
    const id = insertDeployment(db, {
      app: "hello",
      trigger: "create",
      spec: { source: { repo: "https://github.com/o/a.git", branch: "main", folder: ".", dockerfile: "Dockerfile" } },
      now: 1,
      build: true,
    });
    const detail = getDeployment(db, id);
    assert.ok(detail);
    assert.deepEqual(detail.steps.map((s) => s.name), stepsForDeploy({ build: true }));
    assert.equal(detail.steps[0]?.status, "running"); // validate
  });
});
