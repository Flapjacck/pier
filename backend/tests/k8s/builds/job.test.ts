import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildJobName, buildJobSpec } from "../../../src/k8s/builds/job.js";
import { normalizeBuildSource } from "../../../src/k8s/builds/source.js";

describe("buildJobSpec", () => {
  const source = normalizeBuildSource({
    repo: "https://github.com/org/app.git",
    folder: "services/api",
    gitCredential: "ci",
  });

  it("names the Job with app and deploy id", () => {
    assert.equal(buildJobName("hello", 7), "pier-build-hello-7");
  });

  it("uses documented git:// context and context-sub-path", () => {
    const job = buildJobSpec({
      app: "hello",
      deployId: 7,
      source,
      destination: "localhost:30500/hello:d7",
      namespace: "pier-system",
      kanikoImage: "gcr.io/kaniko-project/executor:v1.23.2",
      timeoutSeconds: 900,
    });
    assert.equal(job.metadata?.name, "pier-build-hello-7");
    assert.equal(job.metadata?.namespace, "pier-system");
    assert.equal(job.spec?.backoffLimit, 0);
    assert.equal(job.spec?.activeDeadlineSeconds, 900);
    assert.equal(job.spec?.ttlSecondsAfterFinished, 3600);
    assert.equal(job.spec?.template?.spec?.initContainers, undefined);
    const container = job.spec?.template?.spec?.containers?.[0];
    assert.ok(container);
    assert.equal(container.image, "gcr.io/kaniko-project/executor:v1.23.2");
    assert.ok(container.args?.includes("--context=git://github.com/org/app.git#refs/heads/main"));
    assert.ok(container.args?.includes("--context-sub-path=services/api"));
    assert.ok(container.args?.includes("--dockerfile=Dockerfile"));
    assert.ok(container.args?.includes("--destination=localhost:30500/hello:d7"));
    assert.ok(container.args?.includes("--git=single-branch=true"));
    assert.ok(container.args?.includes("--insecure"));
    assert.equal(container.securityContext?.allowPrivilegeEscalation, false);
    assert.deepEqual(container.securityContext?.capabilities?.drop, ["ALL"]);
    assert.deepEqual(container.securityContext?.capabilities?.add, [
      "CHOWN",
      "DAC_OVERRIDE",
      "FOWNER",
      "SETGID",
      "SETUID",
    ]);
    assert.ok(!(container as { securityContext?: { privileged?: boolean } }).securityContext?.privileged);
    const env = container.env ?? [];
    assert.ok(env.some((e) => e.name === "GIT_USERNAME"));
    assert.ok(env.some((e) => e.name === "GIT_PASSWORD"));
  });

  it("omits context-sub-path and git env for a root public repo", () => {
    const bare = normalizeBuildSource({ repo: "https://github.com/org/app.git" });
    const job = buildJobSpec({
      app: "hello",
      deployId: 1,
      source: bare,
      destination: "localhost:30500/hello:d1",
      namespace: "pier-system",
      kanikoImage: "gcr.io/kaniko-project/executor:v1.23.2",
      timeoutSeconds: 100,
    });
    const args = job.spec?.template?.spec?.containers?.[0]?.args ?? [];
    assert.ok(args.includes("--context=git://github.com/org/app.git#refs/heads/main"));
    assert.ok(!args.some((a) => a.startsWith("--context-sub-path=")));
    assert.equal(job.spec?.template?.spec?.containers?.[0]?.env, undefined);
  });
});
