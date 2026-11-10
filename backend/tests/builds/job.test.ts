import assert from "node:assert/strict";
import type { V1Container, V1Job } from "@kubernetes/client-node";
import { describe, it } from "node:test";
import { loadBuildConfig } from "../../src/config-builds.js";
import { BUILD_TTL_SECONDS, buildImageRefs, buildJob, buildJobName } from "../../src/builds/job.js";
import type { BuildSource } from "../../src/builds/types.js";

const config = loadBuildConfig({});
const railpack: BuildSource = { method: "railpack", repo: "https://github.com/acme/web", branch: "main", folder: ".", dockerfile: "Dockerfile" };
const dockerfile: BuildSource = { method: "dockerfile", repo: "git@github.com:acme/mono.git", branch: "release/1.2", folder: "apps/api", dockerfile: "docker/Dockerfile.prod", gitCredential: "github" };

const spec = (job: V1Job) => job.spec?.template.spec ?? assert.fail("pod spec");
const envOf = (c: V1Container | undefined) => Object.fromEntries((c?.env ?? []).map((e) => [e.name, e.value ?? e.valueFrom]));
const all = (job: V1Job) => [...(spec(job).initContainers ?? []), ...spec(job).containers];

describe("build Job spec (#83)", () => {
  it("Railpack: fetch → clone → prepare init containers, then buildctl with the Railpack frontend", () => {
    const job = buildJob({ app: "web", deploymentId: 42, source: railpack, config });
    assert.deepEqual(spec(job).initContainers?.map((c) => c.name), ["fetch", "clone", "prepare"]);
    const build = spec(job).containers[0];
    assert.equal(build?.image, config.images.buildctl);
    assert.equal(envOf(build).BUILD_METHOD, "railpack");
    assert.equal(envOf(build).RAILPACK_FRONTEND, config.railpack.frontend);
    assert.equal(envOf(build).IMAGE_REF, "registry.pier-system.svc.cluster.local:5000/web:d42");
    assert.equal(envOf(build).BUILDKIT_HOST, config.buildkitAddr);
    assert.equal(envOf(build).BUILD_FOLDER, ".");
    const fetch = envOf(spec(job).initContainers?.[0]);
    assert.equal(fetch.RAILPACK_VERSION, config.railpack.version);
    assert.equal(fetch.RAILPACK_SHA256_X86_64, config.railpack.sha256.x86_64);
  });

  it("Dockerfile: only clone, context is the folder, Dockerfile path relative to it, SSH repo cloned over https", () => {
    const job = buildJob({ app: "api", deploymentId: 7, source: dockerfile, config });
    assert.deepEqual(spec(job).initContainers?.map((c) => c.name), ["clone"]);
    const clone = envOf(spec(job).initContainers?.[0]);
    assert.equal(clone.GIT_REPO, "https://github.com/acme/mono.git");
    assert.equal(clone.GIT_BRANCH, "release/1.2");
    assert.equal(clone.BUILD_FOLDER, "apps/api");
    const build = envOf(spec(job).containers[0]);
    assert.equal(build.BUILD_METHOD, "dockerfile");
    assert.equal(build.DOCKERFILE, "docker/Dockerfile.prod");
  });

  it("git credentials come from the Secret via secretKeyRef, never a literal", () => {
    const job = buildJob({ app: "api", deploymentId: 7, source: dockerfile, config });
    const env = spec(job).initContainers?.[0]?.env ?? [];
    const password = env.find((e) => e.name === "GIT_PASSWORD");
    assert.equal(password?.value, undefined);
    assert.deepEqual(password?.valueFrom?.secretKeyRef, { name: "pier-git-github", key: "token" });
    const publicJob = buildJob({ app: "web", deploymentId: 1, source: railpack, config });
    assert.ok(!all(publicJob).some((c) => c.env?.some((e) => e.name === "GIT_PASSWORD")));
  });

  it("limits, timeout, TTL, no retries, no token, no Docker socket, non-root", () => {
    const job = buildJob({ app: "web", deploymentId: 42, source: railpack, config });
    assert.equal(job.metadata?.namespace, "pier-system");
    assert.equal(job.spec?.backoffLimit, 0);
    assert.equal(job.spec?.activeDeadlineSeconds, config.timeoutSeconds);
    assert.equal(job.spec?.ttlSecondsAfterFinished, BUILD_TTL_SECONDS);
    assert.equal(spec(job).automountServiceAccountToken, false);
    assert.equal(spec(job).restartPolicy, "Never");
    assert.equal(job.spec?.template.metadata?.labels?.app, "pier-build");
    for (const c of all(job)) {
      assert.ok(c.resources?.limits?.cpu && c.resources.limits.memory, `${c.name} has limits`);
      assert.equal(c.securityContext?.privileged, undefined);
      assert.equal(c.securityContext?.allowPrivilegeEscalation, false);
      assert.equal(c.securityContext?.runAsNonRoot, true);
      assert.deepEqual(c.securityContext?.capabilities?.drop, ["ALL"]);
    }
    const volumes = spec(job).volumes ?? [];
    assert.ok(volumes.every((v) => v.hostPath === undefined), "no hostPath (Docker socket) volumes");
    assert.ok(!JSON.stringify(job).includes("docker.sock"));
  });

  it("names are unique per deploy and valid DNS labels; pull ref uses the node registry", () => {
    assert.equal(buildJobName("web", 42), "pier-build-42-web");
    const long = buildJobName("a".repeat(63), 123456);
    assert.ok(long.length <= 63 && !long.endsWith("-"));
    assert.deepEqual(buildImageRefs({ app: "web", deploymentId: 42, config }), {
      push: "registry.pier-system.svc.cluster.local:5000/web:d42",
      pull: "localhost:30500/web:d42",
    });
  });
});
