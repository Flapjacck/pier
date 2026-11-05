import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildJobName, buildJobSpec, GIT_CLONE_IMAGE } from "../../../src/k8s/builds/job.js";
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

  it("clones via initContainer then builds from dir://", () => {
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

    const init = job.spec?.template?.spec?.initContainers?.[0];
    assert.ok(init);
    assert.equal(init.name, "clone");
    assert.equal(init.image, GIT_CLONE_IMAGE);
    assert.ok(init.env?.some((e) => e.name === "REPO" && e.value === "https://github.com/org/app.git"));
    assert.ok(init.env?.some((e) => e.name === "BRANCH" && e.value === "main"));
    assert.ok(init.env?.some((e) => e.name === "GIT_USERNAME"));
    assert.ok(init.env?.some((e) => e.name === "GIT_PASSWORD"));
    assert.ok(init.volumeMounts?.some((m) => m.name === "workspace" && m.mountPath === "/workspace"));

    const container = job.spec?.template?.spec?.containers?.[0];
    assert.ok(container);
    assert.equal(container.image, "gcr.io/kaniko-project/executor:v1.23.2");
    assert.ok(container.args?.includes("--context=dir:///workspace/src/services/api"));
    assert.ok(container.args?.includes("--dockerfile=Dockerfile"));
    assert.ok(container.args?.includes("--destination=localhost:30500/hello:d7"));
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
    assert.ok(container.volumeMounts?.some((m) => m.name === "workspace"));
    assert.equal(container.env, undefined);
    assert.ok(job.spec?.template?.spec?.volumes?.some((v) => v.name === "workspace" && v.emptyDir));
  });

  it("omits git credential env without a credential", () => {
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
    const init = job.spec?.template?.spec?.initContainers?.[0];
    const env = init?.env ?? [];
    assert.ok(env.some((e) => e.name === "REPO"));
    assert.ok(env.some((e) => e.name === "BRANCH"));
    assert.ok(!env.some((e) => e.name === "GIT_USERNAME"));
    assert.equal(job.spec?.template?.spec?.containers?.[0]?.args?.[0], "--context=dir:///workspace/src");
  });
});
